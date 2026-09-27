import { formatJSON, encodeText, parseTimestamp, parseDatetime, datetimeValue, MAX_INPUT_BYTES } from './core.mjs';

const tools = [
  { id: 'json', title: 'JSON 格式化', en: 'JSON FORMATTER', category: '开发', glyph: '{ }', color: 'sage', description: '让杂乱的数据，变得一目了然。', details: '格式化、压缩、校验，一次搞定。', tags: ['JSON', '格式校验'], keywords: 'json 格式化 压缩 校验 开发 数据' },
  { id: 'timestamp', title: '时间戳转换', en: 'TIMESTAMP CONVERTER', category: '时间', glyph: '◷', color: 'sand', description: '在一串数字和一个时刻之间，自由切换。', details: '秒 / 毫秒识别，支持本地时区与 UTC。', tags: ['Unix', '日期时间'], keywords: 'timestamp unix 时间戳 日期 秒 毫秒 时间' },
  { id: 'encode', title: '文本编码 / 解码', en: 'TEXT ENCODER', category: '文本', glyph: 'Aa', color: 'lavender', description: '换一种表达，内容原样抵达。', details: 'Base64 与 URL 编码，支持中文。', tags: ['Base64', 'URL'], keywords: 'encode decode base64 url 编码 解码 中文 文本' },
  { id: 'outlook', title: 'Outlook 邮件读取', en: 'OUTLOOK MAIL READER', category: '邮箱', glyph: '@', color: 'blue', description: '读一封邮件，确认一个消息。', details: '支持 Outlook / Hotmail，粘贴账号信息即可读取最近邮件。', tags: ['OAuth', 'Graph / IMAP'], keywords: 'outlook hotmail live msn 邮箱 邮件 读取 验证码' },
  { id: 'ip', title: 'IP 地址检测', en: 'IP ADDRESS LOOKUP', category: '网络', glyph: 'IP', color: 'blue', description: '看看你从哪里连接到网络。', details: '检测当前公网 IP，查询 IPv4 / IPv6 的位置与网络归属。', tags: ['IPv4 / IPv6', 'ASN'], keywords: 'ip ipv4 ipv6 地址 公网 检测 查询 网络 位置 asn' },
  { id: 'domain', title: '域名 IP 查询', en: 'DOMAIN & DNS LOOKUP', category: '网络', glyph: 'DNS', color: 'sand', description: '从公开解析记录，了解域名的指向。', details: '查看域名解析、CDN 线索与网络地址；公开解析不等于源站真实 IP。', tags: ['DNS', 'CDN'], keywords: 'domain dns cdn 域名 真实ip 源站 解析 网络 查询' },
  { id: 'diff', title: '文本 Diff', en: 'TEXT DIFF', category: '开发', glyph: '±', color: 'sage', description: '一眼看清两段文本哪里不同。', details: '按行比较新增、删除和未变内容，支持忽略空白。', tags: ['比较', '配置'], keywords: 'diff compare 文本 比较 差异 新增 删除 配置' },
  { id: 'regex', title: '正则表达式测试器', en: 'REGEX TESTER', category: '开发', glyph: '.*', color: 'lavender', description: '把复杂匹配，先在这里试清楚。', details: '实时查看匹配、高亮、索引和捕获组。', tags: ['Regex', '捕获组'], keywords: 'regex regexp 正则 表达式 匹配 捕获组 高亮 测试' },
  { id: 'jwt', title: 'JWT 解析器', en: 'JWT DECODER', category: '开发', glyph: 'JWT', color: 'blue', description: '看清令牌里的字段与时间声明。', details: '本地解码 Header、Payload 和权限，明确区分解码与签名验证。', tags: ['JWT', 'OAuth'], keywords: 'jwt token oauth 解析 令牌 header payload 权限 过期' },
  { id: 'config', title: '配置格式转换', en: 'CONFIG CONVERTER', category: '开发', glyph: '⇄', color: 'sage', description: '在 JSON、YAML 与 TOML 之间转换。', details: '选择输入与输出格式，转换配置并检查类型与语法问题。', tags: ['JSON / YAML', 'TOML'], keywords: 'config json yaml yml toml 配置 格式 转换' },
  { id: 'cron', title: 'Cron 表达式测试器', en: 'CRON EXPLORER', category: '时间', glyph: '◷', color: 'sand', description: '把定时规则，变成看得懂的时间。', details: '解释 Cron 表达式，按时区预览未来 10 次执行时间。', tags: ['Cron', '时区'], keywords: 'cron 定时 计划 时间 表达式 cloudflare utc 时区' },
  { id: 'curl', title: 'cURL 请求转换', en: 'CURL CONVERTER', category: '开发', glyph: '>_', color: 'lavender', description: '从请求命令，到可用的调用代码。', details: '解析 cURL 请求，生成 JavaScript fetch 与 Python requests 代码。', tags: ['cURL', 'fetch / Python'], keywords: 'curl fetch python requests 请求 转换 接口 headers' },
];
const page = document.body.dataset.page;
const current = tools.find(tool => tool.id === page);
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const toolUrl = id => `/tools/${id}/`;
const escapeHTML = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, size = 20) => {
  const shapes = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    down: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.grid}</svg>`;
};
function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`daykit.${key}`)) ?? fallback; } catch { return fallback; }
}
function writeStore(key, value) {
  try { localStorage.setItem(`daykit.${key}`, JSON.stringify(value)); } catch { /* Tools remain usable when storage is disabled. */ }
}
const savedFavorites = readStore('favorites', []);
let favorites = Array.isArray(savedFavorites) ? savedFavorites.filter(id => tools.some(tool => tool.id === id)) : [];
const savedRecent = readStore('recent', []);
let recent = Array.isArray(savedRecent) ? savedRecent.filter(item => item && tools.some(tool => tool.id === item.id) && Number.isFinite(item.at)).slice(0, 3) : [];
if (current) {
  recent = [{ id: page, at: Date.now() }, ...recent.filter(item => item.id !== page)].slice(0, 3);
  writeStore('recent', recent);
}
let favoritesOnly = new URLSearchParams(location.search).get('view') === 'favorites';
let category = '全部';
let query = '';
const mark = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const glyph = tool => `<span class="tool-glyph ${tool.color}" aria-hidden="true">${tool.glyph}</span>`;
function navMarkup() {
  return `<nav aria-label="主要导航"><a class="nav-link ${page === 'home' && !favoritesOnly ? 'active' : ''}" href="/" ${page === 'home' && !favoritesOnly ? 'aria-current="page"' : ''}>${icon('grid')}<span>全部工具</span><span class="nav-count">${String(tools.length).padStart(2, '0')}</span></a>
  <a class="nav-link ${page === 'home' && favoritesOnly ? 'active' : ''}" href="/?view=favorites" ${page === 'home' && favoritesOnly ? 'aria-current="page"' : ''}>${icon('star')}<span>我的收藏</span><span class="nav-count favorite-count">${favorites.length}</span></a>
  <p class="nav-label">工具箱 <span>TOOLBOX</span></p>
  ${tools.map(tool => `<a class="nav-link tool-nav ${tool.id === page ? 'active' : ''}" href="${toolUrl(tool.id)}" ${tool.id === page ? 'aria-current="page"' : ''}><span class="nav-glyph">${tool.glyph}</span><span>${tool.title}</span></a>`).join('')}</nav>`;
}
$('#app').innerHTML = `<a class="skip-link" href="#main">跳到主要内容</a>
  <aside class="sidebar"><a class="brand" href="/" aria-label="日用 Daykit 首页">${mark}<span>日用<span class="brand-en">DAYKIT</span></span></a>
  <button class="sidebar-search" data-action="search">${icon('search', 17)}<span>找个工具</span><kbd>⌘ K</kbd></button>${navMarkup()}
  <div class="sidebar-bottom"><div class="local-note">${icon('shield', 19)}<div><strong>你的日常工具箱</strong><p>随用随开，操作清晰</p></div></div><div class="sidebar-signature"><span>日常所需，刚刚好。</span><span>v1.0</span></div></div></aside>
  <div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="打开导航菜单">${icon('menu')}</button><span>我的工作台</span><span class="breadcrumb-slash">/</span><strong>${current?.title || (favoritesOnly ? '我的收藏' : '全部工具')}</strong></div><div class="topbar-right"><span class="local-status"><i></i> ${page === 'outlook' ? 'Worker 在线读取' : ['ip', 'domain'].includes(page) ? '在线查询' : page === 'home' ? '日常工具' : '本地运行'}</span><span class="avatar" aria-label="个人空间">D</span></div></header>
  <main id="main" tabindex="-1">${current ? toolPage() : homePage()}</main>
  <footer class="footer"><span>DAYKIT <span class="footer-dot">/</span> 让工具回归简单</span><span>${icon('shield', 13)} ${page === 'outlook' ? '仅用于本次读取，不持久保存' : '轻量工具，打开就用'}</span></footer></div>
  <dialog id="search-dialog" aria-labelledby="search-title"><div class="dialog-heading"><h2 id="search-title">快速打开工具</h2><button class="icon-button" data-close="search-dialog" aria-label="关闭搜索">${icon('close')}</button></div><label class="dialog-search">${icon('search')}<input id="quick-search" type="search" placeholder="搜索工具名称或关键词…" autocomplete="off" aria-label="搜索工具"></label><div id="quick-results"></div><p class="dialog-hint">按 Esc 关闭 · 所有工具均可直接使用</p></dialog>
  <dialog id="mobile-dialog" aria-label="网站导航"><div class="dialog-heading"><a class="brand" href="/">${mark}<span>日用</span></a><button class="icon-button" data-close="mobile-dialog" aria-label="关闭导航">${icon('close')}</button></div>${navMarkup()}</dialog>
  <div id="toast" role="status" aria-live="polite"></div>`;

function favoriteButton(tool, extraClass = '') {
  return `<button class="icon-button favorite ${extraClass} ${favorites.includes(tool.id) ? 'is-saved' : ''}" data-favorite="${tool.id}" aria-label="${favorites.includes(tool.id) ? '取消收藏' : '收藏'}${tool.title}" aria-pressed="${favorites.includes(tool.id)}">${icon('star', 18)}</button>`;
}
function homePage() {
  return `<section class="welcome"><div><div class="eyebrow"><span class="tiny-line"></span> YOUR EVERYDAY TOOLKIT</div><h1>${favoritesOnly ? '顺手的，都在这里。' : '小工具，让日常更从容。'}</h1><p>${favoritesOnly ? '把常用的工具，放在触手可及的地方。' : '少一点重复，多一点专注。你需要的小帮手，都在这里。'}</p></div><div class="welcome-note"><span class="note-plus">+</span><span>简单的工具<br>认真的日常</span><span class="note-index">EST. 2026</span></div></section>
  <section class="tool-directory" aria-label="工具目录"><div class="directory-top"><h2>${favoritesOnly ? '我的收藏' : '探索工具'} <span id="result-count">${favoritesOnly ? favorites.length : tools.length}</span></h2><label class="directory-search">${icon('search', 18)}<input id="tool-search" type="search" placeholder="搜索工具…" aria-label="搜索工具目录"><kbd>/</kbd></label></div>
  <div class="directory-toolbar"><div class="filters" role="group" aria-label="按类别筛选">${['全部', '开发', '文本', '时间', '邮箱', '网络'].map((name, i) => `<button class="filter ${i === 0 ? 'selected' : ''}" data-category="${name}" aria-pressed="${i === 0}">${name === '全部' ? '全部工具' : name}</button>`).join('')}</div><span class="directory-meta">轻量 · 顺手 · 无需登录</span></div>
  <div id="tool-grid" class="tool-grid"></div></section>
  <section class="recent-section"><div class="section-heading"><h2>最近使用</h2><span>接着上次的思路</span></div><div class="recent-list">${recent.length ? recent.map(item => { const tool = tools.find(tool => tool.id === item.id); return `<a href="${toolUrl(tool.id)}" class="recent-item">${glyph(tool)}<span>${tool.title}</span><span class="recent-time">${new Date(item.at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })} ${new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>${icon('arrow', 16)}</a>`; }).join('') : `<div class="recent-empty">${icon('clock', 20)}<p>还没有使用记录。打开一个工具，从这里开始。</p><a href="/tools/json/">试试 JSON 格式化 ${icon('arrow', 15)}</a></div>`}</div></section>
  <aside class="bottom-note"><div class="bottom-note-icon">${icon('shield', 22)}</div><div><strong>你的内容，只属于你。</strong><p>格式转换在浏览器完成；邮件与网络查询通过本站 Worker 请求对应服务，结果不持久保存。</p></div><span class="note-caption">A LITTLE LESS FRICTION.</span></aside>`;
}
function renderCards() {
  const matching = tools.filter(tool => (!favoritesOnly || favorites.includes(tool.id)) && (category === '全部' || tool.category === category) && `${tool.title} ${tool.keywords}`.toLowerCase().includes(query));
  $('#result-count').textContent = matching.length;
  $('#tool-grid').classList.toggle('filtered-grid', matching.length < 3);
  $('#tool-grid').innerHTML = matching.length ? matching.map(tool => `<article class="tool-card ${tool.id === 'json' ? 'featured-card' : tool.id === 'outlook' ? 'mail-card' : ''}">${favoriteButton(tool, 'card-favorite')}<a class="card-link" href="${toolUrl(tool.id)}"><div class="card-top">${glyph(tool)}<span class="card-category">${tool.category}工具</span></div><div class="card-copy"><span class="card-eyebrow">${tool.en}</span><h3>${tool.title}</h3><p>${tool.description}</p>${tool.id === 'json' ? `<div class="code-preview" aria-hidden="true"><div><span class="code-line">01</span>{</div><div><span class="code-line">02</span>  <span class="code-key">"a_little_less"</span>: <span class="code-string">"mess"</span>,</div><div><span class="code-line">03</span>  <span class="code-key">"a_little_more"</span>: <span class="code-string">"clarity"</span></div><div><span class="code-line">04</span>}</div><span class="code-badge">${icon('check', 12)} VALID JSON</span></div>` : ''}</div><div class="card-bottom"><div class="tag-list">${tool.tags.map(tag => `<span>${tag}</span>`).join('')}</div><span class="card-open">打开工具 ${icon('arrow', 16)}</span></div></a></article>`).join('') : `<div class="empty-state">${icon(favoritesOnly ? 'star' : 'search', 30)}<h3>${favoritesOnly && !favorites.length ? '收藏你的第一个工具' : '没有找到匹配的工具'}</h3><p>${favoritesOnly && !favorites.length ? '点击工具右上角的星标，下次就能更快找到它。' : '试试 JSON、时间戳、Base64 或 URL。'}</p>${favoritesOnly && !favorites.length ? '<a class="button primary" href="/">浏览全部工具</a>' : '<button class="button" data-action="reset-search">清除筛选</button>'}</div>`;
}

function toolPage() {
  return `<a class="back-link" href="/">← 全部工具</a><div class="tool-page-heading"><div class="tool-heading-main">${glyph(current)}<div><span class="eyebrow">${current.en}</span><h1>${current.title}</h1></div></div>${favoriteButton(current)}</div><p class="tool-description">${current.details}</p>
  ${['jwt', 'config', 'cron', 'curl'].includes(page) ? `<div id="${page}-tool"><p class="tool-description">正在加载工具…</p></div>` : page === 'outlook' ? '<div id="mail-reader"><p class="tool-description">正在加载邮件读取工具…</p></div>' : ['ip', 'domain'].includes(page) ? '<div id="network-tool"><p class="tool-description">正在加载网络工具…</p></div>' : page === 'diff' ? '<div id="diff-tool"><p class="tool-description">正在加载 Diff 工具…</p></div>' : page === 'regex' ? '<div id="regex-tool"><p class="tool-description">正在加载正则工具…</p></div>' : page === 'timestamp' ? timestampPage() : editorPage()}
  <aside class="usage-note">${icon('shield', 17)}<p>${page === 'jwt' ? '解码不等于验签；时间状态基于设备时钟和令牌中的未验证声明。令牌内容不上传或保存。' : page === 'config' ? '格式转换在浏览器中完成。注释不跨格式保留；无法准确表达的类型会提示错误，请核对输出。' : page === 'cron' ? 'Cloudflare 定时任务使用 UTC。请确认选中的 Cron 方言和时区，预览不会创建实际定时任务。' : page === 'curl' ? 'cURL 仅在本地解析为请求与代码，不执行命令、不自动发送请求。请检查转换提示和生成结果。' : page === 'diff' ? '两段文本仅在浏览器中比较，不上传或保存；最多每侧 2,000 行、1 MB，支持忽略首尾及重复空白。' : page === 'regex' ? '使用当前浏览器的 JavaScript 正则语法；后台线程执行，复杂匹配超时会自动停止，输入内容不上传或保存。' : page === 'ip' ? '当前 IP 来自访问本站时的连接信息；指定 IP 查询使用外部公开数据源，地理位置为近似值。' : page === 'domain' ? '查询通过公共 DNS 解析器完成；CDN 或代理地址并不代表源站，结果会标明识别依据与不确定性。' : page === 'outlook' ? '账号与授权令牌经本站 Worker 发送至 Microsoft；密码字段不发送。页面刷新或关闭后，输入和邮件结果不会保留。' : page === 'json' ? '使用标准 JSON 格式：属性名使用双引号，不支持注释或末尾逗号。单次支持 2 MB 内容。' : page === 'encode' ? 'Base64 使用 UTF-8 编码；URL 编码针对单个参数值（encodeURIComponent），解码时保留 + 号。单次支持 2 MB。' : 'Unix 时间戳从 1970-01-01 00:00:00 UTC 起计时。自动识别时，绝对值 11 位及以上按毫秒处理；历史或远期日期请手动选择单位。'}</p></aside>`;
}
function editorPage() {
  const isJSON = page === 'json';
  return `<div class="tool-controls">${isJSON ? `<label class="inline-label">缩进<select id="indent"><option value="2">2 个空格</option><option value="4">4 个空格</option><option value="tab">Tab</option></select></label>` : `<div class="segmented" role="group" aria-label="编码方式"><button class="selected" data-kind="base64" aria-pressed="true">Base64</button><button data-kind="url" aria-pressed="false">URL 编码</button></div>`}<span class="shortcut-note"><kbd>⌘</kbd> + <kbd>Enter</kbd> ${isJSON ? '格式化' : '编码'}</span></div>
  <div class="editor-grid"><section class="editor-pane"><div class="pane-heading"><label for="source">输入内容 <span>INPUT</span></label><div class="pane-actions"><button class="text-button" data-action="sample">填入示例</button><button class="text-button" data-action="clear">清空</button></div></div><textarea id="source" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${isJSON ? '在这里粘贴 JSON…&#10;&#10;{&quot;hello&quot;: &quot;world&quot;}' : '输入需要编码或解码的文本…&#10;&#10;支持中文与 UTF-8 字符'}" aria-describedby="input-stats"></textarea><div class="pane-footer"><span id="input-stats">0 字符 · 0 B</span>${isJSON ? '<label class="file-label">导入 .json<input id="file-input" type="file" accept=".json,application/json,text/plain" aria-label="导入 JSON 文件"></label>' : '<span>UTF-8</span>'}</div></section>
  <section class="editor-pane output-pane"><div class="pane-heading"><label for="output">处理结果 <span>OUTPUT</span></label><div class="pane-actions"><button class="text-button" data-action="copy" disabled>${icon('copy', 14)} 复制</button>${isJSON ? `<button class="text-button" data-action="download" disabled>${icon('down', 14)} 下载</button>` : ''}</div></div><textarea id="output" readonly spellcheck="false" placeholder="处理后的内容会显示在这里" aria-describedby="output-stats"></textarea><div class="pane-footer"><span id="output-stats">等待输入</span><span>本地处理</span></div></section></div>
  <div class="action-bar">${isJSON ? `<button class="button primary" data-action="format">格式化 JSON ${icon('arrow', 16)}</button><button class="button" data-action="minify">压缩</button><button class="button" data-action="validate">校验 JSON</button>` : `<button class="button primary" data-action="encode">编码 ${icon('arrow', 16)}</button><button class="button" data-action="decode">解码</button><button class="button quiet" data-action="swap">结果作为输入</button>`}</div><p class="feedback" id="feedback" role="status" aria-live="polite"></p>`;
}
function timestampPage() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `<div class="live-clock"><div><span class="eyebrow"><i class="live-dot"></i> 此刻的 UNIX 时间戳</span><div class="live-value" id="live-timestamp"></div><span class="live-date" id="live-date"></span></div><button class="button" data-action="use-now">使用当前时间 ${icon('arrow', 16)}</button></div>
  <div class="time-grid"><section class="time-panel"><div class="time-panel-title"><span class="step-number">01</span><h2>时间戳 → 日期</h2></div><label class="field-label" for="timestamp-input">Unix 时间戳</label><div class="input-with-select"><input id="timestamp-input" type="text" inputmode="numeric" placeholder="例如 1750000000" autocomplete="off"><select id="timestamp-unit" aria-label="时间戳单位"><option value="auto">自动识别</option><option value="s">秒 (s)</option><option value="ms">毫秒 (ms)</option></select></div><p class="field-hint">支持秒、毫秒与负数时间戳</p><button class="button primary" data-action="to-date">转换为日期 ${icon('arrow', 16)}</button><p id="date-error" class="feedback" role="status"></p><div class="time-results" id="date-results"><div class="result-placeholder">转换后的日期将显示在这里</div></div></section>
  <section class="time-panel"><div class="time-panel-title"><span class="step-number">02</span><h2>日期 → 时间戳</h2></div><label class="field-label" for="datetime-input">日期与时间</label><input class="field-input" id="datetime-input" type="datetime-local" step="1"><label class="zone-field" for="timezone">时区<select id="timezone"><option value="local">${escapeHTML(zone)}（本地）</option><option value="utc">UTC</option></select></label><button class="button primary" data-action="to-timestamp">转换为时间戳 ${icon('arrow', 16)}</button><p id="timestamp-error" class="feedback" role="status"></p><div class="time-results" id="timestamp-results"><div class="result-placeholder">转换后的时间戳将显示在这里</div></div></section></div>`;
}

let toastTimer;
function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制到剪贴板'); }
  catch { toast('无法访问剪贴板，请选中结果后手动复制。'); }
}
function updateFavorites() {
  $$('[data-favorite]').forEach(button => {
    const tool = tools.find(item => item.id === button.dataset.favorite);
    const saved = favorites.includes(tool.id);
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', saved);
    button.setAttribute('aria-label', `${saved ? '取消收藏' : '收藏'}${tool.title}`);
  });
  $$('.favorite-count').forEach(count => { count.textContent = favorites.length; });
  if (page === 'home' && favoritesOnly) renderCards();
}
function renderQuickSearch() {
  const term = $('#quick-search').value.trim().toLowerCase();
  const matching = tools.filter(tool => `${tool.title} ${tool.keywords}`.toLowerCase().includes(term));
  $('#quick-results').innerHTML = matching.length ? matching.map(tool => `<a class="quick-result" href="${toolUrl(tool.id)}">${glyph(tool)}<span><strong>${tool.title}</strong><small>${tool.details}</small></span>${icon('arrow', 16)}</a>`).join('') : '<p class="quick-empty">没有匹配的工具，试试其他关键词。</p>';
}
function openSearch() {
  $('#quick-search').value = '';
  renderQuickSearch();
  $('#search-dialog').showModal();
  $('#quick-search').focus();
}
$('#quick-search').addEventListener('input', renderQuickSearch);
$('#quick-search').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('#quick-results a')?.click();
  if (event.key === 'ArrowDown') { event.preventDefault(); $('#quick-results a')?.focus(); }
});
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
}));

let encodingKind = 'base64';
let resultReady = false;
function setFeedback(message, error = false) {
  $('#feedback').textContent = message;
  $('#feedback').classList.toggle('error', error);
  $('#source').setAttribute('aria-invalid', error);
}
function inputStats() {
  const text = $('#source').value;
  const bytes = new TextEncoder().encode(text).length;
  $('#input-stats').textContent = `${[...text].length.toLocaleString()} 字符 · ${bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}`;
}
function invalidateOutput() {
  resultReady = false;
  $('#output').value = '';
  $('#output-stats').textContent = '等待处理';
  $$('[data-action="copy"], [data-action="download"]').forEach(button => { button.disabled = true; });
  setFeedback('');
  inputStats();
}
function runEditor(action) {
  invalidateOutput();
  try {
    const source = $('#source').value;
    let output;
    if (page === 'json') {
      const indent = $('#indent').value === 'tab' ? '\t' : Number($('#indent').value);
      output = formatJSON(source, action === 'minify' ? 0 : indent);
    } else output = encodeText(source, encodingKind, action === 'decode');
    $('#output').value = output;
    resultReady = true;
    $('#output-stats').textContent = `${[...output].length.toLocaleString()} 字符 · 已完成`;
    $$('[data-action="copy"], [data-action="download"]').forEach(button => { button.disabled = false; });
    setFeedback(action === 'validate' ? '校验通过：这是一段有效的 JSON。' : action === 'decode' ? '解码完成。' : action === 'encode' ? '编码完成。' : action === 'minify' ? '已移除多余空格和换行。' : '格式化完成。');
  } catch (error) { setFeedback(page === 'json' && error instanceof SyntaxError ? `JSON 格式有误：${error.message}` : error.message, true); }
}
function timeRow(label, value) {
  return `<div class="time-result"><span>${label}</span><div><output>${escapeHTML(value)}</output><button class="icon-button" data-copy-value="${escapeHTML(value)}" aria-label="复制${label}">${icon('copy', 15)}</button></div></div>`;
}
function convertTime(action) {
  const toDate = action === 'to-date';
  const errorTarget = $(toDate ? '#date-error' : '#timestamp-error');
  const resultTarget = $(toDate ? '#date-results' : '#timestamp-results');
  const input = $(toDate ? '#timestamp-input' : '#datetime-input');
  errorTarget.textContent = '';
  input.removeAttribute('aria-invalid');
  try {
    if (toDate) {
      const { date, unit } = parseTimestamp(input.value, $('#timestamp-unit').value);
      resultTarget.innerHTML = timeRow('本地时间', date.toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' })) + timeRow('UTC / ISO 8601', date.toISOString()) + `<p class="result-hint">本次按${unit === 's' ? '秒' : '毫秒'}转换</p>`;
    } else {
      const date = parseDatetime(input.value, $('#timezone').value === 'utc');
      resultTarget.innerHTML = timeRow('秒 (s)', String(Math.floor(date.getTime() / 1000))) + timeRow('毫秒 (ms)', String(date.getTime()));
    }
  } catch (error) {
    errorTarget.textContent = error.message;
    errorTarget.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    resultTarget.innerHTML = '<div class="result-placeholder">请检查输入后重试</div>';
  }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.close) return $(`#${button.dataset.close}`).close();
  if (button.dataset.favorite) {
    const id = button.dataset.favorite;
    favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
    writeStore('favorites', favorites);
    updateFavorites();
    return;
  }
  if (button.dataset.category) {
    category = button.dataset.category;
    $$('[data-category]').forEach(filter => { filter.classList.toggle('selected', filter === button); filter.setAttribute('aria-pressed', filter === button); });
    renderCards();
    return;
  }
  if (button.dataset.kind) {
    encodingKind = button.dataset.kind;
    $$('[data-kind]').forEach(tab => { tab.classList.toggle('selected', tab === button); tab.setAttribute('aria-pressed', tab === button); });
    invalidateOutput();
    return;
  }
  if (button.dataset.copyValue !== undefined) return copy(button.dataset.copyValue);
  const action = button.dataset.action;
  if (action === 'search') openSearch();
  if (action === 'menu') $('#mobile-dialog').showModal();
  if (action === 'reset-search') {
    query = ''; category = '全部'; $('#tool-search').value = '';
    $$('[data-category]').forEach(filter => { const selected = filter.dataset.category === '全部'; filter.classList.toggle('selected', selected); filter.setAttribute('aria-pressed', selected); });
    renderCards();
  }
  if (['format', 'minify', 'validate', 'encode', 'decode'].includes(action)) runEditor(action);
  if (action === 'clear') { $('#source').value = ''; invalidateOutput(); $('#source').focus(); }
  if (action === 'sample') {
    $('#source').value = page === 'json' ? '{"name":"日用 Daykit","description":"日常所需，刚刚好。","tools":["JSON","Timestamp","Base64"],"local":true}' : '日用 Daykit，让日常更从容。';
    runEditor(page === 'json' ? 'format' : 'encode');
  }
  if (action === 'copy' && resultReady) await copy($('#output').value);
  if (action === 'download' && resultReady) {
    const url = URL.createObjectURL(new Blob([$('#output').value], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'daykit-formatted.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (action === 'swap') {
    if (!resultReady) return toast('请先编码或解码，生成一个结果。');
    $('#source').value = $('#output').value; invalidateOutput(); $('#source').focus();
  }
  if (action === 'to-date' || action === 'to-timestamp') convertTime(action);
  if (action === 'use-now') {
    const now = new Date();
    $('#timestamp-unit').value = 's'; $('#timestamp-input').value = String(Math.floor(now.getTime() / 1000));
    $('#datetime-input').value = datetimeValue(now, $('#timezone').value === 'utc');
    convertTime('to-date'); convertTime('to-timestamp');
  }
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!$$('dialog[open]').length) openSearch(); }
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && ['json', 'encode'].includes(page) && !$$('dialog[open]').length) { event.preventDefault(); runEditor(page === 'json' ? 'format' : 'encode'); }
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !$$('dialog[open]').length) {
    event.preventDefault(); page === 'home' ? $('#tool-search').focus() : openSearch();
  }
});

