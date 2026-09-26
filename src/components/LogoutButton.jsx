"use client";
import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="px-2 py-1 mx-1 w-14 sm:w-16 text-xs sm:text-sm bg-blue-500 text-white rounded whitespace-nowrap"
    >
      登出
    </button>
  );
}
