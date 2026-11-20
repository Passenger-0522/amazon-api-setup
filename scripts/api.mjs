import { createHash, randomBytes } from "node:crypto";
import { credentialAccount, GROUPS, readApiCredentials, SetupError } from "./keychain.mjs";

const regions = new Map([
  ["na", { consent: "www.amazon.com", token: "api.amazon.com", ads: "advertising-api.amazon.com" }],
  ["eu", { consent: "eu.account.amazon.com", token: "api.amazon.co.uk", ads: "advertising-api-eu.amazon.com" }],
  ["fe", { consent: "apac.account.amazon.com", token: "api.amazon.co.jp", ads: "advertising-api-fe.amazon.com" }],
]);

function selectRegion(region) {
  const endpoints = regions.get(region);
  if (!endpoints) throw new SetupError("请选择 API 区域。");
  return endpoints;
}

async function requestJson(address, options, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(address, { ...options, redirect: "error", signal: AbortSignal.timeout(15_000) });
    return { ok: response.ok, status: response.status, body: await response.json() };
  } catch {
    throw new SetupError("无法取得 Amazon API 响应，请检查网络后重试。");
  }
}

function tokenError(result, onInvalidGrant) {
  switch (result.body?.error) {
    case "invalid_client":
      return new SetupError("Amazon 拒绝了应用凭据（invalid_client）。请核对同一应用的 LWA Client ID 和 Client Secret。");
    case "invalid_grant":
      return new SetupError(onInvalidGrant);
    default:
      return new SetupError(`Amazon 未返回所需的 Token（HTTP ${result.status}）。`);
  }
}

function requestToken(host, parameters, fetchImpl) {
  return requestJson(`https://${host}/auth/o2/token`, { method: "POST", body: new URLSearchParams(parameters) }, fetchImpl);
}

