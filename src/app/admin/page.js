'use client'
import { signOut } from "next-auth/react"
import Table from "@/components/Table"
import { useState, useEffect, useCallback } from 'react';
import { ToastContainer, toast } from "react-toastify";
import Link from 'next/link'
// import { toast } from "react-toastify";




export default function Admin() {
  const [listData, setListData] = useState([])
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0); // 初始化为0，因为初始时还没有搜索结果
  const [inputPage, setInputPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [cleaning, setCleaning] = useState(false);

  // 一键清空失效图片：分批检测所有记录的源文件，删除确认 404 的
  const handleCleanInvalid = async () => {
    if (cleaning) return;
    const ok = window.confirm(
      '将逐张检测所有图片的源文件，删除确认已失效（源文件 404）的记录及其访问日志。\n\n网络超时或无法确认的图片会自动跳过，不会误删。\n\n图片较多时检测需要一些时间，确定开始吗？'
    );
    if (!ok) return;
    setCleaning(true);
    const tid = toast.loading('正在检测失效图片…');
    try {
      let offset = 0;
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
          toast.update(tid, { render: data.message || '清理失败', type: 'error', isLoading: false, autoClose: 3000 });
          return;
        }
        totalDeleted += data.deleted.length;
        toast.update(tid, { render: `正在检测…已清理 ${totalDeleted} 张失效图片` });
        if (data.done) break;
        offset = data.nextOffset;
        rounds++;
      }
      toast.update(tid, { render: `清理完成，共删除 ${totalDeleted} 张失效图片`, type: 'success', isLoading: false, autoClose: 4000 });
      setCurrentPage(1);
      setInputPage(1);
      getListdata(1);
    } catch (error) {
      toast.update(tid, { render: '清理失败：' + error.message, type: 'error', isLoading: false, autoClose: 3000 });
    } finally {
      setCleaning(false);
    }
  };



  const getListdata = useCallback(async (page) => {
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
      toast.error('当前已为最后一页！')
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
      toast.error('请输入有效的页码！');
    }
    // setInputPage(""); // 清空输入框
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1);
  };

  return (
    <>
      <div className="overflow-auto h-full flex w-full min-h-screen flex-col items-center justify-between">
        <header className="fixed top-0 left-0 w-full border-b bg-white z-50">
          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 py-2 sm:py-0 sm:h-[50px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center justify-end gap-2 order-1">
              <Link href="/">
                <button className="px-4 py-2 w-28 sm:w-auto sm:px-4 sm:py-2 text-sm bg-blue-500 text-white rounded whitespace-nowrap">主页</button>
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-500 text-white rounded whitespace-nowrap"
              >
                登出
              </button>
            </div>
            <form onSubmit={handleSearch} className="flex items-center gap-2 order-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded px-2 py-1.5 sm:py-2 w-full sm:w-40 text-sm"
                placeholder="输入 URL"
              />
              <button type="submit" className="text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap transition ease-in-out delay-150 bg-blue-500 hover:scale-105 hover:bg-indigo-500 duration-300 rounded">
                搜索
              </button>
            </form>
          </div>
        </header>

        <main className="mt-[104px] sm:mt-[60px] mb-[56px] sm:mb-[60px] w-full sm:w-9/10 md:w-9/10 lg:w-9/10 xl:w-3/5 2xl:w-full">

          <div className="w-full max-w-4xl mx-auto px-3 sm:px-4 mb-2 flex justify-end">
            <button
              onClick={handleCleanInvalid}
              disabled={cleaning}
              className="text-xs sm:text-sm px-3 py-1.5 rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-red-500 whitespace-nowrap transition-colors"
            >
              {cleaning ? '正在清理…' : '一键清空失效图片'}
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
        <ToastContainer />
      </div>
    </>

  )
}