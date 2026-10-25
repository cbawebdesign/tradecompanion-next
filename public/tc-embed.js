/*!
 * tc-embed.js — drop-in TradeCompanion controls for a page shown in TC's popup.
 *
 * Justin (10/24): "it would be absolutely amazing if auto hotkey could work
 * when clicking a symbol in a pop up window … and then add a flag / unflag
 * button next to the symbol along with a '+' to add the symbol to a watch
 * list … I would then just include whatever code is needed to the pages I
 * make that appear in the pop up windows."
 *
 * This is that code. On any page served from a tradecompanion.com subdomain:
 *
 *     <script src="https://trade-companion-next.vercel.app/tc-embed.js"></script>
 *
 * then mark each ticker on the page:
 *
 *     <span data-tc-symbol="AHTPI">AHTPI</span>
 *
 * Pages that already use data-sym (the shape his report generator emits:
 * <span class="tk" data-sym="DELL">DELL</span>) need NO markup change at all —
 * adding the script tag is the whole job. Those get the click behaviour only,
 * not buttons, because that markup appears on dense tables where fifty pairs
 * of buttons would be noise. Opt in with window.TC_EMBED = { controls: 'all' }.
 *
 * An existing page's own click handler keeps running and is harmless: its
 * direct fetch to localhost is the thing that does not work from inside a
 * frame, which is the whole reason this exists. Leaving it alone also leaves
 * its "Sent X to chart" toast working.
 *
 * You get, next to it: the ticker itself clickable (selects the symbol in TC
 * and fires AutoHotkey), a flag toggle that shows TC's real flag state, and a
 * "+" that adds the symbol to a watchlist.
 *
 * Optional per-element:
 *     data-tc-watchlist="Movers"   add to that list by name instead of the
 *                                  one currently selected in TC
 *     data-tc-controls="off"       make the ticker clickable, no buttons
 *
 * Optional page-wide, set BEFORE the script tag:
 *     <script>window.TC_EMBED = { controls: false, click: false }</script>
 *
 * Outside TC's popup this does nothing at all — no buttons, no listeners — so
 * the same page still works when opened in a normal browser tab.
 */
