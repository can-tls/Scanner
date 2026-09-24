// expo-camera 17 lacks a public focus-point API. Keep the Android extension
// reproducible after npm ci; fail loudly if an upgrade changes the patch anchors.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../node_modules/expo-camera/', import.meta.url);
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
if (pkg.version !== '17.0.10') throw new Error(`Review camera focus patch for expo-camera ${pkg.version}`);
const base = 'android/src/main/java/expo/modules/camera/';
async function patch(file, edits) {
  const path = new URL(base + file, root);
  let source = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
  for (const [anchor, replacement] of edits) {
    if (source.includes(replacement)) continue;
    if (!source.includes(anchor)) throw new Error(`Camera patch anchor missing: ${file}: ${anchor}`);
    source = source.replace(anchor, replacement);
  }
  await writeFile(path, source);
}
await patch('CameraViewModule.kt', [
  ['  "onCameraReady",', '  "onCameraReady",\n  "onScanFocus",'],
  ['      Prop("facing")', `      Prop("scanFocusPoint") { view, point: Map<String, Double>? ->
        point?.let { view.scanFocusAt(it) }
      }

      Prop("facing")`],
  ['      Prop("zoom")', `      Prop("scanZoomRatio") { view, ratio: Float? ->
        view.scanZoomRatio = ratio
      }

      Prop("zoom")`],
]);
const focus = await readFile(new URL('scan-focus.kt.txt', import.meta.url), 'utf8');
await patch('ExpoCameraView.kt', [
  ['  private fun startFocusMetering() {', focus.trimEnd() + '\n\n  private fun startFocusMetering() {'],
  ['  private fun setCameraZoom(value: Float) {', `  var scanZoomRatio: Float? = null
    set(value) {
      field = value
      setCameraZoom(zoom)
    }

  private fun setCameraZoom(value: Float) {`],
  ['value.coerceIn(0f, 1f) * maxZoomRatio', '(scanZoomRatio ?: (value.coerceIn(0f, 1f) * maxZoomRatio))'],
]);
console.log('Android focus and exposure metering patch ready.');
