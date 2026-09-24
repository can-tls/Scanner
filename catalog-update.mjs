import { buildCatalog, SOURCES } from './catalog-download.mjs';

const VERSION_URL = 'https://db.ygoprodeck.com/api/v7/checkDBVer.php';

function newerVersion(remote, local) {
  if (!local) return true;
  const a = remote.split('.').map(Number);
  const b = local.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function validateCatalog(catalog) {
  const fields = ['id', 'cardName', 'setCode', 'normalizedSetCode', 'setPrefix', 'setName', 'rarity'];
  if (catalog?.schemaVersion !== 1 || !Number.isFinite(Date.parse(catalog.updatedAt)) ||
      !Array.isArray(catalog.variants) || !catalog.variants.length ||
      !catalog.variants.every(v => v && Number.isFinite(v.cardId) &&
        fields.every(key => typeof v[key] === 'string' && v[key].length))) {
    throw new Error('Der geladene Katalog ist unvollständig. Der bisherige bleibt erhalten.');
  }
  return catalog;
}

// Ergänzungen aus der APK (z. B. alte deutsche Set-Codes) bleiben als Grundlage erhalten.
// Neue Quelldaten gewinnen bei gleicher Ausgabe; eigene Link-Regeln liegen separat.
export function mergeCatalog(bundled, downloaded) {
  const variants = new Map(bundled.variants.map(v => [v.id, v]));
  for (const variant of downloaded.variants) variants.set(variant.id, variant);
  return { ...downloaded, variants: [...variants.values()] };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Katalogabruf fehlgeschlagen (HTTP ${response.status}).`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

export async function downloadCatalogUpdate(current, getJson = fetchJson) {
  async function version() {
    const rows = await getJson(VERSION_URL);
    const value = rows?.[0]?.database_version;
    if (typeof value !== 'string' || !/^\d+(\.\d+)*$/.test(value)) {
      throw new Error('Katalogversion konnte nicht geprüft werden. Bitte später erneut versuchen.');
    }
    return value;
  }
  const remoteVersion = await version();
  if (!newerVersion(remoteVersion, current.sourceVersion)) return null;
  // Der gebündelte Altbestand kennt keine Quellversion: beim ersten Mal einmal synchronisieren.
  const payloads = [];
  for (const [name, url] of Object.entries(SOURCES)) {
    const json = await getJson(url);
    const rows = name === 'sets' ? json : json?.data;
    if (!Array.isArray(rows) || !rows.length || json?.meta?.rows_remaining > 0) {
      throw new Error('Katalogquelle enthält keine vollständigen Daten. Bitte erneut versuchen.');
    }
    payloads.push(rows);
  }
  const catalog = validateCatalog(buildCatalog(...payloads));
  if (catalog.variants.length < current.variants.length * 0.8) {
    throw new Error('Ungewöhnlich viele Ausgaben fehlen im Download. Der bisherige Katalog bleibt erhalten.');
  }
  // Keine gemischten Datenstände speichern, falls während des Downloads neue Daten erscheinen.
  if (await version() !== remoteVersion) throw new Error('Katalog wurde gerade geändert. Bitte erneut aktualisieren.');
  return { ...catalog, sourceVersion: remoteVersion };
}
