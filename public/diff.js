const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder();

// ponytail: line based LCS keeps the implementation dependency free; the input caps
// are the guardrail until a streaming or patience diff is needed.
export const MAX_DIFF_BYTES = 1024 * 1024;
export const MAX_DIFF_LINES = 2000;

const byteLength = value => encoder ? encoder.encode(value).length : new Blob([value]).size;

export function splitDiffLines(value) {
  const text = String(value ?? '');
  return text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n');
}

export function normalizeDiffLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function validateInput(value, label) {
  const text = String(value ?? '');
  if (byteLength(text) > MAX_DIFF_BYTES) {
    const error = new Error(`${label}超过 ${Math.round(MAX_DIFF_BYTES / 1024)} KB，请缩小内容后再比较。`);
    error.code = 'DIFF_SIZE';
    throw error;
  }
  const lines = splitDiffLines(text);
  if (lines.length > MAX_DIFF_LINES) {
    const error = new Error(`${label}超过 ${MAX_DIFF_LINES.toLocaleString('zh-CN')} 行，请缩小内容后再比较。`);
    error.code = 'DIFF_LINES';
    throw error;
  }
  return { text, lines };
}

/** Compare two strings by lines and return rows suitable for display. */
export function diffText(left, right, { ignoreWhitespace = false } = {}) {
  const source = validateInput(left, '左侧内容');
  const target = validateInput(right, '右侧内容');
  const leftKeys = source.lines.map(line => ignoreWhitespace ? normalizeDiffLine(line) : line);
  const rightKeys = target.lines.map(line => ignoreWhitespace ? normalizeDiffLine(line) : line);
  const n = leftKeys.length;
  const m = rightKeys.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i--) {
    const row = table[i];
    const next = table[i + 1];
    for (let j = m - 1; j >= 0; j--) row[j] = leftKeys[i] === rightKeys[j] ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && leftKeys[i] === rightKeys[j]) {
      rows.push({ type: 'unchanged', leftLine: i + 1, rightLine: j + 1, left: source.lines[i], right: target.lines[j], text: source.lines[i] });
      i++; j++;
    } else if (j === m || (i < n && table[i + 1][j] >= table[i][j + 1])) {
      rows.push({ type: 'removed', leftLine: i + 1, rightLine: null, left: source.lines[i], right: '', text: source.lines[i] });
      i++;
    } else {
      rows.push({ type: 'added', leftLine: null, rightLine: j + 1, left: '', right: target.lines[j], text: target.lines[j] });
      j++;
    }
  }
  const counts = rows.reduce((result, row) => { result[row.type]++; return result; }, { added: 0, removed: 0, unchanged: 0 });
  return { rows, counts, leftLines: source.lines, rightLines: target.lines, leftBytes: byteLength(source.text), rightBytes: byteLength(target.text) };
}

export const compareText = diffText;

