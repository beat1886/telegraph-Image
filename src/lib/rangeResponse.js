// 统一构造文件代理响应：上游支持 Range 则透传 206；不支持时在边缘缓冲后自行切分，
// 保证视频/音频在线播放和拖动进度条始终可用。
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

/**
 * @param {Request} request 访客请求
 * @param {Response} res 上游响应（200 完整或 206 分片）
 * @param {string} fileName 用于推断 Content-Type 和文件名
 * @param {object} opts maxAge 完整响应的浏览器缓存秒数；cors 是否加跨域头
 * @returns {{response: Response, partial: boolean, cacheable: boolean}}
 */
export async function buildMediaResponse(request, res, fileName, opts = {}) {
  const { maxAge = 31536000, cors = false } = opts;
  const contentType = getContentType(fileName);
  const makeHeaders = () => {
    const h = new Headers();
    h.set('Content-Type', contentType);
    h.set('Content-Disposition', buildContentDisposition(fileName, contentType));
    h.set('Accept-Ranges', 'bytes');
    if (cors) h.set('Access-Control-Allow-Origin', '*');
    return h;
  };

  // 1) 上游已返回分片：原样透传
  if (res.status === 206) {
    const h = makeHeaders();
    const cr = res.headers.get('content-range');
    const cl = res.headers.get('content-length');
    if (cr) h.set('Content-Range', cr);
    if (cl) h.set('Content-Length', cl);
    h.set('Cache-Control', 'no-cache');
    return { response: new Response(res.body, { status: 206, headers: h }), partial: true, cacheable: false };
  }

  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const rangeHeader = request.headers.get('range');
  const range = rangeHeader && total > 0 ? parseRange(rangeHeader, total) : null;

  // 2) 请求的范围非法：416
  if (range && range.invalid) {
    const h = makeHeaders();
    h.set('Content-Range', `bytes */${total}`);
    return { response: new Response(null, { status: 416, headers: h }), partial: false, cacheable: false };
  }

  // 3) 上游给全量但访客要分片：边缘缓冲后自行切分（tg.ph 源站不支持回源分片时的兜底）
  if (range) {
    const buf = await res.arrayBuffer();
    const h = makeHeaders();
    h.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
    h.set('Content-Length', String(range.end - range.start + 1));
    h.set('Cache-Control', 'no-cache');
    return {
      response: new Response(buf.slice(range.start, range.end + 1), { status: 206, headers: h }),
      partial: true,
      cacheable: false,
    };
  }

  // 4) 普通完整响应：流式转发 + 长缓存
  const h = makeHeaders();
  h.set('Cache-Control', `public, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
  return { response: new Response(res.body, { status: 200, headers: h }), partial: false, cacheable: true };
}
