// 爱冒险玖日 · 游戏商店 (Steam 风格)
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fallbackCover = "/assets/img/card-default.jpg";
  let allGames = [];
  let search = "", cat = "全部", sort = "综合";
  const grid = $("#storeGrid");

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }
  let toastTimer;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

  // ---------- auth on store page ----------
  const navAuthBtn = $("#navAuthBtn");
  async function initAuth() {
    try {
      const data = await api("/api/me");
      const u = data.user;
      if (u) {
        navAuthBtn.textContent = `${u.username} · 退出`;
        navAuthBtn.dataset.logged = "1";
        if (u.role === "developer" || u.role === "admin") $("#devEntry").hidden = false;
      }
    } catch (e) {}
  }
  navAuthBtn.addEventListener("click", async () => {
    if (navAuthBtn.dataset.logged) {
      try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
      location.reload();
    } else {
      location.href = "/";
    }
  });

  // ---------- filter & sort ----------
  function sortedAndFiltered() {
    const q = search.trim().toLowerCase();
    let list = allGames.slice();
    if (q) list = list.filter((g) =>
      (g.title || "").toLowerCase().includes(q) ||
      (g.description || "").toLowerCase().includes(q) ||
      (g.tags || []).some((t) => t.toLowerCase().includes(q)));
    if (cat && cat !== "全部") {
      const want = cat.toLowerCase();
      list = list.filter((g) => (g.tags || []).some((t) => t.toLowerCase() === want));
    }
    if (sort === "人气") list.sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0));
    else if (sort === "最新") list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sort === "精选") list = list.filter((g) => g.featured).concat(list.filter((g) => !g.featured));
    else list.sort((a, b) => {
      const ra = a.status === "pending" ? 0 : 1, rb = b.status === "pending" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const la = Number(a.likes) || 0, lb = Number(b.likes) || 0;
      if (la !== lb) return lb - la;
      if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return list;
  }

  function buildCats() {
    const counts = new Map();
    allGames.forEach((g) => (g.tags || []).forEach((t) => { const k = String(t).trim(); if (k) counts.set(k, (counts.get(k) || 0) + 1); }));
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, "zh"));
    const chips = [["全部", allGames.length], ...names.map((n) => [n, counts.get(n)])];
    $("#storeCats").innerHTML = chips.map(([c, n]) => `<button class="cat-chip ${c === cat ? "is-active" : ""}" data-cat="${esc(c)}"><span>${esc(c)}</span><em>${n}</em></button>`).join("");
  }
  $("#storeCats").addEventListener("click", (e) => { const chip = e.target.closest(".cat-chip"); if (!chip) return; cat = chip.dataset.cat; buildCats(); renderGrid(); });

  // ---------- grid ----------
  function renderGrid() {
    const list = sortedAndFiltered();
    const empty = $("#storeEmpty");
    $("#storeCount").textContent = list.length + " 款";
    if (!list.length) { grid.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = list.map((g) => {
      const cover = g.cover || fallbackCover;
      const isDownload = g.type === "download";
      const pending = g.status === "pending";
      return `<div class="store-card" data-id="${esc(g.id)}" role="button" tabindex="0">
        <div class="store-card-cover">
          <img src="${esc(cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.src='${fallbackCover}'">
          <span class="store-type ${isDownload ? "dl" : ""}">${isDownload ? "需下载" : "网页游戏"}</span>
          ${pending ? '<span class="store-pending">待审核</span>' : ""}
        </div>
        <div class="store-card-body">
          <h3 class="store-card-title">${esc(g.title)}</h3>
          <div class="store-card-tags">${(g.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join("") || '<span>—</span>'}</div>
          <div class="store-card-meta">
            <span class="store-price">${isDownload ? "免费下载" : "免费开玩"}</span>
            <span class="store-like">♥ ${Number(g.likes) || 0}</span>
          </div>
        </div>
      </div>`;
    }).join("");
  }
  grid.addEventListener("click", (e) => { const c = e.target.closest(".store-card"); if (!c) return; openById(c.dataset.id); });
  grid.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const c = e.target.closest(".store-card"); if (!c) return; e.preventDefault(); openById(c.dataset.id); });

  function openById(id) { const g = allGames.find((x) => x.id === id); if (g) window.openGameModal(g); }
  $("#storeSearch").addEventListener("input", () => { search = $("#storeSearch").value; clearTimeout(window.__st); window.__st = setTimeout(renderGrid, 120); });
  $$(".sort-btn").forEach((b) => b.addEventListener("click", () => { sort = b.dataset.sort; $$(".sort-btn").forEach((x) => x.classList.toggle("is-active", x === b)); renderGrid(); }));

  // ---------- featured hero carousel ----------
  let featIndex = 0, featSlides = [];
  function renderHero() {
    const feat = allGames.filter((g) => g.featured);
    featSlides = (feat.length ? feat : allGames.slice().sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0))).slice(0, 6);
    const trackEl = $("#featuredTrack");
    if (!featSlides.length) { trackEl.innerHTML = ""; $("#featured").style.display = "none"; return; }
    $("#featured").style.display = "";
    trackEl.innerHTML = featSlides.map((g) => {
      const cover = g.cover || fallbackCover;
      const isDownload = g.type === "download";
      return `<div class="feat-slide" data-id="${esc(g.id)}">
        <img src="${esc(cover)}" alt="${esc(g.title)}" onerror="this.src='${fallbackCover}'">
        <div class="feat-overlay"></div>
        <div class="feat-info">
          <span class="feat-type">${isDownload ? "需下载 · 电脑运行" : "网页游戏"}</span>
          <h2 class="feat-title">${esc(g.title)}</h2>
          <p class="feat-desc">${esc(g.description)}</p>
          <div class="feat-tags">${(g.tags || []).slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
          <button class="btn btn-primary feat-play" data-id="${esc(g.id)}">查看详情 ▶</button>
        </div>
      </div>`;
    }).join("");
    $("#featDots").innerHTML = featSlides.map((_, i) => `<i class="${i === 0 ? "on" : ""}" data-i="${i}"></i>`).join("");
    $("#featuredTrack").addEventListener("click", (e) => { const p = e.target.closest("[data-id]"); if (p) openById(p.dataset.id); });
    $("#featDots").addEventListener("click", (e) => { const d = e.target.closest("i[data-i]"); if (d) gotoFeat(+d.dataset.i); });
    featIndex = 0;
    applyFeat();
  }
  function applyFeat() {
    if (!featSlides.length) return;
    const t = Math.max(0, Math.min(featIndex, featSlides.length - 1));
    $("#featuredTrack").style.transform = `translateX(-${t * 100}%)`;
    $$("#featDots i").forEach((d, i) => d.classList.toggle("on", i === t));
  }
  function gotoFeat(i) { featIndex = i; applyFeat(); }
  $("#featPrev").addEventListener("click", () => { featIndex = (featIndex - 1 + featSlides.length) % featSlides.length; applyFeat(); });
  $("#featNext").addEventListener("click", () => { featIndex = (featIndex + 1) % featSlides.length; applyFeat(); });
  setInterval(() => { if (featSlides.length > 1 && document.visibilityState === "visible") { featIndex = (featIndex + 1) % featSlides.length; applyFeat(); } }, 5000);

  // ---------- boot ----------
  async function load() {
    try {
      const data = await api("/api/games");
      allGames = data.games || [];
      buildCats();
      renderGrid();
      renderHero();
    } catch (e) { toast("加载商店失败：" + e.message); }
  }
  initAuth();
  load();
})();
