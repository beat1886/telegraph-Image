import { Inter } from "next/font/google";
import "./globals.css";
// FontAwesome SVG 图标的尺寸全靠该样式表中的 .svg-inline--fa { height: 1em }，
// 缺失时图标会按 SVG 默认内在尺寸渲染（异常巨大）
import '@fortawesome/fontawesome-svg-core/styles.css';
import 'react-toastify/dist/ReactToastify.css';
import 'react-toastify/ReactToastify.min.css';
import 'react-photo-view/dist/react-photo-view.css';
import { GoogleAnalytics } from '@next/third-parties/google'
import ToastHost from '@/components/ToastHost';


const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "图床",
  description: "图床",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        {children}
        <ToastHost />
      </body>
      <GoogleAnalytics gaId="G-JVKEXR5XSG" />
    </html>
  );
}
