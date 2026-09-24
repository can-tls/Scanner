import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCardmarketSearch } from '../cardmarket-search.mjs';
import { slugify, buildCardmarketLink } from '../cardmarket-link.mjs';

test('Direktlinks entfernen Doppelpunkte ohne zusätzlichen Bindestrich', () => {
  assert.equal(slugify('I:P Masquerena'), 'IP-Masquerena');
  assert.equal(slugify('Droll & Lock Bird'), 'Droll-Lock-Bird');
  const variant = { cardId: 1, cardName: 'I:P Masquerena', setName: 'Test Set', rarity: 'Common', normalizedSetCode: 'TEST-001' };
  assert.equal(buildCardmarketLink(variant, [variant], { raw: 'TEST-001' }, {}, {}).url,
    'https://www.cardmarket.com/de/YuGiOh/Products/Singles/Test-Set/IP-Masquerena');
});

test('Backup verwendet feste Seltenheits-IDs unabhängig von V1/V2', () => {
  for (const [rarity, id] of [['Common', 1], ['Rare', 28], ['Super Rare', 3], ['Ultra Rare', 4],
    ['Secret Rare', 5], ["Collector's Rare", 214], ['Quarter Century Secret Rare', 292], ['Starlight Rare', 196]]) {
    const url = new URL(buildCardmarketSearch({ cardName: 'I:P Masquerena', rarity, cardmarket: { version: 7 } }));
    assert.equal(url.pathname, '/de/YuGiOh/Products/Singles');
    assert.equal(url.searchParams.get('idRarity'), String(id));
    assert.equal(url.searchParams.get('searchString'), 'I:P Masquerena');
    assert.equal(url.searchParams.get('searchMode'), 'v2');
    assert.equal(url.searchParams.get('language'), '1,3');
    assert.equal(url.searchParams.get('sellerCountry'), '7');
    assert.equal(url.searchParams.get('minCondition'), '2');
  }
});

test('Unbekannte Seltenheiten bekommen keinen Filter; Sonderzeichen bleiben Suchtext', () => {
  for (const rarity of ['Ultimate Rare', 'Gold Rare', 'constructor', '', undefined]) {
    const url = new URL(buildCardmarketSearch({ cardName: 'Droll & Lock Bird', rarity }));
    assert.equal(url.searchParams.has('idRarity'), false);
    assert.equal(url.searchParams.get('searchString'), 'Droll & Lock Bird');
  }
  const name = 'Kuriboh Multiply! &idRarity=999#test';
  const url = new URL(buildCardmarketSearch({ cardName: name, rarity: 'Rare' }));
  assert.equal(url.searchParams.get('searchString'), name);
  assert.equal(url.searchParams.get('idRarity'), '28');
  assert.equal(url.hash, '');
  assert.equal(buildCardmarketSearch({ cardName: '', rarity: 'Rare' }), null);
});
