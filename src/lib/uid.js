// 访客标识：为未登录用户生成持久 uid（cookie 存 1 年），
// 用于"我的文件"管理——匿名用户只能看到/删除自己上传的记录。
// 上传接口从 cookie 读取 uid 写入 imginfo.uid；管理接口按 uid 过滤。

export const UID_COOKIE = 'ml_uid';

// 服务端（edge route）：从请求 cookie 中解析 uid
export function getUidFromRequest(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`));
  const uid = m ? decodeURIComponent(m[1]) : '';
  // 只接受合法 UUID 形态，防注入与脏数据
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid) ? uid : '';
}

// 客户端：确保 uid cookie 存在，不存在则生成。返回 uid。
export function ensureUidCookie() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${UID_COOKIE}=([^;]+)`));
  if (m) return decodeURIComponent(m[1]);
  const uid = crypto.randomUUID();
  document.cookie = `${UID_COOKIE}=${uid}; path=/; max-age=31536000; samesite=lax`;
  return uid;
}
