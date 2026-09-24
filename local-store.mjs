import { withFilters } from './cardmarket-filters.mjs';

const HISTORY_KEY = 'marketscan:history:v1';
const PRICE_PREFIX = 'marketscan:price:v1:';
const HISTORY_LIMIT = 20;
export const EMPTY_LOCAL_DATA = { prices: {}, history: [] };

export function priceKey(url) {
  // Alte Preise behalten ihre Sprache. Ein Preis für language=1 ist kein Preis für 1,3.
  // Ohne explizite Filter fragt die Oberfläche nach dem aktuellen Preisstand.
  const language = url.match(/[?&]language=([^&#]*)/)?.[1];
  return language === undefined ? withFilters(url)
    : withFilters(url).replace('language=1,3', 'language=' + decodeURIComponent(language));
}

export function shouldScrape(source, refresh = false) {
  return source === 'photo' || refresh;
}

export function createLocalStore(storage) {
  let data = EMPTY_LOCAL_DATA;
  let loading;
  let queue = Promise.resolve();
  const load = async () => {
    loading ??= (async () => {
      const keys = (await storage.getAllKeys()).filter(key => key.startsWith(PRICE_PREFIX));
      const entries = await storage.multiGet(keys);
      const prices = {};
      for (const [, value] of entries) {
        const record = JSON.parse(value);
        if (record?.url && typeof record.value === 'string' && Number.isFinite(Date.parse(record.fetchedAt))) {
          prices[priceKey(record.url)] = record;
        }
      }
      const historyText = await storage.getItem(HISTORY_KEY);
      const history = historyText ? JSON.parse(historyText) : [];
      if (!Array.isArray(history)) throw new Error('Der gespeicherte Verlauf ist nicht lesbar.');
      // Auch ältere Einträge ohne Preis bleiben erhalten, sofern eine Ausgabe zugeordnet ist.
      const selected = history.filter(entry => (entry?.variant?.id || entry?.variant?.cardmarket?.url) &&
        Number.isFinite(Date.parse(entry.selectedAt ?? entry.scannedAt)))
        .sort((a,b) => Date.parse(b.selectedAt ?? b.scannedAt) - Date.parse(a.selectedAt ?? a.scannedAt))
        .slice(0, HISTORY_LIMIT);
      data = { prices, history: selected };
      return data;
    })();
    await loading;
    return data;
  };
  function update(work) {
    // Antworten und Klicks schreiben nacheinander, damit keine Änderung verloren geht.
    const operation = queue.catch(() => {}).then(async () => { await load(); await work(); return data; });
    queue = operation;
    return operation;
  }
  return {
    load,
    saveSelection(entry) {
      return update(async () => {
        if (!entry.id || !(entry.variant?.id || entry.variant?.cardmarket?.url) || !Number.isFinite(Date.parse(entry.selectedAt))) {
          throw new Error('Ungültige Ausgabe für den Verlauf.');
        }
        // Auswahl und anschließender Link-Klick derselben Ausgabe aktualisieren denselben Eintrag.
        const previous = data.history.find(item => item.id === entry.id);
        const savedEntry = { ...entry, directLinkOpened: Boolean(entry.directLinkOpened || previous?.directLinkOpened) };
        const history = [savedEntry, ...data.history.filter(item => item.id !== entry.id)]
          .sort((a,b) => Date.parse(b.selectedAt ?? b.scannedAt) - Date.parse(a.selectedAt ?? a.scannedAt))
          .slice(0, HISTORY_LIMIT);
        await storage.setItem(HISTORY_KEY, JSON.stringify(history));
        data = { ...data, history };
      });
    },
    savePrice(result) {
      return update(async () => {
        if (!result.value?.trim() || !Number.isFinite(Date.parse(result.fetchedAt))) throw new Error('Ungültiger Preisstand.');
        const url = priceKey(result.url);
        const record = { url, value: result.value, fetchedAt: result.fetchedAt };
        const saved = data.prices[url];
        if (!saved || Date.parse(saved.fetchedAt) <= Date.parse(record.fetchedAt)) {
          await storage.setItem(PRICE_PREFIX + url, JSON.stringify(record));
          data = { ...data, prices: { ...data.prices, [url]: record } };
        }
        // Ein Preisabruf ändert den Klickverlauf nicht, auch wenn er verspätet eintrifft.
      });
    },
  };
}
