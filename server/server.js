// 爱冒险玖日 · 游戏网站 — 轻量后端（纯 Node 内置模块，无第三方依赖）
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
// 部署时可通过环境变量指定持久化目录（例如挂载的卷），默认保存在项目内
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const UPLOADS = process.env.DATA_DIR ? path.join(DATA_DIR, "uploads") : path.join(ROOT, "uploads");
const DB_FILE = path.join(DATA_DIR, "db.json");

const PORT = process.env.PORT || 3009;
const HOST = process.env.HOST || "0.0.0.0";
// 可部署时用环境变量设置更强的管理员初始密码（仅当数据库里还没有管理员时生效）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "QQ13944655076";
const SESSION_DAYS = 30;
const MAX_BODY = 20 * 1024 * 1024; // 20MB

// ---------------------------------------------------------------------------
// Database (JSON)
// ---------------------------------------------------------------------------
function ensureDirs() {
  for (const d of [PUBLIC, UPLOADS, DATA_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

let db = null;
function loadDb() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
      db = null;
    }
  }
  if (!db || typeof db !== "object") {
    db = {
      secret: crypto.randomBytes(32).toString("hex"),
      users: [],
      games: [],
      applications: [],
    };
    saveDb();
  }
  // upgrade: ensure new fields exist even for an existing database
  if (!Array.isArray(db.applications)) db.applications = [];
  db.games = (db.games || []).map((g) => Object.assign({ type: "web", ownerId: null, status: (g.status || "approved"), images: [] }, g));
  db.users = (db.users || []).map((u) => Object.assign({ liked: [], avatar: "", bio: "" }, u));
  ensureAdmin();
  // 早期官方游戏没有归属：统一归到主管理员，便于显示“制作人”
  const mainAdmin = db.users.find((u) => u.username === "admin");
  if (mainAdmin) db.games.forEach((g) => { if (!g.ownerId) g.ownerId = mainAdmin.id; });
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function uid() {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
const PRUNE_SECRET = "prune:admin:2026";
function ensureAdmin() {
  if (!db.users || !db.users.some((u) => u.role === "admin" && u.username === "admin")) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(ADMIN_PASSWORD, salt, 64).toString("hex");
    db.users.push({
      id: uid(),
      username: "admin",
      email: "",
      salt,
      passHash: hash,
      role: "admin",
      createdAt: Date.now(),
      liked: [],
      avatar: "",
      bio: "",
    });
    saveDb();
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function createUser({ username, password, email = "" }) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: uid(),
    username,
    email,
    salt,
    passHash: hashPassword(password, salt),
    role: "user",
    createdAt: Date.now(),
    liked: [],
    avatar: "",
    bio: "",
  };
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", db.secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expect = crypto.createHmac("sha256", db.secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).sid;
  const payload = verifyToken(token);
  if (!payload) return null;
  return db.users.find((u) => u.id === payload.uid) || null;
}

function cookieFor(token, maxAgeSeconds) {
  return `sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const e = new Error("Body too large");
        e.status = 413;
        reject(e);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error("Invalid JSON");
    err.status = 400;
    throw err;
  }
}

function sanitizeText(value, max = 300) {
  return String(value == null ? "" : value).replace(/[<>]/g, "").slice(0, max).trim();
}

function normalizeCover(cover) {
  // Accept a URL, a server path, or a base64 data URL.
  if (!cover || typeof cover !== "string") return "";
  cover = cover.trim();
  if (cover.startsWith("/uploads/")) return cover;
  const m = cover.match(/^data:(image\/(png|jpe?g|webp|gif));base64,(.+)$/i);
  if (m) {
    let ext = m[2].toLowerCase() === "jpeg" || m[2].toLowerCase() === "jpg" ? "jpg" : m[2].toLowerCase();
    if (ext === "jpeg") ext = "jpg";
    if (ext === "svg") ext = "png";
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 8 * 1024 * 1024) throw Object.assign(new Error("图片太大"), { status: 413 });
    const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS, name), buf);
    return `/uploads/${name}`;
  }
  if (/^(https?:)?\/\//i.test(cover)) return cover;
  return "";
}

function removeUploadedCover(cover) {
  if (cover && cover.startsWith("/uploads/")) {
    const f = path.join(UPLOADS, path.basename(cover));
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
    }
  }
}

function normalizeImages(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const it of list.slice(0, 8)) {
    if (!it || typeof it !== "string") continue;
    const norm = normalizeCover(it);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out.slice(0, 6);
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    liked: Array.isArray(u.liked) ? u.liked : [],
    avatar: u.avatar || "",
    bio: u.bio || "",
  };
}

function publicGame(g) {
  return {
    ...g,
    tags: Array.isArray(g.tags) ? g.tags : [],
    likes: Number(g.likes) || 0,
    type: g.type === "download" ? "download" : "web",
    status: g.status === "pending" ? "pending" : "approved",
    images: Array.isArray(g.images) ? g.images : [],
  };
}

function requireAdmin(req, res) {
  const user = currentUser(req);
  if (!user || user.role !== "admin") {
    json(res, 401, { error: "需要管理员登录" });
    return null;
  }
  return user;
}

function validateGameInput(body) {
  const title = sanitizeText(body.title, 80);
  const link = sanitizeText(body.link, 400);
  if (!title) throw Object.assign(new Error("请填写游戏名称"), { status: 400 });
  if (!link) throw Object.assign(new Error("请填写游戏链接"), { status: 400 });
  const description = sanitizeText(body.description, 600) || "一款新鲜出炉的网页游戏，点开即玩。";
  const cover = normalizeCover(body.cover);
  const type = body.type === "download" ? "download" : "web";
  const images = Array.isArray(body.images)
    ? normalizeImages(body.images)
    : (typeof body.images === "string" ? normalizeImages(body.images.split(/[,，\n]+/)) : []);
  let tags = [];
  if (typeof body.tags === "string") {
    tags = body.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
  } else if (Array.isArray(body.tags)) {
    tags = body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
  }
  const featured = body.featured === true || body.featured === "true";
  return { title, link, description, cover, tags, featured, type, images };
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (pathname === "/admin" || pathname === "/admin/") rel = "admin.html";
  if (pathname === "/developer" || pathname === "/developer/") rel = "developer.html";
  if (pathname === "/user" || pathname === "/user/") rel = "user.html";
  if (rel.startsWith("user/")) rel = "user.html";
  // 上传的封面存放在 UPLOADS（映射到 `/uploads/...`），其它静态资源在 PUBLIC。
  // 上传路径的磁盘名要去掉 `uploads/` 前缀（否则会拼成 uploads/uploads/xxx）。
  const isUpload = rel.startsWith("uploads/");
  const dirs = isUpload ? [UPLOADS, PUBLIC] : [PUBLIC, UPLOADS];
  let i = 0;
  (function tryNext() {
    if (i >= dirs.length) return handleNotFound(res);
    const base = dirs[i++];
    const relForBase = (base === UPLOADS && isUpload) ? rel.slice("uploads/".length) : rel;
    const safe = path.normalize(path.join(base, relForBase));
    if (!safe.startsWith(base)) return tryNext();
    fs.stat(safe, (err, stats) => {
      if (err || !stats.isFile()) return tryNext();
      const ext = path.extname(safe).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      const lastMod = stats.mtime.toUTCString();
      const ims = req.headers["if-modified-since"];
      const codeCache = ext === ".html" || ext === ".css" || ext === ".js" || ext === ".mjs" || ext === ".json";
      const cache = codeCache ? "no-cache" : "public, max-age=86400";
      // 304 if the client already has an unchanged copy
      if (ims && codeCache && stats.mtime.getTime() <= new Date(ims).getTime()) {
        res.writeHead(304, { "Last-Modified": lastMod, "Cache-Control": cache });
        return res.end();
      }
      res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Last-Modified": lastMod });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(safe).pipe(res);
    });
  })();
}

function handleNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<!doctype html><meta charset=utf-8><title>404</title><body style='background:#0b0b0e;color:#c8f04b;font-family:sans-serif;display:grid;place-items:center;height:100vh'>404 · 页面不存在</body>");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // ---- Health check (for hosting platforms) ----
    if (method === "GET" && pathname === "/api/health") {
      return json(res, 200, { ok: true, name: "jiuri-games", time: Date.now() });
    }

    // ---- Auth ----
    if (method === "POST" && pathname === "/api/register") {
      const body = await parseJson(req);
      const username = sanitizeText(body.username, 40);
      const password = sanitizeText(body.password, 200);
      const email = sanitizeText(body.email, 120);
      if (!username || username.length < 2) return json(res, 400, { error: "用户名至少 2 个字符" });
      if (!password || password.length < 6) return json(res, 400, { error: "密码至少 6 位" });
      if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        return json(res, 409, { error: "该用户名已被注册" });
      }
      if (username.toLowerCase() === "admin") return json(res, 409, { error: "该用户名不可用" });
      const user = createUser({ username, password, email });
      db.users.push(user);
      saveDb();
      const token = signToken({ uid: user.id, role: user.role, exp: Date.now() + SESSION_DAYS * 864e5 });
      res.setHeader("Set-Cookie", cookieFor(token, SESSION_DAYS * 86400));
      return json(res, 201, { user: publicUser(user) });
    }

    if (method === "POST" && pathname === "/api/login") {
      const body = await parseJson(req);
      const username = sanitizeText(body.username, 40);
      const password = sanitizeText(body.password, 200);
      const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user || hashPassword(password, user.salt) !== user.passHash) {
        return json(res, 401, { error: "用户名或密码不正确" });
      }
      const token = signToken({ uid: user.id, role: user.role, exp: Date.now() + SESSION_DAYS * 864e5 });
      res.setHeader("Set-Cookie", cookieFor(token, SESSION_DAYS * 86400));
      return json(res, 200, { user: publicUser(user) });
    }

    if (method === "POST" && pathname === "/api/logout") {
      res.setHeader("Set-Cookie", cookieFor("", 0));
      return json(res, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/me") {
      const user = currentUser(req);
      if (!user) return json(res, 200, { user: null, devApplication: null });
      const app = db.applications.find((a) => a.userId === user.id && a.status === "pending");
      return json(res, 200, {
        user: publicUser(user),
        devApplication: app
          ? { status: "pending" }
          : (user.role === "developer" ? { status: "approved" } : null),
      });
    }

    // ---- Update own profile (avatar / bio) ----
    if (method === "PUT" && pathname === "/api/me/profile") {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: "请先登录" });
      const body = await parseJson(req);
      if (body.avatar !== undefined) {
        const av = normalizeCover(body.avatar);
        if (av) user.avatar = av;
      }
      if (body.bio !== undefined) user.bio = sanitizeText(body.bio, 240);
      saveDb();
      return json(res, 200, { user: publicUser(user) });
    }

    // ---- Public user profile + their games ----
    if (method === "GET" && pathname.startsWith("/api/user/")) {
      const uname = decodeURIComponent(pathname.replace("/api/user/", "").split("/")[0]);
      const user = db.users.find((u) => u.username.toLowerCase() === uname.toLowerCase());
      if (!user) return json(res, 404, { error: "用户不存在" });
      const games = db.games
        .filter((g) => g.ownerId === user.id)
        .sort((a, b) => {
          const ra = a.status === "pending" ? 0 : 1, rb = b.status === "pending" ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return (b.createdAt || 0) - (a.createdAt || 0);
        })
        .map((g) => Object.assign(publicGame(g), { ownerName: user.username, ownerAvatar: user.avatar || "" }));
      const pu = publicUser(user);
      delete pu.email;
      delete pu.id;
      delete pu.liked;
      return json(res, 200, { user: pu, games });
    }

    // ---- Games (public) ----
    if (method === "GET" && pathname === "/api/games") {
      const cur = currentUser(req);
      const likedSet = new Set(Array.isArray(cur && cur.liked) ? cur.liked : []);
      const byUser = new Map(db.users.map((u) => [u.id, u]));
      const rank = (g) => (g.status === "pending" ? 0 : 1);
      const games = [...db.games].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;                          // 待审核优先展示
        if (ra === 0) return (b.createdAt || 0) - (a.createdAt || 0); // 待审核按最新在前
        const la = Number(a.likes) || 0, lb = Number(b.likes) || 0;
        if (la !== lb) return lb - la;                          // 已上架按赞多优先
        if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      return json(res, 200, {
        games: games.map((g) => Object.assign(publicGame(g), {
          liked: likedSet.has(g.id),
          ownerName: g.ownerId ? ((byUser.get(g.ownerId) || {}).username || "") : "",
          ownerAvatar: g.ownerId ? ((byUser.get(g.ownerId) || {}).avatar || "") : "",
        })),
      });
    }

    // ---- Like / unlike a game (requires login) ----
    if (method === "POST" && pathname.startsWith("/api/games/") && pathname.endsWith("/like")) {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: "请先登录后再点赞" });
      const id = decodeURIComponent(pathname.split("/")[3] || "");
      const game = db.games.find((g) => g.id === id);
      if (!game) return json(res, 404, { error: "游戏不存在" });
      if (!Array.isArray(user.liked)) user.liked = [];
      const idx = user.liked.indexOf(id);
      let liked;
      if (idx === -1) {
        user.liked.push(id);
        game.likes = (Number(game.likes) || 0) + 1;
        liked = true;
      } else {
        user.liked.splice(idx, 1);
        game.likes = Math.max(0, (Number(game.likes) || 0) - 1);
        liked = false;
      }
      saveDb();
      return json(res, 200, { ok: true, likes: Number(game.likes) || 0, liked });
    }

    // ---- Developer: apply to become a developer ----
    if (method === "POST" && pathname === "/api/developer/apply") {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: "请先登录" });
      if (user.role === "developer" || user.role === "admin") {
        return json(res, 400, { error: "你已经是开发者或管理员了" });
      }
      if (db.applications.some((a) => a.userId === user.id && a.status === "pending")) {
        return json(res, 409, { error: "申请已提交，等待管理员审核" });
      }
      const body = await parseJson(req);
      const message = sanitizeText(body.message, 300) || "（未填写说明）";
      db.applications.push({
        id: uid(),
        userId: user.id,
        username: user.username,
        email: user.email || "",
        message,
        createdAt: Date.now(),
        status: "pending",
      });
      saveDb();
      return json(res, 201, { ok: true });
    }

    // ---- Developer: my games ----
    if (method === "GET" && pathname === "/api/developer/my") {
      const user = currentUser(req);
      if (!user || (user.role !== "developer" && user.role !== "admin")) {
        return json(res, 403, { error: "需要开发者权限" });
      }
      const games = db.games
        .filter((g) => g.ownerId === user.id)
        .map(publicGame)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return json(res, 200, { games });
    }

    // ---- Developer: create own game (pending review) ----
    if (method === "POST" && pathname === "/api/developer/games") {
      const user = currentUser(req);
      if (!user || user.role !== "developer") return json(res, 403, { error: "需要开发者权限" });
      const body = await parseJson(req);
      const data = validateGameInput(body);
      const now = Date.now();
      const game = { id: uid(), ...data, ownerId: user.id, status: "pending", createdAt: now, updatedAt: now };
      db.games.push(game);
      saveDb();
      return json(res, 201, { game: publicGame(game) });
    }

    // ---- Developer: edit own game ----
    if (method === "PUT" && pathname.startsWith("/api/developer/games/")) {
      const user = currentUser(req);
      if (!user || user.role !== "developer") return json(res, 403, { error: "需要开发者权限" });
      const id = decodeURIComponent(pathname.split("/").pop());
      const idx = db.games.findIndex((g) => g.id === id);
      if (idx === -1) return json(res, 404, { error: "游戏不存在" });
      if (db.games[idx].ownerId !== user.id) return json(res, 403, { error: "只能修改自己发布的游戏" });
      const body = await parseJson(req);
      const data = validateGameInput(body);
      if (db.games[idx].cover && data.cover && db.games[idx].cover !== data.cover) {
        removeUploadedCover(db.games[idx].cover);
      }
      Object.assign(db.games[idx], data, { updatedAt: Date.now(), status: "pending" });
      saveDb();
      return json(res, 200, { game: publicGame(db.games[idx]) });
    }

    // ---- Developer: delete own game ----
    if (method === "DELETE" && pathname.startsWith("/api/developer/games/")) {
      const user = currentUser(req);
      if (!user || user.role !== "developer") return json(res, 403, { error: "需要开发者权限" });
      const id = decodeURIComponent(pathname.split("/").pop());
      const idx = db.games.findIndex((g) => g.id === id);
      if (idx === -1) return json(res, 404, { error: "游戏不存在" });
      if (db.games[idx].ownerId !== user.id) return json(res, 403, { error: "只能删除自己发布的游戏" });
      const [g] = db.games.splice(idx, 1);
      removeUploadedCover(g.cover);
      db.users.forEach((u) => {
        if (Array.isArray(u.liked)) {
          const i = u.liked.indexOf(g.id);
          if (i > -1) u.liked.splice(i, 1);
        }
      });
      saveDb();
      return json(res, 200, { ok: true });
    }

    // ---- Admin ----
    if (method === "GET" && pathname === "/api/admin/session") {
      const user = currentUser(req);
      return json(res, 200, { user: user && user.role === "admin" ? publicUser(user) : null });
    }
    if (pathname.startsWith("/api/admin")) {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      // ---- Developer applications ----
      if (method === "GET" && pathname === "/api/admin/applications") {
        const apps = db.applications
          .filter((a) => a.status === "pending")
          .sort((a, b) => b.createdAt - a.createdAt);
        return json(res, 200, { applications: apps });
      }
      const applyM = pathname.match(/^\/api\/admin\/applications\/([^/]+)\/(approve|reject)$/);
      if (method === "POST" && applyM) {
        const id = decodeURIComponent(applyM[1]);
        const action = applyM[2];
        const app = db.applications.find((a) => a.id === id);
        if (!app) return json(res, 404, { error: "申请不存在" });
        if (action === "approve") {
          const user = db.users.find((u) => u.id === app.userId);
          if (user) user.role = "developer";
          app.status = "approved";
        } else {
          app.status = "rejected";
        }
        saveDb();
        return json(res, 200, { ok: true });
      }

      // ---- Admin: full game list (with owner + review info) ----
      if (method === "GET" && pathname === "/api/admin/games") {
        const byUser = new Map(db.users.map((u) => [u.id, u]));
        const games = db.games
          .map((g) => Object.assign(publicGame(g), {
            ownerName: g.ownerId ? ((byUser.get(g.ownerId) || {}).username || "") : "",
            ownerAvatar: g.ownerId ? ((byUser.get(g.ownerId) || {}).avatar || "") : "",
          }))
          .sort((a, b) => {
            const ra = a.status === "pending" ? 0 : 1, rb = b.status === "pending" ? 0 : 1;
            if (ra !== rb) return ra - rb;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
        return json(res, 200, {
          games,
          pending: db.games.filter((g) => g.status === "pending").length,
        });
      }

      // ---- Admin: approve / reject a submitted game ----
      const gameM = pathname.match(/^\/api\/admin\/games\/([^/]+)\/(approve|reject)$/);
      if (method === "POST" && gameM) {
        const id = decodeURIComponent(gameM[1]);
        const action = gameM[2];
        const idx = db.games.findIndex((g) => g.id === id);
        if (idx === -1) return json(res, 404, { error: "游戏不存在" });
        if (action === "approve") {
          db.games[idx].status = "approved";
          saveDb();
          return json(res, 200, { ok: true, game: publicGame(db.games[idx]) });
        }
        // reject => 直接删除
        const [g] = db.games.splice(idx, 1);
        removeUploadedCover(g.cover);
        db.users.forEach((u) => {
          if (Array.isArray(u.liked)) {
            const i = u.liked.indexOf(g.id);
            if (i > -1) u.liked.splice(i, 1);
          }
        });
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (method === "POST" && pathname === "/api/admin/password") {
        const body = await parseJson(req);
        const oldPassword = sanitizeText(body.oldPassword, 200);
        const newPassword = sanitizeText(body.newPassword, 200);
        if (!oldPassword || hashPassword(oldPassword, admin.salt) !== admin.passHash) {
          return json(res, 400, { error: "当前密码不正确" });
        }
        if (!newPassword || newPassword.length < 8) {
          return json(res, 400, { error: "新密码至少 8 位" });
        }
        const salt = crypto.randomBytes(16).toString("hex");
        admin.salt = salt;
        admin.passHash = hashPassword(newPassword, salt);
        saveDb();
        return json(res, 200, { ok: true });
      }

      if (method === "GET" && pathname === "/api/admin/users") {
        const users = db.users.map(publicUser).sort((a, b) => b.createdAt - a.createdAt);
        return json(res, 200, { users });
      }
      if (method === "PUT" && pathname.startsWith("/api/admin/users/")) {
        const id = decodeURIComponent(pathname.replace("/api/admin/users/", "").split("/")[0]);
        const body = await parseJson(req);
        const role = body.role === "admin" || body.role === "user" ? body.role : null;
        if (!role) return json(res, 400, { error: "无效的角色" });
        const user = db.users.find((u) => u.id === id);
        if (!user) return json(res, 404, { error: "用户不存在" });
        if (user.username === "admin") return json(res, 403, { error: "不能修改主管理员角色" });
        if (role === "admin" && user.role === "admin") return json(res, 200, { user: publicUser(user) });
        if (role === "user" && user.role === "user") return json(res, 200, { user: publicUser(user) });
        // never allow removing the last admin
        if (user.role === "admin" && role === "user" && db.users.filter((u) => u.role === "admin").length <= 1) {
          return json(res, 400, { error: "至少保留一名管理员" });
        }
        user.role = role;
        saveDb();
        return json(res, 200, { user: publicUser(user) });
      }
      if (method === "DELETE" && pathname.startsWith("/api/admin/users/")) {
        const id = decodeURIComponent(pathname.replace("/api/admin/users/", "").split("/")[0]);
        const idx = db.users.findIndex((u) => u.id === id);
        if (idx === -1) return json(res, 404, { error: "用户不存在" });
        if (db.users[idx].username === "admin") return json(res, 403, { error: "不能删除主管理员" });
        if (db.users[idx].role === "admin" && db.users.filter((u) => u.role === "admin").length <= 1) {
          return json(res, 400, { error: "至少保留一名管理员" });
        }
        db.users.splice(idx, 1);
        saveDb();
        return json(res, 200, { ok: true });
      }
      if (method === "POST" && pathname === "/api/admin/games") {
        const body = await parseJson(req);
        const data = validateGameInput(body);
        const now = Date.now();
        const game = { id: uid(), ...data, ownerId: admin.id, status: "approved", createdAt: now, updatedAt: now };
        db.games.push(game);
        saveDb();
        return json(res, 201, { game: publicGame(game) });
      }
      if (method === "PUT" && pathname.startsWith("/api/admin/games/")) {
        const id = decodeURIComponent(pathname.split("/").pop());
        const idx = db.games.findIndex((g) => g.id === id);
        if (idx === -1) return json(res, 404, { error: "游戏不存在" });
        const body = await parseJson(req);
        const data = validateGameInput(body);
        if (db.games[idx].cover && data.cover && db.games[idx].cover !== data.cover) {
          removeUploadedCover(db.games[idx].cover);
        }
        Object.assign(db.games[idx], data, { updatedAt: Date.now() });
        saveDb();
        return json(res, 200, { game: publicGame(db.games[idx]) });
      }
      if (method === "DELETE" && pathname.startsWith("/api/admin/games/")) {
        const id = decodeURIComponent(pathname.split("/").pop());
        const idx = db.games.findIndex((g) => g.id === id);
        if (idx === -1) return json(res, 404, { error: "游戏不存在" });
        const [g] = db.games.splice(idx, 1);
        removeUploadedCover(g.cover);
        db.users.forEach((u) => {
          if (Array.isArray(u.liked)) {
            const i = u.liked.indexOf(g.id);
            if (i > -1) u.liked.splice(i, 1);
          }
        });
        saveDb();
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: "接口不存在" });
    }

    // ---- Static ----
    if (method === "GET" || method === "HEAD") {
      return serveStatic(req, res, pathname);
    }
    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("Server error:", err);
    if (!res.headersSent) json(res, status, { error: err.message || "服务器内部错误" });
  }
});

// ---------------------------------------------------------------------------
// Seed sample games so the site isn't empty on first run
// ---------------------------------------------------------------------------
function seedGames() {
  if (db.games.length > 0) return;
  const now = Date.now();
  const base = "/assets/img/";
  const samples = [
    { title: "像素深渊", link: "#play", description: "一款像素风 Roguelike 地牢冒险，随机生成关卡，尽享未知与惊喜。", cover: base + "p3.jpg", tags: ["Roguelike", "像素", "冒险"], featured: true },
    { title: "光轨竞速", link: "#play", description: "霓虹赛道上的极速对决，漂移与氮气并存，感受速度的极致。", cover: base + "p5.jpg", tags: ["竞速", "霓虹"], featured: true },
    { title: "星海拾荒者", link: "#play", description: "在浩瀚星海中收集残骸与资源，建造属于你的星际方舟。", cover: base + "p2.jpg", tags: ["科幻", "建造"], featured: true },
    { title: "墨色迷局", link: "#play", description: "烧脑的解谜游戏，光线与影子的重构，每一关都是新的世界。", cover: base + "p4.jpg", tags: ["解谜", "烧脑"], featured: false },
    { title: "熔岩冲刺", link: "#play", description: "不断崩塌的熔岩世界里一路向上，是最纯粹的跳跃挑战。", cover: base + "p6.jpg", tags: ["平台跳跃"], featured: false },
    { title: "幻境花园", link: "#play", description: "治愈系花园建造，等待你的是一片安静生长的绿意。", cover: base + "p1.jpg", tags: ["模拟", "治愈"], featured: false },
  ];
  db.games = samples.map((s, i) => ({ id: uid(), ...s, createdAt: now - i * 3600e3, updatedAt: now - i * 3600e3 }));
  saveDb();
}

loadDb();
seedGames();

server.listen(PORT, HOST, () => {
  console.log(`\n  爱冒险玖日 · 游戏网站\n  http://localhost:${PORT}\n  管理面板: http://localhost:${PORT}/admin\n`);
});
