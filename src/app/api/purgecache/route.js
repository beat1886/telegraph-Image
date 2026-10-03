export const runtime = 'edge';

// [TEMP] 一次性维护路由：删除本边缘节点上指定路径的旧外层缓存，验证后立即删除
export async function GET(request) {
  const u = new URL(request.url);
  const target = u.searchParams.get('u');
  if (!target || !target.startsWith('/')) {
    return Response.json({ error: 'missing ?u=/path' }, { status: 400 });
  }
  const targetUrl = new URL(target, u.origin).toString();
  const cache = caches.default;
  const variants = [
    {},
    { 'Accept-Encoding': 'gzip, deflate, br' },
    { 'Accept-Encoding': 'gzip' },
    { 'Accept-Encoding': 'br' },
  ];
  const results = [];
  for (const h of variants) {
    const key = new Request(targetUrl, { method: 'GET', headers: h });
    results.push({ headers: h, deleted: await cache.delete(key) });
  }
  return Response.json({ targetUrl, results }, {
    headers: { 'cache-control': 'no-store' },
  });
}
