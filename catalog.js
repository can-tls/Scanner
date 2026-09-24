import catalog from './data/catalog.json';
import { createIndex, lookup } from './catalog-core.mjs';
import mappings from './data/cardmarket-mappings.json';
import rules from './data/cardmarket-rules.json';
import { cardmarketChoices } from './cardmarket-link.mjs';
import legacyProducts from './data/legacy-cardmarket-products.json';
import { downloadCatalogUpdate, mergeCatalog } from './catalog-update.mjs';
import { readSavedCatalog, saveCatalog } from './catalog-storage';
import { suggestSetCodes } from './scan-suggestions.mjs';
import additions from './data/catalog-additions.json';
import recentSetAdditions from './data/recent-set-additions.json';
import { applyCatalogAdditions } from './catalog-additions.mjs';

export function suggestScanCodes(rawCode) {
  return suggestSetCodes(index.prefixes, rawCode, input => lookup(index, input));
}

const applyReviewedAdditions = value => applyCatalogAdditions(applyCatalogAdditions(value, additions), recentSetAdditions);
let currentCatalog = applyReviewedAdditions(catalog);
let index = createIndex(currentCatalog);
export async function initializeCatalog() {
  const saved = await readSavedCatalog();
  if (saved && Date.parse(saved.updatedAt) >= Date.parse(catalog.updatedAt)) {
    currentCatalog = applyReviewedAdditions(mergeCatalog(catalog, saved));
    index = createIndex(currentCatalog);
  }
}
export async function updateCatalog() {
  const downloaded = await downloadCatalogUpdate(currentCatalog);
  if (!downloaded) return false;
  const next = applyReviewedAdditions(mergeCatalog(catalog, downloaded));
  const nextIndex = createIndex(next);
  await saveCatalog(downloaded);
  // Erst nach dem Speichern wechseln, damit Suche und nächster App-Start denselben Stand nutzen.
  currentCatalog = next;
  index = nextIndex;
  return true;
}
export function lookupCard(input) {
  const result = lookup(index, input);
  // flatMap erlaubt mehrere alte Druckversionen pro Katalogausgabe.
  result.variants = result.variants.flatMap(variant => cardmarketChoices(
    variant, index.byCardAndSet[`${variant.cardId}|${variant.setName}`], result.scan, mappings, rules, legacyProducts
  )).sort((a, b) => (a.cardmarket.version ?? 0) - (b.cardmarket.version ?? 0));
  return result;
}
