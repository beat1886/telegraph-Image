import { getRequestContext } from '@cloudflare/next-on-pages';

// 一键清空失效图片：分批检测 imginfo 中每条记录的源文件是否还存在
// 鉴权由 middleware 统一处理（仅 admin）
//
// 检测规则（只有「确认已失效」才删除，网络异常一律跳过，避免误删）：
//   /file/...   → GET https://telegra.ph<url>，4xx/5xx 视为失效
//   /rfile/...  → R2 head(key)，对象不存在视为失效
//   /cfile/...  → Telegram getFile(file_id)，ok=false 视为失效

export const runtime = 'edge';

const BATCH_LIMIT = 40; // 每批检测数量，控制 Worker 子请求数与执行时长

// 检测单个 URL 的源文件状态：'dead' | 'alive' | 'unknown'
async function checkSource(url, env) {
    try {
        if (url.startsWith('/file/')) {
            const res = await fetch(`https://telegra.ph${url}`, {
                method: 'GET',
                redirect: 'follow',
                signal: AbortSignal.timeout(8000),
            });
            // 只取响应头，不读 body，避免下载整图
            return res.status >= 400 ? 'dead' : 'alive';
        }

        if (url.startsWith('/rfile/')) {
            if (!env.IMGRS) return 'unknown';
            const key = url.slice('/rfile/'.length);
            const obj = await env.IMGRS.head(key);
            return obj === null ? 'dead' : 'alive';
        }

        if (url.startsWith('/cfile/')) {
            const token = env.TG_BOT_TOKEN;
            if (!token) return 'unknown';
            // 文件名格式：<随机串>-<telegram file_id>
            const name = url.slice('/cfile/'.length);
            const dash = name.indexOf('-');
            if (dash === -1) return 'unknown';
            const fileId = name.slice(dash + 1);
            const res = await fetch(
                `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
                { signal: AbortSignal.timeout(8000) }
            );
            const data = await res.json();
            // Telegram 在 file_id 有效时返回 ok:true；文件/消息被删时 ok:false
            return data.ok === true ? 'alive' : 'dead';
        }

        return 'unknown';
    } catch (error) {
        // 超时、断网等：无法确认，不当作失效
        return 'unknown';
    }
}

export async function POST(request) {
    const { env } = getRequestContext();
    try {
        const body = await request.json().catch(() => ({}));
        let offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Number(body.offset)) : 0;

        if (!env.IMG) {
            return Response.json(
                { success: false, message: 'IMG(D1) is not Set' },
                { status: 500 }
            );
        }

        // 全量候选（URL 一般几百到几千条，单行很小，一次取完可接受）
        const { results } = await env.IMG.prepare('SELECT url FROM imginfo ORDER BY id').all();
        const total = results.length;
        const batch = results.slice(offset, offset + BATCH_LIMIT);

        const dead = [];
        for (const row of batch) {
            const status = await checkSource(row.url, env);
            if (status === 'dead') dead.push(row.url);
        }

        if (dead.length > 0) {
            const placeholders = dead.map(() => '?').join(',');
            // 删除图片记录；同时清理其访问日志（源已失效，日志无保留意义）
            await env.IMG.prepare(`DELETE FROM imginfo WHERE url IN (${placeholders})`).bind(...dead).run();
            await env.IMG.prepare(`DELETE FROM tgimglog WHERE url IN (${placeholders})`).bind(...dead).run();
        }

        const checked = batch.length;
        // 删除会让表整体前移，下一批起点要扣除本批删除数，否则会漏检
        const nextOffset = offset + checked - dead.length;

        return Response.json({
            success: true,
            total,
            checked,
            deleted: dead,
            nextOffset,
            done: checked < BATCH_LIMIT,
        });
    } catch (error) {
        return Response.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
