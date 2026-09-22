"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ToastContainer } from "react-toastify";
import { toast } from "react-toastify";
// import { useRouter } from 'next/navigation'
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // const router = useRouter()
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await signIn('credentials', {
        redirect: false,
        username,
        password,
      });
      // console.log(result);
      if (result?.error) {
        console.log(result.error);
        toast.error("用户名或密码错误，请核对后在登陆！")
      } else {
        // 登录成功后直接跳转到主页
        console.log('Login successful!');
        toast.success('登录成功，正在跳转到主页...')
        setTimeout(() => {
          window.location.replace('/');
        }, 500);
      }
    } catch (error) {
      console.log('Error during sign in:', error);
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col justify-center px-5 py-10 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm w-full">
        <h1 className="text-center text-xl sm:text-2xl font-bold leading-9 tracking-tight text-gray-900">
          登录图床
        </h1>
        <div className="mt-8 sm:mt-10 w-full sm:mx-auto sm:w-full sm:max-w-sm">
          <form className="space-y-5 sm:space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium leading-6 text-gray-900" htmlFor="username">用户名</label>
              <div className="mt-2">
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="px-3 block w-full rounded-md border-0 py-2.5 text-base sm:text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:leading-6"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium leading-6 text-gray-900" htmlFor="password">密码</label>
              <div className="mt-2">
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-3 block w-full rounded-md border-0 py-2.5 text-base sm:text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:leading-6"
                />
              </div>
            </div>
            <button
              type="submit"
              className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-base sm:text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:bg-indigo-700"

            >登录</button>
          </form>
        </div>
      </div>
      <ToastContainer position="top-center" />
    </div>
  );
}
