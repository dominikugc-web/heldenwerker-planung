// Dateien und Logbuch in HERO. Weg laut HERO-Support (24.11.2026, docs/hero-upload.md): Datei per REST hochladen,
// die UUID dann per upload_image (Fotos) oder upload_document (PDFs) ans Projekt hängen. Beides im Testprojekt geprüft.
const DOKUMENTTYP_ALLGEMEIN = 380912;

export function erstelleDateien({ schreiber, hero }) {
  return {
    // Gibt die HERO-ID des Bildes oder Dokuments zurück. Geschrieben wird nur über den Schreibschutz.
    // Abschlussberichte geben Dokumenttyp (Abnahmeprotokoll) und Bildkategorie mit; Besichtigung nimmt die Standardwerte.
    async inHero(projektId, pfad, name, mime, { dokumenttyp = DOKUMENTTYP_ALLGEMEIN, bildkategorie = "Besichtigung" } = {}) {
      const u = await hero.hochladen(pfad, name, mime);
      const id = Number(projektId);
      if (mime === "application/pdf") {
        return (await schreiber.heroSchreiben(`mutation($u:String!,$id:Int!,$d:CustomerDocumentInput!){ upload_document(target:project_match, target_id:$id, file_upload_uuid:$u, document:$d){ id } }`, { u, id, d: { document_type_id: dokumenttyp } }, projektId)).upload_document.id;
      }
      return (await schreiber.heroSchreiben(`mutation($u:String!,$id:Int!,$k:String){ upload_image(target:project_match, target_id:$id, file_upload_uuid:$u, image_category:$k){ id } }`, { u, id, k: bildkategorie }, projektId)).upload_image.id;
    },
    async logbuchEintrag(projektId, text) {
      const e = { target: "project_match", target_id: Number(projektId), custom_text: text };
      return (await schreiber.heroSchreiben(`mutation($e:LogbookEntryInput){ add_logbook_entry(logbook_entry:$e){ id } }`, { e }, projektId)).add_logbook_entry;
    },
  };
}
