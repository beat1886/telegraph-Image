export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};


function getContentType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'json': 'application/json',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'mkv': 'video/x-matroska'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}


export async function OPTIONS(request) {
  return new Response(null, {
    headers: corsHeaders
  });
}

// 判断Referer是否允许


export async function GET(request, { params }) {
  const { name } = params
  let { env, cf, ctx } = getRequestContext();

  let req_url = new URL(request.url);

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return Response.json({
      status: 500,
      message: `TG_BOT_TOKEN or TG_CHAT_ID is not Set`,
      success: false
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.socket?.remoteAddress;
  const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
  const Referer = request.headers.get('Referer') || "Referer";
  const isAllowedReferer = Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`;

  const cacheKey = new Request(req_url.toString(), request);
  const cache = caches.default;

  // 缓存优先：命中边缘缓存时直接返回，不做 D1 查询，日志异步记录不阻塞响应
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    if (!isAllowedReferer) {
      ctx.waitUntil(logRequest(env, name, Referer, clientIp));
    }
    return cachedResponse
  }

  // 未命中缓存才查鉴黄（D1），失败不阻塞图片展示
  try {
    const rating = await getRating(env.IMG, `/cfile/${name}`);
    if (rating === 3 && !isAllowedReferer) {
      ctx.waitUntil(logRequest(env, name, Referer, clientIp));
      return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
    }
  } catch (error) {
    console.log(error);
  }


  try {
    const file_path = await getFile_path(env, name);
    const fileName = file_path.split('/').pop();

    if (file_path === "error") {
      return Response.json({
        status: 500,
        message: ` ${error.message}`,
        success: false
      }
        , {
          status: 500,
          headers: corsHeaders,
        })

    } else {
      const res = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${file_path}`);

      if (res.ok) {
        const fileBuffer = await res.arrayBuffer();

        const contentType = getContentType(fileName);
        const isImage = contentType.startsWith('image/');
        const responseHeaders = {
          // 图片内联直接显示，其他类型走下载
          "Content-Disposition": `${isImage ? 'inline' : 'attachment'}; filename=${fileName}`,
          "Access-Control-Allow-Origin": "*",
          "Content-Type": contentType,
          // 浏览器缓存 1 天，CDN/边缘缓存 7 天，二次访问秒开
          "Cache-Control": "public, max-age=86400, s-maxage=604800"
        };
        const response_img = new Response(fileBuffer, {
          headers: responseHeaders
        });

        ctx.waitUntil(cache.put(cacheKey, response_img.clone()));
        if (!isAllowedReferer && env.IMG) {
          ctx.waitUntil(logRequest(env, name, Referer, clientIp));
        }
        return response_img;
      } else {
        return Response.json({
          status: 500,
          message: `Telegram file download failed: ${res.status}`,
          success: false
        }
          , {
            status: 502,
            headers: corsHeaders,
          })
      }
    }
  } catch (error) {
    return Response.json({
      status: 500,
      message: ` ${error.message}`,
      success: false
    }
      , {
        status: 500,
        headers: corsHeaders,
      })
  }


}




async function getFile_path(env, file_id) {
  try {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${file_id}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        "User-Agent": " Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome"
      },
    })

    let responseData = await res.json();

    if (responseData.ok) {
      const file_path = responseData.result.file_path
      return file_path
    } else {
      return "error";
    }
  } catch (error) {
    return "error";

  }


}



// 插入 tgimglog 记录
async function insertTgImgLog(DB, url, referer, ip, time) {
  const iImglog = await DB.prepare('INSERT INTO tgimglog (url, referer, ip, time) VALUES (?, ?, ?, ?)')
    .bind(url, referer, ip, time)
    .run();
}



// 从数据库获取鉴黄信息
async function getRating(DB, url) {
  const ps = DB.prepare(`SELECT rating FROM imginfo WHERE url='${url}'`);
  const result = await ps.first();
  return result ? result.rating : null;
}





async function get_nowTime() {
  const options = {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  const timedata = new Date();
  const formattedDate = new Intl.DateTimeFormat('zh-CN', options).format(timedata);

  return formattedDate

}


// 异步日志记录
async function logRequest(env, name, referer, ip) {
  try {
    const nowTime = await get_nowTime()
    await insertTgImgLog(env.IMG, `/cfile/${name}`, referer, ip, nowTime);
    const setData = await env.IMG.prepare(`UPDATE imginfo SET total = total +1 WHERE url = '/rfile/${name}';`).run()
  } catch (error) {
    console.error('Error logging request:', error);
  }
}