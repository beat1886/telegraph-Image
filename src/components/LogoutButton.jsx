"use client";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="px-3 py-1.5 mx-1 w-16 sm:w-20 text-sm bg-blue-500 text-white rounded whitespace-nowrap"
    >
      登出
    </button>
  );
}
