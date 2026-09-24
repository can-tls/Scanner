import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSetCodes } from '../scan-suggestions.mjs';
import { readCardInFrame } from '../auto-scan.mjs';
import { readFile } from 'node:fs/promises';
import { createIndex, lookup as lookupCatalog } from '../catalog-core.mjs';

test('LSDD wird mit echtem Katalog gezielt L5DD; Sprache, Teildeck und Nummer bleiben erhalten', async () => {
  const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  const index = createIndex(catalog);
  const find = input => lookupCatalog(index, input);
  const suggest = raw => suggestSetCodes(index.prefixes, raw, find);
  const reading = readCardInFrame(ocr('LSDD-DEY37'), image, find, new Set(), suggest);
  assert.equal(reading.candidate.setCode, 'L5DD-DEY37');
  assert.equal(reading.candidate.rawSetCode, 'LSDD-DEY37');
  assert.equal(reading.candidate.cardName, 'Accel Synchro Stardust Dragon');
  const similar = () => ({ variants: [card] });
  const selective = ({ setCode }) => setCode.startsWith('LSDD') ? { variants: [] } : similar();
  assert.deepEqual(suggestSetCodes(['L5DD', 'L6DD'], 'LSDD-DEY37', selective).map(v => v.setCode), ['L5DD-DEY37']);
  assert.deepEqual(suggestSetCodes(['L6DD'], 'LSDD-DEY37', selective), []);
});

const card = { cardId: 1, cardName: 'Example', setName: 'Example Set' };
const lookup = ({ setCode }) => ({ variants: setCode === 'L5DD-DE001' ? [card, { ...card, rarity: 'Rare' }] : [] });
const suggest = raw => suggestSetCodes(['L5DD'], raw, lookup);

test('RAOS wird gezielt RA05, ohne auf andere RA-Sets oder Kartennummern auszuweichen', () => {
  const raLookup = ({ setCode }) => ({ variants: ['RA05-DE022', 'RA03-DE022'].includes(setCode) ? [card] : [] });
  const raSuggest = raw => suggestSetCodes(['RA03', 'RA05'], raw, raLookup);
  for (const raw of ['RAOS-DE022', 'RAO5-DE022', 'RA0S-DE022', 'RAQS-DE022']) {
    assert.deepEqual(raSuggest(raw).map(v => v.setCode), ['RA05-DE022']);
  }
  assert.deepEqual(raSuggest('RAOS-DE023'), []);
  assert.deepEqual(suggestSetCodes(['RA03'], 'RAOS-DE022', raLookup), []);
  assert.deepEqual(raSuggest('RA05-DE023'), []);
  const reading = readCardInFrame(ocr('RAOS-DE022'), image, raLookup, new Set(), raSuggest);
  assert.equal(reading.candidate.setCode, 'RA05-DE022');
  assert.equal(reading.candidate.rawSetCode, 'RAOS-DE022');
});

test('Ein Zeichen im Präfix darf abweichen, fehlen oder zu viel sein; Raritäten bleiben ein Vorschlag', () => {
  for (const raw of ['LSDD-DE001', 'L5D-DE001', 'L5DDD-DE001']) {
    const results = suggest(raw);
    assert.equal(results.length, 1);
    assert.equal(results[0].setCode, 'L5DD-DE001');
    assert.equal(results[0].rawSetCode, raw);
  }
});
test('Ziffern, Sprache und Teildeck werden nicht geändert; bekannte Sets nicht umgedeutet', () => {
  for (const raw of ['LSDD-DE002', 'LSDD-DEO01', 'LSDD-EN001', 'LSDD-DEJ001', 'XXXX-DE001', 'L5DD-DE002']) {
    assert.deepEqual(suggest(raw), []);
  }
  assert.deepEqual(suggestSetCodes(['LSDD', 'L5DD'], 'LSDD-DE001', lookup), []);
});
const image = { width: 1200, height: 1600 };
const ocr = text => ({ blocks: [{ lines: [{ text, frame: { x: 600, y: 1050, width: 400, height: 35 } }] }] });
test('Ein einzelner ähnlicher Treffer wird zur Bestätigung markiert und Originaltext bleibt erhalten', () => {
  const result = readCardInFrame(ocr('LSDD-DE001'), image, lookup, new Set(), suggest);
  assert.equal(result.candidate.setCode, 'L5DD-DE001');
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.candidate.corrected, true);
  assert.equal(result.text, 'LSDD-DE001');
});
test('Mehrere ähnliche Sets werden zur Auswahl angeboten, nicht automatisch gewählt', () => {
  const multipleLookup = ({ setCode }) => ({ variants: ['L5DD-DE001', 'L6DD-DE001'].includes(setCode) ? [card] : [] });
  const choices = suggestSetCodes(['L5DD', 'L6DD'], 'LZDD-DE001', multipleLookup);
  assert.equal(choices.length, 2);
  const result = readCardInFrame(ocr('LZDD-DE001'), image, lookup, new Set(), () => choices);
  assert.equal(result.candidate, null);
  assert.deepEqual(result.suggestions, choices);
});
test('Ungültige OCR-Lesarten bleiben sichtbar, obwohl kein Set-Code geparst werden kann', () => {
  const result = readCardInFrame(ocr('LSDD ???'), image, lookup, new Set(), suggest);
  assert.equal(result.candidate, null);
  assert.equal(result.text, 'LSDD ???');
});
