import { decodeCatalogText } from './catalog-core.mjs';
import { CARDMARKET_FILTERS } from './cardmarket-filters.mjs';

// Suchfilter-IDs sind feste Cardmarket-Seltenheiten, niemals Versionsnummern.
const RARITY_IDS = {
  common: 1, rare: 28, 'super rare': 3, 'ultra rare': 4, 'secret rare': 5,
  "collector's rare": 214, 'quarter century secret rare': 292, 'starlight rare': 196,
};

export function buildCardmarketSearch(variant) {
  // Für die Suche den vollständigen Namen behalten, inklusive Doppelpunkt und &.
  // URL-Kodierung verhindert, dass Sonderzeichen als zusätzliche Parameter gelesen werden.
  const name = decodeCatalogText(variant.cardName || variant.cardNameDe).trim();
  if (!name) return null;
  const rarity = decodeCatalogText(variant.rarity).replace(/’/g, "'").trim().toLowerCase();
  const id = Object.hasOwn(RARITY_IDS, rarity) ? RARITY_IDS[rarity] : undefined;
  return 'https://www.cardmarket.com/de/YuGiOh/Products/Singles?searchMode=v2&searchString=' +
    encodeURIComponent(name) + (id === undefined ? '' : '&idRarity=' + id) + '&' + CARDMARKET_FILTERS;
}
