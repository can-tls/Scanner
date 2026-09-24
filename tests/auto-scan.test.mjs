import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanConsensus, readCardInFrame, startAutoScan } from '../auto-scan.mjs';
const image = { width: 1200, height: 1600, uri: 'cache:test' };
const card = { cardId: 1, cardName: 'Mystical Elf', cardNameDe: 'Mystische Elfe' };
const lookup = ({ setCode }) => ({ variants: setCode === 'SDY-G001' ? [card, { ...card, rarity: 'Rare' }] : [] });
const line = (text, x, y, width = 400, height = 35) => ({ text, frame: { x, y, width, height } });
const title = line('Mystische Elfe', 210, 190);
const code = line('SDY-G001', 750, 1050, 200);
const ocr = (...lines) => ({ text: 'HINTERGRUND SDY-G001', blocks: [{ lines }] });

test('Hintergrund außerhalb des Rahmens wird ignoriert, Karte bleibt trotz mehrerer Seltenheiten eindeutig', () => {
  const reading = readCardInFrame(ocr(line('Falscher Name', 0, 0), line('SDK-G001', 0, 900, 130), title, code), image, lookup);
  assert.equal(reading.candidate.cardName, 'Mystische Elfe');
  assert.equal(reading.candidate.setCode, 'SDY-G001');
});

test('Hintergrund, Name allein und Codes außerhalb des Rahmens schließen Kamera nicht', () => {
  for (const result of [ocr(), ocr(title), ocr({ text: 'SDY-G001' }), ocr(title, line('SDY-G001', 0, 1050))]) {
    assert.equal(readCardInFrame(result, image, lookup).candidate, null);
  }
});

test('Unbekannter Code und mehrere Codes sind keine sicheren Treffer', () => {
  for (const result of [ocr(title, line('ZZZZ-999', 750, 1050, 200)),
    ocr(title, code, line('SDK-G001', 500, 1150, 200)),
    ocr(title, line('SDY-G001 SDK-G001', 300, 1050, 600))]) {
    assert.equal(readCardInFrame(result, image, lookup).candidate, null);
  }
});

test('Kartentext und Set-Codes in der Titelzone ersetzen keine korrekte Position', () => {
  assert.equal(readCardInFrame(ocr(title, line('SDY-G001', 750, 230, 200)), image, lookup).candidate, null);
  assert.equal(readCardInFrame(ocr(title, code), { width: 1600, height: 1200 }, lookup).candidate, null);
});

test('Ein eindeutig zugeordneter Code reicht sofort, auch ohne oder mit falschem OCR-Namen', () => {
  for (const result of [ocr(code), ocr(line('Falscher Name', 210, 190), code)]) {
    assert.equal(readCardInFrame(result, image, lookup).candidate.cardName, 'Mystische Elfe');
  }
});

test('Ein früherer Name bleibt über leere Bilder und falsches Bildformat erhalten', () => {
  const memory = new Set();
  const ambiguous = () => ({ variants: [card, { cardId: 2, cardName: 'Dark Hole', cardNameDe: 'Schwarzes Loch' }] });
  assert.equal(readCardInFrame(ocr(title), image, ambiguous, memory).candidate, null);
  readCardInFrame(ocr(), image, ambiguous, memory);
  readCardInFrame(ocr(), { width: 0, height: 0 }, ambiguous, memory);
  assert.equal(readCardInFrame(ocr(code), image, ambiguous, memory).candidate.cardName, 'Mystische Elfe');
  // Eine neue Kamerasitzung übernimmt keine alten Hinweise.
  assert.equal(readCardInFrame(ocr(code), image, ambiguous, new Set()).candidate, null);
});

