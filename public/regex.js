const MAX_PATTERN_LENGTH = 4096;
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_MATCHES = 1_000;
const MAX_DETAILS = 200;
const MAX_CAPTURE_GROUPS = 64;
const MAX_RESULT_CHARACTERS = 2_000_000;
const COMMON_FLAGS = 'dgimsuvy';

const fallbackEscapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function captureCount(source) {
  let count = 0;
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source[index] === '[') { inClass = true; continue; }
    if (source[index] === ']' && inClass) { inClass = false; continue; }
    if (inClass || source[index] !== '(') continue;
    if (source[index + 1] !== '?') { count += 1; continue; }
    if (source[index + 2] === '<' && source[index + 3] !== '=' && source[index + 3] !== '!') count += 1;
  }
  return count;
}

function validateInput(source, flags, text) {
  if (!source) throw new Error('请输入正则表达式。');
  if (source.length > MAX_PATTERN_LENGTH) throw new Error(`正则表达式过长，请控制在 ${MAX_PATTERN_LENGTH.toLocaleString()} 个字符以内。`);
  if (text.length > MAX_TEXT_LENGTH) throw new Error('测试文本过长，请控制在 1,000,000 个字符以内。');
  if (!/^[dgimsuvy]*$/.test(flags)) throw new Error(`flags 只支持常见选项：${COMMON_FLAGS.split('').join('、')}。`);
  if (new Set(flags).size !== flags.length) throw new Error('flags 不能重复。');
  if (flags.includes('u') && flags.includes('v')) throw new Error('flags 中 u 与 v 不能同时启用。');
}

function advanceStringIndex(text, index, unicode) {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
}

function addMatch(matches, match, budget) {
  if (match.length - 1 > MAX_CAPTURE_GROUPS) throw new Error('捕获组超过 64 个，请减少捕获组或使用非捕获组 (?:...)。');
  budget.characters += [...match, ...Object.values(match.groups || {})].reduce((total, value) => total + (value?.length || 0), 0);
  if (budget.characters > MAX_RESULT_CHARACTERS) throw new Error('匹配结果过大，请缩短测试文本或减少捕获组。');
  const indices = match.indices || null;
  matches.push({
    value: match[0],
    index: match.index,
    end: match.index + match[0].length,
    groups: match.slice(1),
    namedGroups: match.groups ? { ...match.groups } : {},
    groupIndices: indices ? indices.slice(1) : [],
    namedGroupIndices: indices?.groups ? { ...indices.groups } : {},
  });
}

// Untrusted expressions must run in a terminable worker; no heuristic can
// reliably detect every expensive JavaScript regular expression.
export function evaluateRegex(source, flags = '', text = '') {
  source = String(source ?? '');
  flags = String(flags ?? '').trim();
  text = String(text ?? '');
  validateInput(source, flags, text);
  let regex;
  try { regex = new RegExp(source, flags); }
  catch (error) { throw new Error(`正则表达式无效：${error.message.replace(/^Invalid regular expression:\s*/i, '')}`); }

  const matches = [];
  const budget = { characters: 0 };
  const globalish = regex.global || regex.sticky;
  if (globalish) {
    while (matches.length < MAX_MATCHES) {
      const match = regex.exec(text);
      if (!match) break;
      addMatch(matches, match, budget);
      if (match[0] === '') {
        const nextIndex = advanceStringIndex(text, regex.lastIndex, regex.unicode || regex.unicodeSets);
        if (nextIndex > text.length) break;
        regex.lastIndex = nextIndex;
      }
    }
  } else {
    const match = regex.exec(text);
    if (match) addMatch(matches, match, budget);
  }
  return {
    source,
    flags,
    text,
    matches,
    matchCount: matches.length,
    captureCount: matches[0]?.groups.length ?? captureCount(source),
    truncated: matches.length === MAX_MATCHES,
  };
}

