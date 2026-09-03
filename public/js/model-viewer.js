// 爱冒险玖日 · 3D 模型预览（点击模型弹窗查看并播放动画）
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const modal = $("#modelModal");
  if (!modal) return;
  let renderer, scene, camera, mixer, clock, raf, container, applySize;
  let dragging = false, actions = {}, animBar;
  let camTheta = 0, camPhi = 1.05, camRadius = 4, camY = 1;
  function updateCam() {
    if (!camera) return;
    const st = Math.sin(camPhi), ct = Math.cos(camPhi);
    camera.position.set(camRadius * st * Math.cos(camTheta), camY + camRadius * ct, camRadius * st * Math.sin(camTheta));
    camera.lookAt(0, camY, 0);
  }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function ensureLibs() {
    const libs = [];
    if (!window.THREE) libs.push(loadScript("https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"));
    if (window.THREE && !window.THREE.GLTFLoader) libs.push(loadScript("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"));
    return Promise.all(libs);
  }
  async function startViewer(url) {
    stopViewer();
    container = $("#mmCanvas");
    container.innerHTML = '<div style="padding:60px;text-align:center;color:var(--muted)">加载模型…</div>';
    try { await ensureLibs(); } catch (e) { container.innerHTML = "<div style='padding:40px;text-align:center;color:var(--muted)'>模型库组件加载失败</div>"; return; }
    container.innerHTML = "";
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(680, 420); renderer.setPixelRatio(1);
    container.appendChild(renderer.domElement);
    applySize = () => { const w = container.clientWidth || 680, h = container.clientHeight || 420; if (renderer && camera) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } };
    requestAnimationFrame(applySize);
    const el = renderer.domElement;
    let px = 0, py = 0;
    el.addEventListener("pointerdown", (e) => { dragging = true; px = e.clientX; py = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      camTheta -= dx * 0.005;
      camPhi = Math.max(0.15, Math.min(Math.PI - 0.15, camPhi - dy * 0.005));
      updateCam();
    });
    el.addEventListener("pointerup", () => { dragging = false; });
    el.addEventListener("pointercancel", () => { dragging = false; });
    el.addEventListener("wheel", (e) => { e.preventDefault(); camRadius = Math.max(1.5, Math.min(40, camRadius * (e.deltaY > 0 ? 1.12 : 0.9))); updateCam(); }, { passive: false });
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e0e12);
    camera = new THREE.PerspectiveCamera(45, 680 / 420, 0.1, 1000); camera.position.set(0, 1.8, 4); camera.lookAt(0, 1, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(3, 5, 4); scene.add(dir);
    scene.add(new THREE.GridHelper(6, 10, 0x333333, 0x222222));
    clock = new THREE.Clock();
    animate();
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      const obj = gltf.scene || gltf.scenes[0];
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center); obj.position.y += size.y / 2;
      scene.add(obj);
      camY = size.y / 2;
      camRadius = Math.max(size.x, size.y, size.z) * 2.4 + 1;
      updateCam();
      actions = {};
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(obj);
        gltf.animations.forEach((clip, i) => { actions[clip.name || ("动画" + (i + 1))] = mixer.clipAction(clip); });
        const first = Object.keys(actions)[0];
        if (first) actions[first].play();
        renderAnims();
      }
    }, undefined, () => { container.innerHTML = "<div style='padding:40px;text-align:center;color:var(--muted)'>模型加载失败</div>"; });
  }
  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = clock ? clock.getDelta() : 0;
    if (mixer) mixer.update(dt);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
  function stopViewer() {
    if (raf) cancelAnimationFrame(raf); raf = null;
    if (renderer) { renderer.dispose(); }
    mixer = null; renderer = null; scene = null; camera = null; clock = null; actions = {}; applySize = null;
    if (animBar) animBar.innerHTML = "";
  }
  function renderAnims() {
    if (!animBar) return;
    const names = Object.keys(actions);
    animBar.innerHTML = "动画：" + names.map((n) => `<button type="button" class="mm-anim" data-anim="${esc(n)}">${esc(n)}</button>`).join("");
    animBar.querySelectorAll("[data-anim]").forEach((b) => b.addEventListener("click", () => {
      Object.values(actions).forEach((a) => a.stop());
      const a = actions[b.dataset.anim];
      if (a) { a.reset(); a.play(); }
    }));
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function close() { modal.hidden = true; document.body.style.overflow = ""; stopViewer(); }
  window.openModelViewer = (url, name) => {
    $("#mmTitle").textContent = name || "模型";
    modal.hidden = false; document.body.style.overflow = "hidden";
    if (!animBar) { animBar = document.createElement("div"); animBar.id = "mmAnims"; animBar.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;align-items:center"; (modal.querySelector(".modal-panel") || modal).appendChild(animBar); }
    startViewer(url);
  };
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close-model]")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });
  window.addEventListener("resize", () => { if (applySize) applySize(); });
})();