test('Gemerkter falscher Name blockiert keinen eindeutigen Code und entscheidet keine widersprüchlichen Hinweise', () => {
  const memory = new Set();
  readCardInFrame(ocr(line('Schwarzes Loch', 210, 190)), image, lookup, memory);
  assert.equal(readCardInFrame(ocr(code), image, lookup, memory).candidate.cardName, 'Mystische Elfe');
  readCardInFrame(ocr(title), image, lookup, memory);
  const ambiguous = () => ({ variants: [card, { cardId: 2, cardNameDe: 'Schwarzes Loch' }] });
  assert.equal(readCardInFrame(ocr(code), image, ambiguous, memory).candidate, null);
});

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test('Automatische Aufnahme liefert genau einen Treffer und löscht alle Zwischenbilder', async () => {
  const done = deferred();
  let captures = 0;
  const removed = [];
  const stop = startAutoScan({ capture: async () => ({ ...image, uri: 'cache:' + ++captures }),
    recognize: async () => ocr(title, code), remove: async uri => removed.push(uri), lookup,
    onHint: () => {}, onError: assert.fail, onMatch: done.resolve, delayMs: 1 });
  try {
    const result = await done.promise;
    assert.equal(result.cardName, 'Mystische Elfe');
    assert.equal(captures, 1);
    assert.deepEqual(removed, ['cache:1']);
  } finally { stop(); }
});

test('Abbruch während OCR räumt auf und liefert keine verspätete Anzeige', async () => {
  const entered = deferred(), release = deferred(), removed = deferred();
  let matches = 0, hints = 0;
  const stop = startAutoScan({ capture: async () => image,
    recognize: async () => { entered.resolve(); await release.promise; return ocr(title, code); },
    remove: async () => removed.resolve(), lookup, onHint: () => hints++, onMatch: () => matches++, onError: assert.fail, delayMs: 1 });
  await entered.promise;
  stop();
  release.resolve();
  await removed.promise;
  assert.equal(matches, 0);
  assert.equal(hints, 0);
});

test('Drei OCR-Fehler stoppen die Schleife und alle Aufnahmen werden gelöscht', async () => {
  const done = deferred();
  let cleaned = 0;
  const stop = startAutoScan({ capture: async () => image, recognize: async () => { throw Error('OCR'); },
    remove: async () => { cleaned++; }, lookup, onHint: () => {}, onMatch: assert.fail,
    onError: done.resolve, delayMs: 1 });
  await done.promise;
  // Die abschließende Bereinigung ist noch Teil desselben asynchronen Durchlaufs.
  await new Promise(resolve => setTimeout(resolve, 5));
  stop();
  assert.equal(cleaned, 3);
});

test('Schnelles Wiederöffnen wartet auf die alte OCR und deren Bereinigung', async () => {
  const entered = deferred(), release = deferred(), nextEntered = deferred();
  const order = [];
  const first = startAutoScan({ capture: async () => image,
    recognize: async () => { entered.resolve(); await release.promise; return ocr(); },
    remove: async () => { order.push('removed'); }, lookup, onHint: () => {}, onMatch: assert.fail, onError: assert.fail, delayMs: 1 });
  await entered.promise;
  first();
  let second;
  second = startAutoScan({ capture: async () => { order.push('new-capture'); nextEntered.resolve(); return image; },
    recognize: async () => ocr(), remove: async () => {}, lookup, onHint: () => {}, onMatch: assert.fail, onError: assert.fail, delayMs: 1 });
  try {
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(order, []);
    release.resolve();
    await nextEntered.promise;
    assert.deepEqual(order, ['removed', 'new-capture']);
  } finally { release.resolve(); second(); }
});

test('Fehlgeschlagenes Löschen beendet weitere Aufnahmen', async () => {
  const done = deferred();
  let captures = 0;
  const stop = startAutoScan({ capture: async () => { captures++; return image; },
    recognize: async () => ocr(title, code), remove: async () => { throw Error('storage'); }, lookup,
    onHint: () => {}, onMatch: assert.fail, onError: done.resolve, delayMs: 1 });
  try {
    assert.match(await done.promise, /gelöscht/);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(captures, 1);
  } finally { stop(); }
});

