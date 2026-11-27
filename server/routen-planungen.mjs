import fs from "node:fs";
import { istAdmin } from "./profile.mjs";
import { feedbackNeu } from "./feedback.mjs";
import { audioMime } from "./transkribieren.mjs";
import { route, json, leseJson, fehler } from "./router.mjs";
import { kostenSchaetzen } from "./claude.mjs";
import { berichtText, berichtPdf, fehltPflichtfotos, fehltZumSenden } from "./bericht.mjs";
import { antwortenAusLieferscheinen, abschlussAusLieferscheinen } from "./lieferschein.mjs";
import { BERICHTE } from "./abschluss-fragen.mjs";
import { istMonteur, erlaubteProjekte } from "./monteur.mjs";
import { heizlastAusPdf, antwortenAusHeizlast } from "./heizlast.mjs";
import { TYPEN, istAbschluss, abschlussGesperrt, berichtVon } from "./fragen.mjs";

const RICHTUNGEN = Object.values(TYPEN);
// Ein Kunde kann je Richtung ein eigenes HERO-Projekt haben; besichtigt wird alles in einem Besuch.
function projekteAus(b) {
  if (b.projekte === undefined) return [{ id: Number(b.projektId), nummer: String(b.nummer || ""), richtungen: [] }];
  if (!Array.isArray(b.projekte) || !b.projekte.length || b.projekte.length > 5 || b.projekte.some((p) => !Number(p?.id))) throw fehler(400, "Projekte ungültig");
  return b.projekte.map((p) => ({ id: Number(p.id), nummer: String(p.nummer || "").slice(0, 40), richtungen: RICHTUNGEN.filter((r) => [].concat(p.richtungen || []).includes(r)) }));
}

// Steht "laeuft" drin, aber hier läuft nichts (Server wurde neu gestartet): als unterbrochen melden, damit man neu senden kann.
const sendenStand = (k, pl) => (pl.senden?.status === "laeuft" && !k.abschluss.laeuft(pl.id)
  ? { ...pl.senden, status: "fehler", meldung: "Unterbrochen, bitte erneut senden" } : pl.senden);
const mitName = (k, pl) => ({ ...pl, personName: k.profile.nameVon(pl.person), senden: sendenStand(k, pl) });
route("GET", "/api/planungen", async (req, res, p, k) => {
  let liste = k.planungen.liste();
  if (istMonteur(k)) { const erlaubt = await erlaubteProjekte(k); liste = liste.filter((pl) => pl.art === "abschluss" && (pl.person === k.person || erlaubt.has(pl.projektId))); }
  json(res, 200, liste.map((pl) => mitName(k, pl)));
});
route("GET", "/api/planungen/:id", (req, res, p, k) => json(res, 200, mitName(k, k.planungen.laden(p.id))));

async function besichtigungVorbefuellt(k, projekte) {
  const hero = k.hero();
  const heizlast = async (id) => { const d = await hero.heizlastBericht(id); return d ? antwortenAusHeizlast(await heizlastAusPdf(await hero.laden(d.url))) : {}; };
  const [ls, hl] = await Promise.all([
    Promise.allSettled(projekte.map((p) => hero.lieferscheine(p.id).then(antwortenAusLieferscheinen))),
    Promise.allSettled(projekte.map((p) => heizlast(p.id))),
  ]);
  for (const [name, liste] of [["Lieferscheine", ls], ["Heizlast", hl]]) for (const x of liste) if (x.status === "rejected") console.error(name + ":", String(x.reason?.message).slice(0, 200));
  return Object.assign({}, ...hl.map((x) => x.value || {}), ...ls.map((x) => x.value || {}));
}

route("POST", "/api/planungen", async (req, res, p, k) => {
  const b = await leseJson(req);
  if (!Number(b.projektId)) throw fehler(400, "Projekt fehlt");
  if (istMonteur(k) && (b.bericht === undefined || !(await erlaubteProjekte(k)).has(Number(b.projektId)))) throw fehler(403, "Für Monteure nicht freigegeben");
  if (b.bericht !== undefined) return abschlussAnlegen(b, res, k);
  // Was schon in Lieferscheinen und im Heizlastbericht steht, muss der Planer nicht nochmal erfassen. Klappt das nicht, startet die Planung trotzdem.
  // Lieferschein vor Heizlast: dort steht die echte Außeneinheit, die Heizlast ist nur der Richtwert.
  const projekte = projekteAus(b);
  const vorbefuellt = await besichtigungVorbefuellt(k, projekte);
  const typen = RICHTUNGEN.filter((r) => [].concat(b.typen || []).includes(r));
  if (typen.length) vorbefuellt.typ = { wert: typen.join(", ") };
  const nummer = projekte.map((p) => p.nummer).filter(Boolean).join(", ") || b.nummer;
  json(res, 201, k.planungen.neu({ projektId: projekte[0].id, projekte, projektTitel: b.projektTitel, person: k.person, kunde: b.kunde, adresse: b.adresse, nummer, vorbefuellt }));
});

