import { extractSetCode, extractScanCodeCandidates } from './scan-parser.mjs';
import { normalizeName } from './catalog-core.mjs';

// Dieselben relativen Maße verwenden Overlay und OCR. Vorschau und Foto sind hochkant 3:4.
export const CARD_FRAME = { x: 0.12, y: 0.085, width: 0.76, height: 0.83 };
export const CODE_FRAME = { x: 0.08, y: 0.40, width: 0.84, height: 0.20 };

// Drei gleiche vollständige Lesarten in den letzten fünf Bildern; keine Zeichen erfinden.
export function createScanConsensus() {
  const recent = [];
  return candidate => {
    recent.push(candidate?.key ?? null);
    if (recent.length > 5) recent.shift();
    const count = candidate ? recent.filter(key => key === candidate.key).length : 0;
    return { count, required: 3, candidate: count >= 3 ? candidate : null };
  };
}

function inside(frame, region) {
  if (!frame || ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite)) return false;
  return frame.width > 0 && frame.height > 0 && frame.x >= region.x && frame.y >= region.y &&
    frame.x + frame.width <= region.x + region.width && frame.y + frame.height <= region.y + region.height;
}

export function readCardInFrame(result, image, lookup, rememberedNames = new Set(), suggest = () => [], mode = 'card') {
  // Ein anderes Bildformat würde den sichtbaren Rahmen falsch auf das Foto übertragen.
  if (!(image.width > 0 && image.height > 0) || Math.abs(image.width / image.height - 0.75) > 0.025) {
    return { candidate: null, hint: 'Bitte das Handy aufrecht halten.' };
  }
  const frame = mode === 'code' ? CODE_FRAME : CARD_FRAME;
  const region = {
    x: frame.x * image.width, y: frame.y * image.height,
    width: frame.width * image.width, height: frame.height * image.height,
  };
  // Kein Rückgriff auf result.text: Dort steht auch der gesamte Hintergrundtext.
  const lines = (result.blocks ?? []).flatMap(block => block.lines ?? [])
    .filter(line => inside(line.frame, region));
  const titleLines = mode === 'code' ? [] : lines.filter(line => line.frame.y + line.frame.height / 2 < region.y + region.height * 0.2);
  // Namen während dieser Kamerasitzung behalten, auch wenn spätere Bilder unscharf sind.
  // Sie helfen bei mehrdeutigen Codes, überschreiben aber niemals eine eindeutige Code-Zuordnung.
  for (const line of titleLines) {
    const name = normalizeName(line.text);
    if (name.length >= 3 && !extractSetCode(line.text)) rememberedNames.add(name);
  }
  const codeLines = mode === 'code' ? lines : lines.filter(line => line.frame.y + line.frame.height / 2 > region.y + region.height * 0.5);
  const codes = new Map();
  const rawCodes = [];
  for (const line of codeLines) {
    // Auch mehrere Codes in einer Zeile dürfen nicht als eindeutiger Treffer gelten.
    for (const text of extractScanCodeCandidates(line.text)) {
      rawCodes.push(text);
      const parsed = extractSetCode(text, lookup);
      if (parsed) codes.set(parsed.setCode, parsed);
    }
  }
  const details = { rawCodes, text: codeLines.map(line => line.text).join('\n'), suggestions: [] };
  if (codes.size !== 1) return { ...details, candidate: null, hint: codes.size > 1
    ? 'Mehrere Codes gelesen. OCR-Details zeigen die Lesarten.' : 'Noch kein vollständiger Set-Code gelesen.' };
  const parsed = [...codes.values()][0];
  const found = lookup({ setCode: parsed.setCode });
  if (!found.variants.length) {
    // Erst die Zahl korrigieren, dann ein unbekanntes Set-Präfix vergleichen.
    // So kann z. B. LSDD-DEO01 auch zum geprüften L5DD-DE001 führen.
    const suggestions = rawCodes.length === 1 ? suggest(parsed.setCode).map(value => ({ ...value, rawSetCode: rawCodes[0] })) : [];
    const candidate = suggestions.length === 1 ? suggestions[0] : null;
    return { ...details, suggestions, candidate, needsConfirmation: !!candidate,
      hint: candidate ? `Set-Code angepasst: ${rawCodes[0]} → ${candidate.setCode}`
        : suggestions.length ? 'Ähnliche Sets gefunden. Bitte einen Vorschlag auswählen.'
          : `Nicht im Katalog zugeordnet: ${rawCodes.join(' / ')}` };
  }
  let cards = new Map(found.variants.map(variant => [variant.cardId, variant]));
  // Ein einziger gültiger Set-Code genügt. Seltenheiten werden anschließend ausgewählt.
  if (cards.size > 1) {
    cards = new Map([...cards].filter(([, variant]) =>
      [variant.cardName, variant.cardNameDe].some(name => name && rememberedNames.has(normalizeName(name)))));
  }
  if (cards.size !== 1) return { ...details, candidate: null,
    suggestions: [...new Map(found.variants.map(v => [v.cardId, v])).values()].map(v => ({
      ...parsed, cardName: v.cardNameDe || v.cardName, setName: v.setName,
      key: parsed.setCode + '|' + v.cardId,
    })), hint: `Mehrdeutiger Set-Code: ${rawCodes.join(' / ')}. Bitte einen Vorschlag auswählen.` };
  const card = [...cards.values()][0];
  const cardName = card.cardNameDe || card.cardName;
  return {
    ...details,
    candidate: { ...parsed, cardName, key: parsed.setCode + '|' + card.cardId },
    hint: cardName + ' erkannt.',
  };
}

