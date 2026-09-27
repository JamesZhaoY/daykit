import { parseDocument, stringify as stringifyYAML, isScalar, isMap, isSeq } from 'yaml';
import { parse as parseTOML, stringify as stringifyTOML } from 'smol-toml';

export const CONFIG_FORMATS = ['json', 'yaml', 'toml'];
export const MAX_CONFIG_LENGTH = 200_000;
const MAX_NODES = 20_000;
const MAX_DEPTH = 64;

function positionAt(text, offset) {
  const before = text.slice(0, offset);
  return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') };
}

function locatedError(message, text, offset) {
  const { line, column } = positionAt(text, offset);
  return new Error(`第 ${line} 行，第 ${column} 列：${message}`);
}

// Compare decimal values as text, without first rounding them to a JS number.
function decimalValue(source) {
  const match = source.replaceAll('_', '').match(/^([+-]?)(\d*)\.?([\d]*)(?:[eE]([+-]?\d+))?$/);
  if (!match || !(match[2] || match[3])) return null;
  let digits = `${match[2]}${match[3]}`.replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = BigInt(match[4] || '0') - BigInt(match[3].length);
  const trimmed = digits.replace(/0+$/, '');
  exponent += BigInt(digits.length - trimmed.length);
  return `${match[1] === '-' ? '-' : ''}${trimmed}e${exponent}`;
}

function checkNumberSource(source, value, text, offset) {
  if ((typeof value === 'number' || typeof value === 'bigint') && /^-/.test(source) && decimalValue(source) === '0') throw locatedError('负零转换后可能丢失符号，请改为 0 或带引号的字符串。', text, offset);
  if (typeof value !== 'number') return;
  if (!Number.isFinite(value)) throw locatedError('不支持 NaN、Infinity 或超出范围的数值。', text, offset);
  const original = decimalValue(source);
  if (original && original !== decimalValue(String(value))) {
    throw locatedError('此数值转换后会丢失精度，请改为带引号的字符串。', text, offset);
  }
}

function checkYAMLNumbers(node, text, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error(`配置嵌套超过 ${MAX_DEPTH} 层，请拆分后转换。`);
  if (node?.tag && !/^tag:yaml\.org,2002:(?:map|seq|str|int|float|bool|null)$/.test(node.tag)) throw locatedError('此 YAML 标签没有可无损转换的对应类型，请先转为普通字符串、数组或对象。', text, node.range?.[0] || 0);
  if (isScalar(node)) checkNumberSource(node.source || '', node.value, text, node.range?.[0] || 0);
  if (isMap(node)) for (const pair of node.items) {
    checkYAMLNumbers(pair.key, text, depth + 1);
    checkYAMLNumbers(pair.value, text, depth + 1);
  }
  if (isSeq(node)) for (const item of node.items) checkYAMLNumbers(item, text, depth + 1);
}

