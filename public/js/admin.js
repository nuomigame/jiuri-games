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
    }
  }

  function showDash() {
    gate.hidden = true;
    dash.hidden = false;
    refreshAll();
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
      await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      const admin = await checkAdmin();
      if (!admin) { gateError.textContent = "该账号没有管理员权限"; gateError.hidden = false; return; }
      showDash();
    } catch (err) {
      gateError.textContent = err.message;
      gateError.hidden = false;
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
    const [g, u] = await Promise.all([loadGames(), loadUsers()]);
    $("#statGames").textContent = g.length;
    $("#statFeatured").textContent = g.filter((x) => x.featured).length;
    $("#gameCountReal").textContent = g.length + " 款";
  }

  async function loadGames() {
    const data = await api("/api/games");
    games = data.games;
    const body = $("#gamesBody");
    const empty = $("#gamesEmpty");
    if (!games.length) { body.innerHTML = ""; empty.hidden = false; return games; }
    empty.hidden = true;
    body.innerHTML = games.map((g) => {
      const cover = g.cover || DEFAULT_COVER;
      const tags = (g.tags || []).map((t) => `<span>${esc(t)}</span>`).join("");
      return `<tr data-id="${esc(g.id)}">
        <td><img class="cover-thumb" src="${esc(cover)}" onerror="this.src='${DEFAULT_COVER}'" alt=""></td>
        <td><div class="game-row-title"><b>${esc(g.title)}</b><span>${esc(g.link)}</span></div></td>
        <td><div class="tag-list">${tags || '<span style="color:#666">—</span>'}</div></td>
        <td><span class="pill ${g.featured ? "on" : "off"}">${g.featured ? "精选" : "普通"}</span></td>
        <td><span class="link-cell">${esc(shortLink(g.link))}</span></td>
        <td class="ta-r"><div class="row-actions">
          <button class="btn btn-ghost btn-mini" data-edit="${esc(g.id)}">编辑</button>
          <button class="btn btn-danger btn-mini" data-del="${esc(g.id)}">删除</button>
        </div></td>
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
      return `<tr>
      <td class="game-row-title"><b>${esc(u.username)}</b></td>
      <td class="desc-cell">${esc(u.email || "—")}</td>
      <td><span class="pill ${u.role === "admin" ? "on" : "off"}">${u.role === "admin" ? "管理员" : "用户"}</span></td>
      <td class="ta-r link-cell">${fmtDate(u.createdAt)}</td>
      <td class="ta-r"><div class="row-actions">${roleBtn}${delBtn}</div></td>
    </tr>`;
    }).join("");
    $("#usersCount2").textContent = data.users.length + " 人";
    $("#statUsers").textContent = data.users.length;
    return data.users;
  }

  // ---------- editor ----------
  const editor = $("#editor");
  const editorForm = $("#editorForm");
  const editorError = $("#editorError");
  const coverPreviewImg = $("#coverPreview img");
  const coverUrlInput = $("#coverUrl");
  const coverFile = $("#coverFile");
  let savedCover = DEFAULT_COVER;

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
      setCoverPreview(DEFAULT_COVER);
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
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
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
