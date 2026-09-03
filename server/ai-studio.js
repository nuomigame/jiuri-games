// 爱冒险玖日 · AI 游戏工坊：从一个提示词生成可玩的单文件网页小游戏
"use strict";

// ---------------------------------------------------------------------------
// 主题色
// ---------------------------------------------------------------------------
const THEMES = [
  { bg: "#0f1220", acc: "#c8f04b", acc2: "#4bc1f0" },
  { bg: "#16101f", acc: "#ff8a5c", acc2: "#c55cff" },
  { bg: "#101a18", acc: "#4bf0c1", acc2: "#f0c14b" },
  { bg: "#1a1013", acc: "#ff5c8a", acc2: "#5c8aff" },
];

function pickTheme(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return THEMES[h % THEMES.length];
}

// ---------------------------------------------------------------------------
// 通用页面外壳（单文件，内置 <style> 和 <script>，无外部依赖）
// ---------------------------------------------------------------------------
function makeShell({ title, theme, gameJs, help }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  html,body{margin:0;height:100%;background:${theme.bg};font-family:"Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;color:#eaeaea;overflow:hidden}
  #wrap{display:grid;place-items:center;height:100%}
  canvas{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 30px 70px rgba(0,0,0,.5)}
  #hud{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:14px 18px;z-index:5}
  #hud b{color:${theme.acc};font-size:20px}
  #hud span{opacity:.8}
  #tip{position:fixed;bottom:14px;left:0;right:0;text-align:center;opacity:.55;font-size:12px}
  #overlay{position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,10,12,.7);z-index:10;cursor:pointer}
  #overlay .box{text-align:center}
  #overlay h1{margin:0 0 10px;color:${theme.acc}}
  #overlay p{opacity:.8}
  #overlay .go{margin-top:18px;padding:12px 30px;border-radius:999px;background:${theme.acc};color:#0a0a0c;font-weight:700;border:none;font-size:16px}
</style>
</head>
<body>
<div id="wrap"><canvas id="cv"></canvas></div>
<div id="hud"><span>${esc(title)}</span><b id="score">0</b></div>
<div id="tip">${esc(help)}</div>
<div id="overlay"><div class="box"><h1>${esc(title)}</h1><p>${esc(help)}</p><button class="go">开始游戏</button></div></div>
<script>
${gameJs}
</script>
</body>
</html>`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// 内置模板游戏（无 AI 时的关键词生成）
// ---------------------------------------------------------------------------
function snakeJs(t) {
  return `const cv=document.getElementById('cv'),ctx=cv.getContext('2d');let S=28,t=14;
let N=[],S2=20,dir={x:1,y:0},nd=dir,food=[],alive=false,sc=0;
function rs(){let f;do{f=[Math.floor(Math.random()*t),Math.floor(Math.random()*t)];}while(N.some(p=>p[0]==f[0]&&p[1]==f[1]));food=f;}
function size(){cv.width=(cv.clientWidth||S2*t);cv.height=(cv.clientHeight||S2*t);S=cv.width/t;}
function tick(){if(!alive)return;dir=nd;
let h=[N[0][0]+dir.x,N[0][1]+dir.y];
if(h[0]<0||h[1]<0||h[0]>=t||h[1]>=t||N.some(p=>p[0]==h[0]&&p[1]==h[1])){alive=false;document.getElementById('overlay').style.display='grid';document.querySelector('#overlay p').textContent='得分 '+sc+' · 点击重新开始';document.querySelector('#overlay h1').textContent='游戏结束';return;}
N.unshift(h);if(h[0]==food[0]&&h[1]==food[1]){sc+=10;document.getElementById('score').textContent=sc;rs();}else{N.pop();}}
function draw(){ctx.fillStyle='rgba(255,255,255,.02)';ctx.fillRect(0,0,cv.width,cv.height);
if(N.length){ctx.fillStyle='${t.acc2}';ctx.beginPath();ctx.arc(food[0]*S+S/2,food[1]*S+S/2,S*0.4,0,7);ctx.fill();N.forEach((p,i)=>{ctx.fillStyle=i? '${t.acc}':'#fff';ctx.fillRect(p[0]*S+1,p[1]*S+1,S-2,S-2);});}
requestAnimationFrame(draw);}
function start(){N=[[7,7],[6,7],[5,7]];dir={x:1,y:0};nd=dir;alive=true;sc=0;document.getElementById('score').textContent=0;rs();document.getElementById('overlay').style.display='none';}
addEventListener('keydown',e=>{const k=e.key.toLowerCase();
if(k==='arrowup'||k==='w')nd={x:0,y:-1};else if(k==='arrowdown'||k==='s')nd={x:0,y:1};else if(k==='arrowleft'||k==='a')nd={x:-1,y:0};else if(k==='arrowright'||k==='d')nd={x:1,y:0};e.preventDefault();});
document.getElementById('overlay').onclick=start;
size();setInterval(tick,130);draw();`;
}

function breakoutJs(t) {
  return `const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let W,H,pw,ball,r,score=0,rows=6,cols=9,bricks=[],paddle,vel,lose=false,started=false;
function size(){cv.width=W=cv.clientWidth||720;cv.height=H=cv.clientHeight||480;pw=110;ball={x:W/2,y:H-60,r:7,dx:3.4,dy:-3.4};paddle={x:W/2-pw/2};}
function reset(){bricks=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)bricks.push({x:c*(W/cols)+4,y:r*22+18,w:W/cols-8,h:14,alive:true});lose=false;document.getElementById('score').textContent=0;score=0;}
function tick(){if(!started||lose)return;ball.x+=ball.dx;ball.y+=ball.dy;
if(ball.x<ball.r||ball.x>W-ball.r)ball.dx*=-1;if(ball.y<ball.r)ball.dy*=-1;
if(ball.y>H){lose=true;document.getElementById('overlay').style.display='grid';document.querySelector('#overlay h1').textContent='游戏结束';document.querySelector('#overlay p').textContent='得分 '+score+' · 点击重新开始';return;}
if(ball.y>H-24-ball.r&&ball.y<H-20&&ball.x>paddle.x&&ball.x<paddle.x+pw)ball.dy=-Math.abs(ball.dy);
for(const b of bricks){if(b.alive&&ball.x>b.x&&ball.x<b.x+b.w&&ball.y>b.y&&ball.y<b.y+b.h){b.alive=false;ball.dy*=-1;score+=10;document.getElementById('score').textContent=score;break;}}}
function draw(){ctx.clearRect(0,0,W,H);
for(const b of bricks)if(b.alive){ctx.fillStyle='${t.acc}';ctx.fillRect(b.x,b.y,b.w,b.h);}
ctx.fillStyle='#fff';ctx.fillRect(paddle.x,H-20,pw,8);
ctx.fillStyle='${t.acc2}';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,7);ctx.fill();requestAnimationFrame(draw);}
addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();paddle.x=Math.max(0,Math.min(W-pw,e.clientX-r.left));});
addEventListener('touchmove',e=>{const r=cv.getBoundingClientRect();paddle.x=Math.max(0,Math.min(W-pw,e.touches[0].clientX-r.left));},{passive:true});
document.getElementById('overlay').onclick=()=>{started=true;reset();document.getElementById('overlay').style.display='none';};
size();setInterval(tick,16);draw();`;
}

function catchJs(t) {
  return `const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let W,H,px,pw=90,sc=0,drops=[],tick2=0,spd=2.4,started=false;
