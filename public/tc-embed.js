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
    var symbol = norm(el.getAttribute('data-tc-symbol') || el.textContent);
    if (!symbol) return;
    el.setAttribute('data-tc-ready', '1');

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

    if (!WANT_CONTROLS || el.getAttribute('data-tc-controls') === 'off') {
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
    plus.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var named = el.getAttribute('data-tc-watchlist');
      var msg = { type: 'tc-watchlist-add', symbol: symbol };
      if (named) msg.watchlist = named;
      send(msg);
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

  function scan(root) {
    var nodes = (root || document).querySelectorAll('[data-tc-symbol]');
    for (var i = 0; i < nodes.length; i++) decorate(nodes[i]);
  }

  // TC answers every verb with the symbol's current state. Paint it.
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'tc-state' || typeof d.symbol !== 'string') return;
    var els = bySymbol[d.symbol] || [];
    for (var i = 0; i < els.length; i++) {
      var host = els[i].nextSibling;
      if (!host || !host.getAttribute || host.getAttribute('data-tc-controls-for') !== d.symbol) continue;
      var f = host.querySelector('[data-tc-flag]');
      if (!f) continue;
      f.setAttribute('data-tc-on', d.flagged ? '1' : '0');
      f.style.opacity = d.flagged ? '1' : '0.65';
      f.style.fontWeight = d.flagged ? '700' : 'inherit';
      f.title = (d.flagged ? 'Unflag ' : 'Flag ') + d.symbol + ' in TradeCompanion';
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
    query: function (s) { send({ type: 'tc-query', symbol: norm(s) }); },
    scan: scan
  };
})();
