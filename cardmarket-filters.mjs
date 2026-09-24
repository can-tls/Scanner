export const CARDMARKET_FILTERS = 'sellerCountry=7&language=1,3&minCondition=2';

// Einheitlicher Link für alle Buttons und neue Preisabrufe.
export function withFilters(url) {
  return url.split(/[?#]/)[0] + '?' + CARDMARKET_FILTERS;
}
