import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIP, inCIDR, isPublicIP, normalizeDomain, lookupIP, lookupDomain } from '../worker/network.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const noFetch = async () => { throw new Error('Unexpected upstream request'); };
const rangeData = { success: true, result: { ipv4_cidrs: ['104.16.0.0/13'], ipv6_cidrs: ['2606:4700::/32'] } };

test('strict public IPv4/IPv6 validation blocks ambiguous, mapped and private addresses', async () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicIP(ip), true, ip);
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.20.0.1', '192.168.0.1', '100.64.0.1', '169.254.169.254', '198.18.0.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', '::ffff:c0a8:101', '64:ff9b::a00:1', 'fc00::1', 'fe80::1', '2001:db8::1', '3fff::1']) {
    assert.equal(isPublicIP(ip), false, ip);
    await assert.rejects(lookupIP({ ip }, { fetch: noFetch }), error => error.code === 'PRIVATE_IP');
  }
  for (const ip of ['2130706433', '127.1', '0x7f000001', '01.1.1.1', '1.1.1.256', '8.8.8.8:443', '8.8.8.8/24', 'fe80::1%eth0', 'https://1.1.1.1/', ':::', '[::1]:80']) assert.equal(parseIP(ip), null, ip);
  assert.equal(parseIP('[2606:4700:4700::1111]').ip, '2606:4700:4700::1111');
  assert.equal(parseIP('::ffff:192.168.1.1').ip, '::ffff:c0a8:101');
  assert.equal(inCIDR('104.23.255.255', '104.16.0.0/13'), true);
  assert.equal(inCIDR('104.24.0.0', '104.16.0.0/13'), false);
  assert.equal(inCIDR('2606:4700::1', '2606:4700::/32'), true);
  assert.equal(inCIDR('2606:4701::1', '2606:4700::/32'), false);
});

test('domain normalization accepts IDNs and URLs but blocks credentials, IP encodings and local names', () => {
  assert.equal(normalizeDomain(' https://Example.COM:443/path?q=test#part '), 'example.com');
  assert.equal(normalizeDomain('例子.中国'), 'xn--fsqu00a.xn--fiqs8s');
  assert.equal(normalizeDomain('example.com.'), 'example.com');
  for (const domain of ['localhost', 'x.localhost', 'x.local', 'x.internal', 'x.home.arpa', 'x.onion', 'x.test', 'https://user:pass@example.com', 'http://127.1', 'http://0x7f000001', 'http://2130706433', '[::ffff:127.0.0.1]', 'example.com\\@localhost', 'ftp://example.com', 'foo..com', '-foo.com', 'foo.123', 'example.com\n@localhost']) assert.throws(() => normalizeDomain(domain), { name: 'NetworkError' }, domain);
});

test('current visitor uses Cloudflare metadata without disclosing their IP to a third-party service', async () => {
  const request = new Request('https://daykit.example/api/network/ip', { headers: { 'CF-Connecting-IP': '8.8.8.8' } });
  request.cf = { country: 'US', region: 'California', city: 'Mountain View', latitude: '37.4', longitude: '-122.1', timezone: 'America/Los_Angeles', asn: 15169, asOrganization: 'Google LLC' };
  const result = await lookupIP({}, { request, fetch: noFetch });
  assert.equal(result.ip, '8.8.8.8');
  assert.equal(result.isCurrent, true);
  assert.equal(result.network.asn, 15169);
  assert.equal(result.location.latitude, 37.4);
  assert.equal(result.source, 'Cloudflare');
});

test('local current-IP fallback identifies service egress; missing geolocation preserves the detected IP', async () => {
  const calls = [];
  const result = await lookupIP({}, { request: new Request('http://localhost/api/network/ip'), fetch: async (url, init) => {
    calls.push(String(url));
    assert.equal(init.redirect, 'manual');
    return new URL(url).hostname === 'api64.ipify.org' ? json({ ip: '8.8.8.8' }) : json({ success: false }, 429);
  } });
  assert.equal(result.ip, '8.8.8.8');
  assert.match(result.warning, /服务出口 IP/);
  assert.match(result.warning, /限流/);
  assert.equal(result.location.latitude, null);
  assert.equal(calls.length, 3);
  await assert.rejects(lookupIP({ ip: {} }, { fetch: noFetch }), error => error.code === 'INPUT_IP');
});

test('Cloudflare Pseudo IPv4 preserves the real public visitor IPv6 without service-egress fallback', async () => {
  const request = new Request('https://daykit.example/api/network/ip', { headers: { 'CF-Connecting-IP': '240.1.2.3', 'CF-Connecting-IPv6': '2606:4700:4700::1111' } });
  request.cf = { country: 'US', asn: 13335, asOrganization: 'Cloudflare' };
  const result = await lookupIP({}, { request, fetch: noFetch });
  assert.equal(result.ip, '2606:4700:4700::1111');
  assert.equal(result.version, 6);
  assert.equal(result.isCurrent, true);
  assert.equal(result.source, 'Cloudflare');
  assert.equal(result.warning, '');
});

