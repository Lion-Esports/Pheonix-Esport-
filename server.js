const express = require("express");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("pheonix.db");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.warn("WARNING: ADMIN_PASSWORD is not set. Set it in your Render environment variables before production.");
}

// Database
db.exec(`
CREATE TABLE IF NOT EXISTS tournaments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  mode TEXT NOT NULL,
  prize TEXT NOT NULL,
  entry INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UPCOMING'
);

CREATE TABLE IF NOT EXISTS registrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team TEXT NOT NULL,
  captain TEXT NOT NULL,
  phone TEXT NOT NULL,
  game TEXT NOT NULL,
  tournament_id INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team TEXT NOT NULL,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0
);
`);

if (db.prepare("SELECT COUNT(*) c FROM tournaments").get().c === 0) {
  const ins = db.prepare(
    "INSERT INTO tournaments(name,game,mode,prize,entry,status) VALUES(?,?,?,?,?,?)"
  );
  [
    ["Phoenix Clash #01", "Free Fire", "Squad", "₹10,000", 50, "LIVE"],
    ["Warzone India Cup", "BGMI", "Squad", "₹25,000", 100, "UPCOMING"],
    ["Pheonix Valorant Open", "Valorant", "5v5", "₹50,000", 250, "UPCOMING"]
  ].forEach(x => ins.run(...x));
}

if (db.prepare("SELECT COUNT(*) c FROM leaderboard").get().c === 0) {
  const ins = db.prepare(
    "INSERT INTO leaderboard(team,matches,wins,points) VALUES(?,?,?,?)"
  );
  [
    ["Pheonix X", 18, 11, 1840],
    ["Velocity", 18, 10, 1765],
    ["Titans", 17, 9, 1650],
    ["Nova Esports", 16, 8, 1510]
  ].forEach(x => ins.run(...x));
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Public APIs ----------

app.get("/api/tournaments", (req, res) => {
  res.json(db.prepare("SELECT * FROM tournaments ORDER BY id DESC").all());
});

app.post("/api/register", (req, res) => {
  const { team, captain, phone, game, tournament_id, payment_method } = req.body;

  if (
    !team || !captain || !/^\d{10}$/.test(String(phone)) ||
    !game || !tournament_id || !payment_method
  ) {
    return res.status(400).json({ error: "Invalid registration details" });
  }

  const tournament = db
    .prepare("SELECT id FROM tournaments WHERE id = ?")
    .get(Number(tournament_id));

  if (!tournament) {
    return res.status(400).json({ error: "Tournament not found" });
  }

  const info = db.prepare(`
    INSERT INTO registrations
    (team,captain,phone,game,tournament_id,payment_method,created_at)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    String(team).trim(),
    String(captain).trim(),
    String(phone),
    String(game),
    Number(tournament_id),
    String(payment_method),
    new Date().toISOString()
  );

  res.json({ ok: true, id: info.lastInsertRowid, payment_status: "pending" });
});

app.get("/api/leaderboard", (req, res) => {
  const rows = db.prepare(`
    SELECT id, team, matches, wins, points
    FROM leaderboard
    ORDER BY points DESC, wins DESC, team ASC
  `).all();

  res.json(rows.map((x, i) => ({ ...x, rank: i + 1 })));
});

// ---------- Admin authentication ----------

// Short-lived in-memory sessions. Restarting the server logs everyone out.
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000;

// Basic login rate limit: 10 attempts per IP per 15 minutes.
const loginAttempts = new Map();
const RATE_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT = 10;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";").map(x => x.trim());
  const item = cookies.find(x => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function requireAdmin(req, res, next) {
  const token = getCookie(req, "admin_session");
  const session = token && sessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "Admin authentication required" });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recent = attempts.filter(t => now - t < RATE_WINDOW);

  if (recent.length >= RATE_LIMIT) {
    return res.status(429).json({ error: "Too many login attempts. Try again later." });
  }

  recent.push(now);
  loginAttempts.set(ip, recent);

  const { username, password } = req.body || {};

  if (!ADMIN_PASSWORD || !safeEqual(username, ADMIN_USERNAME) || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Invalid admin username or password" });
  }

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt: now + SESSION_TTL });

  res.setHeader(
    "Set-Cookie",
    `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`
  );

  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = getCookie(req, "admin_session");
  if (token) sessions.delete(token);

  res.setHeader(
    "Set-Cookie",
    "admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
  );
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ ok: true, username: ADMIN_USERNAME });
});

// ---------- Admin tournament management ----------

function validateTournament(body) {
  const { name, game, mode, prize, entry, status } = body || {};
  const allowedStatuses = new Set(["LIVE", "UPCOMING", "COMPLETED"]);

  if (
    !String(name || "").trim() ||
    !String(game || "").trim() ||
    !String(mode || "").trim() ||
    !String(prize || "").trim() ||
    !Number.isFinite(Number(entry)) ||
    Number(entry) < 0 ||
    !allowedStatuses.has(String(status))
  ) {
    return false;
  }

  return true;
}

app.post("/api/admin/tournaments", requireAdmin, (req, res) => {
  if (!validateTournament(req.body)) {
    return res.status(400).json({ error: "Invalid tournament details" });
  }

  const { name, game, mode, prize, entry, status } = req.body;
  const info = db.prepare(`
    INSERT INTO tournaments(name,game,mode,prize,entry,status)
    VALUES(?,?,?,?,?,?)
  `).run(
    String(name).trim(),
    String(game).trim(),
    String(mode).trim(),
    String(prize).trim(),
    Number(entry),
    String(status)
  );

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
  if (!validateTournament(req.body)) {
    return res.status(400).json({ error: "Invalid tournament details" });
  }

  const { name, game, mode, prize, entry, status } = req.body;
  const result = db.prepare(`
    UPDATE tournaments
    SET name=?, game=?, mode=?, prize=?, entry=?, status=?
    WHERE id=?
  `).run(
    String(name).trim(),
    String(game).trim(),
    String(mode).trim(),
    String(prize).trim(),
    Number(entry),
    String(status),
    Number(req.params.id)
  );

  if (!result.changes) return res.status(404).json({ error: "Tournament not found" });
  res.json({ ok: true });
});

app.delete("/api/admin/tournaments/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM tournaments WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Tournament not found" });
  res.json({ ok: true });
});

// ---------- Admin registrations / payments ----------

app.get("/api/admin/registrations", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, t.name AS tournament_name
    FROM registrations r
    LEFT JOIN tournaments t ON t.id = r.tournament_id
    ORDER BY r.id DESC
  `).all();

  res.json(rows);
});

app.patch("/api/admin/registrations/:id/payment", requireAdmin, (req, res) => {
  const status = String(req.body?.payment_status || "").toLowerCase();
  const allowed = new Set(["pending", "verified", "rejected"]);

  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid payment status" });
  }

  const result = db.prepare(`
    UPDATE registrations SET payment_status=? WHERE id=?
  `).run(status, Number(req.params.id));

  if (!result.changes) return res.status(404).json({ error: "Registration not found" });
  res.json({ ok: true });
});