export function initDiff(root, { copy = async () => {}, icon = () => '', escapeHTML: escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])) } = {}) {
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form class="diff-form" id="diff-form" autocomplete="off">
    <div class="diff-form-heading"><div><span class="diff-overline">01 / 文本比较</span><h2>比较两段内容</h2></div><span class="diff-limit">本地处理 · 最多 ${MAX_DIFF_LINES.toLocaleString('zh-CN')} 行</span></div>
    <div class="diff-options"><label class="diff-checkbox" title="合并连续空白，并忽略每行开头和结尾的空白"><input id="diff-ignore-whitespace" type="checkbox"><span>忽略空白差异</span></label><span class="diff-option-hint">合并连续空白，忽略行首行尾空白</span><button class="text-button" type="button" data-diff-action="sample">填入示例</button><button class="text-button" type="button" data-diff-action="clear">清空</button></div>
    <div class="diff-editor-grid"><section class="diff-editor-pane"><div class="diff-pane-heading"><label for="diff-left">原始内容 <span>BEFORE</span></label><span id="diff-left-stats">0 行 · 0 B</span></div><textarea id="diff-left" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="粘贴第一段文本…" aria-describedby="diff-left-stats"></textarea></section><section class="diff-editor-pane"><div class="diff-pane-heading"><label for="diff-right">修改内容 <span>AFTER</span></label><span id="diff-right-stats">0 行 · 0 B</span></div><textarea id="diff-right" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="粘贴第二段文本…" aria-describedby="diff-right-stats"></textarea></section></div>
    <div class="diff-action-bar"><button class="button primary" id="diff-submit" type="submit">比较差异 ${icon('arrow', 16)}</button><span class="shortcut-note"><kbd>⌘</kbd> + <kbd>Enter</kbd> 比较</span></div><p class="feedback" id="diff-feedback" role="status" aria-live="polite"></p>
  </form>
  <section class="diff-results" aria-labelledby="diff-result-title"><div class="diff-results-heading"><div><span class="diff-overline">02 / 比较结果</span><h2 id="diff-result-title">逐行差异</h2></div><div class="diff-result-actions"><span id="diff-result-meta">等待比较</span><button class="text-button" type="button" data-diff-action="copy" disabled>${icon('copy', 14)} 复制结果</button></div></div><div id="diff-result" class="diff-result" aria-live="polite"><div class="diff-empty">输入两段文本后，差异会显示在这里。</div></div></section>`;

  const setFeedback = (message = '', error = false) => {
    const feedback = $('#diff-feedback');
    feedback.textContent = message;
    feedback.classList.toggle('error', error);
  };
  const updateStats = () => {
    for (const [id, value] of [['left', $('#diff-left').value], ['right', $('#diff-right').value]]) {
      $(`#diff-${id}-stats`).textContent = `${splitDiffLines(value).length} 行 · ${byteLength(value).toLocaleString('zh-CN')} B`;
    }
  };
  let latest = null;
  const render = result => {
    const { rows, counts } = result;
    $('#diff-result-meta').textContent = `${counts.added} 新增 · ${counts.removed} 删除 · ${counts.unchanged} 未变`;
    $('#diff-result').innerHTML = rows.length ? `<div class="diff-legend"><span class="diff-legend-added">+ 新增 ${counts.added}</span><span class="diff-legend-removed">− 删除 ${counts.removed}</span><span>· 未变 ${counts.unchanged}</span></div><div class="diff-table" role="table" aria-label="文本差异">${rows.map(row => `<div class="diff-row ${row.type}" role="row"><span class="diff-marker" aria-hidden="true">${row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}</span><span class="diff-line-number">${row.leftLine || ''}</span><span class="diff-line-number">${row.rightLine || ''}</span><code role="cell">${escape(row.text || ' ')}</code></div>`).join('')}</div>` : '<div class="diff-empty">两段内容为空，没有可显示的差异。</div>';
    $('[data-diff-action="copy"]').disabled = false;
  };
  const compare = () => {
    const left = $('#diff-left');
    const right = $('#diff-right');
    left.removeAttribute('aria-invalid'); right.removeAttribute('aria-invalid');
    try {
      latest = diffText(left.value, right.value, { ignoreWhitespace: $('#diff-ignore-whitespace').checked });
      render(latest); setFeedback('比较完成。');
    } catch (error) {
      latest = null; $('#diff-result-meta').textContent = '等待比较'; $('[data-diff-action="copy"]').disabled = true;
      $('#diff-result').innerHTML = '<div class="diff-empty">输入内容过大，暂时无法比较。</div>';
      if (error.code === 'DIFF_SIZE' || error.code === 'DIFF_LINES') { const target = error.message.startsWith('右侧') ? right : left; target.setAttribute('aria-invalid', 'true'); }
      setFeedback(error.message || '比较失败，请检查输入。', true);
    }
  };
  const sample = () => { $('#diff-left').value = 'name: Daykit\nversion: 1.0\nmode: local'; $('#diff-right').value = 'name: Daykit\nversion: 1.1\nmode: local\ncache: enabled'; updateStats(); compare(); };
  root.addEventListener('submit', event => { event.preventDefault(); compare(); });
  root.addEventListener('input', event => { if (event.target.matches('textarea')) { updateStats(); event.target.removeAttribute('aria-invalid'); setFeedback(''); latest = null; $('[data-diff-action="copy"]').disabled = true; $('#diff-result-meta').textContent = '输入已更新'; $('#diff-result').innerHTML = '<div class="diff-empty">输入已更新，请重新比较。</div>'; } });
  root.addEventListener('change', event => { if (event.target.id === 'diff-ignore-whitespace') compare(); });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-diff-action]');
    if (!button) return;
    const action = button.dataset.diffAction;
    if (action === 'compare') compare();
    if (action === 'sample') sample();
    if (action === 'clear') { $('#diff-left').value = ''; $('#diff-right').value = ''; latest = null; $('#diff-left').removeAttribute('aria-invalid'); $('#diff-right').removeAttribute('aria-invalid'); updateStats(); setFeedback(''); $('#diff-result-meta').textContent = '等待比较'; $('#diff-result').innerHTML = '<div class="diff-empty">输入两段文本后，差异会显示在这里。</div>'; $('[data-diff-action="copy"]').disabled = true; }
    if (action === 'copy' && latest) { const text = latest.rows.map(row => `${row.type === 'added' ? '+' : row.type === 'removed' ? '-' : ' '} ${row.text}`).join('\n'); Promise.resolve(copy(text)).catch(() => setFeedback('复制失败，请手动选择结果。', true)); }
  });
  root.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); compare(); } });
  updateStats();
}
