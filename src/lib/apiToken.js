// API Token 管理：独立新表 api_tokens，首次使用自动建表，无需手动迁移。
// role=admin 的 token 可使用全部通道（含 R2）；role=user 仅 TG.ph / TG_Channel，
// 并绑定访客 uid，上传记录归属其"我的文件"。

export async function ensureTokenTable(env) {
  if (!env.IMG) return;
  await env.IMG.prepare(`CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    uid TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_used TEXT
  )`).run();
}

// 生成形如 ml_ + 40 位十六进制的密钥
export function generateToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return 'ml_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 从请求中解析并校验 API Token。
// 支持 Authorization: Bearer <token> 与 ?token=<token>（兼容图床工具）
// 返回 { ok:true, tokenRow } 或 { ok:false, status, message }
export async function authenticateToken(env, request) {
  const authHeader = request.headers.get('authorization') || '';
  let raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!raw) {
    try {
      raw = new URL(request.url).searchParams.get('token') || '';
    } catch {
      raw = '';
    }
  }
  if (!raw) {
    return { ok: false, status: 401, message: '缺少 API Token，请在请求头携带 Authorization: Bearer <token>' };
  }
  if (!env.IMG) {
    return { ok: false, status: 500, message: '数据库未配置' };
  }
  await ensureTokenTable(env);
  const row = await env.IMG.prepare('SELECT * FROM api_tokens WHERE token = ?1').bind(raw).first();
  if (!row) {
    return { ok: false, status: 401, message: '无效的 API Token' };
  }
  return { ok: true, token: row };
}

// 记录最后使用时间（失败静默，不影响上传）
export async function touchToken(env, id) {
  try {
    const now = new Date().toISOString();
    await env.IMG.prepare('UPDATE api_tokens SET last_used = ?1 WHERE id = ?2').bind(now, id).run();
  } catch { /* 忽略 */ }
}
