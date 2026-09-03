// 爱冒险玖日 · 用户主页
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fallbackCover = "/assets/img/card-default.jpg";

  let toastTimer;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }
  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  const uname = decodeURIComponent((location.pathname.replace(/^\/user\/?/, "") || "").split("/")[0]);
  document.title = (uname || "用户") + " · 主页 · 爱冒险玖日";
  $("#backLink").href = "/#games";

  function badges(role) {
    if (role === "admin") return [{ k: "b-admin", label: "社区管理员" }, { k: "b-dev", label: "游戏开发者" }];
    if (role === "developer") return [{ k: "b-dev", label: "游戏开发者" }];
    return [{ k: "b-user", label: "社区成员" }];
  }
  function avSrc(avatar, name) { return avatar || window.defaultAvatar(name); }

  async function load(isOwn) {
    const data = await api("/api/user/" + encodeURIComponent(uname));
    const u = data.user;
    $("#pName").textContent = u.username;
    $("#pBio").textContent = u.bio || "这个人很神秘，还没有留下简介。";
    const fb = window.defaultAvatar(u.username);
    $("#avatarSlot").innerHTML = `<img src="${esc(avSrc(u.avatar, u.username))}" alt="" onerror="this.onerror=null;this.src='${fb}'" />`;
    $("#pBadges").innerHTML = badges(u.role).map((b) => `<span class="badge ${b.k}">● ${esc(b.label)}</span>`).join("");
    $("#pActions").hidden = !isOwn;
    $("#profileFooter").hidden = !isOwn;
    $("#gamesHeading").textContent = isOwn ? "我的游戏" : "TA 的游戏";

    const grid = $("#gamesGrid");
    const no = $("#noGames");
    if (!data.games.length) { grid.innerHTML = ""; no.hidden = false; return; }
    no.hidden = true;
    grid.innerHTML = data.games.map((g) => {
      const cover = g.cover || fallbackCover;
      const type = g.type === "download" ? "需下载" : "网页游戏";
      const pending = g.status === "pending";
      return `<article class="game-card profile-game" data-id="${esc(g.id)}" role="button" tabindex="0">
        <div class="game-cover">
          <img src="${esc(cover)}" alt="" loading="lazy" onerror="this.src='${fallbackCover}'">
          <span class="game-cover-tag">${type}</span>
          ${pending ? '<span class="game-pending">待审核</span>' : ""}
          <div class="game-play"><span>${g.type === "download" ? "⤓" : "▶"}</span></div>
        </div>
        <div class="game-body">
          <h3 class="game-title">${esc(g.title)}</h3>
          <p class="game-desc">${esc(g.description)}</p>
        </div>
      </article>`;
    }).join("");
    grid.addEventListener("click", (e) => {
      const card = e.target.closest(".profile-game");
      if (!card) return;
      const g = data.games.find((x) => x.id === card.dataset.id);
      if (g) window.openGameModal(g);
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest(".profile-game");
      if (!card) return;
      e.preventDefault();
      const g = data.games.find((x) => x.id === card.dataset.id);
      if (g) window.openGameModal(g);
    });
    // cache for the edit modal / own avatar
    window.__profileGames = data.games;
    window.__profileUser = u;
    if (isOwn) initEdit(u);
  }

  async function boot() {
    let isOwn = false, me = null;
    try { me = (await api("/api/me")).user; } catch (e) {}
    if (me && (me.username || "").toLowerCase() === uname.toLowerCase()) isOwn = true;
    await load(isOwn);
  }
  boot();

  // ---- edit own profile ----
  const editModal = $("#editModal");
  const avFile = $("#avatarFile"), avUrl = $("#avatarUrl"), avPreview = $("#avatarPreview img");
  let savedAvatar = "";
  function setPreview(src) { avPreview.src = src || window.defaultAvatar(window.__profileUser?.username || uname); }
  function initEdit(u) {
    savedAvatar = u.avatar || "";
    setPreview(savedAvatar);
    $("#nameInput").value = u.username || "";
  }
  $("#editBtn").addEventListener("click", () => { editModal.hidden = false; document.body.style.overflow = "hidden"; });
  $$("[data-close-edit]").forEach((el) => el.addEventListener("click", () => { editModal.hidden = true; document.body.style.overflow = ""; }));
  avFile.addEventListener("change", () => {
    const f = avFile.files[0]; if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast("图片不能超过 8MB"); avFile.value = ""; return; }
    const r = new FileReader();
    r.onload = () => { savedAvatar = r.result; setPreview(savedAvatar); avUrl.value = ""; };
    r.readAsDataURL(f);
  });
  avUrl.addEventListener("input", () => { const v = avUrl.value.trim(); if (v) { savedAvatar = v; setPreview(v); } else setPreview(window.__profileUser?.avatar); });
  $("#editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const bio = $("#bioInput").value;
    const newName = $("#nameInput").value.trim();
    const btn = $("#editSave"); btn.disabled = true; btn.textContent = "保存中…";
    $("#editError").hidden = true;
    try {
      await api("/api/me/profile", { method: "PUT", body: JSON.stringify({ avatar: savedAvatar, bio, username: newName }) });
      toast("资料已更新");
      editModal.hidden = true; document.body.style.overflow = "";
      if (newName && newName !== uname) {
        location.href = "/user/" + encodeURIComponent(newName);
      } else {
        await load(true);
      }
    } catch (err) { $("#editError").textContent = err.message; $("#editError").hidden = false; }
    finally { btn.disabled = false; btn.textContent = "保存资料"; }
  });

  $("#logoutBtn").addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
    location.href = "/";
  });
})();
