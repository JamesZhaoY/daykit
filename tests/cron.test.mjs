import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCron, normalizeCron } from '../public/cron-core.mjs';

const FROM = '2026-09-27T00:00:00Z';
const evaluate = (expression, options = {}) => evaluateCron(expression, { from: FROM, ...options });

test('five-field Cron returns the next ten occurrences strictly after start with Chinese explanation', () => {
  const result = evaluate('*/5 * * * *');
  assert.equal(result.runs.length, 10);
  assert.equal(result.runs[0].iso, '2026-09-27T00:05:00.000Z');
  assert.equal(result.runs.at(-1).iso, '2026-09-27T00:50:00.000Z');
  assert.match(result.description, /5 分钟/);
  assert.match(result.runs[0].display, /2026-09-27 08:05:00/);
  assert.equal(result.fields.length, 5);
  assert.equal(result.limited, false);
});

test('Cloudflare weekday numbers, names, ranges and steps are shifted before Unix parsing', () => {
  assert.equal(evaluate('0 0 * * 1', { mode: 'cloudflare' }).runs[0].iso, '2026-10-04T00:00:00.000Z');
  assert.equal(evaluate('0 0 * * 7', { mode: 'cloudflare' }).runs[0].iso, '2026-10-03T00:00:00.000Z');
  assert.equal(evaluate('0 0 * * 1').runs[0].iso, '2026-09-28T00:00:00.000Z');
  assert.equal(evaluate('0 0 * * 7').runs[0].iso, '2026-10-04T00:00:00.000Z');
  assert.equal(normalizeCron('10 7 * * MON-FRI', 'cloudflare').normalized, '10 7 * * 1,2,3,4,5');
  assert.equal(normalizeCron('0 0 * * 2-6/2', 'cloudflare').normalized, '0 0 * * 1,3,5');
  assert.equal(normalizeCron('0 0 * * */2', 'cloudflare').normalized, '0 0 * * 0,2,4,6');
  assert.equal(normalizeCron('0 0 * * 2/2', 'cloudflare').normalized, '0 0 * * 1,3,5');
  assert.equal(evaluate('0 0 * * SUN', { mode: 'cloudflare' }).runs[0].iso, evaluate('0 0 * * SUN').runs[0].iso);
});

test('Unix day-of-month/day-of-week are OR, including dates absent from the selected month', () => {
  const result = evaluate('0 0 1 * MON');
  assert.equal(result.dayOr, true);
  assert.deepEqual(result.runs.slice(0, 3).map(value => value.iso), ['2026-09-28T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2026-10-05T00:00:00.000Z']);
  assert.match(result.description, /或者/);
  assert.equal(evaluate('0 0 31 FEB MON', { from: '2026-01-31T00:00:00Z' }).runs[0].iso, '2026-02-02T00:00:00.000Z');
  const overlap = evaluate('0 0 1 * MON', { from: '2026-05-31T00:00:00Z' });
  assert.equal(overlap.runs[0].iso, '2026-06-01T00:00:00.000Z');
  assert.equal(new Set(overlap.runs.map(value => value.iso)).size, 10);
});

test('execution timezone changes the schedule, while display timezone preserves instants', () => {
  assert.equal(evaluate('0 9 * * *', { timeZone: 'Asia/Shanghai' }).runs[0].iso, '2026-09-27T01:00:00.000Z');
  assert.equal(evaluate('0 9 * * *', { timeZone: 'UTC' }).runs[0].iso, '2026-09-27T09:00:00.000Z');
  const display = evaluate('0 9 * * *', { displayTimeZone: 'America/New_York' });
  assert.equal(display.runs[0].iso, '2026-09-27T09:00:00.000Z');
  assert.match(display.runs[0].display, /05:00:00.*GMT-4/);
});

test('DST follows cron-parser: daily spring gap shifts, daily fall duplicate runs once, hourly preserves both instants', () => {
  const spring = evaluate('30 2 * * *', { from: '2026-03-07T00:00:00Z', timeZone: 'America/New_York' });
  assert.deepEqual(spring.runs.slice(0, 3).map(value => value.iso), ['2026-03-07T07:30:00.000Z', '2026-03-08T07:30:00.000Z', '2026-03-09T06:30:00.000Z']);
  assert.match(spring.runs[1].scheduled, /03:30:00.*GMT-4/);
  const fall = evaluate('30 1 * * *', { from: '2026-10-31T00:00:00Z', timeZone: 'America/New_York' });
  assert.deepEqual(fall.runs.slice(0, 3).map(value => value.iso), ['2026-10-31T05:30:00.000Z', '2026-11-01T05:30:00.000Z', '2026-11-02T06:30:00.000Z']);
  const hourly = evaluate('0 * * * *', { from: '2026-11-01T04:00:00Z', timeZone: 'America/New_York' });
  assert.deepEqual(hourly.runs.slice(0, 2).map(value => value.iso), ['2026-11-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z']);
});

test('leap dates and bounded searches report partial or absent results without unbounded iteration', () => {
  const leap = evaluate('0 0 29 FEB *');
  assert.equal(leap.runs.length, 10);
  assert.equal(leap.runs[0].iso, '2028-02-29T00:00:00.000Z');
  const bounded = evaluate('0 0 29 FEB *', { horizonYears: 1 });
  assert.equal(bounded.runs.length, 0);
  assert.equal(bounded.limited, true);
  assert.match(bounded.notice, /不表示此后永不执行/);
  assert.throws(() => evaluate('0 0 31 FEB *'), /没有可执行日期/);
});

test('invalid inputs and unsupported dialect syntax fail clearly rather than being reinterpreted', () => {
  for (const expression of ['', '* * * *', '* * * * * *', '@daily', '99 * * * *', '*/0 * * * *', '0 0 * * 8', '0 0 * 13 *', '0 0 * * 5-1', '0 0 LW * *', '0 0 * * MON#2', '0 0 ? * *', 'H * * * *', '<img> * * * *', '0,,2 * * * *', '0 * * * *'.repeat(50)]) assert.throws(() => evaluate(expression));
  assert.throws(() => evaluate('0 0 * * 0', { mode: 'cloudflare' }), /1–7/);
  assert.throws(() => evaluate('0 0 1 * MON', { mode: 'cloudflare' }), /同时限制日期和星期/);
  assert.throws(() => evaluate('0 0 * * *', { mode: 'cloudflare', timeZone: 'Asia/Shanghai' }), /固定按 UTC/);
  assert.throws(() => evaluate('* * * * *', { timeZone: 'Mars/Base' }), /时区无效/);
  assert.throws(() => evaluate('* * * * *', { displayTimeZone: 'Mars/Base' }), /时区无效/);
  for (const from of ['2026-09-27T00:00:00', '2026-02-30T00:00:00Z', '2026-09-27T24:00:00Z', 'oops']) assert.throws(() => evaluate('* * * * *', { from }));
  assert.throws(() => evaluate('* * * * *', { count: 100 }), /1–10/);
});
