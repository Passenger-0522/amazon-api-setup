---
name: amazon-api-setup
description: 配置和验证 Amazon Selling Partner API（SP-API）与 Amazon Ads API。用于查找 LWA Client ID 和 Client Secret、生成 Refresh Token、处理 Ads OAuth 回跳、在 macOS 本机表单保存凭据，或让同一用户下的 Agent 在进程内复用凭据。
---

# Amazon API 配置

- 用户只问官方入口或取值方法时，读 [配置指南](references/configuration.md)，按 SP-API 或 Ads API 给出对应步骤。
- 用户要填写页时，在 Skill 根目录运行 `node scripts/setup.mjs`，保留服务进程，并交付终端提示的本机地址。运行环境为 macOS 和 Node.js 22 或更高版本。端口占用时用 `node scripts/setup.mjs serve --port 8794`。在其他系统也可使用配置指南，凭据应接入该系统的安全存储。
- 用户亲自在 Amazon 开发者门户或广告授权页完成登录、设置与同意授权。Agent 可以启动本机页、协助用户准备 Ads OAuth 链接，并在授权范围内运行只读验证。页面在用户提交回跳地址时兑换并保存 Refresh Token。
- 凭据及带授权码的回跳地址由用户填在本机页。正式值只在调用进程和 macOS 登录钥匙串中处理。向用户反馈保存项数、验证步骤和必要的错误码。在分享包里只放 Skill 源码和通用文档。
- 把 `3/3 已保存` 与 API 已连通分开报告。用户点「验证连接」或授权 Agent 执行 `node scripts/setup.mjs check <sp|ads> <na|eu|fe>` 后，根据实际返回报告结果。若返回零条，提示核对区域和账户授权；若 LWA 拒绝，先区分 `invalid_client` 和 `invalid_grant`。
- 其他本机 Agent 要读取或测试时，读 [本机 Agent 接入](references/local-agent.md)。复用同一 OS 用户的钥匙串，并遵守当前工作区的 Amazon 账号和写入授权范围。

