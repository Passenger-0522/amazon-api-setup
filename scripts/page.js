const select = selector => document.querySelector(selector);
const region = () => select("#region").value;

function showStatus(status) {
  for (const group of ["sp", "ads"]) select(`#${group}-count`).textContent = `${status[group]}/3 已保存`;
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "请求失败。");
  if (result.status) showStatus(result.status);
  return result;
}

async function perform(button, message, pending, action) {
  button.disabled = true;
  message.classList.remove("error");
  message.textContent = pending;
  try {
    message.textContent = await action();
  } catch (error) {
    message.classList.add("error");
    message.textContent = error.message || "操作失败。";
  } finally {
    button.disabled = false;
  }
}

async function refreshStatus() {
  const response = await fetch("/status");
  if (!response.ok) throw new Error("无法读取本机状态。");
  showStatus(await response.json());
}

for (const group of ["sp", "ads"]) {
  const form = select(`#${group}-form`);
  form.append(select("#credential-fields").content.cloneNode(true));
  const message = form.querySelector('[role="status"]');
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries([...new FormData(form)].filter(([, value]) => value.trim()));
    await perform(form.querySelector('[type="submit"]'), message, "正在保存到钥匙串…", async () => {
      try {
        const { updated } = await post("/credentials", { group, values });
        form.reset();
        return `已保存 ${updated} 项。可以点击验证连接。`;
      } finally {
        await refreshStatus().catch(() => {});
      }
    });
  });
  const verify = form.querySelector('[type="button"]');
  verify.addEventListener("click", () => perform(verify, message, "正在发起只读验证…", async () => {
    const { count } = await post("/verify", { group, region: region() });
    if (!count) return "授权成功。该区域的接口返回 0 条记录，请核对区域和账户权限。";
    const records = group === "sp" ? "站点记录" : "广告账户配置";
    return `只读验证成功，返回 ${count} 条${records}。`;
  }));
}

const authorizeForm = select("#authorize-form");
const consentLink = select("#consent");
const redeemForm = select("#redeem-form");
const oauthMessage = select("#oauth-message");

authorizeForm.addEventListener("submit", event => {
  event.preventDefault();
  const redirectUri = new FormData(authorizeForm).get("redirectUri").trim();
  void perform(authorizeForm.querySelector("button"), oauthMessage, "正在准备授权链接…", async () => {
    const { consentUrl } = await post("/ads/authorize", { redirectUri, region: region() });
    consentLink.href = consentUrl;
    consentLink.hidden = false;
    redeemForm.hidden = false;
    redeemForm.reset();
    return "请亲自在 Amazon 同意授权，跳转后五分钟内把完整地址贴回这里。";
  });
});

redeemForm.addEventListener("submit", event => {
  event.preventDefault();
  const returnAddress = new FormData(redeemForm).get("returnAddress").trim();
  void perform(redeemForm.querySelector("button"), oauthMessage, "正在兑换并保存…", async () => {
    await post("/ads/redeem", { returnAddress });
    redeemForm.reset();
    redeemForm.hidden = true;
    consentLink.hidden = true;
    consentLink.removeAttribute("href");
    return "广告 API Refresh Token 已保存。可以点击上方的验证连接。";
  });
});

refreshStatus().catch(() => {
  for (const group of ["sp", "ads"]) select(`#${group}-count`).textContent = "无法读取钥匙串";
});
