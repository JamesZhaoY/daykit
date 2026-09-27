import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRegex } from '../public/regex.js';

test('regex matching reports values, indexes, numbered and named groups', () => {
  const result = evaluateRegex('(?<user>[a-z]+)@([a-z]+)\\.com', 'gi', 'Ada@example.com and bob@test.com');
  assert.equal(result.matchCount, 2);
  assert.equal(result.captureCount, 2);
  assert.equal(result.matches[0].value, 'Ada@example.com');
  assert.equal(result.matches[0].index, 0);
  assert.deepEqual(result.matches[0].groups, ['Ada', 'example']);
  assert.equal(result.matches[1].namedGroups.user, 'bob');
  assert.equal(evaluateRegex('[()]', 'g', '()').captureCount, 0);
});

test('non-global expressions follow JavaScript first-match semantics and zero-width globals terminate', () => {
  assert.equal(evaluateRegex('foo', 'i', 'foo foo').matchCount, 1);
  const result = evaluateRegex('^|$', 'gm', 'a\nb');
  assert.ok(result.matchCount > 0 && result.matchCount < 10);
});

test('invalid, unsupported and oversized input is rejected clearly', () => {
  assert.throws(() => evaluateRegex('[', 'g', 'text'), /无效/);
  assert.throws(() => evaluateRegex('a', 'z', 'text'), /flags/);
  assert.throws(() => evaluateRegex('a'.repeat(4097), '', 'text'), /过长/);
  assert.throws(() => evaluateRegex('a', '', 'x'.repeat(1_000_001)), /过长/);
  assert.throws(() => evaluateRegex('a', 'gg', 'text'), /重复/);
  assert.throws(() => evaluateRegex('a', 'uv', 'text'), /同时/);
  assert.equal(evaluateRegex('(a+)+$', '', 'aaaa').matchCount, 1);
  assert.equal(evaluateRegex('(?=.)', 'gu', '😀a').matchCount, 2);
  const capped = evaluateRegex('a', 'g', 'a'.repeat(1001));
  assert.equal(capped.matchCount, 1000);
  assert.equal(capped.truncated, true);
});

test('large capture structures are bounded before sending results back to the page', () => {
  assert.throws(() => evaluateRegex('('.repeat(65) + 'a' + ')'.repeat(65), '', 'a'), /捕获组超过/);
  assert.throws(() => evaluateRegex('((a+))', '', 'a'.repeat(800000)), /匹配结果过大/);
});
