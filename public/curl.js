export const MAX_CURL_BYTES = 256 * 1024;
const quote = value => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const tokenPattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const encodeFormValue = value => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// ponytail: this is a deliberately limited POSIX word parser, never a shell interpreter.
export function tokenizeCurl(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('请粘贴一条 cURL 命令。');
  if (new TextEncoder().encode(source).length > MAX_CURL_BYTES) throw new Error('命令超过 256 KB，请缩小内容。');
  if (source.includes('\0')) throw new Error('命令不能包含 NUL 字符。');
  const text = source.trim();
  const words = [];
  let word = '', mode = '', started = false;
  const push = () => { if (started) words.push(word); word = ''; started = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (mode === "'") { if (c === "'") mode = ''; else word += c; continue; }
    if (c === '\\') {
      const next = text[++i];
      if (next === undefined) throw new Error('命令末尾的反斜杠缺少后续内容。');
      if (next === '\n') continue;
      if (next === '\r' && text[i + 1] === '\n') { i++; continue; }
      if (mode === '"' && !['"', '$', '`', '\\'].includes(next)) word += '\\';
      word += next; started = true; continue;
    }
    if (c === '$' || c === '`') throw new Error('不支持变量展开、命令替换或 $ 引号语法。请使用展开后的字面值；字面 $ 可放入单引号。');
    if (mode === '"') { if (c === '"') mode = ''; else word += c; continue; }
    if (c === '"' || c === "'") { mode = c; started = true; continue; }
    if (/[;&|<>()]/.test(c)) throw new Error('只接受单条 cURL：不支持管道、重定向、多命令或 shell 运算符。URL 和正文请用引号包住。');
    if (/[\n\r]/.test(c)) throw new Error('多行命令请使用行末反斜杠续行；不支持多条命令。');
    if (c === '#' && !started) throw new Error('请移除 shell 注释后再转换。');
    if (/[*{}\[\]~]/.test(c)) throw new Error('不支持未加引号的 shell 通配符或展开语法。请将字面值放入单引号。');
    if (/\s/.test(c)) push();
    else { word += c; started = true; }
    if (words.length > 5000) throw new Error('命令参数过多，请缩小内容。');
  }
  if (mode) throw new Error('引号未闭合，请检查命令。');
  push();
  if (words[0] !== 'curl') throw new Error('请使用以 curl 开头的 POSIX / bash 格式命令。');
  return words.slice(1);
}

const valuedOptions = new Map([
  ['X', 'request'], ['H', 'header'], ['d', 'data'], ['u', 'user'], ['b', 'cookie'], ['A', 'user-agent'], ['e', 'referer'],
  ...['request', 'header', 'data', 'data-ascii', 'data-raw', 'data-binary', 'data-urlencode', 'json', 'url', 'user', 'cookie', 'user-agent', 'referer'].map(name => [name, name]),
]);
const flagOptions = new Map([
  ['G', 'get'], ['I', 'head'], ['L', 'location'], ['g', 'globoff'], ['s', 'silent'], ['S', 'show-error'], ['i', 'include'], ['v', 'verbose'],
  ...['get', 'head', 'location', 'globoff', 'compressed', 'silent', 'show-error', 'include', 'show-headers', 'verbose', 'basic', 'no-get', 'no-head', 'no-location', 'no-compressed'].map(name => [name, name]),
]);

function encodedData(value) {
  const equals = value.indexOf('=');
  if (equals >= 0) return (equals > 0 ? value.slice(0, equals + 1) : '') + encodeFormValue(value.slice(equals + 1));
  if (value.includes('@')) throw new Error('--data-urlencode 的 @ 文件语法不受支持，请粘贴实际内容。');
  return encodeFormValue(value);
}

