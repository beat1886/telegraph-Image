"use client";
import { useState, useRef, useEffect } from "react";
import { faImages, faTrashAlt, faUpload, faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { toast } from "react-toastify";
import LoadingOverlay from "@/components/LoadingOverlay";
import Footer from "@/components/Footer";
import { ensureUidCookie } from "@/lib/uid";

// 链接行的独立复制按钮：仅复制成功才显示"已复制"反馈，1.5s 后自动恢复；每个按钮状态互相独立。
// 反馈直接操作按钮 DOM（不依赖重渲染），保证任何环境下点击后即时可见

// 部分视频/音频格式（如 mkv/flv/rmvb）在系统文件选择器中 MIME 为空，
// 只靠 file.type 会误判成普通文件导致无法预览；按扩展名兜底判断媒体大类
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'svg', 'ico', 'heic', 'heif'];
const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ogg', 'ogv', 'm4v', '3gp', '3g2', 'mpg', 'mpeg', 'mxf', 'vob', 'rmvb', 'rm', 'ts'];
const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'oga', 'opus', 'wma', 'aiff', 'ape', 'mid', 'midi'];
const getLocalKind = (file) => {
  const t = file?.type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  const ext = (file?.name?.split('.').pop() || '').toLowerCase();
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  return 'other';
};
function CopyButton({ text, label = '复制', compact = true }) {
  const btnRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const flashCopied = () => {
    const btn = btnRef.current;
    if (!btn) return;
    btn.classList.remove('bg-white', 'border-gray-300', 'text-gray-600', 'hover:bg-gray-100');
    btn.classList.add('bg-green-500', 'border-green-500', 'text-white');
    const span = btn.querySelector('span');
    if (span) span.textContent = '已复制';
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const b = btnRef.current;
      if (!b) return;
      b.classList.add('bg-white', 'border-gray-300', 'text-gray-600', 'hover:bg-gray-100');
      b.classList.remove('bg-green-500', 'border-green-500', 'text-white');
      const s = b.querySelector('span');
      if (s) s.textContent = label;
    }, 1500);
  };

  // clipboard API 不可用或被拒（非安全上下文/权限策略）时回退到 execCommand
  const fallbackCopy = (value) => {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  };
  const handleClick = async (e) => {
    e.stopPropagation();
    let ok = false;
    // 某些环境（权限策略/自动化）writeText 的 Promise 会一直挂起，1.5s 超时立即走降级
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 1500)),
        ]);
        ok = true;
      } catch (err) {
        ok = false;
      }
    }
    // clipboard API 不存在、被拒或超时时回退到 execCommand
    if (!ok) ok = fallbackCopy(text);
    if (ok) {
      flashCopied();
    } else {
      toast.error('复制失败，请重试');
    }
  };
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      title={label}
      className="shrink-0 flex items-center justify-center gap-1 px-2 h-[34px] rounded-lg border text-xs whitespace-nowrap transition-colors bg-white border-gray-300 text-gray-600 hover:bg-gray-100"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      {!compact && <span>{label}</span>}
    </button>
  );
}

