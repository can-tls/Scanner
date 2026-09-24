import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../catalog-download.mjs';
import { downloadCatalogUpdate, mergeCatalog, validateCatalog } from '../catalog-update.mjs';

const cards = [{ id: 1, name: 'Example', card_sets: [
  { set_code: 'TEST-EN001', set_name: 'Test Set', set_rarity: 'Common' },
] }];
const german = [{ id: 1, name: 'Beispiel' }];
const sets = [{ set_name: 'Test Set' }];
const catalog = buildCatalog(cards, german, sets);
function source(versions = ['2.0', '2.0']) {
  return async url => {
    if (url.includes('checkDBVer')) return [{ database_version: versions.shift() }];
    if (url.includes('language=de')) return { data: german };
    if (url.includes('cardsets')) return sets;
    return { data: cards };
  };
}
test('Gleiche oder ältere Version lädt keine Kartendaten', async () => {
  for (const version of ['2.0', '1.99']) {
    let calls = 0;
    assert.equal(await downloadCatalogUpdate({ ...catalog, sourceVersion: '2.0' }, async () => {
      calls++; return [{ database_version: version }];
    }), null);
    assert.equal(calls, 1);
  }
});
test('Erster Abgleich und neue Version übernehmen Übersetzungen und Quellversion', async () => {
  const result = await downloadCatalogUpdate(catalog, source());
  assert.equal(result.sourceVersion, '2.0');
  assert.equal(result.variants[0].cardNameDe, 'Beispiel');
  assert.equal(catalog.sourceVersion, undefined);
});
test('Wechselnde Version, leere Daten und Netzwerkfehler brechen ohne Änderung ab', async () => {
  await assert.rejects(downloadCatalogUpdate(catalog, source(['2.0', '2.1'])), /gerade geändert/);
  await assert.rejects(downloadCatalogUpdate(catalog, async url => url.includes('checkDBVer')
    ? [{ database_version: '2.0' }] : { data: [] }), /vollständigen Daten/);
  await assert.rejects(downloadCatalogUpdate(catalog, async () => { throw new Error('offline'); }), /offline/);
  assert.equal(catalog.variants.length, 1);
});
test('Lokale Ergänzungen bleiben; neuere Daten gewinnen bei gleicher ID', () => {
  const local = { ...catalog, variants: [...catalog.variants, { ...catalog.variants[0], id: 'local' }] };
  const next = { ...catalog, variants: [{ ...catalog.variants[0], cardNameDe: 'Neu' }] };
  const merged = mergeCatalog(local, next);
  assert.equal(merged.variants.length, 2);
  assert.equal(merged.variants[0].cardNameDe, 'Neu');
  assert.equal(merged.variants[1].id, 'local');
});
test('Beschädigte gespeicherte Kataloge werden abgelehnt', () => {
  for (const invalid of [null, {}, { ...catalog, variants: [] }, { ...catalog, variants: [{ id: 'x' }] }]) {
    assert.throws(() => validateCatalog(invalid), /unvollständig/);
  }
});
