# Lokaler Katalog

Die App nutzt zunächst `data/catalog.json` oder einen auf dem Handy aktualisierten Katalog und erstellt in `catalog.js` ein Dictionary:
Set-Code → Array der Kartenausgaben. Die Suchlogik in `catalog-core.mjs` läuft ohne Netzwerk.
Nach dem Foto erscheinen Karte, vollständiger Set-Name und die Seltenheitsvarianten dieser Karte im Set.
Kein Backend-Server muss gestartet werden.

Der importierte YGOPRODeck-Katalog enthält 14.524 Karten, 1.035 Set-Einträge und 44.215 Ausgaben
(09.09.2026). Artworks derselben Seltenheit werden nicht unterschieden. Die Abdeckung hängt
von der Quelle ab. Historische regionale Nummerierungen können abweichen; den Kartennamen prüfen.

Start: `npm start` im Scanner-Ordner. Die vorhandene native Development-App ist für OCR erforderlich.
Tests: `npm run test:catalog`.

Der Button „Katalog aktualisieren“ ganz unten im Verlauf prüft mit Internet die YGOPRODeck-Version.
Nur eine neue Version lädt Karten, deutsche Namen und Sets nach; beim ersten Abgleich wird einmal vollständig geladen.
Der Download wird geprüft und als Datei auf dem Handy gespeichert. Erst danach wechseln Dateiverweis und Suchindex.
Bei Fehlern bleibt der bisherige Stand nutzbar; nach Neustart wird der gespeicherte Katalog wieder geladen.
Die APK-Ausgaben bleiben als Grundlage erhalten, neue Daten derselben ID gewinnen. Link-Regeln, Preise und Verlauf bleiben separat.
`catalog-update.mjs` enthält Versionsvergleich und Prüfung, `catalog-storage.js` die dauerhafte Speicherung.

Optionales Datenupdate für die mitgelieferte Datei am PC: `npm run catalog:update`.
Danach die App neu laden/bundeln. Das Update-Script ist kein laufender Server.
Fehlgeschlagene Downloads ersetzen den vorhandenen Katalog nicht.

Quellen: https://ygoprodeck.com/api-guide/ und die dort dokumentierten Endpunkte
cardinfo.php, cardinfo.php?language=de und cardsets.php unter https://db.ygoprodeck.com/api/v7/.

Nach der Auswahl erscheint ein anklickbarer Cardmarket-Link. Eine einzelne eindeutige
Ausgabe wird automatisch ausgewählt. Die Linkbildung läuft vollständig lokal;
erst das Antippen öffnet den Browser. Optionale Preisabrufe im Entwicklungsbuild sind weiter unten beschrieben.

`cardmarket-link.mjs` bildet den Pfad aus englischem Set- und Kartennamen. Bekannte
Produktpfade in `data/cardmarket-mappings.json` haben Vorrang. Für Mystical Elf aus
SDY-001 wird die vom Benutzer bestätigte Zuordnung angewendet: E/G → V1, ohne Kennung → V2.
Andere Sprachkennungen werden für diese Ausnahme nicht geraten. Moderne EN/DE-Codes
werden weiterhin verarbeitet; sie sind nicht pauschal Versionsnummern.

`data/cardmarket-rules.json` enthält die Standard-Seltenheitsreihenfolge sowie eine
gesonderte Reihenfolge für 25th Anniversary Rarity Collection. Bei mehreren Seltenheiten
derselben Karte im selben Set wird daraus V1, V2 usw. gebildet. Doppelte Spracheinträge
zählen nicht als zusätzliche Seltenheit. Eine einzelne Seltenheit bekommt standardmäßig
keinen Versionszusatz. Das sind Ableitungsregeln, keine vollständige Cardmarket-Zuordnung:
Sonderdrucke, abweichende Set-/Produktnamen und lückenhafte Quelldaten können falsche URLs
ergeben. Die App kennzeichnet abgeleitete Links. Unbekannte Mehrfach-Seltenheitsreihenfolgen
liefern einen Hinweis statt einer erfundenen Versionsnummer.

In Entwicklungsbuilds ruft die App nur bei Auswahl einer Ausgabe nach einem Foto automatisch den Scraper auf dem PC auf und
zeigt dessen Antwort bei der Version. Dafür im Backend-Ordner `npm run scraper:serve`
laufen lassen. Der lokale Katalog selbst benötigt diesen Prozess weiterhin nicht.
Der angezeigte Browser-Link und der Scraper-Aufruf verwenden beide
`sellerCountry=7&language=1,3&minCondition=2`. Verbindungsdetails stehen in der Backend-README.

