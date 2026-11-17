// Verbindung zum Server auf dem PC (über Tailscale). Ohne Server: Demo mit erfundenen Daten.
const speicher = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* privates Fenster */ } },
};
export { speicher };

// Kommt die Seite vom eigenen Server, ist die Adresse leer (gleiche Herkunft). Auf GitHub Pages trägt man sie in den Einstellungen ein.
const vonGithub = location.hostname.endsWith("github.io");
export const zustand = { server: vonGithub ? (speicher.get("planung-server") || "") : "", verbunden: false, demo: false, gesund: null, ich: null };

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
    zustand.ich = await (await fetch(zustand.server + "/api/ich")).json();
    zustand.verbunden = true; zustand.demo = false;
  } catch {
    zustand.verbunden = false; zustand.demo = true;
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
    r = await fetch(zustand.server + pfad, { method: methode, signal, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new VerbindungsFehler("Keine Verbindung zum Server");
  }
  const daten = await r.json().catch(() => ({}));
  if (!r.ok) throw new ServerFehler(daten.fehler || "Fehler " + r.status, r.status);
  return daten;
}

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
    x.onload = () => (x.status < 300 ? ok(JSON.parse(x.responseText)) : fehler(new ServerFehler(safeJson(x.responseText).fehler || "Upload fehlgeschlagen", x.status)));
    x.onerror = () => fehler(new VerbindungsFehler("Keine Verbindung zum Server"));
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
