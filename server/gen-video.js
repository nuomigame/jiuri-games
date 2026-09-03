// Generate a short looping hero background video (webm) via Chrome MediaRecorder.
const fs = require("fs");
const path = require("path");
const pw = require("C:/Users/31148/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const W = 1920, H = 1080, FPS = 30, DURATION = 6000;

const html = `<!doctype html><html><head><meta charset=utf-8></head><body>
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
const c = document.getElementById('c'); const ctx = c.getContext('2d');
let t = 0;
function frame(ts) {
  t = ts;
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(0,0,0,${H});
  g.addColorStop(0,'#241f2e'); g.addColorStop(0.5,'#3a2c31'); g.addColorStop(1,'#2a2026');
  ctx.fillStyle = g; ctx.fillRect(0,0,${W},${H});
  ctx.globalCompositeOperation = 'lighter';
  function blob(cx,cy,r,rg,gg,bb,a){
    const x=(cx+Math.sin(t*0.00008)*40)*${W}, y=(cy+Math.cos(t*0.00006)*30)*${H};
    const rad=r*Math.min(${W},${H});
    const gr=ctx.createRadialGradient(x,y,0,x,y,rad);
    gr.addColorStop(0,'rgba('+rg+','+gg+','+bb+','+a+')'); gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr; ctx.fillRect(0,0,${W},${H});
  }
  // warm sun glow (upper right)
  blob(0.80,0.18,0.62,255,214,150,0.75);
  blob(0.80,0.18,0.30,255,238,196,0.95);
  // cool left bounce
  blob(0.10,0.55,0.42,90,120,160,0.20);
  // sea of clouds (additive, drifting)
  for(let i=0;i<34;i++){
    const depth = i/26;
    const cx = ((i*0.061 + t*0.000008*(1+depth*2)) % 1);
    const cy = 0.52 + depth*0.5;
    const v = 180 + (i%6)*16;
    blob(cx, cy, 0.13+depth*0.10, v, v*0.95, v*0.90, 0.16+depth*0.05);
  }
  // bright cloud tops
  for(let i=0;i<12;i++){
    const cx = ((i*0.13 + 0.03 + t*0.000012) % 1);
    const cy = 0.66 + (i%4)*0.10;
    blob(cx, cy, 0.08, 240,235,225, 0.12);
  }
  // drifting embers
  for(let i=0;i<70;i++){
    const sx=(i*137.5)%${W}, sy=((i*211.3 + t*0.03*i*0.4)%${H}), r=0.8+(i%3);
    ctx.fillStyle='rgba(200,240,75,'+(0.15+(i%5)/12*(0.5+0.5*Math.sin(t*0.001+i)))+')';
    ctx.beginPath(); ctx.arc(sx,sy,r,0,6.283); ctx.fill();
  }
  ctx.globalCompositeOperation='source-over';
  // gentle vignette
  const vg = ctx.createRadialGradient(${W/2},${H/2},${H*0.35},${W/2},${H/2},${H*0.95});
  vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.22)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,${W},${H});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
</script></body></html>`;

(async () => {
  const browser = await pw.chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(html);

  const dataUrl = await page.evaluate(async ({ W, H, FPS, DURATION }) => {
    const canvas = document.getElementById("c");
    const stream = canvas.captureStream(FPS);
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => (rec.onstop = res));
    rec.start(200);
    const start = performance.now();
    await new Promise((r) => {
      function tick() { if (performance.now() - start >= DURATION) r(); else requestAnimationFrame(tick); }
      tick();
    });
    rec.stop();
    await done;
    const blob = new Blob(chunks, { type: "video/webm" });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return "data:video/webm;base64," + btoa(bin);
  }, { W, H, FPS, DURATION });

  const base64 = dataUrl.split(",")[1];
  const out = path.join(__dirname, "..", "public", "assets", "video", "hero.webm");
  fs.writeFileSync(out, Buffer.from(base64, "base64"));
  console.log("wrote", out, fs.statSync(out).size, "bytes");
  await browser.close();
})();
