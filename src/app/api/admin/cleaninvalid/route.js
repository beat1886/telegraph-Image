import { getRequestContext } from '@cloudflare/next-on-pages';
import { runCleanBatch } from '@/lib/cleanInvalid';

// 一键清空失效图片：分批检测 imginfo 中每条记录的源文件是否还存在
// 鉴权由 middleware 统一处理（仅 admin）；检测逻辑见 @/lib/cleanInvalid

export const runtime = 'edge';

export async function POST(request) {
    const { env } = getRequestContext();
    try {
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
