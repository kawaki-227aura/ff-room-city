const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
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
  rules TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);
`);

try { db.exec("ALTER TABLE rooms ADD COLUMN rules TEXT DEFAULT ''"); } catch (_) {}

app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const VALID_TYPES = new Set(["1v1","1v2","2v2","2v3","2v4","3v3","3v4","3v5","3v6","1v6","2v6"]);
const VALID_REWARDS = new Set(["Booyah Pass","Diamants","Autre","Rien"]);

function clean(v, max = 160) {
  return String(v ?? "").trim().slice(0, max);
}

app.get("/api/config", (_req, res) => {
  res.json({
    name: "FF ROOM CITY",
    owner: "KAWAKI227",
    contact: "+22781289418",
    version: "3.1.0",
    pollingMs: 5000
  });
});

app.get("/api/rooms", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
  const rooms = db.prepare(`
    SELECT id, type, reward, phone, squad_id, creator, created_at, match_time, rules
    FROM rooms ORDER BY id DESC LIMIT ?
  `).all(limit);
  res.json({ rooms });
});

app.get("/api/rooms/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });
  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(id);
  if (!room) return res.status(404).json({ error: "Room introuvable." });
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

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO rooms (type, reward, phone, squad_id, creator, created_at, match_time, rules)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(type, reward, phone, squadId, creator, now, matchTime || null, rules);

  const room = db.prepare("SELECT * FROM rooms WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ room });
});

app.delete("/api/rooms/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID invalide." });
  const result = db.prepare("DELETE FROM rooms WHERE id = ?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Room introuvable." });
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "3.1.0", database: "sqlite" });
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`FF ROOM CITY V3.1 running on port ${PORT}`));
