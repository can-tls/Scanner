import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyCatalogAdditions } from '../catalog-additions.mjs';
import { createIndex, lookup, parseSetCode } from '../catalog-core.mjs';
import { mergeCatalog, validateCatalog } from '../catalog-update.mjs';
import { extractSetCode } from '../scan-parser.mjs';
import { readCardInFrame } from '../auto-scan.mjs';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const additions = JSON.parse(await readFile(new URL('../data/catalog-additions.json', import.meta.url), 'utf8'));
const combined = applyCatalogAdditions(catalog, additions);
const index = createIndex(combined);

test('S-Teildeck bleibt im Scan erhalten; DES22 wird nicht DE522', () => {
  for (const code of ['L26D-DES22', 'L26D-ENS22', 'L26D-DEM10', 'L26D-DEX43']) {
    assert.equal(extractSetCode(code).setCode, code);
  }
  assert.equal(extractSetCode('L26D-DE522').setCode, 'L26D-DE522');
  const reading = readCardInFrame({ blocks: [{ lines: [{ text: 'L26D-DES22',
    frame: { x: 600, y: 1050, width: 300, height: 35 } }] }] },
  { width: 1200, height: 1600 }, input => lookup(index, input));
  assert.equal(reading.candidate.setCode, 'L26D-DES22');
  assert.equal(reading.candidate.cardName, 'Himmelsjäger-Mobilisierung - Verbindung!');
  assert.deepEqual(reading.rawCodes, ['L26D-DES22']);
});

test('Recherchierte Ausgaben sind vollständig, eindeutig und mit Quelle dokumentiert', () => {
  validateCatalog(combined);
  assert.equal(additions.variants.length, 304);
  assert.equal(new Set(additions.variants.map(v => v.id)).size, 304);
  assert.equal(additions.replaceCodes.length, 220);
  assert.deepEqual(new Set(additions.replaceCodes), new Set(additions.variants.map(v => v.setCode)));
  for (const variant of additions.variants) {
    assert.equal(parseSetCode(variant.setCode).normalized, variant.normalizedSetCode);
    assert.ok(['Common', 'Ultra Rare', 'Secret Rare', 'Starlight Rare'].includes(variant.rarity));
    assert.match(variant.source, /^https:\/\/www\.db\.yugioh-card\.com\//);
    assert.ok(variant.cardNameDe && !/&[a-z]+;/i.test(variant.cardNameDe));
  }
});

test('Fehlende Raritäten werden ergänzt und Stückzahlen nicht als Raritäten angeboten', () => {
  assert.deepEqual(lookup(index, { setCode: 'L26D-DES22' }).variants.map(v => v.rarity).sort(), ['Common', 'Secret Rare']);
  assert.deepEqual(lookup(index, { setCode: 'L26D-DES31' }).variants.map(v => v.rarity).sort(),
    ['Secret Rare', 'Starlight Rare', 'Ultra Rare']);
});

test('API-Update und erneutes Laden können geprüfte Codes nicht überschreiben', () => {
  const correct = additions.variants.find(v => v.setCode === 'L26D-DES22');
  const wrong = { ...correct, id: 'bad-api-entry', cardId: 999, cardName: 'Wrong', rarity: '2' };
  const downloaded = { ...catalog, variants: [wrong], updatedAt: '2026-09-12T00:00:00Z' };
  // Derselbe Aufbau wird beim Aktualisieren und beim Laden einer gespeicherten API-Datei verwendet.
  const merged = applyCatalogAdditions(mergeCatalog(catalog, downloaded), additions);
  const loaded = applyCatalogAdditions(mergeCatalog(catalog, JSON.parse(JSON.stringify(downloaded))), additions);
  assert.deepEqual(loaded, merged);
  assert.ok(!merged.variants.some(v => v.id === wrong.id));
  assert.deepEqual(merged.variants.filter(v => v.setCode === correct.setCode),
    additions.variants.filter(v => v.setCode === correct.setCode));
  assert.deepEqual(merged.variants.filter(v => v.setPrefix !== 'L26D'), catalog.variants.filter(v => v.setPrefix !== 'L26D'));
  assert.ok(merged.variants.some(v => v.setCode === 'L26D-ENS36'));
});
