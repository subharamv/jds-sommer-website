"""Write the SEO head tags of every page and the sitemap.

Each page gets a block between <!-- seo --> and <!-- /seo --> right after its
og:type tag: canonical URL, hreflang pairs, Open Graph / X card tags, PNG
icons, site verification tags, the analytics scripts and schema.org JSON-LD
(WebSite, WebPage, BreadcrumbList from the visible breadcrumb, Service with
prices on the service pages). The block is
rewritten on every run, so edit this file, not the pages. sitemap.xml lists
every page that is not noindex, with its language alternates.

German pages (the default language) sit in the site root, English pages in en/.

Usage (from the site folder):
    python tools/seo/build_seo.py

tools/i18n/build_de.py runs this automatically after rebuilding the German pages.
"""
import hashlib, html, json, os, posixpath, re, sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))


def page_url(file):
    """Public path of a page, without .html: 'index.html' -> '', 'impressum.html' -> 'impressum',
    'en/index.html' -> 'en/', 'en/imprint.html' -> 'en/imprint'.
    The deployed site uses these clean URLs (the staging step strips .html from the links as well)."""
    if file.endswith('index.html'):
        return file[:-len('index.html')]
    return file[:-len('.html')] if file.endswith('.html') else file


def relative(file, target):
    """Relative href from page `file` to `target` (a path from the site root)."""
    return '../' * file.count('/') + target

# --- Settings: fill these in and rerun -------------------------------------
ORIGIN = 'https://www.jds-sommer.de/'
# Google Analytics 4 measurement ID ("G-..."). Set it and the cookie banner appears;
# GA4 only loads after a visitor accepts (assets/js/consent.js).
GA4_ID = ''
# Ahrefs Web Analytics key (the data-key of its snippet). Cookieless, so it loads without consent.
AHREFS_ANALYTICS_KEY = ''
# Content of the <meta name="ahrefs-site-verification"> tag from Ahrefs Site Audit / Webmaster Tools
AHREFS_VERIFICATION = ''
# Content of <meta name="google-site-verification">; not needed if Search Console is verified by DNS
GOOGLE_VERIFICATION = ''
X_HANDLE = '@JDS_Sommer'
# ---------------------------------------------------------------------------

# Every page: (file, language, key of its translation pair or None)
PAGES = [
    ('en/index.html', 'en', 'home'),
    ('index.html', 'de', 'home'),
    ('en/2d-cad-digitizing.html', 'en', '2d'),
    ('2d-cad-digitalisierung.html', 'de', '2d'),
    ('en/3d-bim-modeling.html', 'en', '3d'),
    ('3d-bim-modellierung.html', 'de', '3d'),
    ('en/about-us.html', 'en', 'about'),
    ('ueber-uns.html', 'de', 'about'),
    ('en/imprint.html', 'en', 'imprint'),
    ('impressum.html', 'de', 'imprint'),
    ('en/privacy-policy.html', 'en', 'privacy'),
    ('datenschutz.html', 'de', 'privacy'),
    ('en/terms-and-conditions.html', 'en', 'terms'),
    ('agb.html', 'de', 'terms'),
]
LOCALE = {'en': 'en_GB', 'de': 'de_DE'}
OG_IMAGE = {'en': 'assets/img/og/jds-sommer-en.png', 'de': 'assets/img/og/jds-sommer-de.png'}
OG_ALT = {'en': 'JDS Sommer: engineering data and BIM conversion from Frankfurt am Main',
          'de': 'JDS Sommer: Engineering-Daten und BIM-Konvertierung aus Frankfurt am Main'}
BLOCK = re.compile(r'[ \t]*<!-- seo\b.*?<!-- /seo -->\n', re.S)
LASTMOD = os.path.join(HERE, 'lastmod.json')

# Schema.org: the company is described in full on the homepage (JSON-LD in index.html,
# translated with the page); every other node refers to it by this @id.
ORG = ORIGIN + '#organization'
SITE_ID = ORIGIN + '#website'
INLANG = {'en': 'en-GB', 'de': 'de'}


def offer(name, unit, price=None, min_price=None):
    spec = {'@type': 'UnitPriceSpecification', 'priceCurrency': 'EUR', 'valueAddedTaxIncluded': False, 'unitText': unit}
    spec.update({'price': price} if price is not None else {'minPrice': min_price})
    return {'@type': 'Offer', 'name': name, 'priceCurrency': 'EUR', 'priceSpecification': spec}


