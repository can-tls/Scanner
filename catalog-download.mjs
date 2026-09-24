import { parseSetCode } from './catalog-core.mjs';
export const SOURCES = {
  cards: 'https://db.ygoprodeck.com/api/v7/cardinfo.php',
  german: 'https://db.ygoprodeck.com/api/v7/cardinfo.php?language=de',
  sets: 'https://db.ygoprodeck.com/api/v7/cardsets.php',
};

export function buildCatalog(cards, german, sets) {
  // Übersetzungen über die stabile Karten-ID verbinden, nicht über den Namen.
  const translations = new Map(german.map(card => [card.id, card.name]));
  const variants = new Map();
  for (const card of cards) {
    for (const set of card.card_sets ?? []) {
      const code = parseSetCode(set.set_code);
      if (!code) continue;
      // Eine Karte kann in mehreren Sets und Seltenheiten erscheinen: jede Ausgabe zählt einzeln.
      const id = `${card.id}|${set.set_code}|${set.set_name}|${set.set_rarity}`;
      variants.set(id, {
        id, cardId: card.id, cardName: card.name, cardNameDe: translations.get(card.id) ?? null,
        setCode: set.set_code, normalizedSetCode: code.normalized, setPrefix: code.prefix,
        setName: set.set_name, rarity: set.set_rarity,
      });
    }
  }
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), sources: SOURCES,
    cardCount: cards.length, sets, variants: [...variants.values()] };
}

