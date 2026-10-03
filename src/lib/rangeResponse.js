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

  const rangeHeader = request.headers.get('range');

  // 3) 访客要分片但上游忽略了 Range（返回 200，可能是 chunked 无 content-length）：
  //    缓冲完整内容后按实际大小在边缘切分（tg.ph 回源不支持分片时的兜底）
  if (rangeHeader && res.status === 200) {
    const buf = await res.arrayBuffer();
    const total = buf.byteLength;
    const range = parseRange(rangeHeader, total);
    if (range && range.invalid) {
      const h2 = makeHeaders();
      h2.set('Content-Range', `bytes */${total}`);
      return { response: new Response(null, { status: 416, headers: h2 }), partial: false, cacheable: false };
    }
    if (range) {
      const h2 = makeHeaders();
      h2.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`);
      h2.set('Content-Length', String(range.end - range.start + 1));
      h2.set('Cache-Control', 'no-cache');
      return {
        response: new Response(buf.slice(range.start, range.end + 1), { status: 206, headers: h2 }),
        partial: true,
        cacheable: false,
      };
    }
    // Range 头格式无法解析：按完整 200 返回缓冲内容
    const hf = makeHeaders();
    hf.set('Content-Length', String(total));
    hf.set('Cache-Control', `public, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
    return { response: new Response(buf, { status: 200, headers: hf }), partial: false, cacheable: true };
  }

  // 4) 普通完整响应：缓冲后带确切 Content-Length 返回。
  //    Cloudflare 边缘对未命中缓存的 Range 请求会剥离 Range 向源站拉全量，
  //    只有响应带 Content-Length 时，边缘缓存后才能对后续 Range 请求输出 206。
  const fullBuf = await res.arrayBuffer();
  const h = makeHeaders();
  h.set('Content-Length', String(fullBuf.byteLength));
  h.set('Cache-Control', `public, max-age=${maxAge}${maxAge >= 31536000 ? ', immutable' : ''}`);
  return { response: new Response(fullBuf, { status: 200, headers: h }), partial: false, cacheable: true };
}
