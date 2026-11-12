// Staff hub page. Google sign-in → ID token → GET /.netlify/functions/tools.
// The server verifies the token; nothing here is trusted for access.
(function () {
  'use strict';

  var CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  var TOKEN_KEY = 'ah_staff_id_token';
  var STATUS_LABEL = { setup: 'Setting up', build: 'In build' };

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
    $('who').hidden = view !== 'hub';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function card(tool) {
    var live = tool.status === 'live' && /^https:\/\//.test(tool.url || '');
    var c = el(live ? 'a' : 'div', 'card' + (live ? '' : ' off'));
    if (live) {
      c.href = tool.url;
      c.target = '_blank';
      c.rel = 'noopener noreferrer';
    }
    var name = el('span', 'card-name');
    name.appendChild(el('span', '', tool.name));
    if (live) name.appendChild(el('span', 'arrow', '↗'));
    c.appendChild(name);
    c.appendChild(el('span', 'card-what', tool.what));
    if (!live) c.appendChild(el('span', 'tag', STATUS_LABEL[tool.status] || 'Not live'));
    var li = el('li');
    li.appendChild(c);
    return li;
  }

  function render(data) {
    var root = $('groups');
    root.textContent = '';
    data.groups.forEach(function (g) {
      root.appendChild(el('h2', '', g.title));
      var ul = el('ul', 'grid');
      g.tools.forEach(function (t) { ul.appendChild(card(t)); });
      root.appendChild(ul);
    });
    $('whoEmail').textContent = data.user.email;
    $('vaultNote').hidden = Boolean(data.isVaultAdmin);
    show('hub');
  }

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

  var saved = window.__BK_DEV_TOKEN || store(true);
  if (saved) load(saved); else signInView('');
})();
