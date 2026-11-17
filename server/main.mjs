import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { GITHUB_ORIGIN, ladeSchluessel, heroSchluessel, SCHLUESSEL } from "./konfig.mjs";
import { erstelleHero } from "./hero.mjs";
import { erstelleSchreiber } from "./hero-schreiben.mjs";
import { route, finde, json } from "./router.mjs";
import { erstellePlanungen } from "./planungen.mjs";
import { erstelleClaude } from "./claude.mjs";
import { erstelleDateien } from "./hero-dateien.mjs";
import { erstelleAbschluss } from "./abschluss.mjs";
import { ladeDrive } from "./drive.mjs";
import { erstelleTranskription } from "./transkribieren.mjs";
import Anthropic from "@anthropic-ai/sdk";
import "./routen-hero.mjs";
import "./routen-planungen.mjs";
import "./routen-ablauf.mjs";
import "./feedback.mjs";
import { erstelleProfile } from "./profile.mjs";

const TYPEN = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf" };

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
  // no-cache: nach einem Update holt jedes Handy sofort die neue Oberfläche.
  res.writeHead(200, { "Content-Type": TYPEN[path.extname(datei)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(datei).pipe(res);
}

route("GET", "/api/gesund", (req, res, p, k) => json(res, 200, {
  ok: true,
  hero: !!heroSchluessel(k.homeDir),
  claude: !!ladeSchluessel(...SCHLUESSEL.claude, k.homeDir),
}));

export function starteServer({ port = 8790, host = "127.0.0.1", webDir, datenDir, homeDir = os.homedir(), lokal = false, heroFetch, heroKey, claudeClient, inhaber = null, transkribieren = erstelleTranskription() }) {
  // Schlüssel bei jedem Aufruf frisch lesen: Dominik kann ihn nachtragen, ohne neu zu starten.
  const hero = () => erstelleHero({ key: heroKey ?? heroSchluessel(homeDir), fetch: heroFetch });
  const schreiber = () => erstelleSchreiber({ hero: hero(), datenDir });
  const claude = () => {
    const key = !claudeClient && ladeSchluessel(...SCHLUESSEL.claude, homeDir);
    if (!claudeClient && !key) return null;
    return erstelleClaude({ client: claudeClient ?? new Anthropic({ apiKey: key }) });
  };
  const planungen = erstellePlanungen({ datenDir });
  // Einmal pro Server, damit der Schutz gegen doppeltes Absenden greift; HERO wird je Aufruf frisch gebaut.
  // Ablage = Drive, sobald ~/.google/planung-drive.env existiert; sonst gehen nur Logbuch-Einträge raus.
  const profile = erstelleProfile({ datenDir, inhaber });
  const abschluss = erstelleAbschluss({
    nameVon: (login) => profile.nameVon(login),
    planungen,
    schreiber: { zielProjekt: (id) => schreiber().zielProjekt(id) },
    dateien: { logbuchEintrag: (id, text) => erstelleDateien({ schreiber: schreiber() }).logbuchEintrag(id, text) },
    ablage: () => ladeDrive(homeDir),
  });
  const kontext = { webDir, datenDir, homeDir, lokal, hero, schreiber, claude, planungen, abschluss, inhaber, profile, transkribieren };
  const server = http.createServer(async (req, res) => {
    const pfad = new URL(req.url, "http://x").pathname;
    cors(req, res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (!pfad.startsWith("/api/")) return statisch(webDir, pfad, res);
    const wer = person(req, lokal);
    if (!wer) return json(res, 401, { fehler: "Nur über Tailscale erreichbar" });
    // POST nur mit JSON-Kennung: Browser schicken dann erst eine CORS-Vorabfrage, fremde Seiten scheitern daran.
    if (req.method === "POST" && !String(req.headers["content-type"] || "").startsWith("application/json")) return json(res, 415, { fehler: "Bitte als JSON senden" });
    const treffer = finde(req.method, pfad);
    if (!treffer) return json(res, 404, { fehler: "Unbekannte Adresse" });
    try {
      await treffer.r.handler(req, res, treffer.params, { ...kontext, person: wer, profil: profile.fuer(wer, req.headers["tailscale-user-name"]), query: new URL(req.url, "http://x").searchParams });
    } catch (e) {
      if (!res.headersSent) json(res, e.eigen ? e.status : 500, { fehler: e.eigen ? e.message : "Interner Fehler" });
      else res.end();
      if (!e.eigen) console.error(e);
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
    inhaber: process.env.PLANUNG_INHABER || ladeSchluessel(".hero/planung.env", "PLANUNG_INHABER") || (process.env.PLANUNG_LOKAL === "1" ? "Lokal" : null),
  });
  console.log("Planung läuft auf http://127.0.0.1:" + s.address().port);
}

