export const MAX_JWT_LENGTH = 128 * 1024;

function decodeSegment(segment, label, allowEmpty = false) {
  if ((!segment && !allowEmpty) || !/^[A-Za-z\d_-]*$/.test(segment) || segment.length % 4 === 1) throw new Error(`${label} 不是有效的无填充 Base64URL。`);
  try {
    const binary = atob(segment.replaceAll('-', '+').replaceAll('_', '/'));
    if (btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== segment) throw new Error();
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { throw new Error(`${label} 的 Base64URL 编码无效。`); }
}

function parseObject(bytes, label, warnings) {
  let value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text, (_key, item) => {
      if (typeof item === 'number' && (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))) warnings.add(`${label} 含超出 JavaScript 安全精度的数字，展示值可能被舍入，请核对原始令牌。`);
      return item;
    });
  } catch { throw new Error(`${label} 必须是 UTF-8 编码的有效 JSON 对象。`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是 JSON 对象，不能是数组、null 或其他标量。`);
  return value;
}

export function decodeJWT(input) {
  const raw = String(input ?? '').trim().replace(/^Bearer\s+/i, '');
  if (!raw) throw new Error('请先粘贴 JWT，可包含 Bearer 前缀。');
  if (raw.length > MAX_JWT_LENGTH) throw new Error('令牌超过 128 KB，请检查是否粘贴了多条内容。');
  const parts = raw.split('.');
  if (parts.length === 5) throw new Error('这是五段式 JWE 加密令牌，需要解密密钥，不能直接读取 Payload。');
  if (parts.length !== 3) throw new Error('JWT 应为 Header.Payload.Signature 三段格式。普通 OAuth refresh_token 不一定是 JWT。');
  const warnings = new Set();
  const header = parseObject(decodeSegment(parts[0], 'Header'), 'Header', warnings);
  if (header.b64 === false) throw new Error('不支持未编码 Payload 的 JWS 扩展；此工具解析标准 JWT。');
  const payload = parseObject(decodeSegment(parts[1], 'Payload'), 'Payload', warnings);
  const signature = decodeSegment(parts[2], 'Signature', true);
  if (typeof header.alg !== 'string' || !header.alg) warnings.add('Header 缺少有效的 alg 算法声明。');
  if (header.alg === 'none') warnings.add(signature.length ? 'alg 为 none 但签名段非空，格式不一致。' : 'alg 为 none：该令牌没有签名，内容不能作为可信身份依据。');
  else if (!signature.length) warnings.add('签名段为空，该令牌没有可验证的签名。');
  if (header.crit !== undefined) warnings.add('Header 包含 crit 扩展；本页仅展示，不验证扩展语义。');
  if (Array.isArray(payload.aud) && payload.aud.some(value => typeof value !== 'string')) warnings.add('aud 数组通常应仅包含字符串。');
  return { header, payload, signatureBytes: signature.length, warnings: [...warnings] };
}

export function inspectJWTTimes(payload, now = Date.now()) {
  const times = [];
  for (const [key, label] of [['iat', '签发时间'], ['nbf', '开始接受时间'], ['exp', '过期时间']]) {
    if (!Object.hasOwn(payload, key)) continue;
    const value = payload[key];
    const valid = typeof value === 'number' && Number.isFinite(value) && Math.abs(value * 1000) <= 8640000000000000;
    times.push({ key, label, value, valid, iso: valid ? new Date(value * 1000).toISOString() : null });
  }
  const exp = times.find(item => item.key === 'exp' && item.valid);
  const nbf = times.find(item => item.key === 'nbf' && item.valid);
  const invalid = times.some(item => !item.valid);
  const expired = exp ? now >= exp.value * 1000 : false;
  const pending = nbf ? now < nbf.value * 1000 : false;
  const status = invalid ? '时间声明格式异常' : expired ? '按声明已过期' : pending ? '按声明尚未生效' : exp ? '按声明尚未过期' : '未声明过期时间';
  return { times, expired, pending, invalid, status, checkedAt: new Date(now).toISOString() };
}

export function jwtExample(now = Date.now()) {
  const encode = object => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(object)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const seconds = Math.floor(now / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ iss: 'https://demo.example', sub: 'daykit-demo', aud: ['daykit'], name: '日用示例', scope: 'profile mail.read', roles: ['viewer'], iat: seconds, nbf: seconds, exp: seconds + 3600 })}.`;
}

export function initJWT(root, { copy, icon, escapeHTML: esc }) {
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form id="jwt-form" class="jwt-form" autocomplete="off"><div class="jwt-section-label"><span>01 / 令牌内容</span><span class="jwt-badge">仅本地解码</span></div><label for="jwt-input" class="field-label">JWT / Bearer Token</label><textarea id="jwt-input" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="粘贴 Header.Payload.Signature…" aria-describedby="jwt-hint"></textarea><p class="jwt-hint" id="jwt-hint">支持三段式 JWT 和中文字段。签名不会被验证，内容不上传。</p><div class="jwt-actions"><button class="button primary" type="submit">解析 JWT ${icon('arrow', 16)}</button><button class="button" id="jwt-example" type="button">填入示例</button><button class="button quiet" id="jwt-clear" type="button">清空</button><span class="shortcut-note"><kbd>⌘</kbd> + <kbd>Enter</kbd></span></div></form>
    <div id="jwt-feedback" class="feedback" role="status" aria-live="polite"></div><section id="jwt-results" hidden><div class="jwt-notice">${icon('shield', 18)}<div><strong>签名未验证</strong><p>这里只解码内容并解读时间声明；不能据此判断令牌可信或授权成功。</p></div></div><div id="jwt-summary" class="jwt-summary"></div><div class="jwt-json-grid">${[['header', 'Header', '头部'], ['payload', 'Payload', '载荷']].map(([key, title, label]) => `<section class="jwt-json-panel"><div class="jwt-panel-heading"><label for="jwt-${key}">${title}<span>${label}</span></label><button class="text-button" type="button" data-jwt-copy="${key}">${icon('copy', 14)} 复制</button></div><textarea id="jwt-${key}" readonly spellcheck="false" aria-label="${title} JSON"></textarea></section>`).join('')}</div><div class="jwt-times-heading"><h2>时间声明</h2><span>基于此设备当前时间 · UTC / 本地</span></div><div id="jwt-times"></div><div id="jwt-claims" class="jwt-claims"></div><ul id="jwt-warnings" class="jwt-warnings"></ul></section>`;
  let result = null;
  const show = value => typeof value === 'string' ? value : JSON.stringify(value);
  function invalidate() {
    result = null;
    $('#jwt-results').hidden = true;
    $('#jwt-feedback').textContent = '';
    $('#jwt-feedback').classList.remove('error');
    $('#jwt-input').removeAttribute('aria-invalid');
    $('#jwt-header').value = '';
    $('#jwt-payload').value = '';
    for (const selector of ['#jwt-summary', '#jwt-times', '#jwt-claims', '#jwt-warnings']) $(selector).replaceChildren();
  }
  function renderTimes() {
    if (!result) return;
    const inspection = inspectJWTTimes(result.payload);
    $('#jwt-summary').innerHTML = `<div><span>算法声明</span><strong>${esc(show(result.header.alg ?? '未提供'))}</strong></div><div><span>时间状态（未验签）</span><strong>${esc(inspection.status)}</strong></div><div><span>签名长度</span><strong>${result.signatureBytes} bytes</strong></div>`;
    $('#jwt-times').innerHTML = inspection.times.length ? inspection.times.map(time => `<div class="jwt-time-row"><div><code>${time.key}</code><span>${time.label}</span></div><div><strong>${time.valid ? esc(new Date(time.iso).toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' })) : '格式错误：应为 Unix 秒数'}</strong><span>${time.valid ? `${esc(time.iso)} · ${time.value} s` : esc(show(time.value))}</span></div></div>`).join('') : '<p class="jwt-time-empty">此 Payload 没有 iat、nbf 或 exp 时间声明。</p>';
  }
  function run(event) {
    event?.preventDefault();
    invalidate();
    try {
      result = decodeJWT($('#jwt-input').value);
      $('#jwt-header').value = JSON.stringify(result.header, null, 2);
      $('#jwt-payload').value = JSON.stringify(result.payload, null, 2);
      $('#jwt-results').hidden = false;
      renderTimes();
      const claims = [['iss', '签发者'], ['sub', '主题 / 用户'], ['aud', '目标受众'], ['scope', '权限范围'], ['scp', '委托权限'], ['roles', '角色']].filter(([key]) => Object.hasOwn(result.payload, key));
      $('#jwt-claims').innerHTML = claims.length ? `<h2>常用声明</h2><dl>${claims.map(([key, label]) => `<div><dt>${esc(key)} · ${label}</dt><dd>${esc(show(result.payload[key]))}</dd></div>`).join('')}</dl>` : '';
      $('#jwt-warnings').innerHTML = result.warnings.map(warning => `<li>${esc(warning)}</li>`).join('');
      $('#jwt-feedback').textContent = '解码完成，签名未验证。';
    } catch (error) {
      invalidate();
      $('#jwt-feedback').textContent = error.message;
      $('#jwt-feedback').classList.add('error');
      $('#jwt-input').setAttribute('aria-invalid', 'true');
    }
  }
  $('#jwt-form').addEventListener('submit', run);
  $('#jwt-input').addEventListener('input', invalidate);
  $('#jwt-input').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run(event); });
  $('#jwt-example').addEventListener('click', () => { $('#jwt-input').value = jwtExample(); run(); });
  $('#jwt-clear').addEventListener('click', () => { $('#jwt-input').value = ''; invalidate(); $('#jwt-input').focus(); });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-jwt-copy]');
    if (button && result) copy(JSON.stringify(result[button.dataset.jwtCopy], null, 2));
  });
  const ticker = setInterval(renderTimes, 1000);
  window.addEventListener('pagehide', () => clearInterval(ticker), { once: true });
}
