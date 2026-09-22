import { auth } from "@/auth";
import { LoginPage } from "@/components/SignIn";
import { redirect } from "next/navigation";

export const runtime = 'edge';

export default async function SignInPage() {
    const session = await auth();

    // 登录后统一直接跳转到主页
    if (session?.user?.role === "admin" || session?.user?.role === "user") {
        return redirect('/');
    } else {
        return <LoginPage />;
    }
}
