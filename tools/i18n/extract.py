import re, json, sys, html as H
INLINE = {'em','i','b','strong','br','sup','sub','abbr','mark','u','s','a','span'}
ATTRS = {'alt','aria-label','title','placeholder','data-prefill','aria-roledescription'}
META_CONTENT = re.compile(r'<meta\s+(?:name|property)="(description|og:title|og:description|twitter:title|twitter:description|og:image:alt|keywords)"', re.I)
TOK = re.compile(r'<!--.*?-->|<[^>]+>', re.S)

def units(s):
    """Yield (start, end, text) spans of translatable content in an HTML string."""
    out = []
    pos, raw = 0, None
    run_start = None; run_parts = []
    def flush(end):
        nonlocal run_start
        if run_start is None: return
        seg = s[run_start:end]
        # trim leading/trailing tags & whitespace
        m = re.match(r'^((?:\s|<[^>]+>)*)(.*?)((?:\s|<[^>]+>)*)$', seg, re.S)
        core = m.group(2)
        if re.search(r'[A-Za-zÄÖÜäöü]', TOK.sub('', core)):
            a = run_start + len(m.group(1)); out.append((a, a + len(core), core))
        run_start = None
    for m in TOK.finditer(s):
        tag = m.group(0); low = tag.lower()
        if raw:  # inside script/style
            if low.startswith('</script' if raw in ('json','script') else '</style'):
                if raw == 'json': out.extend(json_units(s, pos, m.start()))
                raw = None; pos = m.end()
            continue
        gap = s[pos:m.start()]
        if m.start() > pos and run_start is None and gap.strip():
            run_start = pos
        elif run_start is not None and not gap.strip() and chr(10) in gap:
            flush(pos)  # tags on separate lines are separate units
        name = re.match(r'</?([a-zA-Z0-9-]+)', tag)
        name = name.group(1).lower() if name else '!'
        if name in INLINE and not tag.startswith('<!--'):
            if run_start is None: run_start = m.start()
        else:
            flush(m.start())
        # attributes
        if not tag.startswith('</') and not tag.startswith('<!'):
            for am in re.finditer(r'\s([\w:-]+)="([^"]*)"', tag):
                k, v = am.group(1).lower(), am.group(2)
                ok = k in ATTRS or (k == 'content' and META_CONTENT.match(tag))
                if ok and re.search(r'[A-Za-z]', v) and not re.match(r'^(https?:|#|/)', v):
                    a = m.start() + am.start(2); out.append((a, a + len(v), v))
        if low.startswith('<script'): raw = 'json' if 'ld+json' in low else 'script'
        elif low.startswith('<style'): raw = 'style'
        pos = m.end()
    flush(len(s))
    return out

def json_units(s, a, b):
    out = []
    for m in re.finditer(r'"(name|text|description|headline|serviceType|alternateName|jobTitle|areaServed)"\s*:\s*"([^"]*)"', s[a:b]):
        v = m.group(2)
        if re.search(r'[A-Za-z]{3}', v) and not v.startswith('http'):
            st = a + m.start(2); out.append((st, st + len(v), v))
    return out

if __name__ == '__main__':
    seen = {}
    for f in sys.argv[1:]:
        s = open(f, encoding='utf-8').read()
        for a, b, t in units(s):
            seen.setdefault(t, f)
    print(len(seen), sum(len(k) for k in seen))
    json.dump(list(seen.keys()), open(sys.argv[0].replace('extract.py', 'strings.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