if (page === 'home') {
  renderCards();
  $('#tool-search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); renderCards(); });
} else if (page === 'timestamp') {
  function tick() {
    const now = new Date();
    $('#live-timestamp').textContent = Math.floor(now.getTime() / 1000);
    $('#live-date').textContent = now.toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' });
  }
  tick(); setInterval(tick, 1000);
  $('#datetime-input').value = datetimeValue(new Date());
  for (const selector of ['#timestamp-input', '#timestamp-unit', '#datetime-input', '#timezone']) {
    $(selector).addEventListener('input', () => {
      const isTimestamp = selector.startsWith('#timestamp-');
      $(isTimestamp ? '#date-results' : '#timestamp-results').innerHTML = '<div class="result-placeholder">输入已更新，请重新转换</div>';
      $(isTimestamp ? '#date-error' : '#timestamp-error').textContent = '';
      $(isTimestamp ? '#timestamp-input' : '#datetime-input').removeAttribute('aria-invalid');
    });
  }
  $('#timestamp-input').addEventListener('keydown', event => { if (event.key === 'Enter') convertTime('to-date'); });
  $('#datetime-input').addEventListener('keydown', event => { if (event.key === 'Enter') convertTime('to-timestamp'); });
} else if (['ip', 'domain'].includes(page)) {
  import('./network.js').then(({ initNetwork }) => initNetwork($('#network-tool'), { copy, icon, escapeHTML }, page)).catch(() => { $('#network-tool').textContent = '网络工具加载失败，请刷新页面重试。'; });
} else if (page === 'outlook') {
  import('./mail.js').then(({ initMail }) => initMail($('#mail-reader'), { copy, icon, escapeHTML })).catch(() => { $('#mail-reader').textContent = '邮件工具加载失败，请刷新页面重试。'; });
} else if (page === 'jwt') {
  import('./jwt.js').then(({ initJWT }) => initJWT($('#jwt-tool'), { copy, icon, escapeHTML })).catch(() => { $('#jwt-tool').textContent = 'JWT 工具加载失败，请刷新重试。'; });
} else if (page === 'config') {
  import('./config.js').then(({ initConfig }) => initConfig($('#config-tool'), { copy, icon, escapeHTML })).catch(() => { $('#config-tool').textContent = '配置转换工具加载失败，请刷新重试。'; });
} else if (page === 'cron') {
  import('./cron.js').then(({ initCron }) => initCron($('#cron-tool'), { copy, icon, escapeHTML })).catch(() => { $('#cron-tool').textContent = 'Cron 工具加载失败，请刷新重试。'; });
} else if (page === 'curl') {
  import('./curl.js').then(({ initCurl }) => initCurl($('#curl-tool'), { copy, icon, escapeHTML })).catch(() => { $('#curl-tool').textContent = 'cURL 工具加载失败，请刷新重试。'; });
} else if (page === 'diff') {
  import('./diff.js').then(({ initDiff }) => initDiff($('#diff-tool'), { copy, icon, escapeHTML })).catch(() => { $('#diff-tool').textContent = 'Diff 工具加载失败，请刷新页面重试。'; });
} else if (page === 'regex') {
  import('./regex.js').then(({ initRegex }) => initRegex($('#regex-tool'), { copy, icon, escapeHTML })).catch(() => { $('#regex-tool').textContent = '正则工具加载失败，请刷新页面重试。'; });
} else {
  $('#source').addEventListener('input', invalidateOutput);
  $('#indent')?.addEventListener('change', invalidateOutput);
  $('#file-input')?.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > MAX_INPUT_BYTES) throw new Error('文件超过 2 MB，请选择较小的 JSON 文件。');
      $('#source').value = await file.text(); runEditor('format');
    } catch (error) { invalidateOutput(); setFeedback(error.message, true); }
    event.target.value = '';
  });
}
