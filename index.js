// Worker 的入口文件

// ----------------------------------------------
// 1. 常量与配置
// ----------------------------------------------
// Tuta Mail 登录页面的 URL
const TUTAMAIL_LOGIN_URL = "https://mail.tutanota.com/"; 

// KV 键名
const LAST_SUCCESS_KEY = "LAST_SUCCESS_ACCESS_TIMESTAMP";
const NEXT_INTERVAL_KEY = "NEXT_INTERVAL_DAYS";

// 登录间隔配置 (90±5 天)
const MIN_DAYS = 85;
const MAX_DAYS = 95;

const MS_IN_DAY = 24 * 60 * 60 * 1000;

// ----------------------------------------------
// 2. 核心功能：访问 Tuta 登录页
// ----------------------------------------------
/**
 * 访问 Tuta Mail 的登录页面。
 * @returns {Promise<boolean>} - 访问成功（状态码 200-299）返回 true，否则返回 false。
 */
async function accessTutaLoginPage() {
    try {
        const response = await fetch(TUTAMAIL_LOGIN_URL, {
            method: 'GET',
            headers: {
                // 模拟正常的浏览器访问
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            redirect: 'follow'
        });

        const success = response.ok; // 状态码 200-299
        if (!success) {
            console.error(`访问 Tuta 登录页失败，状态码: ${response.status}`);
        }
        return success;

    } catch (error) {
        console.error("访问过程中发生网络错误:", error.message);
        return false;
    }
}

// ----------------------------------------------
// 3. Telegram 通知功能 (使用 Secrets)
// ----------------------------------------------

/**
 * 发送通知到 Telegram。
 * @param {string} message - 要发送的消息。
 * @param {Env} env - 环境变量对象。
 */
async function sendTelegramNotification(message, env) {
    const botToken = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("未设置 Telegram Token 或 Chat ID，跳过通知。");
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (error) {
        console.error("发送 Telegram 通知失败:", error.message);
    }
}

// ----------------------------------------------
// 4. 调度逻辑
// ----------------------------------------------

/**
 * 生成一个在 [MIN_DAYS, MAX_DAYS] 范围内的随机天数。
 * @returns {number} - 随机天数。
 */
function getRandomLoginDays() {
    return Math.floor(Math.random() * (MAX_DAYS - MIN_DAYS + 1)) + MIN_DAYS;
}

/**
 * 检查是否到了需要尝试访问的日期。
 * @param {number} lastSuccessTimestamp - 上次成功访问的时间戳（毫秒）。
 * @param {Env} env - 环境变量对象。
 * @returns {Promise<boolean>} - 如果需要尝试访问返回 true，否则返回 false。
 */
async function shouldAttemptAccess(lastSuccessTimestamp, env) {
    // 如果是第一次运行，立即尝试
    if (!lastSuccessTimestamp) {
        return true;
    }

    const now = Date.now();
    const daysSinceLastSuccess = (now - lastSuccessTimestamp) / MS_IN_DAY;

    // 从 KV 读取上次计算出的下一个间隔天数
    let nextIntervalDaysStr = await env.TUTAMAIL_KV.get(NEXT_INTERVAL_KEY);
    let nextIntervalDays = nextIntervalDaysStr ? parseInt(nextIntervalDaysStr, 10) : getRandomLoginDays();

    // 访问失败后，要求每天至少访问一次
    // 如果上次成功访问的时间到现在还没到80天（90-10），我们跳过更详细的检查。
    if (daysSinceLastSuccess < MIN_DAYS - 5) {
        return false;
    }

    // 检查是否已经到达或超过下一个预期的登录日
    // 如果上次是成功访问，那么只有当 daysSinceLastSuccess >= nextIntervalDays 时才需要再次访问。
    // 如果上次是失败访问 (KV 未更新)，那么 daysSinceLastSuccess 可能会超过 nextIntervalDays，此时 Cron 每天触发，我们都需要尝试。
    if (daysSinceLastSuccess >= nextIntervalDays) {
        return true;
    }

    // 首次运行或上次 KV 读取失败，写入随机间隔并返回 True
    if (!nextIntervalDaysStr) {
        await env.TUTAMAIL_KV.put(NEXT_INTERVAL_KEY, nextIntervalDays.toString());
        return true;
    }
    
    return false;
}

/**
 * 处理 Cron Triggers 调度事件。
 */
async function handleScheduledEvent(event, env) {
    // 从 KV 存储中读取上次成功访问的时间戳
    const lastSuccessTimestampStr = await env.TUTAMAIL_KV.get(LAST_SUCCESS_KEY);
    const lastSuccessTimestamp = lastSuccessTimestampStr ? parseInt(lastSuccessTimestampStr, 10) : 0;
    
    // 检查是否需要触发主要访问
    let shouldAccess = await shouldAttemptAccess(lastSuccessTimestamp, env);

    if (!shouldAccess) {
        const nextIntervalDays = await env.TUTAMAIL_KV.get(NEXT_INTERVAL_KEY) || '未知';
        const daysSince = lastSuccessTimestamp ? Math.floor((Date.now() - lastSuccessTimestamp) / MS_IN_DAY) : 0;
        console.log(`未到访问时间。上次成功: ${daysSince} 天前。目标间隔: ${nextIntervalDays} 天。`);
        return;
    }
    
    // **随机延迟 (满足晚上8点到夜里11点随机时刻)**
    // 假设 Cron Trigger 设置为每天触发一次（例如 00:00 UTC）。
    // 我们在这里添加一个 **随机延迟** 来模拟每天的随机时刻。
    // 延迟时间设定在 20:00 到 23:00 (10800000 毫秒) 的区间内随机。
    // WARNING: Cloudflare Worker 限制执行时间（通常是 50ms 到 30s）。
    // **为了安全，我们不进行长时间的 `setTimeout`，而是要求您配置 Cron Trigger 在目标时间段内多次触发。**
    // **最优方案：** 将 Cron Trigger 设置为 `0 20-23 * * *` (每天 20:00, 21:00, 22:00, 23:00 UTC 触发)
    
    const accessSuccessful = await accessTutaLoginPage();
    
    let notificationMessage = "";

    if (accessSuccessful) {
        const nowTimestamp = Date.now();
        
        // 1. 更新上次成功的时间戳
        await env.TUTAMAIL_KV.put(LAST_SUCCESS_KEY, nowTimestamp.toString());
        
        // 2. 计算下一个随机间隔并保存
        const nextIntervalDays = getRandomLoginDays(); 
        await env.TUTAMAIL_KV.put(NEXT_INTERVAL_KEY, nextIntervalDays.toString());
        
        const nextDate = new Date(nowTimestamp + nextIntervalDays * MS_IN_DAY).toLocaleDateString("zh-CN");
        
        notificationMessage = 
            `✅ *Tuta Mail 保活访问成功!* \n` +
            `\n` +
            `**邮箱:** ${env.TUTA_EMAIL} (仅作参考)\n` +
            `**时间:** ${new Date(nowTimestamp).toLocaleString("zh-CN")}\n` +
            `**下次目标间隔:** ${nextIntervalDays} 天\n` +
            `**下次目标日期大约在:** ${nextDate}`;
        
    } else {
        // 访问失败，不更新 KV 存储，Cron Trigger 会在下次触发时（每天）再次尝试。
        notificationMessage = 
            `❌ *Tuta Mail 保活访问失败!* \n` +
            `\n` +
            `**邮箱:** ${env.TUTA_EMAIL} (仅作参考)\n` +
            `**时间:** ${new Date().toLocaleString("zh-CN")}\n` +
            `**原因:** 访问 Tuta 登录页返回非 2xx 状态码或发生网络错误。\n` +
            `**Worker 将在 Cron Trigger 设定的下次时间再次尝试。**`;
    }

    await sendTelegramNotification(notificationMessage, env);
}

// ----------------------------------------------
// 5. Worker 导出
// ----------------------------------------------

export default {
    // Worker 仅响应调度事件 (Cron Trigger)
    async scheduled(event, env, ctx) {
        ctx.waitUntil(handleScheduledEvent(event, env));
    },
    // 处理 HTTP 请求 (可选，用于手动触发测试)
    async fetch(request, env, ctx) {
        // 仅允许 GET 请求作为测试
        if (request.method === 'GET' && new URL(request.url).pathname.includes("/test-trigger")) {
             ctx.waitUntil(handleScheduledEvent(null, env));
             return new Response("手动触发保活 Worker 运行中...", { status: 202 });
        }
        return new Response("Tuta Mail 保活 Worker 运行中...", { status: 200 });
    }
};
