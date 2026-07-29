import { Inter } from "next/font/google";
import "./globals.css";
import 'react-toastify/dist/ReactToastify.css';
import 'react-toastify/ReactToastify.min.css';
import 'react-photo-view/dist/react-photo-view.css';
import { GoogleAnalytics } from '@next/third-parties/google'
// 引入底部组件
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "图床",
  description: "图床",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        {/* 弹性布局，实现footer贴底 */}
        <div className="min-h-screen flex flex-col">
          <main className="flex-grow">
            {children}
          </main>
          <Footer />
        </div>
      </body>
      <GoogleAnalytics gaId="G-JVKEXR5XSG" />
    </html>
  );
}
