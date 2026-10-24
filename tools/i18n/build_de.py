"""Generate the German pages in site/de/ from the English pages.

The English pages in the site root are the source. Every text fragment found
by extract.units() is looked up in de.json (English -> German) and replaced;
asset paths get a "../" prefix, page links are mapped to their German slugs,
and the language switcher is pointed at the matching page pair. Afterwards
tools/seo/build_seo.py refreshes the SEO head tags and sitemap.xml.

Usage (from the site folder):
    python tools/i18n/build_de.py            # rebuild de/*.html
    python tools/i18n/build_de.py --check    # only list untranslated text

After editing English copy, add the new sentences to de.json and rebuild.
Untranslated text stays English on the German page and is listed on stdout.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(SITE, 'tools', 'seo'))
from extract import units
from common import PAGES, switcher, mobile_switcher
import build_seo

sys.stdout.reconfigure(encoding='utf-8')
DE = json.load(open(os.path.join(HERE, 'de.json'), encoding='utf-8'))
norm = lambda t: re.sub(r'\s+', ' ', t).strip()
DE_N = {norm(k): v for k, v in DE.items()}

# Links to the current jds-sommer.de site: English path -> German path
EXT = [# Business markup: the German homepage
       ('"url": "https://www.jds-sommer.de/"', '"url": "https://www.jds-sommer.de/de/"'),
       ('assets/img/og/jds-sommer-en.png', 'assets/img/og/jds-sommer-de.png')]
# The privacy policy and terms are English only for now: German pages link to them in the site root
# Form radio values end up in the enquiry email, so they are translated too
RADIO = {'A reply via email': 'Eine Antwort per E-Mail', 'A callback': 'Einen Rückruf'}
# Product names, formats, numbers and the like that stay as they are
KEEP = re.compile(r'^(?:[\w ,·/+→–-]*\b(?:DWG|DXF|DGN|RVT|IFC|PLN|STEP|IGES|Revit|Allplan|Archicad|Inventor|SolidEdge|MicroStation|TIFF)\b[\w ,·/+→–-]*'
                  r'|DWG-[\w ]+|Hero|Header|Video|Archiv|Lager|Besprechung|info@jds-sommer\.de|.*JDS Sommer GmbH|August-Schanz-Straße.*)$', re.S)


def rewrite_url(v):
    if not v or re.match(r'^(https?:|mailto:|tel:|data:|#|\?|/)', v):
        return v
    path, sep, rest = re.match(r'^([^#?]*)([#?]?)(.*)$', v).groups()
    return PAGES[path] + sep + rest if path in PAGES else '../' + v


def set_switchers(s, en, de):
    s, n1 = re.subn(r'[ ]*<!-- lang -->.*?<!-- /lang -->\n', lambda m: switcher('de', '../' + en, de), s, count=1, flags=re.S)
    s, n2 = re.subn(r'[ ]*<!-- m-lang -->.*?<!-- /m-lang -->\n', lambda m: mobile_switcher('de', '../' + en, de), s, count=1, flags=re.S)
    assert n1 == n2 == 1, f'{en}: language switcher markers missing'
    return s


def build(en, de, write=True):
    s = open(os.path.join(SITE, en), encoding='utf-8').read()
    # The SEO block is per page and language: build_seo.py writes it, so it is not translated here
    s = build_seo.strip_block(s)
    # Legal pages: the article text is the official German version (tools/i18n/bodies/), not a translation
    body_file = os.path.join(HERE, 'bodies', de)
    if os.path.exists(body_file):
        s, n = re.subn(r'(<article class="policy__body" data-reveal>).*?(\s*</article>)', r'\1<!-- de-body -->\2', s, count=1, flags=re.S)
        assert n == 1, f'{en}: no policy__body article'
    # Switchers first, so their labels are not treated as page copy
    s = set_switchers(s, en, de)
    missing = []
    for a, b, t in sorted(units(s), reverse=True):  # back to front keeps offsets valid
        tr = DE.get(t) or DE_N.get(norm(t))
        if tr is not None:
            s = s[:a] + tr + s[b:]
        elif re.search(r'[a-z]{3}', re.sub(r'<[^>]+>', '', t)) and not KEEP.match(norm(t)) \
                and 'lang__' not in t and 'hreflang' not in t and t not in ('Deutsch', 'English (UK)', 'Sprache wählen', 'Sprache'):
            missing.append(t)
    for k, v in RADIO.items():
        s = s.replace(f'value="{k}"', f'value="{v}"')
    # Only the lang attribute: the <html> tag may carry other attributes (e.g. a class)
    s, n = re.subn(r'(<html\b[^>]*?\slang=")en-GB"', r'\1de"', s, count=1)
    assert n == 1, f'{en}: no <html lang="en-GB"> tag'
    for k, v in EXT:
        s = s.replace(k, v)
    s = re.sub(r'(\s(?:href|src|poster|data-src|srcset)=")([^"]*)"', lambda m: m.group(1) + rewrite_url(m.group(2)) + '"', s)
    s = re.sub(r'(<meta[^>]+content=")(assets/[^"]*)"', lambda m: m.group(1) + '../' + m.group(2) + '"', s)
    # Again after the URL rewrite, which would otherwise shift the switcher links
    s = set_switchers(s, en, de)
    if os.path.exists(body_file):
        s = s.replace('<!-- de-body -->', '\n' + open(body_file, encoding='utf-8').read().rstrip('\n'), 1)
    if write:
        os.makedirs(os.path.join(SITE, 'de'), exist_ok=True)
        open(os.path.join(SITE, 'de', de), 'w', encoding='utf-8', newline='').write(s)
    return missing


if __name__ == '__main__':
    check = '--check' in sys.argv
    total = 0
    for en, de in PAGES.items():
        missing = build(en, de, write=not check)
        total += len(missing)
        print(('checked ' if check else 'wrote de/') + (en if check else de), f'({len(missing)} untranslated)')
        for t in missing:
            print('   ', repr(norm(t)[:110]))
    if not check:
        build_seo.main()
    sys.exit(1 if check and total else 0)
