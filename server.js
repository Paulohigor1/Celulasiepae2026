import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import sqlite3 from "sqlite3";

const app = express();
const PORT = process.env.PORT || 3000;

// ====== ADMIN LOGIN (defina no deploy) ======
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-secret-change-me";
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "cells.db");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "250kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ====== SQLite helpers ======
function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDir(DB_PATH);
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ====== DB init + seed ======
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS cells (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    )
  `);

  const row = await get(`SELECT COUNT(*) as cnt FROM cells`);
  if (row?.cnt === 0) {
    const seed = [
      { name:"ISAS SHARAT", address:"Avenida Doce Angra, 368 - Village, Angra dos Reis - RJ", lat:-22.99369, lng:-44.2405 },
      { name:"YAHWEH SHAMMAH", address:"Rua Geovane, 45 - Morro do Moreno, Angra dos Reis - RJ", lat:-22.98509, lng:-44.23265 },
      { name:"JEOVÁ RAFAH", address:"Rua Araxá, 179 - Village, Angra dos Reis - RJ", lat:-22.9908, lng:-44.23538 },
      { name:"ELOHIM", address:"Rua Muriaé, 247 - Village, Angra dos Reis - RJ", lat:-22.9918498, lng:-44.2340687 },
      { name:"EMANUEL", address:"Rua José Nicásio, 2 - Morro do Moreno, Angra dos Reis - RJ", lat:-23.0057347, lng:-44.3157591 },
      { name:"EFATÁ", address:"Rua Pedro Teixeira, 94 - Village, Angra dos Reis - RJ", lat:-22.9884737, lng:-44.2347172 }
    ];
    const now = new Date().toISOString();
    for (const c of seed) {
      await run(
        `INSERT INTO cells (id, name, address, lat, lng, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), c.name, c.address, c.lat, c.lng, now]
      );
    }
    console.log("SQLite: seed inicial inserido.");
  }
}
await initDb();

// ====== Utils ======
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function geocodeQuery(q) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "celulas-angra/3.0 (contato: voce@exemplo.com)" }
  });

  if (!res.ok) throw new Error(`Falha na geocodificação: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  return { lat: Number(data[0].lat), lng: Number(data[0].lon), displayName: data[0].display_name };
}

function b64urlEncode(s) {
  return Buffer.from(s).toString("base64").replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}
function b64urlDecode(str) {
  str = str.replaceAll("-", "+").replaceAll("_", "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString("utf-8");
}

function signToken(payloadObj) {
  const payload = b64urlEncode(JSON.stringify(payloadObj));
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("base64")
    .replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const expected = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("base64")
    .replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  const obj = JSON.parse(b64urlDecode(payload));
  if (typeof obj?.exp !== "number") return null;
  if (Date.now() > obj.exp) return null;
  return obj;
}

function requireAdmin(req, res, next) {
  const auth = req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Não autorizado." });
  return next();
}

// ====== PUBLIC API ======
app.get("/api/nearest", async (req, res) => {
  try {
    const street = String(req.query.street || "").trim();
    const number = String(req.query.number || "").trim();
    const neighborhood = String(req.query.neighborhood || "").trim();

    if (!street || !number) return res.status(400).json({ error: "Informe Rua e Número." });

    const q = [
      `${street}, ${number}`,
      neighborhood ? neighborhood : null,
      "Angra dos Reis",
      "RJ",
      "Brasil"
    ].filter(Boolean).join(", ");

    const geo = await geocodeQuery(q);
    if (!geo) {
      return res.status(404).json({
        error: "Não foi possível localizar este endereço. Tente adicionar o bairro ou revisar rua/número."
      });
    }

    const cells = await all(`SELECT id, name, address, lat, lng FROM cells`);
    if (!cells.length) return res.status(500).json({ error: "Nenhuma célula cadastrada." });

    let best = null;
    for (const cell of cells) {
      const d = haversineKm(geo.lat, geo.lng, cell.lat, cell.lng);
      if (!best || d < best.distanceKm) best = { cell, distanceKm: d };
    }

    const mapsUrl = new URL("https://www.google.com/maps/search/?api=1");
    mapsUrl.searchParams.set("query", best.cell.address);

    return res.json({
      geocoded: geo,
      nearest: {
        id: best.cell.id,
        name: best.cell.name,
        address: best.cell.address,
        lat: best.cell.lat,
        lng: best.cell.lng,
        distanceKm: Number(best.distanceKm.toFixed(2)),
        mapsUrl: mapsUrl.toString()
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno ao processar a busca." });
  }
});

// ====== ADMIN API ======
app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "").trim();

    if (username !== ADMIN_USER || password !== ADMIN_PASS) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    const payload = { u: username, exp: Date.now() + 1000 * 60 * 60 * 12 }; // 12h
    const token = signToken(payload);
    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno no login." });
  }
});

app.get("/api/admin/cells", requireAdmin, async (req, res) => {
  try {
    const cells = await all(`SELECT id, name, address, lat, lng, createdAt, updatedAt FROM cells ORDER BY createdAt DESC`);
    res.json({ cells });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao listar células." });
  }
});

app.post("/api/admin/cells", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const address = String(req.body?.address || "").trim();

    let lat = req.body?.lat;
    let lng = req.body?.lng;

    if (!name || !address) return res.status(400).json({ error: "Informe nome e endereço." });

    if (typeof lat !== "number" || typeof lng !== "number") {
      const geo = await geocodeQuery(`${address}, Angra dos Reis, RJ, Brasil`);
      if (!geo) return res.status(400).json({ error: "Endereço não encontrado para geocodificação." });
      lat = geo.lat;
      lng = geo.lng;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run(`INSERT INTO cells (id, name, address, lat, lng, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, address, lat, lng, now]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao adicionar célula." });
  }
});

app.put("/api/admin/cells/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const name = String(req.body?.name || "").trim();
    const address = String(req.body?.address || "").trim();
    let lat = req.body?.lat;
    let lng = req.body?.lng;

    if (!id) return res.status(400).json({ error: "ID inválido." });
    if (!name || !address) return res.status(400).json({ error: "Informe nome e endereço." });

    if (typeof lat !== "number" || typeof lng !== "number") {
      const geo = await geocodeQuery(`${address}, Angra dos Reis, RJ, Brasil`);
      if (!geo) return res.status(400).json({ error: "Endereço não encontrado para geocodificação." });
      lat = geo.lat;
      lng = geo.lng;
    }

    const now = new Date().toISOString();
    const result = await run(
      `UPDATE cells SET name=?, address=?, lat=?, lng=?, updatedAt=? WHERE id=?`,
      [name, address, lat, lng, now, id]
    );
    if (result.changes === 0) return res.status(404).json({ error: "Célula não encontrada." });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao atualizar célula." });
  }
});

app.delete("/api/admin/cells/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const result = await run(`DELETE FROM cells WHERE id=?`, [id]);
    if (result.changes === 0) return res.status(404).json({ error: "Célula não encontrada." });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao remover célula." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`DB_PATH: ${DB_PATH}`);
});