test('specified IPv6 geolocation uses only the fixed provider and rejects mismatched returned addresses', async () => {
  const ip = '2606:4700:4700::1111';
  const result = await lookupIP({ ip }, { fetch: async (url, init) => {
    assert.equal(new URL(url).origin, 'https://ipwho.is');
    assert.equal(decodeURIComponent(new URL(url).pathname), `/${ip}`);
    assert.ok(init.signal);
    return json({ ip, success: true, country_code: 'AU', connection: { asn: 13335, org: 'Cloudflare' }, timezone: { id: 'Australia/Sydney' } });
  } });
  assert.equal(result.version, 6);
  assert.equal(result.isCurrent, false);
  assert.equal(result.network.asn, 13335);
  const mismatch = await lookupIP({ ip: '8.8.8.8' }, { fetch: async () => json({ ip: '1.1.1.1', success: true, city: 'incorrect' }) });
  assert.equal(mismatch.location.city, '');
  assert.ok(mismatch.warning);
});

test('DNS fallback preserves partial results and reports Cloudflare edges without claiming origin IP', async () => {
  const calls = [];
  const result = await lookupDomain({ domain: 'https://example.com/a' }, { fetch: async (target, init) => {
    const url = new URL(target);
    calls.push(url);
    assert.equal(init.redirect, 'manual');
    if (url.hostname === 'api.cloudflare.com') return json(rangeData);
    assert.ok(['cloudflare-dns.com', 'dns.google'].includes(url.hostname));
    assert.equal(init.headers.Accept, 'application/dns-json');
    assert.equal(url.searchParams.get('name'), 'example.com');
    const type = url.searchParams.get('type');
    if (url.hostname === 'cloudflare-dns.com' || type === 'MX') return json({}, 503);
    const answers = { A: [{ name: 'example.com.', type: 1, TTL: 300, data: '104.16.1.1' }], AAAA: [{ name: 'example.com.', type: 28, TTL: 300, data: '2606:4700::1' }], CNAME: [], NS: [{ name: 'example.com.', type: 2, TTL: 3600, data: 'ns.example.com.' }] };
    return json({ Status: 0, Answer: answers[type] });
  } });
  assert.equal(result.resolver, 'Google DNS');
  assert.equal(result.addresses.length, 2);
  assert.ok(result.addresses.every(address => address.cdn?.provider === 'Cloudflare'));
  assert.equal(result.cdn.detected, true);
  assert.match(result.cdn.conclusion, /不能据此确定源站/);
  assert.match(result.warnings.join(' '), /MX/);
  assert.equal(calls.length, 11);
});

test('DNS ignores authority/additional addresses and CDN-hosted NS, and labels private answers without accessing them', async () => {
  const result = await lookupDomain({ domain: 'example.com' }, { fetch: async target => {
    const url = new URL(target);
    assert.notEqual(url.hostname, 'example.com');
    const type = url.searchParams.get('type');
    return json({ Status: 0, Answer: type === 'A' ? [{ name: 'example.com', type: 1, TTL: 30, data: '192.168.1.1' }] : type === 'NS' ? [{ name: 'example.com', type: 2, TTL: 30, data: 'test.ns.cloudflare.com.' }] : [], Additional: [{ name: 'ns.example.com', type: 1, TTL: 30, data: '104.16.1.1' }] });
  } });
  assert.deepEqual(result.addresses.map(address => address.ip), ['192.168.1.1']);
  assert.equal(result.addresses[0].public, false);
  assert.equal(result.cdn.detected, false);
  assert.match(result.warnings.join(' '), /内网或保留/);
});

test('CNAME CDN suffix matching enforces a label boundary; empty and NXDOMAIN responses differ', async () => {
  for (const [target, detected] of [['a.cloudfront.net.', true], ['notcloudfront.net.', false], ['cloudfront.net.attacker.com.', false]]) {
    const result = await lookupDomain({ domain: 'example.com' }, { fetch: async url => json({ Status: 0, Answer: new URL(url).searchParams.get('type') === 'CNAME' ? [{ name: 'example.com', type: 5, TTL: 300, data: target }] : [] }) });
    assert.equal(result.cdn.detected, detected, target);
  }
  const empty = await lookupDomain({ domain: 'example.com' }, { fetch: async () => json({ Status: 0 }) });
  assert.equal(empty.addresses.length, 0);
  await assert.rejects(lookupDomain({ domain: 'not-found.example.com' }, { fetch: async () => json({ Status: 3 }) }), error => error.code === 'DOMAIN_NOT_FOUND' && error.status === 404);
  await assert.rejects(lookupDomain({ domain: 'example.com' }, { fetch: async () => json({ Status: 2 }) }), error => error.code === 'DNS_UNAVAILABLE');
});

