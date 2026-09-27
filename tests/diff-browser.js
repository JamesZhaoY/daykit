async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [];
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}/tools/diff/`);
  await page.locator('#diff-left').fill('name: Daykit\nversion: 1.0\n<script>alert(1)</script>');
  await page.locator('#diff-right').fill('name: Daykit\nversion: 1.1\ncache: enabled');
  await page.locator('#diff-submit').click();
  check(await page.locator('.diff-row.unchanged').count() === 1, 'unchanged rows render');
  check(await page.locator('.diff-row.removed').count() === 2, 'removed rows render');
  check(await page.locator('.diff-row.added').count() === 2, 'added rows render');
  check(await page.locator('#diff-result script, #diff-result img').count() === 0, 'diff output safely escapes HTML');
  await page.locator('#diff-left').fill('  same   line  ');
  check(await page.locator('[data-diff-action="copy"]').isDisabled() && await page.locator('.diff-row').count() === 0, 'editing invalidates previous results and copying');
  await page.locator('#diff-right').fill('same line');
  await page.locator('#diff-ignore-whitespace').check();
  check(await page.locator('.diff-row.unchanged').count() === 1, 'ignore whitespace compares normalized lines');
  await page.locator('[data-diff-action="sample"]').click();
  check(await page.locator('.diff-row').count() > 0, 'sample shortcut produces a result');
  await page.locator('[data-diff-action="clear"]').click();
  check(await page.locator('.diff-row').count() === 0 && (await page.locator('.diff-empty').textContent()).includes('输入两段'), 'clear removes stale result');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}px`);
  }
  check(errors.length === 0, `no JavaScript errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks };
}
