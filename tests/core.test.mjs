import test from 'node:test';
import assert from 'node:assert/strict';
import { formatJSON, encodeText, parseTimestamp, parseDatetime, datetimeValue, MAX_INPUT_BYTES } from '../public/core.mjs';

test('JSON formats, minifies and preserves scalar values; rejects invalid and unsafe input', () => {
  assert.equal(formatJSON('{"name":"日用","a":[true,null]}'), '{\n  "name": "日用",\n  "a": [\n    true,\n    null\n  ]\n}');
  assert.equal(formatJSON('{ "a": 1 }', 0), '{"a":1}');
  assert.equal(formatJSON('false'), 'false');
  assert.equal(formatJSON('null'), 'null');
  assert.throws(() => formatJSON('{"a":}'));
  assert.throws(() => formatJSON('{"id":9007199254740993}'), /安全精度/);
  assert.throws(() => formatJSON('1e400'), /安全精度/);
  assert.throws(() => formatJSON(''));
});

test('UTF-8 Base64 and URL round trips; invalid encodings fail without corrupting data', () => {
  const text = '日用工具 / café + \u{1D11E}\n第二行';
  for (const kind of ['base64', 'url']) assert.equal(encodeText(encodeText(text, kind), kind, true), text);
  assert.equal(encodeText('hello', 'base64'), 'aGVsbG8=');
  assert.equal(encodeText('YQ', 'base64', true), 'a');
  assert.equal(encodeText('a+b', 'url', true), 'a+b');
  assert.throws(() => encodeText('not base64!', 'base64', true));
  assert.throws(() => encodeText('/w==', 'base64', true), /UTF-8/);
  assert.throws(() => encodeText('%E0%A4', 'url', true));
  const large = '中文'.repeat(20000);
  assert.equal(encodeText(encodeText(large, 'base64'), 'base64', true), large);
  assert.throws(() => encodeText('a'.repeat(MAX_INPUT_BYTES + 1), 'base64'), /2 MB/);
});

test('timestamps handle units, epoch, negatives and invalid ranges', () => {
  assert.equal(parseTimestamp('0').date.toISOString(), '1970-01-01T00:00:00.000Z');
  assert.equal(parseTimestamp('-1', 's').date.toISOString(), '1969-12-31T23:59:59.000Z');
  assert.equal(parseTimestamp('1750000000').date.getTime(), 1750000000000);
  assert.equal(parseTimestamp('1750000000123').date.getTime(), 1750000000123);
  assert.equal(parseTimestamp('1000', 'ms').date.getTime(), 1000);
  for (const bad of ['', 'abc', '1.5', '999999999999999999999']) assert.throws(() => parseTimestamp(bad));
});

test('date conversion validates calendar dates and supports UTC/local round trips', () => {
  assert.equal(parseDatetime('2024-02-29T00:00', true).toISOString(), '2024-02-29T00:00:00.000Z');
  assert.throws(() => parseDatetime('2025-02-29T00:00', true));
  assert.throws(() => parseDatetime('2026-01-01T24:00', true));
  assert.throws(() => parseDatetime(''));
  for (const utc of [false, true]) {
    const value = '2026-09-25T12:34:56';
    assert.equal(datetimeValue(parseDatetime(value, utc), utc), value);
  }
});