test('upstream redirects and oversized payloads are rejected instead of followed', async () => {
  const redirect = await lookupIP({ ip: '8.8.8.8' }, { fetch: async (url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1' } });
  } });
  assert.ok(redirect.warning);
  const oversized = await lookupIP({ ip: '8.8.8.8' }, { fetch: async () => json({ success: true, ip: '8.8.8.8', city: 'x'.repeat(70000) }) });
  assert.equal(oversized.location.city, '');
  assert.ok(oversized.warning);
});

test('Alibaba and Tencent CDN suffixes match exact DNS labels instead of DNS hosting or lookalikes', async () => {
  const cases = [
    ['site.w.kunlunsl.com.', '阿里云 CDN'],
    ['site.w.alikunlun.com.', '阿里云 CDN'],
    ['site.cdn.dnsv1.com.', '腾讯云 CDN'],
    ['site.cdn.dnsv1.com.cn.', '腾讯云 CDN'],
    ['site.dsa.dnsv1.com.cn.', '腾讯云 CDN'],
    ['ns.dnsv1.com.', null],
    ['site.notcdn.dnsv1.com.', null],
    ['site.cdn.dnsv1.com.attacker.com.', null],
    ['site.notw.kunlunsl.com.', null],
    ['site.w.alikunlun.com.attacker.com.', null],
  ];
  for (const [target, provider] of cases) {
    const result = await lookupDomain({ domain: 'example.com' }, { fetch: async url => json({ Status: 0, Answer: new URL(url).searchParams.get('type') === 'CNAME' ? [{ name: 'example.com', type: 5, TTL: 300, data: target }] : [] }) });
    assert.deepEqual(result.cdn.providers, provider ? [provider] : [], target);
    if (provider) assert.ok(result.sources.some(source => /help\.aliyun\.com|cloud\.tencent\.com/.test(new URL(source.url).hostname)), target);
  }
});

test('independent RIPEstat fallback preserves ASN and holder after geolocation throttling without inventing location', async () => {
  for (const [ip, prefix, asn, holder] of [['8.8.8.8', '8.8.8.0/24', 15169, 'GOOGLE - Google LLC'], ['2606:4700:4700::1111', '2606:4700:4700::/48', 13335, 'CLOUDFLARENET - Cloudflare, Inc.']]) {
    const calls = [];
    const result = await lookupIP({ ip }, { fetch: async (target, init) => {
      const url = new URL(target);
      calls.push(url.hostname);
      assert.equal(init.redirect, 'manual');
      assert.equal(init.cf.cacheTtl, 3600);
      assert.equal(init.cf.cacheTtlByStatus['200-299'], 3600);
      assert.equal(init.cf.cacheTtlByStatus['400-599'], -1);
      if (url.hostname === 'ipwho.is') return json({ success: false }, 429);
      assert.equal(url.origin, 'https://stat.ripe.net');
      assert.equal(url.pathname, '/data/prefix-overview/data.json');
      assert.equal(url.searchParams.get('resource'), `${ip}/${ip.includes(':') ? 128 : 32}`);
      assert.equal(url.searchParams.get('max_related'), '0');
      return json({ status: 'ok', data: { type: 'prefix', resource: prefix, announced: true, asns: [{ asn, holder }], block: { desc: 'Registered in United States' } } });
    } });
    assert.deepEqual(calls, ['ipwho.is', 'stat.ripe.net']);
    assert.equal(result.network.asn, asn);
    assert.equal(result.network.organization, holder);
    assert.equal(result.network.isp, '');
    assert.equal(result.location.country, '');
    assert.equal(result.location.city, '');
    assert.equal(result.location.latitude, null);
    assert.equal(result.source, 'RIPEstat');
    assert.match(result.warning, /限流/);
    assert.match(result.warning, /无法据此确定实际地理位置/);
  }
});

test('RIPEstat rejects unrelated or unannounced prefixes and labels multiple origin ASNs', async () => {
  for (const [prefix, announced] of [['1.1.1.0/24', true], ['8.8.8.0/24', false]]) {
    const result = await lookupIP({ ip: '8.8.8.8' }, { fetch: async target => new URL(target).hostname === 'ipwho.is' ? json({}, 503) : json({ status: 'ok', data: { type: 'prefix', resource: prefix, announced, asns: [{ asn: 15169, holder: 'Wrong result' }] } }) });
    assert.equal(result.network.asn, null);
    assert.equal(result.network.organization, '');
    assert.match(result.warning, /备用路由信息也暂不可用/);
  }
  const multiple = await lookupIP({ ip: '8.8.8.8' }, { fetch: async target => new URL(target).hostname === 'ipwho.is' ? json({}, 503) : json({ status: 'ok', data: { type: 'prefix', resource: '8.8.8.0/24', announced: true, asns: [{ asn: 15170, holder: 'Second' }, { asn: 15169, holder: 'First' }] } }) });
  assert.equal(multiple.network.asn, 15169);
  assert.match(multiple.warning, /多个公告 ASN/);
});
