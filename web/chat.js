// Plus-Sheet (neues oder vorhandenes Projekt) und der Planungs-Chat als fester Ablauf.
import { api, dateiUrl, zustand, bericht, merken } from "./api.js";
import { ablage, antwortAnwenden, istZahl } from "./lokal.js";
import { einreihen, abarbeiten, offeneAntworten, dateiBlob, anzahl } from "./ausgang.js";
import { $, $$, esc, toast, fehlerMelden, sheet, IKON } from "./ui.js";
import { zeichnen } from "./zeichnen.js";

const gehe = (ziel) => (location.hash = ziel);

// ---------- Plus ----------
export function plusSheet() {
  const d = sheet(`<div class="sheetkopf"><span></span><h2>Neue Besichtigung</h2><button class="pill" data-zu>Abbrechen</button></div>
    <div class="zwei">
      <button class="kachel" data-neu><span class="ikon">${IKON.plus}</span><b>Neues Projekt</b><span>Kunde ist noch nicht in HERO</span></button>
      <button class="kachel" data-alt><span class="ikon">${IKON.ordner}</span><b>Vorhandenes Projekt</b><span>Aus HERO auswählen</span></button>
    </div>`);
  $("[data-zu]", d).onclick = () => d.close();
  $("[data-neu]", d).onclick = () => { d.close(); neuesProjektSheet(); };
  $("[data-alt]", d).onclick = () => { d.close(); projektWaehlenSheet(); };
}

function neuesProjektSheet() {
  const feld = (name, label, attr = "") => `<label class="feld"><span>${label}</span><input name="${name}" ${attr}></label>`;
  const d = sheet(`<form><div class="sheetkopf"><button type="button" class="pill" data-zu>Abbrechen</button><h2>Neues Projekt</h2><span></span></div>
    <div class="banner">Wird in HERO mit „TEST“ vor dem Namen angelegt.</div>
    <div class="gruppe">${feld("vorname", "Vorname", 'autocomplete="off"')}${feld("nachname", "Nachname", 'autocomplete="off"')}${feld("firma", "Firma (optional)", 'autocomplete="off"')}</div>
    <div class="gruppe">${feld("strasse", "Straße und Nr.", 'autocomplete="off"')}<div class="zwei" style="margin:0">${feld("plz", "PLZ", 'inputmode="numeric" autocomplete="off"')}${feld("ort", "Ort", 'autocomplete="off"')}</div>${feld("telefon", "Telefon", 'type="tel" autocomplete="off"')}${feld("email", "E-Mail", 'type="email" autocomplete="off"')}</div>
    <div class="gruppe">${feld("titel", "Worum geht es?", 'placeholder="z. B. PV 9,9 kWp mit Speicher" required')}</div>
    <button class="gross">Anlegen und starten</button></form>`);
  $("[data-zu]", d).onclick = () => d.close();
  $("form", d).onsubmit = async (e) => {
    e.preventDefault();
    const daten = Object.fromEntries(new FormData(e.target));
    if (!daten.nachname.trim() && !daten.firma.trim()) return toast("Bitte Nachname oder Firma eintragen", "fehler");
    const knopf = $(".gross", d); knopf.disabled = true; knopf.textContent = "Wird in HERO angelegt …";
    try { const p = await api("/api/projekte", { methode: "POST", body: daten }); d.close(); await planungStarten(p); }
    catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.textContent = "Anlegen und starten"; }
  };
}

