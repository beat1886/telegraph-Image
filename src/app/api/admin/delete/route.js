
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




export async function DELETE(request) {
  let { name } = await request.json()
  const { env, cf, ctx } = getRequestContext();
  try {
    // 管理员可删任意记录；访客只能删除自己 uid 名下的记录
    const session = await auth();
    const isAdmin = session?.user?.role === 'admin';

    if (isAdmin) {
      const setData = await env.IMG.prepare(`DELETE FROM imginfo WHERE url = ?1`).bind(name).run()
      return Response.json({
        "code": 200,
        "success": true,
        "message": setData.success,
      });
    }

    const uid = getUidFromRequest(request);
    if (!uid) {
      return Response.json({
        "code": 403,
        "success": false,
        "message": "无法确认访客身份，请刷新页面后重试",
      }, { status: 403, headers: corsHeaders });
    }

    try {
      const res = await env.IMG.prepare(`DELETE FROM imginfo WHERE url = ?1 AND uid = ?2`).bind(name, uid).run()
      const deleted = res?.meta?.changes > 0;
      return Response.json({
        "code": deleted ? 200 : 403,
        "success": deleted,
        "message": deleted ? true : "只能删除自己上传的文件",
      }, { status: deleted ? 200 : 403, headers: corsHeaders });
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
