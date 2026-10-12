'use client'
import { signOut } from "next-auth/react"
import Table from "@/components/Table"
import { useState, useEffect, useCallback } from 'react';
import { toast } from "react-toastify";
import Link from 'next/link'
import ConfirmDialog from '@/components/ConfirmDialog';
import ApiTokens from '@/components/ApiTokens';
import { ensureUidCookie } from '@/lib/uid';
// import { toast } from "react-toastify";

// 折叠卡片标题行右侧的箭头图标
function ChevronIcon({ open }) {
  return (
    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}




export default function Admin() {
  const [listData, setListData] = useState([])
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0); // 初始化为0，因为初始时还没有搜索结果
  const [inputPage, setInputPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [channel, setChannel] = useState(''); // 上传通道筛选：'' | 'file' | 'cfile' | 'rfile'
  const [fileKind, setFileKind] = useState(''); // 文件类型筛选：'' | 'image' | 'video' | 'audio' | 'file'
  const [dateFrom, setDateFrom] = useState(''); // 上传时间范围：开始日期 YYYY-MM-DD
  const [dateTo, setDateTo] = useState(''); // 上传时间范围：结束日期 YYYY-MM-DD
  // 数量统计单位随文件类型筛选变化（不筛选时统称"个文件"）
  const KIND_UNITS = { image: '张图片', video: '个视频', audio: '个音频', file: '个文件' };
  const countUnit = KIND_UNITS[fileKind] || '个文件';
  const [pageSize, setPageSize] = useState(10); // 每页条数
  const [totalCount, setTotalCount] = useState(0); // 筛选后的记录总数
  const [selected, setSelected] = useState([]); // 多选的图片 url 列表（仅当前页）
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [r2Usage, setR2Usage] = useState(null); // R2 用量
  const [r2UsageError, setR2UsageError] = useState('');
  const [listLoading, setListLoading] = useState(true); // 列表加载中（用于骨架屏）
  // 登录角色：undefined=探测中，null=未登录，'admin'/'user'=已登录
  const [role, setRole] = useState(undefined);
  const isAdmin = role === 'admin';
  // R2 用量卡片折叠状态（默认收起，选择记忆在 localStorage）
  const [r2Open, setR2Open] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('ml_r2_open') === '1') setR2Open(true); } catch { /* 忽略 */ }
  }, []);
  const toggleR2Open = () => setR2Open((o) => {
    const n = !o;
    try { localStorage.setItem('ml_r2_open', n ? '1' : '0'); } catch { /* 忽略 */ }
    return n;
  });

  // 确保访客 uid cookie 存在（匿名管理"我的文件"依赖它），并探测登录角色
  useEffect(() => {
    ensureUidCookie();
    (async () => {
      try {
        const res = await fetch('/api/enableauthapi/isauth', { headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        setRole(data?.role || null);
      } catch {
        setRole(null);
      }
    })();
  }, []);

  const getListdata = useCallback(async (page, ch = channel, size = pageSize, k = fileKind, df = dateFrom, dt = dateTo) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/admin/list`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          page: (page - 1),
          query: searchQuery, // 传递搜索查询
          channel: ch, // 上传通道筛选
          pageSize: size, // 每页条数
          kind: k, // 文件类型筛选
          dateFrom: df, // 上传时间范围开始
          dateTo: dt, // 上传时间范围结束
        })
      })
      const res_data = await res.json()
      if (!res_data?.success) {
        toast.error(res_data.message)
      } else {
        setListData(res_data.data)
        setSearchTotal(Math.ceil(res_data.total / size));
        setTotalCount(res_data.total);
        setSelected([]); // 数据刷新后清空选择，避免选中已不存在的记录
      }

    } catch (error) {
      toast.error(error.message)
    } finally {
      setListLoading(false);
    }

  })


  useEffect(() => {
    getListdata(currentPage)
  }, [currentPage]);

  // 拉取 R2 用量（对照免费额度）：仅管理员展开卡片时才请求，已获取过不重复拉取
  useEffect(() => {
    if (!isAdmin || !r2Open) return;
    if (r2Usage || r2UsageError) return;
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/r2usage', { headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (!ignore) {
          if (data.success) setR2Usage(data);
          else setR2UsageError(data.message || '用量获取失败');
        }
      } catch {
        if (!ignore) setR2UsageError('用量获取失败');
      }
    })();
    return () => { ignore = true; };
  }, [isAdmin, r2Open, r2Usage, r2UsageError]);

  // 分页控制按钮
  const handleNextPage = () => {
    const nextPage = currentPage + 1;
    if (nextPage > searchTotal) { // 检查下一页是否在总页数范围内
      toast.error('已经是最后一页了')
    }
    if (nextPage <= searchTotal) { // 检查下一页是否在总页数范围内
      setCurrentPage(nextPage);
      setInputPage(nextPage)
    }

  };

  const handlePrevPage = () => {
    const prevPage = currentPage - 1;
    if (prevPage >= 1) { // 检查上一页是否在总页数范围内
      setCurrentPage(prevPage);
      setInputPage(prevPage)
      // searchVideo(prevPage);
    }

  };


  const handleJumpPage = () => {
    const page = parseInt(inputPage, 10);
    if (!isNaN(page) && page >= 1 && page <= searchTotal) {
      setCurrentPage(page);
    } else {
      toast.error('请输入有效的页码');
    }
    // setInputPage(""); // 清空输入框
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1);
  };

  // 切换上传通道筛选：立即从第一页刷新
  const handleChannelChange = (event) => {
    const value = event.target.value;
    setChannel(value);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, value);
  };

  // 切换每页条数：立即从第一页刷新
  const handlePageSizeChange = (event) => {
    const size = Number(event.target.value);
    setPageSize(size);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, channel, size);
  };

  // 切换文件类型筛选：立即从第一页刷新
  const handleKindChange = (event) => {
    const value = event.target.value;
    setFileKind(value);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, channel, pageSize, value);
  };

  // 切换上传时间范围（开始/结束日期）：立即从第一页刷新；setState 异步，需直接传新值
  const handleDateFromChange = (event) => {
    const value = event.target.value;
    setDateFrom(value);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, channel, pageSize, fileKind, value, dateTo);
  };

  const handleDateToChange = (event) => {
    const value = event.target.value;
    setDateTo(value);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, channel, pageSize, fileKind, dateFrom, value);
  };

  // 多选：单条切换
  const toggleSelect = (url) => {
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]));
  };

  // 全选/取消全选当前页
  const allSelected = listData.length > 0 && listData.every((item) => selected.includes(item.url));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(listData.map((item) => item.url));
    }
  };

  // 批量删除：一次请求提交全部 url，服务端用 D1 batch 在一个事务内删除
  const runBatchDelete = async () => {
    setShowBatchConfirm(false);
    if (batchDeleting || selected.length === 0) return;
    setBatchDeleting(true);
    const total = selected.length;
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: selected }),
      });
      const data = await res.json();
      const deleted = data?.deleted ?? 0;
      const failed = data?.failed ?? (data?.success ? 0 : total);
      if (failed === 0) {
        toast.success(`已删除 ${deleted} ${countUnit}`);
      } else {
        toast.error(`删除完成：成功 ${deleted} ${countUnit}，失败 ${failed} ${countUnit}`);
      }
    } catch (err) {
      toast.error(err.message || '批量删除失败');
    } finally {
      setBatchDeleting(false);
      getListdata(currentPage);
    }
  };

  return (
    <>
      <div className="overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
        <header className="fixed top-0 left-0 w-full border-b bg-white z-50">
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-0 sm:h-[50px] flex items-center justify-between gap-2">
            <Link href="/" className="text-xs sm:text-base font-medium text-gray-800 truncate hover:text-blue-600 whitespace-nowrap">
              喵链 - 图片/视频/音频的外链托管
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/">
                <button className="px-3 py-1.5 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap">主页</button>
              </Link>
              {role ? (
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="px-3 py-1.5 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap"
                >
                  登出
                </button>
              ) : (
                <Link href="/login">
                  <button className="px-3 py-1.5 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap">登录</button>
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mt-[56px] sm:mt-[60px] mb-[56px] sm:mb-[60px] w-full sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-full">

          {/* R2 用量卡片：仅管理员可见；角色探测中（undefined）也先显示骨架，
              避免等 isauth 返回后卡片才突然出现；确认非管理员后消失 */}
          {(role === undefined || isAdmin) && (<div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2">
            <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
              {/* 标题行点击折叠/展开；展开时才拉取用量数据 */}
              <button type="button" onClick={toggleR2Open} className={`w-full flex items-center justify-between ${r2Open ? 'mb-2' : ''}`}>
                <span className="text-xs sm:text-sm font-medium text-gray-700">
                  R2 用量{r2Usage ? `（${r2Usage.month} 计费月）` : ''}
                </span>
                <span className="flex items-center gap-2">
                  {r2Usage ? (
                    <span className="text-[11px] text-gray-400">{r2Usage.storage.objects} 个对象 · 出站流量免费</span>
                  ) : r2Open && !r2UsageError ? (
                    <span className="h-3 w-28 rounded bg-gray-100 animate-pulse" />
                  ) : null}
                  <ChevronIcon open={r2Open} />
                </span>
              </button>
              {r2Open && (r2UsageError ? (
                <p className="text-xs text-amber-600">{r2UsageError}</p>
              ) : !r2Usage ? (
                <div className="space-y-1.5">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 h-4 animate-pulse">
                      <span className="w-36 sm:w-44 shrink-0 h-3 rounded bg-gray-100" />
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden" />
                      <span className="w-32 sm:w-40 shrink-0 h-3 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {[
                    { label: '存储', used: r2Usage.storage.used, limit: r2Usage.storage.limit, fmt: (n) => `${(n / 1024 ** 3).toFixed(2)} GB` },
                    { label: 'A类操作（写入/列举/删除）', used: r2Usage.classA.used, limit: r2Usage.classA.limit, fmt: (n) => n.toLocaleString() },
                    { label: 'B类操作（读取）', used: r2Usage.classB.used, limit: r2Usage.classB.limit, fmt: (n) => n.toLocaleString() },
                  ].map((row) => {
                    const pct = Math.min(100, row.used / row.limit * 100);
                    const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="w-36 sm:w-44 shrink-0 text-[11px] sm:text-xs text-gray-500 truncate">{row.label}</span>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
                        </div>
                        <span className="w-32 sm:w-40 shrink-0 text-right text-[11px] sm:text-xs text-gray-600 whitespace-nowrap">
                          {row.fmt(row.used)} / {row.fmt(row.limit)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>)}

          {/* API 密钥管理：管理员和访客均可用（权限分级，数据按 uid 隔离） */}
          <ApiTokens />

          {/* 筛选行 1：URL 搜索 */}
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded px-2 text-sm flex-1 min-w-0 h-[34px]"
                placeholder="输入 URL"
              />
              <button type="submit" className="text-white px-4 text-sm whitespace-nowrap rounded border border-transparent h-[34px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-teal-500 hover:to-emerald-500 transition-all">
                搜索
              </button>
            </form>
          </div>

          {/* 筛选行 2：接口 + 类型，选择即刷新 */}
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2 flex flex-wrap items-center gap-2">
            <select
              value={channel}
              onChange={handleChannelChange}
              className="border rounded px-1.5 text-sm bg-white shrink-0 h-[34px]"
              title="按上传接口筛选"
            >
              <option value="">全部接口</option>
              <option value="file">TG.ph</option>
              <option value="cfile">TG_Channel</option>
              <option value="rfile">R2</option>
            </select>
            <select
              value={fileKind}
              onChange={handleKindChange}
              className="border rounded px-1.5 text-sm bg-white shrink-0 h-[34px]"
              title="按文件类型筛选"
            >
              <option value="">全部类型</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="audio">音频</option>
              <option value="file">文件</option>
            </select>
          </div>

          {/* 筛选行 3：上传时间范围，选择即刷新 */}
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 shrink-0">上传时间</span>
            <input
              type="date"
              value={dateFrom}
              onChange={handleDateFromChange}
              className="border rounded px-1.5 text-sm bg-white h-[34px] w-[135px]"
              title="开始日期"
            />
            <span className="text-xs text-gray-400 shrink-0">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={handleDateToChange}
              className="border rounded px-1.5 text-sm bg-white h-[34px] w-[135px]"
              title="结束日期"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                  setCurrentPage(1);
                  setInputPage(1);
                  getListdata(1, channel, pageSize, fileKind, '', '');
                }}
                className="text-xs text-gray-500 border border-gray-300 rounded px-2 h-[34px] bg-white hover:bg-gray-50 transition-colors shrink-0"
                title="清除上传时间筛选"
              >
                清除筛选
              </button>
            )}
          </div>

          {/* 工具栏：全选 + 已选数量 + 批量删除 */}
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-blue-600 cursor-pointer"
              />
              全选
            </label>
            <span className="flex-1 min-w-0 truncate text-xs sm:text-sm text-gray-400">
              {listLoading ? (
                <span className="inline-block h-3 w-20 rounded bg-gray-100 animate-pulse align-middle" />
              ) : selected.length > 0 ? `已选 ${selected.length} 项` : `共 ${totalCount} ${countUnit}`}
            </span>
            <button
              onClick={() => setShowBatchConfirm(true)}
              disabled={selected.length === 0 || batchDeleting}
              className="shrink-0 px-3 py-1 text-xs sm:text-sm rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-500 whitespace-nowrap transition-colors"
            >
              {batchDeleting ? '正在删除…' : `批量删除${selected.length > 0 ? `(${selected.length})` : ''}`}
            </button>
          </div>

          <Table data={listData} selected={selected} onToggle={toggleSelect} isAdmin={isAdmin} />

        </main>
        <div className="fixed inset-x-0 bottom-0 w-full flex z-50 justify-center items-center bg-white border-t">
          <div className="pagination py-2 px-2 flex justify-center items-center gap-2 sm:gap-5">
            <button
              className="text-xs sm:text-sm px-2 py-1.5 sm:p-2 bg-blue-500 hover:bg-indigo-500 text-white rounded disabled:opacity-40 whitespace-nowrap"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              上一页
            </button>
            <span className="text-xs sm:text-sm whitespace-nowrap">第 {`${currentPage}/${searchTotal}`} 页</span>
            <button
              className="text-xs sm:text-sm px-2 py-1.5 sm:p-2 bg-blue-500 hover:bg-indigo-500 text-white rounded whitespace-nowrap"
              onClick={handleNextPage}
            >
              下一页
            </button>
            <div className="flex items-center gap-1 sm:gap-2">
              <input
                type="number"
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                className="border rounded px-1 py-1.5 sm:p-2 w-12 sm:w-20 text-sm text-center"
                placeholder="页码"
              />
              <button
                className="text-xs sm:text-sm px-2 py-1.5 sm:p-2 bg-blue-500 hover:bg-indigo-500 text-white rounded whitespace-nowrap"
                onClick={handleJumpPage}
              >
                跳转
              </button>
            </div>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              className="border rounded px-1 py-1.5 sm:p-2 text-xs sm:text-sm bg-white"
              title="每页展示数量"
            >
              <option value={10}>10 条/页</option>
              <option value={20}>20 条/页</option>
              <option value={50}>50 条/页</option>
              <option value={100}>100 条/页</option>
            </select>
          </div>
        </div>

        <ConfirmDialog
          open={showBatchConfirm}
          title={`删除选中的 ${selected.length} ${countUnit}？`}
          message="将删除所有选中记录，删除后不可恢复。"
          confirmText={batchDeleting ? '正在删除…' : '删除'}
          loading={batchDeleting}
          onConfirm={runBatchDelete}
          onCancel={() => setShowBatchConfirm(false)}
        />
      </div>
    </>

  )
}