function size(){cv.width=W=cv.clientWidth||720;cv.height=H=cv.clientHeight||480;px=W/2-pw/2;}
function drop(){drops.push({x:Math.random()*W,y:-20,r:8+Math.random()*6,vy:spd+Math.random()*2});}
function tick(){if(!started)return;tick2++;if(tick2%26===0)drop();
for(let i=drops.length-1;i>=0;i--){const d=drops[i];d.y+=d.vy;
if(d.y>H-d.r&&d.x>px&&d.x<px+pw){sc+=10;document.getElementById('score').textContent=sc;drops.splice(i,1);}
else if(d.y>H+20){drops.splice(i,1);}}}
function draw(){ctx.clearRect(0,0,W,H);
ctx.fillStyle='#fff';ctx.fillRect(px,H-22,pw,12);
drops.forEach(d=>{ctx.fillStyle='${t.acc2}';ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,7);ctx.fill();});requestAnimationFrame(draw);}
addEventListener('mousemove',e=>{const r=cv.getBoundingClientRect();px=Math.max(0,Math.min(W-pw,e.clientX-r.left));});
addEventListener('touchmove',e=>{const r=cv.getBoundingClientRect();px=Math.max(0,Math.min(W-pw,e.touches[0].clientX-r.left));},{passive:true});
document.getElementById('overlay').onclick=()=>{started=true;document.getElementById('overlay').style.display='none';};
size();setInterval(tick,16);draw();`;
}

function clickerJs(t) {
  return `const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let W,H,sc=0,power=1,up=0,combo=0;
