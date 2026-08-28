#!/usr/bin/env python3
"""
SMOKE TEST — every cabinet boots, or the build does not ship.

The drive test proves the two driving games PLAY. This proves the other
sixteen at least WAKE UP: page loads, no errors thrown, a canvas is present
and actually painting, the arcade shell attached, and the machine still
renders something ten seconds in. It will not catch a game with broken rules;
it will catch the black screen, which is the failure that has actually
shipped twice.

    python3 tools/smoke-test.py            all 18
    python3 tools/smoke-test.py coil deep  by id

Exit 0 when every cabinet passes.
"""

import argparse
import functools
import http.server
import json
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from harness import console_utf8, launch_chromium, node_exe

ROOT = Path(__file__).resolve().parent.parent


def catalogue():
    """games.js is the single source of truth; read it, do not restate it."""
    out = subprocess.run(
        [node_exe(), '-e',
         "global.window={};eval(require('fs').readFileSync('games.js','utf8'));"
         "console.log(JSON.stringify(window.EFFIGY_ARCADE))"],
        cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    httpd = socketserver.TCPServer(
        ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.socket.getsockname()[1]


CANVAS_SIG = """() => {
  /* a black screen and a painted screen both have a canvas; tell them apart
     by reading pixels. Sample the largest canvas; sum a sparse grid. */
  const cvs = [...document.querySelectorAll('canvas')];
  if (!cvs.length) return null;
  const cv = cvs.reduce((a, b) => a.width * a.height >= b.width * b.height ? a : b);
  try {
    const g = cv.getContext('2d');
    if (!g) return 'webgl';                    /* not readable this way */
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4013) sum += d[i];
    return sum;
  } catch (e) { return 'unreadable'; }
}"""


def smoke(page, base, game, seconds):
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'{base}/{game["file"]}', wait_until='load')
    try:
        page.wait_for_function(
            '() => navigator.serviceWorker && navigator.serviceWorker.controller',
            timeout=5_000)
    except Exception:
        pass

    checks = []
    ok = lambda c, l, d='': checks.append((bool(c), l, d))

    ok(page.title().strip() != '', 'has a title', page.title())
    ok(page.query_selector('canvas'), 'has a canvas')
    ok(page.evaluate('() => !!(window.Arcade && Arcade.save && Arcade.pad)'),
       'arcade shell attached')
    meta = page.evaluate(
        '() => (document.querySelector(\'meta[name="arcade-title"]\')||{}).content')
    ok(meta, 'arcade-title meta present', meta or 'missing')

    first = page.evaluate(CANVAS_SIG)
    page.wait_for_timeout(int(seconds * 1000))
    later = page.evaluate(CANVAS_SIG)
    ok(later not in (None, 0), 'the canvas has paint on it', f'signal {later}')
    ok(errors == [], 'no page errors', errors[0][:110] if errors else '')
    return checks, first, later


def launcher(page, base, games):
    """THE LAUNCHER IS A MUST-FLOW AND NOTHING TESTED IT.

    Every check in this file used to `goto` a cabinet URL directly, so the one
    thing every player does first - open the arcade and tap a game - was the
    one path with no coverage. A dead click handler on the rack sent first-time
    visitors to `/null` for weeks behind an 18/18 green run.

    So: open the launcher, open a shelf, click a real cabinet, and assert where
    the browser actually ENDED UP. Not that a handler ran; where it landed.
    """
    checks = []

    def ok(cond, label, detail=''):
        checks.append((bool(cond), label, detail))

    page.goto(f'{base}/index.html', wait_until='load')
    page.wait_for_timeout(900)                      # the loading panel has a floor

    # ---- HOLD THE CABINET'S FETCH, AND THIS IS THE WHOLE POINT ------------
    # The failure this guards against is a RACE: a stray timer overwrites the
    # real navigation a few tens of milliseconds after it starts. Served from
    # localhost the cabinet arrives instantly, the old page is torn down before
    # the stray timer can run, and the bug CANNOT reproduce - which is exactly
    # why it shipped. The developer's machine always wins the race; a new
    # player's network does not.
    #
    # CDP throttling does not slow a main-frame navigation, so it does not
    # help here (tried, 2026-08-24). Delaying the cabinet's own response does:
    # the launcher stays alive past the moment any late timer would fire, and
    # whatever the page decides to do LAST is what we measure.
    def slow_cabinet(route):
        time.sleep(0.6)
        route.continue_()
    page.route('**/games/**/*.html', slow_cabinet)

    shelves = page.locator('.shelf')
    ok(shelves.count() >= 3, 'the floor shows its shelves', f'{shelves.count()} found')

    # the first shelf that actually holds machines
    opened = False
    for i in range(shelves.count()):
        shelves.nth(i).click()
        page.wait_for_timeout(250)
        if page.locator('.cab:visible').count():
            opened = True
            break
    ok(opened, 'a shelf opens onto its rack')
    if not opened:
        return checks

    cab = page.locator('.cab:visible').first
    want = cab.get_attribute('data-href')

    # ---- ONE CABINET, ONE LAUNCH PATH -------------------------------------
    # The invariant that broke was not "the link is right" - it was that TWO
    # click handlers answered one tap, a live one and a dead one left over from
    # when a cabinet was an <a href>. The dead one read an attribute a <div>
    # does not have and scheduled a navigation to `null`. Whether that stray
    # navigation WINS depends on whether a service worker is mediating it, so a
    # landing-place check cannot see it reliably. The COUNT can: neuter the
    # timers so the tap goes nowhere, count what one tap schedules, and require
    # exactly one. Then put the clock back and do the tap for real.
    page.evaluate('''() => {
      window.__t = [];
      window.__st = window.setTimeout.bind(window);
      window.setTimeout = function(fn, ms){ window.__t.push(ms); return window.__st(function(){}, 999999); };
    }''')
    cab.click()
    page.wait_for_timeout(200)
    scheduled = page.evaluate('window.__t') or []
    ok(len(scheduled) == 1, 'one tap schedules one launch',
       f'{len(scheduled)} timers: {scheduled}')
    page.evaluate('() => { window.setTimeout = window.__st; }')

    cab = page.locator('.cab:visible').first
    cab.click()
    # the launcher waits ~130ms on purpose, to let the coin land
    try:
        page.wait_for_url(lambda u: 'index.html' not in u and not u.endswith('/'),
                          timeout=9000)
        page.wait_for_load_state('load')
    except Exception:
        pass
    page.wait_for_timeout(700)      # let any late timer have its say
    landed = page.url
    ok(want and want.split('/')[-1] in landed,
       'tapping a cabinet opens that cabinet', landed.replace(base, ''))
    ok('null' not in landed.rsplit('/', 1)[-1],
       'and not a dead address', landed.replace(base, ''))
    return checks


def main():
    console_utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='*')
    ap.add_argument('--seconds', type=float, default=8.0)
    args = ap.parse_args()

    games = catalogue()
    if args.ids:
        games = [g for g in games if g['id'] in args.ids]

    httpd, port = serve()
    base = f'http://127.0.0.1:{port}'
    failed = 0
    total = len(games)
    print(f'smoke-test  ·  {len(games)} cabinets  ·  {args.seconds:g}s each')
    with sync_playwright() as p:
        browser = launch_chromium(
            p,
            args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': 480, 'height': 900})

        if not args.ids:
            page = ctx.new_page()
            try:
                lchecks = launcher(page, base, games)
            except Exception as e:
                lchecks = [(False, 'the launcher loads', f'{type(e).__name__}: {e}')]
            lbad = [c for c in lchecks if not c[0]]
            failed += bool(lbad)
            total += 1
            mark = 'ok  ' if not lbad else 'FAIL'
            line = f'  {mark}  {"launcher":<10}'
            if lbad:
                line += '  ·  ' + '; '.join(f'{l} ({d})' if d else l for _, l, d in lbad)
            print(line)
            page.close()

        for g in games:
            page = ctx.new_page()
            try:
                checks, _, _ = smoke(page, base, g, args.seconds)
            except Exception as e:
                checks = [(False, 'loads at all', f'{type(e).__name__}: {e}')]
            bad = [c for c in checks if not c[0]]
            failed += bool(bad)
            mark = 'ok  ' if not bad else 'FAIL'
            line = f'  {mark}  {g["id"]:<10}'
            if bad:
                line += '  ·  ' + '; '.join(f'{l} ({d})' if d else l for _, l, d in bad)
            print(line)
            page.close()
        browser.close()
    httpd.shutdown()
    print(f'\n  {total - failed}/{total} checks pass')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
