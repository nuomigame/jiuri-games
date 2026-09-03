// 爱冒险玖日 · AI 游戏工坊
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  let toastTimer;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3000); }
  const f = (c) => "¥" + ((Number(c) || 0) / 100).toFixed(2);
  const navAuthBtn = $("#navAuthBtn");
  let me = null, balance = 0, price = 500, currentId = null;

  async function loadMe() {
    const cfg = await api("/api/config");
    price = cfg.data.pricePerGame || 0;
    $("#priceHint").textContent = "每次生成：" + (price > 0 ? f(price) : "免费（内置生成）");
    const r = await api("/api/me");
    me = r.data.user || null;
    if (me) {
      balance = r.data.balance || 0;
      navAuthBtn.textContent = `${me.username} · 退出`;
      navAuthBtn.dataset.logged = "1";
      $("#balanceBtn").hidden = false;
      $("#balanceBtn").textContent = "账户余额：" + f(balance);
      $("#rechargeLink").hidden = !(balance < price);
      $("#genBtn").disabled = false;
      $("#genBtn").textContent = "生成游戏";
    } else {
      navAuthBtn.textContent = "登录 / 注册";
      $("#balanceBtn").hidden = true;
      $("#rechargeLink").hidden = true;
      $("#genBtn").disabled = true;
      $("#genBtn").textContent = "登录后即可生成";
    }
    $("#balHint").textContent = "余额：" + f(balance);
  }
  navAuthBtn.addEventListener("click", async () => {
    if (navAuthBtn.dataset.logged) { try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {} location.reload(); }
    else location.href = "/";
  });

  const genBtn = $("#genBtn");
  genBtn.addEventListener("click", async () => {
    if (!me) { toast("请先登录后再生成"); location.href = "/"; return; }
    const prompt = $("#promptInput").value.trim();
    const title = $("#titleInput").value.trim();
    if (!prompt) { toast("请填写提示词"); return; }
    genBtn.disabled = true;
    genBtn.textContent = "AI 生成中…";
    $("#genError").hidden = true;
    const r = await api("/api/studio/generate", { method: "POST", body: JSON.stringify({ prompt, title }) });
    if (r.status === 402) {
      $("#genError").textContent = r.data.error || "余额不足";
      $("#genError").hidden = false;
      $("#rechargeLink").hidden = false;
      balance = r.data.balance || 0;
      $("#balHint").textContent = "余额：" + f(balance);
    } else if (!r.ok) {
      $("#genError").textContent = (r.data && r.data.error) || "生成失败";
      $("#genError").hidden = false;
    } else {
      const d = r.data;
      currentId = d.id;
      balance = d.balance;
      $("#balHint").textContent = "余额：" + f(balance);
      $("#balanceBtn").textContent = "账户余额：" + f(balance);
      $("#rechargeLink").hidden = !(balance < price);
      $("#genNote").textContent = d.note || "AI 生成";
      $("#pubTitle").value = d.title || title;
      $("#frameWrap").innerHTML = `<iframe src="${d.url}" loading="lazy" allow="fullscreen; autoplay"></iframe>`;
      $("#previewCard").hidden = false;
      toast("生成成功！你可以预览后一键发布");
      $("#previewCard").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    genBtn.disabled = false;
    genBtn.textContent = "生成游戏";
  });

  $("#pubBtn").addEventListener("click", async () => {
    if (!currentId) { toast("请先生成一个游戏"); return; }
    const title = $("#pubTitle").value.trim();
    const description = $("#pubDesc").value.trim();
    const tags = $("#pubTags").value.trim();
    $("#pubError").hidden = true;
    const btn = $("#pubBtn"); btn.disabled = true; btn.textContent = "发布中…";
    const r = await api("/api/studio/publish", { method: "POST", body: JSON.stringify({ id: currentId, title, description, tags }) });
    if (!r.ok) { $("#pubError").textContent = (r.data && r.data.error) || "发布失败"; $("#pubError").hidden = false; }
    else { toast("已发布到网站！去商店看看吧 🎉"); btn.textContent = "已发布 ✓"; btn.disabled = true; setTimeout(() => { location.href = "/store"; }, 900); return; }
    btn.disabled = false; btn.textContent = "发布到网站";
  });

  loadMe();
})();
