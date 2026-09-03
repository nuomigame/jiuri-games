// 爱冒险玖日 · 开发者中心
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DEFAULT_COVER = "/assets/img/card-default.jpg";
  let games = [];
  let devApp = null; // { status } | null

  let toastTimer;
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const gate = $("#gate"), dash = $("#dash");
  const applyCard = $("#applyCard"), applyDone = $("#applyDone"), manager = $("#manager");

  async function boot() {
    const data = await api("/api/me");
    const user = data.user;
    devApp = data.devApplication;
    gate.hidden = !!user;
    dash.hidden = !user;
    if (!user) return;
    if (user.role === "developer" || user.role === "admin") {
      applyCard.hidden = applyDone.hidden = true;
      manager.hidden = false;
      $("#managerHint").textContent = user.role === "developer"
        ? "你发布的游戏会先展示在首页，等待管理员审核；审核通过后长期保留。"
        : "你现在是管理员，下面的游戏由你管理（管理员发布的游戏默认直接上架）。";
      loadMyGames();
    } else {
      manager.hidden = true;
      if (devApp && devApp.status === "pending") {
        applyCard.hidden = true; applyDone.hidden = false;
      } else {
        applyCard.hidden = false; applyDone.hidden = true;
      }
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
  loadCaptcha();

  $("#gateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "验证中…";
    $("#gateError").hidden = true;
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username: fd.get("username").trim(), password: fd.get("password"), captcha: fd.get("captcha"), captchaToken: fd.get("captchaToken") }) });
      boot();
    } catch (err) {
      $("#gateError").textContent = err.message; $("#gateError").hidden = false;
      if (/验证码/.test(err.message)) loadCaptcha();
    } finally { btn.disabled = false; btn.textContent = "进入开发者中心"; }
  });
  $("#logoutBtn").addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
    location.href = "/";
  });

  // ---- Apply ----
  $("#applyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#applyBtn");
    const message = e.target.message.value;
    btn.disabled = true; btn.textContent = "提交中…";
    $("#applyError").hidden = true;
    try {
      await api("/api/developer/apply", { method: "POST", body: JSON.stringify({ message }) });
      toast("申请已提交，等待管理员审核");
      boot();
    } catch (err) { $("#applyError").textContent = err.message; $("#applyError").hidden = false; }
    finally { btn.disabled = false; btn.textContent = "提交申请"; }
  });

  // ---- My games ----
  async function loadMyGames() {
    const data = await api("/api/developer/my");
    games = data.games;
    $("#myCount").textContent = games.length + " 款";
    const body = $("#myGames");
    const empty = $("#myEmpty");
    if (!games.length) { body.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    body.innerHTML = games.map((g) => {
      const cover = g.cover || DEFAULT_COVER;
      const type = g.type === "download" ? "需下载·电脑运行" : "网页游戏";
      const st = g.status === "pending"
        ? '<span class="pill warn">待审核</span>'
        : g.status === "offline"
          ? '<span class="pill off">已下线</span>'
          : '<span class="pill on">已上线</span>';
      let actions = `<button class="btn btn-ghost btn-mini" data-edit="${esc(g.id)}">编辑</button>`;
      if (g.status === "approved") actions = `<button class="btn btn-ghost btn-mini" data-offline="${esc(g.id)}">下线</button>` + actions;
      else if (g.status === "offline") actions = `<button class="btn btn-ghost btn-mini" data-online="${esc(g.id)}">上线</button>` + actions;
      actions += `<button class="btn btn-danger btn-mini" data-del="${esc(g.id)}">删除</button>`;
      return `<tr data-id="${esc(g.id)}">
        <td><img class="cover-thumb" src="${esc(cover)}" onerror="this.src='${DEFAULT_COVER}'" alt=""></td>
        <td class="game-row-title"><b>${esc(g.title)}</b><span>${esc(g.link)}</span></td>
        <td><span class="pill dev">${type}</span></td>
        <td>${st}</td>
        <td class="ta-r"><div class="row-actions">${actions}</div></td>
      </tr>`;
    }).join("");
  }

  $("#myGames").addEventListener("click", async (e) => {
    const off = e.target.closest("[data-offline]");
    const on = e.target.closest("[data-online]");
    const edit = e.target.closest("[data-edit]");
    const del = e.target.closest("[data-del]");
    if (off) {
      const g = games.find((x) => x.id === off.dataset.offline);
      if (!g) return;
      if (!confirm(`确定将《${g.title}》下线？下线后不再展示，且需下线后才能删除。`)) return;
      try { await api(`/api/developer/games/${g.id}/offline`, { method: "POST", body: "{}" }); toast("已下线"); loadMyGames(); }
      catch (err) { toast(err.message); }
    }
    if (on) {
      const g = games.find((x) => x.id === on.dataset.online);
      if (!g) return;
      try { await api(`/api/developer/games/${g.id}/online`, { method: "POST", body: "{}" }); toast("已上线"); loadMyGames(); }
      catch (err) { toast(err.message); }
    }
    if (edit) { const g = games.find((x) => x.id === edit.dataset.edit); if (g) openEditor(g); }
    if (del) {
      const g = games.find((x) => x.id === del.dataset.del);
      if (!g) return;
      if (!confirm(`确定删除《${g.title}》？此操作不可撤销。`)) return;
      try { await api(`/api/developer/games/${g.id}`, { method: "DELETE" }); toast("已删除"); loadMyGames(); }
      catch (err) { toast(err.message); }
    }
  });

  // ---- Editor ----
  let gameType = "web";
  const coverPreviewImg = $("#coverPreview img");
  const coverUrlInput = $("#coverUrl"), coverFile = $("#coverFile");
  let savedCover = DEFAULT_COVER;
  let savedShots = [];
  function setCoverPreview(src) { coverPreviewImg.src = src || DEFAULT_COVER; }
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
    $("#linkLabel").textContent = t === "download" ? "百度网盘下载链接 *" : "网页游戏地址 *";
    $("#linkInput").placeholder = t === "download" ? "https://pan.baidu.com/s/... 下载链接" : "https://... 网页游戏地址";
  }
  $$("#typeSwitch button").forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));

  function openEditor(game) {
    $("#editorError").hidden = true;
    coverUrlInput.value = ""; savedCover = DEFAULT_COVER; setCoverPreview(DEFAULT_COVER);
    const form = $("#editorForm");
    if (game) {
      const isAi = game.source === "ai";
      $("#linkField").hidden = isAi;
      $("#linkInput").required = !isAi;
      $("#editorKicker").textContent = "编辑游戏";
      $("#editorTitle").textContent = "编辑：请更新内容";
      form.querySelector('[name=title]').value = game.title || "";
      form.querySelector('[name=link]').value = game.link || "";
      form.querySelector('[name=description]').value = game.description || "";
      $("#tagsInput").value = (game.tags || []).join(", ");
      $("#featuredInput").checked = !!game.featured;
      form.querySelector('[name=id]').value = game.id || "";
      setType(game.type === "download" ? "download" : "web");
      savedShots = Array.isArray(game.images) ? game.images.slice() : [];
      renderShots();
      if (game.cover && /^(https?:)?\/\//i.test(game.cover)) {
        coverUrlInput.value = game.cover; setCoverPreview(game.cover);
      } else { savedCover = game.cover || DEFAULT_COVER; setCoverPreview(savedCover); }
    } else {
      $("#editorKicker").textContent = "发布游戏";
      $("#editorTitle").textContent = "发布新游戏";
      form.reset(); form.querySelector('[name=id]').value = "";
      setType("web"); setCoverPreview(DEFAULT_COVER);
      savedShots = []; renderShots();
      $("#linkField").hidden = false;
      $("#linkInput").required = true;
    }
    $("#editor").hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => form.querySelector('[name=title]').focus(), 60);
  }
  function closeEditor() { $("#editor").hidden = true; document.body.style.overflow = ""; }
  $("#createBtn").addEventListener("click", () => openEditor(null));
  $$("[data-close-editor]").forEach((el) => el.addEventListener("click", closeEditor));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });

  coverFile.addEventListener("change", () => {
    const file = coverFile.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast("图片不能超过 8MB"); coverFile.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { savedCover = reader.result; setCoverPreview(savedCover); coverUrlInput.value = ""; };
    reader.readAsDataURL(file);
  });
  coverUrlInput.addEventListener("input", () => {
    const v = coverUrlInput.value.trim();
    setCoverPreview(v || savedCover);
  });

  $("#editorForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
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
    $("#editorError").hidden = true;
    const btn = $("#saveBtn"); btn.disabled = true; btn.textContent = "保存中…";
    try {
      if (id) await api(`/api/developer/games/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/developer/games", { method: "POST", body: JSON.stringify(payload) });
      toast(id ? "已更新（需重新审核）" : "已提交，等待管理员审核");
      closeEditor(); loadMyGames();
    } catch (err) { $("#editorError").textContent = err.message; $("#editorError").hidden = false; }
    finally { btn.disabled = false; btn.textContent = "发布游戏"; }
  });

  boot();
})();
