// All lookups go to fixed HTTPS data providers. User input is never fetched as a URL.
const DNS_TYPES = { A: 1, AAAA: 28, CNAME: 5, MX: 15, NS: 2 };
const RESOLVERS = [
  { name: 'Cloudflare DNS', url: 'https://cloudflare-dns.com/dns-query', docs: 'https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/' },
  { name: 'Google DNS', url: 'https://dns.google/resolve', docs: 'https://developers.google.com/speed/public-dns/docs/doh/json' },
];
const CDN_SUFFIXES = [
  { suffix: 'cloudfront.net', provider: 'Amazon CloudFront', url: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LinkFormat.html' },
  { suffix: 'fastly.net', provider: 'Fastly', url: 'https://www.fastly.com/documentation/guides/concepts/routing-traffic-to-fastly/' },
  { suffix: 'azurefd.net', provider: 'Azure Front Door', url: 'https://learn.microsoft.com/en-us/azure/frontdoor/endpoint' },
  { suffix: 'w.kunlunsl.com', provider: '阿里云 CDN', url: 'https://help.aliyun.com/zh/cdn/add-a-cname-record-for-a-domain-name' },
  { suffix: 'w.alikunlun.com', provider: '阿里云 CDN', url: 'https://help.aliyun.com/en/cdn/support/cname-faq' },
  { suffix: 'cdn.dnsv1.com', provider: '腾讯云 CDN', url: 'https://cloud.tencent.com/document/product/228/43827' },
  { suffix: 'cdn.dnsv1.com.cn', provider: '腾讯云 CDN', url: 'https://cloud.tencent.com/document/product/228/43827' },
  { suffix: 'dsa.dnsv1.com.cn', provider: '腾讯云 CDN', url: 'https://cloud.tencent.com/document/product/228/43827' },
];
const CF_IPS = 'https://api.cloudflare.com/client/v4/ips';
const CF_DOCS = 'https://www.cloudflare.com/ips/';
const PRIVATE_V4 = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3'];
const PRIVATE_V6 = ['2001::/32', '2001:2::/48', '2001:10::/28', '2001:db8::/32', '2002::/16', '3fff::/20'];

export class NetworkError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.status = status;
  }
}

export function parseIP(value) {
  if (typeof value !== 'string' || value.length > 64) return null;
  let ip = value.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const bytes = ip.split('.');
    if (bytes.some(byte => Number(byte) > 255 || (byte.length > 1 && byte[0] === '0'))) return null;
    return { ip, version: 4, value: bytes.reduce((n, byte) => (n << 8n) + BigInt(byte), 0n) };
  }
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (!ip.includes(':') || !/^[\da-f:.]+$/i.test(ip)) return null;
  try {
    ip = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const halves = ip.split('::').map(half => half ? half.split(':') : []);
    const parts = halves.length === 2 ? [...halves[0], ...Array(8 - halves[0].length - halves[1].length).fill('0'), ...halves[1]] : halves[0];
    if (parts.length !== 8) return null;
    return { ip, version: 6, value: parts.reduce((n, word) => (n << 16n) + BigInt(`0x${word}`), 0n) };
  } catch { return null; }
}

export function inCIDR(address, cidr) {
  const ip = typeof address === 'string' ? parseIP(address) : address;
  if (typeof cidr !== 'string') return false;
  const [base, length] = cidr.split('/');
  const network = parseIP(base);
  const bits = ip?.version === 4 ? 32 : 128;
  if (!ip || !network || ip.version !== network.version || !/^\d+$/.test(length || '') || Number(length) > bits) return false;
  const shift = BigInt(bits - Number(length));
  return ip.value >> shift === network.value >> shift;
}

export function isPublicIP(value) {
  const ip = typeof value === 'string' ? parseIP(value) : value;
  if (!ip) return false;
  return ip.version === 4
    ? !PRIVATE_V4.some(range => inCIDR(ip, range))
    : inCIDR(ip, '2000::/3') && !PRIVATE_V6.some(range => inCIDR(ip, range));
}

