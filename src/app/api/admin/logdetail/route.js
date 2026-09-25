import { getRequestContext } from '@cloudflare/next-on-pages';

// 查询单张图片的访问记录（tgimglog），供数据页「访问记录」弹窗使用
// 鉴权由 middleware 统一处理：仅 admin 可访问 /api/admin/*

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

export const runtime = 'edge';

export async function POST(request) {
  const { env } = getRequestContext();
  try {
    const { url, page } = await request.json();

    if (!url) {
      return Response.json(
        { success: false, message: 'url is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const pageIndex = Number.isFinite(Number(page)) ? Math.max(0, Number(page)) : 0;

    // 使用参数绑定，避免 SQL 注入
    const { results } = await env.IMG
      .prepare('SELECT id, time, referer, ip FROM tgimglog WHERE url = ?1 ORDER BY id DESC LIMIT 10 OFFSET ?2')
      .bind(url, pageIndex * 10)
      .all();

    const totalRow = await env.IMG
      .prepare('SELECT COUNT(*) as total FROM tgimglog WHERE url = ?1')
      .bind(url)
      .first();

    return Response.json({
      success: true,
      message: 'success',
      data: results,
      total: totalRow?.total ?? 0
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
