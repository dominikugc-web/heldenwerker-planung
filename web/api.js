// Verbindung zum Server auf dem PC (über Tailscale). Ohne Server: Demo mit erfundenen Daten.
// Ohne Netz (Gerät war schon verbunden): offline, gelesen wird aus der Ablage auf dem Gerät.
import { ablage, zeitSignal } from "./lokal.js";
const LESEN_MS = 12_000; // danach aus der Ablage auf dem Gerät lesen
const speicher = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* privates Fenster */ } },
};
export { speicher };

// Kommt die Seite vom eigenen Server, ist die Adresse leer (gleiche Herkunft). Auf GitHub Pages trägt man sie in den Einstellungen ein.
const vonGithub = location.hostname.endsWith("github.io");
export const zustand = { server: vonGithub ? (speicher.get("planung-server") || "") : "", verbunden: false, demo: false, offline: false, gesund: null, ich: null };

export class VerbindungsFehler extends Error {}
export class ServerFehler extends Error { constructor(m, status) { super(m); this.status = status; } }

let demoDaten = null;
async function demo(pfad) {
  demoDaten ??= await (await fetch("demo-daten.json")).json();
  const ohneQuery = pfad.split("?")[0];
  if (ohneQuery in demoDaten) return structuredClone(demoDaten[ohneQuery]);
  throw new ServerFehler("In der Demo nicht vorhanden", 404);
}

export function serverSetzen(adresse) {
  zustand.server = adresse.trim().replace(/\/+$/, "");
  speicher.set("planung-server", zustand.server);
}

// Chrome fragt beim ersten Zugriff einer öffentlichen Seite auf das lokale Netz nach Erlaubnis.
// Steht sie auf "prompt", wird erst nach einem Klick verbunden (siehe Einstellungen / Banner).
export async function brauchtKlick() {
  if (!vonGithub) return false;
  try { return (await navigator.permissions.query({ name: "local-network" })).state === "prompt"; } catch { return false; }
}

export async function verbinden() {
  if (vonGithub && !zustand.server) { zustand.demo = true; return false; }
  try {
    const r = await fetch(zustand.server + "/api/gesund", { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error();
    zustand.gesund = await r.json();
    zustand.ich = await (await fetch(zustand.server + "/api/ich", { signal: AbortSignal.timeout(6000) })).json();
    speicher.set("planung-ich", JSON.stringify(zustand.ich));
    zustand.verbunden = true; zustand.demo = false; zustand.offline = false;
  } catch {
    zustand.verbunden = false;
    // Schon einmal verbunden: kein Demo, sondern offline weiterarbeiten.
    const ich = speicher.get("planung-ich");
    if (ich) { zustand.offline = true; zustand.demo = false; zustand.ich = JSON.parse(ich); } else zustand.demo = true;
  }
  return zustand.verbunden;
}

export async function api(pfad, { methode = "GET", body, signal } = {}) {
  if (zustand.demo) {
    if (methode !== "GET") throw new ServerFehler("Demo, nicht verbunden. Hier wird nichts gespeichert.", 0);
    return demo(pfad);
  }
  let r;
  try {
    // Nur Lesen bekommt ein Zeitlimit; Schreiben (z. B. Zusammenfassen mit Claude) darf länger dauern.
    r = await fetch(zustand.server + pfad, { method: methode, signal: methode === "GET" ? zeitSignal(signal, LESEN_MS) : signal,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (signal?.aborted) throw e; // Seite gewechselt, kein Netzproblem
    return ohneNetz(pfad, methode);
  }
  const daten = await r.json().catch(() => ({}));
  // 502 bis 504 ohne eigene Meldung kommt von Tailscale, wenn der PC aus ist: wie kein Netz behandeln.
  if (r.status >= 502 && r.status <= 504 && !daten.fehler) return ohneNetz(pfad, methode);
  if (!r.ok) throw new ServerFehler(daten.fehler || "Fehler " + r.status, r.status);
  zustand.offline = false; zustand.verbunden = true;
  if (methode === "GET") ablage.set("get:" + pfad, daten).catch(() => {});
  return daten;
}
async function ohneNetz(pfad, methode) {
  zustand.offline = true;
  const alt = methode === "GET" ? await ablage.get("get:" + pfad).catch(() => null) : null;
  if (alt) return alt;
  throw new VerbindungsFehler("Keine Verbindung zum Server");
}
// Lokalen Stand merken (z. B. Antworten, die noch im Ausgang liegen), damit er ohne Netz beim Öffnen da ist.
export const merken = (pfad, daten) => ablage.set("get:" + pfad, daten).catch(() => {});

// Claude-Antwort als Text-Stream; onText bekommt jedes Stück.
export async function apiStrom(pfad, body, onText) {
  if (zustand.demo) throw new ServerFehler("Demo, nicht verbunden. Hier wird nichts gespeichert.", 0);
  let r;
  try {
    r = await fetch(zustand.server + pfad, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch { throw new VerbindungsFehler("Keine Verbindung zum Server"); }
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new ServerFehler(d.fehler || "Fehler " + r.status, r.status); }
  const leser = r.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) { const { value, done } = await leser.read(); if (done) break; onText(value); }
  } catch { throw Object.assign(new VerbindungsFehler("Verbindung unterbrochen"), { angekommen: true }); } // Server hat die Nachricht schon
}

// Datei hochladen mit Fortschritt (fetch kann keinen Upload-Fortschritt melden).
export function hochladen(pfad, blob, onFortschritt) {
  if (zustand.demo) return Promise.reject(new ServerFehler("Demo, nicht verbunden. Hier wird nichts gespeichert.", 0));
  return new Promise((ok, fehler) => {
    const x = new XMLHttpRequest();
    x.open("PUT", zustand.server + pfad);
    x.upload.onprogress = (e) => e.lengthComputable && onFortschritt?.(e.loaded / e.total);
    x.onload = () => {
      if (x.status < 300) { zustand.offline = false; return ok(JSON.parse(x.responseText)); }
      const m = safeJson(x.responseText).fehler;
      fehler(x.status >= 502 && x.status <= 504 && !m ? new VerbindungsFehler("Keine Verbindung zum Server") : new ServerFehler(m || "Upload fehlgeschlagen", x.status));
    };
    x.onerror = () => { zustand.offline = true; fehler(new VerbindungsFehler("Keine Verbindung zum Server")); };
    x.send(blob);
  });
}
const safeJson = (t) => { try { return JSON.parse(t); } catch { return {}; } };

// v = Version der Datei; nach dem Bemalen ändert sie sich, damit der Browser nicht das alte Bild zeigt.
export const dateiUrl = (planungId, dateiId, klein = true, v) => zustand.demo ? "" : `${zustand.server}/api/planungen/${planungId}/dateien/${dateiId}?klein=${klein ? 1 : 0}${v ? "&v=" + v : ""}`;
export const serverUrl = (pfad) => zustand.server + pfad;

// Fehler aus der Oberfläche ans Server-Log melden, damit sie ohne Gerät nachlesbar sind.
export function bericht(ort, fehler) {
  if (zustand.demo || !zustand.verbunden) return;
  const meldung = fehler instanceof Error ? `${fehler.name}: ${fehler.message}` : String(fehler);
  fetch(zustand.server + "/api/fehlerbericht", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ort, meldung, geraet: navigator.userAgent + (navigator.standalone ? " (Home-Bildschirm)" : "") }) }).catch(() => {});
}
addEventListener("error", (e) => bericht("seite", e.error || e.message));
addEventListener("unhandledrejection", (e) => bericht("seite", e.reason));
