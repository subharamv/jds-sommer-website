/* ==========================================================================
   JDS Sommer — interactions
   GSAP + ScrollTrigger for motion, Lenis for smooth scroll,
   Barba for app-like page transitions (only when served over http/https).
   Everything degrades: without the libraries the page is static and usable.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var hasGSAP = !!window.gsap;
  var animate = hasGSAP && !reduceMotion;
  var lenis = null;
  var pageCtx = null;
  var pageCleanups = [];

  if (!animate) root.classList.remove('js', 'show-preloader');
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
  function initHeader() {
    var header = $('[data-header]');
    if (!header) return;
    var lastY = window.scrollY;
    var fab = $('[data-fab-top]');
    if (fab) fab.addEventListener('click', function () { if (animate) gsap.fromTo($('svg', fab), { y: 0 }, { y: -24, duration: 0.35, ease: 'power2.in', yoyo: true, repeat: 1 }); });
    function onScroll() {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      if (fab) fab.classList.toggle('is-visible', y > 700);
      var goingDown = y > lastY + 4, goingUp = y < lastY - 4;
      if (!root.classList.contains('menu-open')) {
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
  function openMenu() {
    root.classList.add('menu-open');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
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
    root.classList.remove('menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
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
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span'); w.className = 'w';
          var wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w); out.push(wi);
        });
        node.replaceChild(frag, child);
      });
    })(el);
    el.dataset.splitDone = '1';
    return out;
  }

  function formatNum(n, fmt) {
    n = Math.round(n);
    return fmt === 'thousands' ? n.toLocaleString('en-US') : String(n);
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
      btn.setAttribute('aria-label', paused ? 'Play background video' : 'Pause background video');
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
  var LOD = {
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
      if (label) label.textContent = p < 0.5 ? 'Point cloud · 2.4 M points' : p < 0.98 ? 'Modeling · ' + Math.round(p * 100) + '%' : 'CAD model · fully structured';
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
    el.textContent = formatNum(0, fmt);
    gsap.to(o, {
      v: end, duration: duration || 2, delay: delay || 0, ease: 'power2.out',
      onUpdate: function () { el.textContent = formatNum(o.v, fmt); },
      scrollTrigger: delay ? null : { trigger: el, start: 'top 90%', once: true }
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
      if (line) gsap.to(line, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: wrap, start: 'top 75%', end: 'bottom 60%', scrub: 0.6 } });
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
    $$('.magnetic', document).forEach(function (btn) {
      if (btn.dataset.magnet) return;
      btn.dataset.magnet = '1';
      var x = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
      var y = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        x((e.clientX - r.left - r.width / 2) * 0.25);
        y((e.clientY - r.top - r.height / 2) * 0.35);
      });
      btn.addEventListener('pointerleave', function () { x(0); y(0); });
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
      pauseBtn.setAttribute('aria-label', userPaused ? 'Play the carousel' : 'Pause the carousel');
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
    vp.addEventListener('lostpointercapture', endDrag);
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

    var phone = $('#f-phone', form);
    var phoneReq = $('[data-phone-req]', form);
    function syncCallback() {
      var cb = $('input[name="reply"]:checked', form).value === 'A callback';
      phone.required = cb;
      phoneReq.hidden = !cb;
    }
    $$('input[name="reply"]', form).forEach(function (r) { r.addEventListener('change', syncCallback); });
    syncCallback();

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
      if (field.required && !v) { setError(field, 'Please fill in this field.'); return false; }
      if (field.type === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setError(field, 'Please enter a valid email address.'); return false; }
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

    /* Step-by-step: without JS all steps show as one long form */
    var steps = $$('[data-form-step]', form);
    var current = 0;
    var dots = $$('[data-step-dot]', form);
    var progress = $('[data-step-progress]', form);
    var stepNum = $('[data-step-num]', form);
    var stepFields = function (i) { return fields.filter(function (f) { return steps[i].contains(f); }); };

    function shake() { if (animate) gsap.fromTo(form, { x: -6 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }); }
    function checkStep(i) {
      var bad = null;
      stepFields(i).forEach(function (f) { if (!validate(f) && !bad) bad = f; });
      return bad;
    }
    function showStep(i, dir) {
      var prev = steps[current];
      current = i;
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-current', k === i);
        d.classList.toggle('is-done', k < i);
      });
      form.classList.toggle('is-first', i === 0);
      form.classList.toggle('is-last', i === steps.length - 1);
      if (progress) progress.style.width = ((i + 1) / steps.length * 100) + '%';
      if (stepNum) stepNum.textContent = i + 1;
      if (dir && animate && prev !== steps[i]) {
        gsap.fromTo(steps[i], { x: 30 * dir, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' });
      }
      if (dir) {
        // keep the top of the form in view and move focus into the new step
        var top = form.getBoundingClientRect().top;
        if (top < 0 || top > window.innerHeight * 0.6) scrollToTarget(form);
        var first = $('input:not([type=hidden]), select, textarea', steps[i]);
        if (first) first.focus({ preventScroll: true });
      }
      if (lenis) lenis.resize();
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }
    function next() {
      var bad = checkStep(current);
      if (bad) { bad.focus({ preventScroll: true }); shake(); return; }
      if (current < steps.length - 1) showStep(current + 1, 1);
    }

    if (steps.length > 1) {
      form.classList.add('is-stepped');
      showStep(0);
      $('[data-step-next]', form).addEventListener('click', next);
      $('[data-step-prev]', form).addEventListener('click', function () { if (current > 0) showStep(current - 1, -1); });
      dots.forEach(function (d, k) { d.addEventListener('click', function () { if (k < current) showStep(k, -1); }); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Enter key on an earlier step means "continue"
      if (form.classList.contains('is-stepped') && current < steps.length - 1) { next(); return; }

      var ok = true, firstBad = null;
      fields.forEach(function (f) { if (!validate(f)) { ok = false; firstBad = firstBad || f; } });
      if (!ok) {
        if (form.classList.contains('is-stepped')) {
          var k = steps.findIndex(function (s) { return s.contains(firstBad); });
          if (k !== current) showStep(k, -1);
        }
        firstBad.focus({ preventScroll: true });
        scrollToTarget(firstBad.closest('.field, .consent'));
        shake();
        return;
      }

      var success = $('.form__success', form);
      // Bots fill the hidden field; pretend success and send nothing.
      if ($('#f-website', form).value) { success.hidden = false; return; }

      var d = new FormData(form);
      var g = function (k) { return (d.get(k) || '').toString().trim(); };
      var lines = [
        'I would like: ' + g('reply'),
        '',
        'Company: ' + (g('company') || '-'),
        'Name: ' + g('salutation') + ' ' + g('first_name') + ' ' + g('last_name'),
        'Street: ' + g('street'),
        'Postal code / Location: ' + g('postal_code') + ' ' + g('location'),
        'Country: ' + g('country'),
        'Email: ' + g('email'),
        'Phone: ' + (g('phone') || '-'),
        'Fax: ' + (g('fax') || '-'),
        'How did you find us: ' + g('source'),
        'Regarding: ' + g('reference'),
        '',
        'Inquiry:',
        g('inquiry'),
        '',
        'Privacy policy accepted: yes'
      ];
      var subject = 'Website inquiry: ' + g('reference') + ' (' + g('first_name') + ' ' + g('last_name') + ')';
      window.location.href = 'mailto:info@jds-sommer.de?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));

      success.hidden = false;
      if (animate) gsap.fromTo(success, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' });
    });
  }

  /* ---------- Page lifecycle ---------- */
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
    initIndustries(container);

    if (!animate) return;
    pageCtx = gsap.context(function () {
      if (!opts.deferHero) heroIntro(container);
      initReveals(container);
    }, container);
    initPointer(container);
    ScrollTrigger.refresh();
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
    var tris = $$('.pl-t', pre);
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
      .from('.pl-red', { y: -30, duration: 0.5, ease: 'back.out(3)' }, '-=0.3')
      .from('.preloader__word', { opacity: 0, letterSpacing: '0.6em', duration: 0.6, ease: 'power2.out' }, '-=0.5')
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 0.8, ease: 'power4.inOut', onStart: done }, '+=0.15');
    gsap.set(pre, { clipPath: 'inset(0 0 0% 0)' });
  }

  /* ---------- Barba page transitions ---------- */
  function initBarba() {
    if (!animate || !window.barba || !/^https?:$/.test(location.protocol)) return;
    var curtain = $('.curtain'), mark = $('.curtain__mark');

    barba.init({
      preventRunning: true,
      prevent: function (o) {
        var el = o.el;
        return el.target === '_blank' || el.hasAttribute('data-no-barba') || isSamePageHash(el);
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
        beforeEnter: function () {
          destroyPage();
          if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
        },
        enter: function (data) {
          initPage(data.next.container, { deferHero: true });
          var hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
          if (hashTarget) scrollToTarget(hashTarget, true);
          return gsap.timeline()
            .to(mark, { opacity: 0, scale: 1.1, duration: 0.25 })
            .to(curtain, { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'power4.inOut' }, '-=0.05')
            .add(function () { if (pageCtx) pageCtx.add(function () { heroIntro(data.next.container); }); }, '-=0.45')
            .then();
        }
      }]
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initLenis();
    initHeader();
    initMenu();
    initNavDropdowns();
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