export function normalizeDomain(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value.trim())) throw new NetworkError('INPUT_DOMAIN', '请输入完整的公网域名，例如 example.com。');
  let domain;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    domain = url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { throw new NetworkError('INPUT_DOMAIN', '域名或网址格式不正确。'); }
  if (domain.length > 253 || parseIP(domain) || !domain.includes('.') || !domain.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)) || /^\d+$/.test(domain.split('.').at(-1))) throw new NetworkError('INPUT_DOMAIN', '请输入有效的域名；IP 地址请使用 IP 检测工具。');
  if (/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(domain) || /(^|\.)(home|in-addr|ip6)\.arpa$/.test(domain)) throw new NetworkError('PRIVATE_DOMAIN', '仅支持公网域名，不查询本地或保留域名。');
  return domain;
}

async function getJSON(url, { fetch: fetcher = globalThis.fetch, signal, timeout = 7000, cacheTtl = 0, accept = 'application/json' } = {}) {
  const signals = [AbortSignal.timeout(timeout)];
  if (signal) signals.push(signal);
  let response;
  try {
    response = await fetcher(url, { headers: { Accept: accept }, redirect: 'manual', signal: AbortSignal.any(signals), cf: { cacheTtl, cacheEverything: cacheTtl > 0, ...(cacheTtl > 0 ? { cacheTtlByStatus: { '200-299': cacheTtl, '300-399': -1, '400-599': -1 } } : {}) } });
    if (!response.ok) {
      await response.body?.cancel();
      throw new NetworkError(response.status === 429 ? 'UPSTREAM_LIMIT' : 'UPSTREAM_UNAVAILABLE', response.status === 429 ? '数据服务暂时限流，请稍后重试。' : '数据服务暂时不可用，请稍后重试。', response.status === 429 ? 429 : 502);
    }
    if (!response.body) throw new Error('Empty response');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 65536) { await reader.cancel(); throw new Error('Oversized response'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof NetworkError) throw error;
    if (signal?.aborted || error.name === 'TimeoutError' || error.name === 'AbortError') throw new NetworkError('UPSTREAM_TIMEOUT', '查询超时，请稍后重试。', 504);
    throw new NetworkError('UPSTREAM_RESPONSE', '数据服务未返回有效响应，请稍后重试。', 502);
  }
}

const clean = value => typeof value === 'string' ? value.slice(0, 256) : '';
const numeric = value => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const countries = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
function countryName(code) {
  try { return /^[A-Z]{2}$/.test(code) ? countries.of(code) : ''; } catch { return ''; }
}

async function lookupRouting(parsed, options) {
  // RIPEstat supplies routing origins and ASN holders, not physical geolocation.
  // https://stat.ripe.net/docs/data-api/api-endpoints/prefix-overview
  const url = new URL('https://stat.ripe.net/data/prefix-overview/data.json');
  url.search = new URLSearchParams({ resource: `${parsed.ip}/${parsed.version === 4 ? 32 : 128}`, max_related: '0' }).toString();
  const response = await getJSON(url, { ...options, cacheTtl: 3600 });
  const data = response.data;
  if (response.status !== 'ok' || data?.type !== 'prefix' || data.announced !== true || !inCIDR(parsed, data.resource) || !Array.isArray(data.asns)) throw new NetworkError('ASN_UNAVAILABLE', '暂未查询到该 IP 的公开路由公告。', 502);
  const origins = data.asns.slice(0, 20).filter(origin => Number.isInteger(Number(origin?.asn)) && Number(origin.asn) > 0 && Number(origin.asn) <= 4294967295).map(origin => ({ asn: Number(origin.asn), organization: clean(origin.holder) })).sort((a, b) => a.asn - b.asn);
  if (!origins.length) throw new NetworkError('ASN_UNAVAILABLE', '暂未查询到该 IP 的公开路由公告。', 502);
  return { network: { ...origins[0], isp: '' }, note: origins.length > 1 ? `该网段存在多个公告 ASN（${origins.map(origin => `AS${origin.asn}`).join('、')}），当前展示其中第一个。` : '' };
}

