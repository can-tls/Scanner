import { parseSetCode } from './catalog-core.mjs';

// Höchstens ein fehlendes, zusätzliches oder anderes Zeichen im Set-Präfix.
function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) === 1;
}

export function suggestSetCodes(prefixes, rawCode, lookup) {
  const code = parseSetCode(rawCode);
  // Nur echte gelesene Ziffern verwenden. O/0 usw. werden hier nicht geraten.
  if (!code || prefixes.includes(code.prefix) || lookup({ setCode: code.raw }).variants.length) return [];
  const suffix = code.raw.slice(code.raw.indexOf('-'));
  // In RA0x sind die letzten beiden Präfixstellen Zahlen. So kann RAOS auch
  // bei zwei OCR-Verwechslungen zu RA05 werden, ohne die Kartennummer anzufassen.
  const rarityCollection = code.prefix.match(/^RA[0OQ]([0-9OQILZSB])$/);
  const digit = { O: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8' };
  // Bekannte OCR-Verwechslung gezielt behandeln, statt weitere ähnliche Sets anzubieten.
  const correctedPrefix = code.prefix === 'LSDD' ? 'L5DD' : rarityCollection
    ? 'RA0' + (digit[rarityCollection[1]] ?? rarityCollection[1]) : null;
  // Eine gezielte Lesart hat Vorrang. Fehlt RA05/Nummer im Katalog, nicht auf RA03 ausweichen.
  const candidates = correctedPrefix ? prefixes.filter(prefix => prefix === correctedPrefix)
    : prefixes.filter(prefix => oneEditApart(code.prefix, prefix));
  return candidates.flatMap(prefix => {
    const setCode = prefix + suffix;
    const variants = lookup({ setCode }).variants;
    // Seltenheiten derselben Karte sind keine unterschiedlichen Vorschläge.
    return [...new Map(variants.map(v => [`${v.cardId}|${v.setName}`, v])).values()]
      .map(v => ({ setCode, rawSetCode: rawCode, cardName: v.cardNameDe || v.cardName,
        setName: v.setName, key: setCode + '|' + v.cardId, corrected: true }));
  });
}
