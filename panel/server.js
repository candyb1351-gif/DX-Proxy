const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "/data";
const AUTH_FILE = path.join(DATA_DIR, "panel_auth.json");
const STATS_PORT = process.env.STATS_PORT || "9090";
const PANEL_PORT = process.env.PANEL_PORT || 2053;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// session secret persists across restarts so logins survive redeploys
const SECRET_FILE = path.join(DATA_DIR, "panel_secret");
if (!fs.existsSync(SECRET_FILE)) {
  fs.writeFileSync(SECRET_FILE, require("crypto").randomBytes(32).toString("hex"));
}
app.use(session({
  secret: fs.readFileSync(SECRET_FILE, "utf8"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 3600 * 1000 }
}));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Every action the panel takes -- reads and writes alike -- goes through the
// SAME `dx` CLI used at the console (in --json mode for reads), so the panel
// and console can never drift out of sync and the panel never has to parse
// colored/plain-text CLI output.
function runDx(args) {
  return execFileSync("dx", args, { encoding: "utf8" });
}

function runDxJSON(args) {
  return JSON.parse(runDx([...args, "--json"]));
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: "unauthenticated" });
}

// ---------- auth ----------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  let auth;
  try { auth = readJSON(AUTH_FILE); } catch { return res.status(500).json({ error: "auth store missing" }); }
  if (username !== auth.username || !bcrypt.compareSync(password || "", auth.password_hash)) {
    return res.status(401).json({ error: "invalid credentials" });
  }
  req.session.authenticated = true;
  req.session.username = username;
  res.json({ ok: true, mustChangePassword: !!auth.must_change_password });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  if (!(req.session && req.session.authenticated)) {
    return res.json({ authenticated: false });
  }
  let mustChangePassword = false;
  try { mustChangePassword = !!runDxJSON(["auth-status"]).must_change_password; } catch { /* ignore */ }
  res.json({ authenticated: true, mustChangePassword });
});

// ---------- users ----------
app.get("/api/users", requireAuth, (req, res) => {
  try { res.json(runDxJSON(["users"])); } catch { res.json({ users: [] }); }
});

app.post("/api/users", requireAuth, (req, res) => {
  const label = (req.body && req.body.label) || "";
  try {
    const out = runDx(label ? ["add-user", label] : ["add-user"]);
    res.json({ ok: true, out });
  } catch (e) { res.status(400).json({ error: e.stderr ? e.stderr.toString() : e.message }); }
});

app.delete("/api/users/:user", requireAuth, (req, res) => {
  try { runDx(["remove-user", req.params.user]); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/users/:user/enable", requireAuth, (req, res) => {
  try { runDx(["enable-user", req.params.user]); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/users/:user/disable", requireAuth, (req, res) => {
  try { runDx(["disable-user", req.params.user]); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/users/:user/rotate", requireAuth, (req, res) => {
  try { const out = runDx(["rotate-secret", req.params.user]); res.json({ ok: true, out }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- settings ----------
app.get("/api/settings", requireAuth, (req, res) => {
  try { res.json(runDxJSON(["settings"])); } catch { res.json({}); }
});

app.post("/api/settings/proxy", requireAuth, (req, res) => {
  const { host, port } = req.body || {};
  if (!host || !port) return res.status(400).json({ error: "host and port required" });
  try { runDx(["set-proxy", `${host}:${port}`]); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/settings/domain", requireAuth, (req, res) => {
  const { domain } = req.body || {};
  if (!domain) return res.status(400).json({ error: "domain required" });
  try { runDx(["set-domain", domain]); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/settings/password", requireAuth, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  try {
    runDx(["panel-password", username, password]);
    req.session.destroy(() => res.json({ ok: true }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- status / reload ----------
app.get("/api/status", requireAuth, (req, res) => {
  try { res.json(runDxJSON(["status"])); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reload", requireAuth, (req, res) => {
  try { const out = runDx(["restart"]); res.json({ ok: true, out }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- stats (proxied from mtg-multi's internal stats endpoint) ----------
app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const r = await fetch(`http://127.0.0.1:${STATS_PORT}/stats`);
    const data = await r.json();
    res.json(data);
  } catch {
    res.json({ error: "stats endpoint unreachable" });
  }
});

// ---------- links / backup ----------
app.get("/api/links", requireAuth, (req, res) => {
  try {
    const out = runDx(["export"]);
    res.type("text/plain").send(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post("/api/backup", requireAuth, (req, res) => {
  try {
    const out = runDx(["backup"]);
    res.type("text/plain").send(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.listen(PANEL_PORT, () => {
  console.log(`DX-Proxy panel listening on :${PANEL_PORT}`);
});