// ---------- Admin leaderboard ----------

app.get("/api/admin/leaderboard", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM leaderboard ORDER BY points DESC, wins DESC").all());
});

app.post("/api/admin/leaderboard", requireAdmin, (req, res) => {
  const { team, matches, wins, points } = req.body || {};

  if (
    !String(team || "").trim() ||
    !Number.isInteger(Number(matches)) || Number(matches) < 0 ||
    !Number.isInteger(Number(wins)) || Number(wins) < 0 ||
    !Number.isInteger(Number(points)) || Number(points) < 0
  ) {
    return res.status(400).json({ error: "Invalid leaderboard details" });
  }

  const info = db.prepare(`
    INSERT INTO leaderboard(team,matches,wins,points)
    VALUES(?,?,?,?)
  `).run(
    String(team).trim(),
    Number(matches),
    Number(wins),
    Number(points)
  );

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/leaderboard/:id", requireAdmin, (req, res) => {
  const { team, matches, wins, points } = req.body || {};

  if (
    !String(team || "").trim() ||
    !Number.isInteger(Number(matches)) || Number(matches) < 0 ||
    !Number.isInteger(Number(wins)) || Number(wins) < 0 ||
    !Number.isInteger(Number(points)) || Number(points) < 0
  ) {
    return res.status(400).json({ error: "Invalid leaderboard details" });
  }

  const result = db.prepare(`
    UPDATE leaderboard SET team=?, matches=?, wins=?, points=? WHERE id=?
  `).run(
    String(team).trim(),
    Number(matches),
    Number(wins),
    Number(points),
    Number(req.params.id)
  );

  if (!result.changes) return res.status(404).json({ error: "Leaderboard entry not found" });
  res.json({ ok: true });
});

app.delete("/api/admin/leaderboard/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM leaderboard WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Leaderboard entry not found" });
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Pheonix Esport" });
});

app.listen(PORT, () => {
  console.log(`Pheonix Esport running on port ${PORT}`);
});
