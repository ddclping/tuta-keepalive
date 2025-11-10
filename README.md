# tuta-keepalive
要求功能,实现方法,对应代码/配置
1. 自动登录保活（核心功能）,访问 Tuta 登录页：不执行复杂的加密登录，仅通过 fetch 请求访问 Tuta Mail 的主登录 URL (https://mail.tutanota.com/)，模拟用户浏览器访问行为来触发保活记录。,accessTutaLoginPage 函数
2. 支持 Secrets 安全环境变量,安全存储凭证：您的敏感信息（如 Telegram Token 和 Chat ID）都作为 Secrets (秘密变量) 存储在 Cloudflare 中，无法通过代码或日志泄露。,"Settings -> Secrets 配置 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
3. 访问状态通知到 Telegram,通知函数：使用 sendTelegramNotification 函数，通过 Telegram Bot API 发送运行结果（成功/失败）到您的私人聊天。,代码中 sendTelegramNotification 函数，依赖 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID
4. 固定时间间隔登录（90±5天）,KV 存储与随机调度：每次成功后，Worker 会将下次登录间隔随机设置为 85 到 95 天，并存储在 KV 中。只有达到或超过这个天数，Worker 才会执行访问。,KV Key: NEXT_INTERVAL_DAYS，随机函数 getRandomLoginDays
5. 登录失败则每天至少访问一次,容错机制：如果 Tuta Mail 登录页访问失败，Worker 不会更新 KV 中的 LAST_SUCCESS_ACCESS_TIMESTAMP。由于 Cron Trigger 每天触发，Worker 每天都会发现上次成功时间已超过阈值，从而每天尝试访问，直到成功为止。,accessSuccessful 为 false 时，不更新 KV
6. 登录成功后计算下一个日期,状态更新：只有当 accessTutaLoginPage 返回 true 时，Worker 才会更新 KV 中的 LAST_SUCCESS_ACCESS_TIMESTAMP，从而重置 90±5 天的计时器。,accessSuccessful 为 true 时，更新 KV Key: LAST_SUCCESS_ACCESS_TIMESTAMP
7. 随机时刻访问（如晚上8-11点）,Cron Triggers 配置：通过 Cron 表达式 0 20-23 * * * (或您自定义的表达式)，确保 Worker 仅在您期望的随机时间段内被 Cloudflare 调度执行。,Triggers -> Cron Triggers 配置
8. 界面操作部署（无终端）,Cloudflare UI：整个过程完全通过 Cloudflare 仪表盘完成，包括 Worker 代码编辑、KV 存储绑定和环境变量设置。,Workers & Pages 界面操作
