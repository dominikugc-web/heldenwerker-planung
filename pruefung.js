// Prüfansicht nach dem Zusammenfassen: Monteur-Text, Fotos, Protokoll-Felder bearbeiten, dann nach HERO.
import { api, dateiUrl, serverUrl, zustand } from "./api.js";
import { $, $$, esc, toast, fehlerMelden, IKON } from "./ui.js";

const ABSCHNITTE = [["wasWirdGemacht", "Was wird gemacht"], ["woKommtWasHin", "Wo kommt was hin"], ["achtung", "Achtung auf der Baustelle"],
  ["material", "Material und Besonderheiten"], ["offen", "Offene Punkte"]];

export async function pruefAnsicht(el, id, signal) {
  const [planung, meta] = await Promise.all([api("/api/planungen/" + id, { signal }), api("/api/protokoll-felder", { signal })]);
  if (!planung.ergebnis) { location.hash = "chat/" + id; return; }
  const e = planung.ergebnis;
  const fotos = planung.verlauf.flatMap((n) => n.dateien).filter((d) => d.art === "bild");
  const zuordnung = Object.fromEntries(e.fotos.map((f) => [f.dateiId, f.pflichtfoto]));
  const optionen = [...meta.pflichtfotos, "Weitere"];

  const feldHtml = (f) => {
    const w = e.felder[f.name] || "";
    const auswahl = f.art === "janein" ? ["ja", "nein"] : f.optionen;
    const eingabe = auswahl ? `<select data-feld="${f.name}"><option value="">nicht angegeben</option>${auswahl.map((o) => `<option ${o === w ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : `<input data-feld="${f.name}" value="${esc(w)}" autocomplete="off">`;
    return `<label class="feld"><span>${esc(f.label)}</span>${eingabe}</label>`;
  };
  const bereich = (nr) => {
    const felder = meta.felder.filter((f) => f.bereich === nr);
    const gefuellt = felder.filter((f) => e.felder[f.name]).length;
    return `<details class="bereich"><summary>${nr}. ${esc(meta.bereiche[nr - 1])}<span class="wert">${gefuellt} von ${felder.length}</span></summary>${felder.map(feldHtml).join("")}</details>`;
  };

  el.innerHTML = `<div class="kopf"><button class="pill rund" data-chat aria-label="Zurück zum Chat">${IKON.zurueck}</button><h1>Prüfen</h1><span class="muted small" id="gespeichert"></span></div>
    <p class="unter">${esc(planung.projektTitel)}<br>Aufgenommen von ${esc(planung.personName || planung.person)}</p>
    <div id="ergebnis"></div>
    ${e.fehlt.length ? `<div class="karte fehlt"><b>Es fehlen noch Fotos</b><p class="muted small" style="margin:6px 0 0">${e.fehlt.map(esc).join(", ")}</p></div>` : ""}
    <div class="label">Für die Monteure</div>
    <div class="gruppe">${ABSCHNITTE.map(([k, t]) => `<label class="feld abschnitt"><span>${t}</span><textarea data-abschnitt="${k}" rows="3" placeholder="Eine Zeile pro Punkt">${esc((e.monteure[k] || []).join("\n"))}</textarea></label>`).join("")}</div>
    <div class="label">Fotos (${fotos.length})</div>
    ${fotos.length ? `<div class="karte"><div class="fotoraster">${fotos.map((f) => `<figure><img src="${esc(dateiUrl(planung.id, f.id))}" alt="${esc(f.name)}" loading="lazy"><select data-foto="${f.id}" aria-label="Pflichtfoto für ${esc(f.name)}">${optionen.map((o) => `<option ${o === (zuordnung[f.id] || "Weitere") ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></figure>`).join("")}</div></div>` : `<div class="gruppe"><div class="leer">Keine Fotos im Chat.</div></div>`}
    <div class="label">Besichtigungsprotokoll</div>
    <div class="gruppe">${[1, 2, 3, 4, 5, 6, 7].map(bereich).join("")}</div>
    <div class="zwei"><a class="pill" href="${esc(serverUrl(`/api/planungen/${planung.id}/protokoll.pdf`))}" target="_blank" rel="noopener" data-pdf>Protokoll ansehen</a><button class="pill" data-chat>Zurück zum Chat</button></div>
    <button class="gross ok" data-senden>${IKON.wolke}${planung.status === "gesendet" ? "Erneut senden" : "In HERO speichern"}</button>`;

  $$("[data-chat]", el).forEach((b) => (b.onclick = () => (location.hash = "chat/" + id)));

  // Änderungen automatisch speichern (kurz verzögert).
  let timer, speichern = Promise.resolve();
  const sammeln = () => ({
    monteure: Object.fromEntries(ABSCHNITTE.map(([k]) => [k, $(`[data-abschnitt="${k}"]`, el).value.split("\n").map((s) => s.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean)])),
    felder: Object.fromEntries($$("[data-feld]", el).map((x) => [x.dataset.feld, x.value.trim()])),
    fotos: $$("[data-foto]", el).map((x) => ({ dateiId: x.dataset.foto, pflichtfoto: x.value })),
  });
  const jetztSpeichern = () => (speichern = speichern.then(async () => {
    if (zustand.demo) return;
    try { await api(`/api/planungen/${id}/ergebnis`, { methode: "PUT", body: sammeln() }); $("#gespeichert", el).textContent = "gespeichert"; }
    catch (err) { fehlerMelden(err); throw err; }
  }));
  el.addEventListener("input", () => { $("#gespeichert", el).textContent = "…"; clearTimeout(timer); timer = setTimeout(jetztSpeichern, 700); });
  el.addEventListener("change", (ev) => { if (ev.target.matches("select")) { clearTimeout(timer); jetztSpeichern(); } });
  $("[data-pdf]", el).addEventListener("click", async (ev) => { clearTimeout(timer); ev.preventDefault(); const ziel = ev.currentTarget.href; await jetztSpeichern().catch(() => {}); window.open(ziel, "_blank", "noopener"); });

  const zeigeErgebnis = (r) => {
    const zeilen = [
      [r.ziel.umgeleitet ? "Gespeichert im Testprojekt UNB-1149 (Testmodus)" : "Gespeichert im Projekt", ""],
      ["Logbuch-Eintrag für die Monteure", "✓"],
      r.hochgeladen ? ["Dateien hochgeladen", r.hochgeladen] : null,
      r.offen ? ["Fotos und Protokoll folgen", r.offen + " offen"] : null,
      ...r.fehler.map((f) => ["Fehler", f]),
    ].filter(Boolean);
    $("#ergebnis", el).innerHTML = `<div class="gruppe ergebnis">${zeilen.map(([a, b]) => `<div class="zeile"><div class="haupt">${esc(a)}</div><span class="wert">${esc(b)}</span></div>`).join("")}</div>`;
  };

  $("[data-senden]", el).onclick = async (ev) => {
    const knopf = ev.currentTarget;
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    knopf.disabled = true; const vorher = knopf.innerHTML; knopf.textContent = "Wird gesendet …";
    try {
      clearTimeout(timer); await jetztSpeichern();
      const r = await api(`/api/planungen/${id}/abschliessen`, { methode: "POST", body: {} });
      zeigeErgebnis(r);
      el.scrollTo({ top: 0, behavior: "smooth" });
      toast(r.fehler.length ? "Teilweise gesendet, bitte erneut senden" : "In HERO gespeichert", r.fehler.length ? "fehler" : "ok");
      knopf.innerHTML = IKON.wolke + (r.fehler.length ? "Fehlende erneut senden" : "Erneut senden");
    } catch (err) { fehlerMelden(err); knopf.innerHTML = vorher; }
    finally { knopf.disabled = false; }
  };
}
