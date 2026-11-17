"""Wandelt eine Sprachnachricht in Text um (faster-whisper, Deutsch).

Aufruf: python whisper.py <audiodatei> <modellordner> [modell]
Ausgabe: eine JSON-Zeile {"text": "..."} auf stdout. Fehler gehen nach stderr, Exit-Code 1.
Rechnet auf der CPU wie Klartext (auf der Grafikkarte fehlt cublas64_12.dll).
"""
import json
import sys

from faster_whisper import WhisperModel


def modell(ordner, name):
    return WhisperModel(name, device="cpu", compute_type="int8", download_root=ordner, local_files_only=True)


def main():
    datei, ordner = sys.argv[1], sys.argv[2]
    name = sys.argv[3] if len(sys.argv) > 3 else "medium"
    segmente, _ = modell(ordner, name).transcribe(datei, language="de", vad_filter=True, beam_size=5)
    text = " ".join(s.text.strip() for s in segmente).strip()
    print(json.dumps({"text": text}))  # ASCII-Escapes: Windows-Konsole verstümmelt sonst Umlaute


if __name__ == "__main__":
    main()
