async page => {
  const base = await page.evaluate(() => location.origin);
  const checks = [];
  const errors = [];
  const externalRequests = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('tracking.example')) externalRequests.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${base}/tools/outlook/`);
  await page.locator('#mail-account').waitFor();
  check(await page.getByRole('heading', { name: 'Outlook 邮件读取', exact: true }).isVisible(), 'reader is integrated in the original shell');
  await page.locator('#mail-submit').click();
  check((await page.locator('#mail-feedback').textContent()).includes('请先粘贴'), 'empty input is rejected before requesting Microsoft');
  await page.locator('#mail-demo').click();
  check((await page.locator('#mail-result-meta').textContent()).includes('未连接邮箱'), 'sample data is explicitly labeled');
  check(await page.locator('.mail-message').count() === 2, 'sample preview shows messages');
  check(await page.frameLocator('.mail-html-body').getByRole('heading', { name: '确认你的邮箱' }).isVisible(), 'sample HTML renders its heading and layout');
  await page.locator('[data-mail-view="text"]').click();
  check(await page.locator('.mail-text-body').first().isVisible() && await page.locator('.mail-html-body').isHidden(), 'plain-text view replaces the HTML preview');
  await page.locator('[data-mail-view="html"]').click();
  check(await page.locator('.mail-html-body').isVisible(), 'formatted view can be restored');
  await page.locator('#mail-clear').click();
  check(await page.locator('.mail-message').count() === 0, 'clear removes old messages');
  await page.screenshot({ path: 'artifacts/outlook-desktop.png', fullPage: true });

  const clientId = '11111111-1111-4111-8111-111111111111';
  const line = `reader@example.com----keep-password-in-browser----${clientId}----fake-original-token`;
  let submitted;
  const fixture = {
    email: 'reader@example.com', protocol: 'graph', folder: 'inbox', scanned: 1, keyword: '', warning: '', refreshedToken: 'fake-rotated-token',
    attempts: [{ protocol: 'graph', ok: true, code: 'OK', message: '读取成功' }],
    messages: [{ id: 'test1', subject: '邮件内容转义验证 <script>', from: '测试 <sender@example.com>', date: '2026-09-25T12:00:00Z', body: '验证码：004821\n<img src=x onerror="window.unwanted=true">', html: '<h2 style="color:#344f3e">格式化邮件正文</h2><table><tbody><tr><th>验证码</th><td><strong>004821</strong></td></tr></tbody></table><p>表格、标题与加粗文字可直接阅读。</p>', codes: ['004821'] }],
  };
  await page.route('**/api/outlook/read', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  await page.locator('#mail-account').fill(line);
  await page.locator('#mail-submit').click();
  await page.locator('.mail-message').waitFor();
  check(submitted.email === 'reader@example.com' && submitted.refreshToken === 'fake-original-token', 'request includes only the required account credentials');
  check(!JSON.stringify(submitted).includes('keep-password-in-browser') && !Object.hasOwn(submitted, 'password'), 'password never leaves the browser');
  check(await page.locator('#mail-message-list img, #mail-message-list script').count() === 0, 'message HTML cannot execute or load images');
  const preview = page.frameLocator('.mail-html-body');
  await preview.getByRole('heading', { name: '格式化邮件正文' }).waitFor();
  check(await preview.locator('td strong').textContent() === '004821', 'HTML table and emphasis render in the message frame');
  check(await preview.locator('h2').evaluate(element => getComputedStyle(element).color) === 'rgb(52, 79, 62)', 'mail-page CSP permits sanitized inline typography');
  check(await page.locator('.mail-html-body').getAttribute('sandbox') === '', 'preview has no script, same-origin, form or popup sandbox permissions');
  check(await page.locator('.mail-html-body').evaluate(element => element.contentDocument === null), 'preview is isolated from the application origin');
  await page.locator('[data-mail-view="text"]').click();
  check((await page.locator('.mail-text-body').textContent()).includes('<img src=x onerror="window.unwanted=true">'), 'plain-text markup stays literal');
  await page.locator('[data-mail-view="html"]').click();
  check(await page.locator('#mail-code-summary').textContent().then(text => text.includes('004821')), 'verification code retains leading zeros');
  check(await page.locator('#mail-token-update').isVisible(), 'rotated token can be recovered');
  await page.locator('[data-mail-action="use-token"]').click();
  check((await page.locator('#mail-account').inputValue()).endsWith('fake-rotated-token'), 'updated token replaces the input row');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.daykitCopied = text; } } }); });
  await page.locator('[data-mail-action="copy-row"]').click();
  check(await page.evaluate(() => window.daykitCopied) === `reader@example.com----keep-password-in-browser----${clientId}----fake-rotated-token`, 'copy preserves the original password and new token');
  await page.locator('#mail-code-summary [data-mail-copy]').click();
  check(await page.evaluate(() => window.daykitCopied) === '004821', 'code copy works');
  await page.screenshot({ path: 'artifacts/outlook-result.png', fullPage: true });
  // Deliberately bypass server sanitization in the mock to test the independent
  // iframe CSP/sandbox protection against scripts and remote resource loading.
  fixture.messages[0].html += '<img hidden src="https://tracking.example/pixel"><link rel="stylesheet" href="https://tracking.example/sheet"><div style="background-image:url(https://tracking.example/background)">隔离测试</div><script>window.unwanted=true;parent.unwanted=true</script>';
  await page.locator('#mail-submit').click();
  await page.frameLocator('.mail-html-body').getByText('隔离测试', { exact: true }).waitFor();
  check(await page.frameLocator('.mail-html-body').locator('body').evaluate(() => window.unwanted !== true), 'sandbox blocks script execution even when a response bypasses sanitization');
  check(await page.evaluate(() => window.unwanted !== true), 'email markup never executes in the application');
  check(externalRequests.length === 0, 'preview makes no remote tracking image, stylesheet or CSS requests');
  await page.reload();
  await page.locator('#mail-account').waitFor();
  check(await page.locator('#mail-account').inputValue() === '' && await page.locator('.mail-message').count() === 0, 'credentials and messages are not restored after reload');

  await page.unroute('**/api/outlook/read');
  await page.route('**/api/outlook/read', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'OAUTH_invalid_grant', message: '需要重新授权' }, attempts: [{ protocol: 'graph', ok: false, code: 'OAUTH_invalid_grant', message: '需要重新授权' }], refreshedToken: 'recover-on-error' }) }));
  await page.locator('#mail-account').fill(line);
  await page.locator('#mail-submit').click();
  await page.locator('.mail-notice.error').waitFor();
  check((await page.locator('#mail-feedback').textContent()).includes('不代表邮箱已失效'), 'failure does not mark the mailbox as disposable');
  check(await page.locator('#mail-token-update').isVisible(), 'rotated token is recoverable after a downstream error');
  await page.locator('.mail-attempts summary').click();
  check((await page.locator('.mail-attempts').textContent()).includes('OAUTH_invalid_grant'), 'provider failure details are visible');
  await page.locator('#mail-clear').click();
  check(await page.locator('#mail-token-update').isHidden(), 'clear removes token recovery state');
  await page.unroute('**/api/outlook/read');

  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#mail-demo').click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `reader has no horizontal overflow at ${width}px`);
    if (width === 375) await page.screenshot({ path: 'artifacts/outlook-mobile.png', fullPage: true });
  }
  await page.locator('#mail-clear').click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  check(errors.length === 0, `no browser JavaScript errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks, realMailboxTested: false };
}
