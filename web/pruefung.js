// Prüfansicht nach dem Zusammenfassen: Monteur-Text bearbeiten, Antworten kontrollieren, Protokoll ansehen, dann nach HERO.
import { api, dateiUrl, serverUrl, zustand } from "./api.js";
import { $, $$, esc, toast, fehlerMelden, IKON } from "./ui.js";

const ABSCHNITTE = [["wasWirdGemacht", "Was wird gemacht"], ["woKommtWasHin", "Wo kommt was hin"], ["achtung", "Achtung auf der Baustelle"],
  ["material", "Material und Besonderheiten"], ["offen", "Offene Punkte"]];

export async function pruefAnsicht(el, id, signal) {
  const [planung, { katalog, bereiche }] = await Promise.all([api("/api/planungen/" + id, { signal }), api("/api/fragen", { signal })]);
  if (!planung.ergebnis) { location.hash = "chat/" + id; return; }
  const e = planung.ergebnis, antworten = planung.antworten || {};
  const beantwortet = katalog.filter((f) => { const a = antworten[f.id]; return a && ((a.wert ?? "") !== "" || a.dateien?.length || a.notiz); });
  const wert = (f, a) => [a.wert && (f.art === "janein" ? a.wert[0].toUpperCase() + a.wert.slice(1) : a.wert + (f.einheit ? " " + f.einheit : "")),
    a.dateien?.length ? `${a.dateien.length} Datei${a.dateien.length > 1 ? "en" : ""}` : "", a.notiz ? "✎ Notiz" : ""].filter(Boolean).join(" · ");
  const bild = (f) => (antworten[f.id].dateien || []).filter((d) => d.art === "bild").slice(0, 3).map((d) => `<img src="${esc(dateiUrl(planung.id, d.id, true, d.v))}" alt="" loading="lazy">`).join("");

  el.innerHTML = `<div class="kopf"><button class="pill rund" data-chat aria-label="Zurück zum Ablauf">${IKON.zurueck}</button><h1>Prüfen</h1><span class="muted small" id="gespeichert"></span></div>
    <p class="unter">${esc(antworten.kunde?.wert || planung.projektTitel)}<br>Aufgenommen von ${esc(planung.personName || planung.person)}</p>
    <div id="ergebnis"></div>
    ${e.fehlt.length ? `<div class="karte fehlt"><b>Es fehlen noch Fotos</b><p class="muted small" style="margin:6px 0 0">${e.fehlt.map(esc).join(", ")}</p></div>` : ""}
    <div class="label">Für die Monteure</div>
    <div class="gruppe">${ABSCHNITTE.map(([k, t]) => `<label class="feld abschnitt"><span>${t}</span><textarea data-abschnitt="${k}" rows="3" placeholder="Eine Zeile pro Punkt">${esc((e.monteure[k] || []).join("\n"))}</textarea></label>`).join("")}</div>
    ${[...new Set(beantwortet.map((f) => f.bereich))].map((b) => `<div class="label">${esc(bereiche[b])}</div><div class="gruppe">${beantwortet.filter((f) => f.bereich === b).map((f) =>
      `<a class="zeile" href="#chat/${esc(planung.id)}/${esc(f.id)}"><div class="haupt"><div class="titel">${esc(f.titel || f.frage)}</div><div class="neben">${esc(wert(f, antworten[f.id]))}</div></div><span class="daumen">${bild(f)}</span>${IKON.pfeil}</a>`).join("")}</div>`).join("")}
    <div class="zwei"><a class="pill" href="${esc(serverUrl(`/api/planungen/${planung.id}/protokoll.pdf`))}" target="_blank" rel="noopener" data-pdf>Protokoll ansehen</a><button class="pill" data-chat>Zum Ablauf</button></div>
    <button class="gross ok" data-senden>${IKON.wolke}${planung.status === "gesendet" ? "Erneut senden" : "In HERO speichern"}</button>`;

  $$("[data-chat]", el).forEach((b) => (b.onclick = () => (location.hash = "chat/" + id)));

  // Änderungen am Monteur-Text automatisch speichern (kurz verzögert).
  let timer, speichern = Promise.resolve();
  const sammeln = () => ({ monteure: Object.fromEntries(ABSCHNITTE.map(([k]) => [k, $(`[data-abschnitt="${k}"]`, el).value.split("\n").map((s) => s.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)])) });
  const jetztSpeichern = () => (speichern = speichern.then(async () => {
    if (zustand.demo) return;
    try { await api(`/api/planungen/${id}/ergebnis`, { methode: "PUT", body: sammeln() }); $("#gespeichert", el).textContent = "gespeichert"; }
    catch (err) { fehlerMelden(err); throw err; }
  }));
  el.addEventListener("input", () => { $("#gespeichert", el).textContent = "…"; clearTimeout(timer); timer = setTimeout(jetztSpeichern, 700); });
  $("[data-pdf]", el).addEventListener("click", async (ev) => { clearTimeout(timer); ev.preventDefault(); const ziel = ev.currentTarget.href; await jetztSpeichern().catch(() => {}); window.open(ziel, "_blank", "noopener"); });

  // Gesendet wird auf dem Server im Hintergrund. Hier nur den Stand zeigen und nachladen, solange die Seite offen ist.
  const knopf = $("[data-senden]", el);
  let zuletzt = planung.senden?.status, warte = null;
  const zeigeStand = (s) => {
    if (!s) return;
    const r = s.ergebnis;
    const zeilen = s.status === "laeuft" ? [["Wird im Hintergrund gesendet …", "⏳"], ["Du kannst die App schließen, es läuft auf dem Server weiter.", ""]] : [
      r && [r.ziel.umgeleitet ? "Gespeichert im Testprojekt UNB-1149 (Testmodus)" : "Gespeichert im Projekt", ""],
      r && ["Logbuch-Eintrag „Besichtigung durchgeführt“", "✓"],
      r?.hochgeladen && ["Protokoll und Fotos auf Google Drive", r.hochgeladen],
      r?.offen && ["Fotos und Protokoll folgen", r.offen + " offen"],
      s.status === "fehler" && ["Fehler", s.meldung || "Senden fehlgeschlagen"],
    ].filter(Boolean);
    $("#ergebnis", el).innerHTML = `<div class="gruppe ergebnis">${zeilen.map(([a, b]) => `<div class="zeile"><div class="haupt">${esc(a)}</div><span class="wert">${esc(b)}</span></div>`).join("")}</div>`;
    knopf.disabled = s.status === "laeuft";
    knopf.innerHTML = IKON.wolke + (s.status === "laeuft" ? "Wird gesendet …" : "Erneut senden");
  };
  const nachladen = async () => {
    clearTimeout(warte);
    if (!el.isConnected || signal?.aborted) return;
    try {
      const s = (await api("/api/planungen/" + id, { signal })).senden;
      zeigeStand(s);
      if (s?.status === "laeuft") warte = setTimeout(nachladen, 3000);
      else if (zuletzt === "laeuft") toast(s?.status === "fertig" ? "In HERO gespeichert" : "Senden hat nicht ganz geklappt, bitte erneut senden", s?.status === "fertig" ? "ok" : "fehler");
      zuletzt = s?.status;
    } catch (e) { if (e.name !== "AbortError") warte = setTimeout(nachladen, 6000); }
  };
  zeigeStand(planung.senden);
  if (zuletzt === "laeuft") warte = setTimeout(nachladen, 3000);

  knopf.onclick = async () => {
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    knopf.disabled = true;
    try {
      clearTimeout(timer); await jetztSpeichern();
      const s = await api(`/api/planungen/${id}/abschliessen`, { methode: "POST", body: {} });
      zuletzt = "laeuft"; zeigeStand(s);
      el.scrollTo({ top: 0, behavior: "smooth" });
      toast("Wird im Hintergrund gesendet. Du kannst die App schließen.", "ok");
      warte = setTimeout(nachladen, 3000);
    } catch (err) { fehlerMelden(err); knopf.disabled = false; }
  };
}
