const fallbackEscapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const PRESETS = [
  ['每 5 分钟', '*/5 * * * *'], ['每小时', '0 * * * *'], ['每天 09:00', '0 9 * * *'],
  ['工作日 09:00', '0 9 * * MON-FRI'], ['每月 1 日', '0 0 1 * *'], ['每周日', '0 0 * * SUN'],
];

export function initCron(root, { copy = () => {}, icon = () => '', escapeHTML = fallbackEscapeHTML } = {}) {
  const esc = escapeHTML;
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const $ = selector => root.querySelector(selector);
  const zones = `<option value="UTC">UTC</option><option value="Asia/Shanghai">北京时间 · Asia/Shanghai</option>${!['UTC', 'Asia/Shanghai'].includes(localZone) ? `<option value="${esc(localZone)}">本地 · ${esc(localZone)}</option>` : ''}<option value="America/New_York">纽约 · America/New_York</option><option value="Europe/London">伦敦 · Europe/London</option><option value="custom">自定义 IANA 时区</option>`;
  root.innerHTML = `<form id="cron-form" class="cron-form" autocomplete="off">
    <div class="cron-section-label"><span>01 / 定时规则</span><span class="cron-badge">五字段 · 分钟级</span></div>
    <label class="cron-label" for="cron-expression">Cron 表达式 <span>MINUTE · HOUR · DAY · MONTH · WEEKDAY</span></label>
    <div class="cron-expression-row"><input class="field-input" id="cron-expression" value="*/5 * * * *" maxlength="256" spellcheck="false" autocapitalize="off" aria-describedby="cron-syntax-hint cron-feedback"><button type="button" class="button" id="cron-copy-expression" aria-label="复制 Cron 表达式">${icon('copy', 16)} 复制</button></div>
    <div class="cron-presets" aria-label="常见 Cron 预设">${PRESETS.map(([name, value]) => `<button type="button" class="cron-preset" data-cron-preset="${esc(value)}">${name}</button>`).join('')}</div>
    <div class="cron-settings">
      <label class="cron-label" for="cron-mode">语法模式<select id="cron-mode" class="field-input"><option value="unix">Unix 五字段 · 日期 / 星期 OR</option><option value="cloudflare">Cloudflare · 基础子集</option></select></label>
      <label class="cron-label" for="cron-zone">规则执行时区<select id="cron-zone" class="field-input">${zones}</select><input id="cron-custom-zone" class="field-input" aria-label="自定义规则执行时区" placeholder="例如 Asia/Tokyo" spellcheck="false" hidden></label>
      <label class="cron-label" for="cron-display-zone">结果显示时区<select id="cron-display-zone" class="field-input">${zones}</select><input id="cron-custom-display-zone" class="field-input" aria-label="自定义结果显示时区" placeholder="例如 Asia/Tokyo" spellcheck="false" hidden></label>
      <label class="cron-label" for="cron-from">开始时间（UTC）<input id="cron-from" class="field-input" type="datetime-local" step="1" min="1900-01-01T00:00:00" max="9900-12-31T23:59:59" required aria-describedby="cron-from-hint"></label>
    </div>
    <p class="cron-hint" id="cron-from-hint">预览严格晚于开始时间的 10 次执行。开始时间始终填写 UTC，不受上方时区选择影响。</p>
    <p class="cron-hint" id="cron-syntax-hint"></p>
    <div class="cron-actions"><button type="submit" class="button primary" id="cron-run">预览执行时间 ${icon('arrow', 16)}</button><button type="button" class="button" id="cron-now">从现在开始</button><span class="cron-local-note">本机时区：${esc(localZone)}</span></div>
  </form>
  <div id="cron-feedback" role="status" aria-live="polite"></div>
  <section class="cron-results" id="cron-results" hidden aria-labelledby="cron-result-title">
    <div class="cron-description"><span class="cron-section-label">02 / 规则解释</span><h2 id="cron-description"></h2><p id="cron-description-note"></p></div>
    <div id="cron-fields" class="cron-fields"></div>
    <div class="cron-results-heading"><div><h2 id="cron-result-title">未来执行时间</h2><p id="cron-result-meta"></p></div><button class="button" type="button" id="cron-copy-results">${icon('copy', 15)} 复制时间</button></div>
    <p class="cron-swipe-hint">左右滑动表格，可查看对应时区的时间。</p><div class="cron-table-wrap"><table class="cron-table"><thead><tr><th scope="col">序号</th><th scope="col" id="cron-scheduled-title">执行时区</th><th scope="col" id="cron-display-title">显示时区</th></tr></thead><tbody id="cron-runs"></tbody></table></div>
    <p class="cron-hint" id="cron-limit-note"></p>
  </section>
  <details class="cron-reference"><summary>语法、Cloudflare 与夏令时说明</summary><div>
    <p><code>*</code> 表示所有值；<code>,</code> 列出多个值；<code>-</code> 表示范围；<code>/</code> 表示步长，例如 <code>*/15</code> 对应第 0、15、30、45 分钟。这里只支持 5 个字段，不支持秒、年份、@daily 等别名及 L、W、#、?、H 扩展。</p>
    <p>Unix 模式：周日为 0 或 7，周一为 1。日期与星期均不是 <code>*</code> 时，满足任意一个条件即可执行（OR）。此处采用 cron-parser 的解释规则，具体任务平台可能使用不同方言。</p>
    <p>Cloudflare 基础模式：按 UTC 执行，周日为 1、周六为 7；建议使用 SUN、MON 等缩写。此模式暂不支持同时限制日期和星期，也不支持 Cloudflare 完整语法中的 L / W / #。切换模式会保留输入，并按新方言重新解释。</p>
    <p>夏令时按 cron-parser 计算。固定的每日时间遇到春季跳时可能顺延，秋季重复时间通常只取首次；每小时任务可能覆盖两个 UTC 时刻。请核对表格中的 UTC 偏移，并以实际调度器为准。计算在线程内执行，超过 3 秒停止，最多搜索未来 50 年。</p>
    <p><a href="https://developers.cloudflare.com/workers/configuration/cron-triggers/" target="_blank" rel="noopener noreferrer">Cloudflare Cron 官方文档 ↗</a> · <a href="https://github.com/harrisiirak/cron-parser" target="_blank" rel="noopener noreferrer">cron-parser 语义 ↗</a></p>
  </div></details>`;
  $('#cron-display-zone').value = 'Asia/Shanghai';
  let worker = null;
  let deadline = 0;
  let debounce = 0;
  let result = null;

  function stop() {
    clearTimeout(deadline);
    clearTimeout(debounce);
    worker?.terminate();
    worker = null;
    root.setAttribute('aria-busy', 'false');
  }
  function feedback(message, error = false) {
    $('#cron-feedback').textContent = message;
    $('#cron-feedback').className = error ? 'error' : '';
    $('#cron-expression').setAttribute('aria-invalid', error ? 'true' : 'false');
  }
  function resetResults() { result = null; $('#cron-results').hidden = true; }
  function showResult(value) {
    result = value;
    $('#cron-results').hidden = false;
    $('#cron-description').textContent = value.description;
    $('#cron-description-note').textContent = `按 ${value.timeZone} 执行${value.dayOr ? ' · 日期与星期满足其一即可' : ''}${value.mode === 'cloudflare' ? ' · Cloudflare 基础子集' : ' · Unix 五字段'}`;
    $('#cron-fields').innerHTML = value.fields.map(field => `<div class="cron-field"><span>${esc(field.name)}</span><code>${esc(field.value)}</code><small>${esc(field.range)}</small></div>`).join('');
    $('#cron-result-meta').textContent = `开始于 ${value.from.replace('T', ' ').replace('.000Z', ' UTC')} 之后 · ${value.runs.length} 次`;
    $('#cron-scheduled-title').textContent = `规则时间 · ${value.timeZone}`;
    $('#cron-display-title').textContent = `对应时间 · ${value.displayTimeZone}`;
    $('#cron-runs').innerHTML = value.runs.map((run, index) => `<tr><td>${String(index + 1).padStart(2, '0')}</td><td><time datetime="${esc(run.iso)}">${esc(run.scheduled)}</time></td><td><time datetime="${esc(run.iso)}">${esc(run.display)}</time></td></tr>`).join('') || '<tr><td colspan="3" class="cron-no-runs">搜索范围内未找到执行时间。</td></tr>';
    $('#cron-limit-note').textContent = value.notice;
    $('#cron-copy-results').disabled = !value.runs.length;
    feedback(value.notice);
  }
  function zone(select, custom) { return $(select).value === 'custom' ? $(custom).value.trim() : $(select).value; }
  function updateMode() {
    const cloudflare = $('#cron-mode').value === 'cloudflare';
    if (cloudflare) $('#cron-zone').value = 'UTC';
    $('#cron-zone').disabled = cloudflare;
    $('#cron-custom-zone').hidden = $('#cron-zone').value !== 'custom';
    $('#cron-custom-display-zone').hidden = $('#cron-display-zone').value !== 'custom';
    $('#cron-syntax-hint').textContent = cloudflare ? 'Cloudflare 基础子集：星期 1 = 周日，7 = 周六；执行时区固定 UTC。不支持 L / W / # 扩展，也不支持同时限制日期和星期。' : 'Unix 五字段：星期 0 / 7 = 周日，1 = 周一；日期与星期均受限时按 OR 匹配。支持 * , - / 与 JAN、MON 等缩写。';
  }
  function run() {
    stop();
    resetResults();
    updateMode();
    feedback('正在计算…');
    const from = $('#cron-from').value;
    if (!from) { feedback('请填写开始时间（UTC）。', true); return; }
    root.setAttribute('aria-busy', 'true');
    try {
      const url = typeof __CRON_WORKER_URL__ === 'string' ? __CRON_WORKER_URL__ : '/cron-core.mjs';
      const active = new Worker(url, { type: 'module' });
      worker = active;
      deadline = setTimeout(() => { if (worker === active) { stop(); feedback('计算超过 3 秒，已自动停止。请简化表达式后重试。', true); } }, 3000);
      active.onmessage = event => {
        if (worker !== active) return;
        stop();
        if (event.data.error) feedback(event.data.error, true);
        else showResult(event.data.result);
      };
      active.onerror = event => {
        if (worker !== active) return;
        event.preventDefault();
        stop();
        feedback('计算线程加载失败，请刷新后重试。', true);
      };
      active.postMessage({ expression: $('#cron-expression').value, options: { mode: $('#cron-mode').value, timeZone: zone('#cron-zone', '#cron-custom-zone'), displayTimeZone: zone('#cron-display-zone', '#cron-custom-display-zone'), from: `${from}Z` } });
    } catch { stop(); feedback('浏览器无法启动计算线程，请使用支持 Web Worker 的现代浏览器。', true); }
  }
  function now() { $('#cron-from').value = new Date().toISOString().slice(0, 19); }
  $('#cron-form').addEventListener('submit', event => { event.preventDefault(); run(); });
  $('#cron-form').addEventListener('input', event => {
    if (event.target.tagName === 'SELECT') return;
    stop(); resetResults(); feedback('输入已更新，正在准备计算…');
    debounce = setTimeout(run, 300);
  });
  for (const id of ['#cron-mode', '#cron-zone', '#cron-display-zone']) $(id).addEventListener('change', run);
  $('#cron-now').addEventListener('click', () => { now(); run(); });
  $('#cron-copy-expression').addEventListener('click', () => { if ($('#cron-expression').value.trim()) Promise.resolve(copy($('#cron-expression').value.trim())).catch(() => {}); });
  $('#cron-copy-results').addEventListener('click', () => {
    if (result) Promise.resolve(copy([`UTC\t${result.timeZone}\t${result.displayTimeZone}`, ...result.runs.map(value => `${value.iso}\t${value.scheduled}\t${value.display}`)].join('\n'))).catch(() => {});
  });
  root.addEventListener('click', event => { const preset = event.target.closest('[data-cron-preset]'); if (preset) { $('#cron-expression').value = preset.dataset.cronPreset; run(); } });
  window.addEventListener('pagehide', stop);
  now(); run();
}
