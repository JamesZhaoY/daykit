import { CronExpressionParser } from 'cron-parser';
import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const NAMES = ['分钟', '小时', '日期', '月份', '星期'];
const FIELD_SYNTAX = /^(?:\*|\d{1,2}(?:-\d{1,2})?)(?:\/\d{1,2})?(?:,(?:\*|\d{1,2}(?:-\d{1,2})?)(?:\/\d{1,2})?)*$/;

function checkedZone(zone) {
  try { return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone; }
  catch { throw new Error(`时区无效：${zone}。请使用 UTC、Asia/Shanghai 等 IANA 时区。`); }
}

// Cloudflare uses 1 = Sunday; expand before shifting so steps and ranges keep their meaning.
function cloudflareWeekday(field) {
  if (field === '*') return '*';
  const values = new Set();
  for (const item of field.split(',')) {
    const [range, stepText] = item.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    const [start, end] = range === '*' ? [1, 7] : range.includes('-') ? range.split('-').map(Number) : [Number(range), stepText === undefined ? Number(range) : 7];
    if (start < 1 || end > 7 || start > end || step < 1 || step > 7) throw new Error('Cloudflare 星期范围为 1–7（1 = 周日，7 = 周六），步长为 1–7。');
    for (let value = start; value <= end; value += step) values.add(value - 1);
  }
  return [...values].sort((a, b) => a - b).join(',');
}

export function normalizeCron(expression, mode = 'unix') {
  if (!['unix', 'cloudflare'].includes(mode)) throw new Error('请选择 Unix 或 Cloudflare 基础模式。');
  expression = String(expression ?? '').trim().toUpperCase();
  if (!expression) throw new Error('请输入 Cron 表达式。');
  if (expression.length > 256) throw new Error('表达式过长，请控制在 256 个字符以内。');
  const rawFields = expression.split(/\s+/);
  if (rawFields.length !== 5) throw new Error('需要 5 个字段：分钟、小时、日期、月份、星期；不包含秒或年份。');
  const fields = rawFields.map((field, index) => field.replace(/[A-Z]+/g, name => {
    const names = index === 3 ? MONTHS : index === 4 ? WEEKDAYS : [];
    const found = names.indexOf(name);
    if (found < 0) throw new Error('当前只支持五字段基础语法 * , - / 及月份、星期缩写；不支持 L、W、#、?、H 等扩展。');
    return String(found + (index === 3 || mode === 'cloudflare' ? 1 : 0));
  }));
  fields.forEach((field, index) => {
    if (!FIELD_SYNTAX.test(field)) throw new Error(`${NAMES[index]}字段语法无效；只支持数字、*、逗号、范围和步长（如 1-5 或 */15）。`);
  });
  if (mode === 'cloudflare') {
    if (fields[2] !== '*' && fields[4] !== '*') throw new Error('Cloudflare 基础模式暂不支持同时限制日期和星期，请将其中一个字段设为 *。');
    fields[4] = cloudflareWeekday(fields[4]);
  }
  return { expression: rawFields.join(' '), normalized: fields.join(' '), rawFields };
}

export function formatCronDate(value, zone) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    weekday: 'short', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.weekday} (${p.timeZoneName})`;
}

export function evaluateCron(expression, { mode = 'unix', timeZone = 'UTC', displayTimeZone = 'Asia/Shanghai', from = new Date().toISOString(), count = 10, horizonYears = 50 } = {}) {
  const { normalized, rawFields, expression: canonical } = normalizeCron(expression, mode);
  if (mode === 'cloudflare' && timeZone !== 'UTC') throw new Error('Cloudflare Cron 固定按 UTC 执行；可通过「结果显示时区」查看北京时间。');
  timeZone = checkedZone(timeZone);
  displayTimeZone = checkedZone(displayTimeZone);
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(from)) throw new Error('开始时间需要包含时区，例如 2026-09-27T00:00:00Z。');
  const start = new Date(from);
  const day = Number(from.slice(8, 10));
  const month = Number(from.slice(5, 7));
  const year = Number(from.slice(0, 4));
  if (!Number.isFinite(start.getTime()) || year < 1900 || year > 9900 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(from.slice(11, 13)) > 23 || Number(from.slice(14, 16)) > 59 || (from[16] === ':' && Number(from.slice(17, 19)) > 59)) throw new Error('开始时间无效，请输入 1900–9900 年内的真实日期和时间。');
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error('预览次数需要为 1–10。');
  if (!Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 50) throw new Error('搜索范围需要为 1–50 年。');
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + horizonYears);
  let interval;
  try { interval = CronExpressionParser.parse(normalized, { currentDate: start, endDate: end, tz: timeZone }); }
  catch (error) {
    if (/Invalid explicit day of month/.test(error.message)) throw new Error('没有可执行日期：所选月份中不存在这个日期（例如 2 月 31 日）。');
    throw new Error(`Cron 表达式无效：${error.message}`);
  }
  const dates = [];
  let limited = false;
  while (dates.length < count) {
    try { dates.push(interval.next().toISOString()); }
    catch (error) {
      if (/Out of the time span range|loop limit exceeded/.test(error.message)) { limited = true; break; }
      throw error;
    }
  }
  const description = cronstrue.toString(normalized, { locale: 'zh_CN', use24HourTimeFormat: true, verbose: true });
  const ranges = ['0–59', '0–23', '1–31', '1–12 / JAN–DEC', mode === 'cloudflare' ? '1–7 / SUN–SAT' : '0–7 / SUN–SAT'];
  return {
    expression: canonical, normalized, mode, timeZone, displayTimeZone, from: start.toISOString(),
    description, dayOr: rawFields[2] !== '*' && rawFields[4] !== '*', limited,
    notice: limited ? `已搜索未来 ${horizonYears} 年或达到计算步数上限，共找到 ${dates.length} 次；这不表示此后永不执行。` : '',
    fields: rawFields.map((value, index) => ({ name: NAMES[index], value, range: ranges[index] })),
    runs: dates.map(iso => ({ iso, scheduled: formatCronDate(iso, timeZone), display: formatCronDate(iso, displayTimeZone) })),
  };
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = event => {
    try { globalThis.postMessage({ result: evaluateCron(event.data.expression, event.data.options) }); }
    catch (error) { globalThis.postMessage({ error: error.message || 'Cron 计算失败。' }); }
  };
}
