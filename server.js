const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ROOM_TTL_HOURS = Math.max(Number(process.env.ROOM_TTL_HOURS) || 24, 1);
// OWNER CODE — dépôt privé uniquement. Ne pas publier ce fichier.
const ADMIN_CODE = "97010907";
const ADMIN_SESSION_HOURS = 12;
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "rooms.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  reward TEXT NOT NULL,
  phone TEXT NOT NULL,
  squad_id TEXT NOT NULL,
  creator TEXT NOT NULL,
  created_at TEXT NOT NULL,
  match_time TEXT,
  rules TEXT DEFAULT '',
  expires_at TEXT,
  delete_token_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms(expires_at);
`);

function addColumn(sql) { try { db.exec(sql); } catch (_) {} }
addColumn("ALTER TABLE rooms ADD COLUMN rules TEXT DEFAULT ''");
addColumn("ALTER TABLE rooms ADD COLUMN expires_at TEXT");
addColumn("ALTER TABLE rooms ADD COLUMN delete_token_hash TEXT");

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const VALID_TYPES = new Set(["1v1","1v2","2v2","2v3","2v4","3v3","3v4","3v5","3v6","1v6","2v6"]);
const VALID_REWARDS = new Set(["Booyah Pass","Diamants","Autre","Rien"]);
function clean(v, max = 160) { return String(v ?? "").trim().slice(0, max); }
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function newDeleteToken() { return crypto.randomBytes(32).toString("hex"); }
function safeEqual(a, b) { try { const x=Buffer.from(a,"hex"), y=Buffer.from(b,"hex"); return x.length===y.length && crypto.timingSafeEqual(x,y); } catch (_) { return false; } }

function cleanupExpired() {
  const result = db.prepare("DELETE FROM rooms WHERE expires_at IS NOT NULL AND expires_at <= ?").run(new Date().toISOString());
  if (result.changes) console.log(`Auto-expiration: ${result.changes} room(s) supprimée(s).`);
}
cleanupExpired();
setInterval(cleanupExpired, 5 * 60 * 1000).unref();

// --- Admin security: code is kept only in Render Environment Variables ---
const loginAttempts = new Map();
function adminRateLimit(req, res, next) {
  const key = String(req.ip || "unknown");
  const now = Date.now();
  const item = loginAttempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > item.reset) { item.count = 0; item.reset = now + 15 * 60 * 1000; }
  if (item.count >= 8) return res.status(429).json({ error: "Trop de tentatives. Réessaie dans quelques minutes." });
  req._adminRate = { key, item };
  next();
}
function signAdminSession(ts) {
  return crypto.createHmac("sha256", ADMIN_CODE).update(`admin:${ts}`).digest("hex");
}
function makeAdminSession() {
  const ts = Date.now();
  return Buffer.from(`${ts}.${signAdminSession(ts)}`).toString("base64url");
}
function verifyAdmin(req) {
  if (!ADMIN_CODE) return false;
  const header = String(req.get("Authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [rawTs, sig] = decoded.split(".");
    const ts = Number(rawTs);
    if (!Number.isFinite(ts) || Date.now() - ts > ADMIN_SESSION_HOURS * 60 * 60 * 1000 || ts > Date.now() + 60 * 1000) return false;
    return safeEqual(signAdminSession(ts), sig);
  } catch (_) { return false; }
}
function requireAdmin(req, res, next) {
  if (!verifyAdmin(req)) return res.status(401).json({ error: "Accès propriétaire requis." });
  next();
}

app.post("/api/admin/login", adminRateLimit, (req, res) => {
  if (!ADMIN_CODE) return res.status(503).json({ error: "ADMIN_CODE n'est pas configuré sur le serveur." });
  const supplied = clean(req.body?.code, 100);
  const item = req._adminRate.item;
  if (!safeEqual(hashToken(supplied), hashToken(ADMIN_CODE))) {
    item.count += 1;
    loginAttempts.set(req._adminRate.key, item);
    return res.status(401).json({ error: "Code d'accès incorrect." });
  }
  item.count = 0;
  loginAttempts.set(req._adminRate.key, item);
  res.json({ ok: true, token: makeAdminSession(), expiresInHours: ADMIN_SESSION_HOURS });
});

app.get("/api/admin/rooms", requireAdmin, (req, res) => {
  cleanupExpired();
  const rooms = db.prepare(`SELECT id,type,reward,phone,squad_id,creator,created_at,match_time,rules,expires_at FROM rooms ORDER BY id DESC LIMIT 500`).all();
  res.json({ rooms });
});

app.delete("/api/admin/rooms/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });
  const result = db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Room introuvable." });
  res.json({ ok: true });
});

app.post("/api/admin/rooms/delete-many", requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
  if (!ids.length) return res.status(400).json({ error: "Aucune room sélectionnée." });
  const stmt = db.prepare("DELETE FROM rooms WHERE id = ?");
  const tx = db.transaction(list => { let n=0; for (const id of list) n += stmt.run(id).changes; return n; });
  res.json({ ok: true, deleted: tx(ids) });
});

app.get("/api/config", (_req, res) => {
  res.json({ name:"FF ROOM CITY", owner:"KAWAKI227", contact:"+22781289418", version:"3.3.0", pollingMs:5000, roomTtlHours:ROOM_TTL_HOURS, adminEnabled:Boolean(ADMIN_CODE) });
});

app.get("/api/rooms", (req, res) => {
  cleanupExpired();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const rooms = db.prepare(`SELECT id,type,reward,phone,squad_id,creator,created_at,match_time,rules,expires_at FROM rooms ORDER BY id DESC LIMIT ?`).all(limit);
  res.json({ rooms });
});

app.get("/api/rooms/:id", (req, res) => {
  cleanupExpired();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });
  const room = db.prepare(`SELECT id,type,reward,phone,squad_id,creator,created_at,match_time,rules,expires_at FROM rooms WHERE id = ?`).get(id);
  if (!room) return res.status(404).json({ error: "Room introuvable ou expirée." });
  res.json({ room });
});

app.post("/api/rooms", (req, res) => {
  const type=clean(req.body.type,20), reward=clean(req.body.reward,40), phone=clean(req.body.phone,30), squadId=clean(req.body.squad_id,40), creator=clean(req.body.creator,50), matchTime=clean(req.body.match_time,40), rules=clean(req.body.rules,500);
  if (!VALID_TYPES.has(type)) return res.status(400).json({ error:"Type de room invalide." });
  if (!VALID_REWARDS.has(reward)) return res.status(400).json({ error:"Récompense invalide." });
  if (!phone || !squadId || !creator) return res.status(400).json({ error:"Tous les champs obligatoires doivent être remplis." });
  const now=new Date(), createdAt=now.toISOString(), expiresAt=new Date(now.getTime()+ROOM_TTL_HOURS*3600000).toISOString();
  const deleteToken=newDeleteToken(), deleteTokenHash=hashToken(deleteToken);
  const result=db.prepare(`INSERT INTO rooms (type,reward,phone,squad_id,creator,created_at,match_time,rules,expires_at,delete_token_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(type,reward,phone,squadId,creator,createdAt,matchTime||null,rules,expiresAt,deleteTokenHash);
  const room=db.prepare(`SELECT id,type,reward,phone,squad_id,creator,created_at,match_time,rules,expires_at FROM rooms WHERE id=?`).get(result.lastInsertRowid);
  res.status(201).json({ room, delete_token:deleteToken });
});