function size(){cv.width=W=cv.clientWidth||720;cv.height=H=cv.clientHeight||480;}
function draw(){ctx.clearRect(0,0,W,H);
ctx.fillStyle='${t.acc}';ctx.beginPath();ctx.arc(W/2,H/2-20,90+Math.min(60,combo),0,7);ctx.fill();
ctx.fillStyle='#0a0a0c';ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.fillText('×'+power,W/2,H/2-6);
ctx.fillStyle='rgba(255,255,255,.6)';ctx.font='16px sans-serif';ctx.fillText('点击方块获得能量',W/2,H/2+70);requestAnimationFrame(draw);}
function click(){sc+=power;combo=Math.min(120,combo+6);document.getElementById('score').textContent=sc;if(sc>=up+100){power++;up=sc;document.title='能量 ×'+power;}}
cv.addEventListener('mousedown',click);cv.addEventListener('touchstart',e=>{e.preventDefault();click();},{passive:false});
document.getElementById('overlay').onclick=()=>{document.getElementById('overlay').style.display='none';};
document.getElementById('overlay').style.display='none';
size();draw();`;
}

const TEMPLATES = [
  { keys: ["蛇", "贪吃", "snake"], game: snakeJs, help: "方向键 / WASD 控制，吃到食物变长，别撞墙撞自己。" },
  { keys: ["砖", "弹", "打", "break", "brick"], game: breakoutJs, help: "移动鼠标左移右移，挡球并打掉所有砖块。" },
  { keys: ["接", "果", "落", "c"], game: catchJs, help: "左右移动接住掉下来的东西，接得越多分越高。" },
  { keys: ["点", "击", "click"], game: clickerJs, help: "疯狂点击，积攒能量升级。" },
];

function pickTemplate(prompt) {
  const p = (prompt || "").toLowerCase();
  for (const tpl of TEMPLATES) if (tpl.keys.some((k) => p.includes(k))) return tpl;
  return TEMPLATES[2]; // 默认：接水果，最通用
}

function proceduralGame(prompt, title) {
  const tpl = pickTemplate(prompt);
  const theme = pickTheme(prompt + title);
  const html = makeShell({ title: title || "小游戏", theme, gameJs: tpl.game(theme), help: tpl.help });
  return { html, note: "内置生成器" };
}

// ---------------------------------------------------------------------------
// AI 调用（OpenAI 兼容接口）：提示词 + 要求输出单文件游戏
// ---------------------------------------------------------------------------
function extractHtml(content) {
  let c = (content || "").replace(/```(html)?/gi, "").trim();
  const start = c.search(/<html[\s>]/i) >= 0 ? c.search(/<html[\s>]/i) : (c.search(/<!doctype html/i) >= 0 ? c.search(/<!doctype html/i) : -1);
  if (start >= 0) c = c.slice(start);
  if (!/<html/i.test(c)) c = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><style>body{background:#0f1220;color:#eee;font-family:sans-serif;margin:0;padding:24px}</style></head><body>" + c + "</body></html>";
  return c;
}

// 去掉外部网络依赖，但保留常见 CDN 的 3D 引擎（如 three.js），让 3D 效果更真实
function makeOffline(html) {
  return String(html)
    .replace(/<script\b[^>]*src\s*=\s*["']?((?:https?:)?\/\/[^"'>]+)["']?[^>]*>[\s\S]*?<\/script>/gi, (m, src) => /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i.test(src) ? m : "")
    .replace(/<link\b[^>]*href\s*=\s*["']?((?:https?:)?\/\/[^"'>]+)["']?[^>]*>/gi, (m, href) => /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)/i.test(href) ? m : "");
}

function buildUserContent(title, prompt, images) {
  const text = "游戏标题：" + (title || "未命名小游戏") + "\n需求：" + prompt;
  if (images && images.length) {
    return [
      { type: "text", text },
      ...images.slice(0, 4).map((u) => ({ type: "image_url", image_url: { url: u } })),
    ];
  }
  return text;
}

function postChat(base, key, body) {
  return fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify(body),
  });
}

// 视觉模型：把参考图转成文字描述
async function describeImages(base, key, model, images) {
  const content = [
    { type: "text", text: "请用中文用一段话简要描述这几张参考图的风格、配色、题材和氛围（不超过120字）。" },
    ...images.slice(0, 4).map((u) => ({ type: "image_url", image_url: { url: u } })),
  ];
  const res = await postChat(base, key, { model, messages: [{ role: "user", content }], max_tokens: 300, temperature: 0.4 });
  if (!res.ok) return "";
  const j = await res.json().catch(() => ({}));
  const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  return c || "";
}