function projektWaehlenSheet() {
  const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Projekt wählen</h2><span></span></div>
    <label class="suche">${IKON.suche}<input type="search" placeholder="Kunde, Adresse oder Projekt-Nr." aria-label="Projekt suchen" enterkeyhint="search"></label>
    <div class="gruppe" id="treffer"><div class="leer">Lädt …</div></div>`);
  $("[data-zu]", d).onclick = () => d.close();
  const eingabe = $("input", d), liste = $("#treffer", d);
  let laufend, timer, treffer = [];
  async function suchen() {
    laufend?.abort(); laufend = new AbortController();
    try {
      treffer = await api(`/api/projekte?suche=${encodeURIComponent(eingabe.value.trim())}`, { signal: laufend.signal });
      liste.innerHTML = treffer.length ? treffer.map((p, i) => `<button class="zeile" data-i="${i}"><div class="haupt"><div class="titel">${esc(p.kunde || p.titel)}</div><div class="neben">${esc(p.nummer)} · ${esc(p.adresse || "ohne Adresse")}</div></div><span class="pfeil">${IKON.pfeil}</span></button>`).join("") : `<div class="leer">Nichts gefunden.</div>`;
    } catch (e) { fehlerMelden(e); }
  }
  eingabe.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(suchen, 300); });
  liste.addEventListener("click", async (e) => { const b = e.target.closest("[data-i]"); if (!b) return; d.close(); await planungStarten(treffer[b.dataset.i]); });
  suchen();
  setTimeout(() => eingabe.focus(), 250);
}

export async function planungStarten(p) {
  try {
    const titel = [p.nummer, p.kunde, p.adresse].filter(Boolean).join(", ");
    const pl = await api("/api/planungen", { methode: "POST", body: { projektId: p.id, projektTitel: titel, kunde: p.kunde, adresse: p.adresse, nummer: p.nummer } });
    gehe("chat/" + pl.id);
  } catch (e) { fehlerMelden(e); }
}

// ---------- Bilder vorbereiten ----------
async function ladeBild(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image(); img.src = url;
  try { await img.decode(); return img; } finally { URL.revokeObjectURL(url); }
}
// <img> berücksichtigt die Drehung aus den Kameradaten, daher über ein Bild statt direkt über createImageBitmap.
export async function verkleinern(blob, max, qualitaet) {
  const img = await ladeBild(blob);
  const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * f), height: Math.round(img.naturalHeight * f) });
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", qualitaet));
}
export const bildVorbereiten = async (file) => ({ gross: await verkleinern(file, 4000, 0.85), klein: await verkleinern(file, 1600, 0.8) });

const artVon = (file) => (file.type.startsWith("image/") ? "bild" : file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "pdf" : null);
const neueId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 16);


// ---------- Fester Ablauf (Planungs-Chat) ----------
// Die App stellt die Fragen aus dem Katalog der Reihe nach. Antworten per Knopf, Liste oder Eingabe, jede Frage
// kann übersprungen und später geändert werden. Fotos, Videos und Sprachnotizen hängen an der jeweiligen Frage.
let katalogCache = null;
const ladeKatalog = async () => (katalogCache ??= await api("/api/fragen"));

// Gleiche Regeln wie auf dem Server (server/fragen.mjs): Typ blendet Bereiche aus, Folgefragen nur bei passender Antwort.
const TYPEN = { pv: "PV", wp: "Wärmepumpe", klima: "Klimaanlage" };
function sichtbar(fragen, antworten) {
  const w = antworten.typ?.wert || "", gewaehlt = w === "Beides" ? ["PV", "Wärmepumpe"] : w.split(",").map((t) => t.trim()).filter(Boolean);
  if (!gewaehlt.length) return [fragen[0]];
  return fragen.filter((f) => (!f.nur || gewaehlt.includes(TYPEN[f.nur])) && (!f.wenn || [].concat(f.wenn.ist).includes(antworten[f.wenn.frage]?.wert)));
}
const erledigt = (a) => a && (a.uebersprungen || (a.wert ?? "") !== "" || a.dateien?.length);
const mitEinheit = (f, w) => (f.einheit && w ? (f.einheit.startsWith("°") ? w + f.einheit : `${w} ${f.einheit}`) : w);

export async function chatAnsicht(el, id) {
  const { katalog: fragen, bereiche } = await ladeKatalog();
  let planung = await api("/api/planungen/" + id);
  // Antworten, die noch im Ausgang auf dem Gerät liegen, über den (älteren) Stand vom Server legen.
  for (const op of await offeneAntworten(id).catch(() => [])) {
    const f = fragen.find((x) => x.id === op.frage);
    if (f) planung.antworten = antwortAnwenden(planung.antworten || {}, f, op.body, op.meta);
  }
  // Fotos, die noch nicht hochgeladen sind, vom Gerät anzeigen.
  const lokaleUrl = new Map();
  for (const d of Object.values(planung.antworten || {}).flatMap((a) => a.dateien || [])) {
    const b = await ablage.get("bild:" + d.id).catch(() => null);
    if (b) lokaleUrl.set(d.id, URL.createObjectURL(b.blob));
  }
  const bildSrc = (d) => lokaleUrl.get(d.id) || dateiUrl(planung.id, d.id, true, d.v);
  let bearbeite = decodeURIComponent(location.hash.split("/")[2] || "") || null; // #chat/<id>/<frage> springt zum Ändern
  if (bearbeite) history.replaceState(null, "", "#chat/" + id); // Neu laden soll nicht wieder zur Frage springen
  const antworten = () => planung.antworten || {};

  el.innerHTML = `<div class="chatseite">
    <div class="chatkopf"><button class="pill rund" data-zurueck aria-label="Zurück">${IKON.zurueck}</button>
      <div class="haupt"><div class="titel">${esc(antworten().kunde?.wert || planung.projektTitel)}</div><div class="neben" id="stand"></div><div class="sync" id="sync" role="status" hidden></div></div>
      <button class="pill" data-uebersicht>Übersicht</button></div>
    <div class="fortschritt" aria-hidden="true"><span id="balken"></span></div>
    <div class="verlauf" id="verlauf" aria-live="polite"></div>
    <div class="steuerung" id="steuerung"></div>
    <input type="file" id="kamera" accept="image/*" capture="environment" hidden>
    <input type="file" id="galerie" accept="image/*,video/*,application/pdf" multiple hidden>
    <input id="halter" class="halter" aria-hidden="true" tabindex="-1" autocomplete="off">
  </div>`;
  const verlauf = $("#verlauf", el), steuerung = $("#steuerung", el);
  $("[data-zurueck]", el).onclick = () => gehe("home");
  $("[data-uebersicht]", el).onclick = uebersicht;
  // Tastatur geht auf (oder die Eingabe wächst): Verlauf wird kleiner, also um genau so viel mit nach oben schieben.
  let verlaufH = 0;
  const anheften = () => { const h = verlauf.clientHeight, d = verlaufH - h; verlaufH = h; if (d > 0) verlauf.scrollTop += d; };
  new ResizeObserver(anheften).observe(verlauf);
  const vv = window.visualViewport;
  const beiTastatur = () => (verlauf.isConnected ? anheften() : vv.removeEventListener("resize", beiTastatur));
  vv?.addEventListener("resize", beiTastatur); // nach sichtbarerBereich() in app.js, die Höhe ist dann schon gesetzt

  // Ausgang: zeigen, was noch hochgeladen wird; Stand vom Server übernehmen, sobald für diese Planung alles oben ist.
  const syncZeigen = (offen) => {
    const s = $("#sync", el);
    s.hidden = !offen;
    s.textContent = zustand.offline ? `☁ Offline gespeichert · ${offen} warten auf Netz` : `☁ Lädt hoch … ${offen} offen`;
  };
  const beiAusgang = ({ detail: d }) => {
    if (!el.isConnected || !$("#verlauf", el)) return removeEventListener("ausgang", beiAusgang);
    syncZeigen(d.offen);
    if (d.abgelehnt) toast("Nicht gespeichert: " + d.abgelehnt, "fehler");
    if (d.planungId === planung.id && d.antworten) { planung.antworten = d.antworten; merken("/api/planungen/" + planung.id, planung); zeichne(true); }
    if (d.offen === 0 && d.planungId === planung.id) toast("Alles hochgeladen", "ok");
  };
  addEventListener("ausgang", beiAusgang);
  anzahl().then((n) => { syncZeigen(n); if (n) abarbeiten(); }).catch(() => {});

  const aktuelleFrage = () => (bearbeite && fragen.find((f) => f.id === bearbeite)) || sichtbar(fragen, antworten()).find((f) => !erledigt(antworten()[f.id])) || null;

  function zeichne(nurVerlauf = false) {
    const scrollVorher = verlauf.scrollTop;
    const liste = sichtbar(fragen, antworten()), akt = aktuelleFrage();
    const fertig = liste.filter((f) => erledigt(antworten()[f.id])).length;
    $("#balken", el).style.width = Math.round((fertig / Math.max(liste.length, 1)) * 100) + "%";
    $("#stand", el).textContent = akt ? `${bereiche[akt.bereich]} · ${fertig} von ${liste.length}` : `Alles erfasst · ${fertig} von ${liste.length}`;
    // Verlauf: erledigte Fragen bis zur nächsten offenen, dazu die aktuelle an ihrer Stelle. Spätere, schon vorausgefüllte
    // Antworten (Lieferschein) kommen erst, wenn man dort ankommt; sonst stünden sie unter der aktuellen Frage.
    const offen = liste.findIndex((f) => !erledigt(antworten()[f.id])), grenze = offen < 0 ? Infinity : offen;
    verlauf.innerHTML = liste.filter((f, i) => (erledigt(antworten()[f.id]) && i <= grenze) || f === akt).map((f) => {
      const a = antworten()[f.id];
      const frage = `<div class="blase claude frageblase${f === akt ? " aktiv" : ""}" id="f-${f.id}">${f.pflicht ? "📷 " : ""}${esc(f.frage)}${f === akt && bearbeite ? '<span class="badge orange">wird geändert</span>' : ""}</div>`;
      if (!erledigt(a) || f === akt && bearbeite) return frage + (f === akt && a ? antwortHtml(f, a) : "");
      return frage + antwortHtml(f, a);
    }).join("") || "";
    if (!akt) verlauf.insertAdjacentHTML("beforeend", `<div class="blase claude">Alles erfasst. Tipp auf „Zusammenfassen“, dann schreibt Claude den Text für die Monteure und du prüfst alles vor dem Speichern.</div>`);
    // Stand vom Server im Hintergrund: Eingabe nicht anfassen (Tastatur, getippter Text), Scrollposition halten.
    if (nurVerlauf) { verlauf.scrollTop = scrollVorher; return; }
    steuerungZeichnen(akt);
    requestAnimationFrame(() => { const z = akt && $("#f-" + akt.id, el); (bearbeite && z) ? z.scrollIntoView({ block: "center" }) : (verlauf.scrollTop = verlauf.scrollHeight); });
  }

  function antwortHtml(f, a) {
    const teile = [];
    if (a.uebersprungen) teile.push(`<span class="muted">übersprungen</span>`);
    else if (a.wert) teile.push(esc(mitEinheit(f, a.wert)));
    const bilder = (a.dateien || []).filter((d) => d.art === "bild"), andere = (a.dateien || []).filter((d) => d.art !== "bild");
    if (bilder.length) teile.push(`<span class="daumen">${bilder.map((d) => `<img src="${esc(bildSrc(d))}" alt="" loading="lazy">`).join("")}</span>`);
    for (const d of andere) teile.push(d.art === "audio" ? `<span class="klein">🎙 ${esc(d.text || "Sprachnotiz")}</span>` : `<span class="klein">${d.art === "video" ? "🎬" : "📄"} ${esc(d.name)}</span>`);
    if (a.notiz) teile.push(`<span class="klein">✎ ${esc(a.notiz)}</span>`);
    if (a.quelle) teile.push(`<span class="quelle">📄 aus ${esc(a.quelle)}, bitte prüfen</span>`);
    return `<button class="blase planer antwortblase" data-bearbeite="${f.id}" aria-label="${esc(f.frage)} ändern">${teile.join("") || "<span class='muted'>leer</span>"}</button>`;
  }
  verlauf.addEventListener("click", (e) => { const b = e.target.closest("[data-bearbeite]"); if (b) { bearbeite = b.dataset.bearbeite; zeichne(); } });

  // ---------- Eingabe für die aktuelle Frage ----------
  function steuerungZeichnen(f) {
    if (!f) {
      steuerung.innerHTML = `<button class="gross" data-zusammen>${IKON.haken}Zusammenfassen und prüfen</button>`;
      $("[data-zusammen]", steuerung).onclick = zusammenfassen;
      return;
    }
    const a = antworten()[f.id] || {};
    let eingabe = "";
    if (f.art === "janein") eingabe = `<div class="knoepfe zwei">${["Ja", "Nein"].map((o) => `<button class="wahl${a.wert === o.toLowerCase() ? " gewaehlt" : ""}" data-wert="${o}">${o}</button>`).join("")}</div>`;
    else if (f.art === "auswahl") eingabe = `<div class="knoepfe">${f.optionen.map((o) => `<button class="wahl${a.wert === o ? " gewaehlt" : ""}" data-wert="${esc(o)}">${esc(o)}</button>`).join("")}</div>`;
    else if (f.art === "mehrfach") {
      const an = (a.wert || "").split(",").map((t) => t.trim());
      eingabe = `<div class="knoepfe">${f.optionen.map((o) => `<button class="wahl${an.includes(o) ? " gewaehlt" : ""}" data-mehr="${esc(o)}" aria-pressed="${an.includes(o)}">${esc(o)}</button>`).join("")}</div>
        <button class="wahl gewaehlt" data-mehrweiter>Weiter</button>`;
    }
    else if (f.art === "liste") eingabe = `<div class="feldzeile"><select id="wert" aria-label="${esc(f.frage)}"><option value="">Bitte wählen …</option>${f.optionen.map((o) => `<option ${a.wert === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select><button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    else if (f.art === "zahl") eingabe = `<div class="feldzeile"><input id="wert" inputmode="decimal" enterkeyhint="next" value="${esc(a.wert || "")}" placeholder="Zahl" aria-label="${esc(f.frage)}">${f.einheit ? `<span class="einheit">${esc(f.einheit)}</span>` : ""}<button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    else if (f.art === "text") eingabe = `<div class="feldzeile"><textarea id="wert" rows="1" enterkeyhint="next" placeholder="Antwort …" aria-label="${esc(f.frage)}">${esc(a.wert || "")}</textarea><button class="rundknopf diktat" data-diktat hidden aria-label="Diktieren">${IKON.mikro}</button><button class="sendbtn" data-weiter aria-label="Weiter">${IKON.senden}</button></div>`;
    const bilder = (a.dateien || []).filter((d) => d.art === "bild");
    if (f.art === "foto") eingabe = `<div class="knoepfe zwei"><button class="wahl" data-kamera>${IKON.kamera} Kamera</button><button class="wahl" data-galerie>Aus Galerie</button></div>
        ${bilder.length ? `<button class="wahl gewaehlt" data-fertig>Weiter</button>` : ""}`;
    // Alle Fotos dieser Frage antippen zum Bemalen und Beschriften, egal welche Frage.
    const vorschau = bilder.length ? `<div class="vorschau">${bilder.map((d) => `<button class="anhang" data-malen="${d.id}" aria-label="Foto bemalen oder beschriften"><img src="${esc(bildSrc(d))}" alt=""><span class="art">Bemalen</span></button>`).join("")}</div>` : "";
    steuerung.innerHTML = `${vorschau}${eingabe}
      <div class="zusatz">
        <button class="rundknopf" data-anhang aria-label="Foto, Video oder PDF anhängen">${IKON.bueroklammer}</button>
        <button class="rundknopf" data-sprache aria-label="Sprachnotiz aufnehmen">${IKON.mikro}</button>
        <button class="pill notizknopf" data-notiz aria-label="Notiz für die Monteure schreiben">✎ Notiz</button>
        <span class="platz"></span>
        ${bearbeite ? `<button class="pill" data-zurueckzumablauf>Fertig</button>` : ""}
        <button class="pill" data-ueberspringen>Überspringen</button>
      </div>`;
    const feld = $("#wert", steuerung);
    $$("[data-wert]", steuerung).forEach((b) => (b.onclick = () => speichern(f, { wert: b.dataset.wert })));
    // Mehrfachauswahl: antippen schaltet an und aus, „Weiter“ speichert alle gewählten zusammen.
    $$("[data-mehr]", steuerung).forEach((b) => (b.onclick = () => { const an = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", an); b.classList.toggle("gewaehlt", an); }));
    $("[data-mehrweiter]", steuerung)?.addEventListener("click", () => {
      const wahl = $$('[data-mehr][aria-pressed="true"]', steuerung).map((b) => b.dataset.mehr);
      wahl.length ? speichern(f, { wert: wahl.join(", ") }) : toast("Bitte mindestens einen Punkt wählen oder überspringen", "fehler");
    });
    // Der Senden-Knopf nimmt dem Feld den Fokus nicht weg, sonst geht am Handy die Tastatur zu.
    const weiter = $("[data-weiter]", steuerung);
    const absenden = () => feld.value.trim() ? speichern(f, { wert: feld.value }) : toast("Bitte etwas eintragen oder überspringen", "fehler");
    weiter?.addEventListener("pointerdown", (e) => e.preventDefault());
    // iPhone: Beim Tippen auf den Knopf verliert das Feld sonst den Fokus (Tastatur zu), noch bevor click kommt.
    // preventDefault auf touchend verhindert den Fokuswechsel und den nachgeschobenen Klick; gesendet wird hier.
    weiter?.addEventListener("touchend", (e) => { e.preventDefault(); absenden(); });
    weiter?.addEventListener("click", absenden);
    feld?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && f.art !== "text") { e.preventDefault(); $("[data-weiter]", steuerung).click(); } });
    if (f.art === "text") { feld.style.height = "auto"; feld.addEventListener("input", () => { feld.style.height = "auto"; feld.style.height = Math.min(feld.scrollHeight, 140) + "px"; }); diktieren(feld, $("[data-diktat]", steuerung)); }
    if (feld && matchMedia("(pointer: fine)").matches) feld.focus();
    $("[data-kamera]", steuerung)?.addEventListener("click", () => $("#kamera", el).click());
    $("[data-galerie]", steuerung)?.addEventListener("click", () => $("#galerie", el).click());
    $("[data-fertig]", steuerung)?.addEventListener("click", () => { bearbeite = null; zeichne(); });
    $$("[data-malen]", steuerung).forEach((b) => (b.onclick = () => malen(f, b.dataset.malen)));
    $("[data-anhang]", steuerung).onclick = () => $("#galerie", el).click();
    $("[data-sprache]", steuerung).onclick = () => sprachnotiz(f);
    $("[data-notiz]", steuerung).onclick = () => notizSheet(f);
    $("[data-ueberspringen]", steuerung).onclick = () => speichern(f, { uebersprungen: true });
    $("[data-zurueckzumablauf]", steuerung)?.addEventListener("click", () => { bearbeite = null; zeichne(); });
  }

  // Antwort sofort auf dem Gerät eintragen und in den Ausgang legen; hochgeladen wird, sobald Netz da ist.
  async function speichern(f, body, meta = {}) {
    if (zustand.demo) return toast("Demo, nicht verbunden. Hier wird nichts gespeichert.", "fehler");
    if (f.art === "zahl" && body.wert && !istZahl(body.wert)) return toast("Bitte eine Zahl eintragen", "fehler");
    // Tastatur offen: Fokus solange auf ein verstecktes Feld parken, das beim Neuzeichnen bleibt, dann ans nächste Feld geben.
    const halter = $("#halter", el), tastatur = steuerung.contains(document.activeElement) && document.activeElement.matches("input, textarea");
    if (tastatur) halter.focus({ preventScroll: true });
    // Erst anzeigen und das nächste Feld fokussieren, dann speichern: Das iPhone lässt die Tastatur nur offen,
    // wenn der Fokus noch im selben Tipp wechselt (nicht erst nach einem await).
    const vorher = { antworten: planung.antworten, bearbeite };
    planung.antworten = antwortAnwenden(antworten(), f, body, meta);
    // Nach einer Antwort geht es zur nächsten Frage; nach Datei oder Notiz bleibt die Frage offen (weitere Fotos, Antwort fehlt noch).
    bearbeite = "wert" in body || "uebersprungen" in body ? null : f.id;
    zeichne();
    if (tastatur) { const neu = $("input#wert, textarea#wert", steuerung); neu ? neu.focus({ preventScroll: true }) : halter.blur(); }
    try {
      await einreihen({ planungId: planung.id, art: "antwort", pfad: `/api/planungen/${planung.id}/antworten/${f.id}`, body, frage: f.id, meta });
      merken("/api/planungen/" + planung.id, planung);
      abarbeiten();
    } catch (e) {
      planung.antworten = vorher.antworten; bearbeite = vorher.bearbeite; zeichne();
      bericht("antwort", e); toast("Konnte auf dem Gerät nicht speichern: " + (e.message || e), "fehler");
    }
  }

  // ---------- Dateien an der aktuellen Frage ----------
  const dateienVon = (f) => (antworten()[f.id]?.dateien || []).map((d) => ({ id: d.id }));
  // Datei in den Ausgang legen (Fotos groß und klein); das kleine Foto bleibt bis zum Hochladen auf dem Gerät zum Anzeigen.
  async function dateiEinreihen(dateiId, name, art, blob, klein, v) {
    const pfad = `/api/planungen/${planung.id}/dateien/${dateiId}?name=${encodeURIComponent(name)}&art=${art}&klein=${klein ? 1 : 0}`;
    await einreihen({ planungId: planung.id, art: "datei", pfad, blob, dateiId, klein, v });
    if (klein) {
      await ablage.set("bild:" + dateiId, { v, blob });
      if (lokaleUrl.has(dateiId)) URL.revokeObjectURL(lokaleUrl.get(dateiId));
      lokaleUrl.set(dateiId, URL.createObjectURL(blob));
    }
  }
  async function hochladenUndAnhaengen(f, files) {
    const neu = [], meta = {};
    for (const file of files) {
      const art = file.type.startsWith("audio/") ? "audio" : artVon(file);
      if (!art) { toast(`${file.name}: nur Fotos, Videos, PDFs`, "fehler"); continue; }
      const idNeu = neueId(), name = art === "bild" ? (file.name || "Foto").replace(/\.\w+$/, "") + ".jpg" : file.name, v = Date.now();
      if (art === "bild") { const { gross, klein } = await bildVorbereiten(file); await dateiEinreihen(idNeu, name, art, gross, false, v); await dateiEinreihen(idNeu, name, art, klein, true, v); }
      else await dateiEinreihen(idNeu, name, art, file, false, v);
      meta[idNeu] = { id: idNeu, name, art, groesse: file.size, v };
      neu.push({ id: idNeu });
    }
    if (neu.length) { await speichern(f, { dateien: [...dateienVon(f), ...neu] }, meta); toast(neu.length === 1 ? "Gespeichert" : `${neu.length} Dateien gespeichert`, "ok"); }
  }
  for (const eingang of ["#kamera", "#galerie"]) $(eingang, el).addEventListener("change", async (e) => {
    const f = aktuelleFrage(), files = [...e.target.files];
    e.target.value = "";
    if (!f || !files.length) return;
    try { await hochladenUndAnhaengen(f, files); } catch (err) { bericht("hochladen", err); fehlerMelden(err); }
  });

  async function malen(f, dateiId) {
    try {
      const d = (antworten()[f.id]?.dateien || []).find((x) => x.id === dateiId);
      // Immer die aktuelle, schon bemalte Fassung: erst die noch nicht hochgeladene, dann vom Server, ohne Netz die kleine vom Gerät.
      let blob = await dateiBlob(dateiId);
      if (!blob) {
        try { const r = await fetch(dateiUrl(planung.id, dateiId, false, d?.v), { cache: "no-cache" }); if (r.ok) blob = await r.blob(); } catch { /* kein Netz */ }
      }
      blob ??= (await ablage.get("bild:" + dateiId).catch(() => null))?.blob;
      if (!blob) return toast("Das Foto ist ohne Netz nicht auf diesem Gerät", "fehler");
      const neu = await zeichnen(blob);
      if (!neu) return;
      const v = Date.now(), name = d?.name || "Foto.jpg";
      await dateiEinreihen(dateiId, name, "bild", neu, false, v);
      await dateiEinreihen(dateiId, name, "bild", await verkleinern(neu, 1600, 0.8), true, v);
      await speichern(f, { dateien: dateienVon(f) }, { [dateiId]: { v, groesse: neu.size } });
      toast("Zeichnung gespeichert", "ok");
    } catch (e) { bericht("malen", e); fehlerMelden(e); }
  }

  function notizSheet(f) {
    const d = sheet(`<div class="sheetkopf"><button class="pill" data-zu>Abbrechen</button><h2>Notiz</h2><button class="pill akzent" data-ok>Speichern</button></div>
      <p class="muted small">${esc(f.frage)}</p><textarea rows="5" placeholder="Was die Monteure dazu wissen müssen …">${esc(antworten()[f.id]?.notiz || "")}</textarea>`);
    $("[data-zu]", d).onclick = () => d.close();
    $("[data-ok]", d).onclick = async () => { await speichern(f, { notiz: $("textarea", d).value }); d.close(); };
    setTimeout(() => $("textarea", d).focus(), 200);
  }

  // Sprachnotiz: Aufnahme an die Frage hängen, Whisper auf dem Server macht Text daraus.
  async function sprachnotiz(f) {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Aufnehmen geht in diesem Browser nicht", "fehler");
    let strom;
    try { strom = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { bericht("aufnahme-start", e); return toast("Mikrofon ist nicht erlaubt. In den Einstellungen freigeben.", "fehler"); }
    try {
      const typ = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(strom, typ ? { mimeType: typ } : {});
      const teile = [];
      rec.ondataavailable = (e) => e.data.size && teile.push(e.data);
      const start = Date.now();
      steuerung.innerHTML = `<div class="aufnahmeanzeige" role="status"><span class="rotpunkt" aria-hidden="true"></span><span id="zeit">0:00</span></div>
        <div class="knoepfe zwei"><button class="wahl" data-weg>Verwerfen</button><button class="wahl gewaehlt" data-stopp>Fertig</button></div>`;
      const uhr = setInterval(() => { const s = Math.floor((Date.now() - start) / 1000); const z = $("#zeit", steuerung); if (z) z.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 250);
      let verwerfen = false;
      rec.onstop = async () => {
        clearInterval(uhr); strom.getTracks().forEach((t) => t.stop());
        if (verwerfen) return zeichne();
        if (!teile.length) { bericht("aufnahme-ende", "keine Audiodaten"); toast("Die Aufnahme war leer", "fehler"); return zeichne(); }
        const mime = rec.mimeType || typ || "audio/webm";
        const file = new File(teile, `Sprachnotiz ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }).replace(":", "-")}.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime });
        try { toast("Sprachnotiz wird umgewandelt …"); await hochladenUndAnhaengen(f, [file]); } catch (e) { bericht("sprachnotiz", e); fehlerMelden(e); zeichne(); }
      };
      rec.onerror = (e) => bericht("aufnahme", e.error || e);
      $("[data-stopp]", steuerung).onclick = () => rec.stop();
      $("[data-weg]", steuerung).onclick = () => { verwerfen = true; rec.stop(); };
      rec.start(1000);
    } catch (e) { strom.getTracks().forEach((t) => t.stop()); bericht("aufnahme-start", e); toast("Aufnahme klappt nicht: " + (e.message || e), "fehler"); zeichne(); }
  }

  function uebersicht() {
    const liste = sichtbar(fragen, antworten());
    const gruppen = [...new Set(liste.map((f) => f.bereich))];
    const d = sheet(`<div class="sheetkopf"><span></span><h2>Übersicht</h2><button class="pill" data-zu>Schließen</button></div>
      ${gruppen.map((b) => `<div class="label">${esc(bereiche[b])}</div><div class="gruppe">${liste.filter((f) => f.bereich === b).map((f) => {
        const a = antworten()[f.id], status = !erledigt(a) ? ["offen", ""] : a.uebersprungen ? ["übersprungen", "orange"] : ["✓", "gruen"];
        const kurz = a?.wert ? mitEinheit(f, a.wert) : a?.dateien?.length ? `${a.dateien.length} Datei(en)` : "";
        return `<button class="zeile" data-springe="${f.id}"><div class="haupt"><div class="titel">${esc(f.frage)}</div>${kurz ? `<div class="neben">${esc(kurz)}</div>` : ""}</div><span class="badge ${status[1]}">${status[0]}</span></button>`;
      }).join("")}</div>`).join("")}`);
    $("[data-zu]", d).onclick = () => d.close();
    $$("[data-springe]", d).forEach((b) => (b.onclick = () => { bearbeite = b.dataset.springe; d.close(); zeichne(); }));
  }

  async function zusammenfassen(e) {
    const knopf = e.currentTarget; knopf.disabled = true; knopf.textContent = "Lädt noch hoch …";
    try {
      // Erst muss alles auf dem Server sein, sonst fehlen Claude Antworten und Fotos.
      const offen = await abarbeiten();
      if (offen) { toast(`Noch ${offen} Einträge nicht hochgeladen. Zusammenfassen geht, sobald wieder Netz da ist.`, "fehler"); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Zusammenfassen und prüfen"; return; }
      knopf.textContent = "Claude schreibt den Monteur-Text …"; await api(`/api/planungen/${planung.id}/zusammenfassen`, { methode: "POST", body: {} }); gehe("pruefung/" + planung.id); }
    catch (err) { fehlerMelden(err); knopf.disabled = false; knopf.innerHTML = IKON.haken + "Zusammenfassen und prüfen"; }
  }

  zeichne();
  verlaufH = verlauf.clientHeight;
}

// Diktieren in ein Textfeld: der Browser wandelt live in Text um (am iPhone die Apple-Spracherkennung).
function diktieren(feld, knopf) {
  const Erkennung = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Erkennung || !knopf) return;
  knopf.hidden = false;
  let erkennung = null;
  knopf.onclick = () => {
    if (erkennung) return erkennung.stop();
    erkennung = new Erkennung();
    Object.assign(erkennung, { lang: "de-DE", continuous: true, interimResults: true });
    const vorher = feld.value.trim() ? feld.value.trimEnd() + " " : "";
    erkennung.onresult = (e) => { feld.value = vorher + [...e.results].map((r) => r[0].transcript).join(""); feld.dispatchEvent(new Event("input")); };
    erkennung.onerror = (e) => { bericht("diktat", e.error); if (e.error !== "no-speech" && e.error !== "aborted") toast("Diktieren hat nicht geklappt (" + e.error + ")", "fehler"); };
    erkennung.onend = () => { erkennung = null; knopf.setAttribute("aria-pressed", "false"); };
    erkennung.start();
    knopf.setAttribute("aria-pressed", "true");
  };
}
