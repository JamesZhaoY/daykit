import { CONFIG_FORMATS, MAX_CONFIG_LENGTH, convertConfig } from './config-core.mjs';

const EXAMPLES = {
  json: '{\n  "name": "日用 Daykit",\n  "port": 8787,\n  "enabled": true,\n  "tags": ["开发", "工具"],\n  "server": {\n    "host": "localhost",\n    "timeout": 2.5\n  }\n}',
  yaml: '# 本地开发配置\nname: 日用 Daykit\nport: 8787\nenabled: true\ntags:\n  - 开发\n  - 工具\nserver:\n  host: localhost\n  timeout: 2.5\n',
  toml: '# 本地开发配置\nname = "日用 Daykit"\nport = 8787\nenabled = true\ntags = ["开发", "工具"]\n\n[server]\nhost = "localhost"\ntimeout = 2.5\n',
};

export function initConfig(root, { copy = () => {}, icon = () => '' } = {}) {
  const options = selected => CONFIG_FORMATS.map(format => `<option value="${format}"${format === selected ? ' selected' : ''}>${format.toUpperCase()}</option>`).join('');
  root.innerHTML = `<form id="config-form" class="config-form" autocomplete="off">
    <div class="config-controls"><label for="config-source">源格式<select id="config-source">${options('json')}</select></label><button class="button quiet config-swap" type="button" id="config-swap" aria-label="交换转换方向">${icon('swap', 16)} 交换方向</button><label for="config-target">目标格式<select id="config-target">${options('yaml')}</select></label><span class="config-local">浏览器本地处理</span></div>
    <div class="config-editors"><section class="config-panel"><div class="config-panel-heading"><label for="config-input">输入配置</label><span id="config-input-meta">JSON · 0 字符</span></div><textarea id="config-input" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="config-semantics" placeholder="在这里粘贴 JSON 配置…"></textarea></section><section class="config-panel"><div class="config-panel-heading"><label for="config-output">转换结果</label><span id="config-output-meta">等待转换</span></div><textarea id="config-output" spellcheck="false" readonly placeholder="转换后的 YAML 会显示在这里…" aria-label="转换结果"></textarea></section></div>
    <div class="config-actions"><button class="button primary" type="submit" id="config-convert">转换配置 ${icon('arrow', 16)}</button><button class="button" type="button" id="config-sample">填入示例</button><button class="button quiet" type="button" id="config-clear">清空</button><div class="config-result-actions"><button class="button" type="button" id="config-copy" disabled>${icon('copy', 15)} 复制结果</button><button class="button" type="button" id="config-download" disabled>${icon('download', 15)} 下载文件</button></div></div>
    <div id="config-feedback" class="config-feedback" role="status" aria-live="polite">选择转换方向，粘贴配置后点击转换。支持 ⌘ / Ctrl + Enter。</div>
  </form><aside class="config-notes" id="config-semantics"><strong>转换规则</strong><p>按数据内容重新生成，注释、排版和 YAML 锚点名称不会保留。YAML 使用 1.2 规则；日期样式的普通文本按字符串处理。</p><p>TOML 不支持 null，根节点必须是对象。未加引号的 TOML 日期 / 时间会被拦截；如需转换，请先加引号明确作为字符串。</p><p>超过安全范围的整数、会丢失精度的数值、重复键与循环引用会明确报错。单次最多 ${MAX_CONFIG_LENGTH.toLocaleString()} 个字符，配置内容不会上传或保存。</p></aside>`;

  const $ = selector => root.querySelector(selector);
  const source = $('#config-source');
  const target = $('#config-target');
  const input = $('#config-input');
  const output = $('#config-output');
  const feedback = $('#config-feedback');
  let result = null;

  function updateLabels() {
    $('#config-input-meta').textContent = `${source.value.toUpperCase()} · ${input.value.length.toLocaleString()} 字符`;
    input.placeholder = `在这里粘贴 ${source.value.toUpperCase()} 配置…`;
    output.placeholder = `转换后的 ${target.value.toUpperCase()} 会显示在这里…`;
  }
  function invalidate(message = '输入已更新，请重新转换。') {
    result = null;
    output.value = '';
    $('#config-copy').disabled = true;
    $('#config-download').disabled = true;
    $('#config-output-meta').textContent = '等待转换';
    feedback.textContent = message;
    feedback.classList.remove('error');
    input.removeAttribute('aria-invalid');
    updateLabels();
  }
  function run() {
    invalidate('正在转换…');
    try {
      result = convertConfig(input.value, source.value, target.value);
      output.value = result.output;
      $('#config-copy').disabled = false;
      $('#config-download').disabled = false;
      $('#config-output-meta').textContent = `${result.target.toUpperCase()} · ${result.output.length.toLocaleString()} 字符`;
      feedback.textContent = `${result.source.toUpperCase()} → ${result.target.toUpperCase()} 转换完成。${result.source === 'json' ? '' : '注释与原排版不保留。'}`;
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('error');
      input.setAttribute('aria-invalid', 'true');
      $('#config-output-meta').textContent = '转换失败';
    }
  }
  $('#config-form').addEventListener('submit', event => { event.preventDefault(); run(); });
  input.addEventListener('input', () => invalidate());
  source.addEventListener('change', () => invalidate('已更改源格式，请确认输入内容后转换。'));
  target.addEventListener('change', () => invalidate('已更改目标格式，请重新转换。'));
  input.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run(); }
  });
  $('#config-sample').addEventListener('click', () => { input.value = EXAMPLES[source.value]; run(); });
  $('#config-clear').addEventListener('click', () => { input.value = ''; invalidate('已清空。配置仅在当前页面处理。'); input.focus(); });
  $('#config-swap').addEventListener('click', () => {
    const previous = result;
    const previousSource = source.value;
    source.value = target.value;
    target.value = previousSource;
    if (previous) input.value = previous.output;
    invalidate('已交换方向，请确认源配置的格式。');
    if (previous) run();
  });
  $('#config-copy').addEventListener('click', () => { if (result) Promise.resolve(copy(result.output)).catch(() => {}); });
  $('#config-download').addEventListener('click', () => {
    if (!result) return;
    const mime = { json: 'application/json', yaml: 'application/yaml', toml: 'application/toml' }[result.target];
    const url = URL.createObjectURL(new Blob([result.output], { type: `${mime};charset=utf-8` }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `config.${result.target}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  updateLabels();
}
