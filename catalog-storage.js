import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { validateCatalog } from './catalog-update.mjs';

const ACTIVE_KEY = 'marketscan:catalog:file:v1';
const file = name => FileSystem.documentDirectory + name;
const validName = name => /^catalog-\d+-[a-z0-9]+\.json$/.test(name);

export async function readSavedCatalog() {
  const name = await AsyncStorage.getItem(ACTIVE_KEY);
  if (!name) return null;
  if (!validName(name)) throw new Error('Ungültiger Katalogdateiname.');
  return validateCatalog(JSON.parse(await FileSystem.readAsStringAsync(file(name))));
}

export async function saveCatalog(catalog) {
  const previous = await AsyncStorage.getItem(ACTIVE_KEY);
  const name = `catalog-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`;
  // Die große JSON-Datei gehört ins Dateisystem. Nur der aktive Dateiname liegt in AsyncStorage.
  // Erst nach erfolgreichem Schreiben umschalten: Abbruch/Platzmangel beschädigt den alten Stand nicht.
  try {
    await FileSystem.writeAsStringAsync(file(name), JSON.stringify(catalog));
    await AsyncStorage.setItem(ACTIVE_KEY, name);
  } catch (error) {
    await FileSystem.deleteAsync(file(name), { idempotent: true }).catch(() => {});
    throw error;
  }
  if (previous && validName(previous)) {
    await FileSystem.deleteAsync(file(previous), { idempotent: true }).catch(() => {});
  }
}
