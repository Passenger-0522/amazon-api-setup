import { spawnSync } from "node:child_process";

export const SERVICE = "local.amazon-api-setup";
export const GROUPS = Object.freeze(["sp", "ads"]);
const fields = Object.freeze(["clientId", "clientSecret", "refreshToken"]);
const suffixes = { clientId: "client_id", clientSecret: "client_secret", refreshToken: "refresh_token" };
const controlCharacters = /[\x00-\x1f\x7f]/;

export class SetupError extends Error {}

export function credentialAccount(group, field) {
  if (!GROUPS.includes(group) || !fields.includes(field)) throw new SetupError("凭据名称无效。");
  return `${group}_lwa_${suffixes[field]}`;
}

export function createKeychainStore({ service = SERVICE } = {}) {
  if (process.platform !== "darwin") throw new SetupError("本机填写页需要 macOS 登录钥匙串。");
  if (!/^[a-z0-9.-]{1,150}$/i.test(service)) throw new SetupError("钥匙串服务名称无效。");
  const run = (args, input) => spawnSync("/usr/bin/security", args, {
    input, encoding: "utf8", timeout: 12_000, maxBuffer: 256_000,
  });
  const lookup = run(["login-keychain"]);
  const keychainPath = lookup.stdout?.trim().match(/^"([^"\\\r\n]+)"$/)?.[1];
  if (lookup.status !== 0 || !keychainPath?.startsWith("/")) {
    throw new SetupError("找不到当前 macOS 用户的登录钥匙串。");
  }

  function find(account, readValue) {
    if (!/^(sp|ads)_lwa_(client_id|client_secret|refresh_token)$/.test(account)) throw new SetupError("凭据名称无效。");
    return run(["find-generic-password", "-s", service, "-a", account, ...(readValue ? ["-w"] : []), keychainPath]);
  }

  function hasSecret(account) {
    return find(account, false).status === 0;
  }

  function readSecret(account) {
    const result = find(account, true);
    const value = result.stdout?.replace(/[\r\n]+$/, "");
    if (result.status !== 0 || !value) {
      if (result.status === 44) throw new SetupError("缺少所选 API 的凭据，请先在本机填写页保存。");
      throw new SetupError("macOS 未允许读取凭据，请解锁登录钥匙串并在系统提示中授权。");
    }
    return value;
  }

  function writeSecret(account, value) {
    if (!/^(sp|ads)_lwa_(client_id|client_secret|refresh_token)$/.test(account)) throw new SetupError("凭据名称无效。");
    if (typeof value !== "string" || !value || controlCharacters.test(value) || !value.isWellFormed()) {
      throw new SetupError("凭据包含无效字符。");
    }
    const quotedValue = '"' + value.replace(/["\\]/g, "\\$&") + '"';
    // Pass the value on stdin so it is absent from the Security process arguments.
    const command = `add-generic-password -U -a ${account} -s ${service} -w ${quotedValue} "${keychainPath}"\n`;
    if (Buffer.byteLength(command) >= 4096) throw new SetupError("凭据超过 macOS 钥匙串命令的长度限制。");
    const written = run(["-i"], command);
    if (written.status !== 0 || readSecret(account) !== value) throw new SetupError("钥匙串写入失败，请确认已解锁。");
  }

  return { hasSecret, readSecret, writeSecret };
}

export function readApiCredentials(group, store = createKeychainStore()) {
  return Object.fromEntries(fields.map(field => [field, store.readSecret(credentialAccount(group, field))]));
}

export function setupStatus(store) {
  return Object.fromEntries(GROUPS.map(group => [group, fields.filter(field => store.hasSecret(credentialAccount(group, field))).length]));
}

export function saveCredentials(group, values, store) {
  const supplied = Object.entries(values ?? {});
  if (!GROUPS.includes(group) || !supplied.length || supplied.some(([field, value]) =>
    !fields.includes(field) || typeof value !== "string" || value.length > 8192 || controlCharacters.test(value))) {
    throw new SetupError("请填写有效的凭据。");
  }
  const entries = supplied.map(([field, value]) => [field, value.trim()]).filter(([, value]) => value);
  if (!entries.length) throw new SetupError("请至少填写一项凭据。");
  let updated = 0;
  for (const [field, value] of entries) {
    try {
      store.writeSecret(credentialAccount(group, field), value);
      updated++;
    } catch (error) {
      const reason = error instanceof SetupError ? error.message : "请检查 macOS 钥匙串授权后重试。";
      throw new SetupError(`已保存 ${updated} 项。${reason}`);
    }
  }
  return updated;
}