function highlightText(text, matches, esc) {
  if (!text) return '<span class="regex-highlight-empty">输入测试文本后，匹配结果会在这里高亮。</span>';
  let output = '';
  let cursor = 0;
  for (const match of matches) {
    if (match.index < cursor) continue;
    output += esc(text.slice(cursor, match.index));
    if (match.value) output += `<mark>${esc(match.value)}</mark>`;
    else output += '<mark class="regex-empty-match" aria-label="空匹配">∅</mark>';
    cursor = match.end;
  }
  output += esc(text.slice(cursor));
  return output;
}

function matchMarkup(match, number, esc, icon) {
  const groups = match.groups.map((value, index) => `<div class="regex-group"><span class="regex-group-label">$${index + 1}</span><code>${value === undefined ? '<span class="regex-unmatched">未参与匹配</span>' : esc(value) || '<span class="regex-empty-value">空字符串</span>'}</code></div>`).join('');
  const named = Object.entries(match.namedGroups).map(([name, value]) => `<div class="regex-group"><span class="regex-group-label">${esc(name)}</span><code>${value === undefined ? '<span class="regex-unmatched">未参与匹配</span>' : esc(value) || '<span class="regex-empty-value">空字符串</span>'}</code></div>`).join('');
  return `<article class="regex-match" data-match-index="${number - 1}"><header class="regex-match-heading"><span class="regex-match-number">${String(number).padStart(2, '0')}</span><code class="regex-match-value">${match.value ? esc(match.value) : '<span class="regex-empty-value">空匹配</span>'}</code><span class="regex-match-index">索引 ${match.index}</span><button type="button" class="icon-button" data-regex-copy="${esc(match.value)}" aria-label="复制第 ${number} 个匹配">${icon('copy', 15)}</button></header><div class="regex-match-groups">${groups || named ? `<div class="regex-groups-title">捕获组</div>${groups}${named}` : '<span class="regex-no-groups">没有捕获组</span>'}</div></article>`;
}

