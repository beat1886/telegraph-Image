import { auth } from "@/auth"


const ROOT = '/';
const PUBLIC_ROUTES = ['/'];
const DEFAULT_REDIRECT = '/login';
const LOGIN = '/login'
const API_ADMIN = "/api/admin"
const ADMIN_PAGE = "/admin"
const AUTH_API = "/api/enableauthapi"
const enableAuthapi = process.env.ENABLE_AUTH_API === 'true';

export default auth(async (req) => {
    const { nextUrl } = req;

    // console.log(req?.auth?.user?.role);
    const role = req?.auth?.user?.role;



    const isAuthenticated = !!req.auth;
    const isAPI_ADMIN = nextUrl.pathname.startsWith(API_ADMIN);
    const isADMIN_PAGE = nextUrl.pathname.startsWith(ADMIN_PAGE);

    const isAuthAPI = nextUrl.pathname.startsWith(AUTH_API);

    if (!isAuthenticated) {
        // 匿名用户也开放管理页与"我的文件"列表/删除接口（数据按访客 uid 隔离）；
        // 其余管理接口（R2 用量、IP 日志、封禁等）仍需管理员登录
        const isOpenAdminApi =
            nextUrl.pathname === '/api/admin/list' ||
            nextUrl.pathname === '/api/admin/delete';
        if (isAPI_ADMIN && !isOpenAdminApi) {
            return Response.json(
                { status: "fail", message: "You are not logged in by admin !", success: false },
                { status: 401 },
            )
        }
        else if (isAuthAPI) {

            if (enableAuthapi) {
                return Response.json(
                    { status: "fail", message: "You are not logged in by user !", success: false },
                    { status: 401 }
                );
            }
            else {
                return
            }
        }

        else {
            return

        }
    }

    if (role === 'admin') {
        return;
    }

    if (role === 'user') {
        // 普通登录用户与匿名一致：可用管理页和自己的列表/删除，其余管理接口禁止
        const isOpenAdminApi =
            nextUrl.pathname === '/api/admin/list' ||
            nextUrl.pathname === '/api/admin/delete';
        if (isAPI_ADMIN && !isOpenAdminApi) {
            return Response.json(
                { status: "fail", message: "Admin only", success: false },
                { status: 403 },
            );
        }
    }

})

// 使用静态 matcher 配置
export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*",
        "/api/enableauthapi/:path*"
    ],
};