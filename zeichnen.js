// In Fotos zeichnen: Stift, Pfeil, Text (verschieben, Größe ändern), eigene Farben, Zoomen mit zwei Fingern,
// Rückgängig. Ergebnis in voller Auflösung.
// Stift: Finger kurz still halten macht das Stück seit dem letzten Haltepunkt zu einer geraden Linie mit Richtungspfeil;
// weiterziehen, wieder halten, nächste Gerade, ohne abzusetzen (Dominik, 24.11.).
// Seit 26.11. ist der Stift immer gerade (das laufende Stück spannt vom letzten Haltepunkt zum Finger) und endet mit Pfeilspitze.
// Produkt: freigestelltes Gerät aus der Liste einsetzen, verschieben, am Griff unten rechts größer/kleiner ziehen (25.11.).
// 3D (27.11.): Geräte mit Modell liegen erst durchsichtig in einem Kasten über dem Foto. 1 Finger irgendwo dreht um die
// Gerätemitte, 2 Finger verschieben den Kasten frei übers Bild und zoomen ihn (Dominik, 27.11.).
// "Einsetzen" macht ein Bild davon und setzt es genau an diese Stelle als normales Produkt. Ein eingesetztes 3D-Gerät
// lässt sich über „3D drehen“ wieder in den Kasten holen; das X oben rechts am Produkt löscht es (Dominik, 27.11.).
import { api, serverUrl, zustand } from "./api.js";
// Halten = die letzten HALTEN_MS lag der Finger innerhalb von RUHE_PX Bildschirmpunkten. Ein echter Finger zittert
// und wandert dabei ein paar Punkte; 8 Punkte ab dem ersten Ruhepunkt waren am Handy zu streng (25.11.).
const HALTEN_MS = 450, RUHE_PX = 16;
const FARBEN = [["#e8667e", "Rot"], ["#f5d020", "Gelb"], ["#ffffff", "Weiß"]];
const MODEL_VIEWER = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js";
const EIGENE = "planung-farben", MAX_EIGENE = 8; // eigene Farben bleiben auf dem Gerät; die älteste fällt raus
const eigeneFarben = () => { try { return JSON.parse(localStorage.getItem(EIGENE)) || []; } catch { return []; } };
const eigeneMerken = (liste) => { try { localStorage.setItem(EIGENE, JSON.stringify(liste)); } catch { /* privates Fenster */ } };

