// 爱冒险玖日 · 问题/建议/反馈
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  const modal = $("#feedbackModal");
  if (!modal) return;
  function open() { modal.hidden = false; document.body.style.overflow = "hidden"; setTimeout(() => modal.querySelector("textarea")?.focus(), 60); }
  function close() { modal.hidden = true; document.body.style.overflow = ""; }
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close-feedback]")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  document.querySelectorAll("[data-open-feedback]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); open(); }));
  const form = modal.querySelector("form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = (form.querySelector('[name=type]') || {}).value || "其他";
    const content = (form.querySelector('[name=content]') || {}).value || "";
    if (!content.trim()) { toast("请填写反馈内容"); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true; btn.textContent = "提交中…";
    try {
      await api("/api/feedback", { method: "POST", body: JSON.stringify({ type, content }) });
      close(); toast("感谢反馈！已提交给管理员");
      form.reset();
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; btn.textContent = "提交反馈"; }
  });
  window.openFeedback = open;
})();
