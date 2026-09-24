import { NativeModules } from 'react-native';
import { withFilters } from './cardmarket-filters.mjs';

// Standard: Scraper und Expo-Server laufen auf demselben PC.
const host = NativeModules.SourceCode?.scriptURL?.match(/^https?:\/\/([^/:]+)/)?.[1];
export const SCRAPER_URL = process.env.EXPO_PUBLIC_SCRAPER_URL || `http://${host || 'localhost'}:3001`;

// Anzeige, Anfrage und Preisspeicher verwenden dieselben Filter.
export { withFilters };

export async function requestScrape(url, refresh = false) {
  const controller = new AbortController();
  // Etwas länger warten als das 300-Sekunden-Limit der entfernten Sitzung.
  const timer = setTimeout(() => controller.abort(), 330000);
  try {
    const response = await fetch(`${SCRAPER_URL}/scrape`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:withFilters(url), refresh}), signal:controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'Scraper-Aufruf fehlgeschlagen.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Der Scraper hat zu lange gebraucht. Bitte erneut versuchen.');
    if (error instanceof TypeError) throw new Error(`Scraper nicht erreichbar (${SCRAPER_URL}). Auf dem PC npm run scraper:serve starten.`);
    throw error;
  } finally { clearTimeout(timer); }
}
