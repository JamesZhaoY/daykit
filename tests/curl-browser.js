async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [], errors = [], unexpectedRequests = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().startsWith('https://api.example.com/')) unexpectedRequests.push(request.url()); });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}/tools/curl/`);
  await page.locator('[data-curl-action="sample"]').click();
  check(await page.locator('#curl-method').textContent() === 'POST', 'cURL sample detects POST');
  check(await page.locator('#curl-query .curl-row').count() === 2, 'duplicate query parameters remain visible');
  check((await page.locator('#curl-code').inputValue()).includes('await fetch('), 'fetch code generated');
  await page.locator('#curl-language').selectOption('python');
  check((await page.locator('#curl-code').inputValue()).includes('requests.request('), 'Python code generated');
  await page.locator('#curl-input').fill("curl 'https://api.example.com/test' --data-raw '<img src=x onerror=alert(1)>'");
  check(await page.locator('#curl-results').isHidden(), 'editing clears stale parsed result');
  await page.locator('#curl-submit').click();
  await page.locator('.curl-body summary').click();
  check((await page.locator('#curl-body').textContent()).includes('<img'), 'body remains readable as text');
  check(await page.locator('#curl-results img, #curl-results script').count() === 0, 'request text cannot inject HTML');
  await page.locator('#curl-input').fill('curl https://api.example.com/test | cat');
  await page.locator('#curl-submit').click();
  check((await page.locator('#curl-feedback').textContent()).includes('管道'), 'shell pipeline rejected');
  check(await page.locator('#curl-results').isHidden(), 'invalid command has no stale code');
  await page.locator('#curl-input').fill("curl https://api.example.com/test -b 'sid=abc'");
  await page.locator('#curl-submit').click();
  check((await page.locator('#curl-warnings').textContent()).includes('Cookie 无法手动设置'), 'Cookie browser limitation visible');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}px`);
  }
  await page.locator('[data-curl-action="clear"]').click();
  check(await page.locator('#curl-input').inputValue() === '' && await page.locator('#curl-results').isHidden(), 'clear removes inputs and results');
  check(unexpectedRequests.length === 0, 'pasted cURL never makes an API request');
  check(errors.length === 0, `no JavaScript errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks };
}
