// Recherchierte Ausgaben liegen getrennt von YGOPRODeck. Für geprüfte Druckcodes
// ersetzt diese Schicht alle API-Zuordnungen, auch falsche Raritäten oder Karten-IDs.
// Nur ausdrücklich geprüfte Codes werden ersetzt; andere API-Ausgaben bleiben erhalten.
export function applyCatalogAdditions(catalog, additions) {
  const replacedCodes = new Set(additions.replaceCodes);
  const variants = new Map(catalog.variants.filter(v => !replacedCodes.has(v.setCode)).map(v => [v.id, v]));
  for (const variant of additions.variants) variants.set(variant.id, variant);
  return { ...catalog, variants: [...variants.values()] };
}
