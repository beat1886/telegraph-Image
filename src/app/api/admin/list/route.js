
import { getRequestContext } from '@cloudflare/next-on-pages';

// ...

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export const runtime = 'edge';

// 将用户输入的搜索词归一化为数据库中 url 字段的形态：
// 复制出来的直链是 https://域名/api/file/xxx.jpg，而库里存的是 /file/xxx.jpg。
// 支持：完整 URL、/api/file/... 相对路径、Markdown/HTML 中夹带的链接、纯关键词片段。
function normalizeQuery(raw) {
  if (typeof raw !== 'string') return '';
  let q = raw.trim();
  if (!q) return '';

  // 从 Markdown/HTML/BBCode 等夹带的文本中提取第一个 http(s) 链接
  const urlMatch = q.match(/https?:\/\/[^\s"')\]]+/i);
  let path = '';
  if (urlMatch) {
    try {
      path = new URL(urlMatch[0]).pathname;
    } catch {
      path = '';
    }
  } else if (/^\/(api\/)?(file|cfile|rfile)\//.test(q)) {
    // 直接粘贴的相对路径（可能带查询串）
    path = q.split(/[?#]/)[0];
  }

  if (path) {
    // 外链统一带 /api 前缀，库内路径不带，去掉它
    if (path.startsWith('/api/')) path = path.slice(4);
    return path;
  }

  // 非链接的普通关键词，去掉首尾空白即可（LIKE 模糊匹配）
  return q;
}

export async function POST(request) {
  // 获取客户端的IP地址
  const { env, cf, ctx } = getRequestContext();
  // console.log(dd);
  try {
    let { page, query } = await request.json()
    page = Number.isInteger(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
    const q = normalizeQuery(query);

    const baseSelect = `SELECT imginfo.*, (SELECT COUNT(*) FROM tgimglog WHERE tgimglog.url = imginfo.url) AS logcount FROM imginfo`;

    if (q) {
      const like = `%${q}%`;
      const ps = env.IMG.prepare(`${baseSelect} WHERE url LIKE ?1 ORDER BY id DESC LIMIT 10 OFFSET ?2 * 10`).bind(like, page);
      const { results } = await ps.all()
      const total = await env.IMG.prepare(`SELECT COUNT(*) as total FROM imginfo WHERE url LIKE ?1`).bind(like).first()
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "data": results,
        "page": page,
        "total": total.total
      });
    } else {
      const ps = env.IMG.prepare(`${baseSelect} ORDER BY id DESC LIMIT 10 OFFSET ?1 * 10`).bind(page);
      const { results } = await ps.all()
      const total = await env.IMG.prepare(`SELECT COUNT(*) as total FROM imginfo`).first()
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "data": results,
        "page": page,
        "total": total.total
      });
    }


  } catch (error) {

    return Response.json({
      "code": 500,
      "success": false,
      "message": error.message,
      "data": page,
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }

}



