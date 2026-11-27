// Freigestellte Produktbilder zum Einsetzen beim Bemalen (Dominik, 25.11.2026).
// Die Bilder liegen nur auf dem Server unter daten/produkte/<id>.png (Herstellerbilder, nicht ins öffentliche Repo);
// Rohbilder und Freistell-Skript im Vault unter 07 Anhänge/Planungstool Produktbilder.
import fs from "node:fs";
import path from "node:path";
import { route, json, fehler } from "./router.mjs";

// Kurzbeschreibung fürs Produktblatt beim Bemalen: Modell und Maße B x H x T (Quellen in blender-3d/geraete/recherche, 27.11.).
const TEXTE = {
  "pv-modul": "Halbzellenmodul schwarz, ca. 1134 x 1722 x 30 mm",
  "bosch-wp-aussen": "Compress CS6800i AW Außeneinheit, 1350 x 1100 x 540 mm",
  "bosch-wp-innen-wand": "Compress CS6800i AW Inneneinheit E, wandhängend, 400 x 710 x 300 mm",
  "bosch-warmwasserspeicher": "Stora WH 370 LP, 352 l, 750 x 1591 mm",
  "bosch-pufferspeicher": "Stora BH 200, 203 l, 600 x 1530 mm",
  "bosch-klima-innen": "Climate Split-Innengerät, Wandmontage",
  "bosch-klima-aussen": "Climate Split-Außengerät",
  "fronius-gen24": "Symo GEN24 Plus, Hybrid 3-phasig, 529 x 595 x 180 mm",
  "goodwe-wechselrichter": "ET G2 Hybrid 3-phasig, 496 x 460 x 221 mm",
  "ecoflow-wechselrichter": "PowerOcean Hybrid 3-phasig, 588 x 380 x 175 mm",
  "goodwe-esa": "ESA All-in-one, Wechselrichter mit Batterie, 800 x 1033 x 270 mm",
  "fronius-reserva": "Reserva 12.6, 12,6 kWh, 780 x 1360 x 176 mm",
  "goodwe-lynx-d": "Lynx Home D, Batteriemodul 5 kWh, 700 x 380 x 170 mm",
  "ecoflow-speicher": "PowerOcean LFP-Batterie, 3 Module 15,3 kWh, 680 x 1406 x 183 mm",
  "ecoflow-ocean-2": "OCEAN 2, Wechselrichter mit Batteriemodulen, 680 x 1244 x 203 mm",
  "ecoflow-powerocean": "PowerOcean komplett mit Batteriestapel, 680 x 1406 x 183 mm",
  "fronius-wattpilot-flex": "Wattpilot Flex Home 11/22 kW, 195 x 325 x 105 mm",
  "goodwe-hca-g2": "HCA G2 Wallbox 7/11/22 kW, 208 x 450 x 170 mm",
  "ecoflow-powerpulse-2": "PowerPulse 2 Wallbox 11/22 kW, 226 x 333 x 145 mm",
  "zaehlerschrank": "2-feldrig Aufputz, Zählerfeld und Verteilerfeld, ca. 550 x 1100 x 205 mm",
  "zaehlerschrank-2": "3-feldrig Aufputz, 2 Zählerplätze und Verteilerfeld, ca. 800 x 1400 x 205 mm",
  "zaehlerschrank-3": "3-feldrig Aufputz, 3 Zählerplätze, ca. 800 x 1100 x 205 mm",
};

export const PRODUKTE = [
  ["pv-modul", "PV-Modul Full Black", "Modul"],
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
  ["zaehlerschrank", "Zählerschrank 1 Zähler", "Zählerschrank"],
  ["zaehlerschrank-2", "Zählerschrank 2 Zähler", "Zählerschrank"],
  ["zaehlerschrank-3", "Zählerschrank 3 Zähler", "Zählerschrank"],
// "boden": steht auf dem Boden, das 3D-Modell bekommt beim Bemalen einen Bodenschatten (27.11.).
].map(([id, name, bereich, boden]) => ({ id, name, bereich, ...(boden && { boden: true }), text: TEXTE[id] || "" }));

// Optional daten/produkte/<id>.glb: 3D-Modell, das man beim Bemalen über dem Foto dreht (27.11.).
// "modell" in der Liste ist der Änderungsstempel der Datei; die App hängt ihn an die Adresse, so kommt ein neu gebautes Modell trotz Cache sofort an.
const datei = (k, id, endung = ".png") => path.join(k.datenDir, "produkte", id + endung);

route("GET", "/api/produkte", (req, res, p, k) => json(res, 200, PRODUKTE.filter((x) => fs.existsSync(datei(k, x.id)))
  .map((x) => (fs.existsSync(datei(k, x.id, ".glb")) ? { ...x, modell: Math.round(fs.statSync(datei(k, x.id, ".glb")).mtimeMs) } : x))));
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