(function () {
  'use strict';

  // Only act inside a frame. A page opened directly in a tab has no TC to talk
  // to, and rendering dead buttons there would be worse than rendering none.
  if (window.top === window.self) return;

  var CFG = window.TC_EMBED || {};
  var WANT_CONTROLS = CFG.controls !== false;
  var WANT_CLICK = CFG.click !== false;
  // 'all' also puts buttons on legacy data-sym elements.
  var CONTROLS_ON_LEGACY = CFG.controls === 'all';
  var SELECTOR = '[data-tc-symbol],[data-sym]';

  // Every symbol element on the page, keyed by ticker, so a tc-state reply
  // repaints all of them at once — the same ticker often appears twice.
  var bySymbol = {};

  function send(msg) {
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* no parent */ }
  }

  function norm(raw) {
    return String(raw == null ? '' : raw).trim().replace(/^\$/, '').toUpperCase();
  }

  function btn(label, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('data-tc-btn', '');
    // Inline so the script needs no stylesheet and inherits the page's font.
    b.style.cssText = [
      'font:inherit', 'font-size:0.85em', 'line-height:1',
      'padding:2px 6px', 'margin-left:4px', 'cursor:pointer',
      'border:1px solid currentColor', 'border-radius:4px',
      'background:transparent', 'color:inherit', 'opacity:0.65'
    ].join(';');
    b.addEventListener('mouseenter', function () { b.style.opacity = '1'; });
    b.addEventListener('mouseleave', function () { b.style.opacity = b.getAttribute('data-tc-on') === '1' ? '1' : '0.65'; });
    return b;
  }

  function decorate(el) {
    if (el.getAttribute('data-tc-ready') === '1') return;
    var explicit = el.getAttribute('data-tc-symbol');
    var legacy = el.getAttribute('data-sym');
    var symbol = norm(explicit || legacy || el.textContent);
    if (!symbol) return;
    el.setAttribute('data-tc-ready', '1');
    var wantButtons = WANT_CONTROLS && (explicit != null || CONTROLS_ON_LEGACY);

    (bySymbol[symbol] = bySymbol[symbol] || []).push(el);

    if (WANT_CLICK) {
      el.style.cursor = 'pointer';
      if (!el.title) el.title = 'Select ' + symbol + ' in TradeCompanion';
      el.addEventListener('click', function (ev) {
        // Never swallow a click on a real link inside the element.
        if (ev.target && ev.target.closest && ev.target.closest('a,[data-tc-btn]')) return;
        send({ type: 'tc-symbol-click', symbol: symbol });
      });
    }

    if (!wantButtons || el.getAttribute('data-tc-controls') === 'off') {
      send({ type: 'tc-query', symbol: symbol });
      return;
    }

    var flag = btn('⚑', 'Flag / unflag ' + symbol + ' in TradeCompanion');
    flag.setAttribute('data-tc-flag', '');
    flag.addEventListener('click', function (ev) {
      ev.stopPropagation();
      send({ type: 'tc-flag', symbol: symbol });
    });

    var plus = btn('+', 'Add ' + symbol + ' to a watchlist');
    plus.setAttribute('data-tc-plus', '');
    plus.addEventListener('click', function (ev) {
      ev.stopPropagation();
      // A list pinned on the element skips the menu entirely — that element
      // has already decided where its symbol goes.
      var named = el.getAttribute('data-tc-watchlist');
      if (named) {
        plus.setAttribute('data-tc-pending', '1');
        send({ type: 'tc-watchlist-add', symbol: symbol, watchlist: named });
        return;
      }
      openMenu(plus, symbol);
    });

    // After the element, not inside it, so the page's own text is untouched.
    var host = document.createElement('span');
    host.setAttribute('data-tc-controls-for', symbol);
    host.style.whiteSpace = 'nowrap';
    host.appendChild(flag);
    host.appendChild(plus);
    if (el.parentNode) el.parentNode.insertBefore(host, el.nextSibling);

    // Ask for the real state so the flag starts out correct rather than empty.
    send({ type: 'tc-query', symbol: symbol });
  }

  // ---- "Add to ..." menu -------------------------------------------------
  //
  // Justin's bot offered to build this if TC would send the list. TC does
  // send it — tc-state has carried `watchlists` since the bridge shipped, and
  // tc-watchlists now asks for it without needing a symbol in hand — but
  // building the menu here means his pages need no further work at all.
  //
  // The list is re-fetched every time the menu OPENS, which is why TC does
  // not need to push updates when a list is added or renamed: a menu that
  // asks on open is never stale, and nothing has to stay subscribed.

  var openMenuEl = null;
  var pendingMenu = null;   // { symbol, button } awaiting a tc-watchlists reply

  function closeMenu() {
    if (openMenuEl && openMenuEl.parentNode) openMenuEl.parentNode.removeChild(openMenuEl);
    openMenuEl = null;
  }

  document.addEventListener('click', function () { closeMenu(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  function openMenu(button, symbol) {
    closeMenu();
    pendingMenu = { symbol: symbol, button: button };
    send({ type: 'tc-watchlists' });
  }

  function renderMenu(button, symbol, lists) {
    closeMenu();
    var menu = document.createElement('div');
    menu.setAttribute('data-tc-menu', '');
    menu.style.cssText = [
      'position:absolute', 'z-index:2147483647', 'min-width:170px',
      'max-height:60vh', 'overflow-y:auto', 'padding:4px 0',
      'border:1px solid rgba(128,128,128,.4)', 'border-radius:6px',
      // Readable on his dark reports without assuming a theme.
      'background:#1b1f27', 'color:#e6e9ef',
      'box-shadow:0 8px 24px rgba(0,0,0,.45)',
      'font:inherit', 'font-size:13px', 'text-align:left'
    ].join(';');
    menu.addEventListener('click', function (ev) { ev.stopPropagation(); });

    if (!lists.length) {
      var empty = document.createElement('div');
      empty.textContent = 'No watchlists';
      empty.style.cssText = 'padding:6px 12px;opacity:.6';
      menu.appendChild(empty);
    }

    for (var i = 0; i < lists.length; i++) {
      (function (name) {
        var row = document.createElement('div');
        row.textContent = name;
        row.setAttribute('role', 'button');
        row.style.cssText = 'padding:6px 12px;cursor:pointer;white-space:nowrap';
        row.addEventListener('mouseenter', function () { row.style.background = 'rgba(255,255,255,.08)'; });
        row.addEventListener('mouseleave', function () { row.style.background = 'transparent'; });
        row.addEventListener('click', function () {
          button.setAttribute('data-tc-pending', '1');
          send({ type: 'tc-watchlist-add', symbol: symbol, watchlist: name });
          closeMenu();
        });
        menu.appendChild(row);
      })(lists[i]);
    }

    // Positioned in page coordinates so it travels with the document rather
    // than detaching on scroll.
    var r = button.getBoundingClientRect();
    menu.style.left = (r.left + window.scrollX) + 'px';
    menu.style.top = (r.bottom + window.scrollY + 4) + 'px';
    document.body.appendChild(menu);
    openMenuEl = menu;

    // Nudge back inside the viewport if it would hang off the right edge.
    var mr = menu.getBoundingClientRect();
    if (mr.right > window.innerWidth - 8) {
      menu.style.left = Math.max(8, window.innerWidth - mr.width - 8 + window.scrollX) + 'px';
    }
  }

  // Briefly widen a button to carry a word, then put it back.
  function flash(el, text) {
    if (el.getAttribute('data-tc-flashing') === '1') return;
    el.setAttribute('data-tc-flashing', '1');
    var was = el.textContent;
    el.textContent = text;
    setTimeout(function () {
      el.textContent = was;
      el.removeAttribute('data-tc-flashing');
    }, 1600);
  }

  function scan(root) {
    var nodes = (root || document).querySelectorAll(SELECTOR);
    for (var i = 0; i < nodes.length; i++) decorate(nodes[i]);
  }

  // TC answers every verb with the symbol's current state. Paint it.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d) return;

    if (d.type === 'tc-watchlists' && Array.isArray(d.lists)) {
      if (!pendingMenu) return;
      var pm = pendingMenu;
      pendingMenu = null;
      renderMenu(pm.button, pm.symbol, d.lists);
      return;
    }

    if (d.type !== 'tc-state' || typeof d.symbol !== 'string') return;
    var lists = (d.onWatchlists && d.onWatchlists.length) ? d.onWatchlists : null;
    var els = bySymbol[d.symbol] || [];
    for (var i = 0; i < els.length; i++) {
      var host = els[i].nextSibling;
      if (!host || !host.getAttribute || host.getAttribute('data-tc-controls-for') !== d.symbol) continue;

      var f = host.querySelector('[data-tc-flag]');
      if (f) {
        f.setAttribute('data-tc-on', d.flagged ? '1' : '0');
        f.style.opacity = d.flagged ? '1' : '0.65';
        f.style.fontWeight = d.flagged ? '700' : 'inherit';
        f.title = (d.flagged ? 'Unflag ' : 'Flag ') + d.symbol + ' in TradeCompanion';
      }

      // The + used to repaint nothing at all, so a click that worked looked
      // exactly like a click that did not — Justin: "The + button doesn't seem
      // to be working properly." It was adding the symbol; there was simply no
      // acknowledgement, and with dozens of watchlists he had no way to tell
      // WHICH one it landed on. TC already reports both in every reply.
      var p = host.querySelector('[data-tc-plus]');
      if (p) {
        p.textContent = lists ? '✓' : '+';
        p.setAttribute('data-tc-on', lists ? '1' : '0');
        p.style.opacity = lists ? '1' : '0.65';
        p.style.fontWeight = lists ? '700' : 'inherit';
        p.title = lists
          ? d.symbol + ' is on: ' + lists.join(', ')
          : 'Add ' + d.symbol + ' to a watchlist';

        // Straight after a click, say WHERE it went, in text. A tooltip needs
        // a hover, and the question being answered is "did that do anything".
        if (p.getAttribute('data-tc-pending') === '1') {
          p.removeAttribute('data-tc-pending');
          flash(p, d.addedTo ? '✓ ' + d.addedTo : 'no watchlist');
        }
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(); });
  } else {
    scan();
  }

  // Pages that render their rows after load (most of his bots' output does)
  // would otherwise get no buttons at all.
  if (window.MutationObserver) {
    new MutationObserver(function () { scan(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  // Escape hatch for a page that builds its own UI.
  window.TradeCompanion = {
    select: function (s) { send({ type: 'tc-symbol-click', symbol: norm(s) }); },
    flag: function (s, on) {
      var m = { type: 'tc-flag', symbol: norm(s) };
      if (typeof on === 'boolean') m.on = on;
      send(m);
    },
    addToWatchlist: function (s, name) {
      var m = { type: 'tc-watchlist-add', symbol: norm(s) };
      if (name) m.watchlist = name;
      send(m);
    },
    watchlists: function () { send({ type: 'tc-watchlists' }); },
    query: function (s) { send({ type: 'tc-query', symbol: norm(s) }); },
    scan: scan
  };
})();
