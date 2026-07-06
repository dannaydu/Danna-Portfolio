/* ============================================================================
 * nav.js — progressively enhances the shared .topnav into a modern nav:
 *   • adds a brand wordmark (links home)
 *   • wraps the existing links in a collapsible group
 *   • adds a hamburger toggle for mobile
 *   • lifts the bar out of the padded container so it spans full width
 * Works on every page without changing per-page nav markup.
 * ==========================================================================*/
(function () {
  function initNav() {
    var nav = document.querySelector('.topnav');
    if (!nav || nav.dataset.enhanced) return;
    nav.dataset.enhanced = '1';

    // grab the existing nav links in order
    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));

    // brand
    var brand = document.createElement('a');
    brand.className = 'nav-brand';
    brand.href = 'index.html';
    brand.textContent = 'Danna Duarte';

    // collapsible links group
    var group = document.createElement('div');
    group.className = 'nav-links';
    links.forEach(function (a) { group.appendChild(a); });

    // hamburger
    var toggle = document.createElement('button');
    toggle.className = 'nav-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Toggle navigation menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';

    // reassemble: brand | toggle(mobile) | links
    nav.textContent = '';
    nav.appendChild(brand);
    nav.appendChild(toggle);
    nav.appendChild(group);

    // lift to the top of <body> so the sticky bar is full-bleed
    if (nav.parentElement !== document.body) {
      document.body.insertBefore(nav, document.body.firstChild);
    }

    function close() {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    group.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 760) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