export async function lookupIP(input = {}, { request, ...options } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || (input.ip !== undefined && typeof input.ip !== 'string')) throw new NetworkError('INPUT_IP', '请输入有效的 IPv4 或 IPv6 地址。');
  const isCurrent = !input.ip?.trim();
  let parsed = parseIP(isCurrent ? request?.headers?.get('cf-connecting-ip') : input.ip);
  // Pseudo IPv4 "Overwrite Headers" retains the real visitor address in this header.
  if (isCurrent && !isPublicIP(parsed)) {
    const ipv6 = parseIP(request?.headers?.get('cf-connecting-ipv6'));
    if (ipv6?.version === 6 && isPublicIP(ipv6)) parsed = ipv6;
  }
  let source = '';
  let warning = '';
  if (isCurrent && !isPublicIP(parsed)) {
    const detected = await getJSON('https://api64.ipify.org?format=json', options);
    parsed = parseIP(detected.ip);
    if (!isPublicIP(parsed)) throw new NetworkError('IP_UNAVAILABLE', '未能获取公网 IP，请手动输入地址。', 502);
    source = 'ipify';
    warning = '当前为本地服务或未收到公网连接信息，显示的是服务出口 IP；远程浏览器和代理出口可能不同。';
  }
  if (!parsed) throw new NetworkError('INPUT_IP', '请输入有效的 IPv4 或 IPv6 地址，不要包含端口或网段。');
  if (!isPublicIP(parsed)) throw new NetworkError('PRIVATE_IP', '仅支持公网 IP；不查询内网、回环、组播或保留地址。');
  const result = { ip: parsed.ip, version: parsed.version, isCurrent, location: { country: '', countryCode: '', region: '', city: '', latitude: null, longitude: null, timezone: '' }, network: { asn: null, organization: '', isp: '' }, source, warning, checkedAt: new Date().toISOString() };
  const cf = request?.cf;
  if (isCurrent && !source && cf && (cf.country || cf.asn)) {
    result.source = 'Cloudflare';
    result.location = { country: countryName(cf.country), countryCode: clean(cf.country), region: clean(cf.region), city: clean(cf.city), latitude: numeric(cf.latitude), longitude: numeric(cf.longitude), timezone: clean(cf.timezone) };
    result.network = { asn: numeric(cf.asn), organization: clean(cf.asOrganization), isp: clean(cf.asOrganization) };
    return result;
  }
  try {
    const data = await getJSON(`https://ipwho.is/${encodeURIComponent(parsed.ip)}`, { ...options, cacheTtl: 3600 });
    if (data.success !== true || parseIP(data.ip)?.ip !== parsed.ip) throw new NetworkError('GEO_UNAVAILABLE', '该 IP 的归属地数据暂不可用。', 502);
    result.location = { country: countryName(data.country_code) || clean(data.country), countryCode: clean(data.country_code), region: clean(data.region), city: clean(data.city), latitude: numeric(data.latitude), longitude: numeric(data.longitude), timezone: clean(data.timezone?.id) };
    result.network = { asn: numeric(data.connection?.asn), organization: clean(data.connection?.org), isp: clean(data.connection?.isp) };
    result.source = result.source ? `${result.source} / IPWHOIS` : 'IPWHOIS';
  } catch (error) {
    if (options.signal?.aborted) throw error;
    try {
      const routing = await lookupRouting(parsed, options);
      result.network = routing.network;
      result.source = result.source ? `${result.source} / RIPEstat` : 'RIPEstat';
      result.warning = [result.warning, `${error.code === 'UPSTREAM_LIMIT' ? '归属地服务暂时限流' : '归属地服务暂不可用'}；已使用 RIPEstat 显示路由 ASN 和登记持有人，无法据此确定实际地理位置或接入运营商。`, routing.note].filter(Boolean).join(' ');
    } catch (fallbackError) {
      if (options.signal?.aborted) throw fallbackError;
      result.source ||= isCurrent ? 'Cloudflare' : '输入地址';
      result.warning = [result.warning, `${error.message} 备用路由信息也暂不可用；IP 地址仍可查看和复制。`].filter(Boolean).join(' ');
    }
  }
  return result;
}

async function resolveDNS(domain, type, options) {
  let failure;
  for (const resolver of RESOLVERS) {
    if (options.signal?.aborted) throw new NetworkError('UPSTREAM_TIMEOUT', '查询已超时或取消。', 504);
    try {
      const url = new URL(resolver.url);
      url.search = new URLSearchParams({ name: domain, type }).toString();
      const data = await getJSON(url, { ...options, accept: 'application/dns-json' });
      if (![0, 3].includes(data.Status) || data.TC === true || (data.Answer !== undefined && !Array.isArray(data.Answer))) throw new NetworkError('DNS_RESPONSE', `${type} 记录解析失败。`, 502);
      return { data, resolver };
    } catch (error) { failure = error; }
  }
  throw failure;
}

