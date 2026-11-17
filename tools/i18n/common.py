# Page pairs: English source (site/en/) -> German output (site root)
PAGES = {
    'index.html': 'index.html',
    '2d-cad-digitizing.html': '2d-cad-digitalisierung.html',
    '3d-bim-modeling.html': '3d-bim-modellierung.html',
    '3d-cad-reverse-engineering.html': '3d-cad-reverse-engineering.html',
    'as-built-facility-documentation.html': 'bestandsdokumentation.html',
    'gis-infrastructure-data.html': 'gis-infrastrukturdaten.html',
    'drawing-document-digitisation.html': 'zeichnungs-dokumentendigitalisierung.html',
    'about-us.html': 'ueber-uns.html',
    'contact.html': 'kontakt.html',
    'insights.html': 'wissen.html',
    'insights/preparing-drawings-for-digitalisation.html': 'wissen/zeichnungen-fuer-die-digitalisierung-vorbereiten.html',
    'faq.html': 'faq.html',
    'glossary.html': 'glossar.html',
    'industries/index.html': 'branchen/index.html',
    'industries/manufacturing.html': 'branchen/industrie-fertigung.html',
    'industries/energy-utilities.html': 'branchen/energie-versorgung.html',
    'industries/public-sector.html': 'branchen/oeffentliche-hand.html',
    'industries/construction-architecture.html': 'branchen/bauwesen-architektur.html',
    'industries/real-estate-facility-management.html': 'branchen/immobilien-facility-management.html',
    'industries/healthcare.html': 'branchen/gesundheitswesen.html',
    'industries/education-research.html': 'branchen/bildung-forschung.html',
    'industries/transport-infrastructure.html': 'branchen/verkehr-infrastruktur.html',
    'industries/heritage.html': 'branchen/denkmalschutz.html',
    'imprint.html': 'impressum.html',
    'privacy-policy.html': 'datenschutz.html',
    'terms-and-conditions.html': 'agb.html',
}
GLOBE = '<svg class="lang__globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9"/></svg>'
CHECK = '<svg class="lang__check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'

def switcher(cur, en_href, de_href, indent='        '):
    de = cur == 'de'
    label = 'Sprache wählen' if de else 'Select language'
    def item(code, hreflang, name, href):
        on = code == cur
        return (f'{indent}    <li><a href="{href}" hreflang="{hreflang}" lang="{hreflang}" data-no-barba'
                + (' aria-current="true"' if on else '') + f'><span>{name}</span>{CHECK if on else ""}</a></li>\n')
    return (f'{indent}<!-- lang -->\n'
            f'{indent}<div class="lang" data-lang>\n'
            f'{indent}  <button class="lang__btn" type="button" aria-expanded="false" aria-controls="lang-menu" aria-label="{label}" title="{label}" data-lang-btn>\n'
            f'{indent}    {GLOBE}<span class="lang__code">{"DE" if de else "EN"}</span>\n'
            f'{indent}  </button>\n'
            f'{indent}  <ul class="lang__menu" id="lang-menu" data-lang-menu>\n'
            + item('en', 'en-GB', 'English (UK)', en_href) + item('de', 'de', 'Deutsch', de_href) +
            f'{indent}  </ul>\n'
            f'{indent}</div>\n'
            f'{indent}<!-- /lang -->\n')

def mobile_switcher(cur, en_href, de_href, indent='      '):
    de = cur == 'de'
    a = lambda code, hl, name, href: (f'<a href="{href}" hreflang="{hl}" lang="{hl}" data-no-barba' + (' aria-current="true"' if code == cur else '') + f'>{name}</a>')
    return (f'{indent}<!-- m-lang -->\n'
            f'{indent}<p class="m-lang" aria-label="{"Sprache" if de else "Language"}">{GLOBE}'
            + a('en', 'en-GB', 'English (UK)', en_href) + a('de', 'de', 'Deutsch', de_href) + '</p>\n'
            f'{indent}<!-- /m-lang -->\n')
