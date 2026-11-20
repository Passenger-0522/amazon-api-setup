# 配置 Amazon SP-API 和 Ads API

两套 API 各有一组 **LWA Client ID、Client Secret、Refresh Token**。先确定要授权的店铺或广告账户和区域，再使用该应用自己的三项凭据。

## 启动本机填写页

在 macOS 上安装 Node.js 22 或更高版本。在解压后的 Skill 根目录执行 `node scripts/setup.mjs`，打开终端显示的地址，默认是 `http://127.0.0.1:8793/`。保持服务运行直到完成。端口有冲突时，执行 `node scripts/setup.mjs serve --port 8794`，使用新的本机地址。 [Node.js 官方下载](https://nodejs.org/en/download)

## SP-API

1. 用注册该应用的开发者账户打开 **Solution Provider Portal → Develop Apps**，找到自己的应用并点 **Edit app**。Seller Central 内可以从 **Apps and Services → Develop Apps** 进入同一管理流程。首次接入先注册开发者与应用，并为所需数据申请对应角色。 [开发者门户](https://solutionproviderportal.amazon.com/) · [SP-API 开发者注册](https://developer-docs.amazon.com/sp-api/docs/onboarding-overview)
2. 打开 **LWA credentials → View**，从弹窗中复制 **LWA Client ID** 和 **Client Secret**。把这两项填到本机页的 **SP-API** 区，保存。开发者页面列出的 Application ID 用于标识应用，LWA 凭据弹窗里的 Client ID 用于 Token 请求。 [官方查看凭据步骤](https://developer-docs.amazon.com/sp-api/docs/viewing-your-application-information-and-credentials)
3. **私有应用**由卖家主账户在该应用的 **Authorize / Manage Authorizations** 页面选择授权店铺，再点 **Authorize app** 生成 Refresh Token。复制完整值并保存到 SP-API 区。每次点 Authorize app 会生成新 Token，Amazon 说明原来的 Token 不会因这一步而失效。**公开应用**走应用的正式 OAuth 流程，由卖家授权后由应用换取 Token。 [私有应用自授权](https://developer-docs.amazon.com/sp-api/docs/self-authorization) · [公开应用 OAuth 流程](https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow)
4. 选择北美、欧洲或远东，点 SP-API 区的 **验证连接**。页面会测试 LWA 访问令牌交换，以及站点参与状态的只读查询。 [SP-API 区域](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints) · [站点参与状态接口](https://developer-docs.amazon.com/sp-api/reference/getmarketplaceparticipations)

## Amazon Ads API

1. 在 **Login with Amazon 控制台**打开广告 API 已批准的原 **Security Profile**，点 **Show Client ID and Client Secret**。把这两个值填到本机页的 **Amazon Ads API** 区并保存。首次接入要按自己的身份选择 **Direct advertiser** 或 **Partner** 申请访问，并按批准流程关联对应的 LWA 应用。 [Login with Amazon 控制台](https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html) · [广告 API 申请](https://advertising.amazon.com/about-api)
2. 在同一个 LWA 应用的 **Manage → Web Settings → Allowed Return URLs** 找到允许返回的 **HTTPS 地址**。原样复制到本机填写页，包括路径和最后的斜杠。如果列表为空，由应用管理者登记一个 HTTPS 回跳地址。Amazon 文档以 `https://www.amazon.com` 演示手工从地址栏取码。填写时以控制台登记的实际字符串为准。本机填写页的 HTTP 地址只用于本机输入。 [官方回跳和授权说明](https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/authorization-grants)
3. 选择广告账户所在区域，再点 **生成授权链接**。使用该页面保留的授权链接，亲自打开 Amazon 页面，以正确的广告账户同意授权。本机服务准备 `state` 和 PKCE 校验参数，按区域选择 Amazon 的授权和 Token 服务。常规广告账户的广告 API 使用 `advertising::campaign_management` 授权范围。本 Skill 的连接验证只读取账户配置。 [官方 OAuth 参数](https://advertising.amazon.com/API/docs/en-us/guides/account-management/authorization/authorization-grants)
4. 同意后，从浏览器地址栏复制**完整回跳网址**，贴到刚才的本机页面，点 **兑换并保存 Refresh Token**。网址包含一次性的 `code` 和对应的 `state`。授权码只能使用一次，五分钟内兑换。成功后 `refresh_token` 直接存入本机钥匙串。若重新打开了填写页或重启了服务，重新生成一条授权链接再授权。
5. 点广告 API 区的 **验证连接**，查看所选区域能否读取广告账户配置。手头已有同一应用与账户对应的有效 Refresh Token 时，可直接填表，跳过生成链接和兑换步骤。

## 常见结果

| 页面或错误 | 怎么处理 |
| --- | --- |
| **3/3 已保存** | 已存入钥匙串。点「验证连接」确认 Amazon 接受凭据。 |
| `401 invalid_client` | 在同一应用的 LWA 凭据弹窗重新核对 Client ID 和 Client Secret。SP-API 优先检查是否复制了 Application ID 字段。 |
| `invalid_grant` | 核对 Refresh Token 所属应用与店铺或广告账户。兑换授权码时，核对回跳地址和时效，再发起新授权。 |
| 已兑换，钥匙串未保存 | 解锁登录钥匙串，按页面提示在五分钟内使用同一回跳网址重试保存。 |
| 只读接口返回 403 或 0 条 | 核对区域、应用角色和要查询的账户权限。凭据保存状态本身无法判定数据权限。 |

