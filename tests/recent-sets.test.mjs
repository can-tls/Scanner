import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyCatalogAdditions } from '../catalog-additions.mjs';
import { mergeCatalog } from '../catalog-update.mjs';
const json = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const catalog = await json('catalog');
const additions = await json('recent-set-additions');

test('CORI und MAMO enthalten alle offiziell bestätigten Karten; New ist keine Seltenheit', () => {
  const combined = applyCatalogAdditions(catalog, additions);
  for (const [prefix, count] of [['CORI', 100], ['MAMO', 126]]) {
    const variants = combined.variants.filter(v => v.setPrefix === prefix);
    assert.equal(new Set(variants.map(v => v.cardId)).size, count);
    assert.equal(new Set(variants.map(v => v.normalizedSetCode)).size, count);
    assert.ok(variants.every(v => v.rarity !== 'New'));
  }
  assert.equal(combined.variants.find(v => v.setCode === 'MAMO-EN013').cardName,
    'Odd-Eyes Pendulum Dragon, Four Heavenly Dragons');
});

test('Geprüfte MAMO-Seltenheiten bleiben trotz erneutem API-Import erhalten', () => {
  const combined = applyCatalogAdditions(mergeCatalog(catalog, catalog), additions);
  assert.deepEqual(combined.variants.filter(v => v.setCode === 'MAMO-EN001').map(v => v.rarity).sort(),
    ['Grand Master Rare', 'Starlight Rare', 'Ultra Rare']);
  assert.equal(additions.replaceCodes.length, 18);
  assert.equal(additions.variants.length, 54);
});
