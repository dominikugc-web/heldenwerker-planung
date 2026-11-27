// Prüfansicht nach dem Zusammenfassen: Monteur-Text bearbeiten, Antworten kontrollieren, Protokoll ansehen, dann nach HERO.
import { api, dateiUrl, serverUrl, zustand } from "./api.js";
import { $, $$, esc, toast, fehlerMelden, zurueck, IKON } from "./ui.js";
import { sichtbar, berichtKey } from "./chat.js";

// Abschlussbericht: was vor dem Senden noch fehlt (wie fehltZumSenden auf dem Server).
const hatBild = (a) => (a?.dateien || []).some((d) => d.art === "bild");
const fehltAbschluss = (katalog, antworten) => [...sichtbar(katalog, antworten).filter((f) => f.pflicht && !hatBild(antworten[f.id]) && !(antworten[f.id]?.uebersprungen && antworten[f.id]?.notiz)).map((f) => f.titel),
  ...(hatBild(antworten.ab_unterschrift) && antworten.ab_unterschrift.wert ? [] : ["Unterschrift des Kunden"])];

const ABSCHNITTE = [["wasWirdGemacht", "Was wird gemacht"], ["woKommtWasHin", "Wo kommt was hin"], ["achtung", "Achtung auf der Baustelle"],
  ["material", "Material und Besonderheiten"], ["offen", "Offene Punkte"]];

