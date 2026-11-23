import fs from "node:fs";
import { istAdmin } from "./profile.mjs";
import { feedbackNeu } from "./feedback.mjs";
import { audioMime } from "./transkribieren.mjs";
import { route, json, leseJson, fehler } from "./router.mjs";
import { kostenSchaetzen } from "./claude.mjs";
import { berichtText, berichtPdf, fehltPflichtfotos } from "./bericht.mjs";
import { antwortenAusLieferscheinen } from "./lieferschein.mjs";
import { heizlastAusPdf, antwortenAusHeizlast } from "./heizlast.mjs";

// Steht "laeuft" drin, aber hier läuft nichts (Server wurde neu gestartet): als unterbrochen melden, damit man neu senden kann.
const sendenStand = (k, pl) => (pl.senden?.status === "laeuft" && !k.abschluss.laeuft(pl.id)
  ? { ...pl.senden, status: "fehler", meldung: "Unterbrochen, bitte erneut senden" } : pl.senden);
const mitName = (k, pl) => ({ ...pl, personName: k.profile.nameVon(pl.person), senden: sendenStand(k, pl) });
route("GET", "/api/planungen", (req, res, p, k) => json(res, 200, k.planungen.liste().map((pl) => mitName(k, pl))));
route("GET", "/api/planungen/:id", (req, res, p, k) => json(res, 200, mitName(k, k.planungen.laden(p.id))));

route("POST", "/api/planungen", async (req, res, p, k) => {
  const b = await leseJson(req);
  if (!Number(b.projektId)) throw fehler(400, "Projekt fehlt");
  // Was schon in Lieferscheinen und im Heizlastbericht steht, muss der Planer nicht nochmal erfassen. Klappt das nicht, startet die Planung trotzdem.
  // Lieferschein vor Heizlast: dort steht die echte Außeneinheit, die Heizlast ist nur der Richtwert.
  const hero = k.hero();
  const heizlast = async () => { const d = await hero.heizlastBericht(b.projektId); return d ? antwortenAusHeizlast(await heizlastAusPdf(await hero.laden(d.url))) : {}; };
  const [ls, hl] = await Promise.allSettled([hero.lieferscheine(b.projektId).then(antwortenAusLieferscheinen), heizlast()]);
  for (const [name, x] of [["Lieferscheine", ls], ["Heizlast", hl]]) if (x.status === "rejected") console.error(name + ":", String(x.reason?.message).slice(0, 200));
  const vorbefuellt = { ...(hl.value || {}), ...(ls.value || {}) };
  json(res, 201, k.planungen.neu({ projektId: b.projektId, projektTitel: b.projektTitel, person: k.person, kunde: b.kunde, adresse: b.adresse, nummer: b.nummer, vorbefuellt }));
});

route("PUT", "/api/planungen/:id/dateien/:dateiId", async (req, res, p, k) => {
  const q = k.query;
  const d = await k.planungen.dateiEmpfangen(req, p.id, p.dateiId, { name: q.get("name"), art: q.get("art"), klein: q.get("klein") === "1" });
  json(res, 201, d);
});

const ABSCHNITTE = ["wasWirdGemacht", "woKommtWasHin", "achtung", "material", "offen"];
const monteurePruefen = (m) => {
  if (!m || ABSCHNITTE.some((k) => !Array.isArray(m[k]) || m[k].some((x) => typeof x !== "string"))) throw fehler(400, "Monteur-Text unvollständig");
  return Object.fromEntries(ABSCHNITTE.map((k) => [k, m[k].map((x) => x.trim().slice(0, 500)).filter(Boolean)]));
};

// Claude schreibt aus den Antworten den kurzen Text für die Monteure.
route("POST", "/api/planungen/:id/zusammenfassen", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  const claude = k.claude();
  if (!claude) throw fehler(503, "Claude-Schlüssel fehlt");
  const { monteure, usage } = await claude.monteurText(berichtText(pl));
  const neu = k.planungen.laden(p.id);
  neu.ergebnis = { monteure: monteurePruefen(monteure), fehlt: fehltPflichtfotos(neu) };
  neu.status = "zusammengefasst";
  neu.kostenCent = Math.round(((neu.kostenCent || 0) + kostenSchaetzen(usage)) * 100) / 100;
  k.planungen.speichern(neu);
  json(res, 200, neu.ergebnis);
});

route("PUT", "/api/planungen/:id/ergebnis", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  pl.ergebnis = { monteure: monteurePruefen((await leseJson(req)).monteure), fehlt: fehltPflichtfotos(pl) };
  k.planungen.speichern(pl);
  json(res, 200, pl.ergebnis);
});

// PDF zur Vorschau: Fotos aus der verkleinerten Fassung, Links von Dateien, die schon auf Drive liegen.
route("GET", "/api/planungen/:id/protokoll.pdf", async (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  const pdf = await berichtPdf(pl, { links: linksAus(pl), bild: (id) => k.planungen.bildFuerPdf(pl.id, id) });
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length });
  res.end(pdf);
});
export const linksAus = (pl) => Object.fromEntries(Object.entries(pl.gesendet?.dateien || {}).map(([id, d]) => [id, d.link]));

route("POST", "/api/planungen/:id/abschliessen", (req, res, p, k) => json(res, 202, k.abschluss.starten(p.id)));

const TYP = { bild: "image/jpeg", pdf: "application/pdf", video: "video/mp4" };
// Für Vorschaubilder im Chat: klein=1 liefert die verkleinerte Fassung, wenn es sie gibt.
route("GET", "/api/planungen/:id/dateien/:dateiId", (req, res, p, k) => {
  k.planungen.laden(p.id);
  let meta;
  try { [meta] = k.planungen.dateienPruefen({ id: p.id }, [{ id: p.dateiId }]); } catch { throw fehler(404, "Datei nicht gefunden"); }
  const datei = k.query.get("klein") === "1" && meta.klein ? k.planungen.dateiPfad(p.id, p.dateiId, true) : k.planungen.dateiPfad(p.id, p.dateiId);
  res.writeHead(200, { "Content-Type": meta.art === "audio" ? audioMime(meta.name) : TYP[meta.art] || "application/octet-stream", "Cache-Control": "private, no-cache" }); // Bilder können übermalt werden
  fs.createReadStream(datei).pipe(res);
});

route("GET", "/api/ich", (req, res, p, k) => json(res, 200, {
  login: k.person,
  name: k.profil.name,
  rolle: k.profil.rolle,
  heroPerson: k.profil.heroPerson || null,
  inhaber: istAdmin(k),
  ...(istAdmin(k) && { feedbackNeu: feedbackNeu(k) }),
}));

// Fehler aus der Oberfläche (z. B. Aufnahme am iPhone) ins Server-Log, damit man sie ohne Gerät nachlesen kann.
route("POST", "/api/fehlerbericht", async (req, res, p, k) => {
  const b = await leseJson(req, 20_000);
  const kurz = (s, n) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
  console.error(`[Oberfläche] ${new Date().toISOString()} ${k.person} ${kurz(b.ort, 40)}: ${kurz(b.meldung, 800)} | ${kurz(b.geraet, 200)}`);
  res.writeHead(204); res.end();
});
