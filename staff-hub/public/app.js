// Staff hub page. Google sign-in → ID token → GET /.netlify/functions/tools.
// The server verifies the token; nothing here is trusted for access.
(function () {
  'use strict';

  var CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  var TOKEN_KEY = 'ah_staff_id_token';
  var STATUS_LABEL = { setup: 'Setting up', build: 'In build' };
  var SVG = 'http://www.w3.org/2000/svg';

  // Line icons (24px grid, 2px stroke). Picked by tool name; unknown → box.
  var ICONS = {
    quote: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4',
    trader: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4',
    handover: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    asset: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
    sync: 'M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4',
    booking: 'M3 5h18v15H3zM3 10h18M8 3v4M16 3v4M7 14h3M7 17h6',
    crm: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14a6 6 0 0 1 3 6',
    invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
    bank: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18M12 3 3 8h18z',
    mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
    calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
    folder: 'M3 6h6l2 2h10v11H3z',
    web: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
    vault: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
    box: 'M4 4h16v16H4z',
  };
  var ICON_FOR = [
    [/quote/i, 'quote'], [/trader/i, 'trader'], [/handover/i, 'handover'], [/asset/i, 'asset'],
    [/to xero/i, 'sync'], [/booqable/i, 'booking'], [/attio/i, 'crm'], [/xero/i, 'invoice'],
    [/revolut|bank/i, 'bank'], [/gmail|mail/i, 'mail'], [/calendar/i, 'calendar'], [/drive/i, 'folder'],
    [/webflow|website/i, 'web'], [/vault/i, 'vault'],
  ];

  var $ = function (id) { return document.getElementById(id); };

  function store(get, value) {
    try {
      if (get) return sessionStorage.getItem(TOKEN_KEY);
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode: sign in each visit */ }
    return null;
  }

  function show(view) {
    $('loading').hidden = view !== 'loading';
    $('signIn').hidden = view !== 'signIn';
    $('hub').hidden = view !== 'hub';
    $('hero').hidden = view !== 'hub';
    $('who').hidden = view !== 'hub';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function svg(d, size) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 20);
    s.setAttribute('height', size || 20);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    var p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  function iconFor(name) {
    for (var i = 0; i < ICON_FOR.length; i++) if (ICON_FOR[i][0].test(name)) return ICONS[ICON_FOR[i][1]];
    return ICONS.box;
  }

  function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  var tileIndex = 0;
  function card(tool) {
    var live = tool.status === 'live' && /^https:\/\//.test(tool.url || '');
    var c = el(live ? 'a' : 'div', 'card' + (live ? '' : ' off'));
    if (live) {
      c.href = tool.url;
      c.target = '_blank';
      c.rel = 'noopener noreferrer';
      c.setAttribute('aria-label', tool.name + ' (opens in a new tab)');
    }
    var inner = el('span', 'card-in');
    var top = el('span', 'card-top');
    var icon = el('span', 'card-icon');
    icon.appendChild(svg(iconFor(tool.name)));
    top.appendChild(icon);
    if (live) {
      var arrow = svg('M7 17 17 7M8 7h9v9');
      arrow.setAttribute('class', 'card-arrow');
      top.appendChild(arrow);
    }
    inner.appendChild(top);
    inner.appendChild(el('span', 'card-name', tool.name));
    inner.appendChild(el('span', 'card-what', tool.what));
    if (live) inner.appendChild(el('span', 'card-host', hostOf(tool.url)));
    else inner.appendChild(el('span', 'tag', STATUS_LABEL[tool.status] || 'Not live'));
    c.appendChild(inner);

    var li = el('li', 'enter');
    li.style.setProperty('--i', String(tileIndex++));
    li.dataset.search = (tool.name + ' ' + tool.what + ' ' + (tool.url || '')).toLowerCase();
    li.appendChild(c);
    return li;
  }

  function greeting(name) {
    var h = new Date().getHours();
    var part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
    var first = String(name || '').trim().split(/\s+/)[0];
    // Shared mailboxes sign in as "Acme Hire" — no first name to use.
    return first && !/^box$/i.test(first) ? part + ', ' + first + '.' : part + '.';
  }

  function render(data) {
    var root = $('groups');
    root.textContent = '';
    tileIndex = 0;
    data.groups.forEach(function (g, gi) {
      var section = el('section', 'group');
      var head = el('div', 'group-head');
      var title = el('h2', '', g.title);
      title.id = 'g' + gi;
      head.appendChild(title);
      head.appendChild(el('span', 'count', String(g.tools.length).padStart(2, '0')));
      section.appendChild(head);
      var ul = el('ul', 'grid' + (gi === 0 ? ' featured' : ''));
      ul.setAttribute('aria-labelledby', title.id);
      g.tools.forEach(function (t) { ul.appendChild(card(t)); });
      section.appendChild(ul);
      root.appendChild(section);
    });
    $('whoEmail').textContent = data.user.email;
    $('greeting').textContent = greeting(data.user.name);
    $('today').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    $('vaultNote').hidden = Boolean(data.isVaultAdmin);
    $('filter').value = '';
    show('hub');
  }

  // ── Filter ──────────────────────────────────────────
  function applyFilter() {
    var q = $('filter').value.trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#groups .group'), function (section) {
      var visible = 0;
      Array.prototype.forEach.call(section.querySelectorAll('li'), function (li) {
        var hit = !q || li.dataset.search.indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) { visible++; li.classList.remove('enter'); }
      });
      section.hidden = visible === 0;
      shown += visible;
    });
    var none = $('noMatch');
    none.hidden = shown > 0;
    if (!shown) {
      none.textContent = '';
      none.appendChild(document.createTextNode('No tool matches '));
      none.appendChild(el('strong', '', '“' + $('filter').value.trim() + '”'));
      none.appendChild(document.createTextNode('. Try a shorter word.'));
    }
  }
  $('filter').addEventListener('input', applyFilter);
  $('filter').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { this.value = ''; applyFilter(); this.blur(); }
    if (e.key === 'Enter') {
      var first = document.querySelector('#groups li:not([hidden]) a.card');
      if (first) { e.preventDefault(); window.open(first.href, '_blank', 'noopener'); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || $('hub').hidden) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    $('filter').focus();
  });

  // ── Sign-in ─────────────────────────────────────────
  function signInView(message) {
    store(false, null);
    $('signInMsg').textContent = message || '';
    show('signIn');
    renderButton();
  }

  function load(token) {
    show('loading');
    fetch('/.netlify/functions/tools', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.json().then(function (body) { return { status: r.status, body: body }; }); })
      .then(function (res) {
        if (res.status === 200) { store(false, token); render(res.body); return; }
        signInView(res.status === 401 ? '' : (res.body && res.body.error) || 'Could not load tools.');
      })
      .catch(function () { signInView('Could not reach the server. Check your connection and try again.'); });
  }

  var gsiReady = false;
  function initGsi() {
    if (gsiReady || !window.google || !google.accounts || !google.accounts.id) return gsiReady;
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: function (resp) { load(resp.credential); },
      hd: 'acmehire.example',
      auto_select: true,
    });
    gsiReady = true;
    return true;
  }

  function renderButton() {
    if (!initGsi()) { setTimeout(renderButton, 200); return; }
    google.accounts.id.renderButton($('gsiButton'), { theme: 'filled_black', size: 'large', text: 'signin_with', width: 280 });
    google.accounts.id.prompt();
  }

  $('signOut').addEventListener('click', function () {
    if (gsiReady) google.accounts.id.disableAutoSelect();
    signInView('Signed out.');
  });

  var saved = window.__AH_DEV_TOKEN || store(true);
  if (saved) load(saved); else signInView('');
})();
