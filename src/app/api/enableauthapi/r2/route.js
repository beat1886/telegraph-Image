export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

export async function POST(request) {

    const { env, cf, ctx } = getRequestContext();

    // ==============================================
    // 👇 👇 这里加了【必须登录才能上传 R2】的验证
    // ==============================================
    const cookieHeader = request.headers.get('cookie') || '';
    const isLoggedIn = cookieHeader.includes('next-auth.session-token=') 
                     || cookieHeader.includes('__Secure-next-auth.session-token=');

    // 未登录 → 直接拒绝！
    if (!isLoggedIn) {
        return Response.json({
            status: 401,
            success: false,
            message: "请先登录"
        }, {
            status: 401,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            }
        });
    }
    // ==============================================
    // 👆 👆 登录验证结束
    // ==============================================

    if (!env.IMGRS) {
        return Response.json({
            status: 500,
            message: `IMGRS is not Set`,
            success: false
        }, {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            }
        })
    }

    const req_url = new URL(request.url);

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';
    const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
    const Referer = request.headers.get('Referer') || "Referer";

    const formData = await request.formData();
    const fileType = formData.get('file').type;
    const filename = formData.get('file').name;
    const file = formData.get('file');

    const header = new Headers()
    header.set("content-type", fileType)
    header.set("content-length", `${file.size}`)

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json'
    };

    try {
        const object = await env.IMGRS.put(filename, file, {
            httpMetadata: header
        })

        if (object === null) {
            return Response.json({
                status: 404,
                message: `上传失败`,
                success: false
            }, {
                status: 404,
                headers: corsHeaders
            })
        }

        const data = {
            "url": `${req_url.origin}/api/rfile/${filename}`,
            "code": 200,
            "name": filename
        }

        if (!env.IMG) {
            return Response.json({
                ...data,
                msg: "1"
            }, {
                status: 200,
                headers: corsHeaders
            })
        } else {
            try {
                const rating_index = await getRating(env, `${req_url.origin}/api/rfile/${filename}`);
                const nowTime = await get_nowTime()
                await insertImageData(env.IMG, `/rfile/${filename}`, Referer, clientIp, rating_index, nowTime);

                return Response.json({
                    ...data,
                    msg: "2",
                    Referer: Referer,
                    clientIp: clientIp,
                    rating_index: rating_index,
                    nowTime: nowTime
                }, {
                    status: 200,
                    headers: corsHeaders
                })
            } catch (error) {
                return Response.json({
                    "msg": error.message
                }, {
                    status: 500,
                    headers: corsHeaders
                })
            }
        }
    } catch (error) {
        return Response.json({
            status: 500,
            message: error.message,
            success: false
        }, {
            status: 500,
            headers: corsHeaders
        })
    }
}

// 下面的函数你不用动
async function insertImageData(env, src, referer, ip, rating, time) {
    try {
        await env.prepare(`
            INSERT INTO imginfo (url, referer, ip, rating, total, time)
            VALUES ('${src}', '${referer}', '${ip}', ${rating}, 1, '${time}')
        `).run()
    } catch (error) {}
}

async function get_nowTime() {
    const timedata = new Date();
    const year = timedata.getFullYear();
    const month = String(timedata.getMonth() + 1).padStart(2, '0');
    const day = String(timedata.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function getRating(env, url) {
    try {
        const apikey = env.ModerateContentApiKey
        const ModerateContentUrl = apikey ? `https://api.moderatecontent.com/moderate/?key=${apikey}&` : ""
        const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : ModerateContentUrl;

        if (ratingApi) {
            const res = await fetch(`${ratingApi}url=${url}`);
            const data = await res.json();
            return data?.rating_index || -1;
        }
        return 0
    } catch (error) {
        return -1
    }
}
