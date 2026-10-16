// 链接转存：服务端抓取外部 URL 文件并转存到站内通道
// 入参 JSON：{ urls: string[], channel? }
//   单个链接也使用 urls（传只含一个元素的数组）
// 返回：{ success, count, results:[{url,name}], failures:[{src,message}] }
// 权限：公开（与网页上传一致），记录归属 ml_uid 访客
export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getContentType } from '@/lib/mime';
import { getUidFromRequest } from '@/lib/uid';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36';
const CHANNELS = ['tgchannel', 'tg'];
const MAX_BYTES = 50 * 1024 * 1024; // TG Bot API 上传上限 50MB
const MAX_URLS = 20;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Content-Type': 'application/json' } });
}

// 按 MIME 反查扩展名（仅常见媒体类型）
function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'image/avif': 'avif', 'image/bmp': 'bmp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/flac': 'flac',
    'audio/mp4': 'm4a', 'audio/aac': 'aac',
  };
  return map[(mime || '').split(';')[0].trim()] || '';
}

// 文件名取 URL 路径最后一段；无扩展名时按 Content-Type 补
function fileNameFromUrl(u, mime) {
  let base = '';
  try {
    base = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || '');
  } catch { /* URL 已在校验时确保合法 */ }
  base = base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 100);
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const ext = extFromMime(mime);
  return `${base || `transfer-${Date.now().toString(36)}`}${ext ? `.${ext}` : ''}`;
}

// 抓取单个源链接并经站内通道上传，成功返回 { url, name }
async function transferOne(src, channel, origin, uid) {
  let upstream, buf;
  try {
    upstream = await fetch(src, {
      headers: { 'User-Agent': UA, 'Referer': new URL(src).origin + '/' },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });
    if (!upstream.ok) throw new Error(`源站返回 ${upstream.status}`);
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('文件超过 50MB 转存上限');
    buf = await upstream.arrayBuffer();
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? '抓取超时（30 秒）' : e.message.startsWith('源站') || e.message.startsWith('抓取') ? e.message : `抓取失败：${e.message}`);
  }
  if (buf.byteLength === 0) throw new Error('源文件内容为空');
  if (buf.byteLength > MAX_BYTES) throw new Error('文件超过 50MB 转存上限');

  const mime = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  const name = fileNameFromUrl(src, mime);
  let type = mime || 'application/octet-stream';
  if (type === 'application/octet-stream') {
    const byExt = getContentType(name);
    if (byExt !== 'application/octet-stream') type = byExt;
  }
  const file = new File([buf], name, { type });

  const internalHeaders = new Headers();
  if (uid) internalHeaders.set('cookie', `ml_uid=${uid}`);
  const fd = new FormData();
  fd.append('file', file, name);
  const res = await fetch(`${origin}/api/${channel}`, {
    method: 'POST',
    headers: internalHeaders,
    body: fd,
    signal: AbortSignal.timeout(60000),
  });
  let out = null;
  try { out = await res.json(); } catch { /* 非 JSON 响应 */ }
  if (!res.ok || !out?.url) throw new Error(out?.message || `转存通道返回 ${res.status}`);
  return { url: out.url, name: out.name || name };
}

export async function POST(request) {
  const origin = new URL(request.url).origin;
  const uid = getUidFromRequest(request);

  let body;
  try { body = await request.json(); } catch {
    return json({ success: false, message: '请求必须是 JSON' }, 400);
  }

  // 统一使用 urls：接受数组（一或多个元素），也容忍单个字符串
  // 旧版单字段 url 仅作向后兼容，文档不再提供
  let urls = [];
  if (Array.isArray(body.urls)) {
    urls = body.urls.map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean);
  } else if (typeof body.urls === 'string' && body.urls.trim()) {
    urls = [body.urls.trim()];
  } else if (typeof body.url === 'string' && body.url.trim()) {
    urls = [body.url.trim()];
  }
  if (urls.length === 0) {
    return json({ success: false, message: '请提供 urls（文件直链数组，单个链接也传数组）' }, 400);
  }
  if (urls.length > MAX_URLS) {
    return json({ success: false, message: `单次最多转存 ${MAX_URLS} 个链接` }, 400);
  }
  for (const u of urls) {
    if (!/^https?:\/\//i.test(u)) {
      return json({ success: false, message: `非法链接：${u.slice(0, 200)}` }, 400);
    }
  }
  let channel = (body.channel || 'tgchannel').toString();
  if (!CHANNELS.includes(channel)) channel = 'tgchannel';

  const results = [];
  const failures = [];
  for (const src of urls) {
    try {
      results.push(await transferOne(src, channel, origin, uid));
    } catch (e) {
      failures.push({ src, message: e.message || String(e) });
    }
  }

  // 统一汇总返回（业务失败也返回 200，避免 Cloudflare 用错误页吞掉 JSON）
  const allFailed = failures.length === urls.length;
  return json({
    success: failures.length === 0,
    count: results.length,
    results,
    failures,
    // 单个链接时附便捷字段，兼容旧版客户端
    ...(urls.length === 1 && results.length === 1
      ? { url: results[0].url, name: results[0].name }
      : {}),
    ...(allFailed ? { message: failures.map((f) => f.message).join('；') || '转存失败' } : {}),
  });
}