// Auch bei schnellem Schließen und Wiederöffnen die alte OCR erst fertig aufräumen lassen.
let cameraWork = Promise.resolve();

// Aufnahme -> OCR -> Löschen -> nächste Aufnahme. Niemals zwei Bilder gleichzeitig verarbeiten.
// stop() verhindert auch nach Abbrechen oder App-Wechsel verspätete Treffer.
export function startAutoScan({ capture, recognize, remove, lookup, suggest, onReading = () => {}, onHint, onMatch, onError, delayMs = 650, mode = 'card' }) {
  let stopped = false;
  let timer;
  let failures = 0;
  let attempts = 0;
  const rememberedNames = new Set();
  const confirm = createScanConsensus();
  async function processFrame() {
    if (stopped) return;
    let photo;
    let match;
    try {
      photo = await capture();
      if (stopped) return;
      const result = await recognize(photo.uri);
      if (stopped) return;
      const reading = readCardInFrame(result, photo, lookup, rememberedNames, suggest, mode);
      const confirmation = confirm(reading.candidate);
      // Eindeutige Katalogtreffer sofort übernehmen; nur unsichere Set-Korrekturen sammeln.
      match = reading.needsConfirmation ? confirmation.candidate : reading.candidate;
      reading.confirmation = { count: confirmation.count, required: confirmation.required };
      if (reading.candidate && !match) reading.hint = `${reading.candidate.cardName}: ${confirmation.count}/3 bestätigt – ruhig halten.`;
      onReading(reading);
      onHint(reading.hint);
      failures = 0;
    } catch {
      confirm(null);
      failures += 1;
      if (!stopped && failures >= 3) {
        stopped = true;
        onError('Die Kamera konnte gerade keinen Text lesen. Bitte erneut starten oder manuell suchen.');
      }
    } finally {
      // Auch abgebrochene und fehlgeschlagene Aufnahmen aus dem App-Cache entfernen.
      if (photo?.uri) {
        try { await remove(photo.uri); }
        catch {
          if (!stopped) onError('Zwischenbilder konnten nicht gelöscht werden. Bitte den Scanner neu starten.');
          stopped = true;
        }
      }
    }
    if (stopped) return;
    if (match) { stopped = true; onMatch(match); return; }
    attempts += 1;
    if (attempts >= 40) {
      stopped = true;
      onError('Noch kein sicherer Treffer. Bitte Licht und Ausrichtung prüfen oder manuell suchen.');
      return;
    }
    timer = setTimeout(next, delayMs);
  }
  function next() {
    cameraWork = cameraWork.catch(() => {}).then(processFrame);
  }
  timer = setTimeout(next, delayMs);
  return () => { stopped = true; clearTimeout(timer); };
}
