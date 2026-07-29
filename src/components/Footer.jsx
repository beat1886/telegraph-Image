import { useState, useEffect } from 'react';
import Link from 'next/link';
export default function Footer() {
  return (
    <footer className="w-full  h-1/12 text-center  bg-slate-200  flex flex-col justify-center items-center py-4">
      {/* 友情链接 */}
      <div className="mb-2">
        <p className="text-xs text-gray-500 mb-1">友情链接：
          <a
            href="https://miaosou.xyz/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-300 hover:text-red-900 ml-1"
          >
            喵搜 - 网盘资源一站式搜索
          </a>
        </p>
      </div>

      <div >
        <p className="text-xs text-gray-500">声明：请勿上传违反中国法律的图片，违者后果自负。</p>
      </div>
    </footer>
  );
}