`local-store.mjs` und `local-storage.js` ergänzen den Katalog um einen dauerhaften
Preisstand auf dem Handy (AsyncStorage). Schlüssel sind Produkt-URL und feste Filter;
gespeichert werden gelesener Preistext und tatsächliches Abrufdatum mit Uhrzeit.
Manuelle Suche und Öffnen des Verlaufs starten keinen Abruf. „Preis aktualisieren“
umgeht den 30-Sekunden-Backend-Cache ausdrücklich.

Der Verlauf enthält die letzten 20 angeklickten Ausgaben mit Datum und Cardmarket-Button.
Ein Klick auf die Ausgabe oder ihren Link speichert sie sofort, auch bei manueller Suche
und ohne Preis. Automatische Vorauswahl allein erzeugt keinen Eintrag. Unterschiedliche
Versionen derselben Suche bleiben getrennt; Auswahl und Link-Klick derselben Version
aktualisieren denselben Eintrag. Bereits zugeordnete alte Einträge werden ohne Preis behalten.
Preisabrufe ändern den Verlauf nicht. Fehlt noch eine Link-Zuordnung, bleibt die Ausgabe
im Verlauf und der Cardmarket-Button ist deaktiviert.

Buttons und neue Abrufe nutzen language=1,3. Alte gespeicherte language=1-Preise behalten
ihren eigenen Schlüssel und werden nicht als Preisstand für den neuen Filter angezeigt.
Fotos selbst werden nicht archiviert.
Die App einmal mit `npx expo run:android --device` neu bauen, um das native Speichermodul einzubinden.

Alte regionale Drucke: `legacy-cardmarket-products.json` enthält belegte Produktversionen
für Schwarzes Loch (SDY/SDK) und Fallgrube (SDY), auch wenn alle Common sind. Die App
zeigt diese zur Auswahl; aus der Seltenheit allein lässt sich die Nummer nicht ableiten.
Die Zuordnung gilt nach Karte + vollständigem Set-Namen, auch bei unterschiedlichen
regionalen Kartennummern. SDY-G020 ist Schwarzes Loch, SDY-G025 ist Fallgrube.
Ein Namenswiderspruch wird angezeigt. Noch ungeklärte regionale Varianten erzeugen
keinen vermeintlich eindeutigen Link ohne Versionszusatz. Die Datensammlung ist keine
vollständige Zuordnung aller alten Cardmarket-Drucke.

Standalone-Release: `App.js` aktiviert den Scraper ausschließlich in Entwicklungsbuilds
(`__DEV__`). Die Release-APK enthält den lokalen Katalog und das lateinische OCR-Modell;
Kamera, Suche, Variantenauswahl und Linkbildung benötigen keinen PC oder Server.
Der Refresh-Button und automatische Preisabrufe sind im Release deaktiviert. Gespeicherte Preise mit passenden Filtern bleiben sichtbar.
Angeklickte Ausgaben werden auch im Release ohne Preisabruf im Verlauf gespeichert. Cardmarket öffnet sich beim Antippen im Browser.

Lokaler APK-Build: mit JDK 17 und eingerichtetem Android-SDK in `android` den Befehl
`./gradlew.bat :app:assembleRelease` ausführen (`NODE_ENV=production`). Das Ergebnis liegt
unter `android/app/build/outputs/apk/release/app-release.apk` und benötigt keinen Metro-Server.
Für die persönliche Installation verwendet dieser Build weiterhin den vorhandenen
Debug-Keystore als Signatur; es ist keine für eine Store-Veröffentlichung eingerichtete Signatur.

## Automatische Kamera-Erkennung

Kamera öffnen und eine aufrechte Karte vollständig in den blauen Rahmen halten.
AutoCardCamera.js prüft automatisch einzelne Kamerabilder mit dem vorhandenen ML-Kit-Modul;
es gibt keinen manuellen Auslöser. Zwischenbilder werden nach der Auswertung aus dem Cache gelöscht.
Das ist eine Folge automatischer Einzelaufnahmen, kein nativer Video-Frame-Processor.