test('Aufnahmeschleife behält einen Namen auch über einen OCR-Fehler und ein leeres Bild', async () => {
  const done = deferred();
  let attempt = 0;
  const ambiguous = () => ({ variants: [card, { cardId: 2, cardNameDe: 'Schwarzes Loch' }] });
  const stop = startAutoScan({ capture: async () => image,
    recognize: async () => {
      attempt++;
      if (attempt === 1) return ocr(title);
      if (attempt === 2) throw Error('Unscharfes Bild');
      if (attempt === 3) return ocr();
      return ocr(code);
    }, remove: async () => {}, lookup: ambiguous, onHint: () => {}, onError: assert.fail,
    onMatch: done.resolve, delayMs: 1 });
  try {
    assert.equal((await done.promise).cardName, 'Mystische Elfe');
    assert.equal(attempt, 4);
  } finally { stop(); }
});

test('Nahmodus liest nur den schmalen Code-Rahmen ohne Titelzone', () => {
  const closeCode = line('SDY-G001', 200, 680, 600);
  assert.equal(readCardInFrame(ocr(closeCode), image, lookup).candidate, null);
  assert.equal(readCardInFrame(ocr(closeCode, code), image, lookup, new Set(), undefined, 'code').candidate.setCode, 'SDY-G001');
  assert.equal(readCardInFrame(ocr(code), image, lookup, new Set(), undefined, 'code').candidate, null);
});

test('Nur unsichere Set-Vorschläge benötigen mehrere Aufnahmen', async () => {
  const done = deferred();
  let captures = 0;
  const proposed = { setCode: 'SDY-G001', cardName: 'Mystische Elfe', key: 'SDY-G001|1' };
  const stop = startAutoScan({ capture: async () => { captures++; return image; },
    recognize: async () => ocr(line('SDZ-G001', 750, 1050, 200)),
    remove: async () => {}, lookup, suggest: () => [proposed],
    onHint: () => {}, onError: assert.fail, onMatch: done.resolve, delayMs: 1 });
  try {
    assert.deepEqual(await done.promise, { ...proposed, rawSetCode: 'SDZ-G001' });
    assert.equal(captures, 3);
  } finally { stop(); }
});

test('Sicherer Code beendet die Sammlung unsicherer Lesarten sofort', async () => {
  const done = deferred();
  let captures = 0;
  const stop = startAutoScan({ capture: async () => { captures++; return image; },
    recognize: async () => captures === 1 ? ocr(line('SDZ-G001', 750, 1050, 200)) : ocr(code),
    remove: async () => {}, lookup,
    suggest: () => [{ setCode: 'SDK-G001', cardName: 'Andere Karte', key: 'SDK-G001|2' }],
    onHint: () => {}, onError: assert.fail, onMatch: done.resolve, delayMs: 1 });
  try {
    assert.equal((await done.promise).setCode, 'SDY-G001');
    assert.equal(captures, 2);
  } finally { stop(); }
});

test('Drei gleiche Lesarten überbrücken zwei Ausreißer, aber bestätigen keinen einzelnen Fehlcode', () => {
  const confirm = createScanConsensus();
  const a = { key: 'SDY-G001|1' }, b = { key: 'SDK-G001|2' };
  for (const candidate of [a, b, a, null]) assert.equal(confirm(candidate).candidate, null);
  assert.deepEqual(confirm(a).candidate, a);
});

test('Veraltete Treffer verfallen und ein anderer aktueller Code wird nicht überstimmt', () => {
  const confirm = createScanConsensus();
  const a = { key: 'a' }, b = { key: 'b' };
  for (const candidate of [a, a, null, null, null, a, b]) {
    assert.equal(confirm(candidate).candidate, null);
  }
  assert.equal(createScanConsensus()(a).count, 1);
});
