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
  let projects = [], currentSourceId = null, images = [], isAdmin = false;

  async function loadMe() {
    const cfg = await api("/api/config");
    price = cfg.data.minChargeCents || 0;
    const minC = cfg.data.minChargeCents || 0, maxC = cfg.data.maxChargeCents || 0;
    $("#priceHint").textContent = "按当次生成消耗 token 计费，" + (minC ? "约 " + f(minC) + " 起" : "免费") + (maxC ? "，最高 " + f(maxC) : "");
    const r = await api("/api/me");
    me = r.data.user || null;
    isAdmin = !!(me && me.role === "admin");
    const isDev = !!(me && (me.role === "developer" || me.role === "admin"));
    if (me) {
      navAuthBtn.textContent = `${me.username} · 退出`;
      navAuthBtn.dataset.logged = "1";
    } else {
      navAuthBtn.textContent = "登录 / 注册";
    }
    $("#gateBlock").hidden = isDev;
    $("#studioGrid").hidden = !isDev;
    $("#previewCard").hidden = true;
    if (isDev) {
      balance = r.data.balance || 0;
      $("#balanceBtn").hidden = false;
      $("#balanceBtn").textContent = "账户余额：" + f(balance);
      $("#rechargeLink").hidden = !(balance < price);
      $("#genBtn").disabled = false;
      $("#genBtn").textContent = "生成游戏";
      loadProjects();
    } else {
      $("#balanceBtn").hidden = true;
      $("#rechargeLink").hidden = true;
      $("#genBtn").disabled = true;
    }
    $("#balHint").textContent = "余额：" + f(balance);
  }

  async function loadProjects() {
    const r = await api("/api/studio/my");
    projects = r.data.projects || [];
    const sel = $("#projectSelect");
    sel.innerHTML = '<option value="">＋ 新建一个游戏</option>' + projects.map((p) => `<option value="${p.id}">${escapeHtml(p.title)}${p.usedAI ? "" : "（内置）"}</option>`).join("");
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  $("#projectSelect").addEventListener("change", () => {
    const id = $("#projectSelect").value;
    if (!id) { currentSourceId = null; $("#genBtn").textContent = "生成游戏"; $("#projectTools").hidden = true; return; }
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    currentSourceId = id;
    $("#titleInput").value = p.title || "";
    $("#promptInput").value = p.prompt || "";
    $("#genBtn").textContent = "修改游戏";
    $("#projectTools").hidden = false;
    toast("已选择项目，填写要修改的地方后点「修改游戏」");
  });
  $("#deleteProjectBtn").addEventListener("click", async () => {
    if (!currentSourceId) { toast("请先在「我的项目」里选一个要删除的项目"); return; }
    const p = projects.find((x) => x.id === currentSourceId);
    if (!confirm(`确定删除项目《${p ? p.title : "该游戏"}》？其生成历史和已发布版本都会被移除，不可恢复。`)) return;
    try {
      await api("/api/studio/project/" + currentSourceId, { method: "DELETE" });
      toast("已删除该项目");
      currentSourceId = null; images = [];
      $("#projectSelect").value = "";
      $("#titleInput").value = ""; $("#promptInput").value = "";
      $("#genBtn").textContent = "生成游戏";
      $("#projectTools").hidden = true; $("#previewCard").hidden = true;
      loadProjects();
    } catch (err) { toast(err.message); }
  });

  function renderImages() {
    $("#imgList").innerHTML = images.map((s, i) => `<span class="shot"><img src="${s}" alt=""><button type="button" data-i="${i}" aria-label="移除">×</button></span>`).join("");
    $("#imgList").querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => { images.splice(+b.dataset.i, 1); renderImages(); }));
  }
  $("#imgFile").addEventListener("change", () => {
    const files = [...$("#imgFile").files];
    $("#imgFile").value = "";
    if (!files.length) return;
    for (const f of files) {
      if (images.length >= 3) { toast("最多 3 张参考图"); break; }
      if (f.size > 2 * 1024 * 1024) { toast("单张参考图不能超过 2MB"); continue; }
      const r = new FileReader();
      r.onload = (ev) => { images.push(ev.target.result); renderImages(); };
      r.readAsDataURL(f);
    }
  });
  navAuthBtn.addEventListener("click", async () => {
    if (navAuthBtn.dataset.logged) { try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {} location.reload(); }
    else location.href = "/";
  });

  const genBtn = $("#genBtn");
  genBtn.addEventListener("click", async () => {
    if (!me) { toast("请先登录后再生成"); location.href = "/"; return; }
    if (me.role !== "developer" && me.role !== "admin") { toast("只有注册开发者才能使用 AI 工坊"); return; }
    const prompt = $("#promptInput").value.trim();
    const title = $("#titleInput").value.trim();
    if (!prompt) { toast("请填写提示词"); return; }
    genBtn.disabled = true;
    genBtn.textContent = "AI 生成中…";
    $("#genError").hidden = true;
    const r = await api("/api/studio/generate", { method: "POST", body: JSON.stringify({ prompt, title, sourceId: currentSourceId, images }) });
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
      if (isAdmin) {
        const db = $("#downloadBtn");
        db.href = "/api/admin/studio/" + d.id + "/download";
        db.hidden = false;
      } else {
        $("#downloadBtn").hidden = true;
      }
      balance = d.balance;
      $("#balHint").textContent = "余额：" + f(balance);
      $("#balanceBtn").textContent = "账户余额：" + f(balance);
      $("#rechargeLink").hidden = !(balance < price);
      const chargeNote = d.tokensUsed ? (" · " + d.tokensUsed + " tokens · 扣 " + f(d.charge)) : "";
      $("#genNote").textContent = (d.note || "AI 生成") + chargeNote;
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
    else if (r.data.updated) { toast("修改已同步更新到网站，商店里已是最新版"); btn.textContent = "已同步 ✓"; btn.disabled = true; return; }
    else { toast("已发布到网站！去商店看看吧 🎉"); btn.textContent = "已发布 ✓"; btn.disabled = true; setTimeout(() => { location.href = "/store"; }, 900); return; }
    btn.disabled = false; btn.textContent = "发布到网站";
  });

  loadMe();
})();
