export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

// R2 免费额度（每月）
const FREE = {
  storageBytes: 10 * 1024 ** 3, // 10 GB
  classA: 1_000_000,
  classB: 10_000_000,
};

// B 类操作（读取）：Get/Head；其余计入 A 类（写入/列举/删除/分片）
const CLASS_B = /^(Get|Head)/i;

export async function OPTIONS() {
  return new Response(null, { headers: corsHeaders });
}

export async function GET() {
  const { env } = getRequestContext();
  const token = env.CF_API_TOKEN;
  const accountId = env.CF_ACCOUNT_ID || '9b7efdccd0ad577cc8a891bd8abeea73';

  if (!token) {
    return Response.json({
      success: false,
      message: 'CF_API_TOKEN 未配置',
    }, { status: 503, headers: corsHeaders });
  }

  // 本月 1 日 00:00 UTC 起，到当前；存储取近 3 天最新一天的 max
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();
  const nowIso = now.toISOString();

  const query = `{
    viewer {
      accounts(filter: {accountTag: "${accountId}"}) {
        storage: r2StorageAdaptiveGroups(limit: 10, filter: {datetime_geq: "${threeDaysAgo}", datetime_leq: "${nowIso}"}) {
          dimensions { date bucketName }
          max { payloadSize metadataSize objectCount }
        }
        operations: r2OperationsAdaptiveGroups(limit: 100, filter: {datetime_geq: "${monthStart}", datetime_leq: "${nowIso}"}) {
          dimensions { actionType }
          sum { requests }
        }
        bandwidth: r2BandwidthUsageAdaptiveGroups(limit: 10, filter: {datetime_geq: "${monthStart}", datetime_leq: "${nowIso}"}) {
          sum { bytesDownload bytesUpload }
        }
      }
    }
  }`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    clearTimeout(tid);

    const json = await res.json();
    if (json.errors || !json.data) {
      return Response.json({
        success: false,
        message: json.errors?.[0]?.message || 'Analytics 查询失败',
      }, { status: 502, headers: corsHeaders });
    }

    const account = json.data.viewer.accounts[0];

    // 存储：取日期最新的一组 max
    let storageBytes = 0, objects = 0;
    const storageGroups = (account.storage || []).slice().sort(
      (a, b) => (a.dimensions.date < b.dimensions.date ? 1 : -1)
    );
    if (storageGroups[0]) {
      const m = storageGroups[0].max;
      storageBytes = Number(m.payloadSize || 0) + Number(m.metadataSize || 0);
      objects = Number(m.objectCount || 0);
    }

    // 操作分类累计
    let classA = 0, classB = 0;
    for (const g of account.operations || []) {
      const n = Number(g.sum.requests || 0);
      if (CLASS_B.test(g.dimensions.actionType || '')) classB += n;
      else classA += n;
    }

    // 出站/入站流量（出站始终免费）
    let bytesDownload = 0, bytesUpload = 0;
    for (const g of account.bandwidth || []) {
      bytesDownload += Number(g.sum.bytesDownload || 0);
      bytesUpload += Number(g.sum.bytesUpload || 0);
    }

    return Response.json({
      success: true,
      storage: { used: storageBytes, limit: FREE.storageBytes, objects },
      classA: { used: classA, limit: FREE.classA },
      classB: { used: classB, limit: FREE.classB },
      bandwidth: { download: bytesDownload, upload: bytesUpload },
      month: now.toISOString().slice(0, 7),
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({
      success: false,
      message: error.name === 'AbortError' ? '请求超时' : error.message,
    }, { status: 500, headers: corsHeaders });
  }
}
