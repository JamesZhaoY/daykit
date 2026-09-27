async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [];
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/tools/jwt/`);
  await page.locator('#jwt-input').waitFor();
  await page.locator('#jwt-example').click();
  check((await page.locator('#jwt-feedback').textContent()).includes('签名未验证'), 'JWT decoding does not claim signature verification');
  check(JSON.parse(await page.locator('#jwt-payload').inputValue()).name === '日用示例', 'UTF-8 payload renders correctly');
  check(await page.locator('.jwt-time-row').count() === 3, 'all three time claims are displayed');
  check((await page.locator('#jwt-summary').textContent()).includes('按声明尚未过期'), 'expiry interpretation is clearly labeled');
  check((await page.locator('#jwt-warnings').textContent()).includes('没有签名'), 'unsigned sample has an explicit warning');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.jwtCopied = text; } } }); });
  await page.locator('[data-jwt-copy="payload"]').click();
  check(await page.evaluate(() => JSON.parse(window.jwtCopied).name) === '日用示例', 'payload copy contains decoded JSON');
  await page.locator('#jwt-input').fill('invalid');
  check(await page.locator('#jwt-results').isHidden(), 'editing invalidates stale results');
  await page.locator('#jwt-form button[type="submit"]').click();
  check(await page.locator('#jwt-input').getAttribute('aria-invalid') === 'true', 'invalid token has accessible error state');
  const testToken = await page.evaluate(() => {
    const encode = object => btoa(JSON.stringify(object)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    return `${encode({ alg: 'none' })}.${encode({ iss: '<img src=x onerror="window.jwtUnsafe=true">', exp: 0 })}.`;
  });
  await page.locator('#jwt-input').fill(`Bearer ${testToken}`);
  await page.locator('#jwt-form button[type="submit"]').click();
  check((await page.locator('#jwt-summary').textContent()).includes('按声明已过期'), 'epoch expiry is treated as expired');
  check(await page.locator('#jwt-claims img').count() === 0 && !await page.evaluate(() => window.jwtUnsafe), 'claims are rendered as escaped text');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    await page.locator('#jwt-example').click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `JWT layout fits ${width}px`);
    if (width === 375 || width === 1440) await page.screenshot({ path: `artifacts/jwt-${width}.png`, fullPage: true });
  }
  await page.reload();
  await page.locator('#jwt-input').waitFor();
  check(await page.locator('#jwt-input').inputValue() === '', 'token is not restored after refresh');
  check(errors.length === 0, `no JWT browser errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks };
}
