'use client';
// 管理页：API Token 管理卡片
// 管理员可创建带 R2 权限的密钥；访客创建的密钥仅 TG.ph / TG_Channel，上传记录归属"我的文件"

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500)),
      ]);
      return true;
    }
  } catch { /* 降级 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function fmtTime(iso) {
  if (!iso) return '从未使用';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

export default function ApiTokens() {
  const [tokens, setTokens] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tokens');
      const data = await res.json();
      if (res.ok) {
        setTokens(data.data || []);
        setIsAdmin(!!data.isAdmin);
      }
    } catch { /* 忽略 */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('密钥已创建');
        setName('');
        load();
      } else {
        toast.error(data.message || '创建失败');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('确定吊销该密钥吗？吊销后使用此密钥的程序将无法再上传。')) return;
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success('已吊销');
        load();
      } else {
        toast.error(data.message || '吊销失败');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCopy = async (text) => {
    const ok = await copyText(text);
    if (ok) toast.success('已复制');
    else toast.error('复制失败');
  };

  const apiExample = `POST  ${origin || 'https://你的域名'}/api/upload

Headers:
  Authorization: Bearer ml_你的密钥

Body (form-data):
  file      文件      必填
  channel   tgchannel 可选  tg / tgchannel${isAdmin ? ' / r2' : ''}  默认 tgchannel`;

  const curlExample = `curl -X POST ${origin || 'https://你的域名'}/api/upload \\
  -H "Authorization: Bearer ml_你的密钥" \\
  -F "channel=tgchannel" \\
  -F "file=@图片.jpg"`;

  // 折叠收纳：默认收起，选择记忆在 localStorage
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('ml_api_open') === '1') setOpen(true); } catch { /* 忽略 */ }
  }, []);
  const toggleOpen = () => setOpen((o) => {
    const n = !o;
    try { localStorage.setItem('ml_api_open', n ? '1' : '0'); } catch { /* 忽略 */ }
    return n;
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-4">
      <div className="bg-white rounded-lg shadow p-3">
        {/* 标题行点击折叠/展开 API 面板 */}
        <button type="button" onClick={toggleOpen} className={`w-full flex items-center justify-between ${open ? 'mb-3' : ''}`}>
          <h2 className="text-xs sm:text-sm font-medium text-gray-700">API 接口</h2>
          <span className="flex items-center gap-2">
            {open && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {isAdmin ? '管理员密钥可用 TG.ph / TG_Channel / R2' : '密钥可用 TG.ph / TG_Channel'}
              </span>
            )}
            <ChevronIcon open={open} />
          </span>
        </button>

        {open && (<>
        {/* 调用示例：接口测试工具格式 */}
        <div className="relative mb-2 rounded-lg bg-slate-900 text-slate-100 text-xs p-3 pr-10 overflow-x-auto">
          <pre className="whitespace-pre-wrap break-all leading-5">{apiExample}</pre>
          <button
            onClick={() => handleCopy(apiExample)}
            className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-blue-300 transition-colors"
            title="复制示例"
          >
            <CopyIcon />
          </button>
        </div>
        <details className="mb-2">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">curl 命令</summary>
          <div className="relative mt-1 rounded-lg bg-slate-900 text-slate-100 text-xs p-3 pr-10 overflow-x-auto">
            <pre className="whitespace-pre-wrap break-all leading-5">{curlExample}</pre>
            <button
              onClick={() => handleCopy(curlExample)}
              className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-blue-300 transition-colors"
              title="复制 curl"
            >
              <CopyIcon />
            </button>
          </div>
        </details>
        {/* 返回格式与说明 */}
        <div className="mb-3 space-y-2">
          <div className="rounded-lg bg-slate-900 text-slate-100 text-xs p-3 overflow-x-auto">
            <p className="text-slate-400 mb-1">返回 JSON</p>
            <pre className="whitespace-pre-wrap break-all leading-5">{`{
  "code": 200,
  "success": true,
  "channel": "tgchannel",
  "data": [{ "url": "https://...", "name": "图片.jpg" }],
  "url": "https://..."
}`}</pre>
          </div>
          <p className="text-xs text-gray-400">
            channel 可选 <code className="text-gray-500">tg</code> / <code className="text-gray-500">tgchannel</code>{isAdmin ? ' / <code className="text-gray-500">r2</code>' : ''}，默认 <code className="text-gray-500">tgchannel</code>
          </p>
          <p className="text-xs text-gray-400">
            <a href="/api-test.html" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline whitespace-nowrap">
              打开网页上传测试页 →
            </a>
          </p>
        </div>

        {/* 创建密钥：窄屏时输入框占满一行，按钮换行，避免备注提示字被挤压截断 */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="密钥备注（可选，如 PicList）"
            maxLength={40}
            className="flex-1 min-w-[200px] border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? '创建中…' : '新建密钥'}
          </button>
        </div>

        {/* 密钥列表 */}
        {loading ? (
          <p className="text-sm text-gray-400 py-4 text-center">加载中…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">暂无密钥，填写备注后点击「新建密钥」</p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <span className="text-sm text-gray-700 truncate">{t.name || '未命名'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${t.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {t.role === 'admin' ? '管理员' : '普通'}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <code className="text-xs text-gray-500 truncate flex-1 font-mono">{t.token}</code>
                  <button
                    onClick={() => handleCopy(t.token)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors shrink-0"
                    title="复制密钥"
                  >
                    <CopyIcon />
                  </button>
                </div>
                <div className="text-[11px] text-gray-400 sm:w-32 shrink-0">{fmtTime(t.last_used)}</div>
                <button
                  onClick={() => handleRevoke(t.id)}
                  className="text-xs text-red-500 hover:text-red-600 shrink-0 sm:w-12 text-right"
                >
                  吊销
                </button>
              </div>
            ))}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}
