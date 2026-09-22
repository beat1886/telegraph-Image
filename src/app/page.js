import { auth } from "@/auth";
import HomePage from "@/components/HomePage";
import AuthButton from "@/components/AuthButton";

export const runtime = 'edge';

export default async function Page() {
  const session = await auth();
  const initialRole = session?.user?.role || null;
  // AuthButton 是 async 服务端组件，只能在服务端渲染后以 prop 传入
  // 客户端组件 HomePage，不能在 'use client' 模块里直接 import
  const authButton = <AuthButton />;
  return <HomePage initialRole={initialRole} authButton={authButton} />;
}
