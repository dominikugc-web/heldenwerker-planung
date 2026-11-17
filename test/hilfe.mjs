import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { starteServer } from "../server/main.mjs";

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hwp-"));
}

// Startet einen Server auf freiem Port und liefert Basis-URL und Stopp-Funktion.
export async function testServer(opts = {}) {
  const homeDir = opts.homeDir ?? tempDir();
  const datenDir = opts.datenDir ?? tempDir();
  const server = await starteServer({ port: 0, webDir: path.resolve("web"), datenDir, homeDir, lokal: true, ...opts });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, homeDir, datenDir, stop: () => new Promise((r) => server.close(r)) };
}
