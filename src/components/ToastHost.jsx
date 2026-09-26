'use client';
import { ToastContainer } from 'react-toastify';

// 全局统一提示：顶部居中、无进度条、无倒计时、最多堆叠 3 条，
// 样式（圆角胶囊、阴影、动画）在 globals.css 的 .app-toast 中定义。
export default function ToastHost() {
  return (
    <ToastContainer
      className="app-toast"
      position="top-center"
      autoClose={2200}
      hideProgressBar
      newestOnTop
      closeOnClick
      pauseOnHover={false}
      pauseOnFocusLoss={false}
      draggable={false}
      limit={3}
      closeButton={false}
    />
  );
}
