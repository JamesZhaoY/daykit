import test from 'node:test';
import assert from 'node:assert/strict';
import { convertConfig, MAX_CONFIG_LENGTH } from '../public/config-core.mjs';

const expected = { name: '日用 Daykit', enabled: true, count: 3, ratio: 2.5, tags: ['中文', 'a:b'], server: { host: 'localhost', ports: [80, 443] }, items: [{ name: 'one' }, { name: 'two' }] };
const sources = {
  json: JSON.stringify(expected),
  yaml: 'name: 日用 Daykit\nenabled: true\ncount: 3\nratio: 2.5\ntags: [中文, "a:b"]\nserver:\n  host: localhost\n  ports: [80, 443]\nitems:\n  - name: one\n  - name: two\n',
  toml: 'name = "日用 Daykit"\nenabled = true\ncount = 3\nratio = 2.5\ntags = ["中文", "a:b"]\n[server]\nhost = "localhost"\nports = [80, 443]\n[[items]]\nname = "one"\n[[items]]\nname = "two"\n',
};

test('all six conversion directions retain Chinese, nested tables, arrays and basic types', () => {
  for (const source of ['json', 'yaml', 'toml']) for (const target of ['json', 'yaml', 'toml']) {
    if (source === target) continue;
    const converted = convertConfig(sources[source], source, target);
    const normalized = target === 'json' ? converted.output : convertConfig(converted.output, target, 'json').output;
    assert.deepEqual(JSON.parse(normalized), expected, `${source} → ${target}`);
  }
});

test('TOML rejects null anywhere and a non-table root instead of dropping values', () => {
  for (const source of ['{"secret":null}', '{"items":[1,null]}', '[1,2]', '"text"', 'true', 'null']) {
    assert.throws(() => convertConfig(source, 'json', 'toml'), /null|根节点/);
  }
  assert.equal(JSON.parse(convertConfig('[1,null,true]', 'json', 'json').output)[1], null);
  const empty = convertConfig('{}', 'json', 'toml').output;
  assert.deepEqual(JSON.parse(convertConfig(empty, 'toml', 'json').output), {});
});

test('malformed JSON, YAML and TOML report useful parsing errors with line and column', () => {
  assert.throws(() => convertConfig('{\n "a": ]}', 'json', 'yaml'), /第 2 行，第/);
  assert.throws(() => convertConfig('name: [\n', 'yaml', 'json'), /第 \d+ 行，第 \d+ 列/);
  assert.throws(() => convertConfig('name = [', 'toml', 'json'), /第 1 行，第/);
  assert.throws(() => convertConfig('{"a":1,}', 'json', 'yaml'), /JSON/);
  assert.throws(() => convertConfig('{a:1}', 'json', 'yaml'), /JSON/);
});

test('duplicate keys, multiple documents and non-string YAML keys are rejected', () => {
  for (const [text, format] of [['{"x":1,"x":2}', 'json'], ['x: 1\nx: 2', 'yaml'], ['x = 1\nx = 2', 'toml']]) assert.throws(() => convertConfig(text, format, 'json'));
  assert.throws(() => convertConfig('a: 1\n---\nb: 2', 'yaml', 'json'), /解析错误/);
  assert.throws(() => convertConfig('1: first', 'yaml', 'json'), /非字符串键/);
  assert.throws(() => convertConfig('? [a, b]\n: value', 'yaml', 'json'), /非字符串键/);
  assert.throws(() => convertConfig('value: !custom test', 'yaml', 'json'), /解析错误|标签/);
  assert.throws(() => convertConfig('value: !!set {a, b}', 'yaml', 'json'), /标签/);
});

test('unsafe integers, rounded decimals, non-finite numbers and negative zero cannot silently change', () => {
  for (const [text, format] of [
    ['{"id":9007199254740993}', 'json'], ['id: 9007199254740993', 'yaml'], ['id = 9007199254740993', 'toml'],
    ['{"ratio":9007199254740991.1}', 'json'], ['ratio: 1.00000000000000001', 'yaml'], ['ratio = 1.00000000000000001', 'toml'],
    ['{"ratio":1e-999}', 'json'], ['ratio: .nan', 'yaml'], ['ratio = inf', 'toml'], ['{"x":-0}', 'json'], ['x = -0.0', 'toml'],
  ]) assert.throws(() => convertConfig(text, format, 'json'), /精度|范围|NaN|Infinity|负零/, `${format}: ${text}`);
  assert.equal(JSON.parse(convertConfig('{"id":"9007199254740993","ratio":0.1}', 'json', 'json').output).id, '9007199254740993');
  assert.equal(JSON.parse(convertConfig('x: 1e2\ny: 0xFF', 'yaml', 'json').output).y, 255);
});

test('TOML native dates require an explicit string; strings and YAML 1.2 dates remain strings', () => {
  for (const date of ['1979-05-27', '07:32:00', '1979-05-27T07:32:00.123456Z']) {
    assert.throws(() => convertConfig(`date = ${date}`, 'toml', 'json'), /日期或时间类型/);
    assert.equal(JSON.parse(convertConfig(`date = "${date}"`, 'toml', 'json').output).date, date);
  }
  assert.equal(JSON.parse(convertConfig('date: 2026-09-27', 'yaml', 'json').output).date, '2026-09-27');
});

test('TOML float type survives TOML normalization and YAML comments are intentionally removed', () => {
  assert.match(convertConfig('x = 1.0\ny = 1', 'toml', 'toml').output, /x = 1\.0\ny = 1\n/);
  assert.equal(convertConfig('# comment\na: 1', 'yaml', 'yaml').output, 'a: 1\n');
});

test('TOML decimal precision checks ignore numeric-looking keys, strings and comments', () => {
  for (const source of ['0.12345678901234567890 = "value"', '[0.12345678901234567890]\nx = 1', 'x = {0.12345678901234567890 = 1}', 'x = "1.00000000000000001" # 1.00000000000000001']) assert.doesNotThrow(() => convertConfig(source, 'toml', 'json'));
  for (const source of ['x = [\n [1.00000000000000001]\n]', 'x = { a = [1.00000000000000001] }', 'x = """ends with two quotes"""""\ny = 1.00000000000000001']) assert.throws(() => convertConfig(source, 'toml', 'json'), /精度/);
});

test('aliases are bounded, cycles rejected and input and nesting limits enforced', () => {
  assert.deepEqual(JSON.parse(convertConfig('a: &x {name: test}\nb: *x', 'yaml', 'json').output), { a: { name: 'test' }, b: { name: 'test' } });
  assert.throws(() => convertConfig('a: &x [*x]', 'yaml', 'json'), /循环/);
  const bomb = 'a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\nc: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]';
  assert.throws(() => convertConfig(bomb, 'yaml', 'json'), /别名/);
  assert.throws(() => convertConfig(' '.repeat(MAX_CONFIG_LENGTH) + '{}'), /超过/);
  assert.throws(() => convertConfig('['.repeat(70) + '0' + ']'.repeat(70), 'json', 'yaml'), /嵌套|过深/);
});

test('HTML strings and prototype-looking keys remain literal data without pollution', () => {
  const text = '{"__proto__":{"polluted":true},"constructor":"literal","html":"<img src=x onerror=alert(1)>"}';
  for (const target of ['json', 'yaml', 'toml']) {
    const output = convertConfig(text, 'json', target).output;
    const normalized = JSON.parse(convertConfig(output, target, 'json').output);
    assert.deepEqual(normalized, JSON.parse(text));
  }
  assert.equal({}.polluted, undefined);
});
