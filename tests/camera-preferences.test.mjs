import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraPreferences, DEFAULT_ZOOM } from '../camera-preferences.mjs';

test('Zoom bleibt zwischen Scans und nach neuem Laden erhalten, einschließlich Null', async () => {
  let saved = null;
  const storage = { getItem: async () => saved, setItem: async (_, value) => { saved = value; } };
  const preferences = createCameraPreferences(storage);
  assert.equal(await preferences.loadZoom(), DEFAULT_ZOOM);
  for (const zoom of [0.24, 0]) {
    const write = preferences.saveZoom(zoom);
    assert.equal(await preferences.loadZoom(), zoom);
    await write;
    assert.equal(await createCameraPreferences(storage).loadZoom(), zoom);
  }
});

test('Beschädigte oder unzulässige gespeicherte Werte nutzen den Standard', async () => {
  for (const raw of [null, 'oops', 'null', '"0.2"', '-1', '2', '{}']) {
    assert.equal(await createCameraPreferences({ getItem: async () => raw }).loadZoom(), DEFAULT_ZOOM);
  }
});

test('Schnelle Zoomänderungen werden geordnet gespeichert; Schreibfehler blockieren keine spätere Änderung', async () => {
  const writes = [];
  const preferences = createCameraPreferences({
    setItem: async (_, value) => {
      writes.push(value);
      if (writes.length === 1) throw new Error('Speicher belegt');
    },
  });
  const failed = preferences.saveZoom(0.12);
  const latest = preferences.saveZoom(0.2);
  await assert.rejects(failed);
  await latest;
  assert.deepEqual(writes, ['0.12', '0.2']);
  assert.equal(await preferences.loadZoom(), 0.2);
});