export default function HomePage({ initialRole, authButton }) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedImages, setUploadedImages] = useState([]);
  // 上传结果持久化到 sessionStorage：切到管理页再回来时记录不丢失（仅当前标签页会话）
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('ml_results') || '[]');
      if (Array.isArray(saved) && saved.length > 0) setUploadedImages(saved);
    } catch (e) { /* 忽略损坏的缓存 */ }
    restoredRef.current = true;
  }, []);
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      sessionStorage.setItem('ml_results', JSON.stringify(
        uploadedImages.map(({ url, name, type }) => ({ url, name, type }))
      ));
    } catch (e) { /* 存储满时静默失败 */ }
  }, [uploadedImages]);
  const [uploadedFilesNum, setUploadedFilesNum] = useState(0);
  const [selectedImage, setSelectedImage] = useState(null);
  const [activeTab, setActiveTab] = useState('preview');
  const [uploading, setUploading] = useState(false);
  const [IP, setIP] = useState('');
  const [selectedOption, setSelectedOption] = useState('tg');
  // 链接转存输入与进行中状态
  const [transferUrl, setTransferUrl] = useState('');
  const [transferring, setTransferring] = useState(false);
  // 以 File 对象为键缓存预览 URL，保证同一文件多次渲染时 blob 地址稳定，
  // 避免在渲染中反复 createObjectURL 导致缩略图不断重载而空白
  const previewUrlsRef = useRef(new WeakMap());
  // 弹窗视频元素引用与解码失败提示标记（每次打开弹窗重置，避免重复/漏提示）
  const boxVideoRef = useRef(null);
  const videoErrNotifiedRef = useRef(false);
  const getPreviewUrl = (file) => {
    // 恢复的历史记录是普通对象而非 File/Blob，无法 createObjectURL，直接用远程 URL
    if (!file || !(file instanceof Blob)) return null;
    let url = previewUrlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      previewUrlsRef.current.set(file, url);
    }
    return url;
  };
  const revokePreviewUrl = (file) => {
    const url = previewUrlsRef.current.get(file);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(file);
    }
  };
  // 初始登录态由服务端组件通过 initialRole 注入，首屏即正确，不闪不等
  const [isAuthapi, setisAuthapi] = useState(!!initialRole);
  const [Loginuser, setLoginuser] = useState(initialRole || '');
  const [boxType, setBoxtype] = useState("img");

  let headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0, Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
  };

  useEffect(() => {
    ensureUidCookie(); // 访客标识：上传记录归属"我的文件"
    ip();
    isAuth();
  }, []);

  const ip = async () => {
    try {
      const res = await fetch(`/api/ip`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setIP(data.ip);
    } catch (error) {
      console.error('请求出错:', error);
    }
  };

  const isAuth = async () => {
    try {
      const res = await fetch(`/api/enableauthapi/isauth`, {
        method: "GET",
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        const data = await res.json();
        setisAuthapi(true);
        setLoginuser(data.role);
        // 非 admin 用户：如果之前选择了 r2，则回退到 tg
        if (data.role !== 'admin') {
          setSelectedOption((prev) => (prev === "r2" ? "tg" : prev));
        }
      } else {
        setisAuthapi(false);
        // 未登录：保留用户可能选择的 tgchannel，仅将 r2 回退为 tg
        setSelectedOption((prev) => (prev === "r2" ? "tg" : prev));
      }
    } catch (error) {
      console.error('请求出错:', error);
    }
    // 初始状态已由服务端注入，这里仅做客户端刷新校正
  };

  const handleFileChange = (event) => {
    const newFiles = event.target.files;
    // 仅对当前待传列表去重；已上传过的同名文件允许再次选择、重复上传
    const filteredFiles = Array.from(newFiles).filter(file =>
      !selectedFiles.find(selFile => selFile.name === file.name));
    setSelectedFiles([...selectedFiles, ...filteredFiles]);
  };

  const handleClear = () => {
    selectedFiles.forEach(revokePreviewUrl);
    setSelectedFiles([]);
  };

  const handleClearResults = () => {
    uploadedImages.forEach(revokePreviewUrl);
    setUploadedImages([]);
    setActiveTab('preview');
  };

  const getTotalSizeInMB = (files) => {
    const totalSizeInBytes = Array.from(files).reduce((acc, file) => acc + file.size, 0);
    return (totalSizeInBytes / (1024 * 1024)).toFixed(2);
  };

  // R2 预签名直传：取签名 -> 直传 R2 -> 回调入库。成功返回 true
  const uploadR2Direct = async (file) => {
    const MAX = 2 * 1024 * 1024 * 1024; // 2GB，与后端一致
    if (file.size > MAX) {
      toast.error(`${file.name} 超过 2GB 上限`);
      return false;
    }
    try {
      // 1) 取预签名 URL
      const signRes = await fetch('/api/enableauthapi/r2presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      });
      const signData = await signRes.json();
      if (!signRes.ok || !signData.uploadUrl) {
        toast.error(signData.message || '获取上传凭证失败');
        return false;
      }

      // 2) 浏览器直传 R2（大文件 10 分钟超时）
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 600000);
      const putRes = await fetch(signData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!putRes.ok) {
        toast.error(`${file.name} 直传 R2 失败（HTTP ${putRes.status}）`);
        return false;
      }

      // 3) 回调入库
      const doneRes = await fetch('/api/enableauthapi/r2complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: signData.key, filename: file.name, contentType: file.type, size: file.size }),
      });
      const doneData = await doneRes.json();
      if (!doneRes.ok || !doneData.url) {
        toast.error(`${file.name} 已上传但记录失败：${doneData.message || doneRes.status}`);
        return false;
      }

      file.url = doneData.url;
      setUploadedImages((prev) => [...prev, file]);
      setSelectedFiles((prev) => prev.filter((f) => f !== file));
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        toast.error(`${file.name} 上传超时（10 分钟）`);
      } else {
        toast.error(`${file.name} 上传失败：${err.message}`);
      }
      return false;
    }
  };

  const handleUpload = async (file = null) => {
    setUploading(true);
    const filesToUpload = file ? [file] : selectedFiles;

    if (filesToUpload.length === 0) {
      toast.error('请选择要上传的文件');
      setUploading(false);
      return;
    }

    const formFieldName = selectedOption === "tencent" ? "media" : "file";
    let successCount = 0;

    try {
      for (const file of filesToUpload) {
        // R2 走预签名直传：取签名 URL -> 浏览器直传 R2 -> 回调入库（支持 >100MB 大文件）
        if (selectedOption === "r2") {
          const ok = await uploadR2Direct(file);
          if (ok) successCount++;
          continue;
        }

        const formData = new FormData();
        formData.append(formFieldName, file);

        // 关键修改：只有 r2 走认证接口，tgchannel 走公开接口
        const targetUrl = selectedOption === "r2"
          ? `/api/enableauthapi/r2`
          : `/api/${selectedOption}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        let response;
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
            headers: headers,
            signal: controller.signal
          });
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            toast.error(`上传 ${file.name} 超时（60秒无响应），请检查网络或稍后重试`);
          } else {
            toast.error(`上传 ${file.name} 网络错误: ${fetchErr.message}`);
          }
          continue;
        }
        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          file.url = result.url;
          setUploadedImages((prevImages) => [...prevImages, file]);
          setSelectedFiles((prevFiles) => prevFiles.filter(f => f !== file));
          successCount++;
        } else {
          let errorMsg = "上传失败";
          try {
            const errorData = await response.json();
            errorMsg = errorData.message || `上传 ${file.name} 时出错`;
          } catch {}
          toast.error(`上传 ${file.name} 时出错: ${errorMsg}`);
        }
      }
      toast.success(`已成功上传 ${successCount} 个文件`);
    } catch (error) {
      toast.error('上传失败，请稍后重试');
    } finally {
      setUploading(false);
    }
  };

  // 链接转存：服务端抓取外部链接文件并上传（不受浏览器跨域限制），结果进入结果区
  // 支持一次粘贴多个链接（换行或空格分隔）
  const handleTransfer = async () => {
    const urls = transferUrl.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      toast.error('请粘贴要转存的文件链接');
      return;
    }
    setTransferring(true);
    try {
      const payload = { channel: selectedOption === 'tg' ? 'tg' : 'tgchannel' };
      if (urls.length === 1) payload.url = urls[0];
      else payload.urls = urls;
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      // 单个与多个返回格式不同：单个 {url,name}；多个 {results:[{url,name}], failures:[]}
      const okItems = urls.length === 1
        ? (res.ok && data?.url ? [data] : [])
        : (Array.isArray(data?.results) ? data.results : []);
      if (okItems.length > 0) {
        setUploadedImages((prev) => [
          ...prev,
          ...okItems.map((it) => ({ url: it.url, name: it.name, type: '' })),
        ]);
        setTransferUrl('');
      }
      if (!res.ok || okItems.length === 0) {
        const failMsgs = Array.isArray(data?.failures) && data.failures.length > 0
          ? data.failures.slice(0, 3).map((f) => f.message).join('；')
          : (data?.message || '转存失败');
        toast.error(okItems.length > 0
          ? `成功 ${okItems.length} 个，失败提示：${failMsgs}`
          : failMsgs);
        return;
      }
      toast.success(urls.length === 1 ? '转存成功' : `已转存 ${okItems.length} 个链接`);
    } catch (e) {
      toast.error(`转存失败：${e.message}`);
    } finally {
      setTransferring(false);
    }
  };

  const handlePaste = (event) => {
    const clipboardItems = event.clipboardData.items;
    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          setSelectedFiles([...selectedFiles, file]);
          break;
        }
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const filteredFiles = Array.from(files).filter(file => !selectedFiles.find(selFile => selFile.name === file.name));
      setSelectedFiles([...selectedFiles, ...filteredFiles]);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const calculateMinHeight = () => {
    const perRow = typeof window !== 'undefined' && window.innerWidth >= 640 ? 4 : 2;
    const rows = Math.ceil(selectedFiles.length / perRow);
    return `${rows * 210 + 24}px`;
  };

  const handleImageClick = (index) => {
    const file = selectedFiles[index];
    const kind = getLocalKind(file);
    videoErrNotifiedRef.current = false;
    if (kind === 'image') {
      setBoxtype("img");
      setSelectedImage(getPreviewUrl(file));
    } else if (kind === 'video') {
      setBoxtype("video");
      setSelectedImage(getPreviewUrl(file));
    } else if (kind === 'audio') {
      setBoxtype("audio");
      setSelectedImage(getPreviewUrl(file));
    } else {
      setBoxtype("other");
      setSelectedImage("other");
    }
  };

  const handleCloseImage = () => {
    setSelectedImage(null);
  };

  const handleRemoveImage = (index) => {
    revokePreviewUrl(selectedFiles[index]);
    const updatedFiles = selectedFiles.filter((_, idx) => idx !== index);
    setSelectedFiles(updatedFiles);
  };

  // 链接行内联反馈状态：{ [key]: true } 表示该行刚复制成功，1.5s 后自动清除
  const [copiedMap, setCopiedMap] = useState({});
  const copyTimerRef = useRef({});
  useEffect(() => () => Object.values(copyTimerRef.current).forEach(clearTimeout), []);

  const handleCopyLine = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('链接已复制');
      setCopiedMap((m) => ({ ...m, [key]: true }));
      clearTimeout(copyTimerRef.current[key]);
      copyTimerRef.current[key] = setTimeout(() => {
        setCopiedMap((m) => {
          const n = { ...m };
          delete n[key];
          return n;
        });
      }, 1500);
    } catch (err) {
      toast.error('复制失败，请重试');
    }
  };

  const handlerenderImageClick = (imageUrl, type) => {
    videoErrNotifiedRef.current = false;
    setBoxtype(type);
    setSelectedImage(imageUrl);
  };

  const renderFile = (data, index) => {
    const fileUrl = data.url;
    const kind = getLocalKind(data);
    const isImage = kind === 'image';
    const isVideo = kind === 'video';
    const isAudio = kind === 'audio';
    // 图片优先用本地已生成的 blob 预览，上传完成后立即显示，不必回源拉取；
    // blob 失效（如清除选区）时 onError 自动回退到远程 URL
    const localUrl = isImage ? getPreviewUrl(data) : null;
    if (isVideo) {
      // 视频：卡片内直接在线播放（响应头已支持 Range，可拖动进度）
      return (
        <video
          key={`video-${index}`}
          src={fileUrl}
          controls
          preload="metadata"
          className="w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg bg-black object-contain"
        />
      );
    }
    if (isAudio) {
      // 音频：紧凑播放器卡片
      return (
        <div
          key={`audio-${index}`}
          className="w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg bg-slate-100 flex flex-col items-center justify-center p-2 text-slate-600"
        >
          <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <audio src={fileUrl} controls preload="none" className="w-full h-8" />
          <p className="text-[11px] text-center break-all line-clamp-2 leading-tight mt-1">{data.name || '音频'}</p>
        </div>
      );
    }
    if (!isImage) {
      // 非图片文件：显示文件类型图标 + 文件名，点击打开原文件
      return (
        <a
          key={`file-${index}`}
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="object-cover w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg bg-slate-100 flex flex-col items-center justify-center p-2 text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p className="text-[11px] text-center break-all line-clamp-3 leading-tight">{data.name || '文件'}</p>
        </a>
      );
    }
    return (
      <img
        key={`image-${index}`}
        src={localUrl || fileUrl}
        alt={`Uploaded ${index}`}
        loading="lazy"
        className="object-cover w-28 h-28 sm:w-36 sm:h-40 m-2 self-center rounded-lg cursor-pointer"
        onClick={() => handlerenderImageClick(fileUrl, isImage ? "img" : "other")}
        onError={(e) => {
          if (localUrl && e.currentTarget.src !== fileUrl) {
            e.currentTarget.src = fileUrl;
          }
        }}
      />
    );
  };

  // HTML/Markdown/BBCode/Links 四个标签共用：整行可点复制，行内图标/已复制反馈，顶部可复制全部
  const renderCodeLinks = (format) => {
    const lines = uploadedImages.map((data) => {
      if (format === 'html') return `<img src="${data.url}" alt="${data.name}" />`;
      if (format === 'markdown') return `![${data.name}](${data.url})`;
      if (format === 'bbcode') return `[img]${data.url}[/img]`;
      return `${data.url}`;
    });
    return (
      <div className="p-4 bg-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400">共 {lines.length} 条</span>
          <CopyButton text={lines.join('\n')} label="复制全部" compact={false} />
        </div>
        {lines.map((line, index) => {
          const key = `${format}-${index}`;
          const copied = !!copiedMap[key];
          return (
            <div
              key={index}
              onClick={() => handleCopyLine(line, key)}
              className="group mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <code className="flex-1 min-w-0 break-all text-xs sm:text-sm text-gray-600">{line}</code>
              {copied ? (
                <span className="text-xs text-green-500 shrink-0">已复制</span>
              ) : (
                <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'preview':
        return (
          <div className="flex flex-col">
            <div className="flex items-center justify-between m-1 sm:m-2">
              <span className="text-xs text-gray-400">共 {uploadedImages.length} 条</span>
              <CopyButton
                text={uploadedImages.map((data) => data.url).join('\n')}
                label="复制全部"
                compact={false}
              />
            </div>
            {uploadedImages.map((data, index) => (
              <div key={index} className="m-1 sm:m-2 rounded-2xl ring-offset-2 ring-2 ring-slate-100 flex flex-col sm:flex-row">
                {renderFile(data, index)}
                <div className="flex flex-col justify-center w-full sm:w-4/5 p-2 sm:p-0">
                  {[
                    { label: '直链', text: data.url },
                    { label: 'Markdown', text: `![${data.name}](${data.url})` },
                    { label: 'HTML', text: `<a href="${data.url}" target="_blank"><img src="${data.url}"></a>` },
                    { label: 'BBCode', text: `[img]${data.url}[/img]` },
                  ].map((item, i) => {
                    const key = `${index}-${i}`;
                    const copied = !!copiedMap[key];
                    return (
                      <div key={`input-${i}`} className="my-1 w-full">
                        <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                        <div
                          onClick={() => handleCopyLine(item.text, key)}
                          className="group flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                        >
                          <code className="flex-1 min-w-0 truncate text-xs text-gray-600" title={item.text}>
                            {item.text}
                          </code>
                          {copied ? (
                            <span className="text-xs text-green-500 shrink-0">已复制</span>
                          ) : (
                            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      case 'htmlLinks':
        return renderCodeLinks('html');
      case 'markdownLinks':
        return renderCodeLinks('markdown');
      case 'bbcodeLinks':
        return renderCodeLinks('bbcode');
      case 'viewLinks':
        return renderCodeLinks('links');
      default:
        return null;
    }
  };

  const handleSelectChange = (e) => {
    setSelectedOption(e.target.value);
  };

  return (
    <main className="overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
      <header className="fixed top-0 h-[50px] left-0 w-full border-b bg-white flex z-50 justify-center items-center">
        <div className="flex justify-between items-center w-full max-w-4xl px-3 sm:px-4">
          <nav className="text-xs sm:text-base font-medium whitespace-nowrap">喵链 - 图片/视频/音频的外链托管</nav>
          {authButton}
        </div>
      </header>
      <div className="mt-[60px] w-[92%] sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-2/3">
        {/* 上传接口：文件上传与链接转存共用 */}
        <div className="flex flex-row items-center justify-end gap-2 mb-3">
          <span className="text-sm sm:text-base md:text-sm lg:text-xl xl:text-xl 2xl:text-xl whitespace-nowrap">上传接口：</span>
          <select
            value={selectedOption}
            onChange={handleSelectChange}
            className="text-xs sm:text-base md:text-sm lg:text-xl p-2 border rounded flex-1 min-w-0 sm:flex-none sm:w-72 lg:w-80 text-left pl-3"
          >
            <option value="tg">TG.ph（telegra.ph｜临时｜图片/视频｜≤15MB）</option>
            <option value="tgchannel">TG_Channel（Telegram｜长期｜图片≤10MB/其他文件≤50MB）</option>
            {isAuthapi && Loginuser === "admin" && <option value="r2">R2（Cloudflare｜长期｜任意文件｜≤2GB）</option>}
          </select>
        </div>

        {/* 文件上传区域 */}
        <section className="border border-gray-200 rounded-lg p-3 mb-4">
          <div className="text-gray-800 text-sm sm:text-base font-medium mb-2">文件上传</div>
        <div
          className="border-2 border-dashed border-slate-400 rounded-md relative"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onPaste={handlePaste}
          style={{ minHeight: calculateMinHeight() }}
        >
          <div className="flex flex-wrap gap-3 min-h-[240px] justify-center sm:justify-start p-2">
            <LoadingOverlay loading={uploading} />
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative rounded-2xl w-36 h-44 sm:w-44 sm:h-48 ring-offset-2 ring-2 flex flex-col items-center">
                <div className="relative w-28 h-28 sm:w-36 sm:h-36" onClick={() => handleImageClick(index)}>
                  {getLocalKind(file) === 'image' ? (
                    <img
                      src={getPreviewUrl(file)}
                      alt={`Preview ${file.name}`}
                      className="w-full h-full object-cover rounded-lg cursor-pointer"
                    />
                  ) : getLocalKind(file) === 'video' ? (
                    <video
                      src={getPreviewUrl(file)}
                      muted
                      preload="metadata"
                      className="w-full h-full object-cover rounded-lg cursor-pointer bg-black"
                    />
                  ) : getLocalKind(file) === 'audio' ? (
                    <div className="flex flex-col items-center justify-center w-full h-full bg-slate-100 text-slate-500 rounded-lg cursor-pointer p-1">
                      <svg className="w-8 h-8 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                      <p className="text-xs text-center break-all line-clamp-2">{file.name}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-gray-200 text-gray-700 p-1">
                      <p className="text-xs text-center break-all line-clamp-3">{file.name}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-row items-center justify-center w-full mt-2 sm:mt-3 gap-2 sm:gap-0">
                  <button
                    className="bg-blue-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleImageClick(index)}
                    aria-label="预览"
                  >
                    <FontAwesomeIcon icon={faSearchPlus} className="text-xs sm:text-[13px]" />
                  </button>
                  <button
                    className="bg-red-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleRemoveImage(index)}
                    aria-label="删除"
                  >
                    <FontAwesomeIcon icon={faTrashAlt} className="text-xs sm:text-[13px]" />
                  </button>
                  <button
                    className="bg-green-500 text-white rounded-full w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center cursor-pointer sm:mx-2 active:opacity-70"
                    onClick={() => handleUpload(file)}
                    aria-label="上传"
                  >
                    <FontAwesomeIcon icon={faUpload} className="text-xs sm:text-[13px]" />
                  </button>
                </div>
              </div>
            ))}
            {selectedFiles.length === 0 && (
              <div className="absolute -z-10 left-0 top-0 w-full h-full flex items-center justify-center">
                <div className="text-gray-500">
                  拖拽文件到这里或将文件复制并粘贴到此处上传
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="w-full rounded-md shadow-sm overflow-hidden mt-4 grid grid-cols-8 text-sm select-none">
          <div className="md:col-span-1 col-span-3">
            <label
              htmlFor="file-upload"
              className="w-full h-10 bg-blue-500 cursor-pointer flex items-center justify-center text-white text-xs sm:text-sm"
            >
              <FontAwesomeIcon icon={faImages} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              选择文件
            </label>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              onClick={(e) => { e.target.value = ''; }}
              multiple
            />
          </div>
          <div className="md:col-span-5 col-span-5">
            <div className="w-full h-10 bg-slate-200 flex items-center px-2 sm:px-4 text-xs sm:text-sm justify-center md:justify-start truncate">
              已选择 {selectedFiles.length} 个，共 {getTotalSizeInMB(selectedFiles)} M
            </div>
          </div>
          <div className="md:col-span-1 col-span-3">
            <div
              className="w-full bg-red-500 cursor-pointer h-10 flex items-center justify-center text-white text-xs sm:text-sm"
              onClick={handleClear}
            >
              <FontAwesomeIcon icon={faTrashAlt} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              清除
            </div>
          </div>
          <div className="md:col-span-1 col-span-5">
            <div
              className={`w-full bg-green-500 cursor-pointer h-10 flex items-center justify-center text-white text-xs sm:text-sm ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              onClick={() => handleUpload()}
            >
              <FontAwesomeIcon icon={faUpload} className="mr-1 sm:mr-2 text-xs sm:text-sm" />
              上传
            </div>
          </div>
        </div>
        </section>

        {/* 链接转存区域：服务端抓取外部链接文件，不受浏览器跨域限制 */}
        <section className="border border-gray-200 rounded-lg p-3 mb-4">
          <div className="text-gray-800 text-sm sm:text-base font-medium mb-1">链接转存</div>
          <p className="text-xs text-gray-500 mb-2">粘贴网上文件直链，转存为本站直链（使用上方上传接口）；支持多个链接，每行一个</p>
          <div className="w-full flex gap-2 items-start">
            <textarea
              value={transferUrl}
              onChange={(e) => setTransferUrl(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd+Enter 提交；普通回车保留换行
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTransfer();
              }}
              rows={2}
              placeholder={'https://…/a.jpg\nhttps://…/b.mp4'}
              className="flex-1 min-w-0 min-h-[40px] py-2 border border-gray-300 rounded px-3 text-xs sm:text-sm focus:outline-none focus:border-blue-500 resize-y break-all"
            />
            <button
              onClick={handleTransfer}
              disabled={transferring}
              className="h-10 px-4 bg-blue-500 text-white rounded text-xs sm:text-sm whitespace-nowrap hover:bg-blue-600 disabled:opacity-50"
            >
              {transferring ? '转存中…' : '转存'}
            </button>
          </div>
        </section>

        {uploadedImages.length > 0 && (
          <div className="w-full mt-4 min-h-[200px] mb-[60px]">
            <div className="flex items-center justify-between gap-2 mb-4 border-b border-gray-300 pb-1">
              <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible">
                <button onClick={() => setActiveTab('preview')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'preview' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Preview</button>
                <button onClick={() => setActiveTab('htmlLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'htmlLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>HTML</button>
                <button onClick={() => setActiveTab('markdownLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'markdownLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Markdown</button>
                <button onClick={() => setActiveTab('bbcodeLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'bbcodeLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>BBCode</button>
                <button onClick={() => setActiveTab('viewLinks')} className={`px-3 sm:px-4 py-2 text-sm whitespace-nowrap shrink-0 ${activeTab === 'viewLinks' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>Links</button>
              </div>
              <button
                onClick={handleClearResults}
                className="shrink-0 px-3 py-2 text-sm whitespace-nowrap text-red-600 border border-red-300 rounded hover:bg-red-500 hover:text-white transition-colors"
              >
                清空结果
              </button>
            </div>
            {renderTabContent()}
          </div>
        )}
      </div>
      
      <Footer />

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleCloseImage}>
          {/* 内容区拦截冒泡：点击视频四周空白不再误触遮罩关闭，只有点遮罩空白才关闭 */}
          <div className="relative flex flex-col items-center justify-between max-w-full" onClick={(e) => e.stopPropagation()}>
            <button
              className="absolute -top-2 -right-2 sm:top-2 sm:right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
              onClick={handleCloseImage}
            >
              &times;
            </button>
            {boxType === "img" ? (
              <img
                src={selectedImage}
                alt="Selected"
                className="object-contain w-[92%] sm:w-9/10 max-h-[85vh] h-auto rounded-lg"
              />
            ) : boxType === "video" ? (
              <video
                src={selectedImage}
                controls
                autoPlay
                playsInline
                className="w-[92%] sm:w-9/10 max-h-[85vh] rounded-lg bg-black"
                // preventDefault 拦截 Chromium 的 click-to-toggle：点播放按钮时同一 click
                // 会被再当作画面点击而立即暂停，导致"点播放直接暂停"
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onError={() => {
                  // 编码不受支持（如 HEVC）时给出明确提示，而不是停留在无响应画面
                  const v = boxVideoRef.current;
                  if (v?.error && !videoErrNotifiedRef.current) {
                    videoErrNotifiedRef.current = true;
                    toast.error('该视频编码浏览器无法解码，请转换成 H.264 mp4 后再试');
                  }
                }}
                ref={boxVideoRef}
              />
            ) : boxType === "audio" ? (
              <div className="p-6 bg-white rounded-lg w-[92%] max-w-md" onClick={(e) => e.stopPropagation()}>
                <audio src={selectedImage} controls autoPlay className="w-full" />
              </div>
            ) : (
              <div className="p-4 bg-white text-black rounded">
                <p>不支持的文件类型</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
