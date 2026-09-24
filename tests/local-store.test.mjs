import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, priceKey, shouldScrape } from '../local-store.mjs';
import { withFilters } from '../cardmarket-filters.mjs';

function memoryStorage() {
  const records = new Map();
  return { getAllKeys: async () => [...records.keys()], multiGet: async keys => keys.map(key => [key, records.get(key)]),
    getItem: async key => records.get(key) ?? null, setItem: async (key, value) => { records.set(key, value); } };
}
const url = 'https://www.cardmarket.com/de/YuGiOh/Products/Singles/Set/Card';
const selection = i => ({ id: String(i), cardName: 'Card', setCode: 'SET-001',
  selectedAt: new Date(100000 + i * 1000).toISOString(), variant: { id: 'variant-' + i, cardmarket: { url: url + '-V' + i } } });

test('Linkfilter ersetzen alte Parameter; Preisfilter bleiben für alte Datensätze getrennt', () => {
  assert.equal(withFilters(url + '?language=1&extra=x#part'), url + '?sellerCountry=7&language=1,3&minCondition=2');
  assert.equal(withFilters(withFilters(url)), withFilters(url));
  assert.equal(priceKey(url), priceKey(withFilters(url).replace('1,3', '1%2C3')));
  assert.notEqual(priceKey(url + '?language=1'), priceKey(url));
});

test('Nur Fotoauswahl und ausdrückliches Refresh dürfen automatisch das Netzwerk verwenden', () => {
  assert.equal(shouldScrape('photo'), true);
  assert.equal(shouldScrape('manual'), false);
  assert.equal(shouldScrape('history'), false);
  assert.equal(shouldScrape('manual', true), true);
});

test('Angeklickte Ausgaben bleiben ohne Preis nach Neustart erhalten, auch mehrere Versionen', async () => {
  const storage = memoryStorage();
  const store = createLocalStore(storage);
  await store.saveSelection(selection(1));
  await store.saveSelection(selection(2));
  const restored = await createLocalStore(storage).load();
  assert.deepEqual(restored.history.map(entry => entry.variant.id), ['variant-2', 'variant-1']);
  assert.deepEqual(restored.prices, {});
});

test('Verlauf hält 20 neueste Klicks; Auswahl und Link-Klick derselben Ausgabe erzeugen kein Duplikat', async () => {
  const store = createLocalStore(memoryStorage());
  await Promise.all(Array.from({ length: 25 }, (_, i) => store.saveSelection(selection(i))));
  const repeated = { ...selection(10), selectedAt: new Date(200000).toISOString() };
  const state = await store.saveSelection(repeated);
  assert.equal(state.history.length, 20);
  assert.equal(state.history[0].id, '10');
  assert.equal(state.history.filter(entry => entry.id === '10').length, 1);
  assert.equal(state.history.at(-1).id, '5');
});

test('Alte zugeordnete Verlaufseinträge ohne Preis werden nicht mehr entfernt', async () => {
  const storage = memoryStorage();
  await storage.setItem('marketscan:history:v1', JSON.stringify([
    { id: 'empty', scannedAt: '2026-09-09T11:00:00Z', variant: null },
    { id: 'old', scannedAt: '2026-09-09T12:00:00Z', variant: { cardmarket: { url } } },
  ]));
  assert.deepEqual((await createLocalStore(storage).load()).history.map(entry => entry.id), ['old']);
});

test('Preisabrufe und Fehler ändern den Klickverlauf nicht', async () => {
  const store = createLocalStore(memoryStorage());
  await store.saveSelection(selection(1));
  await store.savePrice({ url, value: '1,00 €', fetchedAt: '2026-09-09T12:00:00Z' });
  await assert.rejects(store.savePrice({ url, value: '', fetchedAt: 'invalid' }));
  assert.deepEqual((await store.load()).history.map(entry => entry.id), ['1']);
});

test('Alte language=1 Preise werden beim Laden nicht auf 1,3 umetikettiert', async () => {
  const storage = memoryStorage();
  const oldUrl = url + '?sellerCountry=7&language=1&minCondition=2';
  await storage.setItem('marketscan:price:v1:' + oldUrl, JSON.stringify({ url: oldUrl, value: '2,00 €', fetchedAt: '2026-09-09T10:00:00Z' }));
  const store = createLocalStore(storage);
  assert.equal((await store.load()).prices[priceKey(url)], undefined);
  await store.savePrice({ url: withFilters(url), value: '1,00 €', fetchedAt: '2026-09-10T10:00:00Z' });
  const restored = await createLocalStore(storage).load();
  assert.equal(restored.prices[priceKey(oldUrl)].value, '2,00 €');
  assert.equal(restored.prices[priceKey(url)].value, '1,00 €');
});

test('Verspätete ältere Antworten ersetzen keinen neueren Preis', async () => {
  const store = createLocalStore(memoryStorage());
  await store.savePrice({ url, value: 'new', fetchedAt: '2026-09-09T12:00:00Z' });
  const state = await store.savePrice({ url, value: 'old', fetchedAt: '2026-09-09T11:00:00Z' });
  assert.equal(state.prices[priceKey(url)].value, 'new');
});

test('Schreibfehler löschen weder gespeicherten Preis noch Verlauf und ein späterer Versuch funktioniert', async () => {
  const storage = memoryStorage();
  const store = createLocalStore(storage);
  await store.saveSelection(selection(1));
  await store.savePrice({ url, value: 'old', fetchedAt: '2026-09-09T12:00:00Z' });
  const write = storage.setItem;
  storage.setItem = async () => { throw Error('disk full'); };
  await assert.rejects(store.saveSelection(selection(2)));
  await assert.rejects(store.savePrice({ url, value: 'new', fetchedAt: '2026-09-10T12:00:00Z' }));
  storage.setItem = write;
  assert.deepEqual((await store.load()).history.map(entry => entry.id), ['1']);
  assert.equal((await store.load()).prices[priceKey(url)].value, 'old');
  await store.saveSelection(selection(2));
  assert.equal((await createLocalStore(storage).load()).history[0].id, '2');
});

test('Auch angeklickte Ausgaben mit noch fehlender Link-Zuordnung bleiben im Verlauf', async () => {
  const storage = memoryStorage();
  const store = createLocalStore(storage);
  const entry = selection(1);
  entry.variant.cardmarket.url = null;
  await store.saveSelection(entry);
  assert.equal((await createLocalStore(storage).load()).history[0].variant.id, 'variant-1');
});

test('Backup-Freigabe überlebt Neustart und erneute Auswahl, ohne andere Versionen freizuschalten', async () => {
  const storage = memoryStorage();
  const store = createLocalStore(storage);
  await store.saveSelection({ ...selection(1), directLinkOpened: true });
  await store.saveSelection(selection(1));
  await store.saveSelection(selection(2));
  const history = (await createLocalStore(storage).load()).history;
  assert.equal(history.find(entry => entry.id === '1').directLinkOpened, true);
  assert.equal(history.find(entry => entry.id === '2').directLinkOpened, false);
});
