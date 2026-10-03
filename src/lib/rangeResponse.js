// 媒体代理统一响应层（视频/音频在线播放、Range 拖动）
//
// Cloudflare 边缘缓存机制（实测）：
// - 当响应可被边缘缓存时，访客的 Range 头在未命中缓存时会被边缘剥离（源站收到完整请求）；
// - 边缘对 chunked/截断对象的切片不可靠（可能返回空 206 或错误 total）。
// 因此本方案：对外响应使用 private（边缘不缓存、浏览器照常缓存），Range 头即可到达函数；
// 完整对象由函数写入 caches.default 的版本化内层缓存，分片一律由本模块在边缘确定性切分。
import { getContentType, buildContentDisposition } from './mime';

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

function makeBaseHeaders(fileName, cors) {
  const h = new Headers();
  h.set('Content-Type', getContentType(fileName));
  h.set('Content-Disposition', buildContentDisposition(fileName, h.get('Content-Type')));
  h.set('Accept-Ranges', 'bytes');
  if (cors) h.set('Access-Control-Allow-Origin', '*');
  return h;
}

// 用已缓冲的完整对象构造分片响应（206 / 416）
function sliceBuffered(buf, rangeHeader, fileName, cors) {
  const total = buf.byteLength;
  const range = parseRange(rangeHeader, total);
  const h = makeBaseHeaders(fileName, cors);
  if (range && range.invalid) {
    h.set('Content-Range', `bytes */${total}`);
    return { response: new Response(null, { status: 416, headers: h }) };
  }
  if (range) {
    h.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
    h.set('Content-Length', String(range.end - range.start + 1));
    h.set('Cache-Control', 'no-cache');
    return {
      response: new Response(buf.slice(range.start, range.end + 1), { status: 206, headers: h }),
    };
  }
  // 无法解析的 Range：退回完整 200
  h.set('Content-Length', String(total));
  h.set('Cache-Control', 'private, max-age=86400');
  return { response: new Response(buf, { status: 200, headers: h }), cacheEntry: true };
}

// 内层缓存命中后按访客 Range 生成响应（无 Range 则原样返回完整对象）
export async function respondFromCache(request, cached, fileName, { cors = false } = {}) {
  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) return cached;
  const buf = await cached.arrayBuffer();
  return sliceBuffered(buf, rangeHeader, fileName, cors).response;
}

/**
 * 统一媒体请求：内层缓存命中则自行切片；未命中则回源（上游 206 透传 / 200 缓冲切片）。
 *
 * @param {Request} args.request 访客请求
 * @param {Cache} [args.cache] caches.default
 * @param {Request} [args.cacheKey] 版本化内层缓存键
 * @param {Function} [args.waitUntil] ctx.waitUntil，用于不阻塞写入缓存
 * @param {Function} args.fetchUpstream (rangeHeader: string|null) => Promise<Response>，由本层决定是否带 Range
 * @param {string} args.fileName 用于推断 Content-Type / 文件名
 * @param {boolean} [args.cors]
 * @param {number} [args.maxAge] 完整对象的浏览器缓存秒数
 * @returns {Promise<{response: Response, upstream?: Response}>}
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
}) {
  // 1) 内层缓存命中：完整对象由我们确定性切片
  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return { response: await respondFromCache(request, cached, fileName, { cors }) };
    }
  }

  const rangeHeader = request.headers.get('range');

  // 2) 回源（带访客 Range）
  let res = await fetchUpstream(rangeHeader || null);
  if (!res.ok) return { response: null, upstream: res };

  // 2a) 上游给了 206：校验可信后原样透传；分片损坏（截断/错误 total）则丢弃并重新拉全量
  if (res.status === 206) {
    const buf = await res.arrayBuffer();
    const cr = res.headers.get('content-range') || '';
    const m = /^bytes\s+\d+-\d+\/(\d+)$/.exec(cr);
    const looksHealthy = m && Number(m[1]) > 0 && buf.byteLength > 0;
    if (looksHealthy) {
      const h = makeBaseHeaders(fileName, cors);
      h.set('Content-Range', cr);
      h.set('Content-Length', String(buf.byteLength));
      h.set('Cache-Control', 'no-cache');
      return { response: new Response(buf, { status: 206, headers: h }), upstream: res };
    }
    res = await fetchUpstream(null);
    if (!res.ok) return { response: null, upstream: res };
  }

  // 2b) 完整 200：缓冲（chunked 也要拿到确定大小），再决定切片或完整返回
  const buf = await res.arrayBuffer();
  const total = buf.byteLength;
  const sliced = rangeHeader ? sliceBuffered(buf, rangeHeader, fileName, cors) : null;

  // 完整对象写内层缓存（200 或 206 响应都基于同一个完整对象）
  // 注意：new Response(ArrayBuffer) 会 detach 底层 buffer，每个响应必须使用独立副本
  if (cache && cacheKey && total > 0) {
    const h0 = makeBaseHeaders(fileName, cors);
    h0.set('Content-Length', String(total));
    h0.set('Cache-Control', `private, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
    const fullResponse = new Response(buf.slice(0), { status: 200, headers: h0 });
    const putJob = cache.put(cacheKey, fullResponse);
    if (waitUntil) waitUntil(putJob);
    else await putJob;
  }

  if (sliced) return { response: sliced.response, upstream: res };

  const h = makeBaseHeaders(fileName, cors);
  h.set('Content-Length', String(total));
  h.set('Cache-Control', `private, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
  return { response: new Response(buf.slice(0), { status: 200, headers: h }), upstream: res };
}