async function callAI({ prompt, title, images, sourceHtml }) {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("未配置 AI_API_KEY");
  const base = (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  // 若传了参考图，先用视觉模型把图转成文字描述；游戏代码始终用强代码模型生成
  let imageDesc = "";
  if (images && images.length) {
    try { imageDesc = await describeImages(base, key, process.env.AI_VISION_MODEL || "deepseek-v4-flash-vision-exp", images); } catch (e) { imageDesc = ""; }
  }
  const model = process.env.AI_MODEL || "deepseek-chat";
  const isModify = !!sourceHtml;
  const sys = isModify
    ? "你是一个网页游戏生成器。用户要求修改某已有游戏。请在保留原玩法基础上，按用户要求重新输出一个完整、可运行、单文件 HTML5 游戏。所有 CSS/JS 内联；除 three.js（3D 引擎）外不要用其它外部库；中文界面；有开始界面和分数；用户可用文字要求 2D 或 3D：若做 3D，可直接引入 three.js（用 <script src=\"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js\"></script>），用它搭场景、相机、光照、网格、材质，做成真正的 3D；也可用 CSS3D 或 WebGL。若做不出好的 3D 就做精致的 2D。开始界面务必能进入游戏：点击页面任意位置或按任意键即开始（要真正绑定事件）。只输出完整可运行的代码本身，不要任何解释。"
    : "你是一个网页游戏生成器。请根据用户的提示词，输出一个完整、可运行、单文件 HTML5 游戏。要求：把所有 CSS 和 JavaScript 内联在一个 <html> 文件里；除 three.js（3D 引擎）外不要用其它外部库；用中文；界面精致；有开始界面和分数。用户可以用文字要求 2D 或 3D：若做 3D，可直接引入 three.js（用 <script src=\"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js\"></script>），用它搭场景、相机、光照、网格、材质，做成真正的 3D；也可用 CSS3D 或 WebGL。若确实难以做出像样的 3D，就做一个精致的 2D 即可。开始界面务必能进入游戏：点击页面任意位置或按任意键即开始（要真正绑定事件）。只输出完整可运行的代码本身，不要任何额外解释。";
  const lead = isModify ? `这是对已有游戏《${title || "未命名"}》的修改要求，请重新生成一个完整可玩的游戏并体现这些改动。` : "";
  let userText = lead + "\n需求：" + prompt;
  if (imageDesc) userText += "\n\n（参考图风格参考：）" + imageDesc.slice(0, 500);
  const messages = [{ role: "system", content: sys }, { role: "user", content: userText }];
  const res = await postChat(base, key, { model, temperature: 0.8, max_tokens: 10000, messages });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error("AI 接口错误 " + res.status + " " + txt.slice(0, 200));
  }
  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const usage = (data && data.usage) || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return { html: extractHtml(content), usage };
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------
async function generateGame({ prompt, title, images, sourceHtml }) {
  const pt = (prompt || "").trim() || "一个简单好玩的接水果小游戏";
  const t = (title || "").trim() || "AI 生成小游戏";
  if (process.env.AI_API_KEY) {
    try {
      const r = await callAI({ prompt: pt, title: t, images, sourceHtml });
      const out = makeOffline(r.html);
      // 校验：AI 返回必须是完整的游戏（足够长且含脚本/画布），否则视为失败
      if (out.length < 600 || !(/<script[\s>]/i.test(out) || /<canvas[\s>]/i.test(out))) {
        throw new Error("AI 返回内容过短或非完整游戏代码");
      }
      return { html: out, title: t, note: sourceHtml ? "AI 修改" : "AI 生成", usedAI: true, usage: r.usage };
    } catch (e) {
      if (sourceHtml) throw new Error("AI 修改失败：" + e.message);
      const fb = proceduralGame(pt, t);
      return { ...fb, usedAI: false, note: "AI 生成失败，已用内置生成器：" + e.message };
    }
  }
  if (sourceHtml) throw new Error("未配置 AI 密钥，无法修改。请先到后台「站点设置」填写 AI 接口密钥。");
  const fb = proceduralGame(pt, t);
  return { ...fb, title: t, usedAI: false };
}

function coverSvg(title, prompt) {
  const theme = pickTheme((prompt || "") + (title || ""));
  const t = (title || "AI 游戏").slice(0, 14);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.bg}"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <circle cx="540" cy="70" r="90" fill="${theme.acc}" opacity="0.25"/>
  <circle cx="80" cy="300" r="120" fill="${theme.acc2}" opacity="0.18"/>
  <text x="36" y="70" font-family="sans-serif" font-size="20" fill="${theme.acc}">AI GAME</text>
  <text x="36" y="210" font-family="sans-serif" font-size="52" font-weight="bold" fill="#eaeaea">${esc(t)}</text>
  <text x="36" y="250" font-family="sans-serif" font-size="18" fill="#9aa0a6">点击即可游玩 · 网页游戏</text>
</svg>`;
}

module.exports = { generateGame, coverSvg };
