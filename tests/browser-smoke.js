async page => {
  const base = await page.evaluate(() => location.origin);
  if (!base.startsWith('http')) throw new Error('Open the Daykit site before running this check.');
  const checks = [];
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  check(await page.locator('.tool-card').count() === 12, 'home lists all twelve tools');
  await page.locator('#tool-search').fill('Base64');
  check(await page.locator('.tool-card').count() === 1, 'keyword search matches encoding');
  await page.locator('#tool-search').fill('no-matching-tool');
  check(await page.locator('.empty-state').isVisible(), 'search empty state is visible');
  await page.locator('[data-action="reset-search"]').click();
  await page.locator('[data-category="时间"]').click();
  check(await page.locator('.tool-card').count() === 2, 'category filtering works');
  await page.locator('[data-category="全部"]').click();
  const favorite = page.locator('[data-favorite="json"]');
  if (await favorite.getAttribute('aria-pressed') !== 'true') await favorite.click();
  await page.goto(`${base}/?view=favorites`);
  check(await page.locator('.tool-card').count() === 1, 'favorites persist across page navigation');
  await page.locator('[data-favorite="json"]').click();
  check(await page.locator('.empty-state').isVisible(), 'removing last favorite shows useful empty state');

  await page.goto(`${base}/tools/json/`);
  await page.locator('#source').fill('{"name":"日用","values":[1,true,null]}');
  await page.locator('[data-action="format"]').click();
  check((await page.locator('#output').inputValue()).includes('\n  "name": "日用"'), 'JSON format produces readable output');
  await page.locator('[data-action="minify"]').click();
  check((await page.locator('#output').inputValue()) === '{"name":"日用","values":[1,true,null]}', 'JSON minify works');
  await page.locator('[data-action="validate"]').click();
  check((await page.locator('#feedback').textContent()).includes('校验通过'), 'JSON validation reports success');
  await page.locator('#source').fill('{"id":9007199254740993}');
  check(await page.locator('[data-action="copy"]').isDisabled(), 'editing invalidates old results');
  await page.locator('[data-action="format"]').click();
  check((await page.locator('#feedback').textContent()).includes('安全精度'), 'unsafe JSON numbers are rejected');
  await page.locator('#source').fill('{broken');
  await page.locator('[data-action="format"]').click();
  check(await page.locator('#source').getAttribute('aria-invalid') === 'true', 'invalid JSON has visible error state');
  await page.locator('#file-input').setInputFiles('package.json');
  await page.waitForFunction(() => document.querySelector('#output').value.includes('daykit'));
  check(JSON.parse(await page.locator('#output').inputValue()).name === 'daykit', 'JSON file import works');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-action="download"]').click();
  const download = await downloadEvent;
  check(download.suggestedFilename() === 'daykit-formatted.json', 'formatted JSON download works');
  await download.saveAs('artifacts/downloaded.json');
  await page.locator('[data-action="sample"]').click();
  await page.screenshot({ path: 'artifacts/json-desktop.png', fullPage: true });
  await page.reload();
  check(await page.locator('#source').inputValue() === '', 'pasted content is not persisted');

  await page.goto(`${base}/tools/encode/`);
  const input = '日用 / café + \u{1D11E}\n第二行';
  await page.locator('#source').fill(input);
  await page.locator('[data-action="encode"]').click();
  await page.locator('[data-action="swap"]').click();
  await page.locator('[data-action="decode"]').click();
  check(await page.locator('#output').inputValue() === input, 'UTF-8 Base64 browser round trip');
  await page.locator('[data-kind="url"]').click();
  await page.locator('#source').fill('a b+c/中文');
  await page.locator('[data-action="encode"]').click();
  check(await page.locator('#output').inputValue() === 'a%20b%2Bc%2F%E4%B8%AD%E6%96%87', 'URL component encoding works');
  await page.locator('[data-action="swap"]').click();
  await page.locator('[data-action="decode"]').click();
  check(await page.locator('#output').inputValue() === 'a b+c/中文', 'URL decoding works');
  await page.locator('#source').fill('%E0%A4');
  await page.locator('[data-action="decode"]').click();
  check(await page.locator('#source').getAttribute('aria-invalid') === 'true', 'invalid URL encoding produces an error');

  await page.goto(`${base}/tools/timestamp/`);
  await page.locator('#timestamp-input').fill('0');
  await page.locator('[data-action="to-date"]').click();
  check((await page.locator('#date-results').textContent()).includes('1970-01-01T00:00:00.000Z'), 'Unix epoch converts correctly');
  await page.locator('#timestamp-unit').selectOption('ms');
  await page.locator('#timestamp-input').fill('1750000000123');
  await page.locator('[data-action="to-date"]').click();
  check((await page.locator('#date-results').textContent()).includes('.123Z'), 'millisecond conversion preserves precision');
  await page.locator('#timezone').selectOption('utc');
  await page.locator('#datetime-input').fill('1970-01-01T00:00');
  await page.locator('[data-action="to-timestamp"]').click();
  check(await page.locator('#timestamp-results output').first().textContent() === '0', 'UTC date converts to Unix epoch');
  await page.locator('[data-action="use-now"]').click();
  check(await page.locator('#date-results output').count() === 2, 'current time shortcut converts both panels');
  await page.screenshot({ path: 'artifacts/timestamp-desktop.png', fullPage: true });
  await page.locator('#timestamp-input').fill('bad');
  await page.locator('[data-action="to-date"]').click();
  check((await page.locator('#date-error').textContent()).includes('整数'), 'invalid timestamps are handled');

  await page.keyboard.press('Control+k');
  check(await page.locator('#search-dialog').isVisible(), 'keyboard shortcut opens accessible search dialog');
  await page.locator('#quick-search').fill('base64');
  await page.locator('#quick-search').press('Enter');
  await page.waitForURL('**/tools/encode/');
  check(page.url().endsWith('/tools/encode/'), 'quick search navigates to the matched tool');

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/tools/json/', '/tools/encode/', '/tools/timestamp/']) {
      await page.goto(base + path);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}px on ${path}`);
      if (width === 375 && path === '/') {
        await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
        await page.getByRole('button', { name: '打开导航菜单' }).click();
        check(await page.locator('#mobile-dialog').isVisible(), 'mobile navigation opens');
        await page.locator('#mobile-dialog a[href="/tools/json/"]').click();
        await page.waitForURL('**/tools/json/');
        check(page.url().endsWith('/tools/json/'), 'mobile navigation routes correctly');
      }
      if (width === 375 && path === '/tools/json/') {
        await page.locator('[data-action="sample"]').click();
        await page.screenshot({ path: 'artifacts/json-mobile.png', fullPage: true });
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  check(errors.length === 0, `no JavaScript errors: ${errors.join(', ')}`);
  check(failedRequests.length === 0, `no failed HTTP responses: ${failedRequests.join(', ')}`);
  return { passed: checks.length, checks };
}
