// 爱冒险玖日 · 账户充值
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  let toastTimer;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800); }
  const f = (c) => ((Number(c) || 0) / 100).toFixed(2);
  const navAuthBtn = $("#navAuthBtn");
  let payMode = "alipay", alipayQr = "", wechatQr = "";
  function renderQr() {
    const q = payMode === "wechat" ? wechatQr : alipayQr;
    $("#qrWrap").innerHTML = q
      ? `<img class="rc-qr" src="${q}" alt="收款码" />`
      : '<div class="rc-qr-empty">站长还没有上传' + (payMode === "wechat" ? "微信" : "支付宝") + '收款码<br/>请稍后再来，或直接联系站长充值。</div>';
  }
  $("#payTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".pay-tab");
    if (!b) return;
    payMode = b.dataset.pay;
    $$("#payTabs .pay-tab").forEach((x) => x.classList.toggle("is-active", x === b));
    renderQr();
  });

  async function load() {
    const me = await api("/api/me");
    if (me.data.user) { navAuthBtn.textContent = `${me.data.user.username} · 退出`; navAuthBtn.dataset.logged = "1"; }
    else navAuthBtn.textContent = "登录 / 注册";
    const cfg = await api("/api/config");
    const d = cfg.data;
    $("#minHint").textContent = "最低充值：¥" + f(d.minRecharge) + " · 每次 AI 生成扣除 ¥" + f(d.pricePerGame);
    alipayQr = d.rechargeQr || "";
    wechatQr = d.wechatQr || "";
    renderQr();
    await loadBalance();
  }
  async function loadBalance() {
    const r = await api("/api/recharge/me");
    if (r.status === 401) { $("#balNum").textContent = "0.00"; $("#rcList").innerHTML = ""; $("#rcEmpty").hidden = false; return; }
    const d = r.data;
    $("#balNum").textContent = f(d.balance);
    const list = d.recharges || [];
    const box = $("#rcList");
    const empty = $("#rcEmpty");
    if (!list.length) { box.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    box.innerHTML = list.map((r) => {
      const st = r.status === "approved" ? '<span class="pill on">已到账</span>' : r.status === "rejected" ? '<span class="pill off">已拒绝</span>' : '<span class="pill warn">待确认</span>';
      const date = new Date(r.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<div class="rc-row"><span class="amt">¥${f(r.amountCents)}</span><span style="color:var(--muted);font-size:13px">${date}</span>${st}</div>`;
    }).join("");
  }
  navAuthBtn.addEventListener("click", async () => { if (navAuthBtn.dataset.logged) { try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {} location.reload(); } else location.href = "/"; });

  $("#submitBtn").addEventListener("click", async () => {
    const amount = Math.round(parseFloat($("#amountInput").value || "0") * 100);
    const note = $("#noteInput").value.trim();
    if (!amount || amount <= 0) { toast("请填写正确的充值金额"); return; }
    const btn = $("#submitBtn"); btn.disabled = true; btn.textContent = "提交中…";
    $("#rcError").hidden = true;
    const r = await api("/api/recharge", { method: "POST", body: JSON.stringify({ amountCents: amount, note }) });
    if (!r.ok) { $("#rcError").textContent = r.data.error || "提交失败"; $("#rcError").hidden = false; }
    else { toast("充值申请已提交，站长确认后到账"); $("#amountInput").value = ""; $("#noteInput").value = ""; load(); }
    btn.disabled = false; btn.textContent = "提交充值申请";
  });

  load();
})();