function checkTOMLNumbers(text) {
  // Mask strings and comments so numeric text inside either is never interpreted.
  const masked = text.replace(/"""(?:\\[\s\S]|(?!""")[\s\S])*"{3,5}|'''[\s\S]*?'{3,5}|"(?:\\[\s\S]|[^"\\])*"|'[^']*'|#[^\n]*/g, match => match.replace(/[^\n]/g, ' '));
  const tokens = masked.matchAll(/[^\s,\[\]{}=#]+|[\n,\[\]{}=]/g);
  const contexts = [{ kind: 'table', value: false }];
  let header = false;
  for (const token of tokens) {
    const current = contexts.at(-1);
    const part = token[0];
    if (part === '\n') { if (contexts.length === 1) { current.value = false; header = false; } continue; }
    if (header) continue;
    if (part === '[' && contexts.length === 1 && !current.value) { header = true; continue; }
    if (part === '=') { current.value = true; continue; }
    if (part === '{' || part === '[') { contexts.push({ kind: part === '[' ? 'array' : 'table', value: part === '[' }); continue; }
    if (part === '}' || part === ']') { contexts.pop(); continue; }
    if (part === ',') { if (current.kind === 'table') current.value = false; continue; }
    if (current.value && /^[+-]?(?:\d[\d_]*\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?|\d[\d_]*[eE][+-]?\d[\d_]*)$/.test(part)) {
      checkNumberSource(part, Number(part.replaceAll('_', '')), text, token.index);
    }
  }
}

function parseSource(text, format) {
  if (format === 'toml') {
    try {
      const value = parseTOML(text, { integersAsBigInt: true });
      checkTOMLNumbers(text);
      return value;
    } catch (error) {
      if (error.line !== undefined) throw new Error(`第 ${error.line} 行，第 ${error.column ?? 1} 列：${error.message.split('\n')[0]}`);
      throw error;
    }
  }
  if (format === 'json') {
    try { JSON.parse(text); }
    catch (error) {
      const offset = error.message.match(/position\s+(\d+)/i);
      if (offset) throw locatedError(`JSON 语法错误：${error.message}`, text, Number(offset[1]));
      const lineColumn = error.message.match(/line (\d+) column (\d+)/i);
      if (lineColumn) throw new Error(`第 ${lineColumn[1]} 行，第 ${lineColumn[2]} 列：JSON 语法错误：${error.message}`);
      const hint = parseDocument(text, { schema: 'json', prettyErrors: false }).errors[0];
      throw locatedError(`JSON 语法错误：${error.message}`, text, hint?.pos?.[0] ?? 0);
    }
  }
  const document = parseDocument(text, { version: '1.2', schema: 'core', intAsBigInt: true, uniqueKeys: true, prettyErrors: false });
  const error = document.errors[0] || document.warnings[0];
  if (error) throw locatedError(`${format.toUpperCase()} 解析错误：${error.message}`, text, error.pos?.[0] || 0);
  if (document.directives.yaml.version !== '1.2') throw new Error('仅支持 YAML 1.2，请移除旧版本指令并检查布尔值与数值。');
  checkYAMLNumbers(document.contents, text);
  try { return document.toJS({ mapAsMap: true, maxAliasCount: 20 }); }
  catch (error) {
    if (/alias|anchor/i.test(error.message)) throw new Error('YAML 别名展开超出限制或引用无效，请减少别名并重试。');
    throw error;
  }
}

function safeValues(value, target) {
  const active = new WeakSet();
  let count = 0;
  function visit(item, path, depth) {
    if (++count > MAX_NODES) throw new Error(`配置展开后超过 ${MAX_NODES.toLocaleString()} 个值，请拆分后转换。`);
    if (depth > MAX_DEPTH) throw new Error(`配置嵌套超过 ${MAX_DEPTH} 层，请拆分后转换。`);
    if (item === null) {
      if (target === 'toml') throw new Error(`${path} 是 null；TOML 不支持 null，请删除该字段或明确填写其他值。`);
      return null;
    }
    if (typeof item === 'bigint') {
      if (item > BigInt(Number.MAX_SAFE_INTEGER) || item < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error(`${path} 超出安全整数范围，跨格式转换可能丢失精度；请改为带引号的字符串。`);
      return target === 'json' ? Number(item) : item;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error(`${path} 包含 NaN 或 Infinity，无法安全转换。`);
      if (Number.isInteger(item) && !Number.isSafeInteger(item)) throw new Error(`${path} 超出安全整数范围，请改为带引号的字符串。`);
      if (Object.is(item, -0)) throw new Error(`${path} 是负零；请改为 0 或带引号的字符串，避免转换后丢失符号。`);
      return item;
    }
    if (typeof item === 'string' || typeof item === 'boolean') return item;
    if (item instanceof Date) throw new Error(`${path} 是 TOML 日期或时间类型；JSON / YAML 1.2 无法保留该类型。请先将原日期加上引号，明确作为字符串转换。`);
    if (!item || typeof item !== 'object') throw new Error(`${path} 包含不支持的数据类型。`);
    if (active.has(item)) throw new Error(`${path} 包含循环引用，请移除 YAML 循环别名。`);
    active.add(item);
    let result;
    if (Array.isArray(item)) result = item.map((child, index) => visit(child, `${path}[${index}]`, depth + 1));
    else {
      if (!(item instanceof Map) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error(`${path} 包含不能无损转换的特殊类型。`);
      result = Object.create(null);
      for (const [key, child] of item instanceof Map ? item : Object.entries(item)) {
        if (typeof key !== 'string') throw new Error(`${path} 含有非字符串键，JSON / TOML 无法无损表示；请给键加上引号。`);
        Object.defineProperty(result, key, { value: visit(child, `${path}[${JSON.stringify(key)}]`, depth + 1), enumerable: true, configurable: true, writable: true });
      }
    }
    active.delete(item);
    return result;
  }
  const result = visit(value, '$', 0);
  if (target === 'toml' && (result === null || Array.isArray(result) || typeof result !== 'object')) throw new Error('TOML 的根节点必须是对象（表），不能是数组、null 或单个值。');
  return result;
}

export function convertConfig(text, source = 'json', target = 'yaml') {
  if (!CONFIG_FORMATS.includes(source) || !CONFIG_FORMATS.includes(target)) throw new Error('请选择 JSON、YAML 或 TOML 格式。');
  if (typeof text !== 'string' || !text.trim()) throw new Error('请先输入需要转换的配置。');
  if (text.length > MAX_CONFIG_LENGTH) throw new Error(`输入超过 ${MAX_CONFIG_LENGTH.toLocaleString()} 个字符，请拆分后转换。`);
  try {
    const value = safeValues(parseSource(text.replace(/^\uFEFF/, ''), source), target);
    let output;
    if (target === 'json') output = `${JSON.stringify(value, null, 2)}\n`;
    if (target === 'yaml') output = stringifyYAML(value, { lineWidth: 0, aliasDuplicateObjects: false, minFractionDigits: 1 });
    if (target === 'toml') {
      output = stringifyTOML(value, { numbersAsFloat: true });
      if (!output.trim()) output = '# 空配置：空表\n';
    }
    if (output.length > MAX_CONFIG_LENGTH * 4) throw new Error('转换后的内容过大，请拆分配置后重试。');
    return { output, source, target };
  } catch (error) {
    if (error instanceof RangeError) throw new Error('配置过深或数值超出范围，请简化后重试。');
    throw error;
  }
}
