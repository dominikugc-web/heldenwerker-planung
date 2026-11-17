import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { GITHUB_ORIGIN, ladeSchluessel, SCHLUESSEL } from "./konfig.mjs";

const TYPEN = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf" };

const routen = [];
// muster wie "/api/projekte/:id"; handler(req, res, params, kontext)
export function route(methode, muster, handler) {
  const teile = muster.split("/");
  routen.push({ methode, teile, handler });
}

function finde(methode, pfad) {
  const ist = pfad.split("/");
  for (const r of routen) {
    if (r.methode !== methode || r.teile.length !== ist.length) continue;
    const params = {};
    if (r.teile.every((t, i) => (t.startsWith(":") ? ((params[t.slice(1)] = decodeURIComponent(ist[i])), true) : t === ist[i]))) return { r, params };
  }
  return null;
}

export function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

export async function leseJson(req, max = 1_000_000) {
  let text = "";
  for await (const c of req) { text += c; if (text.length > max) throw Object.assign(new Error("Anfrage zu groß"), { status: 413 }); }
  try { return text ? JSON.parse(text) : {}; } catch { throw Object.assign(new Error("Ungültiges JSON"), { status: 400 }); }
}

export function person(req, lokal) {
  return req.headers["tailscale-user-login"] || (lokal ? "Lokal" : null);
}

function cors(req, res) {
  if (req.headers.origin !== GITHUB_ORIGIN) return;
  res.setHeader("Access-Control-Allow-Origin", GITHUB_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function statisch(webDir, pfad, res) {
  let rel;
  try { rel = decodeURIComponent(pfad); } catch { rel = "/"; }
  const datei = path.resolve(webDir, "." + (rel.endsWith("/") ? rel + "index.html" : rel));
  if (!datei.startsWith(path.resolve(webDir) + path.sep) || !fs.existsSync(datei) || !fs.statSync(datei).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Nicht gefunden");
  }
  res.writeHead(200, { "Content-Type": TYPEN[path.extname(datei)] || "application/octet-stream" });
  fs.createReadStream(datei).pipe(res);
}

route("GET", "/api/gesund", (req, res, p, k) => json(res, 200, {
  ok: true,
  hero: !!ladeSchluessel(...SCHLUESSEL.hero, k.homeDir),
  claude: !!ladeSchluessel(...SCHLUESSEL.claude, k.homeDir),
}));

export function starteServer({ port = 8790, host = "127.0.0.1", webDir, datenDir, homeDir = os.homedir(), lokal = false }) {
  const kontext = { webDir, datenDir, homeDir, lokal };
  const server = http.createServer(async (req, res) => {
    const pfad = new URL(req.url, "http://x").pathname;
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (!pfad.startsWith("/api/")) return statisch(webDir, pfad, res);
    const wer = person(req, lokal);
    if (!wer) return json(res, 401, { fehler: "Nur über Tailscale erreichbar" });
    const treffer = finde(req.method, pfad);
    if (!treffer) return json(res, 404, { fehler: "Unbekannte Adresse" });
    try {
      await treffer.r.handler(req, res, treffer.params, { ...kontext, person: wer, query: new URL(req.url, "http://x").searchParams });
    } catch (e) {
      if (!res.headersSent) json(res, e.status || 500, { fehler: e.status ? e.message : "Interner Fehler" });
      else res.end();
      if (!e.status) console.error(e);
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const s = await starteServer({
    port: Number(process.env.PLANUNG_PORT || 8790),
    webDir: path.join(wurzel, "web"),
    datenDir: process.env.PLANUNG_DATEN || path.join(wurzel, "daten"),
    lokal: process.env.PLANUNG_LOKAL === "1",
  });
  console.log("Planung läuft auf http://127.0.0.1:" + s.address().port);
}
