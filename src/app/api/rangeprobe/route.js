export const runtime = 'edge';

// [TEMP] 诊断 Range 在 Cloudflare 各层的传递情况，验证后删除
export async function GET(request) {
  const name = '812a80e66213701c6e547-84525f1a11773d91bb.mp4';
  const up = await fetch(`https://telegra.ph/file/${name}`, {
    headers: { Range: 'bytes=0-99' },
  });
  const buf = await up.arrayBuffer();
  return Response.json({
    inboundRange: request.headers.get('range'),
    upstream: {
      status: up.status,
      contentLength: up.headers.get('content-length'),
      contentRange: up.headers.get('content-range'),
      transferEncoding: up.headers.get('transfer-encoding'),
      bodyBytes: buf.byteLength,
    },
  }, {
    headers: { 'cache-control': 'no-store' },
  });
}
