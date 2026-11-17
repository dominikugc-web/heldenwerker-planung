import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { route, json, leseJson, fehler } from "./router.mjs";
import { ladeJson, speichereJson } from "./speicher.mjs";

const ARTEN = ["idee", "fehler", "frage"];
const datei = (k) => path.join(k.datenDir, "feedback.json");
const bildOrdner = (k) => path.join(k.datenDir, "feedback-bilder");
const nurInhaber = (k) => { if (!k.inhaber || k.person !== k.inhaber) throw fehler(403, "Nur für den Inhaber"); };

// Lampe: jeder darf schreiben, nur der Inhaber (PLANUNG_INHABER) liest.
route("POST", "/api/feedback", async (req, res, p, k) => {
  const b = await leseJson(req, 8_000_000);
  const text = String(b.text || "").trim();
  if (!ARTEN.includes(b.art)) throw fehler(400, "Unbekannte Art");
  if (!text || text.length > 4000) throw fehler(400, "Bitte 1 bis 4000 Zeichen");
  const eintrag = { id: crypto.randomUUID(), art: b.art, text, person: k.person, zeit: new Date().toISOString(), bild: null };
  if (b.bild) {
    const buf = Buffer.from(String(b.bild), "base64");
    if (buf.length > 5_000_000) throw fehler(400, "Bild zu groß");
    fs.mkdirSync(bildOrdner(k), { recursive: true });
    eintrag.bild = eintrag.id + ".png";
    fs.writeFileSync(path.join(bildOrdner(k), eintrag.bild), buf);
  }
  speichereJson(datei(k), [eintrag, ...ladeJson(datei(k), [])]);
  json(res, 201, { ok: true });
});

route("GET", "/api/feedback", (req, res, p, k) => { nurInhaber(k); json(res, 200, ladeJson(datei(k), [])); });

route("GET", "/api/feedback/bild/:name", (req, res, p, k) => {
  nurInhaber(k);
  if (!/^[a-z0-9-]+\.png$/.test(p.name)) throw fehler(404, "Nicht gefunden");
  const f = path.join(bildOrdner(k), p.name);
  if (!fs.existsSync(f)) throw fehler(404, "Nicht gefunden");
  res.writeHead(200, { "Content-Type": "image/png" });
  fs.createReadStream(f).pipe(res);
});
