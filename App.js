import { useRef, useState } from 'react';
import {
  Button,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';

import MlkitOcr from 'rn-mlkit-ocr';

export default function App() {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);

  const cameraRef = useRef(null);

  const [permission, requestPermission] = useCameraPermissions();

  const [ocrText, setOcrText] = useState('');
  const [cardName, setCardName] = useState('');
  const [setCode, setSetCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  const takePhoto = async () => {
    if (!cameraRef.current || isScanning) return;

    setIsScanning(true);
    setScanError('');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
      });

      setPhotoUri(photo.uri);
      setCameraOpen(false);

      const result = await MlkitOcr.recognizeText(photo.uri, 'latin');

      setOcrText(result.text);

      const parsed = parseCardText(result);

      setCardName(parsed.cardName);
      setSetCode(parsed.setCode);

      console.log('Kartenname:', parsed.cardName);
      console.log('Set-Code:', parsed.setCode);
      console.log('Raw Set-Code:', parsed.rawSetCode);

    } catch (error) {
      console.error('Scan fehlgeschlagen:', error);
      setScanError(
        error?.message ?? 'Die Karte konnte nicht gelesen werden.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  function parseCardText(result) {
    const lines = result.blocks
      .flatMap((block) => block.lines)
      .map((line) => ({
        text: normalizeLine(line.text),
        x: line.frame?.x ?? null,
        y: line.frame?.y ?? null,
        width: line.frame?.width ?? null,
        height: line.frame?.height ?? null,
      }))
      .filter((line) => line.text.length > 1);

    const setCodeResult = findSetCode(
      lines.map((line) => line.text)
    );

    const setCode = setCodeResult?.normalized ?? '';
    const rawSetCode = setCodeResult?.raw ?? '';

    const ignoredPatterns = [
      /^\d+$/,
      /^ATK/i,
      /^DEF/i,
      /^©/,
      /KONAMI/i,
      /1ST EDITION/i,
      /LIMITED EDITION/i,
      /SPELL CARD/i,
      /TRAP CARD/i,
    ];

    const titleCandidates = lines
      .filter(
        (line) =>
          !ignoredPatterns.some((pattern) =>
            pattern.test(line.text)
          )
      )

      // Raw und normalisierten Set-Code nicht als Titel verwenden
      .filter(
        (line) =>
          line.text.toUpperCase() !== rawSetCode &&
          line.text.toUpperCase() !== setCode
      )

      // Oberste erkannte Textzeile bevorzugen
      .sort((a, b) => a.y - b.y);

    return {
      cardName: titleCandidates[0]?.text ?? '',
      setCode,
      rawSetCode,
    };
  }

  function normalizeLine(text) {
    return text
      .toUpperCase()
      .replace(/[–—]/g, '-')
      .replace(/\s*-\s*/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findSetCode(lines) {
    for (const line of lines) {
      const normalized = normalizeLine(line);

      const match = normalized.match(
        /\b([A-Z0-9()[\]{}|]{2,8})-([A-Z0-9]{2,8})\b/
      );

      if (!match) {
        continue;
      }

      const rawCode = match[0];

      let prefix = match[1];
      let suffix = match[2];

      prefix = normalizeSetPrefix(prefix);
      suffix = removeLanguageCode(suffix);
      suffix = normalizeNumericPart(suffix);

      if (!/^\d{2,5}$/.test(suffix)) {
        continue;
      }

      return {
        raw: rawCode,
        normalized: `${prefix}-${suffix}`,
      };
    }

    return null;
  }


  function removeLanguageCode(suffix) {
    /*
    * Erst zweistellige Codes prüfen,
    * sonst würde z.B. EN001 falsch behandelt werden.
    */
    const twoLetterCodes = [
      'EN',
      'DE',
      'FR',
      'IT',
      'ES',
      'PT',
      'NL',
    ];

    for (const code of twoLetterCodes) {
      if (suffix.startsWith(code)) {
        return suffix.slice(2);
      }
    }

    /*
    * Alte einstellige Sprachkennungen.
    */
    const oneLetterCodes = [
      'G',
      'E',
      'F',
      'I',
      'S',
      'P',
    ];

    for (const code of oneLetterCodes) {
      if (suffix.startsWith(code)) {
        return suffix.slice(1);
      }
    }

    return suffix;
  }


  function normalizeSetPrefix(prefix) {
    let value = prefix
      .toUpperCase()
      .replace(/\s+/g, '');

    // Häufige OCR-Varianten speziell von SDJ
    if (
      value === 'SDI' ||
      value === 'SD)' ||
      value === 'SD]' ||
      value === 'SD}' ||
      value === 'SD1' ||
      value === 'SD'
    ) {
      return 'SDJ';
    }

    return value;
  }

  function normalizeNumericPart(value) {
    return value
      /*
      * sehr typische OCR-Verwechslungen
      */
      .replace(/O/g, '0')
      .replace(/Q/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/Z/g, '2')
      .replace(/S/g, '5')
      .replace(/B/g, '8')

      /*
      * Alles entfernen, was danach noch
      * keine Zahl ist.
      */
      .replace(/[^0-9]/g, '');
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Lade Kameraberechtigung...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>
          Die App braucht Zugriff auf deine Kamera.
        </Text>

        <Button
          title="Kamera erlauben"
          onPress={requestPermission}
        />
      </View>
    );
  }

  if (cameraOpen) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />

        <View style={styles.cameraControls}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={takePhoto}
          />

          <Button
            title="Abbrechen"
            onPress={() => setCameraOpen(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        MarketScan
      </Text>

      {photoUri && (
        <>
          <Image
            source={{ uri: photoUri }}
            style={styles.preview}
          />

          <Text style={styles.success}>
            Foto aufgenommen: {photoUri}
          </Text>
        </>
      )}

      <Button
        title={photoUri ? 'Neue Karte scannen' : 'Karte scannen'}
        onPress={() => setCameraOpen(true)}
      />

      {isScanning && <Text>Karte wird gelesen …</Text>}

      {!!scanError && (
        <Text style={{ color: 'red' }}>{scanError}</Text>
      )}

      {!!ocrText && (
        <View>
          <Text style={{ fontWeight: 'bold' }}>Erkannter Text:</Text>
          <Text selectable>{ocrText}</Text>
        </View>
      )}

      {!!cardName && !!setCode && <Text>Kartenname: {cardName}  Set-Code: {setCode}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    padding: 20,
  },

  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },

  cameraControls: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    alignItems: 'center',
    gap: 20,
  },

  captureButton: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: 'white',
    borderWidth: 6,
    borderColor: '#cccccc',
  },

  preview: {
    width: 220,
    height: 320,
    resizeMode: 'contain',
    backgroundColor: '#eeeeee',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },

  text: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 30,
  },

  success: {
    fontSize: 16,
    fontWeight: '600',
  },
});