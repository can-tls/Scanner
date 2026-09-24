import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndex, lookup } from '../catalog-core.mjs';
import { readCardInFrame } from '../auto-scan.mjs';
import { extractSetCode, extractScanCodeCandidates } from '../scan-parser.mjs';
import { suggestSetCodes } from '../scan-suggestions.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const index = createIndex(catalog);
const find = input => lookup(index, input);

test('O vor Ziffern wird für CH01 kataloggestützt links und rechts korrigiert', () => {
  for (const raw of ['CHO1-DE043', 'CH01-DEO43', 'CHO1-DEO43']) {
    const reading = readCardInFrame({ blocks: [{ lines: [{ text: raw,
      frame: { x: 600, y: 1050, width: 300, height: 35 } }] }] },
    { width: 1200, height: 1600 }, find);
    assert.equal(reading.candidate.setCode, 'CH01-DE043');
    assert.equal(reading.candidate.rawSetCode, raw);
    assert.deepEqual(reading.rawCodes, [raw]);
    assert.ok(find(reading.candidate).variants.every(v => v.cardName === 'Albion the Branded Dragon'));
  }
});

test('Echte O-Buchstaben in EGO1 und LAVD bleiben erhalten', () => {
  for (const raw of ['EGO1-EN006', 'LAVD-ENO34', 'LAVD-DEO34']) {
    assert.equal(extractSetCode(raw, find).setCode, raw);
  }
});

test('Eine unbekannte vollständige Zielzuordnung wird nicht als Präfixkorrektur übernommen', () => {
  const parsed = extractSetCode('CHO1-DE999', find);
  assert.equal(parsed.setCode, 'CHO1-DE999');
  assert.equal(find(parsed).variants.length, 0);
});

test('O und Q an jeder Nummernposition gelangen durch den Kamerafilter und werden Zahlen', () => {
  for (const [raw, expected] of [
    ['SDJ-GO01', 'SDJ-G001'], ['SDJ-G0O1', 'SDJ-G001'], ['SDJ-G01O', 'SDJ-G010'],
    ['SDJ-GQ01', 'SDJ-G001'], ['SDZW-DE0O1', 'SDZW-DE001'],
  ]) {
    assert.deepEqual(extractScanCodeCandidates(raw), [raw]);
    const reading = readCardInFrame({ blocks: [{ lines: [{ text: raw,
      frame: { x: 200, y: 680, width: 500, height: 35 } }] }] },
    { width: 1200, height: 1600 }, find, new Set(), undefined, 'code');
    assert.equal(reading.candidate.setCode, expected, raw);
    assert.equal(reading.needsConfirmation, undefined);
  }
});

test('J-Verwechslungen finden Joey, echte nummerierte Structure Decks bleiben unverändert', () => {
  for (const raw of ['SDI-G001', 'SDL-G0O1', 'SD1-G001', 'SD7-G001']) {
    assert.equal(extractSetCode(raw, find).setCode, 'SDJ-G001', raw);
  }
  for (const raw of ['SD1-EN001', 'SD7-EN001', 'LDK2-ENJ01', 'LAVD-ENO34']) {
    assert.equal(extractSetCode(raw, find).setCode, raw);
  }
  assert.equal(extractSetCode('SDI-G999', find).setCode, 'SDI-G999');
});

test('Zahlenkorrektur und anschließender Set-Vorschlag funktionieren gemeinsam', () => {
  const reading = readCardInFrame({ blocks: [{ lines: [{ text: 'LSDD-DEYO1',
    frame: { x: 200, y: 680, width: 500, height: 35 } }] }] },
  { width: 1200, height: 1600 }, find, new Set(), raw => suggestSetCodes(index.prefixes, raw, find), 'code');
  assert.equal(reading.candidate.setCode, 'L5DD-DEY01');
  assert.equal(reading.candidate.rawSetCode, 'LSDD-DEYO1');
  assert.equal(reading.needsConfirmation, true);
});
