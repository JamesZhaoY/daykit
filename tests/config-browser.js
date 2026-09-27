async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [];
  const errors = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${base}/tools/config/`);
  check(await page.locator('#config-copy').isDisabled(), 'copy is disabled before conversion');
  const expected = { name: '日用', count: 3, tags: ['中文', 'tools'], server: { enabled: true } };
  const examples = {
    json: JSON.stringify(expected),
    yaml: 'name: 日用\ncount: 3\ntags: [中文, tools]\nserver:\n  enabled: true',
    toml: 'name = "日用"\ncount = 3\ntags = ["中文", "tools"]\n[server]\nenabled = true',
  };
  for (const source of ['json', 'yaml', 'toml']) for (const target of ['json', 'yaml', 'toml']) {
    if (source === target) continue;
    await page.locator('#config-source').selectOption(source);
    await page.locator('#config-target').selectOption(target);
    await page.locator('#config-input').fill(examples[source]);
    await page.locator('#config-convert').click();
    check((await page.locator('#config-feedback').textContent()).includes('转换完成') && !(await page.locator('#config-copy').isDisabled()), `${source} → ${target} converts`);
    const output = await page.locator('#config-output').inputValue();
    await page.locator('#config-source').selectOption(target);
    await page.locator('#config-target').selectOption('json');
    await page.locator('#config-input').fill(output);
    await page.locator('#config-convert').click();
    check(JSON.stringify(JSON.parse(await page.locator('#config-output').inputValue())) === JSON.stringify(expected), `${source} → ${target} retains original values`);
  }
  await page.locator('#config-source').selectOption('json');
  await page.locator('#config-target').selectOption('yaml');
  await page.locator('#config-sample').click();
  const yaml = await page.locator('#config-output').inputValue();
  await page.locator('#config-swap').click();
  check(await page.locator('#config-input').inputValue() === yaml && await page.locator('#config-source').inputValue() === 'yaml' && (await page.locator('#config-feedback').textContent()).includes('转换完成'), 'swap uses current result and converts back');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#config-download').click();
  const download = await downloadPromise;
  check(download.suggestedFilename() === 'config.json', 'download has matching extension');
  await page.locator('#config-input').fill('a: 1\n---\nb: 2');
  check(await page.locator('#config-copy').isDisabled() && await page.locator('#config-output').inputValue() === '', 'editing clears stale output and disables copying');
  await page.locator('#config-convert').click();
  check((await page.locator('#config-feedback').textContent()).includes('解析错误') && await page.locator('#config-input').getAttribute('aria-invalid') === 'true', 'multiple YAML documents give an accessible error');
  await page.locator('#config-source').selectOption('json');
  await page.locator('#config-target').selectOption('toml');
  await page.locator('#config-input').fill('{"value":null}');
  await page.locator('#config-convert').click();
  check((await page.locator('#config-feedback').textContent()).includes('不支持 null'), 'TOML null is rejected instead of silently dropped');
  await page.locator('#config-input').fill('{"id":9007199254740993}');
  await page.locator('#config-convert').click();
  check((await page.locator('#config-feedback').textContent()).includes('安全整数'), 'unsafe integer precision is protected');
  await page.locator('#config-input').fill('{"html":"<img src=x onerror=alert(1)>"}');
  await page.locator('#config-convert').click();
  check((await page.locator('#config-output').inputValue()).includes('<img') && await page.locator('.config-form img').count() === 0, 'HTML content remains inert data');
  await page.locator('#config-clear').click();
  check(await page.locator('#config-input').inputValue() === '' && await page.locator('#config-output').inputValue() === '' && await page.locator('#config-download').isDisabled(), 'clear resets editors and result actions');
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}px`);
  }
  check(errors.length === 0, `no JavaScript errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks };
}
