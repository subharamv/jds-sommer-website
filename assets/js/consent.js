/* ==========================================================================
   JDS Sommer — cookie consent for Google Analytics 4
   Added to the page by tools/seo/build_seo.py once a GA4 ID is set there
   (<script src="consent.js" data-ga4="G-...">). GA4 loads only after the
   visitor accepts; the choice is kept and can be changed from the footer
   ("Cookie settings"). Ahrefs Web Analytics is cookieless and not gated here.
   ========================================================================== */
(function () {
  'use strict';

  var script = document.currentScript;
  var GA4 = script && script.getAttribute('data-ga4');
  if (!GA4) return;
  var KEY = 'jdsConsent';
  var root = document.documentElement;
  var DE = /^de/i.test(root.lang);
  var T = DE ? {
    label: 'Cookie-Einstellungen',
    title: 'Darf Google Analytics mitzählen?',
    text: 'Mit Ihrer Zustimmung setzen wir Google Analytics ein, um zu sehen, welche Seiten gelesen werden, und die Website zu verbessern. Dabei werden Cookies gesetzt und Daten an Google übermittelt. Ohne Zustimmung bleibt es bei technisch notwendigen Daten.',
    policy: 'Datenschutzerklärung',
    accept: 'Akzeptieren',
    reject: 'Ablehnen'
  } : {
    label: 'Cookie settings',
    title: 'May Google Analytics count your visit?',
    text: 'With your consent we use Google Analytics to see which pages are read and to improve the website. It sets cookies and sends data to Google. Without consent, only technically necessary data is used.',
    policy: 'Privacy policy',
    accept: 'Accept',
    reject: 'Decline'
  };

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // Consent Mode v2: everything denied until the visitor agrees
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('cookie-consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });

  var loaded = false;
  function loadGA() {
    if (loaded) return;
    loaded = true;
    gtag('cookie-consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', GA4, { anonymize_ip: true });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4);
    document.head.appendChild(s);
    // Barba swaps pages without a reload: count those as page views too.
    // It is a deferred script after this one, so it exists only from DOMContentLoaded on.
    whenReady(function () {
      if (!window.barba || !window.barba.hooks) return;
      window.barba.hooks.after(function () {
        gtag('event', 'page_view', { page_location: location.href, page_title: document.title });
      });
    });
  }
  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // Remove GA cookies after a withdrawal (they live on this host and its parent domain)
  function clearGA() {
    // Stop GA first, or it writes its session cookie again before the reload
    window['ga-disable-' + GA4] = true;
    gtag('cookie-consent', 'update', { analytics_storage: 'denied' });
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      var host = location.hostname.split('.');
      for (var i = 0; i < host.length - 1; i++) {
        document.cookie = name + '=; Max-Age=0; path=/; domain=.' + host.slice(i).join('.');
      }
      document.cookie = name + '=; Max-Age=0; path=/';
    });
  }

  var box;
  function policyHref() {
    var a = document.querySelector('.footer__legal a[href*="privacy-policy"]');
    return a ? a.getAttribute('href') : (DE ? '../' : '') + 'privacy-policy.html';
  }
  function show(focus) {
    if (!box) {
      box = document.createElement('div');
      box.className = 'cookie-consent';
      box.tabIndex = -1;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-live', 'polite');
      box.setAttribute('aria-labelledby', 'cookie-consent-title');
      box.setAttribute('data-lenis-prevent', '');
      box.innerHTML =
        '<p class="cookie-consent__title" id="cookie-consent-title">' + T.title + '</p>' +
        '<p class="cookie-consent__text">' + T.text + ' <a href="' + policyHref() + '">' + T.policy + '</a></p>' +
        '<div class="cookie-consent__actions">' +
          // Same weight for both choices: declining must be as easy as accepting
          '<button type="button" class="btn btn--dark btn--sm" data-consent="denied">' + T.reject + '</button>' +
          '<button type="button" class="btn btn--dark btn--sm" data-consent="granted">' + T.accept + '</button>' +
        '</div>';
      box.addEventListener('click', function (e) {
        var b = e.target.closest('[data-consent]');
        if (!b) return;
        var v = b.getAttribute('data-consent');
        var before = get();
        set(v);
        hide();
        if (v === 'granted') loadGA();
        // Withdrawing after GA has run: clear its cookies and reload so the script is gone
        else if (before === 'granted' || loaded) { clearGA(); location.reload(); }
      });
      document.body.appendChild(box);
    }
    box.hidden = false;
    requestAnimationFrame(function () { box.classList.add('is-on'); });
    // Opened from the footer: move focus there. On page load the banner does not take focus away from the page.
    if (focus === true) box.focus({ preventScroll: true });
  }
  function hide() { if (box) { box.classList.remove('is-on'); box.hidden = true; } }

  // Footer "Cookie settings" buttons (hidden until this script runs); delegated, so pages swapped in by Barba work too
  root.classList.add('has-consent');
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-cookie-settings]')) { e.preventDefault(); show(true); }
  });

  var choice = get();
  if (choice === 'granted') loadGA();
  else if (!choice) whenReady(show);
})();