// Abschlussbericht (Abnahmeprotokoll) für ein Projekt. Ein Trupp teilt sich einen Bericht: Ist derselbe Bericht für dasselbe
// Projekt schon begonnen und nicht gesendet, geht es dort weiter (200), sonst neu (201).
async function abschlussAnlegen(b, res, k) {
  const key = b.bericht === "dach" ? "dc" : String(b.bericht);
  if (!Object.hasOwn(BERICHTE, key)) throw fehler(400, "Unbekannter Bericht");
  const name = BERICHTE[key], projektId = Number(b.projektId);
  // Wer war dabei: die Auswahl aus der App; ohne Auswahl der Anlegende selbst.
  const gewaehlt = [...new Set([].concat(b.monteure || []).map((m) => String(m).trim().slice(0, 80)).filter(Boolean))];
  const offen = k.planungen.liste().find((x) => x.projektId === projektId && berichtVon(x.antworten) === key && x.status !== "gesendet");
  if (offen) {
    const pl = k.planungen.laden(offen.id);
    // Neue Auswahl beim Fortsetzen übernehmen, solange nicht unterschrieben oder gesendet.
    if (gewaehlt.length && !abschlussGesperrt(pl) && !pl.antworten.ab_unterschrift) {
      pl.antworten.ab_monteure = { ...(pl.antworten.ab_monteure || { uebersprungen: false, dateien: [], notiz: "" }), wert: gewaehlt.join(", "), zeit: new Date().toISOString() };
      k.planungen.speichern(pl);
    }
    return json(res, 200, pl);
  }
  let vorbefuellt = {};
  try { vorbefuellt = abschlussAusLieferscheinen(await k.hero().lieferscheine(projektId)); } catch (e) { console.error("Lieferscheine:", String(e.message).slice(0, 200)); }
  const monteure = gewaehlt.length ? gewaehlt : [k.profil?.name || k.person];
  vorbefuellt.bericht = { wert: name };
  vorbefuellt.ab_monteure = { wert: monteure.join(", ") };
  const nummer = String(b.nummer || "").slice(0, 40);
  json(res, 201, k.planungen.neu({ art: "abschluss", projektId, projekte: [{ id: projektId, nummer, richtungen: [] }], projektTitel: b.projektTitel, person: k.person,
    kunde: b.kunde, adresse: b.adresse, nummer, vorbefuellt }));
}

// Neu starten (Dominik, 27.11.), Abschlussbericht und Besichtigung: alle Antworten, Fotos, Unterschrift und Zusammenfassung weg,
// wie frisch angelegt. Kopf (Kunde, Projekt, Adresse, Datum heute), Typ bzw. Bericht und Monteure bleiben, Lieferschein (und Heizlast)
// werden neu gelesen. Schon gesendet (oder am Senden): nicht hier, die App legt dann eine neue Planung an.
// Die App schickt dabei die neue Auswahl vom Anfang mit (Dominik, 27.11.): Bericht und Monteure bzw. Typen und Projekte.
route("POST", "/api/planungen/:id/neustart", async (req, res, p, k) => {
  const b = await leseJson(req);
  const pl = k.planungen.laden(p.id), abschluss = istAbschluss(pl.antworten);
  if (pl.status === "gesendet" || pl.senden) throw fehler(409, "Schon gesendet. Bitte neu anlegen.");
  const key = b.bericht === undefined ? berichtVon(pl.antworten) : b.bericht === "dach" ? "dc" : String(b.bericht);
  if (abschluss && !Object.hasOwn(BERICHTE, key)) throw fehler(400, "Unbekannter Bericht");
  const monteure = [...new Set([].concat(b.monteure || []).map((m) => String(m).trim().slice(0, 80)).filter(Boolean))];
  const projekte = !abschluss && b.projekte !== undefined ? projekteAus(b) : null;
  const typen = RICHTUNGEN.filter((r) => [].concat(b.typen || []).includes(r));
  let vorbefuellt = {};
  if (abschluss) try { vorbefuellt = abschlussAusLieferscheinen(await k.hero().lieferscheine(pl.projektId)); } catch (e) { console.error("Lieferscheine:", String(e.message).slice(0, 200)); }
  else vorbefuellt = await besichtigungVorbefuellt(k, projekte || (pl.projekte?.length ? pl.projekte : [{ id: pl.projektId }]));
  const jetzt = new Date(), heute = jetzt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const vor = (wert) => ({ wert: String(wert || "").trim(), uebersprungen: false, dateien: [], notiz: "", zeit: jetzt.toISOString() });
  const frisch = k.planungen.laden(p.id), alt = frisch.antworten;
  const typWert = typen.length ? typen.join(", ") : alt.typ?.wert;
  const antworten = abschluss ? { bericht: vor(BERICHTE[key]), ab_datum: vor(heute) } : { datum: vor(heute), ...(typWert && { typ: vor(typWert) }) };
  for (const id of abschluss ? ["ab_kunde", "ab_projektnr", "ab_adresse", "ab_monteure"] : ["kunde", "projektnr", "adresse"]) if (alt[id]?.wert) antworten[id] = vor(alt[id].wert);
  if (abschluss && monteure.length) antworten.ab_monteure = vor(monteure.join(", "));
  if (projekte) {
    Object.assign(frisch, { projekte, projektId: projekte[0].id, ...(b.projektTitel && { projektTitel: String(b.projektTitel) }) });
    const nr = projekte.map((x) => x.nummer).filter(Boolean).join(", ");
    if (nr) antworten.projektnr = vor(nr);
  }
  for (const [id, x] of Object.entries(vorbefuellt)) antworten[id] ??= { ...vor(x.wert), notiz: x.notiz || "", quelle: x.quelle };
  Object.assign(frisch, { antworten, status: "offen", ergebnis: null, verlauf: [] });
  delete frisch.senden;
  k.planungen.speichern(frisch);
  json(res, 200, frisch);
});