export function initRegex(root, { copy = () => {}, icon = () => '', escapeHTML = fallbackEscapeHTML } = {}) {
  if (!root) throw new Error('正则工具需要一个挂载节点。');
  const esc = typeof escapeHTML === 'function' ? escapeHTML : fallbackEscapeHTML;
  const iconMarkup = typeof icon === 'function' ? icon : () => '';
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form id="regex-form" class="regex-form" autocomplete="off"><div class="regex-section-label"><span>01 / 表达式与测试文本</span><span class="regex-badge">JavaScript RegExp</span></div><div class="regex-settings"><label class="regex-label" for="regex-pattern">正则表达式 <span>PATTERN</span><input id="regex-pattern" class="field-input" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="例如 \\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b" aria-describedby="regex-pattern-hint"></label><label class="regex-label" for="regex-flags">Flags <span>FLAGS</span><input id="regex-flags" class="field-input regex-flags-input" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="8" placeholder="gim" aria-describedby="regex-pattern-hint"></label></div><p class="regex-hint" id="regex-pattern-hint">支持 ${COMMON_FLAGS.split('').map(flag => `<button type="button" class="regex-flag" data-regex-flag="${flag}" aria-pressed="false" aria-label="切换 ${flag} flag"><code>${flag}</code></button>`).join('')}；通常使用 <code>g</code> 查找全部匹配。</p><label class="regex-label regex-text-label" for="regex-text">测试文本 <span>TEST TEXT</span></label><textarea id="regex-text" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="在这里粘贴需要检查的文本…" aria-describedby="regex-text-hint"></textarea><div class="regex-input-footer"><span id="regex-text-hint">本地运行 · 最多 1,000,000 个字符</span><span id="regex-text-count">0 字符</span></div><div class="regex-actions"><button class="button primary" type="submit" id="regex-run">运行匹配 ${iconMarkup('arrow', 16)}</button><button class="button" type="button" id="regex-sample">填入示例</button><button class="button quiet" type="button" id="regex-clear">清空</button><span class="regex-shortcut">实时匹配 · <kbd>⌘</kbd> + <kbd>Enter</kbd> 立即运行</span></div></form><section class="regex-results" aria-labelledby="regex-result-title"><div class="regex-results-heading"><h2 id="regex-result-title">匹配结果</h2><span id="regex-result-meta">等待输入</span></div><div id="regex-feedback" role="status" aria-live="polite"></div><div class="regex-summary" id="regex-summary" hidden></div><section class="regex-highlight-panel" aria-labelledby="regex-highlight-title"><div class="regex-panel-heading"><h3 id="regex-highlight-title">文本高亮</h3><span>SAFE PREVIEW</span></div><pre id="regex-highlight" class="regex-highlight"><span class="regex-highlight-empty">输入测试文本后，匹配结果会在这里高亮。</span></pre></section><section class="regex-match-list" aria-labelledby="regex-match-list-title"><div class="regex-panel-heading"><h3 id="regex-match-list-title">匹配详情</h3><span id="regex-match-count">0 项</span></div><div id="regex-matches"><div class="regex-empty"><strong>还没有匹配结果</strong><p>输入表达式和测试文本后，结果会实时显示。</p></div></div></section></section>`;

  const patternInput = $('#regex-pattern');
  const flagsInput = $('#regex-flags');
  const textInput = $('#regex-text');
  let liveTimer = 0;
  let activeWorker = null;
  let timeoutTimer = 0;

  function updateCount() { $('#regex-text-count').textContent = `${textInput.value.length.toLocaleString()} 字符`; }
  function setFeedback(message = '', error = false) {
    const node = $('#regex-feedback');
    node.textContent = message;
    node.className = error ? 'error' : '';
  }
  function emptyState(message = '输入表达式和测试文本后，结果会实时显示。') {
    $('#regex-summary').hidden = true;
    $('#regex-result-meta').textContent = '等待输入';
    $('#regex-match-count').textContent = '0 项';
    $('#regex-highlight').innerHTML = '<span class="regex-highlight-empty">输入测试文本后，匹配结果会在这里高亮。</span>';
    $('#regex-matches').innerHTML = `<div class="regex-empty"><strong>${esc(message)}</strong><p>结果仅在当前浏览器中处理。</p></div>`;
  }
  function cancelRun() {
    clearTimeout(liveTimer);
    clearTimeout(timeoutTimer);
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
    root.setAttribute('aria-busy', 'false');
  }
  function showError(message) {
    emptyState('表达式暂时无法运行');
    setFeedback(message, true);
    if (/flags/i.test(message)) flagsInput.setAttribute('aria-invalid', 'true');
    else if (message.startsWith('测试文本')) textInput.setAttribute('aria-invalid', 'true');
    else patternInput.setAttribute('aria-invalid', 'true');
  }
  function showResult(result, text) {
    const matchWord = `${result.truncated ? '至少 ' : ''}${result.matchCount.toLocaleString()} 个匹配`;
    const shown = result.matches.slice(0, MAX_DETAILS);
    $('#regex-result-meta').textContent = result.truncated ? `${matchWord} · 已达上限` : matchWord;
    $('#regex-match-count').textContent = result.matchCount > MAX_DETAILS ? `前 ${MAX_DETAILS} / ${result.matchCount.toLocaleString()} 项` : `${result.matchCount.toLocaleString()} 项`;
    $('#regex-summary').hidden = false;
    $('#regex-summary').innerHTML = `<span><strong>${matchWord}</strong></span><span>${result.captureCount} 个捕获组</span><span>${text.length.toLocaleString()} 个字符</span>`;
    $('#regex-highlight').innerHTML = highlightText(text, result.matches, esc);
    $('#regex-matches').innerHTML = shown.length ? shown.map((match, index) => matchMarkup(match, index + 1, esc, iconMarkup)).join('') : '<div class="regex-empty"><strong>没有匹配</strong><p>调整表达式、flags 或测试文本后重试。</p></div>';
    setFeedback(result.truncated ? `已达到 ${MAX_MATCHES.toLocaleString()} 个匹配的运行上限，高亮仅显示这些匹配；详情展示前 ${MAX_DETAILS} 项。` : result.matchCount > MAX_DETAILS ? `匹配完成；详情展示前 ${MAX_DETAILS} 项。` : '匹配完成。');
  }
  function run() {
    cancelRun();
    updateCount();
    for (const input of [patternInput, flagsInput, textInput]) input.removeAttribute('aria-invalid');
    const source = patternInput.value;
    const flags = flagsInput.value.trim();
    const text = textInput.value;
    for (const button of root.querySelectorAll('[data-regex-flag]')) button.setAttribute('aria-pressed', String(flags.includes(button.dataset.regexFlag)));
    try { validateInput(source, flags, text); }
    catch (error) { showError(error.message); return; }
    emptyState('正在匹配…');
    $('#regex-result-meta').textContent = '正在匹配';
    setFeedback('');
    root.setAttribute('aria-busy', 'true');
    try {
      const workerURL = typeof __REGEX_WORKER_URL__ === 'string' ? __REGEX_WORKER_URL__ : '/regex-worker.js';
      const worker = new Worker(workerURL, { type: 'module' });
      activeWorker = worker;
      timeoutTimer = setTimeout(() => {
        if (activeWorker !== worker) return;
        cancelRun();
        showError('匹配超过 1 秒，已自动停止。请简化表达式或减少测试文本后重试。');
      }, 1000);
      worker.onmessage = event => {
        if (activeWorker !== worker) return;
        cancelRun();
        if (event.data.error) showError(event.data.error);
        else showResult(event.data.result, text);
      };
      worker.onerror = event => {
        if (activeWorker !== worker) return;
        event.preventDefault();
        cancelRun();
        showError('匹配线程加载失败，请刷新页面重试。');
      };
      worker.postMessage({ source, flags, text });
    } catch {
      cancelRun();
      showError('浏览器无法启动匹配线程，请使用支持 Web Worker 的现代浏览器。');
    }
  }
  function scheduleRun() {
    cancelRun();
    updateCount();
    emptyState('输入已更新，正在准备匹配…');
    setFeedback('');
    liveTimer = setTimeout(run, 180);
  }

  $('#regex-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(liveTimer); run(); });
  [patternInput, flagsInput, textInput].forEach(input => input.addEventListener('input', scheduleRun));
  [patternInput, flagsInput, textInput].forEach(input => input.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); clearTimeout(liveTimer); run(); }
  }));
  $('#regex-sample').addEventListener('click', () => { patternInput.value = '(?<name>[A-Z][a-z]+ [A-Z][a-z]+) (?<year>\\d{4})'; flagsInput.value = 'g'; textInput.value = 'Ada Lovelace 1815\nGrace Hopper 1906'; run(); });
  $('#regex-clear').addEventListener('click', () => { cancelRun(); patternInput.value = ''; flagsInput.value = ''; textInput.value = ''; setFeedback(''); patternInput.removeAttribute('aria-invalid'); flagsInput.removeAttribute('aria-invalid'); textInput.removeAttribute('aria-invalid'); updateCount(); emptyState(); for (const button of root.querySelectorAll('[data-regex-flag]')) button.setAttribute('aria-pressed', 'false'); patternInput.focus(); });
  root.addEventListener('click', event => {
    const flag = event.target.closest('[data-regex-flag]');
    if (flag) {
      const value = flag.dataset.regexFlag;
      const current = flagsInput.value;
      flagsInput.value = current.includes(value) ? current.replace(value, '') : `${current}${value}`;
      run();
      return;
    }
    const copyButton = event.target.closest('[data-regex-copy]');
    if (copyButton) Promise.resolve(copy(copyButton.dataset.regexCopy)).catch(() => {});
  });
  window.addEventListener('pagehide', cancelRun);
  updateCount();
  emptyState();
}
