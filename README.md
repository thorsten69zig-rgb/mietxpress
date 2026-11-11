# MietXpress Buchungen – Offline-App (PWA)

Live: https://thorsten69zig-rgb.github.io/mietxpress/
Repo: https://github.com/thorsten69zig-rgb/mietxpress (nur Code, keine Kundendaten)

## Dateien
- index.html, styles.css, app.js – Oberfläche und Logik
- db.js – lokale Datenbank (IndexedDB)
- avail.js – Verfügbarkeit / Bestand
- google.js, calsync.js, drive.js – Google-Anmeldung, Kalender, Drive-Abgleich
- sw.js – Service Worker (Offline). Bei JEDER neuen Version VERSION hochzählen (z. B. mx-v31 -> mx-v30) und in app.js "App-Version" anpassen.
- manifest.webmanifest, icon-*.png, apple-touch-icon.png, logo.jpg – App-Symbol/Logo
- pdf-lib.min.js, mietvertrag-vorlage.pdf – Mietvertrag-PDF

## Veröffentlichen
Dateien im GitHub-Repo hochladen (Add file > Upload files) und committen. GitHub Pages braucht 1-2 Minuten.
Achtung: sw.js nie leer hochladen.

## Stand dieses Backups: App-Version 19


