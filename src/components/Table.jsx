import { useState, useEffect } from "react";
import Switcher from '@/components/SwitchButton';
import { toast } from "react-toastify";
import React, { useRef } from 'react';
import TooltipItem from '@/components/Tooltip';
import FullScreenIcon from "@/components/FullScreenIcon"
import { PhotoProvider, PhotoView } from 'react-photo-view';

// 源文件失效（如 telegra.ph 临时链接 404）时的占位图
const brokenPlaceholder = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#f1f5f9" rx="6"/><text x="40" y="45" font-size="13" fill="#94a3b8" text-anchor="middle" font-family="sans-serif">已失效</text></svg>'
)}`;
const handleImgError = (e) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = brokenPlaceholder;
};

export default function Table({ data: initialData = [] }) {

    const [data, setData] = useState(initialData); // 初始化状态
    const [modalData, setModalData] = useState(null);
    const [logView, setLogView] = useState(null); // 单张图片的访问记录弹窗
    const modalRef = useRef(null);



    useEffect(() => {
        setData(initialData); // 更新数据
    }, [initialData]);

    const handleClickOutside = (e) => {
        console.log(modalRef.current.contains(e.target));
        if (modalRef.current && !modalRef.current.contains(e.target)) {
            setModalData(null);
        }
    };

    const origin = typeof window !== 'undefined' ? window.location.origin : '';




    const getImgUrl = (url) => {
        return url.startsWith("/file/") || url.startsWith("/cfile/") || url.startsWith("/rfile/") ? `${origin}/api${url}` : url;
    };

    const handleNameClick = (item) => {
        setModalData(item);
    };

    const handleCloseModal = () => {
        setModalData(null);
    };



    const handleCopy = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success(`链接复制成功`);
        });
    };



    const deleteItem = async (initName) => {
        try {
            const res = await fetch(`/api/admin/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: initName,
                }),
            });
            const res_data = await res.json();
            if (res_data.success) {
                toast.success('删除成功!');
                setData(prevData => prevData.filter(item => item.url !== initName));
            } else {
                toast.error(res_data.message);
            }
        } catch (error) {
            toast.error(error.message);
        }
    };


    const handleDelete = async (initName) => {
        const confirmed = window.confirm('你确定要删除这个项目吗？');
        if (confirmed) {
            await deleteItem(initName);
        }
    };

    // 拉取单张图片的访问记录（整合自原日志页）
    const fetchLogs = async (url, page = 0) => {
        setLogView({ url, page, records: [], total: 0, loading: true });
        try {
            const res = await fetch(`/api/admin/logdetail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, page }),
            });
            const res_data = await res.json();
            if (res_data.success) {
                setLogView({ url, page, records: res_data.data || [], total: res_data.total || 0, loading: false });
            } else {
                toast.error(res_data.message);
                setLogView(null);
            }
        } catch (error) {
            toast.error(error.message);
            setLogView(null);
        }
    };


    function getLastSegment(url) {
        const lastSlashIndex = url.lastIndexOf('/');
        return url.substring(lastSlashIndex + 1);
    }
    const renderFile = (fileUrl, index) => {
        const _url = getLastSegment(fileUrl);
        const getFileExtension = (url) => {
            const parts = url.split('.');
            return parts.length > 1 ? parts.pop().toLowerCase() : '';
        };
        const fileExtension = getFileExtension(_url);



        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp',
            'svg', 'ico', 'heic', 'heif', 'raw', 'psd', 'ai', 'eps'
        ];

        const videoExtensions = [
            'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ogg',
            'ogv', 'm4v', '3gp', '3g2', 'mpg', 'mpeg', 'mxf', 'vob'
        ];

        // 缩略图固定方块尺寸：手机 56px / 桌面 80px；min-width 防止 table 自动布局压缩列宽
        const thumbClass = "w-14 h-14 min-w-[56px] sm:w-20 sm:h-20 sm:min-w-[80px] object-cover rounded block mx-auto";

        if (imageExtensions.includes(fileExtension)) {

            return (
                <img
                    key={`image-${index}`}
                    src={fileUrl}
                    alt={`Uploaded ${index}`}
                    className={thumbClass}
                    onError={handleImgError}
                />
            );
        }
        else if (videoExtensions.includes(fileExtension)) {
            return (
                <video
                    key={`video-${index}`}
                    src={fileUrl}
                    className={thumbClass}
                    muted
                    preload="metadata"
                    onError={handleImgError}
                >
                    Your browser does not support the video tag.
                </video>
            );
        }
        else {
            return (
                <img
                    key={`image-${index}`}
                    src={fileUrl}
                    alt={`Uploaded ${index}`}
                    className={thumbClass}
                    onError={handleImgError}
                />
            );
        }
    };

    function toggleFullScreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            const element = document.querySelector('.PhotoView-Portal');
            if (element) {
                element.requestFullscreen();
            }
        }
    }

    // const isImage = (url) => {
    //     return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(url);
    // };

    const isVideo = (url) => {
        return /\.(mp4|mkv|avi|mov|wmv|flv|webm|ogg|ogv|m4v|3gp|3g2|mpg|mpeg|mxf|vob)$/i.test(url);
    }

    const elementSize = 400;

    // 点击缩略图放大预览（图片/视频两种模式），桌面表格与手机卡片共用
    const renderPreview = (item, index) => {
        const url = getImgUrl(item.url);
        return isVideo(url) ? (
            <PhotoView
                key={item.url}
                width={elementSize}
                height={elementSize}
                render={({ scale, attrs }) => {
                    const width = attrs.style.width;
                    const offset = (width - elementSize) / elementSize;
                    const childScale = scale === 1 ? scale + offset : 1 + offset;
                    return (
                        <div {...attrs} className={`flex-none bg-white ${attrs.className || ''}`}>
                            {renderFile(url, index)}
                        </div>
                    );
                }}
            >
                {renderFile(url, index)}
            </PhotoView>
        ) : (
            <PhotoView key={item.url} src={url}>
                {renderFile(url, index)}
            </PhotoView>
        );
    };

    // 手机端：单条记录卡片
    const renderMobileCard = (item, index) => (
        <div key={`mcard-${index}`} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
            <div className="flex gap-3">
                <div className="shrink-0">{renderPreview(item, index)}</div>
                <div className="min-w-0 flex-1">
                    <p
                        onClick={() => handleNameClick(item)}
                        className="text-sm font-medium text-blue-600 truncate cursor-pointer"
                        title={item.url}
                    >
                        {item.url}
                    </p>
                    <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                        <p className="truncate">时间：{item.time || '-'}</p>
                        <p className="truncate">来源：{item.referer || '-'}</p>
                        <p className="truncate">IP：{item.ip || '-'}</p>
                        <p>PV：{item.total ?? '-'}　分级：{item.rating ?? '-'}</p>
                    </div>
                </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 flex items-center gap-1.5 shrink-0">
                    限制访问
                    <Switcher initialChecked={item.rating} initName={item.url} />
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => fetchLogs(item.url, 0)}
                        className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap"
                    >
                        记录{item.logcount > 0 ? `(${item.logcount})` : ''}
                    </button>
                    <button
                        onClick={() => handleDelete(item.url)}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 whitespace-nowrap"
                    >
                        删除
                    </button>
                </div>
            </div>
        </div>
    );

    const photoViewToolbar = ({ rotate, onRotate, onScale, scale }) => (
        <>
            <svg
                className="PhotoView-Slider__toolbarIcon"
                width="44"
                height="44"
                viewBox="0 0 768 768"
                fill="white"
                onClick={() => onScale(scale + 0.5)}
            >
                <path d="M384 640.5q105 0 180.75-75.75t75.75-180.75-75.75-180.75-180.75-75.75-180.75 75.75-75.75 180.75 75.75 180.75 180.75 75.75zM384 64.5q132 0 225.75 93.75t93.75 225.75-93.75 225.75-225.75 93.75-225.75-93.75-93.75-225.75 93.75-225.75 225.75-93.75zM415.5 223.5v129h129v63h-129v129h-63v-129h-129v-63h129v-129h63z" />
            </svg>
            <svg
                className="PhotoView-Slider__toolbarIcon"
                width="44"
                height="44"
                viewBox="0 0 768 768"
                fill="white"
                onClick={() => onScale(scale - 0.5)}
            >
                <path d="M384 640.5q105 0 180.75-75.75t75.75-180.75-75.75-180.75-180.75-75.75-180.75 75.75-75.75 180.75 75.75 180.75 180.75 75.75zM384 64.5q132 0 225.75 93.75t93.75 225.75-93.75 225.75-225.75 93.75-225.75-93.75-93.75-225.75 93.75-225.75 225.75-93.75zM223.5 352.5h321v63h-321v-63z" />
            </svg>
            <svg
                className="PhotoView-Slider__toolbarIcon"
                onClick={() => onRotate(rotate + 90)}
                width="44"
                height="44"
                fill="white"
                viewBox="0 0 768 768"
            >
                <path d="M565.5 202.5l75-75v225h-225l103.5-103.5c-34.5-34.5-82.5-57-135-57-106.5 0-192 85.5-192 192s85.5 192 192 192c84 0 156-52.5 181.5-127.5h66c-28.5 111-127.5 192-247.5 192-141 0-255-115.5-255-256.5s114-256.5 255-256.5c70.5 0 135 28.5 181.5 75z" />
            </svg>
            {document.fullscreenEnabled && <FullScreenIcon onClick={toggleFullScreen} />}
        </>
    );

    return (
        <PhotoProvider maskOpacity={0.5} toolbarRender={photoViewToolbar}>
            <div>
                {/* 桌面端：完整表格（sm 及以上显示） */}
                <div className="hidden sm:block sm:mx-2 overflow-x-auto overscroll-x-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <table className="min-w-full bg-white items-center justify-between">
                        <thead>
                            <tr className="sticky top-0 bg-gray-100 z-20">
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">name</th>
                                <th className="sticky left-0 z-10 py-2 px-1.5 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">preview</th>
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">time</th>
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">referer</th>
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">ip</th>
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">PV</th>
                                <th className="py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">rating</th>
                                <th className="sticky right-0 z-10 py-2 px-2 sm:px-4 border-b border-gray-200 bg-gray-100 text-center text-xs sm:text-sm font-semibold text-gray-600 whitespace-nowrap">限制访问</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, index) => (
                                <tr key={index}>
                                    <td onClick={() => handleNameClick(item)} className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 truncate max-w-[104px] sm:max-w-48">
                                        {item.url}
                                    </td>
                                    <td className="w-16 sm:w-24 sticky left-0 z-10 py-2 px-1.5 sm:px-4 border-b border-gray-500 bg-white text-sm text-gray-700 text-center align-middle">
                                        {renderPreview(item, index)}
                                    </td>
                                    <td className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 max-w-[96px] sm:max-w-48 truncate">
                                        {item.time}
                                    </td>
                                    <td className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 max-w-[110px] sm:max-w-48 truncate">
                                        <TooltipItem tooltipsText={item.referer} position="bottom">{item.referer}</TooltipItem>
                                    </td>
                                    <td className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 max-w-[100px] sm:max-w-48 truncate">
                                        <TooltipItem tooltipsText={item.ip} position="bottom">{item.ip}</TooltipItem>
                                    </td>
                                    <td className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 w-12">{item.total}</td>
                                    <td className="text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700 w-12">{item.rating}</td>
                                    <td className="sticky right-0 z-10 bg-white text-center align-middle py-2 px-2 sm:px-4 border-b border-gray-200 text-sm text-gray-700">
                                        <div className="flex flex-row justify-center items-center">
                                            <Switcher initialChecked={item.rating} initName={item.url} />
                                            <button
                                                onClick={() => fetchLogs(item.url, 0)}
                                                className="ml-1 sm:ml-2 px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 whitespace-nowrap"
                                            >
                                                记录{item.logcount > 0 ? `(${item.logcount})` : ''}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.url)}
                                                className="ml-1 sm:ml-2 px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 whitespace-nowrap"
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 手机端：卡片流（sm 以下显示），无需横向滚动 */}
                <div className="sm:hidden px-2 pb-2 space-y-2">
                    {data.length === 0
                        ? <p className="text-center text-sm text-gray-400 py-10">暂无数据</p>
                        : data.map((item, index) => renderMobileCard(item, index))}
                </div>

                {modalData && (
                <div onClick={handleClickOutside} className="fixed z-50 inset-0 overflow-y-auto flex items-center justify-center m-5 ">
                    <div className="fixed inset-0 bg-black opacity-75"></div>
                    <div ref={modalRef} className="bg-white rounded-lg flex-none flex flex-col h-1/2 relative w-9/10 sm:w-9/10 md:w-96 lg:w-120 xl:w-144 2xl:w-160">
                        <button className="absolute top-2 right-2 ring-2 text-red-600 hover:text-red-800" onClick={handleCloseModal}>
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <div className='flex flex-col  mt-10'>
                            {[
                                { text: getImgUrl(modalData.url), onClick: () => handleCopy(getImgUrl(modalData.url)) },
                                { text: `![${modalData.url}](${getImgUrl(modalData.url)})`, onClick: () => handleCopy(`![${modalData.name}](${getImgUrl(modalData.url)})`) },
                                { text: `<a href="${getImgUrl(modalData.url)}" target="_blank"><img src="${getImgUrl(modalData.url)}"></a>`, onClick: () => handleCopy(`<a href="${getImgUrl(modalData.url)}" target="_blank"><img src="${getImgUrl(modalData.url)}"></a>`) },
                                { text: `[img]${getImgUrl(modalData.url)}[/img]`, onClick: () => handleCopy(`[img]${getImgUrl(modalData.url)}[/img]`) },
                            ].map((item, i) => (
                                <input
                                    key={`input-${i}`}
                                    readOnly
                                    value={item.text}
                                    onClick={item.onClick}
                                    className="mx-2 px-3 my-1 py-2 border border-gray-300 rounded-lg bg-white text-sm text-gray-800 focus:outline-none placeholder-gray-400"
                                />


                            ))}
                        </div>

                    </div>
                </div>


                )}

                {logView && (
                    <div
                        onClick={() => setLogView(null)}
                        className="fixed z-[60] inset-0 overflow-y-auto flex items-center justify-center p-3 sm:m-5"
                    >
                        <div className="fixed inset-0 bg-black opacity-75"></div>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white rounded-lg flex flex-col relative w-full max-w-lg max-h-[80vh]"
                        >
                            <div className="flex items-start justify-between px-4 pt-3 pb-2 border-b">
                                <div className="min-w-0 pr-2">
                                    <h3 className="text-sm font-semibold text-gray-800">访问记录</h3>
                                    <p className="text-xs text-gray-400 truncate" title={logView.url}>{logView.url}</p>
                                </div>
                                <button className="text-red-600 hover:text-red-800 shrink-0" onClick={() => setLogView(null)}>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-3 py-2">
                                {logView.loading ? (
                                    <p className="text-center text-sm text-gray-400 py-10">加载中…</p>
                                ) : logView.records.length === 0 ? (
                                    <p className="text-center text-sm text-gray-400 py-10">暂无外部访问记录</p>
                                ) : (
                                    <>
                                        {/* 桌面端：小表格 */}
                                        <table className="hidden sm:table w-full text-xs">
                                            <thead>
                                                <tr className="text-gray-500 border-b">
                                                    <th className="text-left py-1.5 px-2 font-medium whitespace-nowrap">时间</th>
                                                    <th className="text-left py-1.5 px-2 font-medium">来源</th>
                                                    <th className="text-left py-1.5 px-2 font-medium whitespace-nowrap">IP</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {logView.records.map((r) => (
                                                    <tr key={r.id} className="border-b border-gray-100">
                                                        <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap align-top">{r.time}</td>
                                                        <td className="py-1.5 px-2 text-gray-600 break-all">{r.referer || '-'}</td>
                                                        <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap align-top">{r.ip || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {/* 手机端：纵向记录 */}
                                        <div className="sm:hidden space-y-2">
                                            {logView.records.map((r) => (
                                                <div key={r.id} className="border border-gray-200 rounded-md p-2 text-xs text-gray-600 space-y-0.5">
                                                    <p className="text-gray-500">{r.time}</p>
                                                    <p className="break-all">来源：{r.referer || '-'}</p>
                                                    <p>IP：{r.ip || '-'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {!logView.loading && logView.total > 0 && (
                                <div className="flex items-center justify-center gap-3 px-4 py-2 border-t text-xs sm:text-sm">
                                    <button
                                        className="px-2 py-1 bg-blue-500 text-white rounded disabled:opacity-40 whitespace-nowrap"
                                        disabled={logView.page === 0}
                                        onClick={() => fetchLogs(logView.url, logView.page - 1)}
                                    >
                                        上一页
                                    </button>
                                    <span className="whitespace-nowrap">
                                        第 {logView.page + 1}/{Math.ceil(logView.total / 10)} 页（共 {logView.total} 条）
                                    </span>
                                    <button
                                        className="px-2 py-1 bg-blue-500 text-white rounded disabled:opacity-40 whitespace-nowrap"
                                        disabled={logView.page + 1 >= Math.ceil(logView.total / 10)}
                                        onClick={() => fetchLogs(logView.url, logView.page + 1)}
                                    >
                                        下一页
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </PhotoProvider>
    );
}