export function zeichnen(blob) {
  return new Promise(async (fertig) => {
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); return fertig(null); }

    const el = document.createElement("div");
    el.className = "zeichnen";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Im Foto zeichnen");
    el.innerHTML = `<div class="oben"><button class="pill" data-abbrechen>Abbrechen</button><button class="pill" data-zoomweg hidden>Zoom zurück</button><button class="pill" data-fertig style="background:#fff;color:#000;font-weight:600">Speichern</button></div>
      <div class="flaeche"><canvas></canvas></div>
      <div class="werkzeuge">
        <div class="palette"></div>
        <div class="textleiste" hidden><button class="pill" data-kleiner aria-label="Text kleiner">A−</button><button class="pill" data-groesser aria-label="Text größer">A+</button><button class="pill" data-textweg>Text löschen</button></div>
        <div class="produktleiste" hidden><button class="pill" data-drehen>3D drehen</button><button class="pill" data-kleiner aria-label="Produkt kleiner">Kleiner</button><button class="pill" data-groesser aria-label="Produkt größer">Größer</button><button class="pill" data-textweg>Entfernen</button></div>
        <div class="modellleiste"><span>1 Finger drehen, 2 Finger verschieben und zoomen</span><button class="pill" data-modellweg>Abbrechen</button><button class="pill" data-modellein style="background:#fff;color:#000;font-weight:600">Einsetzen</button></div>
        <div class="reihe"><button class="pill" data-werkzeug="stift" aria-pressed="true">Stift</button><button class="pill" data-werkzeug="pfeil" aria-pressed="false">Pfeil</button><button class="pill" data-werkzeug="text" aria-pressed="false">Text</button>
        <select class="pill produktwahl" aria-label="Produkt einsetzen" disabled><option value="">Produkt …</option></select>
        <button class="pill" data-rueck aria-label="Rückgängig" disabled><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button class="pill" data-vor aria-label="Wiederholen" disabled><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button></div></div>`;
    document.body.append(el);
    const c = el.querySelector("canvas"), ctx = c.getContext("2d"), flaeche = el.querySelector(".flaeche");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const breite = Math.max(5, c.width * 0.009); // Strich wirkt auf jedem Foto gleich dick
    let farbe = FARBEN[0][0], werkzeug = "stift", striche = [], aktiv = null;
    let gewaehlt = null, ziehen = null, kandidat = null; // Text: ausgewählt, wird verschoben, neuer Text beim Loslassen
    // Rückgängig/Wiederholen (26.11.): vor jeder Änderung eine Kopie aller Striche merken. Fertige Striche ändern nur
    // ihre obersten Felder (Lage, Größe, Farbe), darum reicht eine flache Kopie je Strich.
    const zurueckListe = [], vorListe = [];
    const kopie = (ohne) => striche.filter((s) => s !== ohne).map((s) => ({ ...s }));
    const knoepfe = () => { el.querySelector("[data-rueck]").disabled = !zurueckListe.length; el.querySelector("[data-vor]").disabled = !vorListe.length; };
    const merken = (ohne) => { zurueckListe.push(kopie(ohne)); vorListe.length = 0; knoepfe(); };
    function springen(von, nach) { if (!von.length) return; nach.push(kopie()); striche = von.pop(); textAuswahl(null); knoepfe(); malen(); }

    // ---------- Farben: drei feste, dazu eigene über den Plus-Knopf ----------
    const palette = el.querySelector(".palette");
    function farbenZeichnen() {
      const alle = [...FARBEN, ...eigeneFarben().map((f) => [f, "Eigene Farbe " + f])];
      palette.innerHTML = alle.map(([f, n]) => `<button class="farbe" style="background:${f}" data-farbe="${f}" aria-label="${n}" aria-pressed="${f === farbe}"></button>`).join("")
        + `<label class="farbe plus" aria-label="Eigene Farbe hinzufügen">+<input type="color" value="${farbe}"></label>`;
      palette.querySelector("input").addEventListener("change", (e) => {
        const f = e.target.value.toLowerCase();
        if (!FARBEN.some(([x]) => x === f)) eigeneMerken([...eigeneFarben().filter((x) => x !== f), f].slice(-MAX_EIGENE));
        farbeWaehlen(f);
      });
    }
    function farbeWaehlen(f) { farbe = f; if (gewaehlt?.art === "text" && gewaehlt.farbe !== f) { merken(); gewaehlt.farbe = f; } farbenZeichnen(); malen(); }
    farbenZeichnen();

    // ---------- Text ----------
    const textHoehe = (s) => breite * 7 * s.groesse;
    const schrift = (s) => `700 ${Math.round(textHoehe(s))}px system-ui, sans-serif`;
    const textBox = (s) => { ctx.font = schrift(s); return { x: s.x, y: s.y - textHoehe(s) / 2, w: ctx.measureText(s.text).width, h: textHoehe(s) }; };
    const trifft = (p) => striche.findLast((s) => { if (s.art !== "text") return false; const b = textBox(s), r = breite * 2; return p.x >= b.x - r && p.x <= b.x + b.w + r && p.y >= b.y - r && p.y <= b.y + b.h + r; });
    const textleiste = el.querySelector(".textleiste"), produktleiste = el.querySelector(".produktleiste");
    // Ausgewählt ist ein Text oder ein Produkt; die passende Leiste erscheint.
    const textAuswahl = (s) => { gewaehlt = s; textleiste.hidden = s?.art !== "text"; produktleiste.hidden = s?.art !== "produkt"; el.querySelector("[data-drehen]").hidden = !s?.modell; };

    // ---------- Produkte ----------
    const griffR = () => 26 * (c.width / c.getBoundingClientRect().width); // Griff etwa 26 Bildschirmpunkte, egal wie groß das Foto ist
    const trifftProdukt = (p) => striche.findLast((s) => s.art === "produkt" && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h);
    const amGriff = (s, p) => Math.hypot(p.x - (s.x + s.w), p.y - (s.y + s.h)) <= griffR();
    const amX = (s, p) => Math.hypot(p.x - (s.x + s.w), p.y - s.y) <= griffR();
    const wahl = el.querySelector(".produktwahl"), bilder = new Map(), modelle = new Map(); // modelle: id -> GLB-Adresse, sobald geladen
    const mitModell = new Map(), amBoden = new Set(); // mitModell: id -> Änderungsstempel der GLB
    if (!zustand.demo) api("/api/produkte").then((liste) => {
      if (!liste.length) return;
      const gruppen = [...new Set(liste.map((x) => x.bereich))];
      wahl.innerHTML = `<option value="">Produkt …</option>` + gruppen.map((g) => `<optgroup label="${g}">${liste.filter((x) => x.bereich === g).map((x) => `<option value="${x.id}">${x.name}${x.modell ? " (3D)" : ""}</option>`).join("")}</optgroup>`).join("");
      liste.filter((x) => x.modell).forEach((x) => mitModell.set(x.id, x.modell));
      liste.filter((x) => x.boden).forEach((x) => amBoden.add(x.id));
      wahl.disabled = false;
    }).catch(() => { /* ohne Netz keine Produkte, alles andere geht */ });
    wahl.addEventListener("change", async () => {
      const id = wahl.value; wahl.value = "";
      if (!id) return;
      if (mitModell.has(id)) return modellOeffnen(id);
      try {
        if (!bilder.has(id)) {
          const r = await fetch(serverUrl("/api/produkte/" + encodeURIComponent(id)));
          if (!r.ok) throw new Error("Produktbild nicht geladen");
          bilder.set(id, await createImageBitmap(await r.blob()));
        }
        const bild = bilder.get(id), fr = flaeche.getBoundingClientRect();
        const mitteBild = punkt({ clientX: fr.left + fr.width / 2, clientY: fr.top + fr.height / 2 });
        const w = (c.width / zoom.s) * 0.3, h = w * bild.height / bild.width; // ein knappes Drittel der sichtbaren Breite
        const neu = { art: "produkt", bild, x: mitteBild.x - w / 2, y: mitteBild.y - h / 2, w, h };
        merken(); striche.push(neu); textAuswahl(neu); malen();
      } catch (e) { alert(e.message || "Produkt konnte nicht geladen werden"); }
    });

    let mv = null, mvId = null, bearbeitet = null, kasten = null, mvFinger = new Map(), mvZug = null;
    // Kasten bleibt mindestens zur Hälfte auf der Fläche; ganz draußen zeichnet model-viewer nichts und es käme kein Bild heraus.
    const kastenSetzen = () => {
      const fr = flaeche.getBoundingClientRect(), h = kasten.s / 2;
      kasten.x = Math.min(fr.width - h, Math.max(-h, kasten.x)); kasten.y = Math.min(fr.height - h, Math.max(-h, kasten.y));
      Object.assign(mv.style, { left: kasten.x + "px", top: kasten.y + "px", width: kasten.s + "px", height: kasten.s + "px" });
    };
    // Alle Gesten im 3D-Modus macht die Fläche selbst (Capture), model-viewer bekommt keine Finger (ohne camera-controls).
    // 1 Finger irgendwo dreht: so stark wie model-viewer über die ganze Fläche (2π je Flächenhöhe), so fühlte es sich am
    // Anfang an (Dominik, 27.11.); im kleinen Kasten wäre es doppelt so schnell. 2 Finger verschieben und zoomen den Kasten;
    // danach dreht erst ein neu aufgesetzter Finger wieder, damit nichts springt.
    function mvZeiger(e) {
      if (!mv) return;
      const fr = flaeche.getBoundingClientRect(), fp = { x: e.clientX - fr.left, y: e.clientY - fr.top };
      if (e.type === "pointerdown") {
        try { flaeche.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
        mvFinger.set(e.pointerId, fp);
        if (mvFinger.size === 1) { const o = mv.getCameraOrbit(); mvZug = { dreh: true, ab: fp, theta: o.theta, phi: o.phi }; }
        if (mvFinger.size === 2) {
          const [a, b] = [...mvFinger.values()];
          mvZug = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, k: { ...kasten } };
        }
        return;
      }
      if (!mvFinger.has(e.pointerId)) return;
      if (e.type === "pointermove") {
        mvFinger.set(e.pointerId, fp);
        if (mvZug?.dreh) {
          const w = (2 * Math.PI) / fr.height, phi = Math.min(Math.PI - 0.01, Math.max(0.01, mvZug.phi - (fp.y - mvZug.ab.y) * w));
          mv.cameraOrbit = `${mvZug.theta - (fp.x - mvZug.ab.x) * w}rad ${phi}rad auto`;
        } else if (mvZug?.d && mvFinger.size >= 2) { // um die Fingermitte zoomen und mitziehen
          const k = mvZug.k, [a, b] = [...mvFinger.values()], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const s = Math.min(fr.width * 3, Math.max(60, k.s * Math.hypot(a.x - b.x, a.y - b.y) / mvZug.d));
          kasten = { s, x: m.x - (mvZug.m.x - k.x) * s / k.s, y: m.y - (mvZug.m.y - k.y) * s / k.s };
          kastenSetzen();
        }
        return;
      }
      mvFinger.delete(e.pointerId); // pointerup / pointercancel
      if (mvFinger.size < 2 && mvZug?.d) mvZug = null;
      if (!mvFinger.size) mvZug = null;
    }
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) flaeche.addEventListener(t, mvZeiger, true);
    // alt: schon eingesetztes 3D-Gerät, das wieder gedreht wird; Kasten und Blickwinkel kommen von dort.
    async function modellOeffnen(id, alt = null) {
      try {
        await import(MODEL_VIEWER);
        if (!modelle.has(id)) {
          const r = await fetch(serverUrl("/api/produkte/" + encodeURIComponent(id) + "/3d?v=" + mitModell.get(id)));
          if (!r.ok) throw new Error("3D-Modell nicht geladen");
          modelle.set(id, URL.createObjectURL(await r.blob()));
        }
      } catch (e) { return alert(e.message || "3D-Modell konnte nicht geladen werden"); }
      textAuswahl(null); malen();
      mv = document.createElement("model-viewer");
      mv.className = "modell3d";
      for (const [k, v] of Object.entries({
        src: modelle.get(id), "interaction-prompt": "none", // ohne camera-controls: Gesten macht mvZeiger, Drehpunkt bleibt die Gerätemitte
        "camera-orbit": alt?.modell.orbit || "-30deg 75deg auto", "min-camera-orbit": "auto 0deg auto", "max-camera-orbit": "auto 180deg auto",
        "shadow-intensity": amBoden.has(id) ? "1" : "0", // nur Bodengeräte werfen einen Bodenschatten
      })) mv.setAttribute(k, v);
      el.classList.add("im3d"); // zuerst: ohne Werkzeugleisten wird die Fläche größer und das Foto rutscht
      const fr = flaeche.getBoundingClientRect(), s = Math.min(fr.width, fr.height) * 0.5;
      kasten = { s, x: (fr.width - s) / 2, y: (fr.height - s) / 2 }; mvFinger.clear(); mvZug = null;
      mvId = id; bearbeitet = alt;
      if (alt) { // Kasten liegt relativ zum Produkt; von Bildpunkten in Bildschirmpunkte der Fläche umrechnen
        const cr = c.getBoundingClientRect(), f = cr.width / c.width, k = alt.modell.kasten;
        kasten = { s: k.s * alt.w * f, x: cr.left - fr.left + (alt.x + k.x * alt.w) * f, y: cr.top - fr.top + (alt.y + k.y * alt.w) * f };
        alt.versteckt = true; malen();
      }
      flaeche.append(mv); kastenSetzen();
    }
    function modellSchliessen() {
      if (bearbeitet) { delete bearbeitet.versteckt; bearbeitet = null; malen(); }
      mv?.remove(); mv = null; el.classList.remove("im3d");
    }
    async function modellEinsetzen() {
      const blob = await mv.toBlob({ idealAspect: false }), voll = await createImageBitmap(blob);
      const r = sichtbar(voll);
      if (!r) return modellSchliessen();
      const m = mv.getBoundingClientRect(), fx = m.width / voll.width, fy = m.height / voll.height;
      const a = punkt({ clientX: m.left + r.x * fx, clientY: m.top + r.y * fy });
      const b = punkt({ clientX: m.left + (r.x + r.w) * fx, clientY: m.top + (r.y + r.h) * fy });
      const neu = { art: "produkt", dreiD: true, bild: await createImageBitmap(voll, r.x, r.y, r.w, r.h), x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      const k0 = punkt({ clientX: m.left, clientY: m.top }), k1 = punkt({ clientX: m.right, clientY: m.top });
      neu.modell = { id: mvId, orbit: mv.getCameraOrbit().toString(), kasten: { x: (k0.x - neu.x) / neu.w, y: (k0.y - neu.y) / neu.w, s: (k1.x - k0.x) / neu.w } };
      const alt = bearbeitet;
      modellSchliessen(); merken();
      if (alt && striche.includes(alt)) striche[striche.indexOf(alt)] = neu; else striche.push(neu);
      textAuswahl(neu); malen();
    }
    // Rahmen um alle nicht durchsichtigen Punkte (Gerät samt Bodenschatten)
    function sichtbar(bmp) {
      const k = document.createElement("canvas"); k.width = bmp.width; k.height = bmp.height;
      const kx = k.getContext("2d", { willReadFrequently: true }); kx.drawImage(bmp, 0, 0);
      const d = kx.getImageData(0, 0, k.width, k.height).data;
      let x0 = k.width, y0 = k.height, x1 = -1, y1 = -1;
      for (let y = 0; y < k.height; y++) for (let x = 0; x < k.width; x++) {
        if (d[(y * k.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
      }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    // Pfeilspitze in der Mitte einer Geraden, zeigt in Zeichenrichtung; zu kurze Stücke bekommen keine.
    function pfeilMitte(a, b) {
      const l = breite * 3.5, d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < l * 2.5) return;
      const w = Math.atan2(b.y - a.y, b.x - a.x), sx = (a.x + b.x) / 2 + Math.cos(w) * l / 2, sy = (a.y + b.y) / 2 + Math.sin(w) * l / 2;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx - l * Math.cos(w - 0.5), sy - l * Math.sin(w - 0.5));
      ctx.lineTo(sx - l * Math.cos(w + 0.5), sy - l * Math.sin(w + 0.5)); ctx.closePath(); ctx.fill();
    }

    // Gerade von a nach b mit Pfeilspitze an b; die Linie endet im Pfeilkopf, sonst schaut ihr rundes Ende vorn heraus.
    function linieMitPfeil(a, b) {
      const w = Math.atan2(b.y - a.y, b.x - a.x), l = breite * 4.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(w) * l * 0.7, b.y - Math.sin(w) * l * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - l * Math.cos(w - 0.45), b.y - l * Math.sin(w - 0.45));
      ctx.lineTo(b.x - l * Math.cos(w + 0.45), b.y - l * Math.sin(w + 0.45)); ctx.closePath(); ctx.fill();
    }

    function malen() {
      ctx.drawImage(img, 0, 0);
      for (const s of striche) {
        if (s.versteckt) continue; // wird gerade im 3D-Kasten gedreht
        ctx.strokeStyle = s.farbe; ctx.fillStyle = s.farbe; ctx.lineWidth = breite; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = breite;
        ctx.beginPath();
        if (s.art === "produkt") {
          ctx.shadowBlur = s.dreiD ? 0 : breite * 1.5; ctx.drawImage(s.bild, s.x, s.y, s.w, s.h); ctx.shadowBlur = 0;
          if (s === gewaehlt) { // Rahmen und Griff nur zum Bearbeiten
            ctx.setLineDash([breite * 2, breite * 1.5]); ctx.lineWidth = Math.max(2, breite / 2.5); ctx.strokeStyle = "#fff";
            ctx.strokeRect(s.x, s.y, s.w, s.h); ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(s.x + s.w, s.y + s.h, griffR() * 0.7, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
            ctx.lineWidth = Math.max(2, breite / 3); ctx.strokeStyle = "#000"; ctx.stroke();
            const xr = griffR() * 0.7, xm = { x: s.x + s.w, y: s.y }, d = xr * 0.45; // X oben rechts zum Löschen
            ctx.beginPath(); ctx.arc(xm.x, xm.y, xr, 0, Math.PI * 2); ctx.fillStyle = "#e8667e"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(xm.x - d, xm.y - d); ctx.lineTo(xm.x + d, xm.y + d); ctx.moveTo(xm.x + d, xm.y - d); ctx.lineTo(xm.x - d, xm.y + d);
            ctx.lineWidth = Math.max(3, breite / 2.5); ctx.lineCap = "round"; ctx.stroke();
          }
        } else if (s.art === "text") {
          // Beschriftung: Farbe mit dunklem Rand, damit sie auf hellem und dunklem Untergrund lesbar bleibt.
          ctx.shadowBlur = 0; ctx.font = schrift(s); ctx.textBaseline = "middle";
          ctx.lineWidth = breite * 1.4 * s.groesse; ctx.strokeStyle = "rgba(0,0,0,.8)";
          ctx.strokeText(s.text, s.x, s.y); ctx.fillText(s.text, s.x, s.y);
          if (s === gewaehlt) { // Rahmen nur zum Bearbeiten, beim Speichern ist nichts ausgewählt
            const b = textBox(s), r = breite;
            ctx.setLineDash([breite * 2, breite * 1.5]); ctx.lineWidth = Math.max(2, breite / 2.5); ctx.strokeStyle = "#fff";
            ctx.strokeRect(b.x - r, b.y - r, b.w + 2 * r, b.h + 2 * r); ctx.setLineDash([]);
          }
        } else if (s.art === "pfeil") {
          linieMitPfeil(s.punkte[0], s.punkte.at(-1));
        } else {
          // Stift: Geraden über die Haltepunkte (fest), das letzte Stück gerade bis zum Finger bzw. Endpunkt.
          const fest = s.fest || [s.punkte[0]], ende = s.punkte.at(-1), zuletzt = fest.at(-1);
          const pts = [...fest];
          // Endet der Strich direkt am Haltepunkt (nur Zittern danach), zeigt die Spitze in Richtung des letzten Stücks.
          if (fest.length < 2 || Math.hypot(ende.x - zuletzt.x, ende.y - zuletzt.y) >= breite * 3) pts.push(ende);
          if (pts.length < 2) continue;
          pts.slice(0, -1).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          for (let i = 1; i < pts.length - 1; i++) pfeilMitte(pts[i - 1], pts[i]);
          linieMitPfeil(pts.at(-2), pts.at(-1));
        }
      }
      ctx.shadowBlur = 0;
    }
    malen();

    // ---------- Zoom: zwei Finger ziehen auseinander und verschieben; ein Finger zeichnet ----------
    let zoom = { s: 1, x: 0, y: 0 }, geste = null, warten = false; // warten: nach dem Zoomen erst alle Finger heben
    const zoomweg = el.querySelector("[data-zoomweg]");
    const zoomSetzen = (z) => { zoom = z.s < 1.02 ? { s: 1, x: 0, y: 0 } : z; c.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`; zoomweg.hidden = zoom.s === 1; };
    const finger = new Map();
    const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mitte = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    function gesteStarten() {
      const [a, b] = [...finger.values()], r = c.getBoundingClientRect();
      // transform-origin 0 0: die linke obere Ecke liegt um zoom.x/y verschoben, ohne Zoom läge sie bei r.left - zoom.x
      geste = { d: abstand(a, b) || 1, m: mitte(a, b), z: zoom, lx: r.left - zoom.x, ly: r.top - zoom.y };
    }
    function gesteBewegen() {
      const [a, b] = [...finger.values()], m = mitte(a, b), g = geste;
      const s = Math.min(8, Math.max(1, g.z.s * abstand(a, b) / g.d));
      const px = (g.m.x - g.lx - g.z.x) / g.z.s, py = (g.m.y - g.ly - g.z.y) / g.z.s; // Bildpunkt unter der Fingermitte bleibt dort
      zoomSetzen({ s, x: m.x - g.lx - px * s, y: m.y - g.ly - py * s });
    }

    const punkt = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };

    // Halten beim Stift: Lag der Finger die letzten HALTEN_MS ruhig, wird das Stück seit dem letzten Haltepunkt gerade.
    // Geprüft wird laufend über die zuletzt gemeldeten Fingerpositionen (Bildschirmpunkte mit Zeit).
    let spur = [], halteTimer = null, haltepunkt = null;
    const halteStopp = () => { clearInterval(halteTimer); halteTimer = null; spur = []; haltepunkt = null; };
    function halteStart(e) {
      spur = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      clearInterval(halteTimer);
      halteTimer = setInterval(haltenPruefen, 60);
    }
    function haltenPruefen() {
      if (!aktiv || aktiv.art !== "stift" || !spur.length) return;
      const jetzt = performance.now(), letzte = spur.at(-1);
      if (jetzt - spur[0].t < HALTEN_MS) return; // noch nicht lange genug gezeichnet
      // alle Positionen seit HALTEN_MS (dazu die letzte davor, falls seitdem keine Bewegung gemeldet wurde)
      const ab = spur.findLastIndex((s) => s.t <= jetzt - HALTEN_MS);
      if (spur.slice(Math.max(0, ab)).some((s) => Math.hypot(s.x - letzte.x, s.y - letzte.y) > RUHE_PX)) return;
      const hier = aktiv.punkte.at(-1), fest = (aktiv.fest ||= [aktiv.punkte[0]]);
      if (Math.hypot(hier.x - fest.at(-1).x, hier.y - fest.at(-1).y) < breite * 3) return; // seit dem letzten Haltepunkt nichts gezogen
      fest.push(hier); aktiv.punkte = [hier];
      haltepunkt = { x: letzte.x, y: letzte.y }; // Zittern hier nicht mitzeichnen, erst echtes Weiterziehen
      navigator.vibrate?.(15);
      malen();
    }
    flaeche.addEventListener("pointerdown", (e) => {
      if (mv) return; // 3D-Modus: Gesten gehören dem Kasten
      try { flaeche.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (finger.size === 2) { // zweiter Finger: zoomen statt zeichnen, angefangener Strich fällt weg
        if (aktiv) { striche.splice(striche.indexOf(aktiv), 1); aktiv = null; }
        halteStopp(); ziehen = null; kandidat = null; warten = true; gesteStarten(); malen(); return;
      }
      if (finger.size > 2 || warten) return;
      const p = punkt(e);
      // Produkte lassen sich in jedem Werkzeug greifen: am Griff Größe ändern, sonst verschieben.
      if (gewaehlt?.art === "produkt" && amX(gewaehlt, p)) { merken(); striche.splice(striche.indexOf(gewaehlt), 1); textAuswahl(null); malen(); return; }
      if (gewaehlt?.art === "produkt" && amGriff(gewaehlt, p)) { ziehen = { griff: true }; return; }
      const pr = trifftProdukt(p);
      if (pr) { textAuswahl(pr); ziehen = { dx: p.x - pr.x, dy: p.y - pr.y }; malen(); return; }
      if (gewaehlt?.art === "produkt") { textAuswahl(null); malen(); }
      if (werkzeug === "text") {
        const t = trifft(p);
        textAuswahl(t || null);
        if (t) ziehen = { dx: p.x - t.x, dy: p.y - t.y }; else kandidat = { x: e.clientX, y: e.clientY, p };
        malen(); return;
      }
      aktiv = { art: werkzeug, farbe, punkte: [p] }; striche.push(aktiv);
      if (werkzeug === "stift") halteStart(e);
    });
    flaeche.addEventListener("pointermove", (e) => {
      if (!finger.has(e.pointerId)) return;
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (geste) { if (finger.size >= 2) gesteBewegen(); return; }
      if (ziehen && !ziehen.gemerkt) { merken(); ziehen.gemerkt = true; }
      if (ziehen?.griff) { const p = punkt(e), w = Math.max(breite * 8, p.x - gewaehlt.x); gewaehlt.h *= w / gewaehlt.w; gewaehlt.w = w; malen(); return; }
      if (ziehen) { const p = punkt(e); gewaehlt.x = p.x - ziehen.dx; gewaehlt.y = p.y - ziehen.dy; malen(); return; }
      if (kandidat && Math.hypot(e.clientX - kandidat.x, e.clientY - kandidat.y) > 12) kandidat = null;
      if (!aktiv) return;
      if (aktiv.art === "stift") { const t = performance.now(); spur.push({ t, x: e.clientX, y: e.clientY }); spur = spur.filter((s) => s.t > t - 2000); }
      if (haltepunkt && Math.hypot(e.clientX - haltepunkt.x, e.clientY - haltepunkt.y) <= RUHE_PX) return;
      haltepunkt = null;
      if (aktiv.art === "pfeil") aktiv.punkte[1] = punkt(e); else aktiv.punkte.push(punkt(e));
      malen();
    });
    const los = (e) => {
      finger.delete(e.pointerId);
      if (geste && finger.size < 2) geste = null;
      if (!finger.size) warten = false;
      halteStopp();
      if (aktiv) { if (aktiv.punkte.length < 2 && !(aktiv.fest?.length > 1)) striche.splice(striche.indexOf(aktiv), 1); else merken(aktiv); aktiv = null; malen(); }
      ziehen = null;
      if (kandidat && e.type === "pointerup") {
        const { p } = kandidat; kandidat = null;
        const text = prompt("Beschriftung")?.trim();
        if (text) { const neu = { art: "text", farbe, text: text.slice(0, 80), x: p.x, y: p.y, groesse: 1 }; merken(); striche.push(neu); textAuswahl(neu); malen(); }
      }
      kandidat = null;
    };
    flaeche.addEventListener("pointerup", los); flaeche.addEventListener("pointercancel", los);
    flaeche.addEventListener("contextmenu", (e) => e.preventDefault()); // Android: langes Halten öffnet sonst das Bildmenü

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.farbe) farbeWaehlen(b.dataset.farbe);
      if (b.dataset.werkzeug) {
        werkzeug = b.dataset.werkzeug; el.querySelectorAll("[data-werkzeug]").forEach((x) => x.setAttribute("aria-pressed", x === b));
        if (werkzeug !== "text") { textAuswahl(null); malen(); }
      }
      if (gewaehlt && ("groesser" in b.dataset || "kleiner" in b.dataset)) {
        const f = "groesser" in b.dataset ? 1.25 : 0.8;
        merken();
        if (gewaehlt.art === "produkt") { // um die Mitte skalieren
          const w = Math.max(breite * 8, gewaehlt.w * f), h = gewaehlt.h * w / gewaehlt.w;
          gewaehlt.x += (gewaehlt.w - w) / 2; gewaehlt.y += (gewaehlt.h - h) / 2; gewaehlt.w = w; gewaehlt.h = h;
        } else gewaehlt.groesse = Math.min(4, Math.max(0.4, gewaehlt.groesse * f));
        malen();
      }
      if (gewaehlt && "textweg" in b.dataset) { merken(); striche.splice(striche.indexOf(gewaehlt), 1); textAuswahl(null); malen(); }
      if ("modellweg" in b.dataset) modellSchliessen();
      if ("drehen" in b.dataset && gewaehlt?.modell) modellOeffnen(gewaehlt.modell.id, gewaehlt);
      if ("modellein" in b.dataset) modellEinsetzen().catch(() => { modellSchliessen(); alert("3D-Bild konnte nicht erzeugt werden"); });
      if ("rueck" in b.dataset) springen(zurueckListe, vorListe);
      if ("vor" in b.dataset) springen(vorListe, zurueckListe);
      if ("zoomweg" in b.dataset) zoomSetzen({ s: 1, x: 0, y: 0 });
      if ("abbrechen" in b.dataset && verwerfen()) schliessen(null);
      if ("fertig" in b.dataset) { textAuswahl(null); malen(); striche.length ? c.toBlob((neu) => schliessen(neu), "image/jpeg", 0.88) : schliessen(null); }
    });
    const taste = (e) => { if (e.key === "Escape" && verwerfen()) schliessen(null); };
    // Mit Zeichnung erst nachfragen, damit nichts aus Versehen verloren geht.
    const verwerfen = () => !striche.length || confirm("Zeichnung verwerfen? Sie wird nicht gespeichert.");
    document.addEventListener("keydown", taste);
    function schliessen(ergebnis) { document.removeEventListener("keydown", taste); URL.revokeObjectURL(url); el.remove(); fertig(ergebnis); }
  });
}
