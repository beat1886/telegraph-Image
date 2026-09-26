'use client'
import { signOut } from "next-auth/react"
import Table from "@/components/Table"
import { useState, useEffect, useCallback } from 'react';
import { toast } from "react-toastify";
import Link from 'next/link'
import ConfirmDialog from '@/components/ConfirmDialog';
// import { toast } from "react-toastify";




export default function Admin() {
  const [listData, setListData] = useState([])
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0); // 初始化为0，因为初始时还没有搜索结果
  const [inputPage, setInputPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [channel, setChannel] = useState(''); // 上传通道筛选：'' | 'file' | 'cfile' | 'rfile'
  // 清理失效图片的弹窗状态：null=未开始；running/done/error 三态
  const [cleanState, setCleanState] = useState(null);
  const [showCleanConfirm, setShowCleanConfirm] = useState(false);

  // 一键清空失效图片：分批检测所有记录的源文件，删除确认 404 的
  const runCleanInvalid = async () => {
    if (cleanState) return;
    setCleanState({ phase: 'running', total: 0, processed: 0, deleted: 0 });
    try {
      let offset = 0;
      let initialTotal = 0;
      let processed = 0;
      let totalDeleted = 0;
      let rounds = 0;
      while (rounds < 500) {
        const res = await fetch('/api/admin/cleaninvalid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        });
        const data = await res.json();
        if (!data?.success) {
          setCleanState({ phase: 'error', message: data.message || '清理失败' });
          return;
        }
        if (rounds === 0) initialTotal = data.total;
        processed += data.checked;
        totalDeleted += data.deleted.length;
        setCleanState({ phase: 'running', total: initialTotal, processed, deleted: totalDeleted });
        if (data.done) break;
        offset = data.nextOffset;
        rounds++;
      }
      setCleanState({ phase: 'done', total: initialTotal, processed, deleted: totalDeleted });
      setCurrentPage(1);
      setInputPage(1);
      getListdata(1);
      // 完成态停留片刻后自动关闭，也可手动点「完成」
      setTimeout(() => {
        setCleanState((s) => (s && s.phase === 'done' ? null : s));
      }, 2800);
    } catch (error) {
      setCleanState({ phase: 'error', message: '网络异常：' + error.message });
    }
  };



  const getListdata = useCallback(async (page, ch = channel) => {
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
        })
      })
      const res_data = await res.json()
      if (!res_data?.success) {
        toast.error(res_data.message)
      } else {
        setListData(res_data.data)
        const totalPages = Math.ceil(res_data.total / 10);
        setSearchTotal(totalPages);
      }

    } catch (error) {
      toast.error(error.message)
    }

  })


  useEffect(() => {
    getListdata(currentPage)
  }, [currentPage]);

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

  return (
    <>
      <div className="overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
        <header className="fixed top-0 left-0 w-full border-b bg-white z-50">
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-0 sm:h-[50px] flex items-center justify-end gap-2">
            <Link href="/">
              <button className="px-3 py-1.5 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap">主页</button>
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-3 py-1.5 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap"
            >
              登出
            </button>
          </div>
        </header>

        <main className="mt-[56px] sm:mt-[60px] mb-[56px] sm:mb-[60px] w-full sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-full">

          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2 flex items-center gap-4">
            <form onSubmit={handleSearch} className="flex flex-1 min-w-0 items-center gap-2">
              <select
                value={channel}
                onChange={handleChannelChange}
                className="border rounded px-1.5 py-1.5 text-xs sm:text-sm bg-white shrink-0"
                title="按上传接口筛选"
              >
                <option value="">全部接口</option>
                <option value="file">telegra.ph</option>
                <option value="cfile">TG_Channel</option>
                <option value="rfile">R2</option>
              </select>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm flex-1 min-w-0 w-full"
                placeholder="输入 URL"
              />
              <button type="submit" className="text-white px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap bg-blue-500 hover:bg-indigo-500 rounded transition-colors">
                搜索
              </button>
            </form>
            <button
              onClick={() => setShowCleanConfirm(true)}
              disabled={cleanState?.phase === 'running'}
              className="flex-none text-xs sm:text-sm px-3 py-1.5 rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-red-500 whitespace-nowrap transition-colors"
            >
              {cleanState?.phase === 'running' ? '正在清理…' : '一键清空失效图片'}
            </button>
          </div>

          <Table data={listData} />

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
          </div>
        </div>
        {cleanState && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-8">
            <div className="w-full max-w-xs bg-white rounded-2xl p-6 shadow-xl text-center">
              {cleanState.phase === 'running' && (
                <>
                  <div className="mx-auto mb-4 h-10 w-10 rounded-full border-[3px] border-gray-200 border-t-blue-500 animate-spin" />
                  <p className="text-base font-medium text-gray-800">正在清理失效图片</p>
                  <p className="mt-1 text-xs text-gray-400">正在逐张检测源文件，请稍候</p>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${cleanState.total ? Math.min(100, (cleanState.processed / cleanState.total) * 100) : 3}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    已检测 {cleanState.processed}{cleanState.total ? ` / ${cleanState.total}` : ''} 张 · 已删除 {cleanState.deleted} 张
                  </p>
                </>
              )}
              {cleanState.phase === 'done' && (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-7 w-7 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-gray-800">清理完成</p>
                  <p className="mt-1 text-sm text-gray-500">
                    共检测 {cleanState.processed} 张，删除 {cleanState.deleted} 张失效图片
                  </p>
                  <button
                    onClick={() => setCleanState(null)}
                    className="mt-4 w-full rounded-lg bg-blue-500 py-2 text-sm text-white hover:bg-blue-600"
                  >
                    完成
                  </button>
                </>
              )}
              {cleanState.phase === 'error' && (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <svg className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="8" x2="12" y2="13" />
                      <line x1="12" y1="16.5" x2="12" y2="16.5" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </div>
                  <p className="text-base font-medium text-gray-800">清理失败</p>
                  <p className="mt-1 break-words text-sm text-gray-500">{cleanState.message}</p>
                  <button
                    onClick={() => setCleanState(null)}
                    className="mt-4 w-full rounded-lg bg-blue-500 py-2 text-sm text-white hover:bg-blue-600"
                  >
                    我知道了
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={showCleanConfirm}
          title="清空失效图片？"
          message={'将逐张检测所有图片的源文件，删除确认已失效（源文件 404）的记录及其访问日志。\n\n网络超时或无法确认的图片会自动跳过，不会误删。\n\n图片较多时检测需要一些时间。'}
          confirmText="开始清理"
          onConfirm={() => {
            setShowCleanConfirm(false);
            runCleanInvalid();
          }}
          onCancel={() => setShowCleanConfirm(false)}
        />
      </div>
    </>

  )
}