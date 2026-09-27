export const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export function checkInput(text) {
  if (!text.length) throw new Error('先输入一些内容，再开始处理。');
  if (new TextEncoder().encode(text).length > MAX_INPUT_BYTES) {
    throw new Error('内容超过 2 MB，请分段处理。');
  }
}

export function formatJSON(text, indent = 2) {
  checkInput(text);
  const value = JSON.parse(text, (_key, value) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
      throw new Error('数字超出 JavaScript 安全精度。请将长 ID 或高精度数字改为字符串，避免转换时丢失精度。');
    }
    return value;
  });
  return JSON.stringify(value, null, indent);
}

export function encodeText(text, kind, decode = false) {
  checkInput(text);
  if (kind === 'url') {
    try { return decode ? decodeURIComponent(text) : encodeURIComponent(text); }
    catch { throw new Error('URL 编码无效，请检查 % 后的十六进制字符及 UTF-8 编码。'); }
  }
  if (decode) {
    try {
      const clean = text.replace(/\s/g, '');
      if (!clean) throw new Error();
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(clean), char => char.charCodeAt(0)));
    } catch { throw new Error('无法解码：请输入有效的 Base64 文本，解码后的内容须为 UTF-8。'); }
  }
  const bytes = new TextEncoder().encode(text);
  // Keep each call small so large pasted text does not exceed the argument limit.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function parseTimestamp(text, unit = 'auto') {
  const clean = text.trim();
  if (!/^-?\d+$/.test(clean)) throw new Error('请输入整数时间戳，例如 1750000000。');
  const number = Number(clean);
  const resolvedUnit = unit === 'auto' ? (Math.abs(number) >= 1e10 ? 'ms' : 's') : unit;
  const milliseconds = number * (resolvedUnit === 's' ? 1000 : 1);
  const date = new Date(milliseconds);
  if (!Number.isSafeInteger(milliseconds) || Number.isNaN(date.getTime())) throw new Error('时间戳超出可表示的日期范围。');
  return { date, unit: resolvedUnit };
}

export function datetimeValue(date, utc = false) {
  const get = part => date[`${utc ? 'getUTC' : 'get'}${part}`]();
  const pad = value => String(value).padStart(2, '0');
  return `${String(get('FullYear')).padStart(4, '0')}-${pad(get('Month') + 1)}-${pad(get('Date'))}T${pad(get('Hours'))}:${pad(get('Minutes'))}:${pad(get('Seconds'))}`;
}

export function parseDatetime(text, utc = false) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(text)) throw new Error('请选择完整的日期和时间。');
  const normalized = text.length === 16 ? `${text}:00` : text;
  const date = new Date(normalized + (utc ? 'Z' : ''));
  if (Number.isNaN(date.getTime()) || datetimeValue(date, utc) !== normalized) {
    throw new Error('日期不存在，或处于本地夏令时跳过的时段，请检查输入。');
  }
  return date;
}
