/* ==========================================================================
   JDS Sommer — interactions
   GSAP + ScrollTrigger for motion, Lenis for smooth scroll,
   Barba for app-like page transitions (only when served over http/https).
   Everything degrades: without the libraries the page is static and usable.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  // Page language: German pages (lang="de") get German UI strings
  var DE = /^de/i.test(root.lang);
  function t(en, de) { return DE ? de : en; }
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGSAP = !!window.gsap;
  var animate = hasGSAP && !reduceMotion;
  var lenis = null;
  var pageCtx = null;
  var pageCleanups = [];

  if (!animate) root.classList.remove('js', 'show-preloader');
  // Shown inside the review prototype: it has its own toolbar, so the variant switcher hides
  try { if (window.self !== window.top) root.classList.add('in-frame'); } catch (e) { root.classList.add('in-frame'); }
  if (hasGSAP && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }
  function headerOffset() { var h = $('[data-header] .header__inner'); return h ? h.offsetHeight + 12 : 80; }

  /* ---------- Smooth scroll ---------- */
  function initLenis() {
    if (!animate || !window.Lenis) return;
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target, immediate) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { offset: -headerOffset(), immediate: !!immediate, duration: 1.2 });
    else target.scrollIntoView({ behavior: immediate || reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // Same-page hash links (including "index.html#contact" while on index.html)
  function isSamePageHash(a) {
    if (!a || !a.href || a.target === '_blank') return false;
    var url = new URL(a.href, location.href);
    return url.hash && url.hash.length > 1 && url.pathname === location.pathname && url.origin === location.origin;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!isSamePageHash(a)) return;
    var target = document.getElementById(new URL(a.href).hash.slice(1));
    if (!target) return;
    e.preventDefault();
    closeMenu();
    scrollToTarget(target);
    if (history.replaceState) history.replaceState(null, '', '#' + target.id);
  });

  /* ---------- Header ---------- */
  /* ---------- Language switcher ---------- */
  function initLang() {
    var box = $('[data-lang]'), btn = $('[data-lang-btn]');
    if (!box || !btn) return;
    function set(open) { box.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); set(!box.classList.contains('is-open')); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('is-open')) { set(false); btn.focus(); } });
  }

  /* ---------- Page scrollbar: widen it while the pointer is over it ---------- */
  function initScrollbar() {
    if (!finePointer) return;
    var inside = false, toc = null, tocInside = false;
    function set(next) {
      if (next === inside) return;
      inside = next;
      root.classList.toggle('is-scrollbar-hover', inside);
    }
    function setToc(next) {
      if (next === tocInside) return;
      tocInside = next;
      if (toc) toc.classList.toggle('is-scrollbar-hover', tocInside);
    }
    window.addEventListener('pointermove', function (e) {
      set(e.clientX >= window.innerWidth - 12);
      // The policy page's section index has its own bar: widen it near the edge too
      var el = document.querySelector('.policy__toc');
      if (el !== toc) { if (toc) toc.classList.remove('is-scrollbar-hover'); toc = el; tocInside = false; }
      if (toc) {
        var r = toc.getBoundingClientRect();
        setToc(e.clientX >= r.right - 14 && e.clientX <= r.right + 2 &&
               e.clientY >= r.top && e.clientY <= r.bottom && toc.scrollHeight > toc.clientHeight);
      }
    }, { passive: true });
    window.addEventListener('pointerleave', function () { set(false); setToc(false); });
  }

  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    var lastY = window.scrollY;
    // Desktop (full nav visible): header stays pinned; it only auto-hides on smaller screens
    var desktop = window.matchMedia('(min-width: 921px)');
    var fab = $('[data-fab-top]');
    if (fab) fab.addEventListener('click', function () { if (animate) gsap.fromTo($('svg', fab), { y: 0 }, { y: -24, duration: 0.35, ease: 'power2.in', yoyo: true, repeat: 1 }); });
    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      if (fab) fab.classList.toggle('is-visible', y > 700);
      var goingDown = y > lastY + 4, goingUp = y < lastY - 4;
      if (desktop.matches) header.classList.remove('is-hidden');
      else if (!root.classList.contains('menu-open')) {
        if (goingDown && y > 500) header.classList.add('is-hidden');
        else if (goingUp || y < 200) header.classList.remove('is-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // Keyboard users always get the header back
    header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

    // Redevelopment notice: closable, remembered for later visits
    var noticeClose = $('[data-notice-close]', header);
    if (noticeClose) noticeClose.addEventListener('click', function () {
      root.classList.add('notice-closed');
      try { localStorage.setItem('jdsNoticeClosed', '1'); } catch (e) {}
      var brand = $('.brand', header);
      if (brand) brand.focus({ preventScroll: true });
      if (window.ScrollTrigger) setTimeout(function () { ScrollTrigger.refresh(); }, 450);
    });
  }

  /* ---------- Mobile menu ---------- */
  var burger, menu;
  // Centre the circle reveal on the burger; it moves with the notice bar and header height
  function aimMenu() {
    var r = burger.getBoundingClientRect();
    menu.style.setProperty('--menu-x', (r.left + r.width / 2) + 'px');
    menu.style.setProperty('--menu-y', (r.top + r.height / 2) + 'px');
  }
  function openMenu() {
    aimMenu();
    root.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', t('Close menu', 'Menü schließen'));
    menu.setAttribute('aria-hidden', 'false');
    $('[data-header]').classList.remove('is-hidden');
    if (lenis) lenis.stop();
    if (animate) {
      gsap.fromTo($$('li', menu), { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power3.out', delay: 0.15 });
      gsap.fromTo($('.mobile-menu__foot', menu), { opacity: 0 }, { opacity: 1, duration: 0.6, delay: 0.45 });
    }
  }
  function closeMenu() {
    if (!root.classList.contains('menu-open')) return;
    aimMenu();
    root.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', t('Open menu', 'Menü öffnen'));
    menu.setAttribute('aria-hidden', 'true');
    if (lenis) lenis.start();
  }
  function initMenu() {
    burger = $('[data-burger]');
    menu = $('[data-mobile-menu]');
    if (!burger || !menu) return;
    burger.addEventListener('click', function () { root.classList.contains('menu-open') ? closeMenu() : openMenu(); });
    menu.setAttribute('data-lenis-prevent', ''); // expanded groups can scroll inside the menu
    $$('a', menu).forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 920) closeMenu(); });
  }

  function setActiveNav(namespace) {
    $$('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === namespace;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    // Parent menus (e.g. Services) light up while one of their pages is open
    $$('[data-nav-group]').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav-group').split(' ').indexOf(namespace) > -1);
    });
    // Mobile menu: the service group of the current page starts open
    $$('.m-sub').forEach(function (d) { d.open = !!$('[data-nav].is-active', d); });
  }

  // Mobile menu service groups: opening one closes the others (for browsers without <details name>)
  function initMenuGroups() {
    $$('[data-m-groups]').forEach(function (box) {
      var groups = $$('.m-sub', box);
      groups.forEach(function (d) {
        d.addEventListener('toggle', function () {
          if (d.open) groups.forEach(function (o) { if (o !== d) o.open = false; });
        });
      });
    });
  }

  /* ---------- Header dropdowns ---------- */
  function initNavDropdowns() {
    var items = $$('[data-dd]');
    if (!items.length) return;
    function setOpen(item, open) {
      item.classList.toggle('is-open', open);
      $('.nav__trigger', item).setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeAll(except) { items.forEach(function (it) { if (it !== except) setOpen(it, false); }); }

    items.forEach(function (item) {
      var trigger = $('.nav__trigger', item), timer, hoverOpenedAt = 0;
      trigger.addEventListener('click', function () {
        // The click that follows a hover-open should not immediately close the menu again
        if (item.classList.contains('is-open') && Date.now() - hoverOpenedAt < 600) return;
        var open = !item.classList.contains('is-open');
        closeAll(item);
        setOpen(item, open);
      });
      if (finePointer) {
        item.addEventListener('mouseenter', function () {
          clearTimeout(timer);
          if (!item.classList.contains('is-open')) hoverOpenedAt = Date.now();
          closeAll(item); setOpen(item, true);
        });
        item.addEventListener('mouseleave', function () { timer = setTimeout(function () { setOpen(item, false); }, 160); });
      }
      // Tabbing out of a menu closes it
      item.addEventListener('focusout', function (e) { if (!item.contains(e.relatedTarget)) setOpen(item, false); });
      $$('a', item).forEach(function (a) { a.addEventListener('click', function () { setOpen(item, false); }); });
    });

    document.addEventListener('click', function (e) { if (!e.target.closest('[data-dd]')) closeAll(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = items.filter(function (it) { return it.classList.contains('is-open'); })[0];
      if (open) { setOpen(open, false); $('.nav__trigger', open).focus(); }
    });
  }

  /* ---------- Helpers ---------- */
  // Wrap each word in .w > .wi so lines can slide up from a mask; keeps <em> etc.
  function splitWords(el) {
    if (!el || el.dataset.splitDone) return [];
    var out = [];
    (function walk(node) {
      $$(':scope > *', node).forEach(walk);
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType !== 3 || !child.textContent.trim()) return;
        // text glued to the element before it (e.g. the full stop after </em>) must not wrap onto its own line
        var prev = child.previousSibling;
        var glue = prev && prev.nodeType === 1 && !/^\s/.test(child.textContent);
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span'); w.className = 'w';
          var wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w); out.push(wi);
        });
        var first = frag.firstChild;
        node.replaceChild(frag, child);
        if (glue) {
          var nb = document.createElement('span'); nb.style.whiteSpace = 'nowrap';
          node.insertBefore(nb, prev); nb.appendChild(prev); nb.appendChild(first);
        }
      });
    })(el);
    el.dataset.splitDone = '1';
    return out;
  }

  function formatNum(n, fmt) {
    n = Math.round(n);
    return fmt === 'thousands' ? n.toLocaleString(DE ? 'de-DE' : 'en-US') : String(n);
  }

  function prepDraw(el) {
    var len = 1200;
    try { if (el.getTotalLength) len = Math.ceil(el.getTotalLength()) + 2; } catch (e) {}
    el.style.strokeDasharray = len;
    el.style.strokeDashoffset = len;
    return len;
  }

  /* ---------- Hero ---------- */
  function heroIntro(scope) {
    var hero = $('.hero, .page-hero', scope);
    if (!hero) return;
    var title = $('[data-split]', hero);
    var words = splitWords(title);
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.from(words, { yPercent: 110, duration: 1.1, stagger: 0.045 })
      .fromTo($$('[data-hero-fade]', hero), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.1 }, 0.25)
      .fromTo($('.hero__visual', hero), { opacity: 0, y: 50, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 1.3 }, 0.2);

    // Homepage: 3D model card slides in, edges draw, then it floats
    var card = $('.model-card', hero);
    if (card) {
      tl.from(card, { x: 40, opacity: 0, duration: 1 }, 0.7);
      var iso = $$('.iso', hero);
      if (iso.length) {
        iso.forEach(prepDraw);
        tl.to(iso, { strokeDashoffset: 0, duration: 1.6, stagger: 0.15, ease: 'power2.inOut',
          onComplete: function () { iso[0].style.strokeDasharray = '3 4'; } }, 0.9);
      }
      gsap.to(card, { y: -12, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 });
    }

    // 2D page: nudge the compare handle once so people see it moves
    var compare = $('[data-compare]', hero);
    if (compare) {
      var c = { v: 50 };
      tl.to(c, { v: 28, duration: 0.9, ease: 'power2.inOut', yoyo: true, repeat: 1, delay: 0.2,
        onUpdate: function () { if (!compare.classList.contains('is-touched')) setCompare(compare, c.v); } }, 1);
    }

    // Hero counters
    $$('[data-count]', hero).forEach(function (el) { countUp(el, 1.8, 0.6); });

    // Scan beam: paper (left) → CAD (right)
    var vec = $('.clip-vector', hero), ras = $('.clip-raster', hero), beam = $('.scan-beam', hero);
    if (vec && ras && beam) {
      var st = { x: 0 };
      var set = function () {
        vec.setAttribute('width', st.x);
        ras.setAttribute('x', st.x);
        ras.setAttribute('width', Math.max(0, 600 - st.x));
        beam.setAttribute('transform', 'translate(' + st.x + ' 0)');
      };
      set();
      gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 1 })
        .to(st, { x: 600, duration: 4.2, ease: 'power1.inOut', onUpdate: set })
        .to(beam, { opacity: 0, duration: 0.3 }, '-=0.2')
        .to({}, { duration: 2.6 })
        .set(beam, { opacity: 1 })
        .to(st, { x: 0, duration: 1.6, ease: 'power2.inOut', onUpdate: set })
        .to({}, { duration: 0.8 });
    }

    // Subtle parallax on the hero visual
    var sheet = $('.sheet, .compare, .cloud-card', hero);
    if (sheet) gsap.to(sheet, { yPercent: -6, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    var video = $('.hero-video__media', hero);
    if (video) gsap.to(video, { yPercent: 12, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ---------- Homepage hero variants (v1 video, v2 compare, v3 original) ---------- */
  // Keep only the chosen hero so there is one h1 and no duplicate SVG ids.
  function initHeroVariant(container) {
    var heroes = $$('[data-hero-variant]', container);
    root.classList.toggle('has-hero-variants', heroes.length > 0);
    if (!heroes.length) { root.classList.remove('hero-dark'); return; }
    var chosen = root.getAttribute('data-hero') || 'v1';
    heroes.forEach(function (h) { if (h.getAttribute('data-hero-variant') !== chosen) h.remove(); });
    // Only the default hero has the <h1> in the HTML (crawlers see one); a review variant takes it over here
    var title = $('h2.hero__title', $('[data-hero-variant]', container));
    if (title) {
      var h1 = document.createElement('h1');
      [].slice.call(title.attributes).forEach(function (a) { h1.setAttribute(a.name, a.value); });
      h1.innerHTML = title.innerHTML;
      title.replaceWith(h1);
    }
    root.classList.toggle('hero-dark', !!$('.hero--video', container));
    $$('[data-hero-link]').forEach(function (a) {
      var on = a.getAttribute('data-hero-link') === chosen;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  function initHeroVideo(container) {
    var video = $('.hero-video__media', container);
    if (!video) return;
    var btn = $('[data-video-toggle]', container);
    var paused = reduceMotion; // reduced motion: poster only until the visitor presses play
    function sync() {
      if (!btn) return;
      btn.classList.toggle('is-paused', paused);
      btn.setAttribute('aria-label', paused ? t('Play background video', 'Hintergrundvideo abspielen') : t('Pause background video', 'Hintergrundvideo pausieren'));
    }
    function play() {
      if (!video.src) { video.src = video.getAttribute('data-src'); }
      var p = video.play();
      if (p && p.catch) p.catch(function () { paused = true; sync(); });
    }
    if (!paused) play();
    sync();
    if (btn) btn.addEventListener('click', function () {
      paused = !paused;
      if (paused) video.pause(); else play();
      sync();
    });
    // Don't decode video nobody can see
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (paused) return;
        if (en[0].isIntersecting) play(); else video.pause();
      });
      io.observe(video);
      pageCleanups.push(function () { io.disconnect(); });
    }
  }

  /* ---------- 2D: before/after compare ---------- */
  function setCompare(el, v) {
    el.style.setProperty('--pos', v + '%');
    var r = $('.compare__range', el);
    if (r && +r.value !== Math.round(v)) r.value = Math.round(v);
  }
  function initCompare(scope) {
    $$('[data-compare]', scope).forEach(function (el) {
      var range = $('.compare__range', el);
      if (!range) return;
      range.addEventListener('input', function () { el.classList.add('is-touched'); el.style.setProperty('--pos', range.value + '%'); });
      range.addEventListener('pointerdown', function () { el.classList.add('is-dragging', 'is-touched'); });
      window.addEventListener('pointerup', function () { el.classList.remove('is-dragging'); });
    });
  }

  /* ---------- 3D: level-of-detail explorer ---------- */
  var LOD = DE ? {
    100: ['LOD 100 · Konzept', 'Gesamtkubatur: Größe, Höhe und Lage des Gebäudes als einfaches Volumen.'],
    200: ['LOD 200 · Ungefähre Geometrie', 'Generische Elemente wie Decken, Wände und Öffnungen mit ungefährer Größe, Form und Lage.'],
    300: ['LOD 300 · Präzise Geometrie', 'Konkrete Elemente mit exakten Maßen, Form, Lage und Ausrichtung. Bereit für Koordination und abgeleitete Pläne.'],
    400: ['LOD 400 · Fertigungsdetail', 'Elemente mit dem für Fertigung und Montage nötigen Detail: Brüstungen, Rahmen, Anschlüsse, Befestigungen.'],
    500: ['LOD 500 · Bestand', 'Eine vor Ort verifizierte Darstellung der Elemente wie gebaut, für Betrieb und Facility Management.']
  } : {
    100: ['LOD 100 · Concept', 'Overall massing: size, height and position of the building as a simple volume.'],
    200: ['LOD 200 · Approximate geometry', 'Generic elements such as floors, walls and openings with approximate size, shape and location.'],
    300: ['LOD 300 · Precise geometry', 'Specific elements with exact dimensions, shape, location and orientation. Ready for coordination and derived plans.'],
    400: ['LOD 400 · Fabrication detail', 'Elements with the detail needed for fabrication and assembly: sills, frames, connections, fixings.'],
    500: ['LOD 500 · As-built', 'A field-verified representation of the elements as built, for operation and facility management.']
  };
  function initLod(scope) {
    var tabs = $('[data-lod-tabs]', scope), svg = $('[data-lod-svg]', scope);
    if (!tabs || !svg) return;
    var buttons = $$('button', tabs), ink = $('.lod__ink', tabs);
    var title = $('[data-lod-title]', scope), text = $('[data-lod-text]', scope), stamp = $('[data-lod-stamp]', svg);
    function select(level, focus) {
      buttons.forEach(function (b, i) {
        var on = b.getAttribute('data-lod') === String(level);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on) { ink.style.transform = 'translateX(' + (i * 100) + '%)'; if (focus) b.focus(); }
      });
      $$('[data-l]', svg).forEach(function (g) { g.classList.toggle('is-off', +g.getAttribute('data-l') > level); });
      title.textContent = LOD[level][0];
      text.textContent = LOD[level][1];
      stamp.textContent = 'LOD ' + level;
      if (animate) gsap.fromTo([title, text], { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.05, ease: 'power2.out', overwrite: true });
    }
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () { select(+b.getAttribute('data-lod')); });
      b.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = buttons[(i + d + buttons.length) % buttons.length];
        select(+n.getAttribute('data-lod'), true);
      });
    });
    select(300);
  }

  /* ---------- 3D: point cloud → CAD model (canvas) ---------- */
  function initCloud(scope) {
    var canvas = $('[data-cloud]', scope);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var label = $('[data-cloud-label]', scope), meter = $('[data-cloud-meter]', scope);

    // Building: 4 × 3 footprint, 2 high, gable roof to 3. Plus a small annex.
    var W = 4, D = 3, H = 2, R = 3;
    var pts = [], rnd = function (a, b) { return a + Math.random() * (b - a); };
    function face(n, fn) { for (var i = 0; i < n; i++) pts.push(fn()); }
    face(260, function () { return [rnd(0, W), rnd(0, H), 0]; });
    face(260, function () { return [rnd(0, W), rnd(0, H), D]; });
    face(180, function () { return [0, rnd(0, H), rnd(0, D)]; });
    face(180, function () { return [W, rnd(0, H), rnd(0, D)]; });
    face(140, function () { var z = rnd(0, D); var t = z < D / 2 ? z / (D / 2) : (D - z) / (D / 2); return [0, H + rnd(0, 1) * t * (R - H), z]; });
    face(140, function () { var z = rnd(0, D); var t = z < D / 2 ? z / (D / 2) : (D - z) / (D / 2); return [W, H + rnd(0, 1) * t * (R - H), z]; });
    face(260, function () { var x = rnd(0, W), s = Math.random() < 0.5, u = rnd(0, 1); return [x, H + u * (R - H), s ? u * D / 2 : D - u * D / 2]; });
    face(180, function () { return [rnd(0, W + 1.4), 0, rnd(-0.6, D + 0.6)]; }); // ground scan noise
    face(90, function () { return [rnd(W, W + 1.2), rnd(0, 1.1), Math.random() < 0.5 ? 0.4 : 1.8]; });
    face(50, function () { return [W + 1.2, rnd(0, 1.1), rnd(0.4, 1.8)]; });
    face(60, function () { return [rnd(W, W + 1.2), 1.1, rnd(0.4, 1.8)]; });
    pts.forEach(function (p) { p[0] += rnd(-0.03, 0.03); p[1] += rnd(-0.03, 0.03); p[2] += rnd(-0.03, 0.03); p.push(Math.random()); });

    var E = [
      [[0,0,0],[W,0,0]],[[W,0,0],[W,0,D]],[[W,0,D],[0,0,D]],[[0,0,D],[0,0,0]],
      [[0,H,0],[W,H,0]],[[W,H,0],[W,H,D]],[[W,H,D],[0,H,D]],[[0,H,D],[0,H,0]],
      [[0,0,0],[0,H,0]],[[W,0,0],[W,H,0]],[[W,0,D],[W,H,D]],[[0,0,D],[0,H,D]],
      [[0,H,0],[0,R,D/2]],[[0,R,D/2],[0,H,D]],[[W,H,0],[W,R,D/2]],[[W,R,D/2],[W,H,D]],[[0,R,D/2],[W,R,D/2]],
      [[0,1,0],[W,1,0]],[[0,1,D],[W,1,D]],
      [[W,0,0.4],[W+1.2,0,0.4]],[[W+1.2,0,0.4],[W+1.2,0,1.8]],[[W+1.2,0,1.8],[W,0,1.8]],
      [[W,1.1,0.4],[W+1.2,1.1,0.4]],[[W+1.2,1.1,0.4],[W+1.2,1.1,1.8]],[[W+1.2,1.1,1.8],[W,1.1,1.8]],
      [[W+1.2,0,0.4],[W+1.2,1.1,0.4]],[[W+1.2,0,1.8],[W+1.2,1.1,1.8]],
      [[0.6,0.3,D],[1.4,0.3,D]],[[1.4,0.3,D],[1.4,0.8,D]],[[1.4,0.8,D],[0.6,0.8,D]],[[0.6,0.8,D],[0.6,0.3,D]],
      [[2.6,0.3,D],[3.4,0.3,D]],[[3.4,0.3,D],[3.4,0.8,D]],[[3.4,0.8,D],[2.6,0.8,D]],[[2.6,0.8,D],[2.6,0.3,D]],
      [[0.6,1.25,D],[1.4,1.25,D]],[[1.4,1.25,D],[1.4,1.75,D]],[[1.4,1.75,D],[0.6,1.75,D]],[[0.6,1.75,D],[0.6,1.25,D]],
      [[2.6,1.25,D],[3.4,1.25,D]],[[3.4,1.25,D],[3.4,1.75,D]],[[3.4,1.75,D],[2.6,1.75,D]],[[2.6,1.75,D],[2.6,1.25,D]]
    ];
    var red = { 17: 1, 18: 1 };

    var state = { a: -0.65, p: 0 }, w = 0, h = 0, dpr = 1, running = false, visible = true;
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function proj(x, y, z) {
      x -= (W + 0.6) / 2; z -= D / 2; y -= 1.3;
      var ca = Math.cos(state.a), sa = Math.sin(state.a);
      var rx = x * ca - z * sa, rz = x * sa + z * ca;
      var tilt = 0.45, ct = Math.cos(tilt), st = Math.sin(tilt);
      var ry = y * ct - rz * st, rz2 = y * st + rz * ct;
      var s = Math.min(w, h) / 6.2, persp = 9 / (9 + rz2);
      return [w / 2 + rx * s * persp, h * 0.56 - ry * s * persp, rz2];
    }
    function draw() {
      if (!w) size();
      ctx.clearRect(0, 0, w, h);
      var p = state.p;
      // points fade as the model forms
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i], v = proj(q[0], q[1], q[2]);
        var alpha = (0.25 + 0.55 * (1 - (v[2] + 4) / 8)) * (1 - p * 0.75);
        ctx.fillStyle = q[3] > 0.97 ? 'rgba(204,0,0,' + alpha + ')' : 'rgba(71,73,175,' + alpha + ')';
        ctx.fillRect(v[0] - 1, v[1] - 1, 2, 2);
      }
      // faces tint in once the model is mostly drawn
      if (p > 0.5) {
        var fa = (p - 0.5) * 2 * 0.12;
        ctx.fillStyle = 'rgba(71,73,175,' + fa + ')';
        [[[0,0,D],[W,0,D],[W,H,D],[0,H,D]], [[W,0,0],[W,0,D],[W,H,D],[W,H,0]], [[0,H,0],[0,R,D/2],[W,R,D/2],[W,H,0]], [[0,H,D],[0,R,D/2],[W,R,D/2],[W,H,D]]].forEach(function (f) {
          ctx.beginPath();
          f.forEach(function (c, k) { var v = proj(c[0], c[1], c[2]); k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]); });
          ctx.closePath(); ctx.fill();
        });
      }
      // edges draw progressively
      var shown = p * E.length;
      ctx.lineCap = 'round';
      for (var j = 0; j < E.length; j++) {
        var t = Math.max(0, Math.min(1, shown - j));
        if (!t) continue;
        var A = proj.apply(null, E[j][0]), B = proj.apply(null, E[j][1]);
        ctx.strokeStyle = red[j] ? '#cc0000' : '#393B8D';
        ctx.lineWidth = red[j] ? 1.4 : 2;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t); ctx.stroke();
      }
      if (meter) meter.style.width = (p * 100).toFixed(1) + '%';
      if (label) label.textContent = p < 0.5 ? t('Point cloud · 2.4 M points', 'Punktwolke · 2,4 Mio. Punkte') : p < 0.98 ? t('Modelling · ', 'Modellierung · ') + Math.round(p * 100) + (DE ? ' %' : '%') : t('CAD model · fully structured', 'CAD-Modell · vollständig strukturiert');
    }
    function tick() { if (visible) { state.a += 0.0035; draw(); } }

    size();
    window.addEventListener('resize', size);

    if (!animate) { state.p = 1; state.a = -0.55; draw(); return; }

    var tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, delay: 1 })
      .to(state, { p: 1, duration: 4.5, ease: 'power1.inOut' })
      .to({}, { duration: 2.6 })
      .to(state, { p: 0, duration: 1.4, ease: 'power2.inOut' })
      .to({}, { duration: 1.2 });
    gsap.ticker.add(tick); running = true;

    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
      visible = en[0].isIntersecting;
      visible ? tl.resume() : tl.pause();
    }) : null;
    if (io) io.observe(canvas);

    pageCleanups.push(function () {
      if (running) gsap.ticker.remove(tick);
      tl.kill(); if (io) io.disconnect();
      window.removeEventListener('resize', size);
    });
  }

  function countUp(el, duration, delay) {
    var end = parseFloat(el.getAttribute('data-count'));
    var fmt = el.getAttribute('data-format');
    var o = { v: 0 };
    // Scroll counters keep their real number from the HTML until the count actually starts:
    // if the trigger never fires (print, full-page screenshot, crawler) they must not read "0"
    if (delay) el.textContent = formatNum(0, fmt);
    gsap.to(o, {
      v: end, duration: duration || 2, delay: delay || 0, ease: 'power2.out',
      onUpdate: function () { el.textContent = formatNum(o.v, fmt); },
      scrollTrigger: delay ? null : { trigger: el, start: 'top 90%', once: true }
    });
  }

  /* ---------- Stacked cards: each card sinks back as the next one slides over it ---------- */
  // The stacking itself is CSS (position: sticky); this only adds the scale and dim, scrubbed to scroll.
  function initStack(scope) {
    var stack = $('[data-stack]', scope);
    if (!stack) return;
    var cards = $$('.app-card', stack);
    var mm = gsap.matchMedia();
    mm.add('(min-width: 1001px) and (min-height: 701px)', function () {
      // Same height for every card, so each one covers the previous card exactly and the buttons line up.
      // Remeasured on every ScrollTrigger refresh (resize, fonts, images).
      function equalise() {
        cards.forEach(function (c) { c.style.minHeight = ''; });
        var h = Math.max.apply(null, cards.map(function (c) { return c.offsetHeight; }));
        cards.forEach(function (c) { c.style.minHeight = h + 'px'; });
      }
      equalise();
      ScrollTrigger.addEventListener('refreshInit', equalise);
      cards.forEach(function (card, i) {
        var next = cards[i + 1];
        if (!next) return;
        // Explicit start values: tweening from filter "none" makes GSAP begin at brightness(0), i.e. black.
        // Runs only while the next card actually covers this one: from its top meeting this card's
        // bottom edge until it reaches its own pinned position.
        gsap.fromTo(card, { scale: 1, filter: 'brightness(1)' }, {
          scale: 1 - 0.035 * (cards.length - 1 - i), filter: 'brightness(0.94)', ease: 'none',
          scrollTrigger: {
            trigger: next, scrub: 0.8, invalidateOnRefresh: true,
            start: function () { return 'top top+=' + (parseFloat(getComputedStyle(card).top) + card.offsetHeight); },
            end: function () { return 'top top+=' + parseFloat(getComputedStyle(next).top); }
          }
        });
      });
      // Below the breakpoint the cards are a plain list again: natural heights
      return function () {
        ScrollTrigger.removeEventListener('refreshInit', equalise);
        cards.forEach(function (c) { c.style.minHeight = ''; });
      };
    });
    pageCleanups.push(function () { mm.revert(); });
  }

  /* ---------- Horizontal scroll: vertical scroll slides the core-service cards sideways ---------- */
  // Desktop always pins. Phones and tablets pin too when the compact card, heading and dots fit
  // the screen; when they do not (short viewports), pinning would clip the card's price and
  // call to action, so the swap is instead paced to the card entering the viewport.
  function initHScroll(scope) {
    var sec = $('[data-hscroll]', scope);
    if (!sec) return;
    var track = $('[data-hscroll-track]', sec), viewport = $('[data-hscroll-viewport]', sec);
    var cards = $$('[data-hscroll-card]', sec), dots = $$('[data-hscroll-dot]', sec);
    var n = cards.length, st = null;

    function step() { return n > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0; }
    function setActive(i) {
      cards.forEach(function (c, k) { c.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === i);
        if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }
    function onSwipe() {
      if (st) return;
      setActive(Math.max(0, Math.min(n - 1, Math.round(viewport.scrollLeft / (step() || 1)))));
    }
    viewport.addEventListener('scroll', onSwipe, { passive: true });
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () {
        if (st) {
          var y = st.start + (st.end - st.start) * (i / (n - 1));
          if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else window.scrollTo({ top: y, behavior: 'smooth' });
        } else {
          viewport.scrollTo({ left: step() * i, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    });
    pageCleanups.push(function () { viewport.removeEventListener('scroll', onSwipe); });

    // Phones: accordion. One card open (image, text, price); tapping another card's title opens it.
    // The tapped card keeps its place on screen while the card above it closes.
    var phone = window.matchMedia('(max-width: 760px)'), openIdx = 0;
    function openCard(i) {
      openIdx = i;
      cards.forEach(function (c, k) {
        c.classList.toggle('is-open', k === i);
        var h = $('.h3', c);
        if (h && phone.matches) h.setAttribute('aria-expanded', k === i ? 'true' : 'false');
      });
    }
    function syncAccordion() {
      sec.classList.toggle('is-accordion', phone.matches);
      cards.forEach(function (c) {
        var h = $('.h3', c);
        if (!h) return;
        if (phone.matches) { h.setAttribute('role', 'button'); h.setAttribute('tabindex', '0'); }
        else { h.removeAttribute('role'); h.removeAttribute('tabindex'); h.removeAttribute('aria-expanded'); }
      });
      openCard(openIdx);
    }
    cards.forEach(function (c, i) {
      function go() {
        if (!phone.matches || c.classList.contains('is-open')) return;
        var before = c.getBoundingClientRect().top;
        openCard(i);
        var delta = c.getBoundingClientRect().top - before;
        if (Math.abs(delta) > 1) {
          if (lenis) lenis.scrollTo(window.scrollY + delta, { immediate: true }); else window.scrollBy(0, delta);
        }
      }
      c.addEventListener('click', function (e) { if (!e.target.closest('a')) go(); });
      var h = $('.h3', c);
      if (h) h.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    syncAccordion();
    if (phone.addEventListener) {
      phone.addEventListener('change', syncAccordion);
      pageCleanups.push(function () { phone.removeEventListener('change', syncAccordion); });
    }

    if (!animate || n < 2) return;
    function paint(p) {
      var pos = p * (n - 1);
      cards.forEach(function (c, i) {
        var d = Math.min(Math.abs(pos - i), 1), sc = 1 - 0.28 * d;
        // Side cards: 72 % size and 40 % opacity, moved inward by what they shrink so the gap to the active card stays
        gsap.set(c, { scale: sc, opacity: 1 - 0.6 * d, x: (pos > i ? 1 : -1) * (1 - sc) * c.offsetWidth / 2 });
      });
      setActive(Math.round(pos));
    }
    var mm = gsap.matchMedia();
    // Phones and tablets: no scroll effect, the cards simply stack (CSS: .hscroll at max-width 1000px)
    mm.add('(min-width: 1001px)', function () {
      sec.classList.add('is-pinned');
      viewport.scrollLeft = 0;
      var tween = gsap.to(track, {
        x: function () { return -step() * (n - 1); }, ease: 'none',
        scrollTrigger: {
          trigger: sec, start: 'top top', pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true,
          end: function () { return '+=' + Math.round(window.innerHeight * 0.9 * (n - 1)); },
          onUpdate: function (self) { paint(self.progress); }
        }
      });
      st = tween.scrollTrigger;
      paint(0);
      return function () {
        sec.classList.remove('is-pinned');
        st = null;
        gsap.set(cards, { clearProps: 'scale,opacity,x' });
      };
    });
    pageCleanups.push(function () { mm.revert(); });
  }

  /* ---------- Contact page "What happens next?": steps light up one after another ---------- */
  function initStepsFlow(scope) {
    $$('[data-steps-flow]', scope).forEach(function (ol) {
      var items = $$(':scope > li', ol);
      if (!items.length || reduceMotion || !('IntersectionObserver' in window)) return;
      ol.classList.add('is-anim');
      var timers = [];
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        items.forEach(function (li, i) { timers.push(setTimeout(function () { li.classList.add('is-on'); }, 250 + i * 900)); });
      }, { threshold: 0.35 });
      io.observe(ol);
      pageCleanups.push(function () { io.disconnect(); timers.forEach(clearTimeout); });
    });
  }

  /* ---------- Scroll reveals ---------- */
  function initReveals(scope) {
    $$('[data-reveal]', scope).forEach(function (el) {
      gsap.fromTo(el, { y: 50, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Grouped children (roadmap, benefits) stagger together
    var groups = [];
    $$('[data-reveal-item]', scope).forEach(function (el) { if (groups.indexOf(el.parentElement) < 0) groups.push(el.parentElement); });
    groups.forEach(function (g) {
      gsap.fromTo($$(':scope > [data-reveal-item]', g), { y: 36, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: g, start: 'top 85%', once: true }
      });
    });

    // Line-art in cards draws when it enters
    $$('.service-card .draw', scope).forEach(function (p) {
      prepDraw(p);
      gsap.to(p, { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut', scrollTrigger: { trigger: p.closest('.service-card'), start: 'top 80%', once: true } });
    });

    // Counters outside the hero
    $$('[data-count]', scope).forEach(function (el) { if (!el.closest('.hero')) countUp(el, 2); });

    // Process: connector line scrubs, steps pop in
    var steps = $$('[data-step]', scope);
    if (steps.length) {
      var wrap = steps[0].closest('.process__wrap');
      var line = $('.process__line line', wrap);
      if (line) gsap.to(line, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: { trigger: wrap, start: 'top 75%', end: 'bottom 60%', scrub: 0.6 },
        // The line runs from the first icon to the last; an icon turns red once the drawn line reaches it
        onUpdate: function () {
          var p = this.progress();
          steps.forEach(function (step, i) {
            step.classList.toggle('is-reached', p > 0.01 && p >= i / (steps.length - 1) - 0.001);
          });
        }
      });
      gsap.fromTo(steps, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.15, ease: 'back.out(1.4)', scrollTrigger: { trigger: wrap, start: 'top 80%', once: true } });
    }

    // Marquee
    var track = $('[data-marquee]', scope);
    if (track) {
      var first = track.children[0];
      var tween = gsap.to(track, { x: function () { return -first.offsetWidth; }, duration: 38, ease: 'none', repeat: -1 });
      ScrollTrigger.create({
        trigger: track, start: 'top bottom', end: 'bottom top',
        onUpdate: function (self) {
          var v = Math.min(Math.abs(self.getVelocity()) / 400, 4);
          gsap.to(tween, { timeScale: 1 + v, duration: 0.2, overwrite: true });
          gsap.to(tween, { timeScale: 1, duration: 1, delay: 0.2 });
        }
      });
    }
  }

  /* ---------- Pointer niceties ---------- */
  function initPointer(scope) {
    if (!animate || !finePointer) return;
    $$('[data-tilt]', scope).forEach(function (card) {
      var rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      var ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      gsap.set(card, { transformPerspective: 1200 });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 6);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 6);
      });
      card.addEventListener('pointerleave', function () { rx(0); ry(0); });
    });
  }

  /* ---------- Industries carousel: infinite auto-scroll, drag, prev/next, pause ---------- */
  // Without JS or with reduced motion the list stays a native swipeable row.
  function initIndustries(scope) {
    var root = $('[data-ind-carousel]', scope);
    if (!root || reduceMotion || root.classList.contains('is-live')) return;
    var vp = $('[data-ind-viewport]', root), track = $('[data-ind-track]', root);
    var items = $$('[data-ind-item]', track);
    if (items.length < 2) return;
    var bar = $('[data-ind-progress]', root), pauseBtn = $('[data-ind-pause]', root);

    // two cloned sets keep the row filled on wide screens while it loops
    for (var c = 0; c < 2; c++) items.forEach(function (it) {
      var k = it.cloneNode(true);
      k.removeAttribute('data-ind-item');
      k.setAttribute('aria-hidden', 'true');
      $$('a, button', k).forEach(function (a) { a.tabIndex = -1; });
      track.appendChild(k);
    });
    root.classList.add('is-live');
    vp.scrollLeft = 0;

    var SPEED = 38;                 // px per second
    var setW = 0, stepW = 0, pos = 0, factor = 0, vel = 0;
    var userPaused = false, hovering = false, focused = false, visible = true;
    var drag = null, glide = null, suppressClick = false;

    function measure() {
      setW = items[items.length - 1].offsetLeft + items[items.length - 1].offsetWidth - items[0].offsetLeft +
             (items[1].offsetLeft - items[0].offsetLeft - items[0].offsetWidth);
      stepW = items[1].offsetLeft - items[0].offsetLeft;
    }
    function wrap(v) { return setW ? ((v % setW) + setW) % setW : 0; }
    function render() {
      track.style.transform = 'translate3d(' + (-pos).toFixed(2) + 'px,0,0)';
      if (bar) bar.style.width = (pos / setW * 100).toFixed(2) + '%';
    }
    function glideTo(target, dur) {
      glide = { from: pos, to: target, t: 0, dur: dur || 0.7 };
    }

    function tick(dt) {
      if (drag || !setW) return;
      if (glide) {
        glide.t = Math.min(1, glide.t + dt / glide.dur);
        var e = 1 - Math.pow(1 - glide.t, 3);
        pos = glide.from + (glide.to - glide.from) * e;
        if (glide.t >= 1) glide = null;
      } else {
        var want = (userPaused || hovering || focused || !visible) ? 0 : 1;
        factor += (want - factor) * Math.min(1, dt * 3);   // ease in/out of motion
        pos += SPEED * factor * dt + vel * dt;
        vel *= Math.pow(0.04, dt);                          // fling momentum decays
        if (Math.abs(vel) < 1) vel = 0;
      }
      pos = wrap(pos);
      if (glide) { var off = pos - (glide.from + (glide.to - glide.from) * (1 - Math.pow(1 - glide.t, 3))); glide.from += off; glide.to += off; }
      render();
    }

    var last = 0, raf = 0;
    function frame(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now; tick(dt);
      raf = requestAnimationFrame(frame);
    }
    var tickerFn = function (t, deltaMs) { tick(Math.min(0.05, deltaMs / 1000)); };
    if (hasGSAP) gsap.ticker.add(tickerFn); else raf = requestAnimationFrame(frame);

    measure(); render();
    var onResize = function () { var p = setW ? pos / setW : 0; measure(); pos = p * setW; render(); };
    window.addEventListener('resize', onResize);

    // controls
    $('[data-ind-next]', root).addEventListener('click', function () { vel = 0; glideTo(Math.round(pos / stepW) * stepW + stepW); });
    $('[data-ind-prev]', root).addEventListener('click', function () { vel = 0; glideTo(Math.round(pos / stepW) * stepW - stepW); });
    pauseBtn.addEventListener('click', function () {
      userPaused = !userPaused;
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseBtn.setAttribute('aria-label', userPaused ? t('Play the carousel', 'Karussell abspielen') : t('Pause the carousel', 'Karussell pausieren'));
    });
    vp.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
    vp.addEventListener('pointerleave', function () { hovering = false; });
    root.addEventListener('focusin', function (e) {
      focused = true;
      var li = e.target.closest('[data-ind-item]');
      if (li) { var target = li.offsetLeft - items[0].offsetLeft - (vp.clientWidth - li.offsetWidth) / 2; glideTo(target, 0.5); }
    });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) focused = false; });

    // drag / swipe with momentum
    vp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      glide = null; vel = 0; suppressClick = false;
      drag = { x: e.clientX, y: e.clientY, pos: pos, lx: e.clientX, lt: performance.now(), v: 0, id: e.pointerId, axis: null };
    });
    vp.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'y') { drag = null; return; }   // let the page scroll vertically
        vp.setPointerCapture(e.pointerId);
        root.classList.add('is-dragging');
        suppressClick = true;
      }
      var now = performance.now(), dt = Math.max(1, now - drag.lt);
      drag.v = -(e.clientX - drag.lx) / dt * 1000;
      drag.lx = e.clientX; drag.lt = now;
      pos = wrap(drag.pos - dx);
      render();
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      if (drag.axis === 'x') vel = Math.max(-2400, Math.min(2400, drag.v)) * 0.9;
      drag = null;
      root.classList.remove('is-dragging');
    }
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    // Only the viewport's own capture counts: on touch screens the finger is first captured by the touched
    // child (an image); moving the capture to the viewport fires a bubbling lostpointercapture from that child.
    vp.addEventListener('lostpointercapture', function (e) { if (e.target === vp) endDrag(e); });
    vp.addEventListener('click', function (e) { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } }, true);
    vp.addEventListener('dragstart', function (e) { e.preventDefault(); });

    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }) : null;
    if (io) io.observe(root);

    pageCleanups.push(function () {
      if (hasGSAP) gsap.ticker.remove(tickerFn); else cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
    });
  }

  /* ---------- All-services slider: one slide at a time, infinite, autoplay, swipe ---------- */
  function initSvcSlider(scope) {
    var root = $('[data-svc-slider]', scope);
    if (!root || root.classList.contains('is-live')) return;
    var card = root.closest('.rebuild__card') || scope;
    var vp = $('[data-svc-viewport]', root), track = $('[data-svc-track]', root);
    var slides = $$('[data-svc-slide]', track), n = slides.length;
    if (n < 2) return;
    var ctrl = $('[data-svc-ctrl]', card), cur = $('[data-svc-current]', card);
    var bar = $('[data-svc-progress]', card), pauseBtn = $('[data-svc-pause]', card);

    // one clone at each end makes last → first keep moving forward
    var head = slides[n - 1].cloneNode(true), tail = slides[0].cloneNode(true);
    [head, tail].forEach(function (k) {
      k.removeAttribute('data-svc-slide'); k.setAttribute('aria-hidden', 'true');
      $$('a, button', k).forEach(function (a) { a.tabIndex = -1; });
      $$('img', k).forEach(function (i) { i.removeAttribute('loading'); });
    });
    track.insertBefore(head, slides[0]); track.appendChild(tail);
    var all = $$('.svc-slide', track);
    root.classList.add('is-live'); if (ctrl) ctrl.classList.add('is-live');

    var DUR = reduceMotion ? 0 : 700, AUTO = 5500;
    var pos = 1, moving = false, elapsed = 0, drag = null, suppressClick = false;
    var userPaused = reduceMotion, hovering = false, focused = false, visible = true;
    if (pauseBtn && userPaused) { pauseBtn.setAttribute('aria-pressed', 'true'); pauseBtn.setAttribute('aria-label', t('Play the slider', 'Slider abspielen')); }

    function setPos(p, animate, dx) {
      pos = p;
      track.style.transition = animate && DUR ? 'transform ' + DUR + 'ms cubic-bezier(.2,.7,.1,1)' : 'none';
      track.style.transform = 'translate3d(calc(' + (-p * 100) + '% + ' + (dx || 0) + 'px),0,0)';
      if (dx) return;
      var real = ((p - 1) % n + n) % n;
      all.forEach(function (s, i) { s.classList.toggle('is-active', i === p); });
      slides.forEach(function (s, i) {
        s.setAttribute('aria-hidden', i === real ? 'false' : 'true');
        $$('a, button', s).forEach(function (a) { a.tabIndex = i === real ? 0 : -1; });
      });
      if (cur) cur.textContent = String(real + 1).padStart(2, '0');
    }
    function settle() {
      moving = false;
      if (pos !== 0 && pos !== n + 1) return;
      // jump from a clone to its real slide without any visible transition
      root.classList.add('no-anim');
      setPos(pos === 0 ? n : 1, false);
      void track.offsetWidth;
      root.classList.remove('no-anim');
    }
    function go(d) {
      if (moving) return;
      elapsed = 0;
      moving = DUR > 0;
      setPos(pos + d, true);
      if (!DUR) settle();
    }
    track.addEventListener('transitionend', function (e) { if (e.target === track && e.propertyName === 'transform') settle(); });

    $('[data-svc-next]', card).addEventListener('click', function () { go(1); });
    $('[data-svc-prev]', card).addEventListener('click', function () { go(-1); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () {
      userPaused = !userPaused;
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseBtn.setAttribute('aria-label', userPaused ? t('Play the slider', 'Slider abspielen') : t('Pause the slider', 'Slider pausieren'));
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
    root.addEventListener('pointerleave', function () { hovering = false; });
    card.addEventListener('focusin', function () { focused = true; });
    card.addEventListener('focusout', function (e) { if (!card.contains(e.relatedTarget)) focused = false; });

    // swipe / drag
    vp.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || moving) return;
      suppressClick = false;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null, dx: 0, t: performance.now() };
    });
    vp.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (drag.axis === 'y') { drag = null; return; }
        vp.setPointerCapture(e.pointerId);
        root.classList.add('is-dragging');
        suppressClick = true;
      }
      drag.dx = dx;
      setPos(pos, false, dx);
    });
    function endDrag(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      var d = drag; drag = null;
      root.classList.remove('is-dragging');
      if (d.axis !== 'x') return;
      var fast = Math.abs(d.dx) / Math.max(1, performance.now() - d.t) > 0.5;
      if (Math.abs(d.dx) > vp.clientWidth * 0.18 || (fast && Math.abs(d.dx) > 30)) go(d.dx < 0 ? 1 : -1);
      else setPos(pos, true);
    }
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    // Only the viewport's own capture counts: on touch screens the finger is first captured by the touched
    // child (an image); moving the capture to the viewport fires a bubbling lostpointercapture from that child.
    vp.addEventListener('lostpointercapture', function (e) { if (e.target === vp) endDrag(e); });
    vp.addEventListener('click', function (e) { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } }, true);
    vp.addEventListener('dragstart', function (e) { e.preventDefault(); });

    // autoplay clock drives the progress bar
    var last = 0, raf = 0;
    function frame(now) {
      var dt = last ? Math.min(100, now - last) : 0; last = now;
      if (!(userPaused || hovering || focused || !visible || drag || moving)) {
        elapsed += dt;
        if (elapsed >= AUTO) go(1);
      }
      if (bar) bar.style.width = Math.min(100, elapsed / AUTO * 100).toFixed(2) + '%';
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }) : null;
    if (io) io.observe(root);

    setPos(1, false);
    pageCleanups.push(function () { cancelAnimationFrame(raf); if (io) io.disconnect(); });
  }

  /* ---------- FAQ accordion (native <details>, animated when GSAP is on) ---------- */
  function initFaq(scope) {
    if (!animate) return;
    $$('.faq__item', scope).forEach(function (item) {
      var summary = $('summary', item), body = $('.faq__a', item);
      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.dataset.busy) return;
        item.dataset.busy = '1';
        var done = function () { delete item.dataset.busy; gsap.set(body, { clearProps: 'height,opacity' }); if (lenis) lenis.resize(); ScrollTrigger.refresh(); };
        if (item.open) {
          gsap.to(body, { height: 0, opacity: 0, duration: 0.4, ease: 'power2.inOut', onComplete: function () { item.open = false; done(); } });
        } else {
          item.open = true;
          gsap.fromTo(body, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.5, ease: 'power3.out', onComplete: done });
        }
      });
    });
  }

  /* ---------- Insights: search, type tabs (#blog, #case-studies, #articles), topic chips, carousel rows ---------- */
  // Each type tab is its own link (insights.html#case-studies), so the types can be shared and linked separately.
  // With no filter active the page shows the carousel rows; any search or filter switches to the results grid.
  function initInsights(scope) {
    var box = $('[data-insights]', scope);
    if (!box) return;
    var tabs = $$('[data-filter]', box), chips = $$('[data-topic-filter]', box), cards = $$('[data-post]', box);
    var count = $('[data-insights-count]', box), empty = $('[data-ins-empty]', box), search = $('[data-ins-search]', scope);
    var browse = $('[data-ins-browse]', box), results = $('[data-ins-results]', box);
    var types = tabs.map(function (t) { return t.getAttribute('data-filter'); });
    var norm = function (v) { return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    var index = cards.map(function (c) { return norm(c.textContent.replace(/\s+/g, ' ')); });
    var state = { type: 'all', topics: [], q: '', sort: 'new' };
    var refreshTimer;
    var toggle = $('[data-topic-toggle]', box), panel = $('[data-topic-panel]', box), badge = $('[data-topic-count]', box);
    var pills = $('[data-topic-pills]', box), pillTpl = $('[data-pill-tpl]', box), clearAll = $('[data-topic-clear-all]', box);
    var sortLabel = $('[data-sort-label]', box), sorts = $$('[data-sort]', box);
    var lists = [$('.insights__grid', box)].concat($$('[data-row-track]', box)).filter(Boolean);

    // Latest or oldest first, in the results grid and in every carousel row
    function sortCards() {
      lists.forEach(function (list) {
        var items = [].slice.call(list.children).filter(function (c) { return c.hasAttribute('data-date'); });
        items.sort(function (a, b) {
          var d = a.getAttribute('data-date').localeCompare(b.getAttribute('data-date'));
          return state.sort === 'old' ? d : -d;
        });
        items.forEach(function (c) { list.appendChild(c); });
        if (list.hasAttribute('data-row-track')) list.scrollLeft = 0;
      });
      sorts.forEach(function (o) { o.setAttribute('aria-pressed', o.getAttribute('data-sort') === state.sort ? 'true' : 'false'); });
      var on = sorts.filter(function (o) { return o.getAttribute('data-sort') === state.sort; })[0];
      if (sortLabel && on) sortLabel.textContent = on.textContent;
    }

    function render() {
      var words = norm(state.q).split(' ').filter(Boolean), shown = 0;
      var picked = state.topics.length;
      var filtering = state.type !== 'all' || picked > 0 || words.length > 0;
      tabs.forEach(function (t) { t.setAttribute('aria-current', t.getAttribute('data-filter') === state.type ? 'true' : 'false'); });
      chips.forEach(function (c) { c.setAttribute('aria-pressed', state.topics.indexOf(c.getAttribute('data-topic-filter')) > -1 ? 'true' : 'false'); });
      if (badge) { badge.hidden = !picked; badge.textContent = picked; }
      if (clearAll) clearAll.hidden = !picked;
      renderPills();
      cards.forEach(function (c, i) {
        var on = (state.type === 'all' || c.getAttribute('data-type') === state.type) &&
                 (!picked || state.topics.indexOf(c.getAttribute('data-topic')) > -1) &&
                 words.every(function (w) { return index[i].indexOf(w) > -1; });
        c.hidden = !on;
        if (on) shown++;
      });
      if (browse) browse.hidden = filtering;
      if (results) results.hidden = !filtering;
      if (count) count.textContent = count.getAttribute(shown === 1 ? 'data-one' : 'data-many').replace('{n}', shown);
      if (empty) empty.hidden = shown > 0;
      clearTimeout(refreshTimer);
      if (animate) refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 150);
    }
    // Selected topics as removable pills beside the filter icon (only while the topic panel is closed)
    function renderPills() {
      if (!pills || !pillTpl) return;
      pills.textContent = '';
      chips.forEach(function (c) {
        var key = c.getAttribute('data-topic-filter');
        if (state.topics.indexOf(key) < 0) return;
        var pill = pillTpl.content.firstElementChild.cloneNode(true);
        $('span', pill).textContent = c.textContent;
        pill.setAttribute('aria-label', pill.getAttribute('aria-label') + ': ' + c.textContent);
        pill.addEventListener('click', function () { toggleTopic(key); });
        pills.appendChild(pill);
      });
      pills.classList.toggle('is-hidden', toggle && toggle.getAttribute('aria-expanded') === 'true');
    }
    function toggleTopic(key) {
      var i = state.topics.indexOf(key);
      if (i > -1) state.topics.splice(i, 1); else state.topics.push(key);
      render();
    }
    function setPanel(open) {
      if (!toggle || !panel) return;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
      renderPills();
      clearTimeout(refreshTimer);
      if (animate) refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 450);
    }
    function setType(type) { if (types.indexOf(type) > -1) { state.type = type; render(); } }
    function fromHash() { setType(location.hash.slice(1)); }

    // Type links from the menu while already on this page: the shared hash handler only scrolls
    function onClick(e) {
      var a = e.target.closest('a');
      if (!a || !isSamePageHash(a)) return;
      setType(new URL(a.href).hash.slice(1));
    }
    // Sort dropdown: outside click or Escape closes it
    var dds = $$('[data-ins-dd]', box);
    function setDd(dd, open) {
      $('[data-dd-btn]', dd).setAttribute('aria-expanded', open ? 'true' : 'false');
      $('[data-dd-menu]', dd).hidden = !open;
    }
    function closeDds(except) { dds.forEach(function (dd) { if (dd !== except) setDd(dd, false); }); }
    dds.forEach(function (dd) {
      $('[data-dd-btn]', dd).addEventListener('click', function () {
        var open = $('[data-dd-btn]', dd).getAttribute('aria-expanded') !== 'true';
        closeDds(dd);
        setDd(dd, open);
        if (open) { var first = $('[aria-pressed="true"]', dd) || $('.ins-dd__opt', dd); if (first) first.focus(); }
      });
    });
    function onDocClick(e) { if (!e.target.closest('[data-ins-dd]')) closeDds(); }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      var open = dds.filter(function (dd) { return $('[data-dd-btn]', dd).getAttribute('aria-expanded') === 'true'; })[0];
      if (open) { setDd(open, false); $('[data-dd-btn]', open).focus(); return; }
      if (toggle && toggle.getAttribute('aria-expanded') === 'true' && box.contains(document.activeElement)) { setPanel(false); toggle.focus(); }
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    // Topic panel: the filter icon opens and closes it; each chip toggles its topic on or off
    if (toggle) toggle.addEventListener('click', function () { closeDds(); setPanel(toggle.getAttribute('aria-expanded') !== 'true'); });
    chips.forEach(function (c) {
      c.addEventListener('click', function () { toggleTopic(c.getAttribute('data-topic-filter')); });
    });
    if (clearAll) clearAll.addEventListener('click', function () { state.topics = []; render(); if (toggle) toggle.focus(); });
    sorts.forEach(function (o) {
      o.addEventListener('click', function () { state.sort = o.getAttribute('data-sort'); closeDds(); sortCards(); });
    });
    if (search) {
      search.addEventListener('input', function () { state.q = search.value; render(); });
      // Enter in the hero search jumps down to the results
      search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); scrollToTarget(box); } });
    }
    var reset = $('[data-ins-reset]', box);
    if (reset) reset.addEventListener('click', function () {
      state.type = 'all'; state.topics = []; state.q = '';
      if (search) search.value = '';
      if (history.replaceState) history.replaceState(history.state, '', '#all');
      render();
    });

    // Posts are not published yet: their "Read" links show a short note instead of going anywhere
    var toast = $('[data-ins-toast]', box), toastTimer;
    function onSoon(e) {
      var a = e.target.closest('a[data-soon]');
      if (!a || !scope.contains(a)) return;
      e.preventDefault();
      e.stopPropagation();
      if (!toast) return;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { toast.hidden = true; }, 3200);
    }

    document.addEventListener('click', onClick);
    document.addEventListener('click', onSoon, true);
    window.addEventListener('hashchange', fromHash);
    fromHash();
    // After a Barba transition the hash is written to the address bar right after this runs
    var raf = requestAnimationFrame(fromHash);
    pageCleanups.push(function () {
      cancelAnimationFrame(raf);
      clearTimeout(toastTimer);
      clearTimeout(refreshTimer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('click', onSoon, true);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', fromHash);
    });

    $$('[data-ins-row]', box).forEach(initInsightsRow);
  }

  // One carousel row: a scroll-snapped track (native swipe and trackpad), arrows that step one card
  function initInsightsRow(row) {
    var track = $('[data-row-track]', row), prev = $('[data-row-prev]', row), next = $('[data-row-next]', row);
    if (!track || row.dataset.ready) return;
    row.dataset.ready = '1';
    var raf = 0;
    function step() {
      var card = track.firstElementChild;
      return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 0) : track.clientWidth;
    }
    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      track.classList.toggle('is-end', track.scrollLeft >= max);
    }
    function onScroll() { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }
    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: reduceMotion ? 'auto' : 'smooth' }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: reduceMotion ? 'auto' : 'smooth' }); });
    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    sync();

    // data-row-auto (industry pages): advance one card every few seconds, back to the start after the last one.
    // Pauses while hovered, focused, off screen or with the tab hidden; never runs with reduced motion.
    var auto = 0, hovering = false, focused = false, visible = false, io = null;
    if (row.hasAttribute('data-row-auto') && !reduceMotion) {
      row.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hovering = true; });
      row.addEventListener('pointerleave', function () { hovering = false; });
      row.addEventListener('focusin', function () { focused = true; });
      row.addEventListener('focusout', function (e) { if (!row.contains(e.relatedTarget)) focused = false; });
      if ('IntersectionObserver' in window) {
        io = new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.4 });
        io.observe(track);
      } else visible = true;
      auto = setInterval(function () {
        if (hovering || focused || !visible || document.hidden) return;
        var atEnd = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
        if (atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
        else track.scrollBy({ left: step(), behavior: 'smooth' });
      }, 4000);
    }
    pageCleanups.push(function () { cancelAnimationFrame(raf); window.removeEventListener('resize', onScroll); clearInterval(auto); if (io) io.disconnect(); });
  }

  /* ---------- Form subject prefill ---------- */
  // Buttons like "Submit files for assessment" pre-select the form's subject,
  // also when they link to the form from another page.
  var pendingPrefill = null;
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-prefill]');
    if (!a) return;
    pendingPrefill = a.getAttribute('data-prefill');
    try { sessionStorage.setItem('jdsPrefill', pendingPrefill); } catch (err) {}
    applyPrefill();
  });
  function applyPrefill() {
    var sel = document.getElementById('f-ref');
    if (!sel) return;
    var v = pendingPrefill;
    if (!v) { try { v = sessionStorage.getItem('jdsPrefill'); } catch (err) {} }
    if (!v) return;
    sel.value = v;
    pendingPrefill = null;
    try { sessionStorage.removeItem('jdsPrefill'); } catch (err) {}
  }

  /* ---------- Contact form ---------- */
  function initForm(scope) {
    var form = $('#contact-form', scope);
    if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';


    applyPrefill();

    function setError(field, msg) {
      var wrap = field.type === 'checkbox' ? field.closest('.consent') : field.closest('.field');
      if (!wrap) return;
      wrap.classList.toggle('has-error', !!msg);
      var err = $('.field__error', wrap);
      if (msg && wrap.classList.contains('field')) {
        if (!err) { err = document.createElement('span'); err.className = 'field__error'; wrap.appendChild(err); }
        err.textContent = msg;
        field.setAttribute('aria-invalid', 'true');
      } else {
        if (err) err.remove();
        field.removeAttribute('aria-invalid');
      }
    }

    function validate(field) {
      var v = (field.value || '').trim();
      if (field.type === 'checkbox') { setError(field, field.required && !field.checked ? 'required' : ''); return field.checked || !field.required; }
      if (field.required && !v) { setError(field, t('Please fill in this field.', 'Bitte füllen Sie dieses Feld aus.')); return false; }
      if (field.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setError(field, t('Please enter a valid email address.', 'Bitte geben Sie eine gültige E-Mail-Adresse ein.')); return false; }
      // Same rule as contact.php: at least 6 digits
      if (field.type === 'tel' && v && (v.match(/[0-9]/g) || []).length < 6) { setError(field, t('Please enter a valid phone number.', 'Bitte geben Sie eine gültige Telefonnummer ein.')); return false; }
      setError(field, '');
      return true;
    }

    var fields = $$('input:not([type=radio]):not([name=website]), select, textarea', form);
    fields.forEach(function (f) {
      f.addEventListener('blur', function () { if (f.closest('.has-error') || f.value) validate(f); });
      f.addEventListener('change', function () { if (f.closest('.has-error')) validate(f); });
      // Clear errors while typing, so the layout settles before the next click
      f.addEventListener('input', function () { if (f.closest('.has-error')) validate(f); });
    });

    function shake() { if (animate) gsap.fromTo(form, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }); }

    var success = $('.form__success', form);
    var errorBox = $('.form__error', form);
    var send = $('.form__send', form);
    var sendLabel = $('[data-send-label]', form);
    var idle = sendLabel.textContent;
    var loaded = Date.now();

    // The letter folds into a paper plane, flies along the trail into the JDS box, the box gets its check badge.
    // Returns the timeline; the confirmation text fades in when the plane lands.
    function sentArt() {
      var art = $('.form__sent-art', form);
      var trail = $('.sa-trail', art), letter = $('.sa-letter', art), flap = $('.sa-flap', art);
      var plane = $('.sa-plane', art), body = $('.sa-plane-body', art), box = $('.sa-box', art), badge = $('.sa-badge', art);
      var len = trail.getTotalLength(), bb = trail.getBBox(), flight = { p: 0 };
      function fly() {
        var at = flight.p * len, pt = trail.getPointAtLength(at), next = trail.getPointAtLength(Math.min(len, at + 1));
        var angle = Math.atan2(next.y - pt.y, next.x - pt.x) * 180 / Math.PI;
        plane.setAttribute('transform', 'translate(' + pt.x + ' ' + pt.y + ') rotate(' + angle + ')');
        // The route is used up as the plane flies: everything left of its tail disappears. The path runs
        // left to right, so the cut follows the plane's own x (not the share of the length, which drifts on curves).
        var cut = Math.max(0, Math.min(100, (pt.x - 24 - bb.x) / bb.width * 100));
        trail.style.clipPath = 'inset(0 0 0 ' + cut + '%)';
      }
      gsap.set(trail, { opacity: 0 });
      gsap.set(letter, { opacity: 0, y: 14 });
      gsap.set(flap, { scaleY: 1, transformOrigin: '50% 100%' });
      gsap.set(body, { opacity: 0, scale: 0, transformOrigin: '50% 50%' });
      gsap.set(plane, { opacity: 1 });
      gsap.set(badge, { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(box, { x: 228 });                                                            // at the end of the trail
      fly();
      return gsap.timeline()
        .to(letter, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' })
        .to(trail, { opacity: 1, duration: 0.5 }, '<0.1')                                   // the route ahead
        .to(flap, { scaleY: -1, duration: 0.4, ease: 'power2.inOut' }, '+=0.1')          // top half folds down
        .to(letter, { scaleX: 0.35, scaleY: 0.2, opacity: 0, duration: 0.3, ease: 'power2.in', transformOrigin: '50% 50%' })
        .to(body, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '-=0.12')  // ...and becomes the plane
        .to(flight, { p: 1, duration: 1.4, ease: 'power1.inOut', onUpdate: fly })
        .to(trail, { opacity: 0, duration: 0.2 }, '-=0.2')                                  // last bit at the box
        .to(body, { scale: 0.2, opacity: 0, duration: 0.22, ease: 'power2.in' }, '-=0.18')
        .to(box, { scale: 1.08, duration: 0.16, yoyo: true, repeat: 1, transformOrigin: '50% 50%' }, '-=0.06')
        .to(badge, { scale: 1, duration: 0.45, ease: 'back.out(2.6)' }, '-=0.1')
        .addLabel('landed', '-=0.3')
        .to(box, { x: 0, scale: 1.3, transformOrigin: '50% 50%', duration: 0.8, ease: 'power3.inOut' }, '+=0.2'); // then glides to the centre, a bit larger
    }

    function showSuccess() {
      form.classList.add('is-sent');
      errorBox.hidden = true;
      success.hidden = false;
      // The fields are gone now, so the page is shorter: measure again before scrolling to the message
      if (lenis) lenis.resize();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
      var art = $('.form__sent-art', form);
      requestAnimationFrame(function () {
        // Bring the animation into view (it sits just above the message), unless it already is
        var r = art.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight) scrollToTarget(art);
        success.focus({ preventScroll: true });
      });
      if (!animate) {
        // Reduced motion: the same end picture, the box enlarged about its centre (280, 98)
        $('.sa-box', art).setAttribute('transform', 'translate(280 98) scale(1.3) translate(-280 -98)');
        return;
      }
      // A short pause so the letter is not folded while the page is still scrolling to it
      var tl = sentArt().delay(0.5);
      tl.fromTo(success, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, 'landed');
    }
    function showError(code) {
      var rate = code === 'rate';
      $('[data-error-rate]', errorBox).hidden = !rate;
      $('[data-error-other]', errorBox).hidden = rate;
      errorBox.hidden = false;
      if (lenis) lenis.resize();
    }
    function busy(on) {
      send.disabled = on;
      sendLabel.textContent = on ? t('Sending…', 'Wird gesendet …') : idle;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (send.disabled) return;
      errorBox.hidden = true;

      var ok = true, firstBad = null;
      fields.forEach(function (f) { if (!validate(f)) { ok = false; firstBad = firstBad || f; } });
      if (!ok) {
        firstBad.focus({ preventScroll: true });
        scrollToTarget(firstBad.closest('.field, .consent'));
        shake();
        return;
      }

      // Bots fill the hidden field: pretend success and send nothing
      if ($('#f-website', form).value) { showSuccess(); return; }

      // Sent in the background by the website (contact.php), no email program involved
      var data = new FormData(form);
      data.append('lang', DE ? 'de' : 'en');
      data.append('elapsed', Math.round((Date.now() - loaded) / 1000));
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 20000);
      busy(true);
      altchaReady()
        .then(function () {
          if (altchaPayload) data.set('altcha', altchaPayload);
          return fetch('/contact.php', { method: 'POST', body: data, headers: { Accept: 'application/json' }, signal: ctrl && ctrl.signal });
        })
        .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
        .then(function (r) {
          if (r && r.ok) { form.reset(); resetAltcha(); showSuccess(); }
          else { showError(r && r.error); if (r && r.error === 'bot') resetAltcha(); }   // expired or refused: check again
        })
        .catch(function () { showError(); })
        .then(function () { clearTimeout(timer); busy(false); });
    });

    /* ALTCHA bot check: a self-hosted widget (assets/js/altcha/, MIT) solves a proof-of-work challenge from
       contact.php in the background ("Ich bin kein Roboter" ticks itself when the visitor starts typing).
       Loaded here rather than in the page head, so it also works after a page transition to the form. */
    var widget = $('altcha-widget', form), altchaPayload = null;
    if (widget) {
      widget.addEventListener('statechange', function (e) {
        var d = e.detail || {};
        altchaPayload = d.state === 'verified' ? d.payload : null;
      });
      if (!(window.customElements && customElements.get('altcha-widget')) && !document.querySelector('script[data-altcha]')) {
        // Next to main.js, wherever the site is served from (site root live, a subfolder on local previews)
        var me = document.querySelector('script[src*="js/main.js"]');
        var jsDir = me ? me.src.replace(/main\.js[^/]*$/, '') : '/assets/js/';
        var lib = document.createElement('script');
        lib.src = jsDir + 'altcha/altcha.min.js?v=3.3.0';
        lib.setAttribute('data-altcha', '');
        lib.onload = function () {
          var de = document.createElement('script');
          de.src = jsDir + 'altcha/de.js?v=3.3.0';
          // The German texts arrive after the widget started: apply the page language once they are there
          de.onload = function () { $$('altcha-widget').forEach(function (w) { if (w.configure) w.configure({ language: DE ? 'de' : 'en' }); }); };
          document.head.appendChild(de);
        };
        document.head.appendChild(lib);
      }
    }
    // Resolves once the check is done (starting it if needed); after 15 s it gives up and the server decides
    function altchaReady() {
      if (altchaPayload || !widget || typeof widget.verify !== 'function') return Promise.resolve();
      return new Promise(function (resolve) {
        var timer = setTimeout(resolve, 15000);
        widget.addEventListener('statechange', function wait(e) {
          var s = e.detail && e.detail.state;
          if (s === 'verified' || s === 'error' || s === 'expired') { clearTimeout(timer); widget.removeEventListener('statechange', wait); resolve(); }
        });
        try { widget.verify(); } catch (err) { clearTimeout(timer); resolve(); }
      });
    }
    function resetAltcha() {
      altchaPayload = null;
      if (widget && typeof widget.reset === 'function') widget.reset();
    }
  }

  /* ---------- Client feedback: quote carousel ---------- */
  // The track is a native scroll-snap row (swipe and trackpad work as-is); this adds the arrows, dots,
  // the active card and a slow autoplay that runs only while the section is on screen and nobody is using it.
  function initQuotes(scope) {
    var root = $('[data-quotes]', scope);
    if (!root) return;
    var track = $('[data-quotes-track]', root), slides = $$('[data-quote]', track), n = slides.length;
    var dotsBox = $('[data-quotes-dots]', root), prev = $('[data-quotes-prev]', root), next = $('[data-quotes-next]', root);
    if (n < 2) { $('.quotes__ctrl', root).hidden = true; return; }
    var AUTO = 8000, cur = 0, timer = null, held = false, visible = false, raf = 0;

    var dots = slides.map(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', t('Show feedback ', 'Kundenstimme ') + (i + 1) + t(' of ', ' von ') + n);
      b.addEventListener('click', function () { go(i); restart(); });
      dotsBox.appendChild(b);
      return b;
    });
    function left(i) { return slides[i].offsetLeft - slides[0].offsetLeft; }
    function mark(i) {
      cur = i;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    }
    function go(i) {
      i = (i + n) % n;
      track.scrollTo({ left: left(i), behavior: reduceMotion ? 'auto' : 'smooth' });
      mark(i);
    }
    // The card nearest the start of the track is the current one (also after swiping)
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        var x = track.scrollLeft, best = 0;
        slides.forEach(function (s, k) { if (Math.abs(left(k) - x) < Math.abs(left(best) - x)) best = k; });
        // at the end of the track the last card may not reach the start edge
        if (x + track.clientWidth >= track.scrollWidth - 2) best = n - 1;
        if (best !== cur) mark(best);
      });
    }
    function stop() { clearInterval(timer); timer = null; }
    function restart() {
      stop();
      if (!reduceMotion && visible && !held && !document.hidden) timer = setInterval(function () { go(cur + 1); }, AUTO);
    }
    function hold(on) { held = on; restart(); }
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) { visible = en[0].isIntersecting; restart(); }, { threshold: 0.35 }) : null;
    if (io) io.observe(root); else { visible = true; }

    prev.addEventListener('click', function () { go(cur - 1); restart(); });
    next.addEventListener('click', function () { go(cur + 1); restart(); });
    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); go(cur + (e.key === 'ArrowRight' ? 1 : -1)); restart(); }
    });
    root.addEventListener('pointerenter', function () { hold(true); });
    root.addEventListener('pointerleave', function () { hold(false); });
    root.addEventListener('focusin', function () { hold(true); });
    root.addEventListener('focusout', function (e) { if (!root.contains(e.relatedTarget)) hold(false); });
    track.addEventListener('touchstart', function () { hold(true); }, { passive: true });
    document.addEventListener('visibilitychange', restart);
    mark(0);
    restart();
    pageCleanups.push(function () {
      stop(); cancelAnimationFrame(raf);
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', restart);
    });
  }

  /* ---------- Page lifecycle ---------- */
  // Sticky FAQ / glossary search: .is-stuck while it is pinned below the header (shows its backing and fade)
  var stickyTick = false;
  function updateStickySearch() {
    stickyTick = false;
    document.querySelectorAll('.faq--search .faqx-search, .glossary .glx-search, .ins-filters').forEach(function (el) {
      var top = parseFloat(getComputedStyle(el).top) || 0;
      el.classList.toggle('is-stuck', window.scrollY > 0 && el.getBoundingClientRect().top <= top + 1);
    });
  }
  window.addEventListener('scroll', function () {
    if (!stickyTick) { stickyTick = true; requestAnimationFrame(updateStickySearch); }
  }, { passive: true });

  function initPage(container, opts) {
    opts = opts || {};
    var ns = container.getAttribute('data-barba-namespace') || 'home';
    setActiveNav(ns);
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
    initHeroVariant(container);
    initHeroVideo(container);
    initForm(container);
    initCompare(container);
    initLod(container);
    initCloud(container);
    initFaq(container);
    initInsights(container);
    $$('[data-ins-row]', container).forEach(initInsightsRow);   // rows outside the Insights page (industry pages)
    initIndustries(container);
    initSvcSlider(container);
    initQuotes(container);
    initHScroll(container);
    initStepsFlow(container);
    updateStickySearch();

    if (!animate) return;
    pageCtx = gsap.context(function () {
      if (!opts.deferHero) heroIntro(container);
      initReveals(container);
      initStack(container);
    }, container);
    initPointer(container);
    ScrollTrigger.refresh();
    refreshOnImageLoad(container);
  }

  // Lazy images change the page height after triggers are measured; re-measure once they land.
  function refreshOnImageLoad(container) {
    var timer;
    function queue() { clearTimeout(timer); timer = setTimeout(function () { ScrollTrigger.refresh(); }, 150); }
    $$('img', container).forEach(function (img) {
      if (img.complete) return;
      img.addEventListener('load', queue, { once: true });
    });
    pageCleanups.push(function () { clearTimeout(timer); });
  }

  function destroyPage() {
    pageCleanups.forEach(function (fn) { fn(); });
    pageCleanups = [];
    if (pageCtx) { pageCtx.revert(); pageCtx = null; }
  }

  /* ---------- Preloader ---------- */
  function runPreloader(done) {
    var pre = $('.preloader');
    if (!animate || !root.classList.contains('show-preloader') || !pre) { if (pre) pre.remove(); done(); return; }
    try { sessionStorage.setItem('jdsSeen', '1'); } catch (e) {}
    // blue tiles fly in; the red triangle gets its own tween so it lands exactly in place
    var tris = $$('.pl-t:not(.pl-red)', pre);
    var tl = gsap.timeline({
      onComplete: function () { pre.remove(); root.classList.remove('show-preloader'); }
    });
    tl.from(tris, {
      opacity: 0, scale: 0.4, transformOrigin: '50% 50%',
      x: function () { return gsap.utils.random(-60, 60); },
      y: function () { return gsap.utils.random(-40, 40); },
      rotation: function () { return gsap.utils.random(-90, 90); },
      duration: 0.8, stagger: 0.06, ease: 'power3.out'
    })
      .fromTo('.pl-red', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power3.out' }, '-=0.3')
      .from('.preloader__word', { opacity: 0, letterSpacing: '0.6em', duration: 0.6, ease: 'power2.out' }, '-=0.5')
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.8, ease: 'power4.inOut', onStart: done }, '+=0.15');
    gsap.set(pre, { clipPath: 'inset(0 0 0% 0)' });
  }

  /* ---------- Barba page transitions ---------- */
  function initBarba() {
    if (!animate || !window.barba || !/^https?:$/.test(location.protocol)) return;
    var curtain = $('.curtain'), mark = $('.curtain__mark');

    // The header and mobile menu sit outside the swapped container, so their language links would keep
    // pointing at the first page's translation. Take them from the incoming page instead.
    function syncLangLinks(html) {
      if (!html) return;
      var doc = new DOMParser().parseFromString(html, 'text/html');
      ['[data-lang-menu] a[hreflang]', '.m-lang a[hreflang]'].forEach(function (sel) {
        var fresh = $$(sel, doc);
        $$(sel).forEach(function (a) {
          var match = fresh.filter(function (f) { return f.getAttribute('hreflang') === a.getAttribute('hreflang'); })[0];
          if (match) a.setAttribute('href', match.getAttribute('href'));
        });
      });
    }
    // The header's links are relative to the page it came with, so a transition into another folder
    // (e.g. en/ -> en/industries/) would leave them pointing at the wrong place: load those pages normally.
    function folder(path) { return path.replace(/[^/]*$/, ''); }
    function otherFolder(el) {
      var url = new URL(el.href, location.href);
      return url.origin === location.origin && folder(url.pathname) !== folder(location.pathname);
    }
    barba.init({
      preventRunning: true,
      // The server can take over a second per page; Barba's default 2 s limit then aborted the
      // transition halfway and left the new page hidden. Wait longer, and on any failure load the page normally.
      timeout: 8000,
      requestError: function (trigger, action, url) {
        window.location.assign(url);
        return false;
      },
      prevent: function (o) {
        var el = o.el;
        return el.target === '_blank' || el.hasAttribute('data-no-barba') || isSamePageHash(el) || otherFolder(el);
      },
      transitions: [{
        name: 'curtain',
        leave: function () {
          closeMenu();
          return gsap.timeline()
            .set(curtain, { clipPath: 'inset(100% 0 0 0)' })
            .to(curtain, { clipPath: 'inset(0% 0 0 0)', duration: 0.65, ease: 'power4.inOut' })
            .fromTo(mark, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, '-=0.2')
            .then();
        },
        beforeEnter: function (data) {
          destroyPage();
          // Barba keeps the old page in the DOM until the transition ends. Take it out of
          // the layout now, or every ScrollTrigger (and hash scroll) is offset by its height.
          data.current.container.style.display = 'none';
          if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
        },
        enter: function (data) {
          syncLangLinks(data.next.html);
          initPage(data.next.container, { deferHero: true });
          // Barba strips the #fragment before navigating; read it from the clicked link instead
          var linkHref = data.trigger && data.trigger.href;
          var hash = (linkHref ? new URL(linkHref, location.href).hash.slice(1) : '') ||
            (data.next.url && data.next.url.hash) || '';
          var hashTarget = hash ? document.getElementById(hash) : null;
          if (hashTarget) {
            scrollToTarget(hashTarget, true);
            if (history.replaceState) history.replaceState(history.state, '', '#' + hash);
          }
          return gsap.timeline()
            .to(mark, { opacity: 0, scale: 1.1, duration: 0.25 })
            .to(curtain, { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'power4.inOut' }, '-=0.05')
            .add(function () { if (pageCtx) pageCtx.add(function () { heroIntro(data.next.container); }); }, '-=0.45')
            .then();
        },
        after: function () { ScrollTrigger.refresh(); }
      }]
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initLenis();
    initScrollbar();
    initHeader();
    initLang();
    initMenu();
    initNavDropdowns();
    initMenuGroups();
    // Social links are placeholders until the profile URLs are set: "#" should do nothing
    document.addEventListener('click', function (e) { var a = e.target.closest('a[data-social]'); if (a && a.getAttribute('href') === '#') e.preventDefault(); });
    var main = $('[data-barba="container"]');
    if (!main) return;
    initPage(main, { deferHero: true });
    runPreloader(function () {
      if (animate) {
        if (pageCtx) pageCtx.add(function () { heroIntro(main); });
        var hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
        if (hashTarget) setTimeout(function () { scrollToTarget(hashTarget, true); }, 50);
      }
    });
    initBarba();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ---------- FAQ page (faq.html): search, topic filter, answers opened by their toggle button ----------
   Lives here rather than in the page so it also runs after a Barba page transition. */
(function () {
  var topic = '';            // active topic ("" = all)
  // The German page is generated from this one, so the script texts follow the page language
  var DE = document.documentElement.lang === 'de';
  var T = DE
    ? { popular: 'Beliebte Artikel', all: 'Alle Themen', one: 'Ergebnis', many: 'Ergebnisse', for: 'für', in: 'im', topic: 'Thema', filter: 'Nach Thema filtern', show: 'Antwort anzeigen', hide: 'Antwort ausblenden' }
    : { popular: 'Popular articles', all: 'All topics', one: 'result', many: 'results', for: 'for', in: 'in', topic: 'topic', filter: 'Filter by topic', show: 'Show answer', hide: 'Hide answer' };
  var DEFAULT_COUNT = '<strong>' + T.popular + '</strong>';

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // The list itself: the homepage and service pages have a <script data-faq> (FAQ schema) in the <head>,
  // which stays in the document after a Barba page transition
  function root() { return document.querySelector('.faq__list[data-faq]'); }

  // Highlight the search words inside a plain-text string
  function highlight(text, terms) {
    if (!terms.length) return esc(text);
    var plain = norm(text), marks = new Array(text.length + 1).fill(false);
    // norm() can change the length (ß → ss), so only highlight when lengths match
    if (plain.length !== text.length) return esc(text);
    terms.forEach(function (t) {
      var i = plain.indexOf(t);
      while (i !== -1) { for (var k = i; k < i + t.length; k++) marks[k] = true; i = plain.indexOf(t, i + t.length); }
    });
    var out = '', open = false;
    for (var j = 0; j < text.length; j++) {
      if (marks[j] && !open) { out += '<mark>'; open = true; }
      if (!marks[j] && open) { out += '</mark>'; open = false; }
      out += esc(text[j]);
    }
    return out + (open ? '</mark>' : '');
  }

  // One-time setup: snippet, tag line and topic sidebar
  function setup() {
    var r = root();
    if (!r || r.hasAttribute('data-faq-ready')) return;
    r.setAttribute('data-faq-ready', '');
    var counts = {};
    r.querySelectorAll('.faqx-item').forEach(function (it) {
      var q = it.querySelector('.faqx-q'), a = it.querySelector('.faqx-a');
      q.setAttribute('data-orig', q.textContent);
      var txt = a.textContent.trim().replace(/\s+/g, ' ');
      var snip = document.createElement('span');
      snip.className = 'faqx-snip';
      snip.textContent = txt.length > 130 ? txt.slice(0, 130).replace(/\s+\S*$/, '') + '…' : txt;
      var tags = (it.getAttribute('data-tags') || '').split('|').filter(Boolean);
      var tl = document.createElement('span');
      tl.className = 'faqx-tags';
      tags.forEach(function (t) { var s = document.createElement('span'); s.textContent = t; tl.appendChild(s); counts[t] = (counts[t] || 0) + 1; });
      var sum = it.querySelector('summary');
      // keep the question in column 2, snippet and tags below it
      sum.appendChild(snip); sum.appendChild(tl);
      it.setAttribute('data-search', norm(txt + ' ' + q.textContent + ' ' + tags.join(' ')));
    });
    var list = document.querySelector('[data-faq-topic-list]');
    if (list) {
      var total = r.querySelectorAll('.faqx-item').length;
      var html = '<li><button type="button" class="faqx-topic is-active" data-topic="">' + T.all + ' <small>' + total + '</small></button></li>';
      Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, DE ? 'de' : 'en'); }).forEach(function (t) {
        html += '<li><button type="button" class="faqx-topic" data-topic="' + esc(t) + '">' + esc(t) + ' <small>' + counts[t] + '</small></button></li>';
      });
      list.innerHTML = html;
      // Phones: the same topics as a dropdown (CSS shows it instead of the list below 900px)
      var box = list.closest('[data-faq-topics]');
      if (box && !box.querySelector('.faqx-topic-select')) {
        var opts = '<option value="">' + T.all + ' (' + total + ')</option>';
        Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, DE ? 'de' : 'en'); }).forEach(function (t) {
          opts += '<option value="' + esc(t) + '">' + esc(t) + ' (' + counts[t] + ')</option>';
        });
        var wrap = document.createElement('div');
        wrap.className = 'faqx-topic-select';
        wrap.innerHTML = '<label class="visually-hidden" for="faqTopicSelect">' + T.filter + '</label>' +
          '<select id="faqTopicSelect" data-faq-topic-select>' + opts + '</select>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        list.parentNode.insertBefore(wrap, list);
        wrap.querySelector('select').addEventListener('change', function (e) { topic = e.target.value; apply(); });
      }
    }
  }

  function apply() {
    var r = root(); if (!r) return;
    var input = r.querySelector('#faqSearch');
    var raw = input.value.trim();
    var terms = norm(raw).split(/\s+/).filter(Boolean);
    var items = r.querySelectorAll('.faqx-item'), shown = 0;

    items.forEach(function (it) {
      var hay = it.getAttribute('data-search');
      var okTerms = terms.every(function (t) { return hay.indexOf(t) !== -1; });
      var okTopic = !topic || (it.getAttribute('data-tags') || '').split('|').indexOf(topic) !== -1;
      var show = okTerms && okTopic;
      it.hidden = !show;
      var q = it.querySelector('.faqx-q');
      q.innerHTML = highlight(q.getAttribute('data-orig'), terms);
      if (show) shown++;
    });

    r.querySelector('.faqx-search').classList.toggle('has-value', !!raw);
    r.querySelector('[data-faq-empty]').classList.toggle('is-visible', shown === 0);
    r.querySelector('[data-faq-reset]').hidden = !(raw || topic);

    var c = r.querySelector('[data-faq-count]');
    if (raw || topic) {
      var what = [];
      if (raw) what.push('“' + esc(raw) + '”');
      if (topic) what.push(T.topic + ' ' + esc(topic));
      c.innerHTML = '<strong>' + shown + '</strong> ' + (shown === 1 ? T.one : T.many) + ' ' + T.for + ' ' + what.join(' ' + T.in + ' ');
    } else {
      c.innerHTML = DEFAULT_COUNT;
    }
    document.querySelectorAll('.faqx-topic').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-topic') === topic);
    });
    var sel = document.querySelector('[data-faq-topic-select]');
    if (sel) sel.value = topic;
  }

  function reset() {
    var r = root(); if (!r) return;
    r.querySelector('#faqSearch').value = '';
    topic = '';
    apply();
  }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'faqSearch') { setup(); apply(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && e.target && e.target.id === 'faqSearch') reset();
  });
  // Clicking anywhere on the question row (or its arrow button) opens / closes the answer
  function toggleItem(tg) {
    var d = tg.closest('.faqx-item'); d.open = !d.open;
    tg.setAttribute('aria-expanded', d.open ? 'true' : 'false');
    tg.setAttribute('aria-label', d.open ? T.hide : T.show);
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('faqx-toggle')) { e.preventDefault(); toggleItem(e.target); }
  });
  document.addEventListener('click', function (e) {
    var sum = e.target.closest ? e.target.closest('.faqx-item > summary') : null;
    if (sum) {
      e.preventDefault();                      // handled here, so the arrow's label and state stay in sync
      if (e.target.closest('a')) return;       // links inside a question keep working
      var tg = sum.querySelector('.faqx-toggle');
      if (tg) toggleItem(tg); else sum.parentNode.open = !sum.parentNode.open;
      return;
    }
    var t = e.target.closest ? e.target.closest('[data-topic], [data-faq-clear], [data-faq-reset]') : null;
    // only the FAQ page's own controls (the glossary has data-topic buttons too)
    if (!t || !root() || (t.hasAttribute('data-topic') && !t.closest('[data-faq-topics]'))) return;
    setup();
    if (t.hasAttribute('data-topic')) { topic = t.getAttribute('data-topic'); apply(); }
    else if (t.hasAttribute('data-faq-clear')) { reset(); root().querySelector('#faqSearch').focus(); }
    else reset();
  });

  function init() { topic = ''; setup(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', function () {
    init();
    if (window.barba && barba.hooks) barba.hooks.afterEnter(init);
  });
})();