route("PUT", "/api/planungen/:id/dateien/:dateiId", async (req, res, p, k) => {
  const q = k.query, vorher = k.planungen.laden(p.id);
  // Abschlussbericht: nach Sendebeginn nichts mehr, die Unterschrift nie überschreiben; ein überschriebenes Foto braucht eine neue Unterschrift.
  if (abschlussGesperrt(vorher)) throw fehler(409, "Bericht ist gesendet");
  if (istAbschluss(vorher.antworten) && (vorher.antworten.ab_unterschrift?.dateien || []).some((d) => d.id === p.dateiId)) throw fehler(409, "Unterschrift kann nicht ersetzt werden");
  if (istAbschluss(vorher.antworten) && vorher.antworten.ab_unterschrift && Object.values(vorher.antworten).some((a) => (a.dateien || []).some((d) => d.id === p.dateiId))) {
    const pl = k.planungen.laden(p.id); delete pl.antworten.ab_unterschrift; k.planungen.speichern(pl);
  }
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

// Abschlussbericht ohne Claude: nur senden, wenn Pflichtfotos (oder Grund) und Unterschrift da sind.
// Planungsbilder aus HERO (Kategorien Planung, Dachplanung, Stringplan) für „Was wurde geändert?“, neueste zuerst.
const PLANUNG = /^(planung|dachplanung|strinplan|stringplan)$/i;
// Echte Pläne (Planung, Stringplan) vor den Dachfotos (Dachplanung), jeweils neueste zuerst.
const rang = (b) => (/dachplanung/i.test(b.kategorie) ? 1 : 0);
const planungsbilder = async (k, pl) => (await k.hero().projektBilder(pl.projektId)).filter((b) => PLANUNG.test(b.kategorie)).sort((a, b) => rang(a) - rang(b) || String(b.datum).localeCompare(String(a.datum)));
route("GET", "/api/planungen/:id/planungsbilder", async (req, res, p, k) =>
  json(res, 200, (await planungsbilder(k, k.planungen.laden(p.id))).map(({ url, ...b }) => b)));
route("GET", "/api/planungen/:id/planungsbilder/:bildId", async (req, res, p, k) => {
  const b = (await planungsbilder(k, k.planungen.laden(p.id))).find((x) => String(x.id) === p.bildId);
  if (!b) throw fehler(404, "Bild nicht gefunden");
  const daten = await k.hero().laden(b.url);
  res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": daten.length, "Cache-Control": "private, max-age=600" });
  res.end(Buffer.from(daten));
});

route("POST", "/api/planungen/:id/nachtrag", (req, res, p, k) => json(res, 200, k.abschluss.nachtrag(p.id)));

route("POST", "/api/planungen/:id/abschliessen", (req, res, p, k) => {
  const pl = k.planungen.laden(p.id);
  if (istAbschluss(pl.antworten) && !abschlussGesperrt(pl)) {
    const fehlt = fehltZumSenden(pl);
    if (fehlt.length) throw fehler(409, "Es fehlt noch: " + fehlt.join(", "));
    pl.ergebnis = { fehlt: [], abschluss: true };
    if (pl.status === "offen") pl.status = "zusammengefasst";
    k.planungen.speichern(pl);
  }
  json(res, 202, k.abschluss.starten(p.id));
});

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
