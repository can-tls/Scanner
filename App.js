import { useEffect, useRef, useState } from 'react';
import { Button, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import AutoCardCamera from './AutoCardCamera';
import { initializeCatalog, lookupCard, updateCatalog } from './catalog';
import { buildCardmarketSearch } from './cardmarket-search.mjs';
import { requestScrape, withFilters } from './scraper-client';
import { localStore } from './local-storage';
import { EMPTY_LOCAL_DATA, priceKey, shouldScrape } from './local-store.mjs';

// Preisabrufe nur im Entwicklungsbuild. Die Release-APK nutzt Kamera, Katalog und Links ohne PC.
// __DEV__ wird beim Bauen gesetzt; es ist keine Einstellung auf dem Handy.
const SCRAPER_ENABLED = __DEV__;

export default function App() {
  const busyRef = useRef(false);
  // Neue Suche = neue Nummer. Verspätete Antworten dürfen die neue Anzeige nicht verändern.
  const scanGeneration = useRef(0);
  // requested: URLs dieser Suche. inFlight: noch laufende Anfragen, die wir gemeinsam abwarten.
  const requested = useRef(new Set());
  const inFlight = useRef(new Map());
  const selectionContext = useRef({source:'manual', historyId:null});
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const [cardName, setCardName] = useState('');
  const [setCode, setSetCode] = useState('');
  const [rawSetCode, setRawSetCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [openedDirectLinks, setOpenedDirectLinks] = useState(new Set());
  const [scraperResults, setScraperResults] = useState({});
  const [localData, setLocalData] = useState(EMPTY_LOCAL_DATA);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [catalogStatus, setCatalogStatus] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      localStore.load().then(data => { if (active) setLocalData(data); })
        .catch(() => { if (active) setStorageError('Lokale Preise und Verlauf konnten nicht geladen werden.'); }),
      initializeCatalog().catch(() => { if (active) setCatalogStatus('Gespeicherter Katalog konnte nicht geladen werden. Der mitgelieferte Katalog wird verwendet.'); }),
    ])
      .finally(() => { if (active) setStorageReady(true); });
    return () => { active = false; scanGeneration.current += 1; };
  }, []);
  async function saveLocal(operation) {
    try { setLocalData(await operation); setStorageError(''); }
    catch { setStorageError('Speichern auf dem Handy fehlgeschlagen. Bitte erneut versuchen.'); }
  }

  // Laufende Preisabrufe bleiben aktiv, nur ihre alte Anzeige wird verworfen.
  function clearSelection() {
    selectionContext.current = {source:'manual', historyId:null};
    scanGeneration.current += 1;
    requested.current = new Set();
    setScraperResults({});
    setLookupResult(null); setSelected(null); setError('');
  }
  // Gemeinsamer Rahmen: Doppeltippen sperren, Fehler anzeigen, Sperre immer wieder lösen.
  async function run(label, work) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (error) {
      setError(error.message ?? 'Vorgang fehlgeschlagen.');
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }
  async function search(name, code, context = {source:'manual', historyId:null}) {
    clearSelection();
    selectionContext.current = { ...context, selectionId: Date.now() + '-' + Math.random().toString(36).slice(2, 8) };
    const result = lookupCard({ cardName: name, setCode: code });
    setLookupResult(result);
    // Verlauf: Auswahl wiederherstellen. Sonst nur einen eindeutigen Treffer vorauswählen.
    const remembered = result.variants.find(variant => variant.id === context.variantId);
    if (remembered) selectVariant(remembered);
    else if (result.variants.length === 1 && !result.warning) selectVariant(result.variants[0]);
  }
  // Erst der bestätigte Kamera-Treffer geht in den bisherigen Katalog-/Variantenablauf.
  function acceptCameraMatch(parsed) {
    setCameraOpen(false);
    void run('Karte wird im Katalog gesucht …', async () => {
      setPhotoUri(null);
      setOcrText('');
      setCardName(parsed.cardName);
      setSetCode(parsed.setCode);
      setRawSetCode(parsed.rawSetCode);
      const historyId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const scan = { id: historyId, scannedAt: new Date().toISOString(),
        cardName: parsed.cardName, setCode: parsed.setCode, rawSetCode: parsed.rawSetCode };
      // source photo behält die bisherige Regel für den optionalen Preisabruf bei.
      await search(parsed.cardName, parsed.setCode, { source: 'photo', historyId, scan });
    });
  }
  // Nur eine Foto-Auswahl startet automatisch den Scraper. Suche und Verlauf lesen lokal.
  function selectVariant(variant, remember = false) {
    setSelected(variant);
    if (remember) void rememberVariant(variant);
    const context = selectionContext.current;
    if (SCRAPER_ENABLED && shouldScrape(context.source)) void loadScraperResult(variant);
  }
  function rememberVariant(variant, previousEntry = null, directLinkOpened = false) {
    const now = new Date().toISOString();
    const entry = previousEntry ? { ...previousEntry, selectedAt: now } : {
      id: selectionContext.current.selectionId + '|' + variant.id,
      selectedAt: now,
      cardName: variant.cardNameDe || variant.cardName,
      setCode: lookupResult?.scan.raw || variant.setCode,
      rawSetCode: rawSetCode || '',
      variant,
    };
    if (directLinkOpened) entry.directLinkOpened = true;
    return saveLocal(localStore.saveSelection(entry));
  }
  function openCardmarket(variant, previousEntry = null) {
    void run('Cardmarket wird geöffnet …', async () => {
      // Vor dem Wechsel in den Browser speichern, damit die Ausgabe beim Zurückkommen im Verlauf steht.
      // Schon der Klick schaltet die Suche frei, auch wenn das Öffnen des Direktlinks fehlschlägt.
      setOpenedDirectLinks(previous => new Set(previous).add(variant.id));
      await rememberVariant(variant, previousEntry, true);
      await Linking.openURL(withFilters(variant.cardmarket.url));
    });
  }
  function renderCardmarketButton(variant, previousEntry = null) {
    const wasOpened = openedDirectLinks.has(variant.id) || previousEntry?.directLinkOpened ||
      localData.history.some(entry => entry.variant?.id === variant.id && entry.directLinkOpened);
    const backupUrl = buildCardmarketSearch(variant);
    return <View style={styles.linkButtons}>
      <View style={styles.linkButton}><Button title={variant.cardmarket.url ? "Cardmarket" : "Link fehlt"}
        disabled={!!busy || !variant.cardmarket.url}
        onPress={() => openCardmarket(variant, previousEntry)} /></View>
      {(!variant.cardmarket.url || wasOpened) && backupUrl && <View style={styles.linkButton}><Button title="Backup-Suche" disabled={!!busy}
        onPress={() => run('Cardmarket-Suche wird geöffnet …', async () => {
          await rememberVariant(variant, previousEntry);
          await Linking.openURL(backupUrl);
        })} /></View>}
    </View>;
  }
  async function loadScraperResult(variant, refresh = false) {
    if (!SCRAPER_ENABLED) return;
    const url = variant.cardmarket.url;
    if (!url || (requested.current.has(url) && !refresh)) return;
    requested.current.add(url);
    const generation = scanGeneration.current;
    setScraperResults(previous => ({...previous, [url]:{status:'loading'}}));
    try {
      if (!inFlight.current.has(url)) {
        const promise = requestScrape(url, refresh).finally(() => inFlight.current.delete(url));
        inFlight.current.set(url, promise);
      }
      const result = await inFlight.current.get(url);
      // Auch verspätete Antworten unter ihrer Produkt-URL speichern.
      // Erst danach prüfen, ob die ursprüngliche Suche noch angezeigt wird.
      await saveLocal(localStore.savePrice(result));
      if (scanGeneration.current !== generation) return;
      setScraperResults(previous => ({...previous, [url]:{status:'done', value:result.value, fetchedAt:result.fetchedAt}}));
    } catch (e) {
      if (scanGeneration.current !== generation) return;
      setScraperResults(previous => ({...previous, [url]:{status:'error', error:e.message}}));
    }
  }

  function renderPrice(variant) {
    const url = variant.cardmarket.url;
    const pending = scraperResults[url];
    const saved = url ? localData.prices[priceKey(withFilters(url))] : null;
    const fresh = pending?.status === 'done' ? pending : null;
    // Der neuere Stand gewinnt. Ein Ladefehler löscht den bisherigen Preis nicht.
    const freshIsNewer = fresh && (!saved || Date.parse(fresh.fetchedAt) > Date.parse(saved.fetchedAt));
    const price = freshIsNewer ? fresh : saved;
    if (!SCRAPER_ENABLED && !price) return null;
    return <View accessibilityLiveRegion="polite">
      {price ? <><Text style={styles.heading}>{price.value}</Text><Text style={styles.small}>Stand: {new Date(price.fetchedAt).toLocaleString('de-DE')}</Text></>
        : <Text>Noch kein Preis gespeichert.</Text>}
      {pending?.status === 'loading' && <Text>Aktueller Preis wird geladen …</Text>}
      {pending?.status === 'error' && <Text style={styles.error}>{pending.error}</Text>}
    </View>;
  }
  function openHistory(entry) {
    void rememberVariant(entry.variant, entry);
    setShowHistory(false); setPhotoUri(null); setOcrText('');
    setCardName(entry.cardName); setSetCode(entry.setCode); setRawSetCode(entry.rawSetCode || '');
    void run('Verlauf wird geöffnet …', () => search(entry.cardName, entry.setCode,
      {source:'history', historyId:entry.id, variantId:entry.variant?.id}));
  }

  if (showHistory) return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Zuletzt angeklickte Ausgaben</Text>
    <Button title="Zurück zum Scanner" onPress={() => setShowHistory(false)} />
    {!!storageError && <Text style={styles.error}>{storageError}</Text>}
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!localData.history.length && <Text>Noch keine Ausgabe angeklickt.</Text>}
    {localData.history.map(entry => <View key={entry.id} style={styles.card}>
      <TouchableOpacity disabled={!!busy} accessibilityRole="button" onPress={() => openHistory(entry)}>
      <Text style={styles.heading}>{entry.variant?.cardNameDe || entry.variant?.cardName || entry.cardName}</Text>
      <Text>{entry.variant?.setName || entry.setCode || 'Set-Code nicht erkannt'}</Text>
      <Text>{entry.variant?.rarity || 'Ausgabe noch nicht ausgewählt'}{entry.variant?.cardmarket.version ? ` · V${entry.variant.cardmarket.version}` : ''}</Text>
      <Text style={styles.small}>Angeklickt: {new Date(entry.selectedAt ?? entry.scannedAt).toLocaleString('de-DE')}</Text>
      {entry.variant && renderPrice(entry.variant)}
      </TouchableOpacity>
      {renderCardmarketButton(entry.variant, entry)}
    </View>)}
    <View style={styles.card}>
      <Button title="Katalog aktualisieren" disabled={!!busy || !storageReady} onPress={() => run('Katalog wird geprüft und bei Bedarf geladen …', async () => {
        setCatalogStatus('');
        const changed = await updateCatalog();
        if (changed) clearSelection();
        setCatalogStatus(changed ? 'Katalog aktualisiert und auf dem Handy gespeichert.' : 'Der Katalog ist bereits aktuell.');
      })} />
      {!!busy && <Text accessibilityLiveRegion="polite">{busy}</Text>}
      {!!catalogStatus && <Text accessibilityLiveRegion="polite">{catalogStatus}</Text>}
    </View>
  </ScrollView>;

  if (cameraOpen && permission?.granted) return (
    <AutoCardCamera onRecognized={acceptCameraMatch} onCancel={() => setCameraOpen(false)} />
  );
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>MarketScan</Text>
      <Button title={`Verlauf (${localData.history.length}/20)`} disabled={!!busy || !storageReady} onPress={() => setShowHistory(true)} />
      {!storageReady && <Text>Gespeicherte Preise werden geladen …</Text>}
      {!!storageError && <Text style={styles.error}>{storageError}</Text>}
      {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
      <Button title={photoUri ? 'Neue Karte scannen' : 'Karte scannen'} disabled={!!busy || !storageReady} onPress={() => run('Kamera wird geöffnet …', async () => {
        const allowed = permission?.granted || (await requestPermission()).granted;
        if (!allowed) throw new Error('Bitte den Kamerazugriff in den Einstellungen erlauben.');
        setCameraOpen(true);
      })} />
      <Text>Kartenname</Text>
      <TextInput accessibilityLabel="Kartenname" style={styles.input} value={cardName} editable={!busy} onChangeText={value => { setCardName(value); clearSelection(); }} placeholder="Erkannter Kartenname" />
      <Text>Set-Code</Text>
      <TextInput accessibilityLabel="Set-Code" style={styles.input} value={setCode} editable={!busy} autoCapitalize="characters" autoCorrect={false} onChangeText={value => { setSetCode(value); clearSelection(); }} placeholder="z. B. SDJ-G001" />
      {!!rawSetCode && <Text>Vom Foto gelesen: {rawSetCode}</Text>}
      <Button title="Im Katalog suchen" disabled={!!busy || !storageReady || !setCode.trim()} onPress={() => run('Katalog wird durchsucht …', () => search(cardName, setCode))} />
      {!!busy && <Text accessibilityLiveRegion="polite">{busy}</Text>}
      {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
      {lookupResult && <>
        {lookupResult.warning && <Text style={styles.warning}>{lookupResult.warning}</Text>}
        {lookupResult.message && <Text>{lookupResult.message}</Text>}
        {!!lookupResult.variants.length && <Text style={styles.heading}>Gefundene Ausgaben – bitte auswählen</Text>}
        {lookupResult.variants.map(variant => <View key={variant.id}
          style={[styles.card, selected?.id === variant.id && styles.selected]}>
          <TouchableOpacity disabled={!!busy} accessibilityRole="button"
            accessibilityState={{ selected: selected?.id === variant.id }} onPress={() => selectVariant(variant, true)}>
            <Text style={styles.heading}>{variant.cardNameDe || variant.cardName}</Text>
            <Text>{variant.cardName}</Text><Text>{variant.setName}</Text>
            <Text>{lookupResult.scan.raw} · {variant.rarity}{variant.cardmarket.version ? ` · V${variant.cardmarket.version}` : ''}</Text>
            {renderPrice(variant)}
          </TouchableOpacity>
          {!!variant.cardmarket.note && <Text style={styles.small}>{variant.cardmarket.note}</Text>}
          {renderCardmarketButton(variant)}
          {SCRAPER_ENABLED && variant.cardmarket.url && <Button title="Preis aktualisieren"
            disabled={scraperResults[variant.cardmarket.url]?.status === 'loading'}
            onPress={() => loadScraperResult(variant, true)} />}
        </View>)}
        <Text style={styles.small}>Katalog: YGOPRODeck · Stand {new Date(lookupResult.updatedAt).toLocaleDateString('de-DE')}</Text>
      </>}
      {!!ocrText && <><Text style={styles.heading}>Erkannter Text</Text><Text selectable>{ocrText}</Text></>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 55, paddingBottom: 60, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  heading: { fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#9ca3af', borderRadius: 8, padding: 12, color: '#111827', backgroundColor: 'white' },
  card: { borderWidth: 1, borderColor: '#b8c2cc', borderRadius: 10, padding: 14, gap: 5 },
  selected: { borderColor: '#2563eb', backgroundColor: '#eaf2ff' },
  linkButtons: { flexDirection: 'row', gap: 8 },
  linkButton: { flex: 1 },
  link: { color: '#1d4ed8', textDecorationLine: 'underline', paddingVertical: 8 },
  preview: { width: 180, height: 250, resizeMode: 'contain', alignSelf: 'center' },
  controls: { position: 'absolute', bottom: 45, alignSelf: 'center', gap: 18 },
  error: { color: '#b91c1c' }, warning: { color: '#92400e' }, small: { fontSize: 12, color: '#64748b' },
});
