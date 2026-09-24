import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Button, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView } from 'expo-camera';
import MlkitOcr from 'rn-mlkit-ocr';
import { deleteAsync } from 'expo-file-system/legacy';
import { lookupCard, suggestScanCodes } from './catalog';
import { CARD_FRAME, CODE_FRAME, startAutoScan } from './auto-scan.mjs';
import { cameraPreferences } from './local-storage';
import { DEFAULT_ZOOM } from './camera-preferences.mjs';

export default function AutoCardCamera({ onRecognized, onCancel }) {
  const camera = useRef(null);
  const stop = useRef(() => {});
  const mounted = useRef(true);
  const initializing = useRef(false);
  const callbacks = useRef({ onRecognized, onCancel });
  callbacks.current = { onRecognized, onCancel };
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState(null);
  const [hint, setHint] = useState('Kamera wird vorbereitet …');
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [reading, setReading] = useState(null);
  const [mode, setMode] = useState('code');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const zoomValue = useRef(DEFAULT_ZOOM);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [torch, setTorch] = useState(false);
  const [focusPoint, setFocusPoint] = useState(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusMessage, setFocusMessage] = useState('');
  const focusRequest = useRef(0);
  const [scanRevision, setScanRevision] = useState(0);
  const { width, height } = useWindowDimensions();
  const previewWidth = Math.max(140, Math.min(width - 24, (height - 390) * 0.75));
  const frame = mode === 'code' ? CODE_FRAME : CARD_FRAME;

  function resetReading() {
    stop.current();
    setReading(null);
    setError('');
    setHint('Neue Aufnahmen werden geprüft …');
    setScanRevision(value => value + 1);
  }

  function changeMode(next) {
    if (next === mode) return;
    resetReading();
    setMode(next);
    setFocusPoint(null);
    focusRequest.current++;
    setFocusBusy(false);
    setFocusMessage('');
  }

  function changeZoom(step) {
    if (!settingsReady) return;
    resetReading();
    const next = Math.max(0, Math.min(0.32, Number((zoomValue.current + step).toFixed(2))));
    zoomValue.current = next;
    setZoom(next);
    cameraPreferences.saveZoom(next).then(() => {
      if (mounted.current) setSettingsNotice('');
    }).catch(() => {
      if (mounted.current) setSettingsNotice('Zoom bleibt für diese Sitzung erhalten; dauerhaftes Speichern fehlgeschlagen.');
    });
    setFocusPoint(null);
    focusRequest.current++;
    setFocusBusy(false);
    setFocusMessage('');
  }

  function toggleTorch() {
    resetReading();
    setTorch(value => !value);
    setFocusPoint(null);
    focusRequest.current++;
    setFocusBusy(false);
    setFocusMessage('');
  }

  useEffect(() => {
    let active = true;
    cameraPreferences.loadZoom().then(value => {
      if (!active) return;
      zoomValue.current = value;
      setZoom(value);
    }).catch(() => {
      if (active) setSettingsNotice('Gespeicherter Zoom konnte nicht geladen werden.');
    }).finally(() => { if (active) setSettingsReady(true); });
    return () => { active = false; };
  }, []);

  function focusAt(event) {
    if (!ready || Platform.OS !== 'android') return;
    const { locationX, locationY } = event.nativeEvent;
    resetReading();
    setFocusBusy(true);
    setFocusMessage('Fokus und Belichtung werden angepasst …');
    setFocusPoint({ id: ++focusRequest.current,
      x: Math.max(0, Math.min(1, locationX / previewWidth)),
      y: Math.max(0, Math.min(1, locationY / (previewWidth / 0.75))) });
  }

  function onScanFocus(event) {
    const result = event.nativeEvent;
    if (!mounted.current || result.id !== focusRequest.current) return;
    setFocusBusy(false);
    setFocusMessage(result.status === 'focused' ? 'Fokus gesetzt · Belichtung am Messpunkt angepasst'
      : result.status === 'unsupported' || result.status === 'unavailable'
        ? 'Antipp-Fokus ist auf dieser Kamera nicht verfügbar.'
        : 'Fokus nicht bestätigt. Etwas Abstand halten und erneut tippen.');
  }

  useEffect(() => {
    if (!focusBusy) return;
    const timeout = setTimeout(() => {
      focusRequest.current++;
      setFocusBusy(false);
      setFocusMessage('Keine Fokusbestätigung. Bitte erneut tippen.');
    }, 4500);
    return () => clearTimeout(timeout);
  }, [focusBusy, focusPoint]);

  function cancel() {
    stop.current();
    callbacks.current.onCancel();
  }
  useEffect(() => {
    mounted.current = true;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { cancel(); return true; });
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') cancel();
    });
    return () => { mounted.current = false; stop.current(); back.remove(); app.remove(); };
  }, []);

  async function prepare() {
    if (initializing.current) return;
    initializing.current = true;
    try {
      const sizes = await camera.current.getAvailablePictureSizesAsync();
      // 4:3 bleibt nötig, damit Foto und sichtbarer Scan-Rahmen zusammenpassen.
      const usable = sizes.map(value => {
        const [w, h] = value.split('x').map(Number);
        return { value, short: Math.min(w, h), long: Math.max(w, h) };
      }).filter(size => Math.abs(size.short / size.long - 0.75) < 0.01 && size.short >= 1200)
        .sort((a, b) => a.short - b.short);
      if (!usable.length) throw new Error('Kein passendes Kameraformat verfügbar. Bitte manuell suchen.');
      if (!mounted.current) return;
      // Für kleine Set-Codes das kleinste Format ab 1.920 Pixeln kurzer Seite nehmen.
      // Bietet die Kamera nur kleinere Formate, das größte verfügbare ab 1.200 nutzen.
      const preferred = usable.find(size => size.short >= 1920) ?? usable[usable.length - 1];
      setPictureSize(preferred.value);
      setReady(true);
    } catch (failure) {
      if (mounted.current) setError(failure.message || 'Kamera konnte nicht vorbereitet werden.');
    }
  }

  useEffect(() => {
    if (!ready || !pictureSize || !settingsReady || focusBusy) return;
    // Erst nach Kamerabereitschaft starten. Keine manuelle Aufnahme, kein gespeichertes Foto.
    stop.current = startAutoScan({
      capture: () => camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false, shutterSound: false }),
      recognize: uri => MlkitOcr.recognizeText(uri, 'latin'),
      remove: uri => deleteAsync(uri, { idempotent: true }),
      lookup: lookupCard,
      suggest: suggestScanCodes,
      mode,
      // Die letzte lesbare Aufnahme behalten, damit ein unscharfes Folgebild die Details nicht leert.
      onReading: value => { if (value.rawCodes?.length) setReading(value); },
      onHint: setHint,
      onError: setError,
      onMatch: parsed => callbacks.current.onRecognized(parsed),
    });
    return () => stop.current();
  }, [ready, pictureSize, settingsReady, mode, zoom, torch, focusBusy, scanRevision]);

  return <ScrollView style={{ flex: 1, backgroundColor: '#101827' }} contentContainerStyle={styles.screen}>
    <Text style={styles.heading}>{mode === 'code' ? 'Set-Code in den schmalen Rahmen' : 'Karte in den Rahmen halten'}</Text>
    <View style={styles.controls}>
      <Button title={mode === 'card' ? '✓ Ganze Karte' : 'Ganze Karte'} onPress={() => changeMode('card')} />
      <Button title={mode === 'code' ? '✓ Set-Code nah' : 'Set-Code nah'} onPress={() => changeMode('code')} />
    </View>
    <View style={{ width: previewWidth, height: previewWidth / 0.75 }}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" ratio="4:3"
        zoom={zoom} enableTorch={torch} animateShutter={false}
        {...(Platform.OS === 'android' ? { scanFocusPoint: focusPoint, onScanFocus, scanZoomRatio: 1 + zoom * 10 } : { autofocus: 'on' })}
        pictureSize={pictureSize ?? undefined} onCameraReady={prepare}
        onMountError={() => { stop.current(); setError('Kamera konnte nicht geöffnet werden.'); }} />
      {Platform.OS === 'android' && <Pressable style={StyleSheet.absoluteFill}
        accessibilityRole="button" accessibilityLabel="Fokus und Belichtung auf angetippte Stelle setzen"
        onPress={focusAt} />}
      <View pointerEvents="none" style={[styles.frame, {
        left: frame.x * previewWidth, top: frame.y * previewWidth / 0.75,
        width: frame.width * previewWidth, height: frame.height * previewWidth / 0.75,
      }]} />
      {focusPoint && <View pointerEvents="none" style={[styles.focusMarker, {
        left: Math.max(0, Math.min(previewWidth - 32, focusPoint.x * previewWidth - 16)),
        top: Math.max(0, Math.min(previewWidth / 0.75 - 32, focusPoint.y * previewWidth / 0.75 - 16)),
      }]} />}
    </View>
    <View style={styles.controls}>
      <Button title="− Zoom" disabled={!settingsReady || zoom <= 0} onPress={() => changeZoom(-0.04)} />
      <Text style={styles.codeText}>Zoomstufe {Math.round(zoom / 0.04)}</Text>
      <Button title="+ Zoom" disabled={!settingsReady || zoom >= 0.32} onPress={() => changeZoom(0.04)} />
    </View>
    <Button title={torch ? 'Licht ausschalten' : 'Licht einschalten'} disabled={!ready} onPress={toggleTorch} />
    {!!settingsNotice && <Text style={styles.instruction}>{settingsNotice}</Text>}
    <Text style={styles.instruction}>{focusMessage || (Platform.OS === 'android'
      ? 'Auf den Set-Code tippen: Fokus + Belichtung' : 'Automatischer Fokus aktiv') }</Text>
    <Text accessibilityLiveRegion="polite" style={styles.hint}>{error || (focusBusy ? 'Scharfstellen …' : hint)}</Text>
    <Text selectable style={styles.codeText}>Zuletzt gelesener Code: {reading?.rawCodes?.join(' / ') || '—'}</Text>
    <Button title={showDetails ? 'Vorschläge ausblenden' : 'Code-Vorschläge anzeigen'} onPress={() => setShowDetails(value => !value)} />
    <Button title="Abbrechen / manuell suchen" onPress={cancel} />
    {showDetails && <View style={styles.details}>
      <Text style={styles.heading}>Gelesene Set-Codes</Text>
      <ScrollView style={{ maxHeight: 220 }}>
        {!reading && <Text style={styles.detailText}>Noch kein Set-Code gelesen.</Text>}
        {!!reading?.rawCodes?.length && <Text style={styles.detailText}>Code-Kandidaten: {reading.rawCodes.join(' / ')}</Text>}
        {!!reading && <Text style={styles.detailText}>{reading.hint}</Text>}
        {reading?.suggestions?.map(suggestion => <View key={suggestion.key} style={{ marginVertical: 5 }}>
          <Text style={styles.detailText}>{suggestion.setName}</Text>
          <Button title={`${suggestion.setCode} · ${suggestion.cardName}`} onPress={() => {
            stop.current();
            callbacks.current.onRecognized(suggestion);
          }} />
        </View>)}
      </ScrollView>
      <Button title="Details schließen" onPress={() => setShowDetails(false)} />
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  heading: { color: 'white', fontSize: 19, fontWeight: '600' },
  frame: { position: 'absolute', borderWidth: 3, borderColor: '#7dd3fc', borderRadius: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  instruction: { color: '#cbd5e1', textAlign: 'center', fontSize: 12 },
  focusMarker: { position: 'absolute', width: 32, height: 32, borderWidth: 2, borderColor: '#facc15', borderRadius: 5 },
  hint: { color: 'white', textAlign: 'center', minHeight: 46 },
  codeText: { color: '#7dd3fc', textAlign: 'center', fontWeight: '600' },
  details: { position: 'absolute', left: 12, right: 12, bottom: 110, padding: 14,
    backgroundColor: '#172033', borderColor: '#7dd3fc', borderWidth: 1, borderRadius: 10, gap: 8 },
  detailText: { color: 'white', marginVertical: 5 },
});
