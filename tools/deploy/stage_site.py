"""Stage the site for deployment: copy it with the same exclusions as .vercelignore, then give every
page clean links (no .html: 'impressum.html' -> 'impressum', 'index.html' -> './', 'en/index.html' -> 'en/').
The source keeps its .html links so local previews (python -m http.server) still work.

The source already has the public layout: German (the default language) in the site root, English in en/.

Usage: python stage_site.py <site folder> <output folder> [--noindex]
  --noindex  adds an X-Robots-Tag header (test domains)"""
import fnmatch, hashlib, os, re, shutil, sys

src, dst = sys.argv[1], sys.argv[2]
NOINDEX = '--noindex' in sys.argv
SKIP_DIRS = {'.git', '.vercel', 'tools'}
SKIP_FILES = {'en/about-us.html', 'ueber-uns.html', '.gitignore', '.vercelignore', 'vercel.json'}
# Old addresses that moved (Cloudflare _redirects; the live server has its own list in htaccess-main.txt)
MOVED = {'/de': '/', '/3d-cad-digitizing': '/en/3d-bim-modeling', '/de/3d-cad-digitalisierung': '/3d-bim-modellierung'}


if os.path.exists(dst):
    shutil.rmtree(dst)
pages = []
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
        if p.endswith('.html') and f != 'prototype.html':
            pages.append(p)
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


_ver = {}


def version(path):
    """Short content fingerprint of a staged file (None if it does not exist)."""
    if path not in _ver:
        try:
            _ver[path] = hashlib.sha1(open(path, 'rb').read()).hexdigest()[:8]
        except OSError:
            _ver[path] = None
    return _ver[path]


def versioned(page_dir):
    """Cache busting: local CSS/JS/images get ?v=<fingerprint>, so browsers fetch a file again only when it changed."""
    def fix(m):
        attr, url = m.group(1), m.group(2)
        if '?' in url or '#' in url or re.match(r'^[a-z][a-z0-9+.-]*:', url, re.I):
            return m.group(0)
        if not re.search(r'\.(css|js|webp|png|jpg|jpeg|gif|svg|mp4|ico)$', url, re.I):
            return m.group(0)
        target = os.path.join(dst, url.lstrip('/')) if url.startswith('/') else os.path.join(page_dir, url)
        v = version(os.path.normpath(target))
        return f'{attr}{url}?v={v}"' if v else m.group(0)
    return fix


links = 0
for p in pages:
    path = os.path.join(dst, p)
    s = open(path, encoding='utf-8').read()
    s, k = re.subn(r'(\shref=")([^"]*)"', clean, s)
    links += k
    s = re.sub(r'(\s(?:href|src|poster|data-src|srcset)=")([^"\s,]+)"', versioned(os.path.dirname(path)), s)
    open(path, 'w', encoding='utf-8', newline='').write(s)

# Cloudflare Workers assets: redirects + headers
with open(os.path.join(dst, '_redirects'), 'w', encoding='utf-8', newline='\n') as r:
    for old, new in MOVED.items():
        r.write(f'{old}.html {new} 301\n{old} {new} 301\n' if old != '/de' else f'/de/ / 301\n/de/* /:splat 301\n')
if NOINDEX:
    open(os.path.join(dst, '_headers'), 'w', encoding='utf-8', newline='\n').write(
        '# Test domain: keep it out of search engines (the canonical site is www.jds-sommer.de)\n/*\n  X-Robots-Tag: noindex\n')
print(f'copied {n} files, cleaned {links} links')