Nur Textzeilen vollständig innerhalb des Rahmens werden verwendet. Ein einmal erkannter
Set-Code in der unteren Hälfte reicht, sobald er genau einer Karte im Katalog zugeordnet
werden kann. Ein gleichzeitig lesbarer Name und eine zweite Bestätigung sind nicht nötig.
Namen im oberen Fünftel werden während einer Kamerasitzung als Hinweise behalten, auch
über unscharfe Bilder und einzelne OCR-Fehler hinweg. Bei mehrdeutigen Codes können sie
die Karte eingrenzen. Ein alter oder falsch gelesener Name blockiert keinen eindeutigen Code.
Beim Schließen der Kamera endet dieser Zwischenspeicher. Mehrere Codes im selben Bild
oder unbekannte Codes lösen keinen automatischen Treffer aus. Die Seltenheitsauswahl bleibt erhalten.

Bild und Vorschau verwenden hochkant 3:4. OCR arbeitet auf korrekt gedrehten Bildern;
skipProcessing bleibt deaktiviert. In der Vorschau kann die automatische Aufnahme je nach
Gerät kurz sichtbar sein. Lesetempo und Trefferquote hängen von Fokus, Licht und Reflexionen ab.
Lange oder auf mehrere OCR-Zeilen verteilte Namen können noch manuelle Suche erfordern.
Abbrechen, Android-Zurück und App-Wechsel stoppen neue Prüfungen und verwerfen späte Treffer.
Nach 40 erfolglosen Bildern oder drei technischen Fehlern wird die Prüfung beendet.

Die Freigabe-Regeln und die Aufnahmeschleife liegen kommentiert in auto-scan.mjs und sind
mit künstlichen OCR-Koordinaten getestet. Ein Praxistest auf dem Handy ist zusätzlich nötig.
Wegen expo-file-system muss die APK bzw. der native Entwicklungsbuild neu gebaut werden.
Die Release-Einstellung für den Scraper bleibt unverändert: kein neuer Preisabruf im Release.

Set-Namen mit HTML-Zeichen werden beim Aufbau des Suchindex dekodiert. Beispiel:
Legendary 5D&apos;s Decks wird als Legendary 5D's Decks angezeigt; slugify erzeugt daraus
Legendary-5Ds-Decks. Gespeicherte Varianten-IDs werden dabei nicht verändert.

## Direktlink und Backup-Suche

Jede Ausgabe erscheint nur einmal als Karte mit ihren eigenen Aktionen. Der zusätzliche
Bereich „Ausgewählte Ausgabe“ entfällt. Nach einem Klick auf den Direktlink erscheint
bei genau dieser Ausgabe daneben „Backup-Suche“, auch wenn der Direktlink nicht geöffnet
werden konnte. Die Freigabe wird mit dem Verlauf gespeichert. Fehlt der Direktlink ganz,
ist „Backup-Suche“ sofort sichtbar, auch im Verlauf.

Produktpfade entfernen Doppelpunkte: I:P Masquerena wird zu IP-Masquerena.
Die Backup-Suche verwendet dagegen den vollständigen Kartennamen als URL-kodierten
searchString, einschließlich seiner Satzzeichen, sowie searchMode=v2. Sie verwendet
weiterhin sellerCountry=7, language=1,3 und minCondition=2.

Die festen idRarity-Werte sind Common=1, Rare=28, Super Rare=3, Ultra Rare=4,
Secret Rare=5, Collector's Rare=214, Quarter Century Secret Rare=292 und Starlight Rare=196.
Andere Seltenheiten lassen idRarity weg. Diese IDs sind unabhängig von V1/V2 usw.
Die Suchlinks werden ausschließlich im Browser geöffnet und nicht an den Produkt-Scraper gesendet.

## OCR-Details und ähnliche Set-Codes

Im Scanner stehen die zuletzt gelesenen Set-Code-Kandidaten direkt unter dem Kamerabild.
Es wird kein vollständiger OCR-Kartentext angezeigt. „Code-Vorschläge anzeigen“ öffnet die Auswahl bei mehreren Zuordnungen.
Unbekannte Set-Präfixe werden mit höchstens einer Zeicheneinfügung, Löschung oder Ersetzung verglichen.
Nummer, Sprache und Teildeck bleiben bei dieser Ähnlichkeitssuche unverändert; bekannte Präfixe werden nicht umgedeutet.
Ein einzelner Vorschlag wird automatisch übernommen, mehrere benötigen eine Auswahl. Der ursprüngliche OCR-Code bleibt erhalten.
Das ist eine heuristische Hilfe, keine Garantie: Auch ein einzelner ähnlicher Treffer kann bei falsch gelesenen Zeichen falsch sein.

## Recherchierter Zusatzkatalog (11.09.2026)