export function parseCurl(source) {
  const args = tokenizeCurl(source);
  const urls = [], headers = [], warnings = [], data = [];
  const flags = new Set();
  let method, user, cookie, userAgent, referer, jsonMode = false, optionsEnded = false;
  const apply = (name, value) => {
    if (name === 'url') urls.push(value);
    else if (name === 'request') method = value;
    else if (name === 'user') user = value;
    else if (name === 'cookie') {
      if (cookie !== undefined) throw new Error('多个 --cookie 暂不支持，请合并为一条 Cookie 字符串。');
      if (!value.includes('=')) throw new Error('--cookie 仅支持 name=value 字符串；不读取 cookie 文件或启动 cookie 引擎。');
      cookie = value;
    } else if (name === 'user-agent') userAgent = value;
    else if (name === 'referer') {
      if (value.endsWith(';auto')) throw new Error('暂不支持 --referer 的 ;auto 重定向模式。');
      referer = value;
    } else if (name === 'header') {
      if (value.startsWith('@')) throw new Error('不读取请求头文件，请将每个请求头写为 -H 字面值。');
      if (/[\r\n]/.test(value)) throw new Error('请求头不能包含换行。');
      const match = value.match(/^([^:;]+)([:;])(.*)$/s);
      if (!match || !tokenPattern.test(match[1]) || (match[2] === ';' && match[3])) throw new Error('请求头格式应为 Name: value，空值使用 Name;。');
      const [name, content] = [match[1], match[3].trim()];
      if (!content && match[2] === ':') throw new Error(`暂不支持用 ${name}: 移除客户端默认请求头；空值请求头请用 ${name};。`);
      if (headers.some(([key]) => key.toLowerCase() === name.toLowerCase())) throw new Error(`重复请求头 ${name} 无法由 requests 精确保留，请先明确合并规则。`);
      headers.push([name, content]);
    } else if (name === 'json' || name.startsWith('data')) {
      if (name !== 'data-raw' && value.startsWith('@')) throw new Error('不读取 @ 文件或标准输入，请粘贴实际正文；字面 @ 内容可使用 --data-raw。');
      if (name === 'json') jsonMode = true;
      data.push({ name, value: name === 'data-urlencode' ? encodedData(value) : value });
    } else if (name.startsWith('no-')) flags.delete(name.slice(3));
    else flags.add(name);
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--' && !optionsEnded) { optionsEnded = true; continue; }
    if (!arg.startsWith('-') || optionsEnded) { urls.push(arg); continue; }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = arg.slice(2, eq < 0 ? undefined : eq);
      if (name.length > 1 && valuedOptions.has(name)) {
        const value = eq < 0 ? args[++i] : arg.slice(eq + 1);
        if (value === undefined) throw new Error(`--${name} 缺少参数。`);
        apply(valuedOptions.get(name), value);
      } else if (name.length > 1 && flagOptions.has(name) && eq < 0) apply(flagOptions.get(name));
      else throw new Error(`不支持选项 --${name}，为避免改变请求语义，未生成代码。文件上传、代理和 TLS 配置需手动处理。`);
    } else {
      if (arg === '-') throw new Error('不支持从标准输入读取。');
      for (let j = 1; j < arg.length; j++) {
        const name = arg[j];
        if (valuedOptions.has(name)) {
          const value = j + 1 < arg.length ? arg.slice(j + 1) : args[++i];
          if (value === undefined) throw new Error(`-${name} 缺少参数。`);
          apply(valuedOptions.get(name), value); break;
        }
        if (!flagOptions.has(name)) throw new Error(`不支持选项 -${name}，为避免改变请求语义，未生成代码。`);
        apply(flagOptions.get(name));
      }
    }
  }
  if (urls.length !== 1) throw new Error('每次仅支持一个 HTTP / HTTPS URL。');
  if (!/^https?:\/\//i.test(urls[0]) || /[\s\\\u0000-\u001f\u007f]/.test(urls[0])) throw new Error('请输入包含 http:// 或 https:// 的有效 URL，空白请先编码。');
  let parsed;
  try { parsed = new URL(urls[0]); } catch { throw new Error('URL 格式无效。'); }
  if (parsed.username || parsed.password) throw new Error('URL 内嵌用户名密码暂不支持，请改用 --user。');
  const withoutIPv6 = urls[0].replace(/^(https?:\/\/)\[[^\]]+\]/i, '$1ipv6');
  if (!flags.has('globoff') && /[{}\[\]]/.test(withoutIPv6)) throw new Error('URL 含 cURL 通配符；单个字面 URL 请加 --globoff。');
  if (jsonMode && data.some(item => item.name !== 'json')) throw new Error('暂不支持混用 --json 和 --data 系列，请合并正文后转换。');
  if (flags.has('head') && data.length && !flags.has('get')) throw new Error('-I 与正文选项冲突；如需将正文放入查询参数，请加 -G。');
  let body = data.length ? data.map(item => item.value).join(jsonMode ? '' : '&') : null;
  let url = urls[0];
  if (flags.has('get') && body !== null) {
    const hash = url.indexOf('#');
    const fragment = hash < 0 ? '' : url.slice(hash);
    const base = hash < 0 ? url : url.slice(0, hash);
    url = base + (base.includes('?') ? '&' : '?') + body + fragment;
    body = null;
    if (/[\s#]/.test(url.slice(0, hash < 0 ? undefined : url.length - fragment.length))) throw new Error('-G 的原始数据含空白或 #，请使用 --data-urlencode 编码。');
  }
  method ??= flags.has('head') ? 'HEAD' : body !== null ? 'POST' : 'GET';
  if (!tokenPattern.test(method)) throw new Error('HTTP 方法格式无效。');
  if (flags.has('head') && method !== 'HEAD') throw new Error('暂不支持混用 -I 与非 HEAD 的 -X；两者响应正文语义不同。');
  const addDefault = (name, value) => { if (value !== undefined && !headers.some(([key]) => key.toLowerCase() === name.toLowerCase())) headers.push([name, value]); };
  addDefault('User-Agent', userAgent);
  addDefault('Referer', referer);
  if (cookie !== undefined && headers.some(([key]) => key.toLowerCase() === 'cookie')) throw new Error('请只使用 --cookie 或 Cookie 请求头中的一种。');
  addDefault('Cookie', cookie);
  if (user !== undefined) {
    if (!user.includes(':')) throw new Error('--user 请填写 username:password，本工具不支持交互式密码提示。');
    const bytes = new TextEncoder().encode(user);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    addDefault('Authorization', `Basic ${btoa(binary)}`);
  }
  if (body !== null || jsonMode) addDefault('Content-Type', jsonMode ? 'application/json' : 'application/x-www-form-urlencoded');
  if (jsonMode) addDefault('Accept', 'application/json');
  for (const [name, value] of headers) {
    if (/[^\t\x20-\x7e\x80-\xff]/.test(value)) throw new Error(`请求头 ${name} 含无法由 fetch / requests 直接表示的字符，请先按接口要求编码。`);
  }
  const controlled = headers.filter(([name]) => /^(accept-charset|accept-encoding|access-control-request-headers|access-control-request-method|connection|content-length|cookie|date|dnt|expect|host|keep-alive|origin|permissions-policy|referer|te|trailer|transfer-encoding|upgrade|via|user-agent|proxy-.*|sec-.*)$/i.test(name)).map(([name]) => name);
  if (controlled.length) warnings.push(`浏览器会限制或重写这些头：${controlled.join('、')}。fetch 保留原值供检查，但不能保证发送成功；Cookie 无法手动设置，可使用 Python 版本。`);
  if (flags.has('compressed')) warnings.push('--compressed：客户端自动处理解压；支持的压缩算法和 Accept-Encoding 可能与 cURL 不同。');
  if (flags.has('location')) warnings.push('已开启重定向。跨域时 Authorization / Cookie 和自定义方法的处理可能与 cURL 不同，请核对目标服务。');
  else warnings.push('未开启重定向；浏览器 fetch 的 manual 模式可能返回不透明重定向响应，无法读取其状态或正文。');
  if (method !== method.toUpperCase()) warnings.push('方法使用了小写字母；fetch / requests 可能将其转换为大写，大小写敏感接口需手动核对。');
  if ([...flags].some(name => ['silent', 'show-error', 'include', 'show-headers', 'verbose'].includes(name))) warnings.push('已忽略仅控制终端输出的选项，生成代码统一输出状态码和响应正文。');
  if (parsed.hash) warnings.push('URL 的 # 片段仅为客户端标识，不会发送到服务器。');
  warnings.push('代码保留显式 URL、请求头与正文；客户端自动请求头和 URL 规范化可能不同，签名接口请核对最终请求。浏览器 fetch 仍受 CORS 限制，默认不携带浏览器已有 Cookie。');
  const fetchIssue = /^(GET|HEAD)$/i.test(method) && body !== null ? 'fetch 不允许 GET / HEAD 携带正文；请使用 Python 版本，或调整原命令。' : /^(CONNECT|TRACE|TRACK)$/i.test(method) ? 'fetch 不允许此 HTTP 方法；请使用支持该方法的 HTTP 客户端。' : '';
  if (fetchIssue) warnings.unshift(fetchIssue);
  return { url, method, headers, query: [...new URL(url).searchParams], body, followRedirects: flags.has('location'), warnings, fetchIssue };
}

export function generateCurlCode(request) {
  const { url, method, headers, body, followRedirects, fetchIssue } = request;
  const options = { method, headers, redirect: followRedirects ? 'follow' : 'manual', credentials: 'omit' };
  if (body !== null) options.body = body;
  const javascript = fetchIssue ? `// ${fetchIssue}\n// 未生成会丢失正文或改变方法的 fetch 请求。` : `// 浏览器受 CORS 和请求头限制，详见页面中的转换提示。\n// 在支持顶层 await 的模块或浏览器控制台中运行。\nconst response = await fetch(${quote(url)}, ${JSON.stringify(options, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')});\nconsole.log(response.status);\nconsole.log(await response.text());`;
  const pythonHeaders = headers.length ? `{\n${headers.map(([name, value]) => `    ${quote(name)}: ${quote(value)},`).join('\n')}\n}` : '{}';
  const python = `# 依赖：pip install requests\nimport requests\n\nurl = ${quote(url)}\nheaders = ${pythonHeaders}\n${body !== null ? `body = ${quote(body)}.encode("utf-8")\n` : ''}\nresponse = requests.request(\n    method=${quote(method)},\n    url=url,\n    headers=headers,\n${body !== null ? '    data=body,\n' : ''}    allow_redirects=${followRedirects ? 'True' : 'False'},\n    timeout=30,  # 连接 / 读取超时，可按需调整\n)\nprint(response.status_code)\nprint(response.text)`;
  return { javascript, python };
}

const sample = `curl 'https://api.example.com/v1/items?tag=dev&tag=tools' \\\n  -X POST \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\n  --data-raw '{"name":"日用 Daykit","enabled":true}'`;

export function initCurl(root, { copy = async () => {}, icon = () => '', escapeHTML: escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) } = {}) {
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form id="curl-form" class="curl-panel" autocomplete="off"><div class="curl-heading"><div><span class="curl-overline">01 / 请求转换</span><h2>粘贴 cURL，拆解请求</h2></div><div class="curl-actions"><button type="button" class="text-button" data-curl-action="sample">填入示例</button><button type="button" class="text-button" data-curl-action="clear">清空</button></div></div><label class="curl-label" for="curl-input">cURL 命令 <span>POSIX / bash</span></label><textarea id="curl-input" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="curl 'https://api.example.com/items'" aria-describedby="curl-help curl-feedback"></textarea><p id="curl-help" class="curl-hint">支持浏览器复制的 cURL、引号和反斜杠续行。最多 256 KB；仅在本地解析，不执行命令、不发送请求、不保存输入。</p><div class="curl-action-bar"><button id="curl-submit" class="button primary" type="submit">解析并生成代码 ${icon('arrow', 16)}</button><span class="shortcut-note"><kbd>⌘</kbd> + <kbd>Enter</kbd></span></div><p id="curl-feedback" class="feedback" role="status" aria-live="polite"></p></form><div id="curl-empty" class="curl-empty">解析后可查看方法、请求头、查询参数和正文，并复制生成的代码。</div><section id="curl-results" hidden aria-label="请求解析结果"><div class="curl-panel"><div class="curl-heading"><div><span class="curl-overline">02 / 请求详情</span><h2>查看请求内容</h2></div><span id="curl-method" class="curl-method"></span></div><p id="curl-url" class="curl-url"></p><div class="curl-detail-grid"><section><h3>请求头 <span id="curl-header-count"></span></h3><div id="curl-headers"></div></section><section><h3>查询参数 <span id="curl-query-count"></span></h3><div id="curl-query"></div></section></div><details class="curl-body"><summary>请求正文</summary><pre id="curl-body"></pre></details><div id="curl-warnings" class="curl-warnings" role="note"></div></div><div class="curl-panel"><div class="curl-heading"><div><span class="curl-overline">03 / 生成代码</span><h2>带回你的项目</h2></div><button type="button" class="text-button" data-curl-action="copy">${icon('copy', 14)} 复制代码</button></div><label class="curl-label" for="curl-language">目标语言</label><select id="curl-language"><option value="javascript">JavaScript · fetch</option><option value="python">Python · requests</option></select><label class="curl-label" for="curl-code">生成结果</label><textarea id="curl-code" readonly spellcheck="false"></textarea></div></section><details class="curl-supported"><summary>支持范围与语义说明</summary><p>支持 -X、-H、-d、--data-raw、--data-binary、--data-urlencode、--json、--url、-G、-I、-u、-b、-A、-e、--compressed、-L、--globoff 和终端输出选项。重复查询参数与原始正文会保留。</p><p>文件上传 / @file、代理、TLS 配置、重复请求头、多 URL、变量展开、命令替换和管道会明确报错。请选择浏览器的「复制为 cURL (bash)」。</p><a href="https://curl.se/docs/manpage.html" target="_blank" rel="noreferrer">cURL 官方选项说明 ↗</a></details>`;
  let codes = null;
  const feedback = (message = '', error = false) => { $('#curl-feedback').textContent = message; $('#curl-feedback').classList.toggle('error', error); };
  const reset = () => {
    codes = null; $('#curl-results').hidden = true; $('#curl-empty').hidden = false; $('#curl-code').value = '';
    for (const id of ['method', 'url', 'headers', 'query', 'body', 'warnings', 'header-count', 'query-count']) $(`#curl-${id}`).textContent = '';
    $('#curl-input').removeAttribute('aria-invalid'); feedback();
  };
  const showCode = () => { $('#curl-code').value = codes?.[$('#curl-language').value] || ''; };
  const table = (pairs, empty) => pairs.length ? `<div class="curl-table">${pairs.map(([name, value]) => `<div class="curl-row"><code>${escape(name)}</code><code>${escape(value)}</code></div>`).join('')}</div>` : `<p class="curl-hint">${empty}</p>`;
  const convert = () => {
    reset();
    try {
      const request = parseCurl($('#curl-input').value);
      codes = generateCurlCode(request);
      $('#curl-results').hidden = false; $('#curl-empty').hidden = true;
      $('#curl-method').textContent = request.method;
      $('#curl-url').textContent = request.url;
      $('#curl-header-count').textContent = request.headers.length;
      $('#curl-query-count').textContent = request.query.length;
      $('#curl-headers').innerHTML = table(request.headers, '没有显式请求头');
      $('#curl-query').innerHTML = table(request.query, '没有查询参数');
      $('#curl-body').textContent = request.body === null ? '无正文' : request.body === '' ? '空字符串（0 字节正文）' : request.body;
      $('#curl-warnings').innerHTML = `<strong>转换提示</strong><ul>${request.warnings.map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
      if (request.fetchIssue) $('#curl-language').value = 'python';
      showCode(); feedback('解析完成。未发送任何网络请求。');
    } catch (error) { $('#curl-input').setAttribute('aria-invalid', 'true'); feedback(error.message || '解析失败，请检查输入。', true); }
  };
  $('#curl-form').addEventListener('submit', event => { event.preventDefault(); convert(); });
  $('#curl-input').addEventListener('input', reset);
  $('#curl-language').addEventListener('change', showCode);
  root.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); convert(); } });
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-curl-action]')?.dataset.curlAction;
    if (action === 'sample') { $('#curl-input').value = sample; convert(); }
    if (action === 'clear') { $('#curl-input').value = ''; reset(); $('#curl-input').focus(); }
    if (action === 'copy' && codes) Promise.resolve(copy($('#curl-code').value)).then(() => feedback('代码已复制。')).catch(() => feedback('复制失败，请手动选择代码。', true));
  });
}
