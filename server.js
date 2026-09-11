const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ROOM_TTL_HOURS = Math.max(Number(process.env.ROOM_TTL_HOURS) || 24, 1);
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

function cleanupExpired() {
  const result = db.prepare("DELETE FROM rooms WHERE expires_at IS NOT NULL AND expires_at <= ?").run(new Date().toISOString());
  if (result.changes) console.log(`Auto-expiration: ${result.changes} room(s) supprimée(s).`);
}

// Nettoyage au démarrage puis régulièrement pour garder la base légère.
cleanupExpired();
setInterval(cleanupExpired, 5 * 60 * 1000).unref();

app.get("/api/config", (_req, res) => {
  res.json({
    name: "FF ROOM CITY",
    owner: "KAWAKI227",
    contact: "+22781289418",
    version: "3.2.0",
    pollingMs: 5000,
    roomTtlHours: ROOM_TTL_HOURS
  });
});

app.get("/api/rooms", (req, res) => {
  cleanupExpired();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const rooms = db.prepare(`
    SELECT id, type, reward, phone, squad_id, creator, created_at, match_time, rules, expires_at
    FROM rooms ORDER BY id DESC LIMIT ?
  `).all(limit);
  res.json({ rooms });
});

app.get("/api/rooms/:id", (req, res) => {
  cleanupExpired();
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });
  const room = db.prepare(`
    SELECT id, type, reward, phone, squad_id, creator, created_at, match_time, rules, expires_at
    FROM rooms WHERE id = ?
  `).get(id);
  if (!room) return res.status(404).json({ error: "Room introuvable ou expirée." });
  res.json({ room });
});

app.post("/api/rooms", (req, res) => {
  const type = clean(req.body.type, 20);
  const reward = clean(req.body.reward, 40);
  const phone = clean(req.body.phone, 30);
  const squadId = clean(req.body.squad_id, 40);
  const creator = clean(req.body.creator, 50);
  const matchTime = clean(req.body.match_time, 40);
  const rules = clean(req.body.rules, 500);

  if (!VALID_TYPES.has(type)) return res.status(400).json({ error: "Type de room invalide." });
  if (!VALID_REWARDS.has(reward)) return res.status(400).json({ error: "Récompense invalide." });
  if (!phone || !squadId || !creator) return res.status(400).json({ error: "Tous les champs obligatoires doivent être remplis." });

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ROOM_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const deleteToken = newDeleteToken();
  const deleteTokenHash = hashToken(deleteToken);

  const result = db.prepare(`
    INSERT INTO rooms (type, reward, phone, squad_id, creator, created_at, match_time, rules, expires_at, delete_token_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(type, reward, phone, squadId, creator, createdAt, matchTime || null, rules, expiresAt, deleteTokenHash);

  const room = db.prepare(`
    SELECT id, type, reward, phone, squad_id, creator, created_at, match_time, rules, expires_at
    FROM rooms WHERE id = ?
  `).get(result.lastInsertRowid);

  // Le token brut n'est retourné qu'à la création et n'est jamais exposé par les GET.
  res.status(201).json({ room, delete_token: deleteToken });
});

app.delete("/api/rooms/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });

  const token = clean(req.get("X-Room-Delete-Token") || req.body?.delete_token, 200);
  if (!token) return res.status(401).json({ error: "Autorisation de suppression manquante." });

  const room = db.prepare("SELECT id, delete_token_hash FROM rooms WHERE id = ?").get(id);
  if (!room) return res.status(404).json({ error: "Room introuvable ou expirée." });
  if (!room.delete_token_hash) return res.status(403).json({ error: "Cette ancienne room ne possède pas de clé de suppression." });

  const suppliedHash = hashToken(token);
  const a = Buffer.from(suppliedHash, "hex");
  const b = Buffer.from(room.delete_token_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Clé de suppression incorrecte." });
  }

  db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "3.2.0", database: "sqlite", roomTtlHours: ROOM_TTL_HOURS });
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`FF ROOM CITY V3.2 running on port ${PORT} — TTL ${ROOM_TTL_HOURS}h`));
