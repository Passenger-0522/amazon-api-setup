# Amazon API 配置 Skill

为自己的店铺配置 Amazon SP-API 和 Amazon Ads API。配套 macOS 本机页面用于保存凭据、生成广告 OAuth 授权链接、兑换 Refresh Token 和验证只读连接。

## 使用方法

1. 从 [Releases](https://github.com/Passenger-0522/amazon-api-setup/releases/latest) 下载 `amazon-api-setup.zip` 并解压。
2. 将解压后的 `amazon-api-setup` 目录放进 `~/.codex/skills/`，在新聊天里调用 `$amazon-api-setup`。
3. 也可以在解压目录运行 `node scripts/setup.mjs`，打开终端显示的本机地址。填写页需要 macOS 和 Node.js 22 或更高版本。

[两套 API 的配置指南](references/configuration.md) · [本机 Agent 接入指南](references/local-agent.md)

凭据由每个使用者在自己的 Mac 上填写并存入登录钥匙串。源码和发布包仅包含通用文档和本机工具。
