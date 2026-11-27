// Freigestellte Produktbilder zum Einsetzen beim Bemalen (Dominik, 25.11.2026).
// Die Bilder liegen nur auf dem Server unter daten/produkte/<id>.png (Herstellerbilder, nicht ins öffentliche Repo);
// Rohbilder und Freistell-Skript im Vault unter 07 Anhänge/Planungstool Produktbilder.
import fs from "node:fs";
import path from "node:path";
import { route, json, fehler } from "./router.mjs";

export const PRODUKTE = [
  ["bosch-wp-aussen", "Bosch Außengerät", "Wärmepumpe", "boden"],
  ["bosch-wp-innen-wand", "Bosch Inneneinheit wandhängend", "Wärmepumpe"],
  ["bosch-warmwasserspeicher", "Bosch Warmwasserspeicher", "Wärmepumpe", "boden"],
  ["bosch-pufferspeicher", "Bosch Pufferspeicher", "Wärmepumpe", "boden"],
  ["bosch-klima-innen", "Bosch Innengerät", "Klimaanlage"],
  ["bosch-klima-aussen", "Bosch Außengerät", "Klimaanlage", "boden"],
  ["fronius-gen24", "Fronius GEN24", "Wechselrichter"],
  ["goodwe-wechselrichter", "GoodWe", "Wechselrichter"],
  ["ecoflow-wechselrichter", "EcoFlow PowerOcean", "Wechselrichter"],
  ["goodwe-esa", "GoodWe ESA", "Wechselrichter", "boden"],
  ["fronius-reserva", "Fronius Reserva", "Speicher", "boden"],
  ["goodwe-lynx-d", "GoodWe Lynx D", "Speicher"],
  ["ecoflow-speicher", "EcoFlow PowerOcean Batterie", "Speicher", "boden"],
  ["ecoflow-ocean-2", "EcoFlow OCEAN 2", "Speicher", "boden"],
  ["ecoflow-powerocean", "EcoFlow PowerOcean komplett", "Speicher", "boden"],
  ["fronius-wattpilot-flex", "Fronius Wattpilot Flex", "Wallbox"],
  ["goodwe-hca-g2", "GoodWe HCA G2", "Wallbox"],
  ["ecoflow-powerpulse-2", "EcoFlow PowerPulse 2", "Wallbox"],
// "boden": steht auf dem Boden, das 3D-Modell bekommt beim Bemalen einen Bodenschatten (27.11.).
].map(([id, name, bereich, boden]) => ({ id, name, bereich, ...(boden && { boden: true }) }));

// Optional daten/produkte/<id>.glb: 3D-Modell, das man beim Bemalen über dem Foto dreht (27.11.).
const datei = (k, id, endung = ".png") => path.join(k.datenDir, "produkte", id + endung);

route("GET", "/api/produkte", (req, res, p, k) => json(res, 200, PRODUKTE.filter((x) => fs.existsSync(datei(k, x.id)))
  .map((x) => (fs.existsSync(datei(k, x.id, ".glb")) ? { ...x, modell: true } : x))));
route("GET", "/api/produkte/:id/3d", (req, res, p, k) => {
  if (!PRODUKTE.some((x) => x.id === p.id) || !fs.existsSync(datei(k, p.id, ".glb"))) throw fehler(404, "3D-Modell nicht gefunden");
  res.writeHead(200, { "Content-Type": "model/gltf-binary", "Cache-Control": "private, max-age=86400" });
  fs.createReadStream(datei(k, p.id, ".glb")).pipe(res);
});
route("GET", "/api/produkte/:id", (req, res, p, k) => {
  // Nur bekannte IDs, damit niemand über den Pfad an andere Dateien kommt.
  if (!PRODUKTE.some((x) => x.id === p.id) || !fs.existsSync(datei(k, p.id))) throw fehler(404, "Produkt nicht gefunden");
  res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" });
  fs.createReadStream(datei(k, p.id)).pipe(res);
});
