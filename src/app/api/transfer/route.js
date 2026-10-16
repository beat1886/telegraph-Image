// 链接转存：服务端抓取外部 URL 文件并转存到站内通道
// 入参 JSON：{ url, channel? }（channel: tgchannel 默认 | tg）
// 权限：公开（与网页上传一致），记录归属 ml_uid 访客
// 说明：服务端抓取不受浏览器 CORS 限制，主页"链接转存"依赖本接口
export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getContentType } from '@/lib/mime';
import { getUidFromRequest } from '@/lib/uid';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36';
const CHANNELS = ['tgchannel', 'tg'];
const MAX_BYTES = 50 * 1024 * 1024; // TG Bot API 上传上限 50MB

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

export async function POST(request) {
  const { env, ctx } = getRequestContext();
  void env; void ctx;

  let body;
  try { body = await request.json(); } catch {
    return json({ success: false, message: '请求必须是 JSON' }, 400);
  }
  const src = (body.url || '').toString().trim();
  if (!/^https?:\/\//i.test(src)) {
    return json({ success: false, message: '请提供 http(s) 文件直链' }, 400);
  }
  let channel = (body.channel || 'tgchannel').toString();
  if (!CHANNELS.includes(channel)) channel = 'tgchannel';

  // 服务端抓取源文件（无 CORS 限制），30 秒超时
  let upstream, buf;
  try {
    upstream = await fetch(src, {
      headers: { 'User-Agent': UA, 'Referer': new URL(src).origin + '/' },
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    });
    if (!upstream.ok) {
      return json({ success: false, message: `源站返回 ${upstream.status}` }, 502);
    }
    const len = Number(upstream.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return json({ success: false, message: '文件超过 50MB 转存上限' }, 413);
    buf = await upstream.arrayBuffer();
  } catch (e) {
    return json({ success: false, message: e.name === 'AbortError' ? '抓取超时（30 秒）' : `抓取失败：${e.message}` }, 502);
  }
  if (buf.byteLength === 0) return json({ success: false, message: '源文件内容为空' }, 502);
  if (buf.byteLength > MAX_BYTES) return json({ success: false, message: '文件超过 50MB 转存上限' }, 413);

  const mime = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  const name = fileNameFromUrl(src, mime);
  // MIME 缺失/octet-stream 时按扩展名补正（与开放上传 API 相同逻辑）
  let type = mime || 'application/octet-stream';
  if (type === 'application/octet-stream') {
    const byExt = getContentType(name);
    if (byExt !== 'application/octet-stream') type = byExt;
  }
  const file = new File([buf], name, { type });

  // 内部转发：只携带归属 cookie，走站内既有上传路由（写库、鉴黄等复用）
  const origin = new URL(request.url).origin;
  const internalHeaders = new Headers();
  const uid = getUidFromRequest(request);
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
  if (!res.ok || !out?.url) {
    return json({ success: false, message: out?.message || `转存通道返回 ${res.status}` }, 502);
  }
  return json({ success: true, url: out.url, name: out.name || name });
}
