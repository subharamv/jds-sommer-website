"""Deploy the site to www.jds-sommer.de over SFTP, uploading only files whose content changed.

  python tools/deploy/deploy_main.py            # upload changed files
  python tools/deploy/deploy_main.py --dry-run  # only list what would be uploaded
  python tools/deploy/deploy_main.py --all      # upload everything (e.g. after a server restore)
  python tools/deploy/deploy_main.py --mark-uploaded  # record the current files as on the server, no upload

Steps: stage the site (stage_site.py: clean links, no review pages), add the Apache .htaccess,
compare every file's SHA-1 with main-manifest.json (what the server got last time), upload the new
and changed files with WinSCP (saved site "JDS Sommer/p715745f1@www.jds-sommer.de"), then save the
manifest. Files are never deleted on the server; removed files are listed so they can be cleaned up by hand."""
import hashlib, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
MANIFEST = os.path.join(HERE, 'main-manifest.json')
WINSCP = os.path.expandvars(r'%LOCALAPPDATA%\Programs\WinSCP\WinSCP.com')
SESSION = 'JDS Sommer/p715745f1@www.jds-sommer.de'
DRY, ALL = '--dry-run' in sys.argv, '--all' in sys.argv


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


stage = os.path.join(tempfile.gettempdir(), 'jds-main-site')
subprocess.run([sys.executable, '-I', os.path.join(HERE, 'stage_site.py'), SITE, stage], check=True)
for extra in ('_redirects', '_headers', 'prototype.html'):          # Cloudflare files / review page
    p = os.path.join(stage, extra)
    if os.path.exists(p):
        os.remove(p)
shutil.copy(os.path.join(HERE, 'htaccess-main.txt'), os.path.join(stage, '.htaccess'))

files = {}
for root, _, names in os.walk(stage):
    for n in names:
        p = os.path.join(root, n)
        files[os.path.relpath(p, stage).replace(os.sep, '/')] = sha1(p)
if '--mark-uploaded' in sys.argv:
    json.dump(files, open(MANIFEST, 'w', encoding='utf-8'), indent=1, sort_keys=True)
    sys.exit(f'manifest written for {len(files)} files (nothing uploaded)')
try:
    old = json.load(open(MANIFEST, encoding='utf-8'))
except FileNotFoundError:
    old = {}
changed = sorted(f for f, h in files.items() if ALL or old.get(f) != h)
gone = sorted(set(old) - set(files))
print(f'{len(files)} files staged, {len(changed)} new or changed' + (f', {len(gone)} no longer in the site' if gone else ''))
for f in changed:
    print('  ' + ('new  ' if f not in old else 'upd  ') + f)
for f in gone:
    print('  (only on server) ' + f)
if DRY or not changed:
    sys.exit(0)

# Folders first (mkdir fails harmlessly if a folder exists), then each file to its path
dirs = sorted({os.path.dirname(f) for f in changed if os.path.dirname(f)}, key=lambda d: d.count('/'))
lines = ['option batch continue', 'option confirm off', f'open "{SESSION}" -timeout=30']
lines += [f'mkdir "/{d}"' for d in dirs if not any(k.startswith(d + '/') for k in old)]
lines += ['option batch abort']
lines += [f'put -transfer=binary "{os.path.join(stage, f.replace("/", os.sep))}" "/{f}"' for f in changed]
lines += ['exit']
script = os.path.join(tempfile.gettempdir(), 'jds-main-deploy.txt')
open(script, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
r = subprocess.run([WINSCP, f'/script={script}'], capture_output=True, text=True, encoding='utf-8', errors='replace')
uploaded = r.stdout.count('| 100%')
print(f'WinSCP exit {r.returncode}, {uploaded} of {len(changed)} files uploaded')
if r.returncode != 0:
    print(r.stdout[-2000:])
    sys.exit('Upload failed: the manifest was not updated, so the next run tries these files again.')
for f in changed:
    old[f] = files[f]
json.dump(old, open(MANIFEST, 'w', encoding='utf-8'), indent=1, sort_keys=True)
print('manifest updated')