/* ---------- Glossary page (glossary.html): search, topic filter and floating meaning ----------
   Lives here rather than in the page so it also runs after a Barba page transition. */
(function () {
  // The German page is generated from the English one, so the script texts follow the page language
  var DE = document.documentElement.lang === 'de';
  var T = DE
    ? { one: 'Begriff', many: 'Begriffe', for: 'für', in: 'im', topic: 'Thema', all: 'Begriffe von A bis Z', allTopics: 'Alle Themen', filter: 'Nach Thema filtern' }
    : { one: 'term', many: 'terms', for: 'for', in: 'in', topic: 'topic', all: 'terms, A to Z', allTopics: 'All topics', filter: 'Filter by topic' };
  var tip = null, cur = null, topic = '';

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function sec() { return document.getElementById('glossary'); }

  // Highlight the search words inside a plain-text string
  function highlight(text, terms) {
    if (!terms.length) return esc(text);
    var plain = norm(text), marks = new Array(text.length + 1).fill(false);
    if (plain.length !== text.length) return esc(text);
    terms.forEach(function (t) {
      var i = plain.indexOf(t);
      while (i !== -1) { for (var k = i; k < i + t.length; k++) marks[k] = true; i = plain.indexOf(t, i + t.length); }
    });
    var out = '', open = false;
    for (var j = 0; j < text.length; j++) {
      if (marks[j] && !open) { out += '<mark>'; open = true; }
      if (!marks[j] && open) { out += '</mark>'; open = false; }
      out += esc(text[j]);
    }
    return out + (open ? '</mark>' : '');
  }

  /* ---------- floating meaning ---------- */
  function getTip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'glx-tip'; tip.id = 'glxTip'; tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    return tip;
  }
  function place(dt) {
    var t = getTip(), r = dt.getBoundingClientRect(), m = 12;
    t.style.left = '0px'; t.style.top = '0px';
    var w = t.offsetWidth, h = t.offsetHeight;
    var left = Math.min(Math.max(m, r.left), window.innerWidth - w - m);
    var top = r.bottom + 10;
    if (top + h > window.innerHeight - m && r.top - h - 10 > m) top = r.top - h - 10;   // not enough room below: show above
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function show(dt) {
    var dd = dt.parentNode.querySelector('dd');
    if (!dd) return;
    if (cur && cur !== dt) cur.classList.remove('is-open');
    var t = getTip();
    t.innerHTML = '<strong>' + esc(dt.getAttribute('data-orig') || dt.textContent) + '</strong>' + esc(dd.textContent.trim());
    place(dt);
    t.classList.add('is-on');
    dt.classList.add('is-open');
    dt.setAttribute('aria-describedby', 'glxTip');
    cur = dt;
  }
  function hide() {
    if (tip) tip.classList.remove('is-on');
    if (cur) { cur.classList.remove('is-open'); cur.removeAttribute('aria-describedby'); }
    cur = null;
  }
  function termOf(el) { return el && el.closest ? el.closest('.glossary.is-interactive .term dt') : null; }

  document.addEventListener('mouseover', function (e) { var dt = termOf(e.target); if (dt && dt !== cur) show(dt); });
  document.addEventListener('mouseout', function (e) {
    var dt = termOf(e.target);
    if (dt && dt === cur && !(e.relatedTarget && dt.contains(e.relatedTarget))) hide();
  });
  document.addEventListener('focusin', function (e) { var dt = termOf(e.target); if (dt) show(dt); });
  document.addEventListener('focusout', function (e) { if (termOf(e.target)) hide(); });
  document.addEventListener('click', function (e) {
    var dt = termOf(e.target);
    if (dt) { show(dt); return; }              // tap on a term (touch screens) shows its meaning
    if (cur) hide();                           // tap anywhere else closes it
    var tp = e.target.closest ? e.target.closest('#glossary [data-topic]') : null;   // not the FAQ page's topics
    if (tp) { topic = tp.getAttribute('data-topic'); apply(); return; }
    var b = e.target.closest ? e.target.closest('[data-glx-clear], [data-glx-reset]') : null;
    if (b) { reset(); if (b.hasAttribute('data-glx-clear')) { var i = document.getElementById('glxSearch'); if (i) i.focus(); } }
  });
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);

  /* ---------- search ---------- */
  function setup() {
    var s = sec();
    if (!s || s.hasAttribute('data-glx-ready')) return;
    s.setAttribute('data-glx-ready', '');
    s.classList.add('is-interactive');
    var counts = {}, total = 0;
    s.querySelectorAll('.term').forEach(function (d) {
      var dt = d.querySelector('dt'), dd = d.querySelector('dd');
      var tg = (d.getAttribute('data-tags') || '').split('|').filter(Boolean);
      tg.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
      total++;
      dt.setAttribute('data-orig', dt.textContent);
      dt.setAttribute('tabindex', '0');
      d.setAttribute('data-search', norm(dt.textContent + ' ' + (dd ? dd.textContent : '') + ' ' + tg.join(' ')));
    });
    var ul = s.querySelector('[data-glx-topic-list]');
    if (ul) {
      var html = '<li><button type="button" class="glx-topic is-active" data-topic="">' + T.allTopics + ' <small>' + total + '</small></button></li>';
      Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, DE ? 'de' : 'en'); }).forEach(function (t) {
        html += '<li><button type="button" class="glx-topic" data-topic="' + esc(t) + '">' + esc(t) + ' <small>' + counts[t] + '</small></button></li>';
      });
      ul.innerHTML = html;
      // Phones: the same topics as a dropdown, styled like the FAQ one (CSS shows it instead of the list below 900px)
      if (!ul.parentNode.querySelector('.faqx-topic-select')) {
        var opts = '<option value="">' + T.allTopics + ' (' + total + ')</option>';
        Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, DE ? 'de' : 'en'); }).forEach(function (t) {
          opts += '<option value="' + esc(t) + '">' + esc(t) + ' (' + counts[t] + ')</option>';
        });
        var wrap = document.createElement('div');
        wrap.className = 'faqx-topic-select';
        wrap.innerHTML = '<label class="visually-hidden" for="glxTopicSelect">' + T.filter + '</label>' +
          '<select id="glxTopicSelect" data-glx-topic-select>' + opts + '</select>' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        ul.parentNode.insertBefore(wrap, ul);
        wrap.querySelector('select').addEventListener('change', function (e) { topic = e.target.value; apply(); });
      }
    }
    apply();
  }

  function apply() {
    var s = sec(); if (!s) return;
    hide();
    var input = document.getElementById('glxSearch');
    var raw = input.value.trim();
    var terms = norm(raw).split(/\s+/).filter(Boolean);
    var list = s.querySelector('.glossary__list');
    var groups = [], group = null, shown = 0, total = 0;

    [].slice.call(list.children).forEach(function (k) {
      if (k.tagName === 'H3') { group = { h: k, n: 0 }; groups.push(group); return; }
      if (!k.classList.contains('term')) return;
      total++;
      var hay = k.getAttribute('data-search');
      var okTopic = !topic || (k.getAttribute('data-tags') || '').split('|').indexOf(topic) !== -1;
      var ok = okTopic && terms.every(function (t) { return hay.indexOf(t) !== -1; });
      k.hidden = !ok;
      var dt = k.querySelector('dt');
      dt.innerHTML = highlight(dt.getAttribute('data-orig'), terms);
      if (ok) { shown++; if (group) group.n++; }
    });
    groups.forEach(function (g) { g.h.hidden = g.n === 0; });

    // dim the letters that have no result in the A to Z bar
    s.querySelectorAll('.glossary__az a').forEach(function (a) {
      var id = a.getAttribute('href').slice(1), g = groups.filter(function (x) { return x.h.id === id; })[0];
      a.classList.toggle('is-empty', !!g && g.n === 0);
    });

    s.querySelector('.glx-search').classList.toggle('has-value', !!raw);
    s.querySelector('[data-glx-empty]').classList.toggle('is-visible', shown === 0);
    s.querySelector('[data-glx-reset]').hidden = !(raw || topic);
    s.querySelector('[data-glx-count]').innerHTML = (raw || topic)
      ? '<strong>' + shown + '</strong> ' + (shown === 1 ? T.one : T.many) + ' ' + T.for + ' ' + [raw ? '“' + esc(raw) + '”' : '', topic ? T.topic + ' ' + esc(topic) : ''].filter(Boolean).join(' ' + T.in + ' ')
      : '<strong>' + total + '</strong> ' + T.all;
    s.querySelectorAll('.glx-topic').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-topic') === topic); });
    var sel = s.querySelector('[data-glx-topic-select]');
    if (sel) sel.value = topic;
  }

  function reset() {
    var i = document.getElementById('glxSearch'); if (!i) return;
    i.value = ''; topic = ''; apply();
  }

  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'glxSearch') { setup(); apply(); } });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { hide(); if (e.target && e.target.id === 'glxSearch') reset(); }
  });

  // a fresh glossary (after a page transition) starts unfiltered
  function init() { if (sec() && !sec().hasAttribute('data-glx-ready')) topic = ''; setup(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.addEventListener('load', function () {
    init();
    if (window.barba && barba.hooks) barba.hooks.afterEnter(init);
  });
})();

