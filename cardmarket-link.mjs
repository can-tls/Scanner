import { decodeCatalogText } from './catalog-core.mjs';

// Baut nur den Link: Hier findet noch kein Netzwerkaufruf statt.
// Satzzeichen wie Doppelpunkt und Apostroph entfallen: I:P -> IP, Collector's -> Collectors.
export function slugify(value) {
  return decodeCatalogText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[:'’"“”]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const normalizeRarity = value => value === 'PLatinum Secret Rare' ? 'Platinum Secret Rare' : value;

export function cardmarketSetSlug(setName) {
  // YGOPRODeck stellt bei älteren Decks den Produkttyp ans Ende.
  // Cardmarket führt ihn vorne: Zombie World Structure Deck -> Structure Deck: Zombie World.
  const name = decodeCatalogText(setName);
  const deck = name.match(/^(.+) (Structure|Starter) Deck$/);
  return slugify(deck ? `${deck[2]} Deck: ${deck[1]}` : name);
}

export function cardmarketChoices(variant, siblings, scan, mappings, rules, legacyProducts) {
  // Alte Drucke können trotz gleicher Seltenheit mehrere Produktseiten haben.
  // Jede bekommt eine eigene Auswahl-ID, damit Preis und Auswahl getrennt bleiben.
  const legacy = legacyProducts[`${variant.setName}|${variant.cardName}|${variant.rarity}`];
  if (!legacy) return [{...variant, cardmarket:buildCardmarketLink(variant, siblings, scan, mappings, rules)}];
  return legacy.productSlugs.map(productSlug => ({
    ...variant, baseVariantId:variant.id, id:`${variant.id}|${productSlug}`,
    cardmarket: {
      url:`https://www.cardmarket.com/de/YuGiOh/Products/Singles/${legacy.setSlug}/${productSlug}`,
      version:Number(productSlug.match(/-V(\d+)-/)[1]), method:'legacy-products',
      note:'Mehrere Cardmarket-Druckversionen mit gleicher Seltenheit. Der Set-Code allein unterscheidet sie nicht sicher; bitte die passende Version prüfen.',
    },
  }));
}

export function buildCardmarketLink(variant, siblings, scan, mappings, rules) {
  // Vorrang: hinterlegter Produktpfad -> Set-Regel -> allgemeine Seltenheitsfolge.
  // Die ursprüngliche Sprachkennung bleibt wichtig, z. B. SDY-G001 gegenüber SDY-001.
  const key = `${variant.normalizedSetCode}|${variant.cardName}|${variant.rarity}`;
  const known = mappings[key];
  const languageToken = scan.raw.match(/^[^-]+-(EN|DE|FR|IT|ES|PT|NL|SP|G|E|F|I|S|P)(?=[A-Z]?\d)/)?.[1] ?? 'none';
  const languageProduct = known?.languageProducts?.[languageToken];
  const explicitProduct = languageProduct ?? known?.productSlug;
  // Cardmarket benennt manche Mega Packs kürzer als YGOPRODeck. Nur den URL-Pfad
  // anpassen; der vollständige Katalogname und seine Suchzuordnung bleiben erhalten.
  const setSlug = known?.setSlug ?? rules.setSlugs?.[variant.setName] ?? cardmarketSetSlug(variant.setName);
  let productSlug = explicitProduct;
  let version = explicitProduct?.match(/-V(\d+)-/)?.[1] ?? null;
  let method = explicitProduct ? 'mapping' : 'rarity-rule';
  const rarity = normalizeRarity(variant.rarity);

  if (known?.languageProducts && !languageProduct) {
    return { url: null, version: null, method: 'missing', note: 'Für diese Sprachkennung ist die Cardmarket-Version noch nicht hinterlegt.' };
  }
  if (!productSlug) {
    // Nur Ausgaben derselben Karte im selben Set zählen für die Versionsnummer.
    const sameCard = siblings.filter(v => v.cardId === variant.cardId && v.setName === variant.setName);
    const rarities = [...new Set(sameCard.map(v => normalizeRarity(v.rarity)))];
    if (!rarities.includes(rarity)) rarities.push(rarity);
    if (rarities.length === 1) {
      const hasLegacy = sameCard.some(v => /-[GEFISP]\d/.test(v.setCode));
      const hasUnmarked = sameCard.some(v => /-\d/.test(v.setCode));
      if (hasLegacy && hasUnmarked) return {
        url:null, version:null, method:'missing',
        note:'Dieses alte Set enthält regionale Druckversionen derselben Seltenheit. Die Cardmarket-Zuordnung fehlt noch; ein Link ohne Versionszusatz wäre nicht zuverlässig.',
      };
      productSlug = slugify(variant.cardName);
      method = 'single-rarity';
    } else {
      const setOrder = rules.setVersionOrders[variant.setName];
      const order = setOrder ?? rules.setRarityOrders?.[variant.setName] ?? rules.rarityOrder;
      if (rarities.some(r => !order.includes(r))) {
        return { url: null, version: null, method: 'missing', note: 'Für die Seltenheiten dieses Sets fehlt noch eine eindeutige Versionsreihenfolge.' };
      }
      rarities.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      // setVersionOrders gibt feste Plätze vor; setRarityOrders sortiert nur vorhandene Seltenheiten.
      version = setOrder ? setOrder.indexOf(rarity) + 1 : rarities.indexOf(rarity) + 1;
      method = setOrder ? 'set-rule' : 'rarity-rule';
      productSlug = `${slugify(variant.cardName)}-V${version}-${slugify(rarity)}`;
    }
  }
  return {
    url: `https://www.cardmarket.com/de/YuGiOh/Products/Singles/${setSlug}/${productSlug}`,
    version: version === null ? null : Number(version), method,
    note: method === 'mapping' ? null : 'Automatisch gebildeter Link. Bei Sonderausgaben kann die Cardmarket-Zuordnung abweichen.',
  };
}
