import { mkdir, writeFile, rename } from 'node:fs/promises';
import { buildCatalog, SOURCES } from '../catalog-download.mjs';
const DATA_DIR = new URL('../data/', import.meta.url);
const FILE = new URL('catalog.json', DATA_DIR);
export async function importCatalog() {
  const payloads = [];
  for (const [name, url] of Object.entries(SOURCES)) {
    console.log(`Lade ${name} …`);
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Katalogquelle ${name}: HTTP ${response.status}`);
    const json = await response.json();
    const rows = name === 'sets' ? json : json.data;
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Katalogquelle ${name} enthält keine Daten.`);
    payloads.push(rows);
  }
  const catalog = buildCatalog(...payloads);
  if (!catalog.variants.length) throw new Error('Keine Kartenausgaben gefunden; bestehender Katalog bleibt erhalten.');
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = new URL('catalog.json.tmp', DATA_DIR);
  // Erst vollständig schreiben, dann ersetzen. Ein Downloadfehler lässt den alten Katalog stehen.
  await writeFile(temporary, JSON.stringify(catalog));
  await rename(temporary, FILE);
  return catalog;
}


try { const catalog = await importCatalog(); console.log(`${catalog.cardCount} Karten, ${catalog.variants.length} Ausgaben gespeichert.`); } catch (error) { console.error(error.message); process.exitCode = 1; }
