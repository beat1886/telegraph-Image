import Link from "next/link";
import { auth } from "@/auth";
import LogoutButton from "./LogoutButton";

const InnerButton = ({ children }) => (
  <button className="px-4 py-2 mx-2 w-28 sm:w-28 md:w-20 lg:w-16 xl:w-16 2xl:w-20 bg-blue-500 text-white rounded">
    {children}
  </button>
);

// 服务端组件：首屏 HTML 直接输出正确的登录态按钮，不闪、不等待客户端请求
export default async function AuthButton() {
  const session = await auth();
  const role = session?.user?.role;

  if (role === 'admin') {
    return (
      <Link href="/admin">
        <InnerButton>管理</InnerButton>
      </Link>
    );
  }

  if (role === 'user') {
    return <LogoutButton />;
  }

  return (
    <Link href="/login">
      <InnerButton>登录</InnerButton>
    </Link>
  );
}