export async function lookupDomain(input = {}, options = {}) {
  const domain = normalizeDomain(input?.domain);
  const types = Object.keys(DNS_TYPES);
  const results = await Promise.allSettled(types.map(type => resolveDNS(domain, type, options)));
  const successful = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  if (!successful.length) throw new NetworkError(options.signal?.aborted ? 'UPSTREAM_TIMEOUT' : 'DNS_UNAVAILABLE', 'DNS 服务暂时不可用，请稍后重试。', options.signal?.aborted ? 504 : 502);
  if (successful.every(result => result.data.Status === 3)) throw new NetworkError('DOMAIN_NOT_FOUND', '该域名不存在或尚未配置公开 DNS 记录。', 404);
  const records = Object.fromEntries(types.map(type => [type, []]));
  const seen = new Set();
  const warnings = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') { warnings.push(`${types[index]} 记录查询失败，其他结果仍可查看。`); continue; }
    for (const answer of (result.value.data.Answer || []).slice(0, 100)) {
      const type = types.find(type => DNS_TYPES[type] === answer.type);
      if (!type || typeof answer.data !== 'string' || typeof answer.name !== 'string') continue;
      const record = { name: answer.name.toLowerCase().replace(/\.$/, '').slice(0, 253), type, ttl: Math.max(0, Math.min(2147483647, Number(answer.TTL) || 0)), value: answer.data.slice(0, 2048) };
      if (type === 'A' || type === 'AAAA') {
        const parsed = parseIP(record.value);
        if (!parsed || parsed.version !== (type === 'A' ? 4 : 6)) continue;
        record.value = parsed.ip;
      }
      const key = `${record.name}|${type}|${record.value}`;
      if (!seen.has(key)) { seen.add(key); records[type].push(record); }
    }
  }
  const addresses = [...new Set([...records.A, ...records.AAAA].map(record => record.value))].map(ip => ({ ip, version: parseIP(ip).version, public: isPublicIP(ip), cdn: null }));
  if (addresses.some(address => !address.public)) warnings.push('部分公开 DNS 记录指向内网或保留地址，已按原值展示；不会连接这些地址。');
  const sources = [...new Map(successful.map(result => [result.resolver.name, { name: result.resolver.name, url: result.resolver.docs }])).values()];
  const providers = new Set();
  const evidence = [];
  if (addresses.some(address => address.public)) {
    try {
      const data = await getJSON(CF_IPS, { ...options, timeout: 4000, cacheTtl: 86400 });
      if (data.success !== true || !Array.isArray(data.result?.ipv4_cidrs) || !Array.isArray(data.result?.ipv6_cidrs)) throw new Error('Invalid range list');
      const ranges = [...data.result.ipv4_cidrs, ...data.result.ipv6_cidrs].slice(0, 200);
      for (const address of addresses) {
        const range = ranges.find(range => inCIDR(address.ip, range));
        if (range) {
          address.cdn = { provider: 'Cloudflare', evidence: `匹配官方 IP 网段 ${range}` };
          providers.add('Cloudflare');
        }
      }
      sources.push({ name: 'Cloudflare 官方 IP 网段', url: CF_DOCS });
    } catch {
      warnings.push('Cloudflare 网段数据暂不可用，本次无法完成 IP 网段识别。');
    }
  }
  for (const record of records.CNAME) {
    const target = record.value.toLowerCase().replace(/\.$/, '');
    for (const cdn of CDN_SUFFIXES) {
      if (target === cdn.suffix || target.endsWith(`.${cdn.suffix}`)) {
        providers.add(cdn.provider);
        evidence.push(`${record.name} → ${target}（${cdn.provider}）`);
        if (!sources.some(source => source.url === cdn.url)) sources.push({ name: cdn.provider, url: cdn.url });
      }
    }
  }
  const detected = providers.size > 0;
  return {
    domain, records, addresses,
    cdn: { detected, providers: [...providers], evidence, conclusion: detected ? '检测到 CDN / 边缘网络线索。列出的地址是公开 DNS 解析地址，不能据此确定源站真实 IP。' : '未匹配到已知 CDN 线索；这不代表未使用代理，也不能证明这些地址就是源站 IP。' },
    resolver: [...new Set(successful.map(result => result.resolver.name))].join(' / '), warnings, sources, checkedAt: new Date().toISOString(),
  };
}
