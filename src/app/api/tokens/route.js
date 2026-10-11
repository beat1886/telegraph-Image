// API Token 管理（列表 / 创建）
// 管理员：可看全部、创建拥有 R2 权限的 admin token
// 其他访客：只能看/建绑定自己 ml_uid 的普通 token（仅 tg/tgchannel 通道）

export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from '@/auth';
import { ensureTokenTable, generateToken } from '@/lib/apiToken';
import { getUidFromRequest } from '@/lib/uid';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function GET(request) {
  const { env } = getRequestContext();
  if (!env.IMG) return Response.json({ code: 500, success: false, message: '数据库未配置' }, { status: 500, headers: corsHeaders });

  await ensureTokenTable(env);
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  let rows;
  if (isAdmin) {
    rows = (await env.IMG.prepare('SELECT * FROM api_tokens ORDER BY id DESC').all()).results;
  } else {
    const uid = getUidFromRequest(request);
    if (!uid) rows = [];
    else rows = (await env.IMG.prepare('SELECT * FROM api_tokens WHERE uid = ?1 ORDER BY id DESC').bind(uid).all()).results;
  }
  return Response.json({ code: 200, success: true, data: rows, isAdmin }, { headers: corsHeaders });
}

export async function POST(request) {
  const { env } = getRequestContext();
  if (!env.IMG) return Response.json({ code: 500, success: false, message: '数据库未配置' }, { status: 500, headers: corsHeaders });

  await ensureTokenTable(env);
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  let name = '';
  try {
    const body = await request.json();
    name = (body.name || '').toString().trim().slice(0, 40);
  } catch { /* 无 body 时用空名称 */ }

  const role = isAdmin ? 'admin' : 'user';
  let uid = '';
  if (!isAdmin) {
    uid = getUidFromRequest(request);
    if (!uid) {
      return Response.json(
        { code: 400, success: false, message: '无法确认访客身份，请刷新首页后再创建' },
        { status: 400, headers: corsHeaders }
      );
    }
  }

  const token = generateToken();
  const createdAt = new Date().toISOString();
  await env.IMG.prepare(
    'INSERT INTO api_tokens (token, name, role, uid, created_at) VALUES (?1,?2,?3,?4,?5)'
  ).bind(token, name || (isAdmin ? '管理员密钥' : '默认密钥'), role, uid, createdAt).run();

  const row = await env.IMG.prepare('SELECT * FROM api_tokens WHERE token = ?1').bind(token).first();
  return Response.json({ code: 200, success: true, data: row }, { headers: corsHeaders });
}
