
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from "@/auth";
import { getUidFromRequest } from '@/lib/uid';

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
    let { page, query, channel, pageSize, kind, dateFrom, dateTo } = await request.json()
    page = Number.isInteger(Number(page)) && Number(page) >= 0 ? Number(page) : 0;
    // 每页条数白名单，防注入/异常值
    const size = [10, 20, 50, 100].includes(Number(pageSize)) ? Number(pageSize) : 10;
    const q = normalizeQuery(query);

    // 管理员看全部；其他访客只能看自己 uid 上传的记录
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    const baseSelect = `SELECT imginfo.*, (SELECT COUNT(*) FROM tgimglog WHERE tgimglog.url = imginfo.url) AS logcount FROM imginfo`;

    // 组合筛选条件：关键词模糊匹配 + 上传通道前缀过滤
    const channelPrefix = { file: '/file/', cfile: '/cfile/', rfile: '/rfile/' }[channel];
    const conds = [];
    const binds = [];
    if (q) {
      conds.push(`url LIKE ?${binds.length + 1}`);
      binds.push(`%${q}%`);
    }
    if (channelPrefix) {
      conds.push(`url LIKE ?${binds.length + 1}`);
      binds.push(`${channelPrefix}%`);
    }
    // 文件类型筛选（kind 列；旧记录 kind 为空，仅筛选全部时可见）
    const KINDS = ['image', 'video', 'audio', 'file'];
    if (KINDS.includes(kind)) {
      conds.push(`kind = ?${binds.length + 1}`);
      binds.push(kind);
    }
    // 上传时间范围筛选（time 列为 YYYY-MM-DD 字符串，可直接比较）
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (DATE_RE.test(dateFrom || '')) {
      conds.push(`time >= ?${binds.length + 1}`);
      binds.push(dateFrom);
    }
    if (DATE_RE.test(dateTo || '')) {
      conds.push(`time <= ?${binds.length + 1}`);
      binds.push(dateTo);
    }

    if (!isAdmin) {
      const uid = getUidFromRequest(request);
      if (!uid) {
        // 无访客标识：没有可归属的记录，直接返回空
        return Response.json({ code: 200, success: true, message: "success", data: [], page, total: 0 });
      }
      conds.push(`uid = ?${binds.length + 1}`);
      binds.push(uid);
    }

    const where = conds.length ? ` WHERE ${conds.join(' AND ')}` : '';

    try {
      const pageBind = `?${binds.length + 1}`;
      const ps = env.IMG.prepare(`${baseSelect}${where} ORDER BY id DESC LIMIT ${size} OFFSET ${pageBind} * ${size}`).bind(...binds, page);
      const { results } = await ps.all()
      const total = await env.IMG.prepare(`SELECT COUNT(*) as total FROM imginfo${where}`).bind(...binds).first()
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "data": results,
        "page": page,
        "total": total.total
      });
    } catch (dbErr) {
      // uid 列尚未迁移时，非管理员查询会报 no such column：返回空列表而不是报错
      if (!isAdmin && /no such column/i.test(dbErr.message || '')) {
        return Response.json({ code: 200, success: true, message: "success", data: [], page, total: 0 });
      }
      throw dbErr;
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



