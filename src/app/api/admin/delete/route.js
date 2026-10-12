
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from "@/auth";
import { getUidFromRequest } from '@/lib/uid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export const runtime = 'edge';

// 单批次最多删除条数，防止请求体过大
const MAX_BATCH = 500;

export async function DELETE(request) {
  const body = await request.json().catch(() => ({}));
  // 兼容两种入参：{ name } 单条删除、{ names: [...] } 批量删除
  const names = Array.isArray(body.names)
    ? body.names.filter((n) => typeof n === 'string' && n.length > 0)
    : (typeof body.name === 'string' && body.name ? [body.name] : []);

  if (names.length === 0) {
    return Response.json({
      code: 400,
      success: false,
      message: '缺少待删除的记录',
    }, { status: 400, headers: corsHeaders });
  }
  if (names.length > MAX_BATCH) {
    return Response.json({
      code: 400,
      success: false,
      message: `单次最多删除 ${MAX_BATCH} 条`,
    }, { status: 400, headers: corsHeaders });
  }

  const { env } = getRequestContext();
  try {
    // 管理员可删任意记录；访客只能删除自己 uid 名下的记录
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    let stmts;
    if (isAdmin) {
      // D1 原生 batch：所有 DELETE 一次往返、一个事务内执行
      stmts = names.map((n) => env.IMG.prepare(`DELETE FROM imginfo WHERE url = ?1`).bind(n));
    } else {
      const uid = getUidFromRequest(request);
      if (!uid) {
        return Response.json({
          "code": 403,
          "success": false,
          "message": "无法确认访客身份，请刷新页面后重试",
        }, { status: 403, headers: corsHeaders });
      }
      stmts = names.map((n) => env.IMG.prepare(`DELETE FROM imginfo WHERE url = ?1 AND uid = ?2`).bind(n, uid));
    }

    try {
      const results = await env.IMG.batch(stmts);
      const deleted = results.reduce((sum, r) => sum + (r?.meta?.changes > 0 ? 1 : 0), 0);
      const failed = names.length - deleted;
      return Response.json({
        code: failed === 0 ? 200 : (deleted > 0 ? 207 : 403),
        success: deleted > 0,
        deleted,
        failed,
        total: names.length,
        message: isAdmin || failed === 0
          ? true
          : `${failed} 条不是本账号上传的文件，无法删除`,
      }, { status: failed === 0 ? 200 : (deleted > 0 ? 207 : 403), headers: corsHeaders });
    } catch (dbErr) {
      // uid 列尚未迁移：访客无法校验归属，拒绝删除
      if (/no such column/i.test(dbErr.message || '')) {
        return Response.json({
          "code": 500,
          "success": false,
          "message": "数据库缺少 uid 列，请联系管理员执行迁移",
        }, { status: 500, headers: corsHeaders });
      }
      throw dbErr;
    }

  } catch (error) {
    return Response.json({
      "code": 500,
      "success": false,
      "message": error.message,
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }
}