export async function pruefAnsicht(el, id, signal) {
  const [planung, { katalog, bereiche }] = await Promise.all([api("/api/planungen/" + id, { signal }), api("/api/fragen", { signal })]);
  const antworten = planung.antworten || {}, abschluss = !!berichtKey(katalog, antworten), gesperrt = abschluss && planung.status === "gesendet";
  if (!planung.ergebnis && !abschluss) { location.hash = "chat/" + id; return; }
  const e = abschluss ? { fehlt: gesperrt ? [] : fehltAbschluss(katalog, antworten), monteure: {} } : planung.ergebnis;
  const beantwortet = katalog.filter((f) => { const a = antworten[f.id]; if (f.id === "bericht") return false; return a && ((a.wert ?? "") !== "" || a.dateien?.length || a.notiz); });
  const wert = (f, a) => [a.wert && (f.art === "janein" ? a.wert[0].toUpperCase() + a.wert.slice(1) : a.wert + (f.einheit ? " " + f.einheit : "")),
    a.dateien?.length ? `${a.dateien.length} Datei${a.dateien.length > 1 ? "en" : ""}` : "", f.abschluss && f.pflicht && a.uebersprungen && !a.dateien?.length ? "Nicht möglich: " + (a.notiz || "") : a.notiz ? "✎ Notiz" : ""].filter(Boolean).join(" · ");
  const bild = (f) => (antworten[f.id].dateien || []).filter((d) => d.art === "bild").slice(0, 3).map((d) => `<img src="${esc(dateiUrl(planung.id, d.id, true, d.v))}" alt="" loading="lazy">`).join("");

  el.innerHTML = `<div class="kopf"><button class="pill rund" data-zurueck aria-label="Zurück">${IKON.zurueck}</button><h1>Prüfen</h1><span class="muted small" id="gespeichert"></span></div>
    <p class="unter">${abschluss ? esc("Abnahmeprotokoll " + antworten.bericht.wert) + "<br>" : ""}${esc(antworten.kunde?.wert || antworten.ab_kunde?.wert || planung.projektTitel)}<br>Aufgenommen von ${esc(planung.personName || planung.person)}</p>
    <div id="ergebnis"></div>
    ${e.fehlt.length ? `<div class="karte fehlt"><b>${abschluss ? "Vor dem Senden fehlt noch" : "Es fehlen noch Fotos"}</b><p class="muted small" style="margin:6px 0 0">${e.fehlt.map(esc).join(", ")}</p></div>` : ""}
    ${abschluss ? "" : `<div class="label">Für die Monteure</div>
    <div class="gruppe">`}${abschluss ? "" : ABSCHNITTE.map(([k, t]) => `<div class="feld abschnitt"><div class="abschnittkopf"><span>${t}</span><button class="stiftknopf" data-bearbeiten="${k}" aria-label="${t} bearbeiten" aria-pressed="false">${IKON.stift}</button></div><textarea data-abschnitt="${k}" rows="1" readonly placeholder="Eine Zeile pro Punkt">${esc((e.monteure[k] || []).join("\n"))}</textarea></div>`).join("") + "</div>"}
    ${[...new Set(beantwortet.map((f) => f.bereich))].map((b) => `<div class="label">${esc(bereiche[b])}</div><div class="gruppe">${beantwortet.filter((f) => f.bereich === b).map((f) =>
      `<${gesperrt ? "div" : "a"} class="zeile" ${gesperrt ? "" : `href="#chat/${esc(planung.id)}/${esc(f.id)}"`}><div class="haupt"><div class="titel">${esc(f.titel || f.frage)}</div><div class="neben">${esc(wert(f, antworten[f.id]))}</div></div><span class="daumen">${bild(f)}</span>${gesperrt ? "" : IKON.pfeil}</${gesperrt ? "div" : "a"}>`).join("")}</div>`).join("")}
    <div class="zwei"><a class="pill" href="${esc(serverUrl(`/api/planungen/${planung.id}/protokoll.pdf`))}" target="_blank" rel="noopener" data-pdf>Protokoll ansehen</a>${gesperrt ? "" : `<button class="pill" data-chat>Zum Ablauf</button>`}</div>
    <button class="pill" data-pdfsichern style="width:100%;margin-bottom:var(--gap)">PDF in Dateien sichern</button>
    <button class="pill" data-fotossichern style="width:100%;margin-bottom:var(--gap)">Alle Fotos aufs Handy</button>
    <button class="gross ok" data-senden ${e.fehlt.length && abschluss ? "disabled" : ""}>${IKON.wolke}${planung.status === "gesendet" ? "Erneut senden" : "In HERO speichern"}</button>`;

  $$("[data-chat]", el).forEach((b) => (b.onclick = () => (location.hash = "chat/" + id)));
  $("[data-zurueck]", el).onclick = () => zurueck("home");

  // Monteur-Kacheln: Höhe folgt dem Text, damit nichts innen scrollt. Bearbeiten nur über den Stift.
  const hoehe = (t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; };
  const kacheln = $$("[data-abschnitt]", el);
  kacheln.forEach(hoehe);
  addEventListener("resize", () => kacheln.forEach(hoehe), { signal });
  for (const t of kacheln) {
    t.addEventListener("input", () => hoehe(t));
    t.addEventListener("blur", () => { t.readOnly = true; $(`[data-bearbeiten="${t.dataset.abschnitt}"]`, el).setAttribute("aria-pressed", "false"); });
  }
  $$("[data-bearbeiten]", el).forEach((b) => (b.onclick = () => {
    const t = $(`[data-abschnitt="${b.dataset.bearbeiten}"]`, el);
    t.readOnly = false; b.setAttribute("aria-pressed", "true");
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  }));

  // Änderungen am Monteur-Text automatisch speichern (kurz verzögert).
  let timer, speichern = Promise.resolve();
  const sammeln = () => ({ monteure: Object.fromEntries(ABSCHNITTE.map(([k]) => [k, $(`[data-abschnitt="${k}"]`, el).value.split("\n").map((s) => s.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)])) });
  const status = (t) => { const s = $("#gespeichert", el); if (s) s.textContent = t; }; // weg, wenn die Seite schon gewechselt ist
  // Text sofort einsammeln: beim Seitenwechsel ist er danach nicht mehr da.
  // Ein Fehler bleibt beim Aufrufer (Senden bricht dann ab), hält aber die nächste Speicherung nicht auf.
  const jetztSpeichern = (body) => (speichern = speichern.catch(() => {}).then(async () => {
    if (zustand.demo || abschluss) return;
    body ??= sammeln();
    try { await api(`/api/planungen/${id}/ergebnis`, { methode: "PUT", body }); status("gespeichert"); if (!signal.aborted) pdfNeu(); }
    catch (err) { fehlerMelden(err); throw err; }
  }));
  el.addEventListener("input", () => { status("…"); clearTimeout(timer); timer = setTimeout(() => { timer = null; jetztSpeichern().catch(() => {}); }, 700); }, { signal });
  // Seite verlassen, bevor die Verzögerung abgelaufen ist: noch schnell speichern statt verlieren.
  signal.addEventListener("abort", () => { if (timer) { clearTimeout(timer); timer = null; jetztSpeichern().catch(() => {}); } });
  // PDF aufs Handy (Dateien-App), von dort lädt man es in HERO hoch. Die Datei wird vorab geladen, weil Safari
  // das Teilen nur direkt im Tipp erlaubt, nicht erst nach dem Warten auf den Server.
  const pdfName = `${abschluss ? "Abnahmeprotokoll " + antworten.bericht.wert : "Besichtigungsprotokoll"} ${String(antworten.kunde?.wert || antworten.ab_kunde?.wert || planung.projektTitel || "").replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 60)} ${new Date().toLocaleDateString("de-DE")}.pdf`;
  let pdfDatei = null, pdfLaden = null;
  const pdfHolen = () => (pdfLaden ??= fetch(serverUrl(`/api/planungen/${id}/protokoll.pdf`), { signal })
    .then((r) => { if (!r.ok) throw new Error("PDF konnte nicht erstellt werden"); return r.blob(); })
    .then((b) => (pdfDatei = new File([b], pdfName, { type: "application/pdf" })))
    .catch((err) => { pdfLaden = null; throw err; }));
  function pdfNeu() { pdfDatei = null; pdfLaden = null; if (!zustand.demo) pdfHolen().catch(() => {}); }
  pdfNeu();
  $("[data-pdfsichern]", el).addEventListener("click", async () => {
    if (zustand.demo) return toast("Demo, nicht verbunden. Kein PDF.", "fehler");
    if (timer) { clearTimeout(timer); timer = null; await jetztSpeichern().catch(() => {}); } // ungespeicherte Änderungen zuerst
    if (!pdfDatei) {
      toast("PDF wird vorbereitet …");
      try { await pdfHolen(); } catch (err) { return err.name === "AbortError" ? null : toast("Keine Verbindung zum Server, PDF gerade nicht verfügbar", "fehler"); }
    }
    try {
      if (navigator.canShare?.({ files: [pdfDatei] })) await navigator.share({ files: [pdfDatei] });
      else { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(pdfDatei), download: pdfDatei.name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000); }
    } catch (err) {
      if (err.name === "NotAllowedError") toast("PDF ist bereit, bitte noch einmal tippen", "ok");
      else if (err.name !== "AbortError") fehlerMelden(err);
    }
  });
  // Alle Fotos (bemalte Fassung, volle Größe) übers Teilen-Menü aufs Handy, z. B. „Bilder sichern“, um sie selbst in HERO hochzuladen.
  // Erster Tipp lädt (das dauert, Safari erlaubt das Teilen danach nicht mehr im selben Tipp), zweiter Tipp teilt.
  const fotoKnopf = $("[data-fotossichern]", el);
  const fotos = katalog.flatMap((f) => { let n = 0; return (antworten[f.id]?.dateien || []).filter((d) => d.art === "bild")
    .map((d) => ({ d, name: `${String(f.titel || f.frage).replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 50)} ${++n}.jpg` })); });
  let fotoDateien = null;
  if (!fotos.length) fotoKnopf.hidden = true;
  fotoKnopf.addEventListener("click", async () => {
    if (zustand.demo) return toast("Demo, nicht verbunden. Keine Fotos.", "fehler");
    if (!fotoDateien) {
      fotoKnopf.disabled = true; fotoKnopf.textContent = `Fotos werden geladen … (0 von ${fotos.length})`;
      try {
        const geladen = [];
        for (const { d, name } of fotos) {
          const r = await fetch(dateiUrl(planung.id, d.id, false, d.v), { signal, cache: "no-cache" });
          if (!r.ok) throw new Error("Foto fehlt auf dem Server");
          geladen.push(new File([await r.blob()], name, { type: "image/jpeg" }));
          fotoKnopf.textContent = `Fotos werden geladen … (${geladen.length} von ${fotos.length})`;
        }
        fotoDateien = geladen;
        fotoKnopf.textContent = `${fotos.length} Foto${fotos.length > 1 ? "s" : ""} bereit: jetzt sichern`;
        toast("Fotos bereit, bitte noch einmal tippen", "ok");
      } catch (err) {
        if (err.name !== "AbortError") toast("Keine Verbindung zum Server, Fotos gerade nicht verfügbar", "fehler");
        fotoKnopf.textContent = "Alle Fotos aufs Handy";
      }
      fotoKnopf.disabled = false;
      return;
    }
    try {
      if (navigator.canShare?.({ files: fotoDateien })) await navigator.share({ files: fotoDateien });
      else for (const f of fotoDateien) { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(f), download: f.name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000); }
    } catch (err) {
      if (err.name === "NotAllowedError") toast("Bitte noch einmal tippen", "ok");
      else if (err.name !== "AbortError") fehlerMelden(err);
    }
  });
  $("[data-pdf]", el).addEventListener("click", async (ev) => { clearTimeout(timer); ev.preventDefault(); const ziel = ev.currentTarget.href; await jetztSpeichern().catch(() => {}); window.open(ziel, "_blank", "noopener"); });

  // Gesendet wird auf dem Server im Hintergrund. Hier nur den Stand zeigen und nachladen, solange die Seite offen ist.
  const knopf = $("[data-senden]", el);
  let zuletzt = planung.senden?.status, warte = null;
  const zeigeStand = (s) => {
    if (!s) return;
    const r = s.ergebnis;
    const zeilen = s.status === "laeuft" ? [["Wird im Hintergrund gesendet …", "⏳"], ["Du kannst die App schließen, es läuft auf dem Server weiter.", ""]] : [
      r && [r.ziel.umgeleitet ? "Gespeichert im Testprojekt UNB-1149 (Testmodus)" : r.ziele?.length > 1 ? "Gespeichert in " + r.ziele.length + " Projekten" : "Gespeichert im Projekt", r.ziel.umgeleitet ? "" : (r.ziele || []).map((z) => z.nummer).filter(Boolean).join(", ")],
      r && [abschluss ? "Logbuch-Eintrag „Baustelle abgeschlossen“" : "Logbuch-Eintrag „Besichtigung durchgeführt“", "✓"],
      r?.hochgeladen && ["Protokoll und Fotos auf Google Drive", r.hochgeladen],
      r?.inHero && [abschluss ? "Fotos und Abnahmeprotokoll im HERO-Projekt" : "Fotos und Protokoll im HERO-Projekt", r.inHero],
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
