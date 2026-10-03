// 媒体代理统一响应层（视频/音频在线播放、Range 拖动）
//
// Cloudflare 边缘缓存机制（实测）：
// - 当响应可被边缘缓存时，访客的 Range 头在未命中缓存时会被边缘剥离（源站收到完整请求）；
// - 边缘对 chunked/截断对象的切片不可靠（可能返回空 206 或错误 total）；
// - telegra.ph 对 Cloudflare 回源的 Range 请求直接返回假 404。
// 因此本方案：对外响应使用 private（边缘不缓存、浏览器照常缓存），Range 头即可到达函数；
// 完整对象由函数写入 caches.default 的版本化内层缓存，分片一律由本模块在边缘确定性切分；
// 文件名无扩展名（Telegram file_31）时按文件头魔数嗅探真实类型，保证内联播放。
import { resolveContentType, buildContentDisposition } from './mime';

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m) return null;
  let start, end;
  if (m[1] === '') {
    // bytes=-N：最后 N 字节
    start = Math.max(0, size - parseInt(m[2] || '0', 10));
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] !== '' ? parseInt(m[2], 10) : size - 1;
  }
  if (Number.isNaN(start) || start >= size || end < start) return { invalid: true };
  return { start, end: Math.min(end, size - 1) };
}

function makeBaseHeaders(media, cors) {
  const h = new Headers();
  h.set('Content-Type', media.mime);
  h.set('Content-Disposition', buildContentDisposition(media.fileName, media.mime));
  h.set('Accept-Ranges', 'bytes');
  if (cors) h.set('Access-Control-Allow-Origin', '*');
  return h;
}

// 用完整缓冲对象按 Range 构造响应（206 / 416），无 Range 时构造完整 200
function buildBuffered(buf, rangeHeader, media, cors, maxAge) {
  const total = buf.byteLength;
  const h = makeBaseHeaders(media, cors);
  if (rangeHeader) {
    const range = parseRange(rangeHeader, total);
    if (!range) {
      // 无法解析的 Range：按完整响应处理
    } else if (range.invalid) {
      h.set('Content-Range', `bytes */${total}`);
      return new Response(null, { status: 416, headers: h });
    } else {
      h.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
      h.set('Content-Length', String(range.end - range.start + 1));
      h.set('Cache-Control', 'no-cache');
      return new Response(buf.slice(range.start, range.end + 1), { status: 206, headers: h });
    }
  }
  h.set('Content-Length', String(total));
  h.set('Cache-Control', `private, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
  return new Response(buf.slice(0), { status: 200, headers: h });
}

// 内层缓存命中后按访客 Range 生成响应（无 Range 则基于缓冲重新生成标准响应）
export async function respondFromCache(request, cached, fileName, { cors = false, maxAge = 86400 } = {}) {
  const buf = await cached.arrayBuffer();
  const media = resolveContentType(fileName, buf);
  return buildBuffered(buf, request.headers.get('range'), media, cors, maxAge);
}

/**
 * 统一媒体请求：内层缓存命中则自行切片；未命中则回源（上游 206 透传 / 200 缓冲切片）。
 *
 * @param {Request} args.request 访客请求
 * @param {Cache} [args.cache] caches.default
 * @param {Request} [args.cacheKey] 版本化内层缓存键
 * @param {Function} [args.waitUntil] ctx.waitUntil，用于不阻塞写入缓存
 * @param {Function} args.fetchUpstream (rangeHeader: string|null) => Promise<Response>
 * @param {string} args.fileName 文件名（无扩展名时按文件头嗅探并补全）
 * @param {boolean} [args.cors]
 * @param {number} [args.maxAge] 完整对象的浏览器缓存秒数
 * @param {boolean} [args.forwardRange] 是否向上游转发 Range
 * @returns {Promise<{response: Response|null, upstream?: Response}>}
 */
export async function serveMedia({
  request,
  cache = null,
  cacheKey = null,
  waitUntil = null,
  fetchUpstream,
  fileName,
  cors = false,
  maxAge = 86400,
  forwardRange = true,
}) {
  // 1) 内层缓存命中：完整对象由我们确定性切片
  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return {
        response: await respondFromCache(request, cached, fileName, { cors, maxAge }),
      };
    }
  }

  const rangeHeader = request.headers.get('range');
  const sendRange = forwardRange && rangeHeader;

  // 2) 回源（视上游能力决定是否带 Range）
  let res = await fetchUpstream(sendRange || null);
  // 部分上游对 Range 回源直接 404/416：降级为全量拉取后自行切片
  if (!res.ok && sendRange) {
    res = await fetchUpstream(null);
  }
  if (!res.ok) return { response: null, upstream: res };

  // 2a) 上游给了 206：校验可信后原样透传；分片损坏（截断/错误 total）则丢弃并重新拉全量
  if (res.status === 206) {
    const buf = await res.arrayBuffer();
    const cr = res.headers.get('content-range') || '';
    const m = /^bytes\s+\d+-\d+\/(\d+)$/.exec(cr);
    const looksHealthy = m && Number(m[1]) > 0 && buf.byteLength > 0;
    if (looksHealthy) {
      const media = resolveContentType(fileName, buf);
      const h = makeBaseHeaders(media, cors);
      h.set('Content-Range', cr);
      h.set('Content-Length', String(buf.byteLength));
      h.set('Cache-Control', 'no-cache');
      return { response: new Response(buf.slice(0), { status: 206, headers: h }), upstream: res };
    }
    res = await fetchUpstream(null);
    if (!res.ok) return { response: null, upstream: res };
  }

  // 2b) 完整 200：缓冲（chunked 也要拿到确定大小），嗅探类型，写内层缓存，再按 Range 切片
  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const media = resolveContentType(fileName, buf);

  if (cache && cacheKey && total > 0) {
    const cachedEntry = buildBuffered(buf, null, media, cors, maxAge);
    const putJob = cache.put(cacheKey, cachedEntry);
    if (waitUntil) waitUntil(putJob);
    else await putJob;
  }

  return { response: buildBuffered(buf, rangeHeader, media, cors, maxAge), upstream: res };
}
