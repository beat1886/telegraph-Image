import { getRequestContext } from '@cloudflare/next-on-pages';
import { runCleanBatch } from '@/lib/cleanInvalid';

// 定时清理失效图片接口：供外部调度器（GitHub Actions cron）调用。
// 该路径不在 middleware 保护范围内，改用环境变量 CRON_SECRET 鉴权：
//   请求头 Authorization: Bearer <CRON_SECRET>
// 每次调用只处理一批（40 张），调用方依据返回的 nextOffset/done 循环，
// 避免单次 Worker 调用超出子请求数与执行时长限制。

export const runtime = 'edge';

export async function POST(request) {
    const { env } = getRequestContext();
    try {
        if (!env.CRON_SECRET) {
            return Response.json(
                { success: false, message: 'CRON_SECRET is not Set' },
                { status: 503 }
            );
        }

        const auth = request.headers.get('Authorization') || '';
        if (auth !== `Bearer ${env.CRON_SECRET}`) {
            return Response.json(
                { success: false, message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json().catch(() => ({}));
        const offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Number(body.offset)) : 0;

        const result = await runCleanBatch(env, offset);
        return Response.json({ success: true, ...result });
    } catch (error) {
        return Response.json(
            { success: false, message: error.message },
            { status: 500 }
        );
    }
}
