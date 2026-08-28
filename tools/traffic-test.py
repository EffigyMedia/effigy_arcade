"""INTERSTATE TRAFFIC - is there always a way through?

The rule is that traffic must never pile up into a wall the player cannot pass.
The engine has had a guarantee for that all along and it still let walls form,
because it was asking the wrong question: it counted distinct LANE INDICES
inside fixed buckets, and neither of those is the road.

Cars drift inside a lane and a shunt moves one bodily sideways while its lane
field still says where it was assigned, so four cars can report four different
lanes and leave no opening a car could fit through. And a bucket keyed by
round(z / 1500) splits a wall that straddles its boundary into two halves, each
of which looks passable alone.

`API.blockedAhead()` reports how many sliding windows of road ahead had no
car-width corridor in them on the last pass. Zero is the contract.

This drives at speed for a long stretch - long enough for waves to spawn, for
cars to drift and for the field to bunch - and samples that number continuously.
A single blocked window is a failure, because the guarantee is absolute: the
player must never round a bend into a wall.
"""
import sys, threading, http.server, socketserver, functools

sys.path.insert(0, 'tools')
from harness import launch_chromium, console_utf8
from playwright.sync_api import sync_playwright

console_utf8()

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}'

SECONDS = 45


def main():
    bad = 0

    def ok(cond, label, detail=''):
        nonlocal bad
        if not cond:
            bad += 1
        print(f'  {"ok  " if cond else "FAIL"}  {label}' + (f'   {detail}' if detail else ''))

    with sync_playwright() as p:
        b = launch_chromium(p, headless=True,
                            args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
        page = b.new_context(viewport={'width': 480, 'height': 900}).new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{BASE}/games/sw/interstate.html', wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller',
                timeout=5000)
            page.wait_for_timeout(1200)
        except Exception:
            pass
        try:
            page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
            page.click('[data-act="play"]')
            page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
            page.click('[data-act="drive"]')
            page.wait_for_timeout(1200)
        except Exception as e:
            ok(False, 'could reach the drive', f'{type(e).__name__}: {e}')
            b.close(); srv.shutdown(); return 1

        ok(page.evaluate("() => !!(window.__road && window.__road.blockedAhead)"),
           'the engine reports blocked windows')

        worst, blocked_samples, samples, tight = 0, 0, 0, 9.0
        for _ in range(SECONDS * 4):
            # hold a real pace so waves keep arriving and the field keeps moving
            page.evaluate("() => { window.__road.setSpd && window.__road.setSpd(11000); }")
            page.wait_for_timeout(250)
            st = page.evaluate(
                "() => ({b: window.__road.blockedAhead(), t: window.__road.tightestAhead()})")
            if st is None:
                continue
            samples += 1
            if st['t'] < 9:
                tight = min(tight, st['t'])
            if st['b'] > 0:
                blocked_samples += 1
                worst = max(worst, st['b'])

        ok(samples > 100, 'the run was long enough to matter', f'{samples} samples')
        ok(blocked_samples == 0,
           'no stretch of road ahead was ever fully blocked',
           f'{blocked_samples}/{samples} samples blocked, worst {worst} windows')
        # THE MEASUREMENT THAT DISCRIMINATES. The boolean above passes on a road
        # that never crowds at all, which is how the first version of this test
        # passed with the fixer switched off. The narrowest corridor actually
        # seen says whether the road was ever under pressure.
        ok(tight < 9, 'the road was measured under real traffic',
           f'narrowest corridor {tight:.3f} lane units (need 0.34)')
        ok(tight >= 0.34, 'and it never went under a car width', f'{tight:.3f}')
        # TRAFFIC THAT ONLY BRAKES IS NOT TRAFFIC. Civilians followed the car
        # in front and never once considered the lane beside them, so the road
        # silted up into rolling walls. A merge count of zero over a long run
        # at speed means the decision is not being reached at all.
        merges = page.evaluate("() => window.__road.mergesMade()")
        ok(merges > 0, 'traffic decides to go round slower cars',
           f'{merges} merges over the run')

        ok(errs == [], 'no page errors', errs[0][:100] if errs else '')
        b.close()

    srv.shutdown()
    print(f"\n  {'there is always a way through' if not bad else str(bad) + ' FAILURES'}")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
