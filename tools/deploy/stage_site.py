"""Stage the site for deployment: copy it with the same exclusions as .vercelignore, then give every
page clean links (no .html: 'imprint.html' -> 'imprint', 'index.html' -> './', 'de/index.html' -> 'de/').
The source keeps its .html links so local previews (python -m http.server) still work.

Usage: python stage_site.py <site folder> <output folder> [--noindex]
  --noindex  adds an X-Robots-Tag header (test domains)"""
import fnmatch, os, re, shutil, sys

src, dst = sys.argv[1], sys.argv[2]
NOINDEX = '--noindex' in sys.argv
SKIP_DIRS = {'.git', '.vercel', 'tools'}
SKIP_FILES = {'about-us.html', 'de/ueber-uns.html', '.gitignore', '.vercelignore', 'vercel.json'}
# Old addresses that moved: permanent redirects to the clean new ones
MOVED = {'/3d-cad-digitizing': '/3d-bim-modeling', '/de/3d-cad-digitalisierung': '/de/3d-bim-modellierung'}

if os.path.exists(dst):
    shutil.rmtree(dst)
n = 0
for root, dirs, files in os.walk(src):
    rel = os.path.relpath(root, src).replace(os.sep, '/')
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        p = f if rel == '.' else rel + '/' + f
        if p in SKIP_FILES or fnmatch.fnmatch(f, '.env*'):
            continue
        os.makedirs(os.path.join(dst, os.path.dirname(p)), exist_ok=True)
        shutil.copy2(os.path.join(src, p), os.path.join(dst, p))
        n += 1


def clean(m):
    url = m.group(2)
    if re.match(r'^([a-z][a-z0-9+.-]*:|#|/|\?)', url, re.I):
        return m.group(0)
    path, rest = re.match(r'^([^#?]*)(.*)$', url).groups()
    if path.endswith('index.html'):
        path = path[:-len('index.html')] or './'
    elif path.endswith('.html'):
        path = path[:-len('.html')]
    else:
        return m.group(0)
    return m.group(1) + path + rest + '"'


links = 0
for root, _, files in os.walk(dst):
    for f in files:
        if f.endswith('.html') and f != 'prototype.html':
            p = os.path.join(root, f)
            s = open(p, encoding='utf-8').read()
            s, k = re.subn(r'(\shref=")([^"]*)"', clean, s)
            links += k
            open(p, 'w', encoding='utf-8', newline='').write(s)

# Cloudflare Workers assets: redirects + headers
with open(os.path.join(dst, '_redirects'), 'w', encoding='utf-8', newline='\n') as r:
    for old, new in MOVED.items():
        r.write(f'{old}.html {new} 301\n{old} {new} 301\n')
if NOINDEX:
    open(os.path.join(dst, '_headers'), 'w', encoding='utf-8', newline='\n').write(
        '# Test domain: keep it out of search engines (the canonical site is www.jds-sommer.de)\n/*\n  X-Robots-Tag: noindex\n')
print(f'copied {n} files, cleaned {links} links')
