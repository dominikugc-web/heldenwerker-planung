import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { erstelleDrive } from "../server/drive.mjs";
import { tempDir } from "./hilfe.mjs";

// Attrappe für Web-App (start/fertig) und Googles Upload-Adresse.
function attrappe({ startFehler = false } = {}) {
  const aufrufe = [];
  const f = async (url, init = {}) => {
    if (url === "https://script.example/exec") {
      const b = JSON.parse(init.body);
      aufrufe.push({ art: b.aktion, b });
      if (b.aktion === "start") return new Response(JSON.stringify(startFehler ? { fehler: "Kein Zugriff" } : { uploadUrl: "https://upload.example/session1" }));
      return new Response(JSON.stringify({ id: b.id, link: "https://drive.google.com/file/d/" + b.id + "/view" }));
    }
    if (url === "https://upload.example/session1") {
      let n = 0;
      for await (const c of init.body) n += c.length;
      aufrufe.push({ art: "upload", laenge: n, headers: init.headers });
      return new Response(JSON.stringify({ id: "datei123" }));
    }
    throw new Error("unerwartet " + url);
  };
  f.aufrufe = aufrufe;
  return f;
}

test("hochladen: Upload-Adresse holen, Datei streamen, Freigabe setzen, Link zurück", async () => {
  const f = attrappe();
  const datei = path.join(tempDir(), "x.mp4");
  fs.writeFileSync(datei, Buffer.alloc(1234, 1));
  const link = await erstelleDrive({ url: "https://script.example/exec", token: "geheim", fetch: f }).hochladen(datei, "Rundgang.mp4", "video/mp4", "PVSN-1303 Familie Diwiwi");
  assert.equal(link, "https://drive.google.com/file/d/datei123/view");
  assert.deepEqual(f.aufrufe.map((a) => a.art), ["start", "upload", "fertig"]);
  assert.deepEqual(f.aufrufe[0].b, { token: "geheim", aktion: "start", name: "Rundgang.mp4", mime: "video/mp4", ordner: "PVSN-1303 Familie Diwiwi" });
  assert.equal(f.aufrufe[1].laenge, 1234);
  assert.equal(f.aufrufe[1].headers["Content-Length"], "1234");
});

test("hochladen: Fehler der Web-App wird verständlich gemeldet, ohne Kennwort", async () => {
  const datei = path.join(tempDir(), "x.jpg");
  fs.writeFileSync(datei, "x");
  await assert.rejects(erstelleDrive({ url: "https://script.example/exec", token: "geheim", fetch: attrappe({ startFehler: true }) }).hochladen(datei, "a.jpg", "image/jpeg", "P"),
    (e) => /Drive/.test(e.message) && !e.message.includes("geheim"));
});

test("ladeDrive: ohne env-Datei keine Ablage", async () => {
  const { ladeDrive } = await import("../server/drive.mjs");
  assert.equal(ladeDrive(tempDir()), null);
  const home = tempDir();
  fs.mkdirSync(path.join(home, ".google"));
  fs.writeFileSync(path.join(home, ".google", "planung-drive.env"), "DRIVE_WEBAPP_URL=https://script.example/exec\nDRIVE_TOKEN=abc\n");
  assert.ok(ladeDrive(home));
});