# Service pages: names, descriptions and prices as stated on the pages (net, plus VAT)
SERVICES = {
    '2d': {
        'en': {'name': '2D CAD digitalisation and vectorisation', 'serviceType': 'CAD digitising',
               'description': 'Plans, drawings and scans from A4 to multiples of A0 vectorised into to-scale CAD files with correct dimensions, text, symbols, line types and layers. Output in AutoCAD DWG/DXF, MicroStation DGN or Nemetschek Allplan FT; delivery in 5 days, 3 days or 24 hours.',
               'offers': [offer('DWG-Basic', 'A0 drawing', price=49), offer('DWG-Premium', 'A0 drawing', price=75),
                          offer('DWG-Premium Plus', 'A0 drawing', min_price=99)]},
        'de': {'name': '2D-CAD-Digitalisierung und Vektorisierung', 'serviceType': 'CAD-Digitalisierung',
               'description': 'Pläne, Zeichnungen und Scans von A4 bis zu einem Vielfachen von A0 werden zu maßstabsgetreuen CAD-Dateien mit korrekten Bemaßungen, Texten, Symbolen, Linientypen und Layern vektorisiert. Ausgabe in AutoCAD DWG/DXF, MicroStation DGN oder Nemetschek Allplan FT; Lieferung in 5 Tagen, 3 Tagen oder 24 Stunden.',
               'offers': [offer('DWG-Basic', 'A0-Zeichnung', price=49), offer('DWG-Premium', 'A0-Zeichnung', price=75),
                          offer('DWG-Premium Plus', 'A0-Zeichnung', min_price=99)]},
    },
    '3d': {
        'en': {'name': '3D BIM modelling and Scan-to-BIM', 'serviceType': '3D CAD and BIM modelling',
               'description': 'Point clouds, STL data and 2D plans turned into fully structured 3D CAD and BIM models in Revit (RVT/IFC), Allplan, Archicad, IGES and STEP, at LOD 100 to 500. Objects up to 150 cm are scanned in-house.',
               'offers': [offer('3D scanning', 'point cloud', min_price=65),
                          offer('3D CAD modelling of a machine part', 'machine part up to 40 cm edge length', min_price=250)]},
        'de': {'name': '3D-BIM-Modellierung und Scan-to-BIM', 'serviceType': '3D-CAD- und BIM-Modellierung',
               'description': 'Punktwolken, STL-Daten und 2D-Pläne werden zu vollständig strukturierten 3D-CAD- und BIM-Modellen in Revit (RVT/IFC), Allplan, Archicad, IGES und STEP, in LOD 100 bis 500. Objekte bis 150 cm scannen wir im eigenen Haus.',
               'offers': [offer('3D-Scannen', 'Punktwolke', min_price=65),
                          offer('3D-CAD-Modellierung eines Maschinenteils', 'Maschinenteil bis 40 cm Kantenlänge', min_price=250)]},
    },
}


def text(v):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', v))).strip()


def crumbs(file, s):
    """BreadcrumbList items from the page's visible <nav class="crumbs">."""
    m = re.search(r'<nav class="crumbs"[^>]*>(.*?)</nav>', s, re.S)
    if not m:
        return []
    items = [(text(name), ORIGIN + page_url(posixpath.normpath(posixpath.join(posixpath.dirname(file), href))))
             for href, name in re.findall(r'<a href="([^"#]*)"[^>]*>(.*?)</a>', m.group(1))]
    cur = re.search(r'aria-current="page"[^>]*>(.*?)</span>', m.group(1), re.S)
    if cur:
        items.append((text(cur.group(1)), ORIGIN + page_url(file)))
    return items


def schema(file, lang, pair, s):
    url = ORIGIN + page_url(file)
    title = text(re.search(r'<title>(.*?)</title>', s, re.S).group(1))
    desc = re.search(r'<meta name="description" content="([^"]*)"', s)
    home = page_url(file) in ('', 'en/')
    page = {'@type': 'WebPage', '@id': url + '#webpage', 'url': url, 'name': title, 'inLanguage': INLANG[lang],
            'isPartOf': {'@id': SITE_ID}, 'primaryImageOfPage': ORIGIN + OG_IMAGE[lang]}
    if desc:
        page['description'] = html.unescape(desc.group(1))
    graph = [{'@type': 'WebSite', '@id': SITE_ID, 'url': ORIGIN, 'name': 'JDS Sommer',
              'alternateName': 'JDS SOMMER GmbH', 'inLanguage': ['en-GB', 'de'], 'publisher': {'@id': ORG}}, page]
    if home:
        page['about'] = {'@id': ORG}
    else:
        # The full company node lives on the homepage; this keeps the reference resolvable here
        graph.append({'@type': 'ProfessionalService', '@id': ORG, 'name': 'JDS SOMMER GmbH', 'url': ORIGIN,
                      'logo': ORIGIN + 'assets/img/jds-logo-512.png'})
    trail = crumbs(file, s)
    if len(trail) > 1:
        page['breadcrumb'] = {'@id': url + '#breadcrumb'}
        graph.append({'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', 'itemListElement': [
            {'@type': 'ListItem', 'position': i, 'name': n, 'item': u} for i, (n, u) in enumerate(trail, 1)]})
    if pair in SERVICES:
        sv = SERVICES[pair][lang]
        page['mainEntity'] = {'@id': url + '#service'}
        graph.append({'@type': 'Service', '@id': url + '#service', 'url': url, 'name': sv['name'],
                      'serviceType': sv['serviceType'], 'description': sv['description'], 'inLanguage': INLANG[lang],
                      'provider': {'@id': ORG}, 'image': ORIGIN + OG_IMAGE[lang], 'offers': sv['offers']})
    data = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, indent=1)
    return '<script type="application/ld+json">\n' + data.replace('</', '<\\/') + '\n  </script>'


