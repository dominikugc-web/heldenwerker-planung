// In Fotos zeichnen: Stift, Pfeil, Text (verschieben, Größe ändern), eigene Farben, Zoomen mit zwei Fingern,
// Rückgängig. Ergebnis in voller Auflösung.
// Stift: Finger kurz still halten macht das Stück seit dem letzten Haltepunkt zu einer geraden Linie mit Richtungspfeil;
// weiterziehen, wieder halten, nächste Gerade, ohne abzusetzen (Dominik, 24.11.).
const HALTEN_MS = 450, RUHE_PX = 8; // so lange und so ruhig muss der Finger bleiben
const FARBEN = [["#e8667e", "Rot"], ["#f5d020", "Gelb"], ["#ffffff", "Weiß"]];
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
        <div class="reihe"><button class="pill" data-werkzeug="stift" aria-pressed="true">Stift</button><button class="pill" data-werkzeug="pfeil" aria-pressed="false">Pfeil</button><button class="pill" data-werkzeug="text" aria-pressed="false">Text</button>
        <button class="pill" data-rueck>Rückgängig</button></div></div>`;
    document.body.append(el);
    const c = el.querySelector("canvas"), ctx = c.getContext("2d"), flaeche = el.querySelector(".flaeche");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const breite = Math.max(5, c.width * 0.009); // Strich wirkt auf jedem Foto gleich dick
    let farbe = FARBEN[0][0], werkzeug = "stift", striche = [], aktiv = null;
    let gewaehlt = null, ziehen = null, kandidat = null; // Text: ausgewählt, wird verschoben, neuer Text beim Loslassen

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
    function farbeWaehlen(f) { farbe = f; if (gewaehlt) gewaehlt.farbe = f; farbenZeichnen(); malen(); }
    farbenZeichnen();

    // ---------- Text ----------
    const textHoehe = (s) => breite * 7 * s.groesse;
    const schrift = (s) => `700 ${Math.round(textHoehe(s))}px system-ui, sans-serif`;
    const textBox = (s) => { ctx.font = schrift(s); return { x: s.x, y: s.y - textHoehe(s) / 2, w: ctx.measureText(s.text).width, h: textHoehe(s) }; };
    const trifft = (p) => striche.findLast((s) => { if (s.art !== "text") return false; const b = textBox(s), r = breite * 2; return p.x >= b.x - r && p.x <= b.x + b.w + r && p.y >= b.y - r && p.y <= b.y + b.h + r; });
    const textleiste = el.querySelector(".textleiste");
    const textAuswahl = (s) => { gewaehlt = s; textleiste.hidden = !s; };

    // Pfeilspitze in der Mitte einer Geraden, zeigt in Zeichenrichtung; zu kurze Stücke bekommen keine.
    function pfeilMitte(a, b) {
      const l = breite * 3.5, d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < l * 2.5) return;
      const w = Math.atan2(b.y - a.y, b.x - a.x), sx = (a.x + b.x) / 2 + Math.cos(w) * l / 2, sy = (a.y + b.y) / 2 + Math.sin(w) * l / 2;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx - l * Math.cos(w - 0.5), sy - l * Math.sin(w - 0.5));
      ctx.lineTo(sx - l * Math.cos(w + 0.5), sy - l * Math.sin(w + 0.5)); ctx.closePath(); ctx.fill();
    }

    function malen() {
      ctx.drawImage(img, 0, 0);
      for (const s of striche) {
        ctx.strokeStyle = s.farbe; ctx.fillStyle = s.farbe; ctx.lineWidth = breite; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = breite;
        ctx.beginPath();
        if (s.art === "text") {
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
          const [a, b] = [s.punkte[0], s.punkte.at(-1)];
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const w = Math.atan2(b.y - a.y, b.x - a.x), l = breite * 4.5;
          ctx.beginPath(); ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - l * Math.cos(w - 0.45), b.y - l * Math.sin(w - 0.45));
          ctx.lineTo(b.x - l * Math.cos(w + 0.45), b.y - l * Math.sin(w + 0.45)); ctx.closePath(); ctx.fill();
        } else {
          // fest: gerade Strecken bis zum letzten Haltepunkt, punkte: freier Strich ab dort
          const fest = s.fest || [];
          [...fest, ...s.punkte].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
          for (let i = 1; i < fest.length; i++) pfeilMitte(fest[i - 1], fest[i]);
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

    // Halten beim Stift: Bleibt der Finger HALTEN_MS lang ruhig, wird das Stück seit dem letzten Haltepunkt gerade.
    let ruhe = null, halteTimer = null;
    const halteStopp = () => { clearTimeout(halteTimer); halteTimer = null; ruhe = null; };
    function halteStart(e) {
      clearTimeout(halteTimer);
      ruhe = { x: e.clientX, y: e.clientY };
      halteTimer = setTimeout(() => {
        if (!aktiv || aktiv.art !== "stift") return;
        const hier = aktiv.punkte.at(-1), fest = (aktiv.fest ||= [aktiv.punkte[0]]);
        if (Math.hypot(hier.x - fest.at(-1).x, hier.y - fest.at(-1).y) < breite * 3) return; // noch kein Stück gezogen
        fest.push(hier); aktiv.punkte = [hier];
        navigator.vibrate?.(15);
        malen();
      }, HALTEN_MS);
    }
    flaeche.addEventListener("pointerdown", (e) => {
      try { flaeche.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (finger.size === 2) { // zweiter Finger: zoomen statt zeichnen, angefangener Strich fällt weg
        if (aktiv) { striche.splice(striche.indexOf(aktiv), 1); aktiv = null; }
        halteStopp(); ziehen = null; kandidat = null; warten = true; gesteStarten(); malen(); return;
      }
      if (finger.size > 2 || warten) return;
      const p = punkt(e);
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
      if (ziehen) { const p = punkt(e); gewaehlt.x = p.x - ziehen.dx; gewaehlt.y = p.y - ziehen.dy; malen(); return; }
      if (kandidat && Math.hypot(e.clientX - kandidat.x, e.clientY - kandidat.y) > 12) kandidat = null;
      if (!aktiv) return;
      if (aktiv.art === "pfeil") aktiv.punkte[1] = punkt(e); else aktiv.punkte.push(punkt(e));
      // Zittern zählt nicht als Bewegung; erst wer weiterzieht, startet das Warten aufs Halten neu.
      if (aktiv.art === "stift" && (!ruhe || Math.hypot(e.clientX - ruhe.x, e.clientY - ruhe.y) > RUHE_PX)) halteStart(e);
      malen();
    });
    const los = (e) => {
      finger.delete(e.pointerId);
      if (geste && finger.size < 2) geste = null;
      if (!finger.size) warten = false;
      halteStopp();
      if (aktiv) { if (aktiv.punkte.length < 2 && !(aktiv.fest?.length > 1)) striche.splice(striche.indexOf(aktiv), 1); aktiv = null; malen(); }
      ziehen = null;
      if (kandidat && e.type === "pointerup") {
        const { p } = kandidat; kandidat = null;
        const text = prompt("Beschriftung")?.trim();
        if (text) { const neu = { art: "text", farbe, text: text.slice(0, 80), x: p.x, y: p.y, groesse: 1 }; striche.push(neu); textAuswahl(neu); malen(); }
      }
      kandidat = null;
    };
    flaeche.addEventListener("pointerup", los); flaeche.addEventListener("pointercancel", los);

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.farbe) farbeWaehlen(b.dataset.farbe);
      if (b.dataset.werkzeug) {
        werkzeug = b.dataset.werkzeug; el.querySelectorAll("[data-werkzeug]").forEach((x) => x.setAttribute("aria-pressed", x === b));
        if (werkzeug !== "text") { textAuswahl(null); malen(); }
      }
      if (gewaehlt && ("groesser" in b.dataset || "kleiner" in b.dataset)) { gewaehlt.groesse = Math.min(4, Math.max(0.4, gewaehlt.groesse * ("groesser" in b.dataset ? 1.25 : 0.8))); malen(); }
      if (gewaehlt && "textweg" in b.dataset) { striche.splice(striche.indexOf(gewaehlt), 1); textAuswahl(null); malen(); }
      if ("rueck" in b.dataset) { striche.pop(); if (!striche.includes(gewaehlt)) textAuswahl(null); malen(); }
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
