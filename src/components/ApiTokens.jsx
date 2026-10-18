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

// 多语言请求代码示例：标签切换 + 复制
function CodeTabs({ examples }) {
  const langs = Object.keys(examples);
  const [lang, setLang] = useState(langs[0]);
  const code = examples[lang];
  return (
    <div className="mb-2">
      <div className="flex flex-wrap gap-1 mb-1.5">
        {langs.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`px-2 py-0.5 rounded text-xs border transition-colors ${lang === l ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="relative rounded-lg bg-slate-900 text-slate-100 text-xs p-3 pr-10 overflow-x-auto">
        <pre className="whitespace-pre-wrap break-all leading-5">{code}</pre>
        <button
          onClick={async () => { (await copyText(code)) ? toast.success('已复制') : toast.error('复制失败'); }}
          className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-blue-300 transition-colors"
          title="复制"
        >
          <CopyIcon />
        </button>
      </div>
    </div>
  );
}

// 返回示例：说明文字在代码块上方；标题栏仅 JSON 标识 + 复制；代码带行号
function RespExample({ title, code }) {
  const lineNums = code.split('\n').map((_, i) => i + 1).join('\n');
  return (
    <div className="mb-2">
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <div className="rounded-lg overflow-hidden border border-slate-700">
        <div className="flex items-center justify-between bg-slate-800 text-slate-300 text-xs px-3 py-1.5">
          <span className="text-slate-500">JSON</span>
          <button
            onClick={async () => { (await copyText(code)) ? toast.success('已复制') : toast.error('复制失败'); }}
            className="text-slate-400 hover:text-blue-300 transition-colors"
          >
            复制
          </button>
        </div>
        <div className="bg-slate-900 text-slate-100 text-xs p-3 overflow-x-auto flex">
          <pre aria-hidden="true" className="text-slate-600 text-right pr-3 select-none leading-5 shrink-0">{lineNums}</pre>
          <pre className="whitespace-pre-wrap break-all leading-5 flex-1">{code}</pre>
        </div>
      </div>
    </div>
  );
}

// 请求行：方法徽标 + URL，类似 markdown 代码块样式，URL 过长自动换行且可复制
function MethodUrl({ method, url }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 mb-2 text-xs">
      <span className="shrink-0 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">{method}</span>
      <code className="text-gray-800 break-all flex-1">{url}</code>
      <button
        onClick={async () => { (await copyText(url)) ? toast.success('已复制') : toast.error('复制失败'); }}
        className="p-1 text-gray-400 hover:text-blue-500 transition-colors shrink-0"
        title="复制 URL"
      >
        <CopyIcon />
      </button>
    </div>
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

  // 生成当前接口说明的 Markdown 文本（供「复制 Markdown」按钮使用）
  const buildDocMarkdown = (tab) => {
    const uploadMd = `## 文件上传接口

### 请求说明

\`POST\` \`${base}/api/upload\`

Header：

| 参数 | 值 |
| --- | --- |
| Authorization | Bearer ml_你的密钥 |

Body（form-data）：

| 参数 | 是否必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| file[] | 是 | file[] | 上传的文件；单个、多个统一使用 file[] 数组字段，多个文件重复该字段（可混合图片/视频/音频等类型）；PHP/Java 等无法重复同名字段的语言，可用 file[0]、file[1] 索引形式代替 |
| channel | 否 | string | 上传通道：tg / tgchannel${isAdmin ? ' / r2' : ''}，默认 tgchannel |

### 请求代码示例

\`\`\`bash
${uploadExamples.Bash}
\`\`\`

### 返回说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否上传成功 |
| data | array[] | 上传结果数组，多文件时含多个元素 |
| + url | string | 文件直链 |
| + name | string | 文件名 |
| url | string | 首个文件的直链（便捷字段） |

返回示例：

\`\`\`json
{
  "success": true,
  "data": [
    {
      "url": "链接1",
      "name": "文件1"
    },
    {
      "url": "链接2",
      "name": "文件2"
    }
  ],
  "url": "首个链接"
}
\`\`\``;
    const transferMd = `## 链接转存接口

首页「链接转存」免密钥；外部调用需密钥。

\`POST\` \`${base}/api/transfer\`

Content-Type：application/json；由服务器抓取源文件，不受浏览器跨域限制；单个文件大小限制随所选通道而定（TG 系通道 ≤ 50MB），链接数量不限。

Header：

| 参数 | 值 |
| --- | --- |
| Authorization | Bearer ml_你的密钥 |

Body（JSON，单个、多个统一使用 urls 数组）：

| 参数 | 是否必选 | 类型 | 说明 |
| --- | --- | --- | --- |
| urls | 是 | string[] | 文件直链 http(s) URL 数组；单个、多个统一使用该数组，单个链接传一个元素，多个链接传多个元素，数量不限 |
| channel | 否 | string | tg / tgchannel，默认 tgchannel |

### 请求代码示例

\`\`\`bash
${transferExamples.Bash}
\`\`\`

返回示例（单个、多个格式完全一致；单链接时 count 为 1、results 含一个元素）：

\`\`\`json
{
  "success": true,
  "count": 1,
  "results": [
    {
      "url": "转存后的直链",
      "name": "文件名"
    }
  ],
  "failures": []
}
\`\`\`

多链接示例（failures 为失败明细，全部成功时为空；部分失败时 success=false）：

\`\`\`json
{
  "success": true,
  "count": 2,
  "results": [
    {
      "url": "直链1",
      "name": "文件1"
    },
    {
      "url": "直链2",
      "name": "文件2"
    }
  ],
  "failures": []
}
\`\`\``;
    return tab === 'upload' ? uploadMd : transferMd;
  };

  const base = origin || 'https://你的域名';
  // 文件上传请求示例（多语言）：单个文件只放一个 file[]，多个文件重复/追加
  const uploadExamples = {
    Bash: `curl -X POST ${base}/api/upload \\
  -H "Authorization: Bearer ml_你的密钥" \\
  -F "channel=tgchannel" \\
  -F "file[]=@图片1.jpg" \\
  -F "file[]=@图片2.jpg"`,
    Python: `import requests

url = "${base}/api/upload"
headers = {"Authorization": "Bearer ml_你的密钥"}
# 多个文件：列表里重复 ("file[]", ...) 项；单个文件只放一个
files = [
    ("file[]", ("图片1.jpg", open("图片1.jpg", "rb"))),
    ("file[]", ("图片2.jpg", open("图片2.jpg", "rb"))),
]
resp = requests.post(url, headers=headers, files=files, data={"channel": "tgchannel"})
print(resp.json())`,
    JAVA: `// 依赖 OkHttp：implementation 'com.squareup.okhttp3:okhttp:4.12.0'
import okhttp3.*;
import java.io.File;

public class UploadExample {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();
        MultipartBody body = new MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("channel", "tgchannel")
                // 单个文件只加一个；多个文件用 file[0]、file[1] 索引形式
                .addFormDataPart("file[0]", "图片1.jpg",
                        RequestBody.create(new File("图片1.jpg"), MediaType.parse("image/jpeg")))
                .addFormDataPart("file[1]", "图片2.jpg",
                        RequestBody.create(new File("图片2.jpg"), MediaType.parse("image/jpeg")))
                .build();
        Request request = new Request.Builder()
                .url("${base}/api/upload")
                .header("Authorization", "Bearer ml_你的密钥")
                .post(body)
                .build();
        try (Response resp = client.newCall(request).execute()) {
            System.out.println(resp.body().string());
        }
    }
}`,
    'C++': `#include <iostream>
#include <curl/curl.h>

// 依赖 libcurl：https://curl.se/download.html
int main() {
    CURL *curl = curl_easy_init();
    if (!curl) return 1;

    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Authorization: Bearer ml_你的密钥");

    curl_mime *mime = curl_mime_init(curl);
    curl_mimepart *part;
    part = curl_mime_addpart(mime);
    curl_mime_name(part, "channel");
    curl_mime_data(part, "tgchannel", CURL_ZERO_TERMINATED);
    // 多个文件：重复添加 file[] 字段；单个文件只加一个
    part = curl_mime_addpart(mime);
    curl_mime_name(part, "file[]");
    curl_mime_filedata(part, "图片1.jpg");
    part = curl_mime_addpart(mime);
    curl_mime_name(part, "file[]");
    curl_mime_filedata(part, "图片2.jpg");

    curl_easy_setopt(curl, CURLOPT_URL, "${base}/api/upload");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_MIMEPOST, mime);
    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) std::cerr << curl_easy_strerror(res) << std::endl;

    curl_mime_free(mime);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return 0;
}`,
  };
  // 链接转存请求示例（多语言）：单个链接 urls 也只写一个元素，外部调用需 Bearer 密钥
  const transferExamples = {
    Bash: `curl -X POST ${base}/api/transfer \\
  -H "Authorization: Bearer ml_你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{"urls":["https://example.com/a.jpg","https://example.com/b.mp4"],"channel":"tgchannel"}'`,
    Python: `import requests

resp = requests.post(
    "${base}/api/transfer",
    headers={"Authorization": "Bearer ml_你的密钥"},
    json={
        "urls": ["https://example.com/a.jpg", "https://example.com/b.mp4"],
        "channel": "tgchannel",
    },
)
print(resp.json())`,
    JAVA: `// 依赖 OkHttp：implementation 'com.squareup.okhttp3:okhttp:4.12.0'
import okhttp3.*;

public class TransferExample {
    public static void main(String[] args) throws Exception {
        OkHttpClient client = new OkHttpClient();
        // 单个链接：urls 只写一个元素
        String json = "{\\"urls\\":[\\"https://example.com/a.jpg\\",\\"https://example.com/b.mp4\\"],\\"channel\\":\\"tgchannel\\"}";
        Request request = new Request.Builder()
                .url("${base}/api/transfer")
                .header("Authorization", "Bearer ml_你的密钥")
                .post(RequestBody.create(json, MediaType.parse("application/json")))
                .build();
        try (Response resp = client.newCall(request).execute()) {
            System.out.println(resp.body().string());
        }
    }
}`,
    'C++': `#include <iostream>
#include <string>
#include <curl/curl.h>

// 依赖 libcurl：https://curl.se/download.html
int main() {
    CURL *curl = curl_easy_init();
    if (!curl) return 1;

    // 单个链接：urls 只写一个元素
    std::string body = "{\\"urls\\":[\\"https://example.com/a.jpg\\",\\"https://example.com/b.mp4\\"],\\"channel\\":\\"tgchannel\\"}";
    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Authorization: Bearer ml_你的密钥");
    headers = curl_slist_append(headers, "Content-Type: application/json");

    curl_easy_setopt(curl, CURLOPT_URL, "${base}/api/transfer");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) std::cerr << curl_easy_strerror(res) << std::endl;

    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    return 0;
}`,
  };

  // 折叠收纳：每次进入页面默认收起
  const [open, setOpen] = useState(false);
  const toggleOpen = () => setOpen((o) => !o);
  // 区域切换：keys=密钥管理，upload=文件上传接口，transfer=链接转存接口
  const [docTab, setDocTab] = useState('keys');

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
        {/* 区域切换按钮：密钥管理 / 文件上传接口 / 链接转存接口 */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setDocTab('keys')}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${docTab === 'keys' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-500'}`}
          >
            密钥管理
          </button>
          <button
            type="button"
            onClick={() => setDocTab('upload')}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${docTab === 'upload' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-500'}`}
          >
            文件上传接口
          </button>
          <button
            type="button"
            onClick={() => setDocTab('transfer')}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${docTab === 'transfer' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-500'}`}
          >
            链接转存接口
          </button>
        </div>

        {/* 密钥管理：创建 + 列表统一包进边框 */}
        {docTab === 'keys' && (
        <div className="mb-3 rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-700 mb-1">密钥管理</p>
          <p className="text-xs text-gray-500 mb-2">
            在线调试：<a href="/api-test.html" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">网页上传测试页 →</a>
          </p>
          {/* 窄屏时输入框占满一行，按钮换行，避免备注提示字被挤压截断 */}
          <div className="flex flex-wrap gap-2 mb-3">
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
        </div>
        )}

        {/* 文件上传接口：请求说明 + 代码示例 + 返回说明，统一一块区域 */}
        {docTab === 'upload' && (
        <div className="mb-3 rounded-lg border border-gray-200 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-semibold text-gray-700">文件上传接口</p>
          <button
            type="button"
            onClick={() => handleCopy(buildDocMarkdown('upload'))}
            className="p-1 text-gray-400 hover:text-blue-500 transition-colors shrink-0"
            title="复制本接口说明的 Markdown 文本"
          >
            <CopyIcon />
          </button>
        </div>
        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">请求说明</p>
          <MethodUrl method="POST" url={`${origin || 'https://你的域名'}/api/upload`} />

          <p className="text-xs text-gray-500 mb-1">Header 如下：</p>
          <table className="w-full text-xs border border-gray-200 rounded mb-2">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">参数</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">值</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">Authorization</td>
                <td className="px-2 py-1.5 font-mono">Bearer ml_你的密钥</td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-gray-500 mb-1">Body 中放置请求参数（form-data）：</p>
          <table className="w-full text-xs border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">参数</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">是否必选</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">类型</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">说明</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">file[]</td>
                <td className="px-2 py-1.5">是</td>
                <td className="px-2 py-1.5">file[]</td>
                <td className="px-2 py-1.5">上传的文件；单个、多个统一使用 <code className="text-gray-500">file[]</code> 数组字段，多个文件重复该字段（可混合图片/视频/音频等类型）；PHP/Java 等无法重复同名字段的语言，可用 <code className="text-gray-500">file[0]</code>、<code className="text-gray-500">file[1]</code> 索引形式代替</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">channel</td>
                <td className="px-2 py-1.5">否</td>
                <td className="px-2 py-1.5">string</td>
                <td className="px-2 py-1.5">
                  上传通道：<code className="text-gray-500">tg</code> / <code className="text-gray-500">tgchannel</code>{isAdmin ? <> / <code className="text-gray-500">r2</code></> : ''}，默认 <code className="text-gray-500">tgchannel</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mb-3">
          <p className="text-xs font-semibold text-gray-700 mb-1.5">请求代码示例</p>
          <p className="text-xs text-gray-400 mb-1.5">示例以两个文件演示；<code className="text-gray-500">file[]</code> 是字段名而非数组容器——单个文件写一个 <code className="text-gray-500">file[]</code> 字段，多个文件重复写多个 <code className="text-gray-500">file[]</code> 字段。使用前请替换密钥与文件路径。</p>
          <CodeTabs examples={uploadExamples} />
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">返回说明</p>
          <table className="w-full text-xs border border-gray-200 rounded mb-2">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">字段</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">类型</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">说明</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">success</td>
                <td className="px-2 py-1.5">boolean</td>
                <td className="px-2 py-1.5">是否上传成功</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">data</td>
                <td className="px-2 py-1.5">array[]</td>
                <td className="px-2 py-1.5">上传结果数组，多文件时含多个元素</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800 pl-5">+ url</td>
                <td className="px-2 py-1.5">string</td>
                <td className="px-2 py-1.5">文件直链</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800 pl-5">+ name</td>
                <td className="px-2 py-1.5">string</td>
                <td className="px-2 py-1.5">文件名</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">url</td>
                <td className="px-2 py-1.5">string</td>
                <td className="px-2 py-1.5">首个文件的直链（便捷字段）</td>
              </tr>
            </tbody>
          </table>
          <RespExample title="返回示例（多文件时 data 含多个元素）" code={`{
  "success": true,
  "data": [
    {
      "url": "链接1",
      "name": "文件1"
    },
    {
      "url": "链接2",
      "name": "文件2"
    }
  ],
  "url": "首个链接"
}`} />
        </div>
        </div>
        )}

        {/* 链接转存接口：独立边框（外部调用需密钥；首页同源调用免密钥） */}
        {docTab === 'transfer' && (
        <div className="mb-3 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-semibold text-gray-700">链接转存接口</p>
            <button
              type="button"
              onClick={() => handleCopy(buildDocMarkdown('transfer'))}
              className="p-1 text-gray-400 hover:text-blue-500 transition-colors shrink-0"
              title="复制本接口说明的 Markdown 文本"
            >
              <CopyIcon />
            </button>
          </div>
          <MethodUrl method="POST" url={`${base}/api/transfer`} />
          <p className="text-xs text-gray-500 mb-1">Content-Type：<code className="text-gray-800">application/json</code>；由服务器抓取源文件，不受浏览器跨域限制；单个文件大小限制随所选通道而定（TG 系通道 ≤ 50MB），链接数量不限</p>
          <p className="text-xs text-gray-500 mb-1">Header 如下：</p>
          <table className="w-full text-xs border border-gray-200 rounded mb-2">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">参数</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">值</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">Authorization</td>
                <td className="px-2 py-1.5 font-mono">Bearer ml_你的密钥</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mb-1">Body 参数（JSON；单个、多个统一使用 urls 数组）：</p>
          <table className="w-full text-xs border border-gray-200 rounded mb-2">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">参数</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">是否必选</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">类型</th>
                <th className="text-left px-2 py-1.5 font-medium text-gray-600">说明</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">urls</td>
                <td className="px-2 py-1.5">是</td>
                <td className="px-2 py-1.5">string[]</td>
                <td className="px-2 py-1.5">文件直链 http(s) URL 数组；单个、多个统一使用该数组，单个链接传一个元素，多个链接传多个元素，数量不限</td>
              </tr>
              <tr className="border-t border-gray-100">
                <td className="px-2 py-1.5 font-mono text-gray-800">channel</td>
                <td className="px-2 py-1.5">否</td>
                <td className="px-2 py-1.5">string</td>
                <td className="px-2 py-1.5"><code className="text-gray-500">tg</code> / <code className="text-gray-500">tgchannel</code>，默认 <code className="text-gray-500">tgchannel</code></td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs font-semibold text-gray-700 mb-1.5">请求代码示例</p>
          <p className="text-xs text-gray-400 mb-1.5">示例以两个链接演示；单个链接 <code className="text-gray-500">urls</code> 里只写一个元素即可。</p>
          <CodeTabs examples={transferExamples} />
          <RespExample title="返回示例（单个、多个格式完全一致；单链接时 count 为 1、results 含一个元素）" code={`{
  "success": true,
  "count": 1,
  "results": [
    {
      "url": "转存后的直链",
      "name": "文件名"
    }
  ],
  "failures": []
}`} />
          <RespExample title="多链接示例（failures 为失败明细，全部成功时为空；部分失败时 success=false）" code={`{
  "success": true,
  "count": 2,
  "results": [
    {
      "url": "直链1",
      "name": "文件1"
    },
    {
      "url": "直链2",
      "name": "文件2"
    }
  ],
  "failures": []
}`} />
        </div>
        )}

        </>)}
      </div>
    </div>
  );
}