def strip_block(s):
    return BLOCK.sub('', s)


def block(file, lang, pair, s):
    url = ORIGIN + page_url(file)
    alts = {l: ORIGIN + page_url(f) for f, l, p in PAGES if pair and p == pair}
    rel = lambda p: relative(file, p)
    esc = lambda v: html.escape(v, quote=True)
    t = ['<!-- seo: written by tools/seo/build_seo.py, edit it there -->',
         f'<link rel="canonical" href="{url}">']
    if len(alts) > 1:
        t += [f'<link rel="alternate" hreflang="{l}" href="{u}">' for l, u in alts.items()]
        t.append(f'<link rel="alternate" hreflang="x-default" href="{alts["de"]}">')
    t += [f'<meta property="og:url" content="{url}">',
          '<meta property="og:site_name" content="JDS Sommer">',
          f'<meta property="og:locale" content="{LOCALE[lang]}">']
    t += [f'<meta property="og:locale:alternate" content="{LOCALE[l]}">' for l in alts if l != lang]
    t += [f'<meta property="og:image" content="{ORIGIN + OG_IMAGE[lang]}">',
          '<meta property="og:image:type" content="image/png">',
          '<meta property="og:image:width" content="1200">',
          '<meta property="og:image:height" content="630">',
          f'<meta property="og:image:alt" content="{esc(OG_ALT[lang])}">',
          '<meta name="twitter:card" content="summary_large_image">',
          f'<meta name="twitter:site" content="{X_HANDLE}">',
          f'<link rel="icon" type="image/png" sizes="48x48" href="{rel("assets/img/favicon-48.png")}">',
          f'<link rel="apple-touch-icon" href="{rel("assets/img/apple-touch-icon.png")}">']
    if GOOGLE_VERIFICATION:
        t.append(f'<meta name="google-site-verification" content="{esc(GOOGLE_VERIFICATION)}">')
    if AHREFS_VERIFICATION:
        t.append(f'<meta name="ahrefs-site-verification" content="{esc(AHREFS_VERIFICATION)}">')
    if AHREFS_ANALYTICS_KEY:
        t.append(f'<script src="https://analytics.ahrefs.com/analytics.js" data-key="{esc(AHREFS_ANALYTICS_KEY)}" async></script>')
    if GA4_ID:
        t.append(f'<script defer src="{rel("assets/js/consent.js")}" data-ga4="{esc(GA4_ID)}"></script>')
    t.append(schema(file, lang, pair, s))
    t.append('<!-- /seo -->')
    return ''.join(f'  {x}\n' for x in t)


def sitemap(indexed):
    # lastmod only moves when a page's content changes, so rebuilding alone does not touch it
    try:
        known = json.load(open(LASTMOD, encoding='utf-8'))
    except FileNotFoundError:
        known = {}
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for file, lang, pair, digest in indexed:
        url = ORIGIN + page_url(file)
        if known.get(url, [None])[0] != digest:
            known[url] = [digest, date.today().isoformat()]
        out += ['  <url>', f'    <loc>{url}</loc>', f'    <lastmod>{known[url][1]}</lastmod>']
        alts = [(l, ORIGIN + page_url(f)) for f, l, p, _ in indexed if pair and p == pair]
        if len(alts) > 1:
            out += [f'    <xhtml:link rel="alternate" hreflang="{l}" href="{u}"/>' for l, u in alts]
            out.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{dict(alts)["de"]}"/>')
        out.append('  </url>')
    out.append('</urlset>')
    open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
    json.dump(known, open(LASTMOD, 'w', encoding='utf-8'), indent=1)


def main():
    indexed = []
    for file, lang, pair in PAGES:
        path = os.path.join(SITE, file)
        s = strip_block(open(path, encoding='utf-8').read())
        s, n = re.subn(r'(<meta property="og:type"[^>]*>\n)', lambda m: m.group(1) + block(file, lang, pair, s), s, count=1)
        assert n == 1, f'{file}: no og:type tag to put the SEO block after'
        open(path, 'w', encoding='utf-8', newline='').write(s)
        if not re.search(r'<meta name="robots" content="[^"]*noindex', s):
            indexed.append((file, lang, pair, hashlib.sha1(strip_block(s).encode()).hexdigest()[:12]))
        print('seo block:', file)
    sitemap(indexed)
    print('wrote sitemap.xml:', len(indexed), 'URLs')


if __name__ == '__main__':
    main()
