// 构建“纯静态可玩版”：本地双击可直接打开，也可 zip 上传 Netlify Drop
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "public");
const out = path.join(root, "build", "netlify");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(src, out, { recursive: true });

// 把管理员上传的封面一并打包（位于根目录 uploads/）
const rootUploads = path.join(root, "uploads");
if (fs.existsSync(rootUploads)) {
  const outUploads = path.join(out, "uploads");
  fs.mkdirSync(outUploads, { recursive: true });
  for (const f of fs.readdirSync(rootUploads)) {
    if (f === ".gitkeep") continue;
    fs.copyFileSync(path.join(rootUploads, f), path.join(outUploads, f));
  }
}

// 读取游戏数据，并把封面改成相对路径（本地双击 / 部署到根目录都能显示）
const db = JSON.parse(fs.readFileSync(path.join(root, "data", "db.json"), "utf8"));
const relCover = (c) => {
  if (!c) return c;
  if (/^\/uploads\//.test(c)) return "uploads/" + path.basename(c);
  if (/^\/assets\//.test(c)) return c.slice(1);
  return c;
};
const games = (db.games || []).map((g) => ({ ...g, cover: relCover(g.cover) }));

// 注入静态模式 + 内嵌游戏数据（避免 fetch 在 file:// 下被限制）
const idxPath = path.join(out, "index.html");
let html = fs.readFileSync(idxPath, "utf8");
html = html.replace(
  '<script src="/js/app.js',
  `<script>window.__STATIC__=true;window.GAMES_DATA=${JSON.stringify(games)};</script>\n  <script src="/js/app.js`
);
// 资源改为相对路径，本地双击也能正常显示
html = html.replace(/(href|src|poster)="\/(assets|css|js)\//g, '$1="$2/');
fs.writeFileSync(idxPath, html);

// 静态版没有后端，去掉后台页面与多余的 data 目录
if (fs.existsSync(path.join(out, "admin.html"))) fs.unlinkSync(path.join(out, "admin.html"));
if (fs.existsSync(path.join(out, "data"))) fs.rmSync(path.join(out, "data"), { recursive: true, force: true });

let total = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else total += fs.statSync(p).size;
  }
})(out);
console.log("静态构建完成:", out, "| 总大小:", total, "字节");
