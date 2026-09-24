# Kamera bedienen

- **Ganze Karte:** Karte in den großen Rahmen halten.
- **Set-Code nah (Standard):** Öffnet sich bei jedem Scan. Ohne gespeicherte Zoomstufe
  startet die Android-Vorschau mit bis zu 1,8×.
  Nur den Set-Code in den schmalen mittigen Rahmen halten. OCR-Ergebnisse außerhalb
  dieses Rahmens werden nicht für die Zuordnung verwendet.
- **− Zoom / + Zoom:** Vergrößerung stufenweise anpassen. Android begrenzt die
  Vergrößerung auf das unterstützte Kameramaximum. Etwas Abstand zur Karte hilft,
  wenn die Kamera aus nächster Nähe nicht scharfstellen kann.
  Die Zoomstufe bleibt beim nächsten Scan, beim Rahmenwechsel und nach einem
  App-Neustart erhalten.
- **Licht einschalten / ausschalten:** Schaltet die Handy-LED als Dauerlicht für
  die Kameravorschau hinzu (bei Geräten mit Kameralicht). Beim Schließen der Kamera
  geht das Licht aus; jeder neue Scan startet mit ausgeschaltetem Licht.
- **Antippen (Android):** Gelbes Quadrat markiert den Messpunkt für Autofokus und
  automatische Belichtung. Die Statuszeile zeigt Bestätigung oder Misserfolg.
  Nach fünf Sekunden kehrt die Kamera zur kontinuierlichen Automatik zurück.
  Auf iOS bleibt der automatische Fokus aktiv; dort ist kein Antipp-Fokus ergänzt.
- **Sicherer Treffer:** Ein eindeutig zugeordneter vollständiger Set-Code genügt
  sofort. Nur unsichere Set-Präfix-Vorschläge benötigen drei gleiche Zuordnungen
  in den letzten fünf Aufnahmen. Mehrdeutige Vorschläge bleiben manuell wählbar.
  Bei Modus-, Zoom- und Fokuswechseln beginnt die Sammlung neu.

Zwischenbilder werden nach der OCR gelöscht, auch bei Abbruch oder Fehlern.

## Android-Erweiterung bauen

`npm ci` führt `scripts/patch-camera.mjs` aus. Die Erweiterung ergänzt
`scanFocusPoint`, `onScanFocus` und `scanZoomRatio` in expo-camera **17.0.10**.
Ein Versionswechsel stoppt das Skript ausdrücklich, damit der Patch geprüft wird.
Der Patch ist wiederholt ausführbar; seine Quelle liegt außerhalb von node_modules.
Die Autolinking-Konfiguration in package.json baut expo-camera ausdrücklich aus
dem Quellcode, damit die Erweiterung statt der vorgefertigten Bibliothek verwendet wird.

Nach der Änderung ist ein neuer nativer Build nötig, etwa `npx expo run:android`.
Ein reines Neuladen von JavaScript oder Expo Go enthält die Erweiterung nicht.

Prüfung: `npm run test:catalog`; nativer Kompiliertest unter `android`:
`gradlew.bat :expo-camera:compileReleaseKotlin` mit JDK 17.
