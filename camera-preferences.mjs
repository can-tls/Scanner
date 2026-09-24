const KEY = 'marketscan.camera.zoom.v1';
export const DEFAULT_ZOOM = 0.08;
const validZoom = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 0.32;

export function createCameraPreferences(storage) {
  let current;
  let loading;
  let writing = Promise.resolve();
  return {
    loadZoom() {
      if (current !== undefined) return Promise.resolve(current);
      loading ??= storage.getItem(KEY).then(raw => {
        let value;
        try { value = JSON.parse(raw); } catch { /* Ignore damaged preferences. */ }
        current = validZoom(value) ? value : DEFAULT_ZOOM;
        return current;
      }).catch(error => { loading = undefined; throw error; });
      return loading;
    },
    saveZoom(value) {
      if (!validZoom(value)) return Promise.reject(new Error('Ungültige Zoomstufe'));
      current = value;
      // Preserve the last tap even if earlier writes complete slowly.
      writing = writing.catch(() => {}).then(() => storage.setItem(KEY, JSON.stringify(value)));
      return writing;
    },
  };
}
