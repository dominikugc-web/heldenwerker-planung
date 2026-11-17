# Profile und Feedback-Postfach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Profile mit Rolle aus dem Tailscale-Login, Team-Verwaltung für Admins, Name an Planungen und im Logbuch, Feedback mit Status.
**Architecture:** Neues Modul `server/profile.mjs` (JSON-Datei `daten/profile.json`), der Server hängt jedem Request `k.profil` an; Rechte prüfen über `k.profil.rolle === "admin"` statt `k.inhaber`. Oberfläche nur in `web/app.js`/`web/style.css`.
**Tech Stack:** wie Hauptplan.
**Spec:** `docs/Planungstool Design.md`, Nachtrag 17.11.2026.

## Global Constraints
- Alles aus dem Hauptplan gilt. Texte duzen, keine Gedankenstriche.
- `profile.json` wird höchstens alle 5 Minuten pro Person für „zuletzt aktiv“ geschrieben.

## Review Focus
1. Letzter Admin stuft sich herab: 400, sonst sperrt er sich aus. (Test Task 1)
2. Planer ruft Team- oder Feedback-Routen auf: 403. (Tests Task 1 und 3)
3. Name mit Sonderzeichen oder leer im Tailscale-Kopf: Fallback auf Login, kein Absturz. (Test Task 1)

### Task 1: Profile, Team, Rollen
**Files:** Create `server/profile.mjs`, `test/profile.test.mjs`; Modify `server/main.mjs`, `server/routen-planungen.mjs` (`/api/ich`), `server/feedback.mjs` (Rechte).
**Interfaces:** `erstelleProfile({datenDir, inhaber}) -> { fuer(login, name) -> Profil, alle() -> Profil[], aendern(login, {name, rolle}) -> Profil, nameVon(login) -> string }`; `Profil = {login, name, rolle: "admin"|"planer", erstellt, zuletzt}`. Routen: `GET /api/ich -> {login, name, rolle, inhaber, feedbackNeu?}`, `GET /api/team`, `PUT /api/team/:login`.
- [ ] Tests: erstes Aufrufen legt Profil an, Inhaber wird admin; leerer Name fällt auf Login zurück; zuletzt wird nur nach 5 Minuten neu geschrieben; Team-Routen 403 für Planer; Rolle ändern klappt; letzter Admin 400.
- [ ] Umsetzen, grün, Commit.

### Task 2: Name an Planung und im Logbuch
**Files:** Modify `server/routen-planungen.mjs`, `server/abschluss.mjs`, `server/main.mjs`; Tests in `test/planungen.test.mjs`, `test/abschluss.test.mjs`.
**Interfaces:** Planungs-Antworten bekommen `personName`; `erstelleAbschluss({..., nameVon})`; Logbuch-Hinweis „Aufgenommen von <Name> am <TT.MM.JJJJ>“.
- [ ] Tests, umsetzen, grün, Commit.

### Task 3: Feedback Neu/Erledigt
**Files:** Modify `server/feedback.mjs`, `test/feedback.test.mjs`.
**Interfaces:** Feedback-Eintrag bekommt `status: "neu"|"erledigt"`; `PUT /api/feedback/:id {status}` nur Admin; `/api/ich` liefert Admins `feedbackNeu`.
- [ ] Tests, umsetzen, grün, Commit.

### Task 4: Oberfläche
**Files:** Modify `web/app.js`, `web/style.css`, `web/pruefung.js`, `web/demo-daten.json`.
- [ ] Einstellungen: „Team“ (Liste, Sheet zum Ändern), „Feedback“ mit Neu/Erledigt; Lampe mit rotem Punkt; „von <Vorname>“ an Planungen; Prüfansicht zeigt den Anleger.
- [ ] Sichtprüfung Handy hell/dunkel, Commit, veröffentlichen, Server neu starten.
