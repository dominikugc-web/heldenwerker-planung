// In Fotos zeichnen: Stift in drei Farben, Pfeil, Text, Rückgängig. Ergebnis in voller Auflösung.
const FARBEN = [["#e8667e", "Rot"], ["#f5d020", "Gelb"], ["#ffffff", "Weiß"]];

export function zeichnen(blob) {
  return new Promise(async (fertig) => {
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); return fertig(null); }

    const el = document.createElement("div");
    el.className = "zeichnen";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Im Foto zeichnen");
    el.innerHTML = `<div class="oben"><button class="pill" data-abbrechen>Abbrechen</button><button class="pill" data-fertig style="background:#fff;color:#000;font-weight:600">Fertig</button></div>
      <div class="flaeche"><canvas></canvas></div>
      <div class="werkzeuge">${FARBEN.map(([f, n], i) => `<button class="farbe" style="background:${f}" data-farbe="${f}" aria-label="${n}" aria-pressed="${i === 0}"></button>`).join("")}
        <button class="pill" data-werkzeug="stift" aria-pressed="true">Stift</button><button class="pill" data-werkzeug="pfeil" aria-pressed="false">Pfeil</button><button class="pill" data-werkzeug="text" aria-pressed="false">Text</button>
        <button class="pill" data-rueck>Rückgängig</button></div>`;
    document.body.append(el);
    const c = el.querySelector("canvas"), ctx = c.getContext("2d");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const breite = Math.max(5, c.width * 0.009); // Strich wirkt auf jedem Foto gleich dick
    let farbe = FARBEN[0][0], werkzeug = "stift", striche = [], aktiv = null;

    function malen() {
      ctx.drawImage(img, 0, 0);
      for (const s of striche) {
        ctx.strokeStyle = s.farbe; ctx.fillStyle = s.farbe; ctx.lineWidth = breite; ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = breite;
        ctx.beginPath();
        if (s.art === "text") {
          // Beschriftung: Farbe mit dunklem Rand, damit sie auf hellem und dunklem Untergrund lesbar bleibt.
          ctx.shadowBlur = 0; ctx.font = `700 ${Math.round(breite * 7)}px system-ui, sans-serif`; ctx.textBaseline = "middle";
          ctx.lineWidth = breite * 1.4; ctx.strokeStyle = "rgba(0,0,0,.8)";
          ctx.strokeText(s.text, s.punkte[0].x, s.punkte[0].y); ctx.fillText(s.text, s.punkte[0].x, s.punkte[0].y);
        } else if (s.art === "pfeil") {
          const [a, b] = [s.punkte[0], s.punkte.at(-1)];
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const w = Math.atan2(b.y - a.y, b.x - a.x), l = breite * 4.5;
          ctx.beginPath(); ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - l * Math.cos(w - 0.45), b.y - l * Math.sin(w - 0.45));
          ctx.lineTo(b.x - l * Math.cos(w + 0.45), b.y - l * Math.sin(w + 0.45)); ctx.closePath(); ctx.fill();
        } else {
          s.punkte.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
    malen();

    const punkt = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    c.addEventListener("pointerdown", (e) => {
      if (werkzeug === "text") {
        const p = punkt(e), text = prompt("Beschriftung")?.trim();
        if (text) { striche.push({ art: "text", farbe, punkte: [p], text: text.slice(0, 80) }); malen(); }
        return;
      }
      c.setPointerCapture(e.pointerId); aktiv = { art: werkzeug, farbe, punkte: [punkt(e)] }; striche.push(aktiv); });
    c.addEventListener("pointermove", (e) => {
      if (!aktiv) return;
      if (aktiv.art === "pfeil") aktiv.punkte[1] = punkt(e); else aktiv.punkte.push(punkt(e));
      malen();
    });
    const ende = () => { if (aktiv && aktiv.punkte.length < 2) striche.pop(); aktiv = null; malen(); };
    c.addEventListener("pointerup", ende); c.addEventListener("pointercancel", ende);

    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.farbe) { farbe = b.dataset.farbe; el.querySelectorAll("[data-farbe]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }
      if (b.dataset.werkzeug) { werkzeug = b.dataset.werkzeug; el.querySelectorAll("[data-werkzeug]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }
      if ("rueck" in b.dataset) { striche.pop(); malen(); }
      if ("abbrechen" in b.dataset) schliessen(null);
      if ("fertig" in b.dataset) striche.length ? c.toBlob((neu) => schliessen(neu), "image/jpeg", 0.88) : schliessen(null);
    });
    const taste = (e) => { if (e.key === "Escape") schliessen(null); };
    document.addEventListener("keydown", taste);
    function schliessen(ergebnis) { document.removeEventListener("keydown", taste); URL.revokeObjectURL(url); el.remove(); fertig(ergebnis); }
  });
}
