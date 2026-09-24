// Quelldaten enthalten teils HTML-Zeichen, z. B. 5D&apos;s. Nur Text dekodieren, kein HTML ausführen.
export function decodeCatalogText(value) {
  const named = { apos: "'", quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ' };
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|apos|quot|amp|lt|gt|nbsp);/gi, (entity, code) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()];
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : entity;
  });
}

export function parseSetCode(value) {
  // raw behält die Sprachkennung; normalized dient der gemeinsamen Katalogsuche.
  // Beispiel: SDY-G001 -> raw SDY-G001, language DE, normalized SDY-001.
  const raw = String(value ?? '').toUpperCase().replace(/[–—]/g, '-').replace(/\s/g, '')
    .replace(/^([A-Z0-9]{2,10})-([GEFISP])-(?=\d)/, '$1-$2');
  const match = raw.match(/^([A-Z0-9]{2,10})-(?:(EN|DE|FR|IT|ES|PT|NL|SP|G|E|F|I|S|P))?([A-Z]?\d{2,5})$/);
  if (!match) return null;
  const language = ({G:'DE', E:'EN', F:'FR', I:'IT', S:'ES', P:'PT', SP:'ES'})[match[2]] ?? match[2] ?? null;
  return { raw, prefix: match[1], language, number: match[3], normalized: `${match[1]}-${match[3]}` };
}

export const normalizeName = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');


export function createIndex(catalog) {
  // Einmal vorbereiten, damit nicht bei jedem Foto der ganze Katalog durchsucht wird.
  // Der zweite Index liefert die Seltenheiten einer Karte innerhalb eines Sets.
  const bySetCode = Object.create(null);
  const byCardAndSet = Object.create(null);
  for (const source of catalog.variants) {
    // Die gespeicherte ID bleibt stabil; Anzeige und Gruppierung nutzen den lesbaren Set-Namen.
    const variant = { ...source, setName: decodeCatalogText(source.setName) };
    (bySetCode[variant.normalizedSetCode] ??= []).push(variant);
    (byCardAndSet[`${variant.cardId}|${variant.setName}`] ??= []).push(variant);
  }
  const prefixes = [...new Set(catalog.variants.map(v => v.setPrefix))];
  return { bySetCode, byCardAndSet, prefixes, updatedAt: catalog.updatedAt };
}

export function lookup(index, input) {
  const code = parseSetCode(input.setCode);
  const name = normalizeName(input.cardName);
  if (!code) throw Object.assign(new Error('Bitte einen vollständigen Set-Code eingeben, z. B. SDJ-G001 oder RA03-DE081.'), { status: 400 });
  let variants = (index.bySetCode[code.normalized] ?? []);
  // Alte regionale Nummerierungen können andere Karten bezeichnen.
  // Deshalb hat der exakt aufgedruckte Code Vorrang vor der sprachneutralen Suche.
  const exact = variants.filter(v => v.setCode === code.raw);
  if (exact.length) variants = exact;
  else if (/^[^-]+-[GEFISP]\d/.test(code.raw)) {
    const regional = variants.filter(v => /^[^-]+-[GEFISP]\d/.test(v.setCode));
    if (regional.length) variants = regional;
  }
  // Mehrere Spracheinträge derselben Karte/Set/Seltenheit ergeben eine Auswahl.
  variants = [...new Map(variants.map(v => [`${v.cardId}|${v.setName}|${v.rarity}`, v])).values()];
  const nameMatches = v => name && [v.cardName, v.cardNameDe].some(n => normalizeName(n) === name);
  const hasMatchingName = variants.some(nameMatches);
  const warning = name && variants.length && !hasMatchingName
    ? `Der Set-Code gehört laut Katalog zu ${[...new Set(variants.map(v => v.cardNameDe || v.cardName))].join(' / ')}. Der erkannte Name weicht ab. Bitte Set-Code und Kartenname prüfen.` : null;
  // Ein möglicherweise falsch gelesener Name löst nur eine Warnung aus.
  // Die zum Set-Code passenden Karten bleiben sichtbar.
  return { scan: code, variants, warning, updatedAt: index.updatedAt,
    message: variants.length ? null : 'Keine Ausgabe zu diesem Set-Code gefunden. Code korrigieren oder Katalog aktualisieren.' };
}
