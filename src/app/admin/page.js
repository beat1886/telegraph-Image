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
  const [pageSize, setPageSize] = useState(10); // 每页条数
  const [totalCount, setTotalCount] = useState(0); // 筛选后的记录总数
  const [selected, setSelected] = useState([]); // 多选的图片 url 列表（仅当前页）
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const getListdata = useCallback(async (page, ch = channel, size = pageSize) => {
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

  // 切换每页条数：立即从第一页刷新
  const handlePageSizeChange = (event) => {
    const size = Number(event.target.value);
    setPageSize(size);
    setCurrentPage(1);
    setInputPage(1);
    getListdata(1, channel, size);
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

  // 批量删除：逐条调用现有删除接口，全部结束后刷新
  const runBatchDelete = async () => {
    setShowBatchConfirm(false);
    if (batchDeleting || selected.length === 0) return;
    setBatchDeleting(true);
    let ok = 0;
    let fail = 0;
    for (const url of selected) {
      try {
        const res = await fetch('/api/admin/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: url }),
        });
        const data = await res.json();
        if (data?.success) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    setBatchDeleting(false);
    if (fail === 0) {
      toast.success(`已删除 ${ok} 张图片`);
    } else {
      toast.error(`删除完成：成功 ${ok} 张，失败 ${fail} 张`);
    }
    getListdata(currentPage);
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
                className="border rounded px-1.5 text-sm bg-white shrink-0 h-[34px]"
                title="按上传接口筛选"
              >
                <option value="">全部接口</option>
                <option value="file">TG</option>
                <option value="cfile">TG_Channel</option>
                <option value="rfile">R2</option>
              </select>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border rounded px-2 text-sm flex-1 min-w-0 w-full h-[34px]"
                placeholder="输入 URL"
              />
              <button type="submit" className="text-white px-4 text-sm whitespace-nowrap rounded border border-transparent h-[34px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-teal-500 hover:to-emerald-500 transition-all">
                搜索
              </button>
            </form>
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
              {selected.length > 0 ? `已选 ${selected.length} 项` : `共 ${totalCount} 张图片`}
            </span>
            <button
              onClick={() => setShowBatchConfirm(true)}
              disabled={selected.length === 0 || batchDeleting}
              className="shrink-0 px-3 py-1 text-xs sm:text-sm rounded border border-red-400 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-500 whitespace-nowrap transition-colors"
            >
              {batchDeleting ? '正在删除…' : `批量删除${selected.length > 0 ? `(${selected.length})` : ''}`}
            </button>
          </div>

          <Table data={listData} selected={selected} onToggle={toggleSelect} />

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
          title={`删除选中的 ${selected.length} 张图片？`}
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