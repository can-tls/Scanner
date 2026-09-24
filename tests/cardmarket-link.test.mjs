import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIndex, lookup } from '../catalog-core.mjs';
import { buildCardmarketLink, cardmarketSetSlug, slugify } from '../cardmarket-link.mjs';
const json = async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'));
const catalog = await json('../data/catalog.json');
const mappings = await json('../data/cardmarket-mappings.json');
const rules = await json('../data/cardmarket-rules.json');
const index = createIndex(catalog);

test('Ältere Starter- und Structure-Deck-Namen verwenden die richtige Cardmarket-Wortfolge', () => {
  for (const [code, slug] of [
    ['SDZW-DE001', 'Structure-Deck-Zombie-World'], ['SDDC-DE001', 'Structure-Deck-Dragons-Collide'],
    ['SDGU-DE001', 'Structure-Deck-Gates-of-the-Underworld'], ['SDCR-DE001', 'Structure-Deck-Cyber-Dragon-Revolution'],
    ['SDHS-DE001', 'Structure-Deck-HERO-Strike'], ['SDMA-DE001', 'Structure-Deck-Marik'],
    ['SDJ-G001', 'Starter-Deck-Joey'], ['SDY-G001', 'Starter-Deck-Yugi'],
  ]) {
    const result = links(code);
    assert.ok(result.length, code);
    assert.ok(result.every(link => link.url?.includes(`/Singles/${slug}/`)), code);
  }
  assert.equal(cardmarketSetSlug('Saber Force Starter Deck'), 'Starter-Deck-Saber-Force');
  assert.equal(cardmarketSetSlug('Dark Legion Starter Deck'), 'Starter-Deck-Dark-Legion');
  assert.equal(cardmarketSetSlug('Starter Deck 2006: Special Edition'), 'Starter-Deck-2006-Special-Edition');
});

test('Legendary-Collection-Mega-Packs nutzen Cardmarket-Namen, Promos behalten ihre eigenen Pfade', () => {
  for (const [prefix, slug] of [['LCGX', 'Legendary-Collection-2-Mega-Pack'],
    ['LCYW', 'Legendary-Collection-3-Mega-Pack'], ['LCJW', 'Legendary-Collection-4-Mega-Pack'],
    ['LC5D', 'Legendary-Collection-5Ds-Mega-Pack'],
    ['LC03', 'Legendary-Collection-3-Yugis-World'], ['LCKC', 'Legendary-Collection-Kaiba-Mega-Pack']]) {
    const variant = catalog.variants.find(v => v.setPrefix === prefix);
    const originalName = variant.setName;
    const link = buildCardmarketLink(variant, [variant], { raw: variant.setCode }, {}, rules);
    assert.ok(link.url.includes(`/Singles/${slug}/`), link.url);
    assert.equal(variant.setName, originalName);
    const key = `${variant.normalizedSetCode}|${variant.cardName}|${variant.rarity}`;
    const explicit = buildCardmarketLink(variant, [variant], { raw: variant.setCode },
      { [key]: { setSlug: 'Explicit-Set', productSlug: 'Explicit-Card' } }, rules);
    assert.ok(explicit.url.endsWith('/Explicit-Set/Explicit-Card'));
  }
});
function links(setCode) {
  const result = lookup(index, {setCode});
  return result.variants.map(v => ({rarity:v.rarity, ...buildCardmarketLink(v, index.byCardAndSet[`${v.cardId}|${v.setName}`], result.scan, mappings, rules)}));
}
test('Mystical Elf: original language code selects V1 or V2, no duplicate Common choice', () => {
  for (const code of ['SDY-G001','SDY-E001']) {
    const result = links(code);
    assert.equal(result.length,1);
    assert.equal(result[0].url,'https://www.cardmarket.com/de/YuGiOh/Products/Singles/Starter-Deck-Yugi/Mystical-Elf-V1-Common');
  }
  assert.equal(links('SDY-001')[0].version,2);
  assert.ok(links('SDY-001')[0].url.endsWith('Mystical-Elf-V2-Common'));
});
test('Unsupported legacy language is not silently treated as no language', () => {
  assert.equal(links('SDY-F001')[0].url,null);
});
test('Dark Magician exact V1/V2 URLs use canonical names and no filter parameters', () => {
  const result = links('MZMU-DE011');
  assert.ok(result.find(v=>v.rarity==='Secret Rare').url.endsWith('/Maze-of-Muertos/Dark-Magician-of-Destruction-V1-Secret-Rare'));
  assert.ok(result.find(v=>v.rarity==="Collector's Rare").url.endsWith('-V2-Collectors-Rare'));
  assert.ok(result.every(v=>!v.url.includes('?')));
});
test('Bonanza nostalgia cards retain V1/V2 with only two rarities', () => {
  const result = links('RA03-DE081');
  assert.ok(result.find(v=>v.rarity==='Platinum Secret Rare').url.endsWith('/Quarter-Century-Bonanza/Red-Eyes-Black-Dragon-V1-Platinum-Secret-Rare'));
  assert.ok(result.find(v=>v.rarity==='Quarter Century Secret Rare').url.endsWith('-V2-Quarter-Century-Secret-Rare'));
  assert.ok(result.every(v=>v.method==='rarity-rule'));
});
test('Rarity Collection uses its own version sequence', () => {
  const result = links('RA01-DE008');
  assert.equal(result.length,7);
  assert.equal(result.find(v=>v.rarity==='Quarter Century Secret Rare').version,5);
  assert.equal(result.find(v=>v.rarity==="Collector's Rare").version,6);
  assert.equal(result.find(v=>v.rarity==='Ultimate Rare').version,7);
  assert.ok(result.find(v=>v.rarity==='Super Rare').url.endsWith('/25th-Anniversary-Rarity-Collection/Ash-Blossom-Joyous-Spring-V1-Super-Rare'));
});
test('RA01-RA04 put Collectors before Ultimate for every catalog card with both rarities', () => {
  for (const prefix of ['RA01', 'RA02', 'RA03', 'RA04']) {
    const collectors = catalog.variants.filter(v => v.setPrefix === prefix && v.rarity === "Collector's Rare");
    assert.ok(collectors.length > 0, prefix);
    for (const variant of collectors) {
      const result = links(variant.setCode);
      const collector = result.find(v => v.rarity === "Collector's Rare");
      const ultimate = result.find(v => v.rarity === 'Ultimate Rare');
      if (!ultimate) continue;
      assert.equal(collector.version, prefix === 'RA01' ? 6 : 5, variant.id);
      assert.equal(ultimate.version, prefix === 'RA01' ? 7 : 6, variant.id);
      assert.ok(collector.url.endsWith(`-V${collector.version}-Collectors-Rare`), variant.id);
      assert.ok(ultimate.url.endsWith(`-V${ultimate.version}-Ultimate-Rare`), variant.id);
    }
  }
});

