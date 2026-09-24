import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndex, lookup, parseSetCode } from '../catalog-core.mjs';
import { extractSetCode, parseCardText } from '../scan-parser.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const index = createIndex(catalog);
test('Dictionary retains every imported edition', () => {
  assert.equal(Object.values(index.bySetCode).flat().length, catalog.variants.length);
  assert.ok(catalog.variants.length > 40000);
});
test('German scan resolves card and full set name', () => {
  const result = lookup(index, {setCode:'SDJ-G001',cardName:'Rotäugiger schwarzer Drache'});
  assert.equal(result.warning,null);
  assert.equal(result.variants.length,1);
  assert.equal(result.variants[0].setName,'Starter Deck: Joey');
});
test('Variants remain restricted to scanned card and set for different cards', () => {
  const result = lookup(index,{setCode:'MZMU-DE011'});
  assert.deepEqual(result.variants.map(v=>v.rarity).sort(),["Collector's Rare",'Secret Rare']);
  assert.ok(result.variants.every(v=>v.cardName==='Dark Magician of Destruction' && v.setName==='Maze of Muertos'));
  const other = lookup(index,{setCode:'RA03-DE081'});
  assert.ok(other.variants.length>1);
  assert.ok(other.variants.every(v=>v.cardName==='Red-Eyes Black Dragon' && v.setName==='Quarter Century Bonanza'));
});
test('Missing codes and mismatched names stay visible', () => {
  assert.deepEqual(lookup(index,{setCode:'ZZZZ-999'}).variants,[]);
  assert.ok(lookup(index,{setCode:'SDJ-001',cardName:'Wrong Name'}).warning);
  assert.throws(()=>lookup(index,{setCode:'SDJ'}));
});
test('Language and subdeck letters survive parsing', () => {
  assert.equal(parseSetCode('SDJ-G001').language,'DE');
  assert.equal(parseSetCode('LDK2-ENJ01').normalized,'LDK2-J01');
  assert.equal(extractSetCode('SD1-EN002').setCode,'SD1-EN002');
  assert.equal(extractSetCode('LDK2-ENJ01').setCode,'LDK2-ENJ01');
});
test('OCR-to-catalog works with network disabled', () => {
  const scan = parseCardText({blocks:[{lines:[{text:'Rotäugiger schwarzer Drache',frame:{y:10}},{text:'SDJ-G001',frame:{y:300}}]}]});
  const original = globalThis.fetch;
  globalThis.fetch=()=>{throw new Error('Network disabled');};
  try {assert.equal(lookup(index,scan).variants[0].cardName,'Red-Eyes Black Dragon');}
  finally {globalThis.fetch=original;}
});
