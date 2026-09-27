async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [];
  const errors = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const screenshot = async name => {
    await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('visible'));
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true, animations: 'disabled' });
  };
  page.on('pageerror', error => errors.push(error.message));
  const ipRequests = [];
  let ipMode = 'ok';
  const ipFixture = {
    ip: '203.0.113.9', version: 4, isCurrent: true,
    location: { country: '示例地区', countryCode: 'ZZ', region: '示例省份', city: '示例城市', timezone: 'Asia/Shanghai' },
    network: { asn: 64496, organization: 'Example Network <img src=x onerror="window.networkUnsafe=true">', isp: '示例互联网服务商' },
    source: '测试数据 · 未读取真实 IP', warning: '位置为大致归属地。', checkedAt: '2026-09-25T12:00:00Z',
  };
  await page.route('**/api/network/ip', async route => {
    const request = route.request();
    const body = request.postDataJSON();
    ipRequests.push({ method: request.method(), client: request.headers()['x-daykit-client'], body });
    if (ipMode === 'invalid') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_IP', message: '请输入有效的公网 IP <script>window.networkUnsafe=true</script>' } }) });
    if (ipMode === 'offline') return route.abort('failed');
    if (ipMode === 'html') return route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad Gateway</h1>' });
    const value = body.ip || '';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ipFixture, ip: value || ipFixture.ip, version: value.includes(':') ? 6 : 4, isCurrent: !value }) });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${base}/tools/ip/`);
  await page.locator('.network-ip-value output').waitFor();
  check((await page.locator('h1').textContent()).includes('IP'), 'IP page is integrated with the original tool shell');
  check(ipRequests.length === 1 && ipRequests[0].body.ip === '', 'IP page detects the current connection on opening');
  check(ipRequests[0].method === 'POST' && ipRequests[0].client === 'network-tools', 'IP request follows the same-origin API contract');
  check(await page.locator('.network-ip-value output').textContent() === '203.0.113.9', 'current IP is displayed');
  check((await page.locator('.network-details').textContent()).includes('AS64496'), 'ASN and network metadata are displayed');
  check(await page.locator('#network-result img, #network-result script').count() === 0, 'IP metadata is escaped instead of creating HTML nodes');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.daykitNetworkCopied = text; } } }); });
  await page.locator('.network-ip-value [data-network-copy]').click();
  check(await page.evaluate(() => window.daykitNetworkCopied) === '203.0.113.9', 'current IP can be copied');
  await screenshot('ip-desktop');
  const ipv6 = '2001:db8:abcd:1234:5678:90ab:cdef:1234';
  await page.locator('#network-input').fill(ipv6);
  await page.locator('#network-input').press('Enter');
  await page.locator('.network-ip-value output').filter({ hasText: ipv6 }).waitFor();
  check((await page.locator('.network-overline').textContent()).includes('指定 IP'), 'manual IPv6 lookup is clearly separate from current IP detection');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `IPv6 result has no horizontal overflow at ${width}px`);
    if (width === 375) await screenshot('ip-mobile');
  }
  ipMode = 'invalid';
  await page.locator('#network-input').fill('not-an-ip');
  await page.locator('#network-submit').click();
  await page.locator('.network-notice.error').waitFor();
  check(await page.locator('#network-input').getAttribute('aria-invalid') === 'true', 'invalid IP is associated with its input');
  check(await page.locator('.network-ip-value').count() === 0, 'failed lookup removes stale IP data');
  check(await page.locator('#network-feedback script').count() === 0, 'provider error messages are safely escaped');
  check(await page.locator('#network-submit').isEnabled(), 'query controls recover after validation failure');
  ipMode = 'offline';
  await page.locator('#network-current').click();
  await page.locator('.network-notice.error').filter({ hasText: '网络连接失败' }).waitFor();
  check(await page.locator('#network-current').isEnabled(), 'network failure leaves a usable retry control');
  ipMode = 'html';
  await page.locator('#network-current').click();
  await page.locator('.network-notice.error').filter({ hasText: '服务暂时不可用' }).waitFor();
  check(true, 'non-JSON upstream response has a readable failure message');
  ipMode = 'ok';
  await page.locator('#network-current').click();
  await page.locator('.network-ip-value output').waitFor();
  check(await page.locator('#network-input').inputValue() === '', 'refresh current IP clears the manual query');

  const domainFixture = {
    domain: 'example.com',
    records: {
      A: [{ name: 'example.com', type: 'A', ttl: 300, value: '203.0.113.10' }, { name: 'example.com', type: 'A', ttl: 300, value: '192.168.1.1' }],
      AAAA: [{ name: 'example.com', type: 'AAAA', ttl: 300, value: ipv6 }],
      CNAME: [{ name: 'example.com', type: 'CNAME', ttl: 300, value: '<img src=x onerror="window.networkUnsafe=true">.example.net' }],
      MX: [{ name: 'example.com', type: 'MX', ttl: 600, value: '10 mail.example.com' }],
      NS: [{ name: 'example.com', type: 'NS', ttl: 86400, value: 'ns1.example.com' }],
    },
    addresses: [{ ip: '203.0.113.10', version: 4, cdn: { provider: 'Example CDN', evidence: '测试 CDN 线索 <svg onload="window.networkUnsafe=true">' } }, { ip: ipv6, version: 6, cdn: null }, { ip: '192.168.1.1', version: 4, public: false, cdn: null }],
    cdn: { detected: true, providers: ['Example CDN'], evidence: ['example.com → example.cdn.test'], conclusion: '存在 CDN 线索；这些解析 IP 无法确认是源站。' },
    resolver: '测试 DNS', warnings: ['测试提示 <script>window.networkUnsafe=true</script>'],
    sources: [{ name: 'DNS 文档', url: 'https://developers.cloudflare.com/1.1.1.1/' }, { name: '不安全链接', url: 'javascript:alert(1)' }], checkedAt: '2026-09-25T12:00:00Z',
  };
  let domainMode = 'ok';
  let domainSubmitted;
  await page.route('**/api/network/domain', route => {
    domainSubmitted = route.request().postDataJSON();
    if (domainMode === 'invalid') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INVALID_DOMAIN', message: '请输入有效域名。' } }) });
    const result = domainMode === 'empty' ? { ...domainFixture, addresses: [], records: { A: [], AAAA: [], CNAME: [], MX: [], NS: [] }, cdn: { detected: false, providers: [], conclusion: '未发现 CDN 线索，仍无法确认源站。' }, warnings: [] } : domainFixture;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${base}/tools/domain/`);
  await page.locator('#network-input').waitFor();
  check((await page.locator('h1').textContent()).includes('域名'), 'domain page is integrated with the original tool shell');
  check(domainSubmitted === undefined, 'domain lookup waits for user input');
  await page.locator('#network-submit').click();
  check(domainSubmitted === undefined, 'empty domain input never sends an API request');
  await page.locator('#network-input').fill('https://example.com/a?b=1');
  await page.locator('#network-input').press('Enter');
  await page.locator('.network-domain-value output').waitFor();
  check(domainSubmitted.domain === 'https://example.com/a?b=1', 'domain input accepts a pasted URL and keyboard submission');
  check(await page.locator('.network-record-group').count() === 5, 'all five DNS record types are shown');
  check(await page.locator('.network-address').count() === 3, 'IPv4 and IPv6 resolved addresses are displayed');
  check((await page.locator('.network-address').last().textContent()).includes('内网或保留地址'), 'private DNS answers are marked as non-public addresses');
  check((await page.locator('.network-origin-note').textContent()).includes('无法通过本次公开解析确认'), 'result explicitly avoids claiming that DNS reveals the origin');
  check((await page.locator('.network-origin-note').textContent()).includes('Example CDN'), 'CDN clues are visible');
  check((await page.locator('.network-origin-note').textContent()).includes('example.com → example.cdn.test'), 'CNAME evidence is shown alongside CDN clues');
  check(await page.locator('#network-result img, #network-result script, #network-result svg[onload]').count() === 0, 'DNS records, warnings, and CDN evidence cannot inject HTML');
  check(await page.locator('.network-sources a').count() === 1 && !(await page.locator('.network-sources').textContent()).includes('不安全链接'), 'only HTTPS source links are rendered');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.daykitNetworkCopied = text; } } }); });
  await page.locator('.network-address [data-network-copy]').first().click();
  check(await page.evaluate(() => window.daykitNetworkCopied) === '203.0.113.10', 'resolved IP can be copied');
  await page.locator('.network-record-group').filter({ has: page.locator('#dns-MX-title') }).locator('[data-network-copy]').click();
  check(await page.evaluate(() => window.daykitNetworkCopied) === '10 mail.example.com', 'DNS copy preserves MX priority and hostname');
  await screenshot('domain-desktop');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `DNS results have no horizontal overflow at ${width}px`);
    if (width === 375) await screenshot('domain-mobile');
  }
  domainMode = 'empty';
  await page.locator('#network-submit').click();
  await page.locator('.network-domain-summary .network-badge').filter({ hasText: '未返回解析记录' }).waitFor();
  check(await page.locator('.network-no-records').count() === 6, 'empty address and record groups have explicit no-data states');
  check((await page.locator('.network-origin-note').textContent()).includes('无法通过本次公开解析确认'), 'absence of CDN clues still does not claim a verified origin');
  domainMode = 'invalid';
  await page.locator('#network-input').fill('invalid');
  await page.locator('#network-submit').click();
  await page.locator('.network-notice.error').waitFor();
  check(await page.locator('#network-input').getAttribute('aria-invalid') === 'true', 'invalid domains receive input feedback');
  check(await page.locator('.network-record-group').count() === 0, 'failed domain lookup removes stale DNS records');
  check(await page.evaluate(() => !window.networkUnsafe), 'untrusted network data never executes script');
  check(errors.length === 0, `no browser JavaScript errors: ${errors.join(', ')}`);
  await page.unroute('**/api/network/ip');
  await page.unroute('**/api/network/domain');
  await page.setViewportSize({ width: 1440, height: 1050 });
  return { passed: checks.length, checks, fixtureOnly: true };
}
