// 爱冒险玖日 · 管理后台
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DEFAULT_COVER = "/assets/img/card-default.jpg";

  let games = [];
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fmtDate = (ts) => new Date(ts).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const shortLink = (l) => { try { return new URL(l, "http://x").host; } catch (e) { return l; } };

  // ---------- gate & session ----------
  const gate = $("#gate");
  const dash = $("#dash");
  const gateForm = $("#gateForm");
  const gateError = $("#gateError");

  async function checkAdmin() {
    try {
      const data = await api("/api/admin/session");
      return data.user;
    } catch (e) {
      return null;
    }
  }

  async function boot() {
    const admin = await checkAdmin();
    if (admin) {
      showDash();
    } else {
      gate.hidden = false;
      dash.hidden = true;
      loadCaptcha();
    }
  }

  async function loadCaptcha() {
    try {
      const d = await api("/api/captcha");
      $("#captchaImg").src = d.image;
      $("#captchaToken").value = d.token;
      $("#captchaInput").value = "";
    } catch (e) {}
  }
  $("#captchaImg")?.addEventListener("click", loadCaptcha);

  function showDash() {
    gate.hidden = true;
    dash.hidden = false;
    refreshAll();
    loadSettings();
  }

  gateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(gateForm);
    const username = fd.get("username").trim();
    const password = fd.get("password");
    gateError.hidden = true;
    const btn = gateForm.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "验证中…";
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username, password, captcha: fd.get("captcha"), captchaToken: fd.get("captchaToken") }) });
      const admin = await checkAdmin();
      if (!admin) { gateError.textContent = "该账号没有管理员权限"; gateError.hidden = false; return; }
      showDash();
    } catch (err) {
      gateError.textContent = err.message;
      gateError.hidden = false;
      if (/验证码/.test(err.message)) loadCaptcha();
    } finally {
      btn.disabled = false; btn.textContent = "进入后台";
    }
  });

  $('#logoutBtn').addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
    location.reload();
  });

  // ---------- rendering ----------
  async function refreshAll() {
    const [g] = await Promise.all([loadGames(), loadUsers(), loadApplications(), loadRecharges(), loadFeedback()]);
    $("#statFeatured").textContent = g.filter((x) => x.featured).length;
    $("#gameCountReal").textContent = g.length + " 款";
  }

  async function loadGames() {
    const data = await api("/api/admin/games");
    games = data.games;
    $("#statGames").textContent = games.length;
    $("#statPending").textContent = data.pending || 0;
    const body = $("#gamesBody");
    const empty = $("#gamesEmpty");
    if (!games.length) { body.innerHTML = ""; empty.hidden = false; return games; }
    empty.hidden = true;
    body.innerHTML = games.map((g) => {
      const cover = g.cover || DEFAULT_COVER;
      const tags = (g.tags || []).map((t) => `<span>${esc(t)}</span>`).join("");
      const isPending = g.status === "pending";
      const typePill = g.type === "download"
        ? '<span class="pill">需下载</span>'
        : '<span class="pill dev">网页游戏</span>';
      const statusPill = isPending
        ? '<span class="pill warn">待审核</span>'
        : g.status === "offline"
          ? '<span class="pill off">已下线</span>'
          : '<span class="pill on">已上架</span>';
      const ownerPill = g.ownerName
        ? `<span class="pill dev">${esc(g.ownerName)}</span>`
        : '<span class="pill">官方</span>';
      let actions = ``
        + `<button class="btn btn-ghost btn-mini" data-edit="${esc(g.id)}">编辑</button>`
        + `<button class="btn btn-danger btn-mini" data-del="${esc(g.id)}">删除</button>`;
      if (isPending) {
        actions = `<button class="btn btn-primary btn-mini" data-approve="${esc(g.id)}">通过</button>`
          + `<button class="btn btn-danger btn-mini" data-reject="${esc(g.id)}">驳回并删除</button>`
          + `<button class="btn btn-ghost btn-mini" data-edit="${esc(g.id)}">编辑</button>`;
      }
      return `<tr data-id="${esc(g.id)}">
        <td><img class="cover-thumb" src="${esc(cover)}" onerror="this.src='${DEFAULT_COVER}'" alt=""></td>
        <td><div class="game-row-title"><b>${g.featured ? "★ " : ""}${esc(g.title)}</b><span>${esc(g.link)}</span></div></td>
        <td><div class="tag-list">${tags || '<span style="color:#666">—</span>'}</div></td>
        <td>${typePill}</td>
        <td>${statusPill}</td>
        <td>${ownerPill}</td>
        <td><span class="link-cell">${esc(shortLink(g.link))}</span></td>
        <td class="ta-r"><div class="row-actions">${actions}</div></td>
      </tr>`;
    }).join("");
    return games;
  }

  async function loadUsers() {
    const data = await api("/api/admin/users");
    const body = $("#usersBody");
    body.innerHTML = data.users.map((u) => {
      const canEdit = u.username !== "admin";
      const roleBtn = canEdit
        ? `<button class="btn ${u.role === "admin" ? "btn-danger" : "btn-ghost"} btn-mini" data-role="${esc(u.id)}" data-newrole="${u.role === "admin" ? "user" : "admin"}">${u.role === "admin" ? "取消管理员" : "设为管理员"}</button>`
        : `<span class="pill on">主管理员</span>`;
      const delBtn = canEdit ? `<button class="btn btn-danger btn-mini" data-deluser="${esc(u.id)}">删除</button>` : "";
      const roleClass = u.role === "admin" ? "on" : u.role === "developer" ? "dev" : "off";
      const roleLabel = u.role === "admin" ? "管理员" : u.role === "developer" ? "开发者" : "用户";
      return `<tr>
      <td class="game-row-title"><b>${esc(u.username)}</b></td>
      <td class="desc-cell">${esc(u.email || "—")}</td>
      <td><span class="pill ${roleClass}">${roleLabel}</span></td>
      <td><span class="pill dev">¥${((u.balance || 0) / 100).toFixed(2)}</span></td>
      <td class="ta-r link-cell">${fmtDate(u.createdAt)}</td>
      <td class="ta-r"><div class="row-actions">${roleBtn}${delBtn}</div></td>
    </tr>`;
    }).join("");
    $("#usersCount2").textContent = data.users.length + " 人";
    $("#statUsers").textContent = data.users.length;
    return data.users;
  }

  async function loadApplications() {
    const data = await api("/api/admin/applications");
    const apps = data.applications;
    $("#statApps").textContent = apps.length;
    $("#appsCount").textContent = apps.length + " 条";
    const body = $("#appsBody");
    const empty = $("#appsEmpty");
    if (!apps.length) { body.innerHTML = ""; empty.hidden = false; return apps; }
    empty.hidden = true;
    body.innerHTML = apps.map((a) => `<tr>
      <td class="game-row-title"><b>${esc(a.username)}</b></td>
      <td class="desc-cell">${esc(a.email || "—")}</td>
      <td class="desc-cell">${esc(a.message)}</td>
      <td class="ta-r link-cell">${fmtDate(a.createdAt)}</td>
      <td class="ta-r"><div class="row-actions">
        <button class="btn btn-primary btn-mini" data-app="approve" data-id="${esc(a.id)}">同意</button>
        <button class="btn btn-danger btn-mini" data-app="reject" data-id="${esc(a.id)}">拒绝</button>
      </div></td>
    </tr>`).join("");
    return apps;
  }

  $("#appsBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-app]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.app;
    if (!confirm(action === "approve" ? "确定同意这位用户成为开发者吗？" : "确定拒绝这位用户的开发者申请吗？")) return;
    try {
      await api(`/api/admin/applications/${id}/${action}`, { method: "POST", body: "{}" });
      toast(action === "approve" ? "已同意，该用户成为开发者" : "已拒绝该申请");
      await refreshAll();
    } catch (err) { toast(err.message); }
  });

  // ---- recharge orders ----
  async function loadRecharges() {
    const data = await api("/api/admin/recharges");
    const list = data.recharges;
    $("#statRecharge").textContent = list.length;
    $("#rcCount").textContent = list.length + " 条";
    const body = $("#rcBody");
    const empty = $("#rcEmpty");
    if (!list.length) { body.innerHTML = ""; empty.hidden = false; return list; }
    empty.hidden = true;
    body.innerHTML = list.map((r) => `<tr>
      <td class="game-row-title"><b>${esc(r.username)}</b></td>
      <td><span class="pill dev">¥${(r.amountCents / 100).toFixed(2)}</span></td>
      <td class="desc-cell">${esc(r.note || "—")}</td>
      <td class="ta-r link-cell">${fmtDate(r.createdAt)}</td>
      <td class="ta-r"><div class="row-actions">
        <button class="btn btn-primary btn-mini" data-rc="approve" data-id="${esc(r.id)}">确认到账</button>
        <button class="btn btn-danger btn-mini" data-rc="reject" data-id="${esc(r.id)}">拒绝</button>
      </div></td>
    </tr>`).join("");
    return list;
  }
  $("#rcBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-rc]");
    if (!b) return;
    const id = b.dataset.id;
    const action = b.dataset.rc;
    if (!confirm(action === "approve" ? "确认该笔充值已到账吗？" : "拒绝该笔充值申请吗？")) return;
    try {
      await api(`/api/admin/recharges/${id}/${action}`, { method: "POST", body: "{}" });
      toast(action === "approve" ? "已确认到账" : "已拒绝");
      await refreshAll();
    } catch (err) { toast(err.message); }
  });

  // ---- feedback ----
  async function loadFeedback() {
    const data = await api("/api/admin/feedback");
    const list = data.feedbacks;
    $("#statFeedback").textContent = data.pending || 0;
    $("#fbCount").textContent = list.length + " 条";
    const body = $("#fbBody");
    const empty = $("#fbEmpty");
    if (!list.length) { body.innerHTML = ""; empty.hidden = false; return list; }
    empty.hidden = true;
    body.innerHTML = list.map((f) => {
      const tPill = f.type === "问题" ? '<span class="pill warn">问题</span>' : f.type === "建议" ? '<span class="pill dev">建议</span>' : '<span class="pill off">其他</span>';
      const sPill = f.status === "done" ? '<span class="pill on">已处理</span>' : '<span class="pill warn">未处理</span>';
      return `<tr>
        <td class="game-row-title"><b>${esc(f.username)}</b></td>
        <td>${tPill}</td>
        <td class="desc-cell">${esc(f.content)}</td>
        <td class="ta-r link-cell">${fmtDate(f.createdAt)}</td>
        <td>${sPill}</td>
        <td class="ta-r"><div class="row-actions">
          <button class="btn btn-ghost btn-mini" data-fb="resolve" data-id="${esc(f.id)}">标记已处理</button>
          <button class="btn btn-danger btn-mini" data-fb="delete" data-id="${esc(f.id)}">删除</button>
        </div></td>
      </tr>`;
    }).join("");
    return list;
  }
  $("#fbBody").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fb]");
    if (!b) return;
    const id = b.dataset.id;
    const action = b.dataset.fb;
    if (action === "delete" && !confirm("确定删除这条反馈？")) return;
    try {
      await api(`/api/admin/feedback/${id}/${action}`, { method: "POST", body: "{}" });
      toast(action === "resolve" ? "已标记为已处理" : "已删除");
      await refreshAll();
    } catch (err) { toast(err.message); }
  });

  // ---- site settings (price / QR) ----
  let savedQr = "";
  let savedWx = "";
  function renderQr() { $("#qrPreview img").src = savedQr || "/assets/img/card-default.jpg"; }
  function renderWx() { $("#wxPreview img").src = savedWx || "/assets/img/card-default.jpg"; }
  async function loadSettings() {
    const data = await api("/api/admin/settings");
    $("#priceInput").value = (data.pricePerGame || 0) / 100;
    $("#minInput").value = (data.minRecharge || 100) / 100;
    $("#aiKeyInput").value = data.aiApiKey || "";
    $("#aiBaseInput").value = data.aiBaseUrl || "";
    $("#aiModelInput").value = data.aiModel || "";
    $("#aiVisionInput").value = data.aiVisionModel || "";
    $("#costInput").value = data.costPerMillionTokens || 0;
    $("#marginInput").value = data.margin || 1;
    $("#minChargeInput").value = (data.minChargeCents || 0) / 100;
    $("#maxChargeInput").value = (data.maxChargeCents || 0) / 100;
    savedQr = data.rechargeQr || "";
    savedWx = data.wechatQr || "";
    renderQr();
    renderWx();
  }
  $("#qrUrl").addEventListener("input", () => { const v = $("#qrUrl").value.trim(); if (v) { savedQr = v; renderQr(); } });
  $("#qrFile").addEventListener("change", () => {
    const f = $("#qrFile").files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast("图片不能超过 8MB"); return; }
    const r = new FileReader();
    r.onload = () => { savedQr = r.result; renderQr(); $("#qrUrl").value = ""; };
    r.readAsDataURL(f);
  });
  $("#wxUrl").addEventListener("input", () => { const v = $("#wxUrl").value.trim(); if (v) { savedWx = v; renderWx(); } });
  $("#wxFile").addEventListener("change", () => {
    const f = $("#wxFile").files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast("图片不能超过 8MB"); return; }
    const r = new FileReader();
    r.onload = () => { savedWx = r.result; renderWx(); $("#wxUrl").value = ""; };
    r.readAsDataURL(f);
  });
  $("#settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const price = Math.round(parseFloat($("#priceInput").value || "0") * 100);
    const min = Math.round(parseFloat($("#minInput").value || "1") * 100);
    $("#settingsError").hidden = true;
    const btn = $("#settingsBtn"); btn.disabled = true; btn.textContent = "保存中…";
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          pricePerGame: price,
          minRecharge: min,
          rechargeQr: savedQr,
          wechatQr: savedWx,
          aiApiKey: $("#aiKeyInput").value.trim(),
          aiBaseUrl: $("#aiBaseInput").value.trim(),
          aiModel: $("#aiModelInput").value.trim(),
          aiVisionModel: $("#aiVisionInput").value.trim(),
          costPerMillionTokens: parseFloat($("#costInput").value || "0") || 0,
          margin: parseFloat($("#marginInput").value || "1") || 1,
          minChargeCents: Math.round(parseFloat($("#minChargeInput").value || "0") * 100),
          maxChargeCents: Math.round(parseFloat($("#maxChargeInput").value || "0") * 100),
        }),
      });
      toast("设置已保存");
    } catch (err) { $("#settingsError").textContent = err.message; $("#settingsError").hidden = false; }
    finally { btn.disabled = false; btn.textContent = "保存设置"; }
  });

  // ---------- editor ----------
  const editor = $("#editor");
  const editorForm = $("#editorForm");
  const editorError = $("#editorError");
  const coverPreviewImg = $("#coverPreview img");
  const coverUrlInput = $("#coverUrl");
  const coverFile = $("#coverFile");
  let savedCover = DEFAULT_COVER;
  let gameType = "web";
  let savedShots = [];

  function renderShots() {
    const box = $("#shotsList");
    box.innerHTML = savedShots.map((s, i) => `<span class="shot"><img src="${esc(s)}" alt=""><button type="button" data-i="${i}" aria-label="移除">×</button></span>`).join("");
    box.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => { savedShots.splice(+b.dataset.i, 1); renderShots(); }));
  }
  $("#shotsFile").addEventListener("change", () => {
    const files = [...$("#shotsFile").files];
    $("#shotsFile").value = "";
    if (!files.length) return;
    for (const f of files) {
      if (savedShots.length >= 6) { toast("最多 6 张展示图"); break; }
      if (f.size > 8 * 1024 * 1024) { toast("单张图片不能超过 8MB"); continue; }
      const r = new FileReader();
      r.onload = (ev) => { savedShots.push(ev.target.result); renderShots(); };
      r.readAsDataURL(f);
    }
  });

  function setType(t) {
    gameType = t;
    $$("#typeSwitch button").forEach((b) => b.classList.toggle("is-active", b.dataset.type === t));
    $("#linkLabel").textContent = t === "download" ? "百度网盘下载链接 *" : "游戏链接 *";
    $("#linkInput").placeholder = t === "download" ? "https://pan.baidu.com/s/... 下载链接" : "https://... 网页游戏地址";
  }
  $$("#typeSwitch button").forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));

  function setCoverPreview(src) {
    coverPreviewImg.src = src || DEFAULT_COVER;
  }
  function openEditor(game) {
    editorError.hidden = true;
    coverUrlInput.value = "";
    savedCover = DEFAULT_COVER;
    setCoverPreview(DEFAULT_COVER);
    if (game) {
      $("#editorKicker").textContent = "编辑游戏";
      $("#editorTitle").textContent = "编辑：请更新内容";
      editorForm.querySelector('[name=title]').value = game.title || "";
      editorForm.querySelector('[name=link]').value = game.link || "";
      editorForm.querySelector('[name=description]').value = game.description || "";
      $("#tagsInput").value = (game.tags || []).join(", ");
      $("#featuredInput").checked = !!game.featured;
      editorForm.querySelector('[name=id]').value = game.id || "";
      setType(game.type === "download" ? "download" : "web");
      savedShots = Array.isArray(game.images) ? game.images.slice() : [];
      renderShots();
      const isAi = game.source === "ai";
      $("#linkField").hidden = isAi;
      $("#linkInput").required = !isAi;
      if (game.cover && /^(https?:)?\/\//i.test(game.cover)) {
        coverUrlInput.value = game.cover;
        setCoverPreview(game.cover);
      } else {
        savedCover = game.cover || DEFAULT_COVER;
        setCoverPreview(savedCover);
      }
    } else {
      $("#editorKicker").textContent = "创建游戏";
      $("#editorTitle").textContent = "新建游戏";
      editorForm.reset();
      editorForm.querySelector('[name=id]').value = "";
      setType("web");
      setCoverPreview(DEFAULT_COVER);
      savedShots = []; renderShots();
      $("#linkField").hidden = false;
      $("#linkInput").required = true;
    }
    editor.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => editorForm.querySelector('[name=title]').focus(), 60);
  }
  function closeEditor() {
    editor.hidden = true;
    document.body.style.overflow = "";
  }

  $("#createBtn").addEventListener("click", () => openEditor(null));
  $$("[data-close-editor]").forEach((el) => el.addEventListener("click", closeEditor));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });

  coverFile.addEventListener("change", () => {
    const file = coverFile.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast("图片不能超过 8MB"); coverFile.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => {
      savedCover = reader.result;
      setCoverPreview(savedCover);
      coverUrlInput.value = "";
    };
    reader.readAsDataURL(file);
  });
  coverUrlInput.addEventListener("input", () => {
    const v = coverUrlInput.value.trim();
    if (v) { setCoverPreview(v); }
    else { setCoverPreview(savedCover); }
  });

  editorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(editorForm);
    const id = fd.get("id");
    const cover = coverUrlInput.value.trim() || savedCover;
    const payload = {
      title: fd.get("title"),
      link: fd.get("link"),
      description: fd.get("description"),
      tags: $("#tagsInput").value,
      featured: $("#featuredInput").checked,
      cover,
      type: gameType,
      images: savedShots,
    };
    editorError.hidden = true;
    const btn = $("#saveBtn");
    btn.disabled = true; btn.textContent = "保存中…";
    try {
      if (id) {
        await api(`/api/admin/games/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast("已更新游戏");
      } else {
        await api("/api/admin/games", { method: "POST", body: JSON.stringify(payload) });
        toast("已创建游戏");
      }
      closeEditor();
      await refreshAll();
      // keep site in sync if it's already open
      if (window.opener) window.opener.dispatchEvent(new Event("games-updated"));
    } catch (err) {
      editorError.textContent = err.message;
      editorError.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "保存游戏";
    }
  });

  // ---------- table actions ----------
  $("#gamesBody").addEventListener("click", async (e) => {
    const approveBtn = e.target.closest("[data-approve]");
    const rejectBtn = e.target.closest("[data-reject]");
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    if (approveBtn) {
      const g = games.find((x) => x.id === approveBtn.dataset.approve);
      if (!g) return;
      if (!confirm(`确定通过《${g.title}》？通过后将长期展示在首页。`)) return;
      try {
        await api(`/api/admin/games/${g.id}/approve`, { method: "POST", body: "{}" });
        toast("已通过审核");
        await refreshAll();
      } catch (err) { toast(err.message); }
      return;
    }
    if (rejectBtn) {
      const g = games.find((x) => x.id === rejectBtn.dataset.reject);
      if (!g) return;
      if (!confirm(`确定驳回并删除《${g.title}》？此操作不可撤销。`)) return;
      try {
        await api(`/api/admin/games/${g.id}/reject`, { method: "POST", body: "{}" });
        toast("已驳回并删除");
        await refreshAll();
      } catch (err) { toast(err.message); }
      return;
    }
    if (editBtn) {
      const g = games.find((x) => x.id === editBtn.dataset.edit);
      if (g) openEditor(g);
    }
    if (delBtn) {
      const g = games.find((x) => x.id === delBtn.dataset.del);
      if (!g) return;
      if (!confirm(`确定删除《${g.title}》？此操作不可撤销。`)) return;
      try {
        await api(`/api/admin/games/${g.id}`, { method: "DELETE" });
        toast("已删除");
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  });

  $("#usersBody").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-role]");
    const delBtn = e.target.closest("[data-deluser]");
    if (btn) {
      const id = btn.dataset.role;
      const newRole = btn.dataset.newrole;
      if (!confirm(newRole === "admin" ? "确定将该用户设为管理员吗？" : "确定取消该用户的管理员权限吗？")) return;
      try {
        await api(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify({ role: newRole }) });
        toast(newRole === "admin" ? "已设为管理员" : "已取消管理员");
        await loadUsers();
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
    if (delBtn) {
      if (!confirm("确定删除该用户吗？此操作不可撤销。")) return;
      try {
        await api(`/api/admin/users/${delBtn.dataset.deluser}`, { method: "DELETE" });
        toast("已删除用户");
        await loadUsers();
        await refreshAll();
      } catch (err) {
        toast(err.message);
      }
    }
  });

  $("#passwordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const oldPassword = fd.get("oldPassword");
    const newPassword = fd.get("newPassword");
    const err = $("#pwdError");
    err.hidden = true;
    const btn = $("#pwdBtn");
    btn.disabled = true; btn.textContent = "保存中…";
    try {
      await api("/api/admin/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
      toast("密码已更新，请记住新密码");
      e.target.reset();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = "修改密码";
    }
  });

  boot();
})();
