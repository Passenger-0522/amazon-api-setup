# 让其他本机 Agent 使用凭据

## 安装

把完整的 `amazon-api-setup` 目录放入 Codex 的用户 Skills 目录，默认为 `~/.codex/skills/`。打开新聊天调用 `$amazon-api-setup`。也可以在解压目录下直接用 Node.js 运行脚本。Skill 的文档和填写页随包提供。

## 只读验证

从 Skill 根目录运行以下命令。选择对应区域 `na`、`eu` 或 `fe`。输出只包含 API、区域和返回条数，凭据与账户明细在进程内处理。

```sh
node scripts/setup.mjs check sp na
node scripts/setup.mjs check ads na
```

## 供其他项目调用

保存与读取都使用当前 macOS 用户的**登录钥匙串**里的 `local.amazon-api-setup` 服务。Agent 与填写页应在同一个 Mac 用户下运行，钥匙串可读取时即可复用。页面关闭后仍可通过钥匙串读取。若 macOS 弹出权限窗口，由用户在系统窗口解锁或授权。

| API | Client ID | Client Secret | Refresh Token |
| --- | --- | --- | --- |
| SP-API | `sp_lwa_client_id` | `sp_lwa_client_secret` | `sp_lwa_refresh_token` |
| Ads API | `ads_lwa_client_id` | `ads_lwa_client_secret` | `ads_lwa_refresh_token` |

在自己的 Node.js 脚本中，从实际安装位置导入 `scripts/keychain.mjs` 的 `readApiCredentials`。该函数接受 `"sp"` 或 `"ads"`，返回 `{ clientId, clientSecret, refreshToken }`，可直接传给进程内的 API 客户端。需要单项值时，可用同模块的 `createKeychainStore().readSecret(account)`。在调用侧保留只读权限，日志仅记录状态和必要的错误码。

本机服务的 `GET /status` 只返回凭据项数。通过同一用户的本地进程调用钥匙串模块即可获得实际凭据。远程 Agent 需要在各自的执行环境使用其有权访问的凭据存储。

