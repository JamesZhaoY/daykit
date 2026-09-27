export function initNetwork(root, { copy, icon, escapeHTML: esc }, kind) {
  const isIP = kind === 'ip';
  const $ = selector => root.querySelector(selector);
  root.innerHTML = `<form id="network-form" class="network-form" autocomplete="off">
    <div class="network-section-label"><span>${isIP ? '01 / 地址与网络' : '01 / 公开 DNS 查询'}</span><span class="network-badge">${isIP ? 'IPv4 / IPv6' : 'A · AAAA · CNAME · MX · NS'}</span></div>
    <label class="field-label" for="network-input">${isIP ? '查询 IP 地址' : '域名或网址'}</label>
    <div class="network-query"><input class="field-input" id="network-input" type="text" maxlength="${isIP ? 64 : 2048}" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${isIP ? '输入 IPv4 / IPv6，留空检测当前 IP' : '例如 example.com 或 https://example.com'}" aria-describedby="network-input-hint" ${isIP ? '' : 'required'}><button class="button primary" id="network-submit" type="submit">${icon('search', 16)} ${isIP ? '查询 IP' : '查询域名'}</button></div>
    <div class="network-form-bottom"><p id="network-input-hint">${isIP ? '当前 IP 是此浏览器连接本站时的公网出口地址；位置为大致归属地。' : '查询公开 DNS 记录与 CDN 线索；解析地址可能属于代理或 CDN。'}</p>${isIP ? '<button class="text-button" id="network-current" type="button">重新检测当前 IP</button>' : ''}</div>
  </form>
  <section class="network-results" aria-labelledby="network-result-title"><div class="network-results-heading"><h2 id="network-result-title">${isIP ? '检测结果' : '解析结果'}</h2><span id="network-result-meta">等待查询</span></div><div id="network-feedback" role="status" aria-live="polite"></div><div id="network-result"></div></section>`;

  let busy = false;
  const display = value => value === undefined || value === null || value === '' ? '暂无数据' : String(value);
  const copyButton = (value, label = '复制') => `<button class="icon-button" type="button" data-network-copy="${esc(value)}" aria-label="${esc(`${label} ${value}`)}">${icon('copy', 15)}</button>`;
  const valueRow = (label, value) => `<div class="network-detail"><dt>${esc(label)}</dt><dd>${esc(display(value))}</dd></div>`;
  function placeholder() {
    $('#network-result').innerHTML = `<div class="network-empty">${icon('search', 26)}<strong>${isIP ? '正在准备检测当前连接' : '输入域名，查看它的公开解析'}</strong><p>${isIP ? '也可以输入一个公网 IPv4 或 IPv6 地址。' : '同时查看 IPv4、IPv6、别名、邮件和域名服务器记录。'}</p></div>`;
  }
  function sourceLinks(sources) {
    return (sources || []).map(source => {
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') return '';
        return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.name || url.hostname)} ↗</a>`;
      } catch { return ''; }
    }).filter(Boolean).join('<span>·</span>');
  }
  function renderIP(result) {
    const location = result.location || {};
    const network = result.network || {};
    const area = [...new Set([location.country, location.region, location.city].filter(Boolean))].join(' · ');
    const asn = network.asn ? String(network.asn).replace(/^AS/i, '') : '';
    $('#network-result').innerHTML = `<article class="network-ip-result">
      <div class="network-result-banner"><div><span class="network-overline">${result.isCurrent ? '当前连接的公网 IP' : '指定 IP 的查询结果'}</span><div class="network-ip-value"><output>${esc(result.ip)}</output>${copyButton(result.ip, '复制 IP')}</div></div><span class="network-badge">IPv${esc(result.version)}</span></div>
      <dl class="network-details">${valueRow('归属地', area)}${valueRow('自治系统 ASN', asn ? `AS${asn}` : '')}${valueRow('网络组织', network.organization)}${valueRow('互联网服务商', network.isp)}${valueRow('所在时区', location.timezone)}${valueRow('数据来源', result.source)}</dl>
      ${result.warning ? `<p class="network-result-note">${esc(result.warning)}</p>` : ''}
    </article>`;
  }
  function renderDomain(result) {
    const addresses = result.addresses || [];
    const cdn = result.cdn || {};
    const records = result.records || {};
    const hasRecords = Object.values(records).some(values => Array.isArray(values) && values.length);
    const recordLabels = { A: 'IPv4 地址', AAAA: 'IPv6 地址', CNAME: '别名', MX: '邮件服务器', NS: '域名服务器' };
    const recordTables = Object.entries(recordLabels).map(([type, label]) => {
      const rows = records[type] || [];
      return `<section class="network-record-group" aria-labelledby="dns-${type}-title"><div class="network-record-heading"><h3 id="dns-${type}-title"><span>${type}</span>${label}</h3><span>${rows.length} 条</span></div>${rows.length ? `<div class="network-table-wrap"><table class="network-table"><caption class="network-sr-only">${esc(result.domain)} 的 ${type} 记录</caption><thead><tr><th scope="col">名称</th><th scope="col">记录值${type === 'MX' ? '（优先级 / 服务器）' : ''}</th><th scope="col">TTL</th><th scope="col"><span class="network-sr-only">操作</span></th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.name)}</td><td><code>${esc(row.value)}</code></td><td>${esc(row.ttl)} 秒</td><td>${copyButton(row.value, '复制记录')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="network-no-records">本次未返回此类型记录。</p>'}</section>`;
    }).join('');
    $('#network-result').innerHTML = `<div class="network-domain-summary"><div><span class="network-overline">查询域名</span><div class="network-domain-value"><output>${esc(result.domain)}</output>${copyButton(result.domain, '复制域名')}</div></div><span class="network-badge">${hasRecords ? '公开解析结果' : '未返回解析记录'}</span></div>
      <div class="network-origin-note"><span class="network-origin-icon">${icon('shield', 20)}</span><div><strong>源站真实 IP：无法通过本次公开解析确认</strong><p>${esc(cdn.conclusion || '以下地址是当前 DNS 公开返回的 IP，可能属于 CDN、代理或源站。')}</p>${cdn.providers?.length ? `<p>检测到的 CDN / 代理线索：${cdn.providers.map(provider => esc(provider)).join('、')}</p>` : ''}${cdn.evidence?.length ? `<p>识别依据：${cdn.evidence.map(evidence => esc(evidence)).join('；')}</p>` : ''}</div></div>
      <section class="network-address-section" aria-labelledby="network-address-title"><div class="network-record-heading"><h3 id="network-address-title">解析 IP <span class="network-count">${addresses.length}</span></h3><span>公开 DNS</span></div>${addresses.length ? `<div class="network-address-list">${addresses.map(address => `<div class="network-address"><span class="network-address-version">IPv${esc(address.version)}</span><div><code>${esc(address.ip)}</code><p>${address.public === false ? '内网或保留地址 · 不是可公开连接的互联网地址。' : address.cdn ? `${esc(address.cdn.provider)} · ${esc(address.cdn.evidence)}` : '未识别到已知 CDN 线索；仍无法确认是否为源站。'}</p></div>${copyButton(address.ip, '复制解析 IP')}</div>`).join('')}</div>` : '<p class="network-no-records">本次未返回 A / AAAA 地址。其他类型的记录仍可在下方查看。</p>'}</section>
      <div class="network-dns-records">${recordTables}</div>
      ${result.warnings?.length ? `<div class="network-warnings">${result.warnings.map(warning => `<p>${esc(warning)}</p>`).join('')}</div>` : ''}
      <div class="network-sources"><span>解析服务：${esc(display(result.resolver))}</span><div>${sourceLinks(result.sources)}</div></div>`;
  }
  function setBusy(value) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    $('#network-submit').disabled = value;
    $('#network-input').readOnly = value;
    if (isIP) $('#network-current').disabled = value;
  }
  async function query(current = false) {
    if (busy) return;
    const input = $('#network-input');
    const value = current ? '' : input.value.trim();
    if (!isIP && !value) { input.reportValidity(); return; }
    input.removeAttribute('aria-invalid');
    setBusy(true);
    $('#network-result-meta').textContent = '正在查询';
    $('#network-result').innerHTML = '';
    $('#network-feedback').innerHTML = `<div class="network-notice"><span class="network-spinner" aria-hidden="true"></span><span>${isIP ? value ? '正在查询 IP 归属信息…' : '正在检测此浏览器的公网出口…' : '正在查询公开 DNS 记录…'}</span></div>`;
    try {
      const response = await fetch(`/api/network/${kind}`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Daykit-Client': 'network-tools' },
        body: JSON.stringify(isIP ? { ip: value } : { domain: value }), signal: AbortSignal.timeout(25000),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error('查询服务暂时不可用，请稍后重试。'); }
      if (!response.ok) {
        if (response.status === 400) input.setAttribute('aria-invalid', 'true');
        throw new Error(result.error?.message || '查询失败，请稍后重试。');
      }
      if (isIP) renderIP(result); else renderDomain(result);
      const checkedAt = Date.parse(result.checkedAt);
      $('#network-result-meta').textContent = `查询完成${Number.isFinite(checkedAt) ? ` · ${new Date(checkedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : ''}`;
      $('#network-feedback').textContent = '';
    } catch (error) {
      $('#network-result-meta').textContent = '查询未完成';
      $('#network-feedback').innerHTML = `<div class="network-notice error">${esc(error.name === 'TimeoutError' ? '查询超时，请稍后重新查询。' : error instanceof TypeError ? '网络连接失败，请检查连接后重试。' : error.message)}</div>`;
    } finally { setBusy(false); }
  }
  $('#network-form').addEventListener('submit', event => { event.preventDefault(); query(); });
  $('#network-input').addEventListener('input', () => $('#network-input').removeAttribute('aria-invalid'));
  root.addEventListener('click', event => {
    const button = event.target.closest('button[data-network-copy]');
    if (button) copy(button.dataset.networkCopy);
  });
  placeholder();
  if (isIP) {
    $('#network-current').addEventListener('click', () => { $('#network-input').value = ''; query(true); });
    query(true);
  }
}