app.delete("/api/rooms/:id", (req, res) => {
  const id=Number(req.params.id); if(!Number.isInteger(id))return res.status(400).json({error:"ID invalide."});
  const token=clean(req.get("X-Room-Delete-Token")||req.body?.delete_token,200); if(!token)return res.status(401).json({error:"Autorisation de suppression manquante."});
  const room=db.prepare("SELECT id,delete_token_hash FROM rooms WHERE id=?").get(id); if(!room)return res.status(404).json({error:"Room introuvable ou expirée."});
  if(!room.delete_token_hash)return res.status(403).json({error:"Cette ancienne room ne possède pas de clé de suppression."});
  if(!safeEqual(hashToken(token),room.delete_token_hash))return res.status(403).json({error:"Clé de suppression incorrecte."});
  db.prepare("DELETE FROM rooms WHERE id=?").run(id); res.json({ok:true});
});

app.get("/api/health", (_req,res)=>res.json({ok:true,version:"3.3.0",database:"sqlite",roomTtlHours:ROOM_TTL_HOURS,adminEnabled:Boolean(ADMIN_CODE)}));
app.use((_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`FF ROOM CITY V3.3 running on port ${PORT} — TTL ${ROOM_TTL_HOURS}h — admin ${ADMIN_CODE?"enabled":"NOT CONFIGURED"}`));
