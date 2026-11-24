// Offline-Ausgang: Antworten und Dateien aus dem Ablauf landen zuerst auf dem Gerät und gehen der Reihe nach
// an den Server, sobald er erreichbar ist. Reihenfolge bleibt (Dateien vor der Antwort, die sie nennt).
import { api, hochladen, VerbindungsFehler, bericht } from "./api.js";
import { idb, ablage } from "./lokal.js";

const melden = (detail) => dispatchEvent(new CustomEvent("ausgang", { detail }));
export const anzahl = () => idb("ausgang", "readonly", (s) => s.count());
const erste = () => idb("ausgang", "readonly", (s) => s.openCursor(), (c) => c?.value);
const alle = () => idb("ausgang", "readonly", (s) => s.getAll());
const loeschen = (nr) => idb("ausgang", "readwrite", (s) => s.delete(nr));

// op: { planungId, art: "datei", pfad, blob, dateiId, klein, v } oder { planungId, art: "antwort", pfad, body, frage, meta }
export async function einreihen(op) {
  await idb("ausgang", "readwrite", (s) => s.add({ ...op, zeit: Date.now() }));
  melden({ offen: await anzahl() });
}

// Offene Antworten einer Planung, um sie über den (älteren) Stand vom Server zu legen.
export const offeneAntworten = async (planungId) => (await alle()).filter((o) => o.planungId === planungId && o.art === "antwort");

// Neueste noch nicht hochgeladene Fassung eines Fotos (z. B. zum Bemalen ohne Netz).
export async function dateiBlob(dateiId, klein = false) {
  return (await alle()).filter((o) => o.art === "datei" && o.dateiId === dateiId && !!o.klein === klein).at(-1)?.blob || null;
}

// Arbeitet den Ausgang ab; liefert, wie viel noch offen ist. Läuft nie doppelt.
let lauf = null;
export function abarbeiten() {
  return (lauf ??= (async () => {
    try {
      for (;;) {
        const op = await erste();
        if (!op) return 0;
        try {
          const r = op.art === "datei" ? await hochladen(op.pfad, op.blob) : await api(op.pfad, { methode: "PUT", body: op.body });
          await loeschen(op.nr);
          // Lokales Bild wegräumen, sobald genau diese Fassung auf dem Server liegt.
          if (op.art === "datei" && op.klein) { const b = await ablage.get("bild:" + op.dateiId); if (b?.v === op.v) await ablage.weg("bild:" + op.dateiId); }
          const offen = await anzahl();
          const restPlanung = (await alle()).filter((o) => o.planungId === op.planungId).length;
          melden({ offen, planungId: op.planungId, ...(op.art === "antwort" && !restPlanung && { antworten: r.antworten }) });
        } catch (e) {
          // Kein Netz, Server aus oder überlastet: später nochmal. Echte Ablehnung (4xx): verwerfen und melden, sonst hängt alles.
          const spaeter = e instanceof VerbindungsFehler || !e.status || e.status >= 500 || [401, 408, 429].includes(e.status);
          if (spaeter) { const offen = await anzahl(); melden({ offen, wartet: true }); return offen; }
          await loeschen(op.nr);
          bericht("ausgang", e);
          melden({ offen: await anzahl(), abgelehnt: e.message, frage: op.frage });
        }
      }
    } finally { lauf = null; }
  })());
}

// Wieder Netz, App wieder im Vordergrund, oder alle 20 Sekunden: offenen Ausgang weiterschicken.
addEventListener("online", () => abarbeiten());
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && abarbeiten());
setInterval(() => abarbeiten(), 20000);
