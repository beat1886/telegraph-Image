// 吊销 API Token：管理员可删任意；访客只能删自己 uid 名下的

export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from '@/auth';
import { ensureTokenTable } from '@/lib/apiToken';
import { getUidFromRequest } from '@/lib/uid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function DELETE(request, { params }) {
  const { env } = getRequestContext();
  if (!env.IMG) return Response.json({ code: 500, success: false, message: '数据库未配置' }, { status: 500, headers: corsHeaders });

  await ensureTokenTable(env);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ code: 400, success: false, message: '无效的 Token ID' }, { status: 400, headers: corsHeaders });
  }

  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  if (isAdmin) {
    const res = await env.IMG.prepare('DELETE FROM api_tokens WHERE id = ?1').bind(id).run();
    const ok = res?.meta?.changes > 0;
    return Response.json({ code: ok ? 200 : 404, success: ok, message: ok ? '已吊销' : 'Token 不存在' }, { status: ok ? 200 : 404, headers: corsHeaders });
  }

  const uid = getUidFromRequest(request);
  if (!uid) {
    return Response.json({ code: 403, success: false, message: '无法确认访客身份' }, { status: 403, headers: corsHeaders });
  }
  const res = await env.IMG.prepare('DELETE FROM api_tokens WHERE id = ?1 AND uid = ?2').bind(id, uid).run();
  const ok = res?.meta?.changes > 0;
  return Response.json(
    { code: ok ? 200 : 403, success: ok, message: ok ? '已吊销' : '只能吊销自己的 Token' },
    { status: ok ? 200 : 403, headers: corsHeaders }
  );
}
