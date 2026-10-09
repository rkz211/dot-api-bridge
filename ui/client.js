(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const list = $('connection-list');
  const panel = $('connection-panel');
  const search = $('service-search');
  const networkBanner = $('network-banner');
  let requestedConnection = null;
  try { const candidate = new URL('https://bridge.example' + (location.search || '')).searchParams.get('connect'); if (candidate && /^[a-z][a-z0-9_-]{1,63}$/.test(candidate)) requestedConnection = candidate; } catch {}
  let preparedSelectionPending = Boolean(requestedConnection);
  const state = { connections: [], selectedId: requestedConnection, loaded: false, loading: true, storageAvailable: false, pending: null, offline: !navigator.onLine, loadError: false, mode: 'view', notice: null, disconnectConfirm: false, intentBlocked: false };
  const statusLabels = { ready: 'Ready', needs_key: 'Needs a key', disabled: 'Disconnected', needs_attention: 'Needs attention' };
  const node = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = String(text);
    return result;
  };
  const button = (text, className, handler) => {
    const result = node('button', 'btn ' + (className || ''), text);
    result.type = 'button';
    result.addEventListener('click', handler);
    return result;
  };
  const announce = (text) => { $('announcer').textContent = text; };
  const pulseConnection = () => {
    const backdrop = $('space-background');
    if (!backdrop || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Alternate animation names so repeated successful checks restart without a timer or forced layout.
    backdrop.setAttribute('data-pulse', backdrop.getAttribute('data-pulse') === 'a' ? 'b' : 'a');
  };
  const selected = () => state.connections.find((c) => c.id === state.selectedId);
  const isBusy = () => Boolean(state.pending);
  const safeHttpsUrl = (value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      return url;
    } catch { return null; }
  };
  const destination = (connection) => {
    const url = safeHttpsUrl(connection.baseUrl);
    return url && !url.search && !url.hash ? url : null;
  };
  const filtered = () => {
    const term = search.value.trim().toLocaleLowerCase();
    if (!term) return state.connections;
    return state.connections.filter((c) => [c.name, c.baseUrl, c.description].some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term)));
  };
  const looksLikeKey = (value) => {
    const text = value.trim();
    if (/^(?:sites_|hub_|sk[-_]|pk_live_|sk_live_|ghp_|github_pat_|xox[baprs]-|AIza|Bearer\s+|Authorization\s*:|X-API-Key\s*:)/i.test(text)) return true;
    try { const url = new URL(text); if (url.username || url.password) return true; for (const key of url.searchParams.keys()) if (/^(?:api[-_]?key|key|token|access[-_]?token|secret|password|authorization)$/i.test(key)) return true; if (/^https?:$/.test(url.protocol)) return false; } catch {}
    const domainLike = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]|$)/i.test(text);
    return !domainLike && text.length >= 28 && !/\s/.test(text) && /^[A-Za-z0-9_+=/.-]+$/.test(text) && /[0-9_+=/-]/.test(text);
  };
  const intent = () => {
    const value = search.value.trim();
    // Link query strings, fragments, and embedded credentials do not belong in a handoff.
    try { const url = new URL(value); if (/^https?:$/.test(url.protocol)) return url.origin + url.pathname; } catch {}
    return value;
  };
  const banner = (message, tone = 'info') => node('div', 'banner banner-' + tone, message);
  const actionLabel = (label, action) => state.pending?.action === action ? (action === 'key' ? 'Saving & checking…' : action === 'test' ? 'Checking connection…' : action === 'disconnect' ? 'Disconnecting…' : 'Preparing…') : label;
  const applyBusy = () => {
    search.disabled = isBusy();
    list.querySelectorAll('button').forEach((b) => { b.disabled = isBusy(); });
    panel.querySelectorAll('button,input,select,textarea').forEach((control) => {
      if (isBusy() && !control.disabled) { control.disabled = true; control.dataset.busyDisabled = 'true'; }
    });
    panel.setAttribute('aria-busy', String(isBusy() || state.loading));
  };
  const advancedDetails = (connection) => {
    const details = node('details', 'advanced');
    details.append(node('summary', '', 'Connection details'));
    const body = node('div', 'advanced-content');
    const rows = node('dl', 'detail-list');
    const data = [['Destination', connection.baseUrl || 'Not prepared'], ['Authentication', connection.authLabel || 'API key'], ['Key source', connection.source === 'hosted' ? 'Provided by the private bridge' : connection.source === 'saved' ? 'Saved on this Site’s server' : 'No key saved']];
    for (const [label, value] of data) rows.append(node('dt', '', label), node('dd', '', value));
    body.append(rows);
    if (connection.lastTest?.at) {
      const time = new Date(connection.lastTest.at);
      if (Number.isFinite(time.getTime())) body.append(node('p', 'field-hint', 'Last check: ' + time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })));
    }
    details.append(body);
    return details;
  };
  const copyButton = (text, label, container) => {
    const control = button(label, 'btn-primary', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        control.textContent = 'Copied';
        announce('Copied. Paste this into your conversation with your dot.');
        setTimeout(() => { if (control.isConnected) control.textContent = label; }, 2500);
      } catch {
        let fallback = container.querySelector('.copy-manual');
        if (!fallback) {
          const labelEl = node('label', 'field-label', 'Copy this message to your dot');
          fallback = node('textarea', 'copy-manual');
          fallback.id = 'copy-message';
          fallback.readOnly = true;
          fallback.value = text;
          labelEl.htmlFor = fallback.id;
          container.append(labelEl, fallback);
        }
        fallback.focus();
        fallback.select();
        announce('Automatic copying is unavailable. The message is selected so you can copy it.');
      }
    });
    return control;
  };
  function renderNetwork() {
    networkBanner.replaceChildren();
    networkBanner.hidden = !state.offline && !state.loadError;
    if (networkBanner.hidden) return;
    networkBanner.append(node('span', '', state.offline ? 'You’re offline. Reconnect to save or check a connection.' : state.loaded ? 'The bridge couldn’t refresh. These details may be out of date. Reload before making changes.' : 'The bridge couldn’t load your connections. Check your connection and try again.'));
    const retry = button('Try again', '', () => loadConnections());
    retry.disabled = state.offline || isBusy() || state.loading;
    networkBanner.append(retry);
  }
  function renderList() {
    list.replaceChildren();
    list.setAttribute('aria-busy', String(state.loading));
    const matches = filtered();
    $('connection-count').textContent = state.loaded ? String(matches.length) : '—';
    if (state.loading && !state.loaded) {
      for (let i = 0; i < 3; i++) { const skeleton = node('div', 'skeleton skeleton-card'); skeleton.setAttribute('aria-hidden', 'true'); list.append(skeleton); }
      return;
    }
    if (!matches.length) {
      list.append(node('p', 'empty-sidebar', search.value.trim() ? 'This service hasn’t been prepared yet. Your dot can help with that.' : state.loadError ? 'Your services will appear here when the bridge reconnects.' : 'No services prepared yet. Start with the name or website of a service you want to use.'));
      return;
    }
    for (const connection of matches) {
      const card = node('button', 'connection-card');
      card.type = 'button';
      card.setAttribute('aria-pressed', String(connection.id === state.selectedId));
      card.setAttribute('aria-controls', 'connection-panel');
      card.disabled = isBusy();
      const icon = node('span', 'service-icon', (connection.name || '?').slice(0, 1).toLocaleUpperCase());
      icon.setAttribute('aria-hidden', 'true');
      const content = node('span', 'card-content');
      content.append(node('span', 'card-name', connection.name), node('span', 'status status-' + connection.status, statusLabels[connection.status] || 'Prepared'));
      const chevron = node('span', 'card-chevron', '›'); chevron.setAttribute('aria-hidden', 'true');
      card.append(icon, content, chevron);
      card.addEventListener('click', () => {
        state.intentBlocked = false; state.selectedId = connection.id; state.mode = 'view'; state.notice = null; state.disconnectConfirm = false;
        render();
        const heading = panel.querySelector('h2'); heading?.focus({ preventScroll: true });
        if (window.matchMedia('(max-width: 600px)').matches) panel.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
      list.append(card);
    }
  }
  function heading(name, description, status, eyebrow = 'PREPARED CONNECTION') {
    const top = node('div', 'panel-top');
    top.append(node('p', 'panel-eyebrow', eyebrow));
    const row = node('div', 'panel-title-row');
    const title = node('h2', 'panel-title', name); title.tabIndex = -1;
    row.append(title);
    if (status) row.append(node('span', 'badge badge-' + status, statusLabels[status] || 'Prepared'));
    top.append(row);
    if (description) top.append(node('p', 'panel-description', description));
    return top;
  }
  function accessDescription(connection) {
    const row = node('div', 'access-row');
    const icon = node('span', 'access-icon', 'i'); icon.setAttribute('aria-hidden', 'true');
    const text = node('div');
    text.append(node('p', 'small-label', 'What this connection allows'), node('p', 'small-copy', connection.accessDescription || 'Access depends on the permissions granted to your API key. Ask your dot to confirm the scope before connecting.'));
    row.append(icon, text);
    return row;
  }
  function renderKeyForm(connection, body) {
    const url = destination(connection);
    const replacing = connection.status === 'ready' || connection.source === 'saved' || connection.source === 'hosted';
    if (!state.storageAvailable || !connection.canSave) {
      body.append(banner(!state.storageAvailable ? 'Key saving isn’t available yet. Ask your dot to finish setting up private server storage, then refresh this page.' : 'This connection doesn’t accept a key here. Ask your dot to review its setup.', 'warning'));
      body.append(advancedDetails(connection));
      return;
    }
    if (!url) {
      body.append(banner('The destination needs review. Ask your dot to prepare a verified HTTPS API address before you add a key.', 'warning'));
      body.append(advancedDetails(connection));
      return;
    }
    const explainer = node('p', 'key-explainer');
    explainer.append(node('strong', '', 'An API key is a private access code. '), document.createTextNode('It lets this bridge use the service with the permissions you give it. Paste it here, never in chat.'));
    body.append(explainer);
    const helpUrl = safeHttpsUrl(connection.keyHelpUrl);
    if (helpUrl) {
      const help = node('a', 'help-link', 'Get a key from ' + connection.name);
      help.href = helpUrl.href; help.target = '_blank'; help.rel = 'noopener noreferrer';
      body.append(help);
    }
    if (connection.keyHelpText) body.append(node('p', 'help-copy', connection.keyHelpText));
    else if (!helpUrl) body.append(node('p', 'help-copy', 'No verified key-help link has been prepared. Ask your dot where to get a key for this service.'));
    const form = node('form');
    form.autocomplete = 'off';
    const labels = node('div', 'key-label-row');
    const label = node('label', 'field-label', connection.id === 'cookiejar' ? 'Cookiejar account sites key' : replacing ? 'New API key' : 'API key'); label.htmlFor = 'api-key';
    labels.append(label, node('span', 'private-chip', 'Hidden as you type'));
    const input = node('input', 'key-field');
    input.id = 'api-key'; input.type = 'password'; input.autocomplete = 'new-password'; input.spellcheck = false; input.required = true; input.maxLength = 16384;
    input.setAttribute('autocapitalize', 'none'); input.setAttribute('aria-describedby', 'key-privacy'); input.placeholder = 'Paste your key here';
    input.setAttribute('data-1p-ignore', 'true'); input.setAttribute('data-lpignore', 'true');
    form.append(labels, input);
    const checkLabel = node('label', 'destination-check');
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.required = true; checkbox.id = 'confirm-destination';
    const checkText = node('span');
    checkText.append(document.createTextNode('Allow this bridge to use my key with '), node('strong', '', url.hostname), document.createTextNode('.'));
    checkLabel.append(checkbox, checkText); form.append(checkLabel);
    const buttons = node('div', 'button-row');
    const submit = node('button', 'btn btn-primary', actionLabel(replacing ? 'Replace & test' : 'Save & test', 'key'));
    submit.type = 'submit'; submit.disabled = isBusy() || state.offline || state.loadError;
    if (state.pending?.action === 'key') { const spin = node('span', 'spinner'); spin.setAttribute('aria-hidden', 'true'); submit.prepend(spin); }
    buttons.append(submit);
    if (state.mode === 'key') buttons.append(button('Cancel', '', () => { input.value = ''; state.mode = 'view'; state.notice = null; render(); }));
    form.append(buttons);
    const privacy = node('p', 'postscript', replacing ? 'The new key replaces the key used by this bridge. Your current key is never shown.' : 'Saved on this private Site’s server. Administrators with database access may read stored keys.');
    privacy.id = 'key-privacy'; form.append(privacy);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (isBusy() || state.offline || state.loadError || !form.reportValidity()) return;
      const key = input.value;
      input.value = '';
      if (!key.trim()) { announce('Paste an API key before saving.'); input.focus(); return; }
      mutate(connection, 'key', { key, test: true });
    });
    body.append(form, advancedDetails(connection));
  }
  function renderReady(connection, body) {
    const box = node('div', 'ready-box');
    const mark = node('span', 'ready-mark'); mark.setAttribute('aria-hidden', 'true');
    const copy = node('div');
    copy.append(node('p', 'ready-title', connection.lastTest?.ok === true ? 'Connection checked' : 'Ready for your dot'));
    copy.append(node('p', 'ready-copy', connection.source === 'hosted' ? 'This connection is already provided by the bridge. There’s no need to enter a key.' : connection.lastTest?.ok === true ? 'Your connection is ready to use. Your key will stay hidden.' : connection.lastTest?.message || 'The connection is saved. A verified API check hasn’t been run.'));
    box.append(mark, copy); body.append(box);
    body.append(node('h3', 'next-step', 'Tell your dot what to do'), node('p', 'small-copy', 'Go back to your conversation and ask for what you need. Include this handoff so your dot knows which connection to use.'));
    const handoff = 'Use my ' + connection.name + ' connection in the private API bridge at ' + location.origin + '. Connection ID: ' + connection.id + '. Ask me what I want to do if I haven’t already told you. Never ask me to paste the API key in chat.';
    const card = node('div', 'handoff-card');
    card.append(node('p', 'handoff-label', 'YOUR HANDOFF'), node('p', 'handoff-text', '“Use my ' + connection.name + ' connection in this private bridge.”'));
    const buttons = node('div', 'button-row'); buttons.append(copyButton(handoff, 'Copy handoff', body)); card.append(buttons); body.append(card);
    connectionActions(connection, body);
    body.append(advancedDetails(connection));
  }
  function connectionActions(connection, body) {
    const actions = node('div', 'connection-actions');
    const test = button(actionLabel('Test connection', 'test'), 'btn-text', () => mutate(connection, 'test'));
    test.disabled = state.offline || state.loadError || isBusy(); actions.append(test);
    if (connection.canSave && state.storageAvailable) actions.append(button('Replace key', 'btn-text', () => { state.mode = 'key'; state.notice = null; state.disconnectConfirm = false; render(); $('api-key')?.focus(); }));
    const disconnect = button('Disconnect', 'btn-text btn-danger', () => { state.disconnectConfirm = !state.disconnectConfirm; renderPanel(); panel.querySelector('#disconnect-title')?.focus(); });
    disconnect.disabled = state.offline || state.loadError || isBusy(); actions.append(disconnect); body.append(actions);
    if (state.disconnectConfirm) {
      const confirm = node('div', 'disconnect-box');
      const title = node('h3', '', 'Disconnect ' + connection.name + '?'); title.id = 'disconnect-title'; title.tabIndex = -1;
      confirm.append(title, node('p', '', 'This removes or disables this bridge’s connection. It does not revoke the API key at the provider. To revoke the key everywhere, use the provider’s account settings.'));
      const buttons = node('div', 'button-row');
      buttons.append(button(actionLabel('Disconnect this bridge', 'disconnect'), 'btn-danger', () => mutate(connection, 'disconnect')), button('Keep connection', '', () => { state.disconnectConfirm = false; renderPanel(); }));
      confirm.append(buttons); body.append(confirm);
    }
  }
  function renderAttention(connection, body) {
    const warning = banner(connection.lastTest?.message || 'The connection needs a check. Retry the test, or replace the key if it has expired or was revoked.', 'warning');
    const content = node('span', '', ''); warning.append(content); body.append(warning);
    if (connection.source === 'saved' || connection.source === 'hosted') {
      const retry = button(actionLabel('Retry test', 'test'), 'btn-primary', () => mutate(connection, 'test'));
      retry.disabled = state.offline || state.loadError || isBusy();
      const row = node('div', 'button-row'); row.append(retry);
      if (connection.canSave && state.storageAvailable) row.append(button('Replace key', '', () => { state.mode = 'key'; state.notice = null; render(); $('api-key')?.focus(); }));
      body.append(row);
      body.append(node('p', 'postscript', 'A failed check doesn’t revoke your key. Review the service’s permissions or try again.'));
      connectionActions(connection, body); body.append(advancedDetails(connection));
    } else renderKeyForm(connection, body);
  }
  function field(form, labelText, id, type = 'text', required = false, hint) {
    const wrap = node('div'); const label = node('label', 'field-label', labelText); label.htmlFor = id;
    const input = node(type === 'textarea' ? 'textarea' : 'input'); input.id = id; input.name = id;
    if (type !== 'textarea') input.type = type;
    input.required = required; input.maxLength = 1500; input.autocomplete = 'off';
    wrap.append(label, input); if (hint) { const help = node('p', 'field-hint', hint); help.id = id + '-hint'; input.setAttribute('aria-describedby', help.id); wrap.append(help); }
    form.append(wrap); return input;
  }
  function manualFallback(body) {
    const details = node('details', 'advanced'); details.append(node('summary', '', 'Advanced: prepare a connection manually'));
    const inner = node('div', 'advanced-content');
    inner.append(node('p', 'help-copy', 'Use only verified provider documentation. This saves connection settings without a key. You’ll review the destination before adding the key.'));
    const form = node('form', 'manual-form');
    const name = field(form, 'Service name', 'manual-name', 'text', true); name.maxLength = 100;
    if (intent() && !/^https?:/i.test(intent())) name.value = intent().slice(0, 100);
    const baseUrl = field(form, 'HTTPS API base URL', 'manual-base-url', 'url', true, 'The API destination, not the provider’s homepage. No keys, credentials, or query parameters.');
    const typeWrap = node('div'); const typeLabel = node('label', 'field-label', 'Authentication'); typeLabel.htmlFor = 'manual-auth';
    const type = node('select'); type.id = 'manual-auth';
    for (const [value, label] of [['bearer', 'Bearer token (Authorization)'], ['api-key', 'API key (X-API-Key)'], ['custom', 'Custom header']]) { const option = node('option', '', label); option.value = value; type.append(option); }
    typeWrap.append(typeLabel, type); form.append(typeWrap);
    const custom = node('div'); custom.hidden = true;
    const customHeader = field(custom, 'Header name', 'manual-header', 'text', false, 'For example, a header name specified in the official API docs. Never put the key here.');
    const customPrefix = field(custom, 'Header prefix (optional)', 'manual-prefix', 'text', false, 'Static prefix only. A trailing space is preserved. Leave empty if the key is the whole header value.');
    form.append(custom); type.addEventListener('change', () => { custom.hidden = type.value !== 'custom'; customHeader.required = type.value === 'custom'; });
    const keyHelp = field(form, 'Official key-help link (optional)', 'manual-key-help', 'url');
    const access = field(form, 'What will this key allow?', 'manual-access', 'textarea', true);
    const manualError = node('p', 'field-hint'); manualError.setAttribute('role', 'alert'); manualError.hidden = true; form.append(manualError);
    const buttons = node('div', 'button-row');
    const submit = node('button', 'btn', actionLabel('Prepare connection', 'prepare')); submit.type = 'submit'; submit.disabled = state.offline || state.loadError || isBusy(); buttons.append(submit); form.append(buttons);
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); if (isBusy() || !form.reportValidity()) return;
      if ([name.value, customHeader.value, customPrefix.value, keyHelp.value, access.value].some(looksLikeKey)) { manualError.textContent = 'That looks like a key. Prepare the service without a key, then use its private key box.'; manualError.hidden = false; return; }
      const url = safeHttpsUrl(baseUrl.value.trim()); const help = keyHelp.value.trim();
      if (!url || url.search || url.hash || (help && !safeHttpsUrl(help))) { manualError.textContent = 'Use HTTPS links without embedded credentials. The API URL must not contain query parameters or a fragment.'; manualError.hidden = false; return; }
      const authHeader = type.value === 'bearer' ? 'Authorization' : type.value === 'api-key' ? 'X-API-Key' : customHeader.value.trim();
      const authPrefix = type.value === 'bearer' ? 'Bearer ' : type.value === 'custom' ? customPrefix.value : '';
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,80}$/.test(authHeader) || /[\r\n]/.test(authPrefix)) { manualError.textContent = 'Use a valid HTTP header name and a single-line prefix from the official documentation.'; manualError.hidden = false; return; }
      await prepare({ name: name.value.trim(), baseUrl: url.href, authHeader, authPrefix, keyHelpUrl: help || undefined, accessDescription: access.value.trim() });
    });
    inner.append(form); details.append(inner); body.append(details);
  }
  function renderUnknown() {
    if (state.intentBlocked) {
      panel.append(heading('Keep your key private', 'Choose a service first, then use its private key box.', null, 'PRIVATE KEY ENTRY'));
      const body = node('div', 'panel-body');
      const warning = banner('That looks like a key. It was cleared from the search box. Choose a service first, then paste it into that service’s private key box.', 'warning'); warning.setAttribute('role', 'alert');
      body.append(warning, node('p', 'small-copy', 'Nothing was sent or saved. Service names, websites, and agent-instructions links go in the search box. API keys belong only in the hidden key field.')); panel.append(body); return;
    }
    const value = intent();
    panel.append(heading(value ? 'Let’s prepare your connection' : 'Start with a service', value ? 'Your dot can handle the API details. You’ll add the key here when it’s ready.' : 'You don’t need to know how an API works to get started.', null, 'A LITTLE SETUP, THEN YOU’RE CONNECTED'));
    const body = node('div', 'panel-body');
    const icon = node('div', 'empty-symbol', '+'); icon.setAttribute('aria-hidden', 'true'); body.append(icon);
    body.append(node('h3', 'empty-title', value ? 'Ask your dot about this service' : 'Which service would you like to use?'));
    body.append(node('p', 'unknown-text', value ? 'Copy the request below into your conversation. Your dot will look for official instructions and prepare the connection settings.' : 'Enter its name, website, or agent-instructions link above. Your dot can find the official API instructions and prepare a connection for you.'));
    if (value) {
      const prompt = 'I want to connect this service to my private API bridge: ' + value + '\n\nThe bridge is at ' + location.origin + '. Find and read the service’s official agent or API documentation. Confirm whether API access and keys are available to me, identify the verified provider API base URL and authentication header format, and prepare a non-secret connection draft in this bridge with a clear access description and verified key-help link. Tell me if access is restricted or unavailable. Do not ask me to paste an API key in chat. I will review the destination and enter my key in the private bridge.';
      const row = node('div', 'button-row'); row.append(copyButton(prompt, 'Copy request for your dot', body)); body.append(row);
      body.append(node('p', 'postscript', 'This page doesn’t discover services or run an agent. Your dot prepares the settings, then you return here.'));
    }
    const steps = node('ol', 'steps');
    for (const [title, detail] of [['Your dot prepares the service.', 'It checks the official API and key instructions.'], ['You add a key privately.', 'Review the destination, then paste the key here.'], ['Ask your dot for what you need.', 'Your dot uses the prepared connection.']]) { const li = node('li'); const text = node('span'); text.append(node('strong', '', title + ' '), document.createTextNode(detail)); li.append(text); steps.append(li); }
    body.append(steps); manualFallback(body); panel.append(body);
  }
  function renderPanel() {
    panel.replaceChildren();
    if (state.loading && !state.loaded) {
      const body = node('div', 'loading-content');
      const title = node('div', 'skeleton skeleton-title'); title.setAttribute('aria-hidden', 'true'); body.append(title);
      for (let i = 0; i < 3; i++) { const line = node('div', 'skeleton skeleton-line'); line.setAttribute('aria-hidden', 'true'); body.append(line); }
      const loading = node('p', 'loading-status', 'Loading your connections…'); const spin = node('span', 'spinner'); spin.setAttribute('aria-hidden', 'true'); loading.prepend(spin); body.append(loading); panel.append(body); return;
    }
    const connection = selected();
    if (state.intentBlocked || !connection || !filtered().some((c) => c.id === connection.id)) { renderUnknown(); applyBusy(); return; }
    panel.append(heading(connection.name, connection.description, connection.status));
    const body = node('div', 'panel-body');
    if (state.notice?.id === connection.id) { const notice = banner(state.notice.text, state.notice.tone); notice.setAttribute('role', state.notice.tone === 'error' ? 'alert' : 'status'); body.append(notice); }
    body.append(accessDescription(connection));
    if (state.mode === 'key') renderKeyForm(connection, body);
    else if (connection.status === 'ready') renderReady(connection, body);
    else if (connection.status === 'needs_attention') renderAttention(connection, body);
    else renderKeyForm(connection, body);
    panel.append(body); applyBusy();
  }
  function render() { renderNetwork(); renderList(); renderPanel(); applyBusy(); }
  async function api(path, payload) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(path, { method: payload === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal, ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json', 'X-Bridge-UI': '1' }, body: JSON.stringify(payload) }) });
      let data; try { data = await response.json(); } catch { data = {}; }
      return { ok: response.ok, status: response.status, data };
    } finally { clearTimeout(timer); }
  }
  async function loadConnections(options = {}) {
    if (state.loading && state.loaded) return false;
    state.loading = true; renderNetwork(); if (!state.loaded) render();
    try {
      const response = await api('/api/connections');
      if (!response.ok || !Array.isArray(response.data.connections)) throw new Error('Load failed');
      state.connections = response.data.connections.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
      state.storageAvailable = response.data.storageAvailable === true; state.loaded = true; state.loadError = false; state.offline = !navigator.onLine;
      if (options.selectId) state.selectedId = options.selectId;
      if (preparedSelectionPending && !options.selectId && !state.connections.some((c) => c.id === requestedConnection)) { state.selectedId = null; search.value = requestedConnection; }
      else if (!state.connections.some((c) => c.id === state.selectedId)) state.selectedId = filtered()[0]?.id || null;
      preparedSelectionPending = false;
      return true;
    } catch { state.loadError = true; return false; }
    finally { state.loading = false; render(); }
  }
  function failureMessage(status, action, data = {}) {
    // Only fixed diagnostic codes and a bounded HTTP number are trusted. Never show response text.
    const messages = {
      key_format: 'The key format was rejected before contacting the provider. Paste only the key, without spaces, extra lines, quotes, or a Bearer prefix. Nothing was saved.',
      provider_rejected: 'The provider rejected the connection check. Check that this is the required account key and that its permissions allow the check. Your existing connection was not replaced.',
      provider_redirect: 'The provider redirected the check. The bridge refused to forward your key. Ask your dot to check the API address. Nothing was saved.',
      provider_network: 'The provider check hit a connection error or timeout. Nothing was saved. Try later or ask your dot to check the service.',
      provider_response: 'The provider responded, but the bridge could not safely process its response. Nothing was saved. Ask your dot to check the integration.',
      check_configuration: 'The bridge could not prepare the provider check. Nothing was saved. Ask your dot to repair the connection setup.',
      storage_unavailable: 'The bridge storage step failed. Refresh to check whether anything was saved before trying again. Ask your dot to check the Site storage.'
    };
    if (Object.hasOwn(messages, data?.code)) return messages[data.code];
    if (data?.code === 'provider_http') return 'The provider check returned HTTP ' + (Number.isInteger(data.providerStatus) && data.providerStatus >= 100 && data.providerStatus <= 599 ? data.providerStatus : 'error') + '. Nothing was saved. Ask your dot to check this response.';
    if (status === 401 || status === 403) return 'This request wasn’t authorized. Refresh the private Site and sign in if asked, then try again.';
    if (status === 409) return 'The connection settings changed. Review the updated destination before trying again.';
    if (status === 429) return 'Too many requests. Wait a moment, then try again.';
    if (status === 413) return 'That key is too long for this bridge. Check that you copied only the API key.';
    if (action === 'key') return 'The bridge request failed (HTTP ' + status + '). Refresh to check the connection before retrying, and tell your dot this status. This does not establish that the key is wrong.';
    if (action === 'test') return 'The check didn’t pass. Check the service’s status and key permissions, then retry or replace the key.';
    return 'The bridge couldn’t complete that change. Refresh to check the current connection before trying again.';
  }
  async function mutate(connection, action, extra = {}) {
    if (isBusy() || state.offline || state.loadError) return;
    state.pending = { id: connection.id, action }; state.notice = null; render();
    announce(action === 'key' ? 'Saving the key and checking the connection.' : action === 'test' ? 'Checking the connection.' : 'Disconnecting the bridge.');
    try {
      const response = await api('/api/connections/' + encodeURIComponent(connection.id) + '/' + action, { ...extra, expectedBinding: connection.binding });
      // Display only recognized fixed diagnostic codes, never raw mutation/provider messages.
      if (!response.ok) {
        state.notice = { id: connection.id, text: failureMessage(response.status, action, response.data), tone: 'error' };
        if (response.status === 409) await loadConnections();
      } else {
        state.mode = 'view'; state.disconnectConfirm = false;
        const refreshed = await loadConnections();
        if (refreshed) {
          const current = selected();
          state.notice = action === 'disconnect' ? { id: connection.id, text: 'Disconnected from this bridge. The provider’s key has not been revoked.', tone: 'info' } : current?.status === 'needs_attention' ? null : { id: connection.id, text: action === 'key' ? 'Your key is saved and hidden.' : current?.lastTest?.ok === true ? 'The connection check passed.' : 'The bridge checked the connection setup. See its status below.', tone: 'info' };
          if (current?.status === 'ready' && (action === 'key' || (action === 'test' && current.lastTest?.ok === true))) pulseConnection();
        }
        announce(action === 'disconnect' ? 'Bridge disconnected. The provider key has not been revoked.' : refreshed && selected()?.status === 'ready' ? 'Connection ready.' : 'The request finished. Review the connection status.');
      }
    } catch {
      state.notice = { id: connection.id, text: 'The response didn’t arrive. The change may have completed. Refresh to check its status before trying again. For your privacy, the key field has been cleared.', tone: 'error' };
      state.loadError = true;
    } finally { state.pending = null; render(); }
  }
  async function prepare(payload) {
    if (isBusy() || state.offline || state.loadError) return;
    state.pending = { action: 'prepare' }; applyBusy();
    try {
      const response = await api('/api/connections/prepare', payload);
      if (!response.ok) {
        const error = panel.querySelector('.manual-form [role="alert"]');
        if (error) { error.hidden = false; error.textContent = response.status === 409 ? 'A connection with these settings may already exist. Refresh and check prepared services.' : 'These settings couldn’t be prepared. Check the official API URL and header details, then try again.'; }
        return;
      }
      search.value = ''; state.mode = 'view'; await loadConnections({ selectId: response.data.connection?.id }); announce('Connection prepared. Review the destination before adding a key.');
    } catch {
      const error = panel.querySelector('.manual-form [role="alert"]'); if (error) { error.hidden = false; error.textContent = 'No response arrived. Refresh to see whether the draft was prepared before trying again.'; } state.loadError = true;
    } finally {
      state.pending = null;
      panel.querySelectorAll('[data-busy-disabled]').forEach((control) => { control.disabled = false; delete control.dataset.busyDisabled; });
      search.disabled = false; panel.setAttribute('aria-busy', 'false'); const prepareButton = panel.querySelector('.manual-form button'); if (prepareButton) prepareButton.disabled = state.offline || state.loadError; renderNetwork(); renderList();
    }
  }
  search.addEventListener('paste', (event) => {
    if (looksLikeKey(event.clipboardData?.getData('text') || '')) { event.preventDefault(); search.value = ''; state.intentBlocked = true; renderList(); renderPanel(); announce('That looks like a key. Choose a service first, then use its private key box.'); }
  });
  search.addEventListener('input', () => {
    if (isBusy()) return;
    state.intentBlocked = looksLikeKey(search.value);
    if (state.intentBlocked) { search.value = ''; renderList(); renderPanel(); announce('That looks like a key. Choose a service first, then use its private key box.'); return; }
    const matches = filtered();
    if (!matches.some((c) => c.id === state.selectedId)) state.selectedId = matches[0]?.id || null;
    state.mode = 'view'; state.notice = null; state.disconnectConfirm = false; renderList(); renderPanel();
  });
  window.addEventListener('offline', () => { state.offline = true; render(); announce('You’re offline. Reconnect before making changes.'); });
  window.addEventListener('online', () => { state.offline = false; loadConnections(); });
  window.addEventListener('pagehide', () => { const input = $('api-key'); if (input) input.value = ''; });
  window.addEventListener('pageshow', (event) => { if (event.persisted) { const input = $('api-key'); if (input) input.value = ''; loadConnections(); } });
  render(); loadConnections();
})();

