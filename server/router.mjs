// Gemeinsame Routing-Tabelle; die Routen-Module tragen sich hier ein.
const routen = [];

// muster wie "/api/projekte/:id"; handler(req, res, params, kontext)
export function route(methode, muster, handler) {
  routen.push({ methode, teile: muster.split("/"), handler });
}

export function finde(methode, pfad) {
  const ist = pfad.split("/");
  for (const r of routen) {
    if (r.methode !== methode || r.teile.length !== ist.length) continue;
    const params = {};
    let passt = true;
    for (let i = 0; i < ist.length && passt; i++) {
      const t = r.teile[i];
      if (t.startsWith(":")) { try { params[t.slice(1)] = decodeURIComponent(ist[i]); } catch { passt = false; } }
      else passt = t === ist[i];
    }
    if (passt) return { r, params };
  }
  return null;
}

export function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

export function fehler(status, meldung) {
  return Object.assign(new Error(meldung), { status });
}

export async function leseJson(req, max = 1_000_000) {
  let text = "";
  for await (const c of req) { text += c; if (text.length > max) throw fehler(413, "Anfrage zu groß"); }
  try { return text ? JSON.parse(text) : {}; } catch { throw fehler(400, "Ungültiges JSON"); }
}
