// 爱冒险玖日 · 共享游戏详情弹窗
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const fallbackCover = window.__STATIC__ ? "assets/img/card-default.jpg" : "/assets/img/card-default.jpg";

  function defaultAvatar(name) {
    const ch = ((name || "?").trim().charAt(0) || "?").toUpperCase();
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"96\" height=\"96\">"
      + "<rect width=\"96\" height=\"96\" rx=\"48\" fill=\"#131318\"/>"
      + "<text x=\"48\" y=\"60\" font-family=\"Arial\" font-size=\"40\" fill=\"#8b8b86\" text-anchor=\"middle\">" + ch + "</text></svg>";
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  window.defaultAvatar = defaultAvatar;

  const modal = $("#gameModal");
  if (!modal) return;
  const E = (s) => modal.querySelector(s);
  let slides = [], slideIdx = 0;

  function renderSlide() {
    if (!slides.length) { E("#gmImage").src = fallbackCover; return; }
    const i = Math.max(0, Math.min(slideIdx, slides.length - 1));
    E("#gmImage").src = slides[i];
    E("#gmDots").innerHTML = slides.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    E("#gmPrev").style.visibility = slides.length > 1 ? "visible" : "hidden";
    E("#gmNext").style.visibility = slides.length > 1 ? "visible" : "hidden";
    E("#gmCounter").textContent = (i + 1) + " / " + slides.length;
  }

  function open(g) {
    const cover = g.cover || fallbackCover;
    slides = (g.images && g.images.length ? g.images.slice() : [cover]);
    if (slides[0] !== cover) slides = [cover, ...slides.filter((s) => s !== cover)];
    slideIdx = 0;
    E("#gmTitle").textContent = g.title || "";
    E("#gmDesc").textContent = g.description || "";
    E("#gmTags").innerHTML = (g.tags || []).map((t) => `<span>${esc(t)}</span>`).join("") || '<span style="color:#666">—</span>';
    const isDownload = g.type === "download";
    E("#gmType").textContent = isDownload ? "需下载 · 电脑运行" : "网页游戏";
    E("#gmType").className = "gm-type " + (isDownload ? "dl" : "web");
    E("#gmLikes").textContent = "♥ " + (Number(g.likes) || 0);
    const authorWrap = E("#gmAuthor");
    if (g.ownerName) {
      const av = g.ownerAvatar || defaultAvatar(g.ownerName);
      const cb = defaultAvatar(g.ownerName);
      authorWrap.innerHTML = `<a class="gm-author" href="/user/${encodeURIComponent(g.ownerName)}"
        ><img src="${esc(av)}" alt="" onerror="this.onerror=null;this.src='${cb}'"><span>${esc(g.ownerName)}</span></a>`;
      authorWrap.hidden = false;
    } else { authorWrap.hidden = true; }
    const play = E("#gmPlay");
    play.textContent = isDownload ? "下载游戏" : "开始游戏";
    play.href = g.link && /^(https?:)?\/\//i.test(g.link) ? g.link : "#";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    renderSlide();
  }
  function close() { modal.hidden = true; document.body.style.overflow = ""; }

  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close-game]")) close(); });
  E("#gmPrev").addEventListener("click", () => { slideIdx = (slideIdx - 1 + slides.length) % slides.length; renderSlide(); });
  E("#gmNext").addEventListener("click", () => { slideIdx = (slideIdx + 1) % slides.length; renderSlide(); });
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") { slideIdx = (slideIdx - 1 + slides.length) % slides.length; renderSlide(); }
    if (e.key === "ArrowRight") { slideIdx = (slideIdx + 1) % slides.length; renderSlide(); }
  });
  window.openGameModal = open;
})();
