#!/usr/bin/env python3
"""Decode the hidden authorship watermark from a JDS Sommer page, llms.txt or URL.

The watermark is a short text encoded as invisible zero-width characters:
    U+200B  zero-width space        -> bit 0
    U+200C  zero-width non-joiner   -> bit 1
The bits are grouped into bytes (8 bits, most-significant first) and read as
UTF-8. A genuine watermark always starts with the marker "WM|".

This file lives in tools/ and is NOT deployed to the live site.

Usage:
    python tools/dev/decode_watermark.py <file-or-url>

Examples:
    python tools/dev/decode_watermark.py ../../glossar.html
    python tools/dev/decode_watermark.py ../../404.html
    python tools/dev/decode_watermark.py ../../llms.txt
    python tools/dev/decode_watermark.py https://www.jds-sommer.de/glossar.html
"""
import sys, urllib.request

ZERO, ONE = '​', '‌'          # bit 0, bit 1


def encode(payload: str) -> str:
    """Turn text into a run of invisible zero-width characters."""
    bits = ''.join(f'{b:08b}' for b in payload.encode('utf-8'))
    return ''.join(ZERO if bit == '0' else ONE for bit in bits)


def decode(text: str) -> str:
    """Pull the zero-width characters out of any text and read them back."""
    bits = ''.join('0' if c == ZERO else '1' for c in text if c in (ZERO, ONE))
    out = bytearray(int(bits[i:i + 8], 2) for i in range(0, len(bits) - 7, 8))
    return out.decode('utf-8', errors='replace')


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    if src.startswith(('http://', 'https://')):
        req = urllib.request.Request(src, headers={'User-Agent': 'watermark-check'})
        text = urllib.request.urlopen(req).read().decode('utf-8', 'replace')
    else:
        text = open(src, encoding='utf-8').read()

    s = decode(text)
    if 'WM|' in s:
        s = s[s.index('WM|'):]
        # stop at the first non-printable run so trailing noise is dropped
        marker, name, *rest = s.split('|')
        print('Watermark found:')
        print('  Developer :', name)
        if rest:
            print('  LinkedIn  :', rest[0].split('\x00')[0])
    elif s.strip():
        print('(decoded, but no "WM|" marker — may be partial):')
        print(' ', repr(s[:200]))
    else:
        print('No watermark found in', src)


if __name__ == '__main__':
    main()
