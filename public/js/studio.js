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
  let projects = [], currentSourceId = null, images = [], isAdmin = false, currentPlayUrl = "";

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
      navAuthBtn.textContent = me.username;
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
      loadStudioModels();
    } else {
      $("#balanceBtn").hidden = true;
      $("#rechargeLink").hidden = true;
      $("#genBtn").disabled = true;
    }
    $("#balHint").textContent = "余额：" + f(balance);
  }

  async function loadStudioModels() {
    try {
      const r = await api("/api/models");
      const list = r.data.models || [];
      const box = $("#studioModelsList");
      if (!list.length) { box.innerHTML = "<div style='color:var(--muted);font-size:13px'>暂无模型，可到后台/开发者中心上传。</div>"; return; }
      box.innerHTML = list.map((m) => `<div class="studio-model"><span title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span><button type="button" class="proj-undo sm" data-viewmodel="${escapeHtml(m.id)}">查看</button></div>`).join("");
      box.querySelectorAll("[data-viewmodel]").forEach((b) => b.addEventListener("click", () => {
        const m = list.find((x) => x.id === b.dataset.viewmodel);
        if (m && window.openModelViewer) window.openModelViewer(m.url, m.name);
      }));
    } catch (e) {}
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
    if (!id) {
      currentSourceId = null;
      $("#genBtn").textContent = "生成游戏";
      $("#projectTools").hidden = true;
      $("#projHistory").hidden = true;
      $("#projHistory").innerHTML = "";
      $("#titleInput").value = "";
      $("#promptInput").value = "";
      $("#promptInput").placeholder = "例如：做一个像素风贪吃蛇游戏，绿色主题，速度越来越快，吃金币得分";
      return;
    }
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    currentSourceId = id;
    $("#titleInput").value = p.title || "";
    $("#promptInput").value = "";
    $("#promptInput").placeholder = "输入本次要修改/新增的要求（系统会结合之前所有要求）";
    $("#genBtn").textContent = "修改游戏";
    $("#projectTools").hidden = false;
    const his = (p.history && p.history.length ? p.history : [p.prompt]).filter((h) => h && h.trim());
    $("#projHistory").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>修改记录（供你查看，不会重复生成）：</b><button type="button" class="proj-clear" id="clearHistoryBtn">清理记录</button></div>' + his.map((h, i) => `<div>${i + 1}. ${escapeHtml(h)}</div>`).join("");
    $("#projHistory").hidden = false;
    loadBackups(id);
    toast("已选择项目，填写要修改的地方后点「修改游戏」");
  });
  async function loadBackups(id) {
    try {
      const r = await api("/api/studio/project/" + id + "/versions");
      const list = r.data.versions || [];
      const box = $("#projBackups");
      if (!list.length) { box.innerHTML = ""; box.hidden = true; return; }
      box.innerHTML = '<b>备份记录（最多 5 个）：</b>' + list.map((v) => '<div class="proj-back">' + new Date(v.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) + '<button type="button" class="proj-undo sm" data-restore="' + escapeHtml(v.file) + '">恢复</button><button type="button" class="proj-clear" data-delback="' + escapeHtml(v.file) + '">删除</button></div>').join("");
      box.hidden = false;
      box.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("确定恢复到该备份？当前版本会被覆盖为这一天。")) return;
        try { await api("/api/studio/project/" + id + "/versions/restore", { method: "POST", body: JSON.stringify({ file: b.dataset.restore }) }); toast("已恢复该备份"); loadBackups(id); } catch (err) { toast(err.message); }
      }));
      box.querySelectorAll("[data-delback]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("确定删除这个备份？")) return;
        try { await api("/api/studio/project/" + id + "/versions/delete", { method: "POST", body: JSON.stringify({ file: b.dataset.delback }) }); toast("已删除备份"); loadBackups(id); } catch (err) { toast(err.message); }
      }));
    } catch (e) {}
  }
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
  $("#restoreBtn").addEventListener("click", async () => {
    if (!currentSourceId) { toast("请先在「我的项目」选一个项目"); return; }
    if (!confirm("确定恢复到上一版？当前版本会被覆盖为上一版（改坏了可回退）。")) return;
    try {
      await api("/api/studio/project/" + currentSourceId + "/restore", { method: "POST", body: "{}" });
      toast("已恢复上一版");
    } catch (err) { toast(err.message); }
  });
  $("#projHistory").addEventListener("click", async (e) => {
    const b = e.target.closest("#clearHistoryBtn");
    if (!b || !currentSourceId) return;
    if (!confirm("确定清理这条项目的修改记录？之后 AI 只会按你新增的要求生成。")) return;
    try {
      await api("/api/studio/project/" + currentSourceId + "/clear", { method: "POST", body: "{}" });
      toast("已清理修改记录");
      await loadProjects();
      const p = projects.find((x) => x.id === currentSourceId);
      $("#projHistory").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>修改记录（供你查看，不会重复生成）：</b><button type="button" class="proj-clear" id="clearHistoryBtn">清理记录</button></div>';
      $("#projHistory").hidden = false;
      $("#promptInput").value = "";
      $("#promptInput").placeholder = "输入本次要修改/新增的要求（系统会结合之前所有要求）";
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
    if (me) { location.href = "/user/" + encodeURIComponent(me.username); }
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
      if (/备份/.test((r.data && r.data.error) || "") && currentSourceId) loadBackups(currentSourceId);
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
      $("#thumbImg").src = "/api/studio/cover/" + d.id;
      $("#studioThumb").hidden = false;
      currentPlayUrl = d.url;
      $("#previewCard").hidden = false;
      toast("生成成功！你可以预览后一键发布");
      $("#previewCard").scrollIntoView({ behavior: "smooth", block: "start" });
      // 保持在当前项目上，方便继续修改；更新下拉与修改记录
      currentSourceId = d.id;
      await loadProjects();
      $("#projectSelect").value = d.id;
      const p = projects.find((x) => x.id === d.id);
      if (p) {
        $("#promptInput").value = "";
        $("#promptInput").placeholder = "输入本次要修改/新增的要求（系统会结合之前所有要求）";
        const his = (p.history && p.history.length ? p.history : [p.prompt]).filter((h) => h && h.trim());
        $("#projHistory").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>修改记录（供你查看，不会重复生成）：</b><button type="button" class="proj-clear" id="clearHistoryBtn">清理记录</button></div>' + his.map((h, i) => `<div>${i + 1}. ${escapeHtml(h)}</div>`).join("");
        $("#projHistory").hidden = false;
        $("#projectTools").hidden = false;
        loadBackups(d.id);
      }
    }
    genBtn.disabled = false;
    genBtn.textContent = currentSourceId ? "修改游戏" : "生成游戏";
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
  const testModal = $("#gameTestModal");
  const closeTest = () => { testModal.hidden = true; document.body.style.overflow = ""; $("#testFrame").src = ""; };
  $("#studioThumb").addEventListener("click", () => {
    if (!currentPlayUrl) { toast("请先生成一个游戏"); return; }
    $("#testFrame").src = currentPlayUrl;
    testModal.hidden = false; document.body.style.overflow = "hidden";
  });
  testModal.addEventListener("click", (e) => { if (e.target.closest("[data-close-test]")) closeTest(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !testModal.hidden) closeTest(); });

  loadMe();
})();