test('One rarity means no version suffix and no rarity suffix', () => {
  const v = {cardId:1,cardName:'Simple Card',setName:'Test Set',rarity:'Common',normalizedSetCode:'TEST-001'};
  const link = buildCardmarketLink(v,[v],{raw:'TEST-DE001'},mappings,rules);
  assert.equal(link.url,'https://www.cardmarket.com/de/YuGiOh/Products/Singles/Test-Set/Simple-Card');
  assert.equal(link.version,null);
});
test('Rarity numbering ignores other cards and other sets, deduplicates languages', () => {
  const v = {cardId:1,cardName:'Card',setName:'Set',rarity:'Ultra Rare',normalizedSetCode:'SET-001'};
  const link = buildCardmarketLink(v,[v,{...v,rarity:'Secret Rare'},{...v,rarity:'Secret Rare'},
    {...v,cardId:2,rarity:'Common'},{...v,setName:'Other Set',rarity:'Super Rare'}],{raw:'SET-DE001'},mappings,rules);
  assert.ok(link.url.endsWith('Card-V1-Ultra-Rare'));
});
test('Special characters produce path segments and unknown rarity ordering is explicit', () => {
  assert.equal(slugify("Collector's Rare"),'Collectors-Rare');
  assert.equal(slugify('Ash Blossom & Joyous Spring'),'Ash-Blossom-Joyous-Spring');
  const v = {cardId:1,cardName:'Card',setName:'Set',rarity:'Unknown',normalizedSetCode:'SET-001'};
  assert.equal(buildCardmarketLink(v,[v,{...v,rarity:'Common'}],{raw:'SET-001'},mappings,rules).url,null);
});

test('RA03 Diabellstar uses Collectors V5 and Ultimate V6 for German and English scans', () => {
  for (const code of ['RA03-DE032', 'RA03-EN032']) {
    const result = links(code);
    for (const [rarity, version, suffix] of [
      ['Super Rare', 1, 'Super-Rare'], ['Ultra Rare', 2, 'Ultra-Rare'],
      ['Secret Rare', 3, 'Secret-Rare'], ['Platinum Secret Rare', 4, 'Platinum-Secret-Rare'],
      ["Collector's Rare", 5, 'Collectors-Rare'], ['Ultimate Rare', 6, 'Ultimate-Rare'],
    ]) {
      const link = result.find(v => v.rarity === rarity);
      assert.equal(link.version, version);
      assert.ok(link.url.endsWith(`/Quarter-Century-Bonanza/Diabellstar-the-Black-Witch-V${version}-${suffix}`));
    }
  }
});

test('L5DD: HTML-Apostroph wird lesbar angezeigt und nicht als apos in den Link übernommen', () => {
  const result = lookup(index, { setCode: 'L5DD-ENY37' });
  assert.ok(result.variants.length > 0);
  assert.equal(result.variants[0].setName, "Legendary 5D's Decks");
  const built = links('L5DD-ENY37');
  assert.ok(built.every(link => link.url?.includes('/Legendary-5Ds-Decks/')));
  for (const setName of ["Legendary 5D&apos;s Decks", "Legendary 5D&#39;s Decks", "Legendary 5D&#x27;s Decks", "Legendary 5D's Decks"]) {
    assert.equal(slugify(setName), 'Legendary-5Ds-Decks');
  }
});
