// 文件扩展名 → MIME 类型映射（供文件代理接口统一使用）
const MIME_TYPES = {
  // 图片
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', ico: 'image/x-icon', tiff: 'image/tiff',
  // 视频
  mp4: 'video/mp4', m4v: 'video/x-m4v', webm: 'video/webm', ogv: 'video/ogg',
  avi: 'video/x-msvideo', mov: 'video/quicktime', wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv', mkv: 'video/x-matroska', '3gp': 'video/3gpp', ts: 'video/mp2t',
  // 音频
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
  wma: 'audio/x-ms-wma',
  // 文档
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8', css: 'text/css', csv: 'text/csv; charset=utf-8',
  json: 'application/json', xml: 'application/xml',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // 压缩包
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  gz: 'application/gzip', tar: 'application/x-tar',
};

export function getContentType(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// 根据文件头魔数嗅探类型（Telegram 等上游文件名常无扩展名，如 file_31）
// 返回 { mime, ext } 或 null
export function sniffContentType(buf) {
  if (!buf || buf.byteLength < 12) return null;
  const b = new Uint8Array(buf);
  const s = (o, n = 4) => String.fromCharCode(...b.subarray(o, o + n));
  // ISO BMFF（偏移 4 为 ftyp）：mp4/mov/3gp 等
  if (s(4) === 'ftyp') {
    const brand = s(8);
    if (brand === 'qt  ') return { mime: 'video/quicktime', ext: 'mov' };
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  // Matroska / WebM（进一步在头部找 webm 标识）
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) {
    const head = String.fromCharCode(...b.subarray(0, Math.min(4096, b.length)));
    return head.includes('webm') ? { mime: 'video/webm', ext: 'webm' } : { mime: 'video/x-matroska', ext: 'mkv' };
  }
  if (s(0, 3) === 'FLV') return { mime: 'video/x-flv', ext: 'flv' };
  if (s(0) === 'ID3' || ((b[0] === 0xFF) && ((b[1] & 0xE0) === 0xE0))) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (s(0) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (s(0) === 'fLaC') return { mime: 'audio/flac', ext: 'flac' };
  if (s(0) === 'RIFF' && s(8) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  // 图片兜底
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  if (s(0) === '\x89PNG') return { mime: 'image/png', ext: 'png' };
  if (s(0) === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (s(0) === 'RIFF' && s(8) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  // PDF
  if (s(0) === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  return null;
}

// 优先按扩展名，扩展名缺失/未知时按文件头嗅探；无扩展名时为文件名补扩展名。
// 返回 { mime, fileName }
export function resolveContentType(fileName, buf) {
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(fileName);
  const byName = getContentType(fileName);
  if (hasExt && byName !== 'application/octet-stream') return { mime: byName, fileName };
  const sniffed = sniffContentType(buf);
  if (sniffed) {
    return { mime: sniffed.mime, fileName: hasExt ? fileName : `${fileName}.${sniffed.ext}` };
  }
  return { mime: byName, fileName };
}

// 浏览器可直接内联打开（在线播放/预览）的类型；其余类型触发下载
export function isInlineType(contentType) {
  return /^(video|audio|image|text)\//.test(contentType) || contentType === 'application/pdf';
}

// 生成 Content-Disposition：可预览类型 inline，其余 attachment；文件名做 RFC 5987 编码（兼容中文文件名）
export function buildContentDisposition(fileName, contentType) {
  const disposition = isInlineType(contentType) ? 'inline' : 'attachment';
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
