import test from 'node:test';
import assert from 'node:assert/strict';
import { extractScanCodeCandidates } from '../scan-parser.mjs';
import { readCardInFrame } from '../auto-scan.mjs';

test('Scan lässt OCR-Ziffernverwechslungen bis zur Zahlenkorrektur durch', () => {
  const codes = ['SDY-001', 'SDY-G001', 'L26D-DES22', 'RA03-DE081', 'abc-a12', 'AB12-12345', 'SDY – G001',
    'ABC-DEO1', 'ABC-DE1O', 'SDJ-GOOO', 'SDJ-G0O1', 'SDJ-G00O'];
  for (const code of codes) assert.deepEqual(extractScanCodeCandidates(code), [code]);
  for (const code of ['AB-DE001', 'ABCDE-DE001', 'ABC-12', 'ABC-DE1234',
    'ABC-DEAB', 'Himmelsjäger-Mobilisierung', 'ATK-DEF', 'ABC-DE001-X',
    'ABC-DE0012', 'X-ABC-DE001', 'SDJ-G-026', 'ÄABC-DE001', 'ABC-DE001Ä']) {
    assert.deepEqual(extractScanCodeCandidates(code), [], code);
  }
});

test('Unpassende Bindestrichtexte blockieren einen gültigen Scan nicht', () => {
  const line = text => ({ text, frame: { x: 300, y: 1050, width: 600, height: 35 } });
  const result = readCardInFrame({ blocks: [{ lines: [line('ATK-DEF'), line('L26D-DES22')] }] },
    { width: 1200, height: 1600 }, ({ setCode }) => {
      assert.equal(setCode, 'L26D-DES22');
      return { variants: [{ cardId: 1, cardName: 'Example' }] };
    });
  assert.deepEqual(result.rawCodes, ['L26D-DES22']);
  assert.equal(result.candidate.setCode, 'L26D-DES22');
});