/* ---------- Services menu V3: hovering a group shows its sub-services; hovering any item swaps the shared preview ---------- */
(function () {
  function root(el) { return el && el.closest && el.closest('[data-svc3]'); }
  function showImg(r, key) {
    r.querySelectorAll('[data-svc3-img]').forEach(function (img) { img.classList.toggle('is-on', img.getAttribute('data-svc3-img') === key); });
  }
  function info(r) { return r.querySelector('.svc3__info.is-on'); }
  function setTitle(r, text) {
    var t = info(r) && info(r).querySelector('[data-svc3-title]');
    if (!t) return;
    if (!t.hasAttribute('data-default')) t.setAttribute('data-default', t.textContent);
    t.textContent = text == null ? t.getAttribute('data-default') : text;
  }
  function group(r, i) {
    var on = function (el, attr) { el.classList.toggle('is-on', el.getAttribute(attr) === String(i)); };
    r.querySelectorAll('[data-svc3-group]').forEach(function (el) { on(el, 'data-svc3-group'); });
    r.querySelectorAll('[data-svc3-pane]').forEach(function (el) { on(el, 'data-svc3-pane'); });
    r.querySelectorAll('[data-svc3-info]').forEach(function (el) { on(el, 'data-svc3-info'); });
    setTitle(r, null);
    if (info(r)) showImg(r, info(r).getAttribute('data-svc3-img-key'));
  }
  // Returning to the group preview waits a moment: moving from one link to the next crosses the gap between them,
  // and resetting there made the image swap twice (a visible blink) on every move.
  var resetTimer = 0;
  function cancelReset() { clearTimeout(resetTimer); resetTimer = 0; }
  function resetLater(r) {
    if (resetTimer) return;
    resetTimer = setTimeout(function () { resetTimer = 0; setTitle(r, null); if (info(r)) showImg(r, info(r).getAttribute('data-svc3-img-key')); }, 220);
  }
  function item(r, a) {
    cancelReset();
    showImg(r, a.getAttribute('data-svc3-show'));
    var name = a.closest('.svc3__links') ? a.querySelector('span') : null;
    setTitle(r, name ? name.textContent : null);
  }
  // Only the first preview image comes with the page; the others load when the menu is first opened
  function load(r) {
    if (r.hasAttribute('data-svc3-loaded')) return;
    r.setAttribute('data-svc3-loaded', '');
    r.querySelectorAll('img[data-src]').forEach(function (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); });
  }
  function hover(e) {
    var r = root(e.target);
    if (r) load(r);
    if (!r) {
      // Opening the menu again starts at the group of the current page (or the first one)
      var trig = e.target.closest && e.target.closest('[aria-controls="dd-services"]');
      var rr = trig && document.querySelector('#dd-services [data-svc3]');
      if (rr) { load(rr); var cur = rr.querySelector('.svc3__group.is-active'); group(rr, cur ? cur.getAttribute('data-svc3-group') : 0); }
      return;
    }
    var g = e.target.closest('[data-svc3-group]');
    if (g) { cancelReset(); if (!g.classList.contains('is-on')) group(r, g.getAttribute('data-svc3-group')); return; }
    var a = e.target.closest('[data-svc3-show]');
    if (a) { item(r, a); return; }
    // Back on the pane, away from the links: the preview returns to the group (after a short delay, see resetLater)
    if (e.target.closest('.svc3__panes')) resetLater(r);
  }
  document.addEventListener('mouseover', hover);
  document.addEventListener('focusin', hover);
  document.addEventListener('click', function (e) { var t = e.target.closest && e.target.closest('[aria-controls="dd-services"]'); if (t) hover(e); });
})();

