export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from "@/auth";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
};

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

// 浏览器直传 R2 成功后回调：校验对象真实存在，再写 imginfo 记录
export async function POST(request) {
    const { env } = getRequestContext();

    const session = await auth();
    if (!session?.user) {
        return Response.json({ status: 401, success: false, message: '请先登录' }, { status: 401, headers: corsHeaders });
    }
    if (!env.IMGRS) {
        return Response.json({ status: 500, success: false, message: 'IMGRS 未绑定' }, { status: 500, headers: corsHeaders });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ status: 400, success: false, message: '请求格式错误' }, { status: 400, headers: corsHeaders });
    }
    const key = String(body.key || '');
    // 只允许单段 key，防路径穿越
    if (!key || key.includes('/') || key.includes('..')) {
        return Response.json({ status: 400, success: false, message: '非法的 key' }, { status: 400, headers: corsHeaders });
    }

    // 确认对象确实已直传成功
    const head = await env.IMGRS.head(key);
    if (!head) {
        return Response.json({ status: 404, success: false, message: '对象不存在，上传可能失败' }, { status: 404, headers: corsHeaders });
    }

    const reqUrl = new URL(request.url);
    const storedUrl = `/rfile/${key}`;
    const publicUrl = `${reqUrl.origin}/api${storedUrl}`;

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
    const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
    const referer = request.headers.get('Referer') || 'Referer';

    let rating = 0;
    try {
        const apikey = env.ModerateContentApiKey;
        const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : (apikey ? `https://api.moderatecontent.com/moderate/?key=${apikey}&` : '');
        if (ratingApi) {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 15000);
            const res = await fetch(`${ratingApi}url=${encodeURIComponent(publicUrl)}`, { signal: ctrl.signal });
            clearTimeout(tid);
            const data = await res.json();
            rating = data?.rating_index ?? 0;
        }
    } catch {
        rating = -1; // 鉴黄失败不阻塞
    }

    if (env.IMG) {
        const now = new Date();
        const time = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        // 参数绑定，防注入
        await env.IMG.prepare('INSERT INTO imginfo (url, referer, ip, rating, total, time) VALUES (?1, ?2, ?3, ?4, 1, ?5)')
            .bind(storedUrl, referer.slice(0, 500), clientIp, rating, time)
            .run();
    }

    return Response.json({
        success: true,
        url: publicUrl,
        name: key,
        size: head.size,
    }, { headers: corsHeaders });
}
