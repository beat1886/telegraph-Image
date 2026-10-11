// 统一开放上传 API
// 鉴权：Authorization: Bearer <api_token>（或 ?token=）
// 入参：multipart/form-data，字段 file（可多个）；可选 channel=tg|tgchannel|r2（默认 tgchannel）
// 出参：{ code:200, success:true, data:[{url,name}], url }  （单文件时顶层 url 为首个链接）
// 权限：admin token 可用全部通道；user token 仅 tg/tgchannel。

export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { authenticateToken, touchToken } from '@/lib/apiToken';
import { getContentType } from '@/lib/mime';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const CHANNELS = ['tg', 'tgchannel', 'r2'];

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// 按 MIME 推断媒体大类；MIME 缺失/ octet-stream 时按扩展名兜底
function mediaKind(file) {
  const t = file.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const mime = getContentType(file.name || '');
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function sanitizeFileName(name) {
  const base = (name || 'file').split(/[\\/]/).pop();
  return base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 120) || 'file';
}

export async function POST(request) {
  const { env, ctx } = getRequestContext();

  const auth = await authenticateToken(env, request);
  if (!auth.ok) return json({ code: auth.status, success: false, message: auth.message }, auth.status);
  const token = auth.token;
  // 更新最后使用时间，不阻塞主流程
  try { ctx.waitUntil(touchToken(env, token.id)); } catch { /* 旧版上下文无 waitUntil 时忽略 */ }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ code: 400, success: false, message: '请求必须是 multipart/form-data 格式' }, 400);
  }

  const files = formData.getAll('file').filter((f) => f instanceof Blob && f.size > 0);
  if (files.length === 0) {
    return json({ code: 400, success: false, message: '缺少上传文件（字段名 file）' }, 400);
  }

  let channel = (formData.get('channel') || 'tgchannel').toString().trim();
  if (!CHANNELS.includes(channel)) {
    return json({ code: 400, success: false, message: `不支持的通道：${channel}（可选 tg / tgchannel / r2）` }, 400);
  }
  if (channel === 'r2' && token.role !== 'admin') {
    return json({ code: 403, success: false, message: 'R2 通道仅管理员 Token 可用' }, 403);
  }

  const origin = new URL(request.url).origin;
  // 上传记录归属：user token 绑定其访客 uid（通过内部请求的 cookie 传递）；admin token 留空
  const internalHeaders = new Headers();
  if (token.uid) internalHeaders.set('cookie', `ml_uid=${token.uid}`);

  const results = [];
  const failures = [];

  for (const file of files) {
    try {
      if (channel === 'r2') {
        results.push(await uploadR2(env, origin, file, token.uid));
      } else {
        results.push(await uploadViaInternal(origin, channel, file, internalHeaders));
      }
    } catch (err) {
      failures.push({ name: file.name || 'file', message: err.message || String(err) });
    }
  }

  if (failures.length > 0) {
    return json({
      code: 500,
      success: false,
      message: failures.map((f) => `${f.name}: ${f.message}`).join('; '),
      data: results,
      url: results[0]?.url || null,
    }, 500);
  }

  return json({
    code: 200,
    success: true,
    channel,
    data: results,
    url: results[0]?.url || null, // 单文件场景的便捷字段
  });
}

// TG.ph / TG_Channel：调用站内现有路由（含写库、鉴黄等既有逻辑）。
// 只携带归属 cookie，绝不转发 Authorization，避免 Token 泄露给上游。
async function uploadViaInternal(origin, channel, file, internalHeaders) {
  const fd = new FormData();
  fd.append('file', file, file.name || 'file');
  const res = await fetch(`${origin}/api/${channel}`, {
    method: 'POST',
    headers: internalHeaders,
    body: fd,
    signal: AbortSignal.timeout(60000),
  });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应 */ }
  if (!res.ok || !body?.url) {
    throw new Error(body?.message || `上游返回 ${res.status}`);
  }
  return { url: body.url, name: body.name || file.name };
}

// R2：服务端直传并写库（仅 admin token 可达）
async function uploadR2(env, origin, file, uid) {
  if (!env.IMGRS) throw new Error('IMGRS is not Set');

  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const key = `${rand}-${sanitizeFileName(file.name)}`;
  const contentType = file.type || getContentType(file.name || '');

  const httpMetadata = new Headers();
  httpMetadata.set('content-type', contentType);
  httpMetadata.set('content-length', `${file.size}`);

  const object = await env.IMGRS.put(key, file, { httpMetadata });
  if (object === null) throw new Error('R2 写入失败');

  const url = `${origin}/api/rfile/${key}`;
  if (env.IMG) {
    const now = new Date();
    const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const kind = mediaKind(file);
    // uid/kind 列不存在时逐级回退
    try {
      await env.IMG.prepare('INSERT INTO imginfo (url, referer, ip, rating, total, time, kind, uid) VALUES (?1,?2,?3,-1,1,?4,?5,?6)')
        .bind(`/rfile/${key}`, 'api-upload', 'API', time, kind, uid || '').run();
    } catch {
      try {
        await env.IMG.prepare('INSERT INTO imginfo (url, referer, ip, rating, total, time) VALUES (?1,?2,?3,-1,1,?4)')
          .bind(`/rfile/${key}`, 'api-upload', 'API', time).run();
      } catch { /* 写库失败不影响已上传的文件 */ }
    }
  }
  return { url, name: key };
}