export async function verifyApi(group, region, store, fetchImpl = fetch) {
  if (!GROUPS.includes(group)) throw new SetupError("请选择要验证的 API。");
  const endpoints = selectRegion(region);
  const { clientId, clientSecret, refreshToken } = readApiCredentials(group, store);
  const token = await requestToken(group === "sp" ? "api.amazon.com" : endpoints.token, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  }, fetchImpl);
  const accessToken = token.body?.access_token;
  if (!token.ok || typeof accessToken !== "string" || !accessToken) {
    throw tokenError(token, "Refresh Token 无效、已失效或与应用不匹配（invalid_grant）。请核对或重新授权。");
  }
  const result = group === "sp"
    ? await requestJson(`https://sellingpartnerapi-${region}.amazon.com/sellers/v1/marketplaceParticipations`, {
        method: "GET",
        headers: {
          "x-amz-access-token": accessToken,
          "x-amz-date": new Date().toISOString().replace(/[-:]|\.\d{3}/g, ""),
          "user-agent": "AmazonApiSetup/1.0 (Language=JavaScript)",
        },
      }, fetchImpl)
    : await requestJson(`https://${endpoints.ads}/v2/profiles`, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}`, "amazon-advertising-api-clientid": clientId },
      }, fetchImpl);
  if (!result.ok) {
    throw new SetupError(`Token 兑换成功，数据接口返回 HTTP ${result.status}。请核对 API 区域及应用对该账户的权限。`);
  }
  const rows = group === "sp" ? result.body?.payload : result.body;
  if (!Array.isArray(rows)) throw new SetupError("Amazon 返回了与预期不同的数据结构。");
  return { count: rows.length };
}

function parseHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password && !url.hash) return url;
  } catch {
    // The response never contains the pasted address.
  }
  throw new SetupError("请输入完整的 HTTPS 地址。");
}

export function createAdsAuthorization(store, fetchImpl = fetch) {
  let pending;

  function begin({ redirectUri, region }) {
    if (pending?.busy || pending?.token) {
      throw new SetupError("上一笔兑换仍在处理。若已取得 Token，请用原回跳地址重试保存。");
    }
    const endpoints = selectRegion(region);
    if (typeof redirectUri !== "string") throw new SetupError("请输入已登记的回跳地址。");
    const redirect = redirectUri.trim();
    const callback = parseHttpsUrl(redirect);
    if (callback.searchParams.has("code") || callback.searchParams.has("state")) {
      throw new SetupError("请填写 Allowed Return URLs 里的原始回跳地址。");
    }
    const clientId = store.readSecret(credentialAccount("ads", "clientId"));
    if (!store.hasSecret(credentialAccount("ads", "clientSecret"))) {
      throw new SetupError("请先保存广告 API 的 Client Secret。");
    }
    const state = randomBytes(24).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const consent = new URL(`https://${endpoints.consent}/ap/oa`);
    consent.search = new URLSearchParams({
      client_id: clientId,
      scope: "advertising::campaign_management",
      response_type: "code",
      redirect_uri: redirect,
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    pending = { clientId, callback, redirect, state, verifier, endpoints, expiresAt: Date.now() + 30 * 60_000 };
    return consent.href;
  }

  async function redeem({ returnAddress }) {
    const grant = pending;
    if (!grant || Date.now() >= grant.expiresAt) throw new SetupError("请重新生成授权链接。");
    if (grant.busy) throw new SetupError("正在兑换，请稍等。");
    const returned = parseHttpsUrl(returnAddress);
    const source = grant.callback;
    const matchesQuery = [...new Set(source.searchParams.keys())].every(key =>
      JSON.stringify(source.searchParams.getAll(key)) === JSON.stringify(returned.searchParams.getAll(key)));
    if (returned.origin !== source.origin || returned.pathname !== source.pathname || !matchesQuery ||
        returned.searchParams.getAll("state").length !== 1 || returned.searchParams.get("state") !== grant.state) {
      throw new SetupError("回跳地址与本次授权不匹配。请粘贴授权完成后地址栏里的完整网址。");
    }
    const code = returned.searchParams.get("code");
    if (!code || returned.searchParams.getAll("code").length !== 1) {
      throw new SetupError("回跳地址中没有有效授权码。请确认你用正确的广告账户同意了本次授权。");
    }
    grant.busy = true;
    try {
      if (!grant.token) {
        if (store.readSecret(credentialAccount("ads", "clientId")) !== grant.clientId) {
          throw new SetupError("Client ID 已更新，请重新生成授权链接。");
        }
        const token = await requestToken(grant.endpoints.token, {
          grant_type: "authorization_code",
          code,
          redirect_uri: grant.redirect,
          client_id: grant.clientId,
          client_secret: store.readSecret(credentialAccount("ads", "clientSecret")),
          code_verifier: grant.verifier,
        }, fetchImpl);
        if (!token.ok || typeof token.body?.refresh_token !== "string" || !token.body.refresh_token) {
          throw tokenError(token, "授权码已失效、已使用或回跳地址有误（invalid_grant）。请重新授权，并在五分钟内兑换。");
        }
        grant.token = token.body.refresh_token;
        grant.expiresAt = Date.now() + 5 * 60_000;
        setTimeout(() => {
          delete grant.token;
          if (pending === grant) pending = undefined;
        }, 5 * 60_000).unref();
      }
      try {
        if (store.readSecret(credentialAccount("ads", "clientId")) !== grant.clientId) {
          pending = undefined;
          throw new SetupError("Client ID 已更新，请重新授权。");
        }
        store.writeSecret(credentialAccount("ads", "refreshToken"), grant.token);
      } catch (error) {
        if (!pending) throw error;
        throw new SetupError("已取得 Refresh Token。请解锁登录钥匙串，并在五分钟内用同一回跳地址重试保存。");
      }
      pending = undefined;
    } finally {
      grant.busy = false;
    }
  }

  return { begin, redeem };
}
