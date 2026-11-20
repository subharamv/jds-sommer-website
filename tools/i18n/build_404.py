"""Build 404.html in German (run by build_de.py after the German pages). Usage: python tools/i18n/build_404.py

site/404.html in German (the site's default language), English as the second language.

The server shows /404.html for every missing URL, at any depth, so every link is made absolute.
Header, menus and footer come from the built German home page, so they match the German site exactly."""
import re, sys, pathlib
sys.stdout.reconfigure(encoding='utf-8')
SITE = pathlib.Path(__file__).resolve().parents[2]
old = (SITE / '404.html').read_text(encoding='utf-8')
home = (SITE / 'index.html').read_text(encoding='utf-8')

# ---- head: the 404's own head (noindex, absolute asset paths), in German
head = old[:old.index('</head>') + len('</head>')]
head = head.replace('<html lang="en-GB"', '<html lang="de"', 1)  # no-op once German
for a, b in [
    ('<title>Page not found | JDS Sommer</title>', '<title>Seite nicht gefunden | JDS Sommer</title>'),
    ('<meta name="description" content="The page you were looking for does not exist. Seite nicht gefunden.">',
     '<meta name="description" content="Die gesuchte Seite existiert nicht oder wurde verschoben. Page not found.">'),
    ('<meta property="og:title" content="Page not found | JDS Sommer">', '<meta property="og:title" content="Seite nicht gefunden | JDS Sommer">'),
    ('<meta property="og:description" content="The page you were looking for does not exist.">',
     '<meta property="og:description" content="Die gesuchte Seite existiert nicht oder wurde verschoben.">'),
]:
    if b not in head:
        assert a in head, a
        head = head.replace(a, b, 1)

# ---- body around <main>: from the German home page
b0 = home.index('<body')
m0 = home.index('<main id="main"')
m1 = home.index('</main>') + len('</main>')
pre, post = home[b0:m0], home[m1:]

MAIN = '''<main id="main" data-barba="container" data-barba-namespace="not-found"><span aria-hidden="true" style="display:none">​‌​‌​‌‌‌​‌​​‌‌​‌​‌‌‌‌‌​​​‌​‌‌​​‌​‌‌‌​‌​‌​‌‌‌​‌‌​​‌‌​​​​‌​​‌​​​​​​‌​‌​​‌‌​‌‌‌​‌​‌​‌‌​​​‌​​‌‌​‌​​​​‌‌​​​​‌​‌‌‌​​‌​​‌‌​​​​‌​‌‌​‌‌​‌​​‌​​​​​​‌​‌​‌‌​​‌‌​​​​‌​‌‌‌​​‌‌​‌‌​​​​‌​‌‌​‌‌​‌​‌‌‌​​‌‌​‌‌​​‌​‌​‌‌‌​‌​​​‌‌‌​‌​​​‌‌​‌​​‌​‌‌‌‌‌​​​‌‌​‌​​​​‌‌‌​‌​​​‌‌‌​‌​​​‌‌‌​​​​​‌‌‌​​‌‌​​‌‌‌​‌​​​‌​‌‌‌‌​​‌​‌‌‌‌​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​‌‌‌​​‌‌​‌‌​​​‌‌​‌​​‌​‌‌​‌‌‌​​‌‌​‌​‌‌​‌‌​​‌​‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​‌‌‌​​‌‌​​​‌‌​‌‌​‌‌‌‌​‌‌​‌‌​‌​​‌​‌‌‌‌​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​‌‌‌‌​‌‌‌‌​​‌​‌‌‌​‌​‌​‌‌‌​‌‌​​‌‌​​​​‌​​‌​‌‌​‌​‌‌‌​​‌‌​‌‌‌​‌​‌​‌‌​​​‌​​‌‌​‌​​​​‌‌​​​​‌​‌‌‌​​‌​​‌‌​​​​‌​‌‌​‌‌​‌​​‌​‌‌​‌​‌‌‌​‌‌​​‌‌​​​​‌​‌‌‌​​‌‌​‌‌​​​​‌​‌‌​‌‌​‌​‌‌‌​​‌‌​‌‌​​‌​‌​‌‌‌​‌​​​‌‌‌​‌​​​‌‌​‌​​‌​​‌​‌‌​‌​​‌‌​‌‌‌​​‌‌​‌​‌​‌‌​​​​‌​​‌‌​​‌‌​​‌‌‌​​‌​​‌‌​​​‌​​‌‌​​​‌​​‌‌​‌‌‌​‌‌​​​​‌</span>

    <!-- 404 -->
    <section class="page-hero not-found">
      <div class="hero__bg" aria-hidden="true"><div class="hero__grid"></div><div class="hero__glow"></div></div>
      <div class="container page-hero__inner">
        <div class="page-hero__copy">
          <p class="eyebrow" data-hero-fade><span class="eyebrow__line"></span>Fehler 404</p>
          <h1 class="hero__title page-hero__title" data-split>Seite <em>nicht gefunden</em>.</h1>
          <p class="hero__lead" data-hero-fade>
            Die gesuchte Seite existiert nicht oder wurde verschoben. Unsere Leistungen sind nur einen Klick entfernt.
          </p>
          <p class="not-found__de" lang="en-GB" data-hero-fade>
            <strong>Page not found.</strong> The page you were looking for does not exist or has moved.
          </p>
          <div class="hero__ctas" data-hero-fade>
            <a href="/" class="btn btn--primary">Zur Startseite <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>
            <a href="/en/" class="btn btn--ghost" lang="en-GB" hreflang="en">Go to the homepage</a>
          </div>
          <ul class="not-found__links" data-hero-fade>
            <li><a href="/2d-cad-digitalisierung">2D-CAD-Digitalisierung</a></li>
            <li><a href="/3d-bim-modellierung">3D- &amp; BIM-Modellierung</a></li>
            <li><a href="/#contact">Kontakt</a></li>
            <li lang="en-GB"><a href="/en/2d-cad-digitizing" hreflang="en">2D CAD Digitalisation</a></li>
            <li lang="en-GB"><a href="/en/3d-bim-modeling" hreflang="en">3D &amp; BIM Modelling</a></li>
            <li lang="en-GB"><a href="/en/#contact" hreflang="en">Contact us</a></li>
          </ul>
        </div>
      </div>
    </section>

  </main>'''

doc = head + '\n' + pre + MAIN + post
ids = set(re.findall(r'\bid="([^"]+)"', doc))

def absolute(m):
    attr, url = m.group(1), m.group(2)
    if re.match(r'^([a-z][a-z0-9+.-]*:|/|\{)', url, re.I):
        return m.group(0)
    if url.startswith('#'):
        return m.group(0) if url[1:] in ids or url == '#' else f'{attr}="/{url}"'
    path, rest = re.match(r'^([^#?]*)(.*)$', url).groups()
    if path.endswith('index.html'):
        path = path[:-len('index.html')]
    elif path.endswith('.html'):
        path = path[:-len('.html')]
    return f'{attr}="/{path}{rest}"'

body = re.sub(r'\b(href|src|data-src|poster|data-href)="([^"]*)"', absolute, pre + MAIN + post)
# the language switcher marks the current page: on the 404 neither entry is "current"
body = body.replace(' aria-current="true"', '')
out = head + '\n' + body
(SITE / '404.html').write_text(out, encoding='utf-8', newline='')
left = sorted(set(re.findall(r'\b(?:href|src|data-src)="(?![a-z]+:|/|#)([^"]+)"', body)))
print('wrote 404.html:', len(out), 'bytes; relative links left:', left[:10])
