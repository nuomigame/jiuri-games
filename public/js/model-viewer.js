// 爱冒险玖日 · 3D 模型预览（点击模型弹窗查看并播放动画）
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const modal = $("#modelModal");
  if (!modal) return;
  let renderer, scene, camera, mixer, clock, raf, container;
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
    const w = container.clientWidth || 680, h = container.clientHeight || 420;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h); renderer.setPixelRatio(1);
    container.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0e0e12);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000); camera.position.set(0, 1.8, 4); camera.lookAt(0, 1, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(3, 5, 4); scene.add(dir);
    scene.add(new THREE.GridHelper(6, 10, 0x333333, 0x222222));
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      const obj = gltf.scene || gltf.scenes[0];
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center); obj.position.y += size.y / 2;
      scene.add(obj);
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(obj);
        const action = mixer.clipAction(gltf.animations[0]);
        action.play();
      }
      clock = new THREE.Clock();
      animate();
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
    mixer = null; renderer = null; scene = null; camera = null; clock = null;
  }
  function close() { modal.hidden = true; document.body.style.overflow = ""; stopViewer(); }
  window.openModelViewer = (url, name) => { $("#mmTitle").textContent = name || "模型"; modal.hidden = false; document.body.style.overflow = "hidden"; startViewer(url); };
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close-model]")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });
})();
