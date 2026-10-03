export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from "@/auth";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
};

// 单文件上限：2GB（单次 PUT 直传 R2 上限为 5GB，留余量）
const MAX_SIZE = 2 * 1024 * 1024 * 1024;
const EXPIRES = 600; // 预签名 URL 有效期 10 分钟

export async function OPTIONS() {
    return new Response(null, { headers: corsHeaders });
}

// ---------- AWS SigV4（Web Crypto，边缘运行时零依赖） ----------
const enc = new TextEncoder();
async function hmac(keyBytes, str) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(str)));
}
async function sha256Hex(str) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(str));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeFileName(name) {
    // 去掉路径与斜杠（rfile 路由是单段 [name]），只保留安全字符，限长
    const base = (name || 'file').split(/[\\/]/).pop();
    const cleaned = base.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(0, 120) || 'file';
    return cleaned;
}

export async function POST(request) {
    const { env } = getRequestContext();

    // 必须登录
    const session = await auth();
    if (!session?.user) {
        return Response.json({ status: 401, success: false, message: '请先登录' }, { status: 401, headers: corsHeaders });
    }

    const accountId = env.R2_ACCOUNT_ID;
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const bucket = env.R2_BUCKET;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
        return Response.json({ status: 500, success: false, message: 'R2 直传未配置（缺少环境变量）' }, { status: 500, headers: corsHeaders });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ status: 400, success: false, message: '请求格式错误' }, { status: 400, headers: corsHeaders });
    }
    const size = Number(body.size) || 0;
    if (size > MAX_SIZE) {
        return Response.json({
            status: 413, success: false,
            message: `文件超过 2GB 上限（当前 ${(size / 1024 ** 3).toFixed(2)}GB）`
        }, { status: 413, headers: corsHeaders });
    }

    // 唯一对象名（不含斜杠，单段可被 /rfile/[name] 读取）
    const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const key = `${rand}-${sanitizeFileName(body.filename)}`;

    const region = 'auto';
    const service = 's3';
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const params = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(EXPIRES),
        'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQueryString = Object.keys(params).sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');

    const canonicalRequest = [
        'PUT',
        `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
        canonicalQueryString,
        `host:${host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = await hmac(enc.encode(`AWS4${secretAccessKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signatureKey = await crypto.subtle.importKey('raw', kSigning, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', signatureKey, enc.encode(stringToSign)))]
        .map(b => b.toString(16).padStart(2, '0')).join('');

    const uploadUrl = `https://${host}/${bucket}/${encodeURIComponent(key)}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    const reqUrl = new URL(request.url);
    return Response.json({
        success: true,
        uploadUrl,
        key,
        url: `${reqUrl.origin}/api/rfile/${key}`,
        expiresIn: EXPIRES,
    }, { headers: corsHeaders });
}
