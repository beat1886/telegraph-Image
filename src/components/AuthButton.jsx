import Link from "next/link";
import { auth } from "@/auth";
import LogoutButton from "./LogoutButton";

const InnerButton = ({ children }) => (
  <button className="px-2 py-1 mx-1 w-14 sm:w-16 text-xs sm:text-sm bg-blue-500 text-white rounded whitespace-nowrap">
    {children}
  </button>
);

// 服务端组件：首屏 HTML 直接输出正确的登录态按钮，不闪、不等待客户端请求
export default async function AuthButton() {
  const session = await auth();
  const role = session?.user?.role;

  if (role === 'admin') {
    return (
      <div className="flex items-center -mx-1">
        <Link href="/admin">
          <InnerButton>管理</InnerButton>
        </Link>
        <LogoutButton />
      </div>
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
