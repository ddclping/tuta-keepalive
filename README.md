Tuta Mail 邮箱自动保活 cf-Worker 方案

一、目标与实现方法

本方案旨在利用 Cloudflare Workers 及其配套服务，在不使用实际邮箱密码的情况下，实现 Tuta Mail 邮箱的定期自动“保活”访问，以满足 Tuta Mail 至少六个月登录一次的防删除要求。

二、方案核心组件

Cloudflare Worker (JavaScript 代码): 运行保活逻辑的主体。

Cloudflare KV (Key-Value 存储): 用于持久化存储上次成功访问的时间戳和下次随机访问的间隔天数。

Cron Triggers: 用于按照预设的时间表自动触发 Worker 运行。

Secrets 环境变量: 安全存储 Telegram 通知所需的 Bot Token 和 Chat ID。

三、具体功能实现

自动保活机制: Worker 运行核心函数，通过发送 GET 请求访问 Tuta Mail 的主登录页面（例如 [可疑链接已删除]），模拟用户行为。此方法绕过了复杂的密码加密和登录流程。

安全凭证存储: 邮箱地址 (TUTA_EMAIL) 仅用于通知文本，Telegram 凭证 (TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID) 作为 Secrets 存储，保障信息安全。

精准调度（90±5天）:

KV 键值: LAST_SUCCESS_ACCESS_TIMESTAMP 记录上次成功时间。NEXT_INTERVAL_DAYS 存储 85 到 95 天之间的随机间隔。

逻辑: Worker 检查当前时间与上次成功时间是否超过 NEXT_INTERVAL_DAYS 存储的天数。只有超过阈值才执行访问。

容错机制（失败后每日重试）: 如果访问 Tuta Mail 登录页失败，Worker 不会更新 LAST_SUCCESS_ACCESS_TIMESTAMP。由于 Cron Triggers 每天或每天多次触发，Worker 会在下一次触发时自动再次尝试访问，直到成功为止。

随机时间访问: Cron Triggers 设置为在特定的夜晚时间段（例如 UTC 20:00-23:00）多次触发，由 Worker 内部逻辑决定是否在这些触发点执行访问。

状态通知: 使用 sendTelegramNotification 函数，将访问结果（成功或失败）以及下次目标访问日期通过 Telegram Bot 发送给用户。

部署方式: 所有操作均在 Cloudflare 的 Web UI 界面上完成，无需使用命令行或终端工具。

四、关键配置项

Worker 内部 KV 变量名: TUTAMAIL_KV

Cron Trigger 示例: 0 20-23 * * * (每天 UTC 20点到23点每小时触发)

五、运行状态

方案已成功部署并经过手动测试。首次运行已成功访问 Tuta Mail 登录页，Telegram 通知已收到，KV 存储已更新，计时器已重置为下一个随机间隔。Worker 将根据 Cron Triggers 设定的频率自动运行。