// Event-driven energy: a fixed pool, no idle loop, storage, or sensor access.
(() => {
  const background = document.getElementById('space-background');
  if (!background || !window.matchMedia) return;
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)');
  const layer = document.createElement('div'); layer.className = 'space-energy'; background.append(layer);
  const traces = Array.from({ length: 12 }, () => { const el = document.createElement('span'); el.className = 'space-energy-trace'; layer.append(el); return el; });
  let previous = null, lastPaint = -Infinity, index = 0;
  const reset = () => { previous = null; lastPaint = -Infinity; for (const el of traces) delete el.dataset.flash; };
  window.addEventListener('pointermove', event => {
    if (!motion.matches || document.hidden || event.pointerType !== 'mouse') { reset(); return; }
    const point = { x: event.clientX, y: event.clientY, t: event.timeStamp };
    if (!Number.isFinite(point.x + point.y + point.t)) return;
    if (!previous || point.t - previous.t > 160) { previous = point; return; }
    if (point.t - lastPaint < 32) return;
    const dx = point.x - previous.x, dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy), elapsed = Math.max(8, point.t - previous.t);
    if (distance < 2) return;
    const length = Math.min(distance, 180), speed = Math.min(2.5, distance / elapsed);
    const el = traces[index++ % traces.length];
    el.style.width = (length + 100).toFixed(1) + 'px';
    el.style.transform = 'translate(' + (point.x - dx * length / distance - 50).toFixed(1) + 'px,' + (point.y - dy * length / distance - 50).toFixed(1) + 'px) rotate(' + Math.atan2(dy, dx).toFixed(4) + 'rad)';
    el.style.setProperty('--energy', (.12 + speed * .22).toFixed(3));
    el.dataset.flash = el.dataset.flash === 'a' ? 'b' : 'a';
    previous = point; lastPaint = point.t;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  motion.addEventListener('change', reset);
})();
