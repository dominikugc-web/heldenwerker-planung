// Speicher auf dem Gerät (IndexedDB) für den Offline-Betrieb, und wie eine Antwort lokal eingetragen wird.
// Ohne Browser-Abhängigkeiten beim Laden, damit die Tests das Modul in Node einbinden können.

let dbP = null;
const db = () => (dbP ??= new Promise((ok, fehler) => {
  const r = indexedDB.open("planung-offline", 1);
  r.onupgradeneeded = () => { r.result.createObjectStore("ausgang", { keyPath: "nr", autoIncrement: true }); r.result.createObjectStore("ablage"); };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => fehler(r.error);
}));

// Eine Anfrage in einer eigenen Transaktion; liefert das Ergebnis erst, wenn die Transaktion fertig ist.
export const idb = (store, modus, fn, nimm = (x) => x) => db().then((d) => new Promise((ok, fehler) => {
  const t = d.transaction(store, modus);
  let erg;
  const r = fn(t.objectStore(store));
  if (r) r.onsuccess = () => (erg = nimm(r.result));
  t.oncomplete = () => ok(erg);
  t.onerror = t.onabort = () => fehler(t.error);
}));

// Ablage: zuletzt geladene Daten (für ohne Netz) und lokal aufgenommene Bilder.
export const ablage = {
  get: (k) => idb("ablage", "readonly", (s) => s.get(k)),
  set: (k, v) => idb("ablage", "readwrite", (s) => s.put(v, k)),
  weg: (k) => idb("ablage", "readwrite", (s) => s.delete(k)),
};

// Gleiche Regeln wie pruefeAntwort() in server/fragen.mjs, nur ohne Fehler (die Knöpfe liefern gültige Werte).
function wertNormal(f, eingabe) {
  const w = String(eingabe ?? "").trim();
  if (!w) return "";
  if (f.art === "janein") return w.toLowerCase();
  if (f.art === "auswahl" || f.art === "liste") return f.optionen.find((o) => o.toLowerCase() === w.toLowerCase()) || w;
  if (f.art === "zahl") return w.replace(/\s/g, "");
  return w.slice(0, 2000);
}
export const istZahl = (w) => /^-?\d+([.,]\d+)?$/.test(String(w).replace(/\s/g, ""));

// Wie PUT /api/planungen/:id/antworten/:frage auf dem Server; meta = Angaben zu neuen oder bemalten Dateien.
export function antwortAnwenden(antworten, f, body, meta = {}) {
  const alt = antworten[f.id] || { wert: "", uebersprungen: false, dateien: [], notiz: "" };
  const neu = { ...alt };
  if ("wert" in body) { neu.wert = wertNormal(f, body.wert); if (neu.wert) neu.uebersprungen = false; }
  if ("uebersprungen" in body) neu.uebersprungen = !!body.uebersprungen;
  if ("wert" in body || "uebersprungen" in body) delete neu.quelle; // selbst beantwortet, nicht mehr "aus Lieferschein"
  if ("notiz" in body) neu.notiz = String(body.notiz || "").trim().slice(0, 4000);
  if ("dateien" in body) neu.dateien = body.dateien.map((d) => ({ ...(alt.dateien || []).find((x) => x.id === d.id), ...meta[d.id], id: d.id }));
  return { ...antworten, [f.id]: neu };
}