`data/catalog-additions.json` ist eine eigenständige, geprüfte Schicht über dem API-Katalog.
`catalog-additions.mjs` wendet sie beim Start, nach Laden der gespeicherten Datei und nach jedem API-Update an.
Für `replaceCodes` werden sämtliche bisherigen Zuordnungen entfernt und durch die recherchierten Varianten ersetzt.
Das verhindert auch, dass falsche API-Raritäten oder falsche Karten-IDs parallel zur Korrektur erscheinen.
Nicht geprüfte Codes bleiben erhalten. Änderungen an dieser Datei werden mit einem neuen App-Build ausgeliefert.
Der Katalog-Button lädt weiterhin nur YGOPRODeck; er verändert die Ergänzungsdatei nicht.

Geprüft: die 107 Karten der offiziellen L26D-Hauptliste, einschließlich ihrer Bonus-Raritäten aus den Detailseiten,
in Englisch und Deutsch: 220 Druckcodes / 304 Raritäts-Ausgaben. Gegenüber dem bisherigen englischen Bestand
wurden 43 Raritäts-Ausgaben ergänzt oder korrigiert (u. a. Stückzahlen „2“/„3“ fälschlich als Rarität).
Der bestehende Token-Code L26D-ENS36 ist nicht Bestandteil dieser Prüfung und bleibt unverändert.
Jede Variante enthält die Konami-Detailquelle und deren Karten-ID; die App verwendet weiterhin die YGOPRODeck-Karten-ID.
Die offizielle Set-Liste steht unter https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=1&pid=2000001598000&request_locale=de&rp=99999&sess=1 .

Scannerkorrektur: Das Teildeck-S in L26D-DES22 wird erhalten. Der alte OCR-Parser hatte es in die Ziffer 5 umgewandelt
und dadurch L26D-DE522 gesucht. Die manuelle Suche hatte diesen Fehler nicht.

## Gezielte RA-Korrektur und Cardmarket-Setnamen

Für RA0x-Präfixe werden typische OCR-Verwechslungen an den Ziffernpositionen erkannt:
RAOS, RAO5 und RA0S ergeben RA05. O/Q werden als 0, I/L als 1, Z als 2, S als 5 und B als 8 gelesen.
Die Regel gilt ausschließlich für dieses Präfixmuster und nur für ein vorhandenes Set mit passender Kartennummer.
Fehlt die gezielte Zuordnung, wird nicht auf eine andere RA-Ausgabe ausgewichen.
Der vollständige ursprüngliche OCR-Code bleibt erhalten. Der Teil nach dem Bindestrich wird nicht geändert.

`cardmarket-rules.json` enthält getrennte Set-Slugs: LCGX, LCYW und LCJW verwenden
Legendary-Collection-2-Mega-Pack, Legendary-Collection-3-Mega-Pack und Legendary-Collection-4-Mega-Pack.
Die vollständigen Katalognamen bleiben unverändert. Die jeweiligen Promo-Sets sind davon getrennt.
LC5D und LCKC wurden ebenfalls geprüft; deren automatisch erzeugte Set-Pfade stimmen bereits.
Quellen: die Set-Seiten in cardmarket-rules.json sowie
https://www.cardmarket.com/en/YuGiOh/Products/Singles/Legendary-Collection-5Ds-Mega-Pack und
https://www.cardmarket.com/en/YuGiOh/Products/Singles/Legendary-Collection-Kaiba-Mega-Pack .

## O/0-Korrektur beim Scan

Der Scanner prüft vor Zeichenkorrekturen die unveränderte vollständige Lesart im Katalog.
Dadurch bleiben echte O-Buchstaben wie EGO1-EN006 und LAVD-ENO34 erhalten.
Ist die Lesart unbekannt, kann O vor einer Ziffer im Präfix zu 0 werden, sofern der vollständige
Zielcode gefunden wird. Zusammen mit der Nummernkorrektur funktioniert damit CHO1-DEO43 → CH01-DE043.
Die letzten zwei Zeichen müssen weiterhin als echte Ziffern gelesen worden sein. Die OCR-Anzeige behält den Originalcode.
Belege für echte O-Buchstaben: https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=7099&ope=2&request_locale=en
und https://www.db.yugioh-card.com/yugiohdb/card_search.action?cid=15032&ope=2&request_locale=en .

LSDD → L5DD hat eine gezielte Präfixregel mit Vorrang vor der allgemeinen Ähnlichkeitssuche.
Beispiel: LSDD-DEY37 → L5DD-DEY37. Sprache, Teildeck und Nummer bleiben erhalten.
Ohne passenden L5DD-Katalogeintrag wird nicht auf ein anderes ähnliches Set ausgewichen.
