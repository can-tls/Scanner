import { parseSetCode } from './catalog-core.mjs';

export function extractScanCodeCandidates(text) {
  // Erst den ganzen Bindestrich-Ausdruck lesen: aus ABCDE-DE001 oder ABC-DE001-X
  // darf kein kürzerer, scheinbar gültiger Teil herausgeschnitten werden.
  const tokens = String(text ?? '').match(/[\p{L}\p{N}_]+(?:\s*[-–—]\s*[\p{L}\p{N}_]+)+/gu) ?? [];
  // O/Q (und andere typische Ziffern-Verwechslungen) müssen die Korrektur erreichen.
  return tokens.filter(token => /^[A-Z0-9]{3,4}\s*[-–—]\s*[A-Z0-9]{3,5}$/i.test(token) && extractSetCode(token));
}

// OCR-Schreibweisen wie SDJ-G-026 vereinheitlichen, Sprache und Teildeck aber erhalten.
export function extractSetCode(text, lookup = null) {
  const normalized = String(text ?? '').toUpperCase().replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-')
    .replace(/\b([A-Z0-9]{2,10})-([GEFISP])-(?=\d)/g, '$1-$2');
  const match = normalized.match(/\b([A-Z0-9]{2,10})-((?:EN|DE|FR|IT|ES|PT|NL|SP|G|E|F|I|S|P)?[A-Z0-9]{2,7})\b/);
  if (!match) return null;
  // SDJ wird häufig SDI/SDL/SD1/SD7 gelesen. Bei alten Sprachcodes ist die
  // deutsche Joey-Ausgabe gegenüber einer sprachneutralen SD1-Suche eindeutig.
  const joey = /^SD[IL17]-([GEFISP])([0-9OQILZSB]{3})$/.exec(match[0]);
  if (lookup && joey) {
    const target = `SDJ-${joey[1]}${correctDigits(joey[2])}`;
    if (lookup({ setCode: target }).variants.length) {
      return { rawSetCode: match[0], setCode: target, language: parseSetCode(target).language };
    }
  }
  // Bekannte echte Teildeck-Buchstaben (LAVD-ENO34) bleiben erhalten.
  const original = parseSetCode(match[0]);
  if (lookup && original && lookup({ setCode: original.raw }).variants.length) {
    return { rawSetCode: match[0], setCode: original.raw, language: original.language };
  }
  let [, prefix, suffix] = match;
  // Nur den Nummernteil korrigieren: SD1 ist ein gültiges Set, J in ENJ01 ein Teildeck.
  const language = suffix.match(/^(EN|DE|FR|IT|ES|PT|NL|SP|G|E|F|I|S|P)(?=[A-Z0-9]{2,})/)?.[0] ?? '';
  suffix = suffix.slice(language.length);
  // S ist u. a. das Sky-Striker-Teildeck: DES22 darf niemals zu DE522 werden.
  const subdeck = suffix.match(/^[A-HJKM-NPRSTUVWXY](?=[0-9OQILZSB]{2,5}$)/)?.[0] ?? '';
  const number = correctDigits(suffix.slice(subdeck.length));
  if (!/^\d{2,5}$/.test(number)) return null;
  // CHO1-DEO43 -> CH01-DE043 nur dann, wenn der vollständige Zielcode existiert.
  const correctedPrefix = prefix.replace(/O(?=\d)/g, '0');
  if (lookup && correctedPrefix !== prefix &&
      lookup({ setCode: `${correctedPrefix}-${language}${subdeck}${number}` }).variants.length) {
    prefix = correctedPrefix;
  }
  const target = `${prefix}-${language}${subdeck}${number}`;
  if (lookup && /^SD[IL17]$/.test(prefix) && !lookup({ setCode: target }).variants.length) {
    const joeyTarget = `SDJ-${language}${subdeck}${number}`;
    if (lookup({ setCode: joeyTarget }).variants.length) prefix = 'SDJ';
  }
  return { rawSetCode: match[0], setCode: `${prefix}-${language}${subdeck}${number}`, language: language || null };
}

function correctDigits(value) {
  return value.replace(/[OQ]/g, '0').replace(/[IL]/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/B/g, '8');
}

export function parseCardText(result) {
  const lines = (result.blocks ?? [])
    .flatMap(block => block.lines ?? [])
    .map(line => ({ text: String(line.text ?? '').trim(), y: line.frame?.y ?? Infinity }))
    .filter(line => line.text);
  const code = lines.map(l => extractSetCode(l.text)).find(Boolean) ?? extractSetCode(result.text);
  // Oberster brauchbarer Text = vermuteter Name. Der Katalog prüft ihn später gegen.
  const titles = lines.filter(l => !extractSetCode(l.text) && !/^\d+$|^ATK|^DEF|KONAMI|EDITION|AUFLAGE|SPELL CARD|TRAP CARD|ZAUBERKARTE|FALLENKARTE|©/i.test(l.text)).sort((a,b) => a.y - b.y);
  return { cardName: titles[0]?.text ?? '', setCode: code?.setCode ?? '', rawSetCode: code?.rawSetCode ?? '', language: code?.language ?? null };
}
