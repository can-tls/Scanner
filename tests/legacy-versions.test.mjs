import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndex, lookup, parseSetCode } from '../catalog-core.mjs';
import { cardmarketChoices, buildCardmarketLink } from '../cardmarket-link.mjs';
import { extractSetCode } from '../scan-parser.mjs';
const read = async file => JSON.parse(await readFile(new URL('../data/'+file, import.meta.url),'utf8'));
const index=createIndex(await read('catalog.json'));
const mappings=await read('cardmarket-mappings.json');
const rules=await read('cardmarket-rules.json');
const products=await read('legacy-cardmarket-products.json');
function choices(code,name) {
  const result=lookup(index,{setCode:code,cardName:name});
  return {...result,variants:result.variants.flatMap(v=>cardmarketChoices(v,index.byCardAndSet[`${v.cardId}|${v.setName}`],result.scan,mappings,rules,products))};
}
test('Dark Hole regional and unmarked codes both expose actual SDY product versions',()=>{
  for(const code of ['SDY-G020','SDY-E020','SDY-022']) {
    const result=choices(code,'Schwarzes Loch');
    assert.equal(result.warning,null);
    assert.deepEqual(result.variants.map(v=>v.cardmarket.version),[1,2,3]);
    assert.equal(new Set(result.variants.map(v=>v.id)).size,3);
    assert.ok(result.variants.every(v=>v.cardName==='Dark Hole'&&v.rarity==='Common'));
    assert.ok(result.variants[0].cardmarket.url.endsWith('/Starter-Deck-Yugi/Dark-Hole-V1-Common'));
  }
});
test('SDY-G025 is Trap Hole and mismatch cannot silently become Dark Hole',()=>{
  const result=choices('SDY-G025','Schwarzes Loch');
  assert.match(result.warning,/Fallgrube/);
  assert.ok(result.variants.every(v=>v.cardName==='Trap Hole'));
  assert.deepEqual(result.variants.map(v=>v.cardmarket.version),[1,2,3]);
});
test('Kaiba regional numbering remains distinct from unmarked numbering',()=>{
  for(const code of ['SDK-G021','SDK-022']) assert.deepEqual(choices(code,'Schwarzes Loch').variants.map(v=>v.cardmarket.version),[1,2]);
  assert.notEqual(lookup(index,{setCode:'SDK-021'}).variants[0].cardName,'Dark Hole');
});
test('Legacy double-hyphen printed codes are readable',()=>{
  assert.equal(parseSetCode('SDJ-G-026').normalized,'SDJ-026');
  assert.equal(extractSetCode('SDJ-G-026').setCode,'SDJ-G026');
  assert.equal(lookup(index,{setCode:'SDJ-G-026'}).variants[0].cardName,'Dark Hole');
});
test('Single rarity no longer fabricates an unversioned link for unresolved regional editions',()=>{
  const v={cardId:1,cardName:'Legacy Card',setName:'Old Set',rarity:'Common',setCode:'OLD-001',normalizedSetCode:'OLD-001'};
  const result=buildCardmarketLink(v,[v,{...v,setCode:'OLD-E001'}],{raw:'OLD-G001'},mappings,rules);
  assert.equal(result.url,null);assert.equal(result.method,'missing');
});
