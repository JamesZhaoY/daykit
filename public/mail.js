import { parseAccount } from './mail-shared.mjs';

function previewDocument(html) {
  // HTML is sanitized by the Worker; the opaque, script-free iframe also
  // blocks every resource request even if an upstream message is malformed.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    :root { color-scheme: light; } * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font: 14px/1.7 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; color: #253328; background: #fff; overflow-wrap: anywhere; }
    table { max-width: 100%; } td, th { overflow-wrap: anywhere; } pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    blockquote { margin-inline: 0; padding-left: 16px; border-left: 3px solid #dfe6d8; color: #617058; }
    a { color: #3468a0; text-decoration: underline; } hr { border: 0; border-top: 1px solid #e5e9e0; }
    @media (max-width: 480px) { body { padding: 16px; } }
  </style></head><body>${html}</body></html>`;
}

export function initMail(root, { copy, icon, escapeHTML: esc }) {
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form id="mail-form" autocomplete="off" class="mail-form">
    <div class="mail-section-label"><span>01 / 账号与读取设置</span><span class="mail-badge">单邮箱验证</span></div>
    <label class="mail-label" for="mail-account">微软邮箱账号信息 <span>OUTLOOK / HOTMAIL / LIVE</span></label>
    <textarea id="mail-account" spellcheck="false" autocapitalize="off" autocomplete="off" data-1p-ignore data-lpignore="true" placeholder="email----password----client_id----refresh_token" aria-describedby="mail-account-hint"></textarea>
    <p id="mail-account-hint" class="mail-hint">每次一行，以四个连字符分隔。密码字段仅兼容格式，不用于登录。</p>
    <div class="mail-settings"><label class="mail-label">筛选关键词<input id="mail-keyword" maxlength="200" placeholder="可选，在本次读取的邮件中筛选"></label><label class="mail-label">读取数量<select id="mail-count"><option value="1">最近 1 封</option><option value="5" selected>最近 5 封</option><option value="10">最近 10 封</option><option value="20">最近 20 封</option><option value="30">最近 30 封</option></select></label><label class="mail-label">文件夹<select id="mail-folder"><option value="inbox">收件箱</option><option value="junkemail">垃圾邮件</option></select></label></div>
    <div class="mail-body-option"><label><input id="mail-body" type="checkbox" checked> 读取正文</label><p>显示邮件正文并查找可能的验证码；关闭后读取更轻量。</p></div>
    <details class="mail-advanced"><summary>高级选项 <span>读取方式与登录类型</span></summary><div class="mail-advanced-fields"><label class="mail-label">读取方式<select id="mail-protocol"><option value="auto">自动 · Graph 优先，必要时尝试 IMAP</option><option value="graph">仅 Microsoft Graph</option><option value="imap">仅 IMAP OAuth</option></select></label><label class="mail-label">登录类型<select id="mail-tenant"><option value="consumers">个人 Microsoft 账号（Hotmail / Outlook）</option><option value="common">个人与工作 / 学校账号（common）</option></select></label></div></details>
    <div class="mail-actions"><button class="button primary" id="mail-submit" type="submit">${icon('arrow', 16)} 读取邮件</button><button class="button" id="mail-clear" type="button">清空</button><button class="button" id="mail-cancel" type="button" hidden>取消等待</button><button class="text-button mail-demo-button" id="mail-demo" type="button">预览示例</button><span class="mail-shortcut"><kbd>⌘</kbd> + <kbd>Enter</kbd></span></div>
  </form>
  <section class="mail-results" aria-labelledby="mail-result-title"><div class="mail-results-heading"><h2 id="mail-result-title">读取结果</h2><span id="mail-result-meta">等待输入</span></div><div id="mail-feedback" role="status" aria-live="polite"></div><div id="mail-token-update" hidden></div><div id="mail-code-summary"></div><div id="mail-message-list"></div></section>
  <details class="mail-help"><summary>使用说明与常见问题</summary><div><p>输入一条账号记录，选择数量后点击读取。关键词只筛选本次获取的最近邮件，不搜索整个邮箱。</p><p>自动模式优先使用 Graph；授权或权限不兼容时尝试 IMAP。IMAP 需要在 Outlook 设置中启用。限流、网络错误和超时不会连续切换接口重试。</p><p>HTML 邮件保留文字、表格和基础样式，也可切换纯文本。图片、外部资源和链接跳转已禁用。只读操作不会删除、移动或标记已读。验证码为规则匹配结果，请结合邮件原文确认。</p><p>如果 Microsoft 返回新令牌，可更新本页输入或复制新的账号行自行保存。一次读取失败并不代表邮箱已失效。</p><p>此页用于单邮箱验证，支持 Microsoft v2 OAuth 端点。Graph 读取的是令牌所属邮箱，请核对账号行与授权来源。</p></div></details>`;

  let active = null;
  let latest = null;
  let elapsedTimer;
  function empty(message = '粘贴账号信息，读取最近的邮件。') {
    $('#mail-feedback').innerHTML = '';
    $('#mail-code-summary').innerHTML = '';
    $('#mail-token-update').hidden = true;
    $('#mail-token-update').innerHTML = '';
    $('#mail-result-meta').textContent = '等待输入';
    $('#mail-message-list').innerHTML = `<div class="mail-empty"><span class="mail-empty-icon">${icon('copy', 26)}</span><strong>${esc(message)}</strong><p>邮件主题、正文和可能的验证码会显示在这里。</p></div>`;
    latest = null;
  }
  function setBusy(busy) {
    root.setAttribute('aria-busy', String(busy));
    $('#mail-submit').disabled = busy;
    $('#mail-account').readOnly = busy;
    $('#mail-cancel').hidden = !busy;
    $('#mail-demo').disabled = busy;
    for (const element of root.querySelectorAll('#mail-form select, #mail-keyword, #mail-body')) element.disabled = busy;
    if (!busy) clearInterval(elapsedTimer);
  }
  function showToken(token, account) {
    if (!token || !account) return;
    latest = { account, token };
    $('#mail-token-update').hidden = false;
    $('#mail-token-update').innerHTML = `<div><strong>Microsoft 返回了新的刷新令牌</strong><p>可更新当前输入，或复制新的账号行自行保存。</p></div><div><button class="button" type="button" data-mail-action="use-token">更新当前输入</button><button class="button" type="button" data-mail-action="copy-row">复制新账号行</button></div>`;
  }
  function showAttempts(attempts) {
    if (!attempts?.length) return '';
    return `<details class="mail-attempts"><summary>查看读取过程</summary><ol>${attempts.map(item => `<li><strong>${esc(item.protocol.toUpperCase())}</strong><span>${esc(item.message)}</span><code>${esc(item.code)}</code></li>`).join('')}</ol></details>`;
  }
  function messageBody(message, index) {
    const text = `<pre id="mail-text-${index}" class="mail-text-body" ${message.html ? 'hidden' : ''}>${esc(message.body || message.preview || '本次未读取正文，或此邮件没有可显示的文本。')}</pre>`;
    if (!message.html) return text;
    return `<div class="mail-render-toolbar"><div class="mail-view-switch" role="group" aria-label="正文显示方式"><button type="button" data-mail-view="html" aria-pressed="true" aria-controls="mail-html-${index}">格式化</button><button type="button" data-mail-view="text" aria-pressed="false" aria-controls="mail-text-${index}">纯文本</button></div><span>图片与外部链接已禁用</span></div><iframe id="mail-html-${index}" class="mail-html-body" title="邮件正文：${esc(message.subject)}" sandbox="" referrerpolicy="no-referrer"></iframe>${text}`;
  }
  function showResult(result, account, demo = false) {
    $('#mail-result-meta').textContent = `${demo ? '示例 · 未连接邮箱' : result.protocol.toUpperCase()} · ${result.messages.length} 封邮件`;
    const summary = demo ? '以下为虚构示例，仅展示页面效果。' : `已读取 ${result.scanned} 封${result.folder === 'junkemail' ? '垃圾邮件' : '收件箱邮件'}${result.keyword ? `，关键词匹配 ${result.messages.length} 封` : ''}。`;
    $('#mail-feedback').innerHTML = `<div class="mail-notice ${demo ? 'demo' : 'success'}">${icon('check', 17)}<div><strong>${esc(summary)}</strong>${result.warning ? `<p>${esc(result.warning)}</p>` : ''}</div></div>${showAttempts(result.attempts)}`;
    const codes = [...new Set(result.messages.flatMap(message => message.codes || []))].slice(0, 12);
    $('#mail-code-summary').innerHTML = codes.length ? `<div class="mail-codes"><div><strong>可能的验证码</strong><span>点击复制 · 请核对原文</span></div><div>${codes.map(code => `<button class="mail-code" type="button" data-mail-copy="${esc(code)}" aria-label="复制验证码 ${esc(code)}">${esc(code)} ${icon('copy', 13)}</button>`).join('')}</div></div>` : '';
    $('#mail-message-list').innerHTML = result.messages.length ? result.messages.map((message, index) => `<details class="mail-message" ${index === 0 ? 'open' : ''}><summary><span class="mail-message-index">${String(index + 1).padStart(2, '0')}</span><span class="mail-message-title"><strong>${esc(message.subject)}</strong><span>${esc(message.from)}</span></span><span class="mail-message-date">${esc(message.date && Number.isFinite(Date.parse(message.date)) ? new Date(message.date).toLocaleString('zh-CN', { hour12: false }) : '日期未知')}</span></summary><div class="mail-message-content">${message.note ? `<p class="mail-message-note">${esc(message.note)}</p>` : ''}${messageBody(message, index)}${message.codes?.length ? `<div class="message-code-row">${message.codes.map(code => `<button class="mail-code" type="button" data-mail-copy="${esc(code)}">${esc(code)} ${icon('copy', 12)}</button>`).join('')}</div>` : ''}</div></details>`).join('') : `<div class="mail-empty"><strong>${result.keyword ? '本次邮件中没有匹配的结果' : '所选文件夹暂无邮件'}</strong><p>${result.keyword ? '可清空关键词或增加读取数量后重试。' : '读取成功；可以尝试另一个文件夹。'}</p></div>`;
    result.messages.forEach((message, index) => {
      const frame = $(`#mail-html-${index}`);
      if (!frame) return;
      const details = frame.closest('details');
      const loadPreview = () => { if (details.open && !frame.hasAttribute('srcdoc')) frame.srcdoc = previewDocument(message.html); };
      details.addEventListener('toggle', loadPreview);
      loadPreview();
    });
    showToken(result.refreshedToken, account);
  }

  async function submit(event) {
    event?.preventDefault();
    if (active) return;
    empty();
    let account;
    try { account = parseAccount($('#mail-account').value); }
    catch (error) {
      $('#mail-feedback').innerHTML = `<div class="mail-notice error"><strong>${esc(error.message)}</strong></div>`;
      $('#mail-account').setAttribute('aria-invalid', 'true');
      $('#mail-account').focus();
      return;
    }
    $('#mail-account').removeAttribute('aria-invalid');
    const controller = new AbortController();
    active = controller;
    setBusy(true);
    const started = Date.now();
    $('#mail-feedback').innerHTML = '<div class="mail-notice"><span class="mail-spinner" aria-hidden="true"></span><strong>正在连接 Microsoft 并读取邮件…</strong></div>';
    const tick = () => { $('#mail-result-meta').textContent = `正在读取 · ${Math.floor((Date.now() - started) / 1000)} 秒`; };
    tick(); elapsedTimer = setInterval(tick, 1000);
    try {
      const response = await fetch('/api/outlook/read', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Daykit-Client': 'mail-reader' },
        body: JSON.stringify({ email: account.email, clientId: account.clientId, refreshToken: account.refreshToken, count: Number($('#mail-count').value), folder: $('#mail-folder').value, keyword: $('#mail-keyword').value, includeBody: $('#mail-body').checked, protocol: $('#mail-protocol').value, tenant: $('#mail-tenant').value }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000)]),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('服务暂时不可用，请稍后重试。'); }
      if (active !== controller) return;
      if (!response.ok) {
        $('#mail-result-meta').textContent = '读取未完成';
        $('#mail-feedback').innerHTML = `<div class="mail-notice error"><div><strong>${esc(result.error?.message || '读取失败，请稍后重试。')}</strong><p>${esc(result.error?.code || `HTTP ${response.status}`)} · 本次失败不代表邮箱已失效。</p></div></div>${showAttempts(result.attempts)}`;
        $('#mail-message-list').innerHTML = '';
        showToken(result.refreshedToken, account);
      } else showResult(result, account);
    } catch (error) {
      if (active !== controller) return;
      $('#mail-result-meta').textContent = '读取未完成';
      $('#mail-feedback').innerHTML = `<div class="mail-notice error"><strong>${esc(error.name === 'TimeoutError' ? '等待超时，请减少数量或稍后重试。' : '网络连接失败，请稍后重试。')}</strong></div>`;
      $('#mail-message-list').innerHTML = '';
    } finally {
      if (active === controller) { active = null; setBusy(false); }
    }
  }
  $('#mail-form').addEventListener('submit', submit);
  $('#mail-account').addEventListener('input', () => { $('#mail-account').removeAttribute('aria-invalid'); empty('账号信息已更新，点击读取。'); });
  $('#mail-account').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') submit(event); });
  function stop() { active?.abort(); active = null; setBusy(false); }
  $('#mail-cancel').addEventListener('click', () => { stop(); empty('已取消等待，可以重新读取。'); });
  $('#mail-clear').addEventListener('click', () => { stop(); $('#mail-form').reset(); $('#mail-account').removeAttribute('aria-invalid'); empty(); $('#mail-account').focus(); });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.mailView) {
      const content = button.closest('.mail-message-content');
      const formatted = button.dataset.mailView === 'html';
      content.querySelector('.mail-html-body').hidden = !formatted;
      content.querySelector('.mail-text-body').hidden = formatted;
      for (const tab of content.querySelectorAll('[data-mail-view]')) tab.setAttribute('aria-pressed', String(tab === button));
    }
    if (button.dataset.mailCopy) copy(button.dataset.mailCopy);
    if (latest && button.dataset.mailAction) {
      const row = `${latest.account.email}----${latest.account.password}----${latest.account.clientId}----${latest.token}`;
      if (button.dataset.mailAction === 'copy-row') copy(row);
      if (button.dataset.mailAction === 'use-token') { $('#mail-account').value = row; button.textContent = '已更新输入'; button.disabled = true; }
    }
  });
  $('#mail-demo').addEventListener('click', () => {
    empty();
    showResult({ protocol: 'demo', scanned: 2, folder: 'inbox', attempts: [], warning: '', refreshedToken: null, messages: [
      { id: 'demo-1', subject: '日用工具箱 · 邮箱验证示例', from: 'Daykit 示例 <demo@example.com>', date: '2026-09-25T08:30:00Z', body: '这是一封虚构的示例邮件。\n\n你的验证码是：482916\n\n有效期：10 分钟\n用途：邮箱验证\n\n真实读取后，可以切换格式化或纯文本查看邮件。', html: '<div style="max-width:560px;margin:0 auto"><p style="font-size:12px;letter-spacing:2px;color:#728368">DAYKIT / 邮箱验证</p><h1 style="font-size:25px;font-weight:600">确认你的邮箱</h1><p>这是一封虚构的示例邮件，用于预览 HTML 正文的排版效果。</p><div style="background-color:#f0f4e9;padding:20px;border-radius:8px;text-align:center"><p style="margin:0;color:#6d7b60">你的验证码</p><p style="font-size:32px;letter-spacing:6px;margin:8px 0;color:#344f3e"><strong>482916</strong></p></div><table style="width:100%;border-collapse:collapse;margin:18px 0"><tbody><tr><td style="padding:8px;color:#748269">有效期</td><td style="padding:8px;text-align:right">10 分钟</td></tr><tr><td style="padding:8px;color:#748269">用途</td><td style="padding:8px;text-align:right">邮箱验证</td></tr></tbody></table><hr><p style="font-size:12px;color:#839174">可以切换“纯文本”查看原文内容。此示例没有连接真实邮箱。</p></div>', codes: ['482916'] },
      { id: 'demo-2', subject: '欢迎使用邮件读取工具', from: 'Daykit 示例 <welcome@example.com>', date: '2026-09-25T07:00:00Z', body: '粘贴你自己的账号信息，再点击“读取邮件”验证连接。此示例没有连接任何真实邮箱。', codes: [] },
    ] }, null, true);
  });
  empty();
}
