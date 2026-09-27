import test from 'node:test';
import assert from 'node:assert/strict';
import { diffText, normalizeDiffLine, splitDiffLines, MAX_DIFF_BYTES, MAX_DIFF_LINES } from '../public/diff.js';

test('line diff reports additions, removals and unchanged rows', () => {
  const result = diffText('one\ntwo\nkeep', 'one\nthree\nkeep\nnew');
  assert.deepEqual(result.counts, { added: 2, removed: 1, unchanged: 2 });
  assert.deepEqual(result.rows.map(row => row.type), ['unchanged', 'removed', 'added', 'unchanged', 'added']);
  assert.equal(result.rows[1].text, 'two');
  assert.equal(result.rows[2].text, 'three');
});

test('whitespace option compares normalized lines while retaining source text', () => {
  assert.equal(normalizeDiffLine('  a   b\t'), 'a b');
  assert.deepEqual(diffText('  a   b  ', 'a b', { ignoreWhitespace: true }).counts, { added: 0, removed: 0, unchanged: 1 });
  assert.equal(diffText('  a   b  ', 'a b', { ignoreWhitespace: true }).rows[0].text, '  a   b  ');
  assert.deepEqual(splitDiffLines('a\r\nb'), ['a', 'b']);
});

test('diff rejects oversized input and excessive lines before allocating the LCS table', () => {
  assert.throws(() => diffText('x'.repeat(MAX_DIFF_BYTES + 1), ''), /超过/);
  assert.throws(() => diffText(Array(MAX_DIFF_LINES + 1).fill('x').join('\n'), ''), /行/);
});

test('HTML-looking text remains data in the diff rows', () => {
  const result = diffText('<img src=x onerror=alert(1)>', '<b>safe</b>');
  assert.equal(result.rows[0].text, '<img src=x onerror=alert(1)>');
});
