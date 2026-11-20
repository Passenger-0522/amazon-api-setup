import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createAdsAuthorization, verifyApi } from "./api.mjs";
import { createKeychainStore, saveCredentials, setupStatus, SetupError } from "./keychain.mjs";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 8793;
const assets = new Map([
  ["/", ["page.html", "text/html"]],
  ["/page.js", ["page.js", "text/javascript"]],
]);

function send(response, status, body, type = "application/json") {
  response.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  response.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function readPayload(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new SetupError("请求内容过长。");
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new SetupError("请求格式无效。");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SetupError("请求格式无效。");
  return body;
}

export function createSetupServer({ store = createKeychainStore(), fetchImpl = fetch } = {}) {
  const ads = createAdsAuthorization(store, fetchImpl);
  const files = new Map([...assets].map(([route, [filename, type]]) => [
    route, [readFileSync(new URL(filename, import.meta.url)), type],
  ]));
  const actions = new Map([
    ["/credentials", ({ group, values }) => ({ updated: saveCredentials(group, values, store), status: setupStatus(store) })],
    ["/ads/authorize", body => ({ consentUrl: ads.begin(body) })],
    ["/ads/redeem", async body => {
      await ads.redeem(body);
      return { status: setupStatus(store) };
    }],
    ["/verify", ({ group, region }) => verifyApi(group, region, store, fetchImpl)],
  ]);

  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    const host = `${HOST}:${server.address().port}`;
    if (request.socket.remoteAddress !== HOST || request.headers.host !== host) {
      return send(response, 403, { error: "请从当前 Mac 打开本机设置页。" });
    }
    try {
      if (request.method === "GET" && files.has(request.url)) {
        const [body, type] = files.get(request.url);
        return send(response, 200, body, type);
      }
      if (request.method === "GET" && request.url === "/status") return send(response, 200, setupStatus(store));

      const action = actions.get(request.url);
      if (request.method !== "POST" || !action) return send(response, 404, { error: "页面不存在。" });
      if (request.headers.origin !== `http://${host}` || request.headers["content-type"] !== "application/json") {
        return send(response, 403, { error: "请在本机设置页提交。" });
      }
      return send(response, 200, await action(await readPayload(request)));
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof SetupError) return send(response, 400, { error: error.message });
      return send(response, 500, { error: "本机服务暂不可用。" });
    }
  });
  return server;
}

async function main([mode = "serve", first, second, ...rest]) {
  if (mode === "check" && first && second && !rest.length) {
    const result = await verifyApi(first, second, createKeychainStore());
    console.log(JSON.stringify({ ok: true, api: first, region: second, records: result.count }));
    return;
  }
  const port = first === "--port" ? Number(second) : DEFAULT_PORT;
  if (mode !== "serve" || rest.length || (first !== undefined && first !== "--port") ||
      !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new SetupError("用法：node scripts/setup.mjs [serve [--port 8793] | check <sp|ads> <na|eu|fe>]");
  }
  const server = createSetupServer();
  server.once("error", error => {
    console.error(error.code === "EADDRINUSE" ? "端口已占用，请用 serve --port 指定另一个端口。" : "本机设置页启动失败。");
    process.exitCode = 1;
  });
  server.listen(port, HOST, () => console.log(`Amazon API 凭据页 http://${HOST}:${port}/`));
}

const entry = process.argv[1];
if (entry && existsSync(entry) && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof SetupError ? error.message : "本机操作失败。");
    process.exitCode = 1;
  });
}
