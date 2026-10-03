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
