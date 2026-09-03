// 爱冒险玖日 · 游戏网站 — 主站交互
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const state = { user: null, authMode: "login" };
  // 静态模式：直接部署到纯静态托管（如 Netlify Drop），无后端时游戏数据来自本地 JSON
  const IS_STATIC = window.__STATIC__ === true;

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ---------- api ----------
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

  // ---------- nav scroll state ----------
  const nav = $("#nav");
  const onScrollNav = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScrollNav, { passive: true });
  onScrollNav();

  // active link highlight
  const links = $$(".nav-links a");
  const sections = links.map((l) => $(l.getAttribute("href"))).filter(Boolean);
  const ioLink = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        links.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === "#" + e.target.id));
      }
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => ioLink.observe(s));

  // ---------- reveal on scroll ----------
  const ioReveal = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = Math.min(i * 80, 240) + "ms";
        e.target.classList.add("is-visible");
        ioReveal.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  $$(".reveal").forEach((el) => ioReveal.observe(el));

  // ---------- stats counters ----------
  function animateCount(el) {
    const target = +el.dataset.count || 0;
    const suffix = el.dataset.suffix || "";
    const dur = 1400;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  const ioStats = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        animateCount(e.target);
        ioStats.unobserve(e.target);
      }
    });
  }, { threshold: 0.6 });
  $$(".stat-num").forEach((el) => ioStats.observe(el));

  // ---------- hero background: canvas aurora + embers ----------
  const canvas = $("#heroCanvas");
  const ctx = canvas.getContext("2d");
  const heroVideo = $(".hero-video");
  let W = 0, H = 0, DPR = 1;
  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  const blobs = [
    { x: 0.82, y: 0.2, r: 0.5, hue: [255, 205, 130], sp: 0.00015 },
    { x: 0.15, y: 0.5, r: 0.4, hue: [120, 200, 120], sp: 0.00012 },
    { x: 0.5, y: 0.85, r: 0.5, hue: [200, 240, 75], sp: 0.0001 },
  ];
  const embers = Array.from({ length: 60 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - 0.5) * 0.0004,
    vy: -0.0002 - Math.random() * 0.0005,
    r: 0.8 + Math.random() * 2.2,
    a: 0.2 + Math.random() * 0.5,
    tw: Math.random() * Math.PI * 2,
  }));

  function drawBackground(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const b of blobs) {
      const x = (b.x + Math.sin(t * b.sp * 10) * 0.04) * W;
      const y = (b.y + Math.cos(t * b.sp * 14) * 0.03) * H;
      const r = b.r * Math.min(W, H);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const [rr, gg, bb] = b.hue;
      g.addColorStop(0, `rgba(${rr},${gg},${bb},0.08)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // drifting embers
    for (const e of embers) {
      const x = (e.x * W) % W;
      const y = (e.y * H) % H;
      const alpha = e.a * (0.5 + 0.5 * Math.sin(t * 0.001 + e.tw));
      ctx.fillStyle = `rgba(200,240,75,${alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(x, y, e.r, 0, Math.PI * 2);
      ctx.fill();
      e.x += e.vx; e.y += e.vy;
      if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); }
      if (e.x < 0) e.x = 1; if (e.x > 1) e.x = 0;
    }
    ctx.globalCompositeOperation = "source-over";
  }
  let lastT = 0;
  function loops(ts) {
    drawBackground(ts);
    requestAnimationFrame(loops);
  }
  resizeCanvas();
  requestAnimationFrame(loops);
  window.addEventListener("resize", resizeCanvas);

  // Probe for a real background video; only play it if it actually exists.
  // The canvas animation above keeps the scene alive either way.
  async function probeVideo() {
    const candidates = [
      { src: "/assets/video/hero.webm", type: "video/webm" },
      { src: "/assets/video/hero.mp4", type: "video/mp4" },
    ];
    for (const cand of candidates) {
      try {
        const res = await fetch(cand.src, { method: "HEAD" });
        if (res.ok) {
          heroVideo.src = cand.src;
          heroVideo.type = cand.type;
          heroVideo.addEventListener("canplay", () => {
            heroVideo.classList.add("is-on");
          }, { once: true });
          heroVideo.play().catch(() => {});
          return;
        }
      } catch (e) {
        /* try next */
      }
    }
  }
  if (!IS_STATIC) probeVideo();

  // ---------- games ----------
  const track = $("#gamesTrack");
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function renderGames(games) {
    const empty = $("#gamesEmpty");
    if (!games.length) { track.innerHTML = ""; empty.hidden = false; return; }
    empty.hidden = true;
    const fallbackCover = IS_STATIC ? "assets/img/card-default.jpg" : "/assets/img/card-default.jpg";
    track.innerHTML = games.map((g) => {
      const cover = g.cover || fallbackCover;
      const external = /^(https?:)?\/\//i.test(g.link || "");
      const url = external ? g.link : "";
      const tags = (g.tags || []).slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join("");
      const isDemo = !external;
      return `
        <article class="game-card" role="button" tabindex="0" data-url="${esc(url)}" data-demo="${isDemo ? "1" : ""}" data-title="${esc(g.title)}">
          <div class="game-cover">
            <img src="${esc(cover)}" alt="${esc(g.title)}" loading="lazy" onerror="this.src='${fallbackCover}'">
            <span class="game-cover-tag">${g.featured ? "Featured" : "Playable"}</span>
            <div class="game-play"><span>▶</span></div>
          </div>
          <div class="game-body">
            <h3 class="game-title">${esc(g.title)}</h3>
            <p class="game-desc">${esc(g.description)}</p>
            <div class="game-tags">${tags}</div>
          </div>
        </article>`;
    }).join("");
  }
  async function loadGames() {
    try {
      const data = IS_STATIC
        ? { games: window.GAMES_DATA || [] }
        : await api("/api/games");
      renderGames(data.games);
    } catch (e) {
      toast("加载游戏失败：" + e.message);
    }
  }
  track.addEventListener("click", (e) => {
    if (justDragged) { e.preventDefault(); return; }
    const card = e.target.closest(".game-card");
    if (!card) return;
    if (card.dataset.demo === "1") {
      toast(`《${card.dataset.title}》 即将上线，敬请期待`);
      return;
    }
    const url = card.dataset.url;
    if (url && /^(https?:)?\/\//i.test(url)) {
      // 只弹出新窗口，原页面保持不变
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast("浏览器拦截了弹窗，请允许弹出窗口后重试");
    }
  });
  // keyboard support (Enter/Space) for the card role="button"
  track.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".game-card");
    if (!card) return;
    e.preventDefault();
    if (card.dataset.demo === "1") {
      toast(`《${card.dataset.title}》 即将上线，敬请期待`);
      return;
    }
    const url = card.dataset.url;
    if (url && /^(https?:)?\/\//i.test(url)) {
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast("浏览器拦截了弹窗，请允许弹出窗口后重试");
    }
  });
  loadGames();

  // Refetch games when the page becomes visible again (tab switch / back /
  // bfcache restore) so admin edits (e.g. new covers) show up immediately.
  let refreshTimer;
  const refreshGames = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadGames, 120);
  };
  window.addEventListener("pageshow", refreshGames);
  window.addEventListener("focus", refreshGames);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshGames(); });

  // carousel controls
  const cardW = () => ($(".game-card")?.getBoundingClientRect().width || 300) + 22;
  $("#gamesNext").addEventListener("click", () => track.scrollBy({ left: cardW() * 2, behavior: "smooth" }));
  $("#gamesPrev").addEventListener("click", () => track.scrollBy({ left: -cardW() * 2, behavior: "smooth" }));

  // drag to scroll — no pointer capture so anchor clicks still fire
  let isDown = false, startX = 0, startLeft = 0, moved = false, justDragged = false;
  track.addEventListener("pointerdown", (e) => {
    isDown = true; startX = e.clientX; startLeft = track.scrollLeft; moved = false;
    track.classList.add("is-dragging");
  });
  track.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 4) moved = true;
    if (moved) track.scrollLeft = startLeft - dx;
  });
  const endDrag = () => {
    if (moved) { justDragged = true; setTimeout(() => { justDragged = false; }, 80); }
    isDown = false; track.classList.remove("is-dragging");
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("pointerleave", endDrag);

  // ---------- auth ----------
  const authModal = $("#authModal");
  const navAuthBtn = $("#navAuthBtn");
  const authForm = $("#authForm");
  const authError = $("#authError");
  const authSubmit = $("#authSubmit");
  const emailField = $("#emailField");

  function openAuth(mode = "login") {
    setAuthMode(mode);
    authModal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => $("input[name=username]", authForm)?.focus(), 60);
  }
  function closeAuth() {
    authModal.hidden = true;
    document.body.style.overflow = "";
  }
  function setAuthMode(mode) {
    state.authMode = mode;
    $$(".auth-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.auth === mode));
    emailField.hidden = mode !== "register";
    authSubmit.textContent = mode === "login" ? "登录" : "注册并进入";
    authError.hidden = true;
  }
  $$(".auth-tab").forEach((t) => t.addEventListener("click", () => setAuthMode(t.dataset.auth)));
  $$("[data-close-auth]").forEach((el) => el.addEventListener("click", closeAuth));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAuth(); });

  function updateAuthUI() {
    if (state.user) {
      const isAdmin = state.user.role === "admin";
      navAuthBtn.textContent = `${state.user.username} · 退出`;
      const ml = $("#manageLink");
      ml.hidden = !isAdmin;
      if (!isAdmin) toast("欢迎回来，" + state.user.username);
    } else {
      navAuthBtn.textContent = "登录 / 注册";
    }
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (IS_STATIC) {
      toast("静态版已暂停账号功能，如需在线管理请部署带后端的版本");
      return;
    }
    const fd = new FormData(authForm);
    const username = fd.get("username").trim();
    const password = fd.get("password");
    const email = (fd.get("email") || "").trim();
    authError.hidden = true;
    authSubmit.disabled = true;
    authSubmit.textContent = "请稍候…";
    try {
      const path = state.authMode === "login" ? "/api/login" : "/api/register";
      const body = state.authMode === "login" ? { username, password } : { username, password, email };
      const data = await api(path, { method: "POST", body: JSON.stringify(body) });
      state.user = data.user;
      updateAuthUI();
      closeAuth();
      toast(state.authMode === "login" ? "登录成功" : "注册成功，欢迎加入！");
      authForm.reset();
    } catch (err) {
      authError.textContent = err.message;
      authError.hidden = false;
    } finally {
      authSubmit.disabled = false;
      setAuthMode(state.authMode);
    }
  });

  // single handler: logged in -> logout, otherwise open auth modal
  navAuthBtn.addEventListener("click", async () => {
    if (IS_STATIC) return;
    if (state.user) {
      try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
      state.user = null;
      updateAuthUI();
      toast("已退出登录");
    } else {
      openAuth();
    }
  });

  // restore session on load
  (async function init() {
    if (IS_STATIC) {
      navAuthBtn.hidden = true;
      return;
    }
    try {
      const data = await api("/api/me");
      state.user = data.user;
    } catch (e) {}
    updateAuthUI();
  })();

  // contact button in hero -> open auth? no -> scroll to contact
  $$("[data-open-contact]").forEach((b) => b.addEventListener("click", () => {
    $("#contact").scrollIntoView({ behavior: "smooth" });
  }));
})();
