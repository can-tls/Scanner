import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLocalStore } from './local-store.mjs';
import { createCameraPreferences } from './camera-preferences.mjs';

// Nur hier hängt die Speicherlogik am Handy. Tests setzen stattdessen einen Testspeicher ein.
export const localStore = createLocalStore(AsyncStorage);
export const cameraPreferences = createCameraPreferences(AsyncStorage);