/* ---------- Footer social icons: QR code on hover (desktop), to open the profile on a phone ---------- */
(function () {
  // social-qr: generated by tools/dev/make_social_qr.py, do not edit by hand
  var QR = {
   "https://www.facebook.com/jdssommer/": [
    33,
    "M8 0h2v1h-2zM13 0h1v1h-1zM15 0h6v1h-6zM23 0h1v1h-1zM10 1h3v1h-3zM15 1h3v1h-3zM22 1h1v1h-1zM24 1h1v1h-1zM9 2h1v1h-1zM12 2h2v1h-2zM16 2h5v1h-5zM23 2h1v1h-1zM9 3h4v1h-4zM15 3h1v1h-1zM19 3h4v1h-4zM24 3h1v1h-1zM8 4h1v1h-1zM10 4h1v1h-1zM12 4h1v1h-1zM14 4h1v1h-1zM16 4h1v1h-1zM18 4h1v1h-1zM21 4h1v1h-1zM24 4h1v1h-1zM8 5h5v1h-5zM14 5h2v1h-2zM17 5h2v1h-2zM20 5h2v1h-2zM24 5h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM13 7h1v1h-1zM21 7h2v1h-2zM24 7h1v1h-1zM1 8h7v1h-7zM11 8h2v1h-2zM14 8h2v1h-2zM17 8h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM27 8h2v1h-2zM32 8h1v1h-1zM0 9h1v1h-1zM2 9h2v1h-2zM5 9h1v1h-1zM7 9h2v1h-2zM10 9h1v1h-1zM16 9h1v1h-1zM18 9h2v1h-2zM21 9h1v1h-1zM23 9h1v1h-1zM26 9h2v1h-2zM29 9h2v1h-2zM32 9h1v1h-1zM0 10h4v1h-4zM6 10h1v1h-1zM8 10h2v1h-2zM11 10h1v1h-1zM13 10h2v1h-2zM16 10h1v1h-1zM18 10h1v1h-1zM20 10h2v1h-2zM24 10h3v1h-3zM28 10h1v1h-1zM30 10h2v1h-2zM2 11h1v1h-1zM7 11h2v1h-2zM13 11h3v1h-3zM19 11h1v1h-1zM21 11h3v1h-3zM25 11h1v1h-1zM28 11h5v1h-5zM0 12h2v1h-2zM5 12h3v1h-3zM9 12h2v1h-2zM21 12h1v1h-1zM23 12h3v1h-3zM27 12h3v1h-3zM31 12h2v1h-2zM2 13h1v1h-1zM4 13h2v1h-2zM7 13h1v1h-1zM9 13h1v1h-1zM21 13h2v1h-2zM24 13h1v1h-1zM26 13h1v1h-1zM31 13h2v1h-2zM0 14h1v1h-1zM3 14h2v1h-2zM6 14h4v1h-4zM11 14h1v1h-1zM25 14h2v1h-2zM28 14h1v1h-1zM31 14h1v1h-1zM0 15h5v1h-5zM8 15h2v1h-2zM21 15h3v1h-3zM25 15h2v1h-2zM28 15h3v1h-3zM0 16h3v1h-3zM5 16h3v1h-3zM22 16h4v1h-4zM27 16h2v1h-2zM32 16h1v1h-1zM0 17h1v1h-1zM3 17h2v1h-2zM7 17h3v1h-3zM23 17h5v1h-5zM29 17h2v1h-2zM32 17h1v1h-1zM0 18h5v1h-5zM6 18h4v1h-4zM22 18h1v1h-1zM25 18h4v1h-4zM30 18h1v1h-1zM1 19h1v1h-1zM3 19h2v1h-2zM8 19h2v1h-2zM11 19h1v1h-1zM23 19h1v1h-1zM25 19h1v1h-1zM27 19h5v1h-5zM0 20h1v1h-1zM3 20h1v1h-1zM5 20h3v1h-3zM11 20h1v1h-1zM21 20h2v1h-2zM24 20h2v1h-2zM27 20h3v1h-3zM31 20h2v1h-2zM0 21h1v1h-1zM3 21h1v1h-1zM9 21h1v1h-1zM11 21h1v1h-1zM15 21h3v1h-3zM21 21h1v1h-1zM23 21h2v1h-2zM26 21h1v1h-1zM29 21h2v1h-2zM32 21h1v1h-1zM0 22h1v1h-1zM2 22h3v1h-3zM6 22h4v1h-4zM12 22h2v1h-2zM16 22h2v1h-2zM20 22h3v1h-3zM24 22h2v1h-2zM28 22h1v1h-1zM30 22h2v1h-2zM0 23h1v1h-1zM4 23h2v1h-2zM14 23h1v1h-1zM16 23h3v1h-3zM21 23h7v1h-7zM29 23h4v1h-4zM0 24h1v1h-1zM2 24h2v1h-2zM6 24h2v1h-2zM10 24h1v1h-1zM13 24h2v1h-2zM16 24h1v1h-1zM18 24h1v1h-1zM22 24h1v1h-1zM24 24h6v1h-6zM8 25h1v1h-1zM16 25h2v1h-2zM19 25h3v1h-3zM23 25h2v1h-2zM28 25h1v1h-1zM30 25h1v1h-1zM32 25h1v1h-1zM8 26h1v1h-1zM10 26h1v1h-1zM12 26h1v1h-1zM14 26h1v1h-1zM17 26h1v1h-1zM20 26h2v1h-2zM23 26h2v1h-2zM26 26h1v1h-1zM28 26h1v1h-1zM30 26h2v1h-2zM8 27h1v1h-1zM10 27h1v1h-1zM12 27h1v1h-1zM17 27h8v1h-8zM28 27h5v1h-5zM8 28h2v1h-2zM14 28h3v1h-3zM18 28h2v1h-2zM21 28h1v1h-1zM24 28h6v1h-6zM31 28h2v1h-2zM8 29h1v1h-1zM11 29h1v1h-1zM13 29h4v1h-4zM20 29h4v1h-4zM25 29h1v1h-1zM28 29h1v1h-1zM30 29h1v1h-1zM32 29h1v1h-1zM8 30h2v1h-2zM12 30h1v1h-1zM14 30h4v1h-4zM19 30h1v1h-1zM23 30h5v1h-5zM29 30h1v1h-1zM8 31h2v1h-2zM11 31h1v1h-1zM15 31h1v1h-1zM19 31h3v1h-3zM23 31h1v1h-1zM25 31h1v1h-1zM28 31h3v1h-3zM11 32h3v1h-3zM15 32h2v1h-2zM19 32h1v1h-1zM22 32h4v1h-4zM27 32h1v1h-1zM29 32h1v1h-1zM31 32h1v1h-1z"
   ],
   "https://www.linkedin.com/company/jds-sommer-gmbh": [
    37,
    "M11 0h1v1h-1zM13 0h3v1h-3zM19 0h1v1h-1zM22 0h1v1h-1zM24 0h2v1h-2zM28 0h1v1h-1zM8 1h1v1h-1zM12 1h1v1h-1zM16 1h1v1h-1zM19 1h1v1h-1zM21 1h4v1h-4zM28 1h1v1h-1zM8 2h1v1h-1zM11 2h1v1h-1zM13 2h3v1h-3zM22 2h1v1h-1zM25 2h4v1h-4zM9 3h1v1h-1zM12 3h2v1h-2zM16 3h1v1h-1zM18 3h1v1h-1zM22 3h1v1h-1zM24 3h4v1h-4zM9 4h1v1h-1zM12 4h2v1h-2zM16 4h3v1h-3zM21 4h1v1h-1zM24 4h1v1h-1zM27 4h1v1h-1zM10 5h1v1h-1zM12 5h1v1h-1zM14 5h3v1h-3zM18 5h4v1h-4zM24 5h2v1h-2zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM26 6h1v1h-1zM28 6h1v1h-1zM11 7h2v1h-2zM14 7h4v1h-4zM19 7h2v1h-2zM22 7h3v1h-3zM27 7h2v1h-2zM1 8h3v1h-3zM5 8h2v1h-2zM10 8h1v1h-1zM13 8h1v1h-1zM16 8h3v1h-3zM21 8h1v1h-1zM23 8h1v1h-1zM25 8h1v1h-1zM27 8h2v1h-2zM34 8h2v1h-2zM5 9h1v1h-1zM8 9h2v1h-2zM11 9h1v1h-1zM13 9h2v1h-2zM17 9h1v1h-1zM21 9h1v1h-1zM23 9h1v1h-1zM25 9h4v1h-4zM30 9h1v1h-1zM34 9h1v1h-1zM2 10h2v1h-2zM5 10h2v1h-2zM8 10h1v1h-1zM11 10h1v1h-1zM14 10h1v1h-1zM17 10h3v1h-3zM22 10h4v1h-4zM27 10h1v1h-1zM29 10h1v1h-1zM32 10h2v1h-2zM2 11h1v1h-1zM4 11h1v1h-1zM7 11h1v1h-1zM20 11h1v1h-1zM23 11h1v1h-1zM25 11h3v1h-3zM31 11h1v1h-1zM33 11h3v1h-3zM0 12h2v1h-2zM5 12h3v1h-3zM11 12h1v1h-1zM15 12h4v1h-4zM22 12h1v1h-1zM24 12h3v1h-3zM29 12h2v1h-2zM32 12h3v1h-3zM36 12h1v1h-1zM0 13h2v1h-2zM9 13h1v1h-1zM11 13h1v1h-1zM14 13h1v1h-1zM16 13h2v1h-2zM20 13h3v1h-3zM25 13h1v1h-1zM27 13h1v1h-1zM30 13h3v1h-3zM34 13h3v1h-3zM1 14h1v1h-1zM3 14h2v1h-2zM6 14h6v1h-6zM13 14h1v1h-1zM24 14h1v1h-1zM26 14h1v1h-1zM30 14h1v1h-1zM32 14h1v1h-1zM34 14h2v1h-2zM3 15h1v1h-1zM5 15h1v1h-1zM7 15h1v1h-1zM9 15h1v1h-1zM12 15h1v1h-1zM23 15h1v1h-1zM26 15h1v1h-1zM29 15h4v1h-4zM3 16h2v1h-2zM6 16h1v1h-1zM11 16h1v1h-1zM13 16h1v1h-1zM23 16h1v1h-1zM25 16h1v1h-1zM33 16h2v1h-2zM36 16h1v1h-1zM1 17h1v1h-1zM4 17h2v1h-2zM7 17h1v1h-1zM11 17h2v1h-2zM24 17h2v1h-2zM27 17h1v1h-1zM30 17h1v1h-1zM36 17h1v1h-1zM0 18h1v1h-1zM6 18h1v1h-1zM8 18h1v1h-1zM10 18h4v1h-4zM23 18h3v1h-3zM27 18h1v1h-1zM34 18h3v1h-3zM0 19h1v1h-1zM2 19h3v1h-3zM7 19h1v1h-1zM11 19h2v1h-2zM24 19h1v1h-1zM27 19h7v1h-7zM35 19h1v1h-1zM1 20h2v1h-2zM5 20h3v1h-3zM9 20h1v1h-1zM13 20h1v1h-1zM23 20h1v1h-1zM26 20h4v1h-4zM32 20h1v1h-1zM1 21h2v1h-2zM4 21h1v1h-1zM10 21h1v1h-1zM23 21h1v1h-1zM25 21h1v1h-1zM31 21h1v1h-1zM34 21h1v1h-1zM1 22h1v1h-1zM3 22h1v1h-1zM6 22h2v1h-2zM10 22h1v1h-1zM12 22h1v1h-1zM23 22h3v1h-3zM30 22h1v1h-1zM32 22h1v1h-1zM34 22h1v1h-1zM0 23h1v1h-1zM3 23h1v1h-1zM5 23h1v1h-1zM8 23h3v1h-3zM12 23h1v1h-1zM15 23h1v1h-1zM18 23h1v1h-1zM20 23h1v1h-1zM24 23h1v1h-1zM27 23h2v1h-2zM30 23h1v1h-1zM33 23h4v1h-4zM1 24h1v1h-1zM3 24h2v1h-2zM6 24h2v1h-2zM10 24h3v1h-3zM14 24h1v1h-1zM18 24h3v1h-3zM22 24h3v1h-3zM26 24h1v1h-1zM28 24h2v1h-2zM34 24h3v1h-3zM1 25h1v1h-1zM8 25h2v1h-2zM13 25h1v1h-1zM17 25h2v1h-2zM22 25h1v1h-1zM24 25h1v1h-1zM26 25h1v1h-1zM29 25h1v1h-1zM32 25h1v1h-1zM35 25h2v1h-2zM1 26h2v1h-2zM6 26h2v1h-2zM9 26h1v1h-1zM16 26h1v1h-1zM18 26h2v1h-2zM21 26h2v1h-2zM24 26h1v1h-1zM26 26h1v1h-1zM31 26h1v1h-1zM35 26h1v1h-1zM0 27h1v1h-1zM4 27h1v1h-1zM7 27h1v1h-1zM9 27h2v1h-2zM13 27h3v1h-3zM21 27h1v1h-1zM23 27h1v1h-1zM26 27h2v1h-2zM29 27h1v1h-1zM32 27h1v1h-1zM36 27h1v1h-1zM2 28h1v1h-1zM4 28h5v1h-5zM10 28h2v1h-2zM16 28h2v1h-2zM19 28h3v1h-3zM24 28h2v1h-2zM28 28h5v1h-5zM34 28h2v1h-2zM8 29h2v1h-2zM11 29h1v1h-1zM16 29h2v1h-2zM22 29h3v1h-3zM26 29h3v1h-3zM32 29h3v1h-3zM36 29h1v1h-1zM10 30h2v1h-2zM14 30h1v1h-1zM20 30h2v1h-2zM26 30h1v1h-1zM28 30h1v1h-1zM30 30h1v1h-1zM32 30h2v1h-2zM35 30h2v1h-2zM8 31h2v1h-2zM11 31h2v1h-2zM14 31h1v1h-1zM16 31h2v1h-2zM19 31h1v1h-1zM22 31h1v1h-1zM24 31h1v1h-1zM27 31h2v1h-2zM32 31h2v1h-2zM9 32h1v1h-1zM11 32h1v1h-1zM13 32h2v1h-2zM17 32h3v1h-3zM22 32h1v1h-1zM24 32h1v1h-1zM28 32h6v1h-6zM36 32h1v1h-1zM8 33h2v1h-2zM11 33h1v1h-1zM13 33h3v1h-3zM17 33h1v1h-1zM20 33h1v1h-1zM22 33h1v1h-1zM24 33h2v1h-2zM27 33h1v1h-1zM30 33h1v1h-1zM32 33h1v1h-1zM35 33h1v1h-1zM8 34h1v1h-1zM12 34h3v1h-3zM19 34h2v1h-2zM22 34h4v1h-4zM27 34h1v1h-1zM30 34h1v1h-1zM32 34h2v1h-2zM35 34h1v1h-1zM8 35h1v1h-1zM10 35h3v1h-3zM14 35h1v1h-1zM17 35h1v1h-1zM20 35h1v1h-1zM25 35h2v1h-2zM29 35h2v1h-2zM33 35h2v1h-2zM10 36h2v1h-2zM13 36h1v1h-1zM15 36h1v1h-1zM18 36h2v1h-2zM22 36h1v1h-1zM24 36h4v1h-4zM32 36h5v1h-5z"
   ],
   "https://www.instagram.com/jds_sommer/": [
    33,
    "M8 0h1v1h-1zM11 0h1v1h-1zM15 0h1v1h-1zM17 0h3v1h-3zM23 0h1v1h-1zM9 1h1v1h-1zM11 1h2v1h-2zM15 1h1v1h-1zM17 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM10 2h2v1h-2zM13 2h1v1h-1zM15 2h4v1h-4zM20 2h3v1h-3zM24 2h1v1h-1zM10 3h1v1h-1zM16 3h1v1h-1zM19 3h3v1h-3zM23 3h2v1h-2zM8 4h1v1h-1zM14 4h5v1h-5zM23 4h2v1h-2zM8 5h2v1h-2zM14 5h1v1h-1zM16 5h2v1h-2zM20 5h1v1h-1zM22 5h1v1h-1zM24 5h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM10 7h1v1h-1zM12 7h2v1h-2zM15 7h1v1h-1zM18 7h1v1h-1zM21 7h1v1h-1zM23 7h2v1h-2zM1 8h7v1h-7zM10 8h2v1h-2zM15 8h1v1h-1zM17 8h1v1h-1zM22 8h1v1h-1zM24 8h1v1h-1zM27 8h2v1h-2zM32 8h1v1h-1zM0 9h1v1h-1zM4 9h2v1h-2zM9 9h1v1h-1zM12 9h1v1h-1zM14 9h1v1h-1zM18 9h6v1h-6zM26 9h2v1h-2zM29 9h2v1h-2zM32 9h1v1h-1zM0 10h1v1h-1zM2 10h1v1h-1zM6 10h1v1h-1zM9 10h1v1h-1zM12 10h1v1h-1zM18 10h1v1h-1zM20 10h2v1h-2zM24 10h1v1h-1zM28 10h1v1h-1zM30 10h1v1h-1zM3 11h2v1h-2zM11 11h1v1h-1zM13 11h2v1h-2zM16 11h1v1h-1zM21 11h1v1h-1zM23 11h1v1h-1zM25 11h2v1h-2zM28 11h4v1h-4zM1 12h1v1h-1zM5 12h6v1h-6zM21 12h1v1h-1zM23 12h1v1h-1zM25 12h1v1h-1zM28 12h2v1h-2zM31 12h2v1h-2zM0 13h2v1h-2zM3 13h1v1h-1zM7 13h4v1h-4zM21 13h1v1h-1zM23 13h1v1h-1zM26 13h1v1h-1zM29 13h1v1h-1zM31 13h2v1h-2zM1 14h3v1h-3zM6 14h2v1h-2zM25 14h2v1h-2zM28 14h2v1h-2zM31 14h1v1h-1zM4 15h2v1h-2zM7 15h1v1h-1zM9 15h1v1h-1zM11 15h1v1h-1zM21 15h2v1h-2zM25 15h2v1h-2zM28 15h3v1h-3zM0 16h2v1h-2zM3 16h1v1h-1zM5 16h3v1h-3zM9 16h1v1h-1zM22 16h1v1h-1zM24 16h2v1h-2zM27 16h2v1h-2zM32 16h1v1h-1zM2 17h1v1h-1zM4 17h2v1h-2zM7 17h1v1h-1zM10 17h1v1h-1zM22 17h6v1h-6zM29 17h2v1h-2zM32 17h1v1h-1zM0 18h1v1h-1zM2 18h1v1h-1zM4 18h4v1h-4zM9 18h1v1h-1zM22 18h1v1h-1zM25 18h4v1h-4zM30 18h2v1h-2zM0 19h2v1h-2zM4 19h2v1h-2zM7 19h3v1h-3zM11 19h1v1h-1zM23 19h1v1h-1zM25 19h8v1h-8zM2 20h2v1h-2zM6 20h1v1h-1zM8 20h1v1h-1zM11 20h1v1h-1zM21 20h2v1h-2zM24 20h2v1h-2zM29 20h1v1h-1zM31 20h2v1h-2zM0 21h3v1h-3zM4 21h1v1h-1zM7 21h1v1h-1zM9 21h1v1h-1zM12 21h7v1h-7zM21 21h1v1h-1zM23 21h1v1h-1zM26 21h1v1h-1zM32 21h1v1h-1zM0 22h1v1h-1zM3 22h1v1h-1zM5 22h2v1h-2zM8 22h1v1h-1zM10 22h1v1h-1zM15 22h1v1h-1zM20 22h3v1h-3zM25 22h1v1h-1zM28 22h1v1h-1zM31 22h1v1h-1zM0 23h1v1h-1zM4 23h2v1h-2zM7 23h5v1h-5zM14 23h2v1h-2zM17 23h2v1h-2zM21 23h1v1h-1zM25 23h3v1h-3zM29 23h3v1h-3zM0 24h1v1h-1zM2 24h2v1h-2zM6 24h2v1h-2zM9 24h1v1h-1zM12 24h3v1h-3zM20 24h1v1h-1zM22 24h7v1h-7zM31 24h1v1h-1zM8 25h2v1h-2zM11 25h4v1h-4zM17 25h1v1h-1zM19 25h3v1h-3zM23 25h2v1h-2zM28 25h1v1h-1zM30 25h1v1h-1zM32 25h1v1h-1zM8 26h2v1h-2zM11 26h5v1h-5zM17 26h1v1h-1zM20 26h2v1h-2zM23 26h2v1h-2zM26 26h1v1h-1zM28 26h1v1h-1zM30 26h2v1h-2zM8 27h1v1h-1zM14 27h1v1h-1zM16 27h1v1h-1zM19 27h6v1h-6zM28 27h5v1h-5zM8 28h1v1h-1zM10 28h3v1h-3zM17 28h1v1h-1zM21 28h1v1h-1zM24 28h6v1h-6zM8 29h2v1h-2zM11 29h1v1h-1zM13 29h2v1h-2zM16 29h1v1h-1zM18 29h1v1h-1zM20 29h4v1h-4zM25 29h1v1h-1zM28 29h3v1h-3zM32 29h1v1h-1zM8 30h2v1h-2zM11 30h2v1h-2zM15 30h5v1h-5zM21 30h1v1h-1zM23 30h5v1h-5zM30 30h1v1h-1zM8 31h1v1h-1zM11 31h1v1h-1zM15 31h3v1h-3zM19 31h4v1h-4zM25 31h2v1h-2zM28 31h3v1h-3zM10 32h1v1h-1zM12 32h1v1h-1zM16 32h2v1h-2zM19 32h1v1h-1zM22 32h4v1h-4zM27 32h1v1h-1zM29 32h1v1h-1zM31 32h1v1h-1z"
   ]
  };
  // /social-qr
  var BADGE = 8 / 33;   // icon badge size as a share of the code width, as in tools/dev/make_social_qr.py
  var de = (document.documentElement.lang || '').indexOf('de') === 0;
  var CAP = {
    facebook: de ? 'Scannen & folgen' : 'Scan to follow',
    linkedin: de ? 'Scannen & vernetzen' : 'Scan to connect',
    instagram: de ? 'Scannen & folgen' : 'Scan to follow'
  };
  // Corner "eyes": rounded navy frame with a rounded red centre (keeps the 1:1:3:1:1 finder shape scanners look for)
  function eye(x, y) {
    return '<rect class="social-qr__frame" x="' + (x + .5) + '" y="' + (y + .5) + '" width="6" height="6" rx="2"/>'
      + '<rect class="social-qr__ball" x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3" rx=".9"/>';
  }
  function code(q, net) {
    var n = q[0], b = n * BADGE, c = (n - b) / 2;
    return '<svg viewBox="-1 -1 ' + (n + 2) + ' ' + (n + 2) + '">'
      + '<path class="social-qr__data" d="' + q[1] + '" shape-rendering="crispEdges"/>'
      + eye(0, 0) + eye(n - 7, 0) + eye(0, n - 7)
      + '<rect class="social-qr__badge" x="' + c + '" y="' + c + '" width="' + b + '" height="' + b + '" rx="' + (b * .19) + '"/>'
      + '<use href="#i-' + net + '" x="' + (c + b * .125) + '" y="' + (c + b * .125) + '" width="' + (b * .75) + '" height="' + (b * .75) + '"/>'
      + '</svg>';
  }
  document.querySelectorAll('.site-footer .social--footer .social__link').forEach(function (a) {
    var url = a.getAttribute('href'), q = QR[url];
    if (!q || a.querySelector('.social-qr')) return;   // no code for this link (yet): rerun the generator
    var net = (url.match(/facebook|linkedin|instagram/) || [''])[0];
    if (!net) return;
    var pop = document.createElement('span');
    pop.className = 'social-qr';
    pop.setAttribute('aria-hidden', 'true');
    pop.innerHTML = code(q, net) + '<span>' + CAP[net] + '</span>';
    a.appendChild(pop);
  });
})();
