#!/usr/bin/env python3
"""
COLLIDE TEST - the hit happens where the car is, not a little inside it.

    .venv/Scripts/python tools/collide-test.py

RLG-058. The owner: "We have to make the vehicle colliders true to their sprite size. It's hard to
tell." The complaint is not that a number is wrong in the abstract - it is that a hit cannot be
predicted from what is on the screen. The player was DRAWN at 0.265 of the road and COLLIDED at 0.26,
in three separate hard-coded places.

HOW IT MEASURES, which is the method the ruling asked for: park one car at a known lateral offset,
put the player at a series of offsets, and find the offset at which the hit actually fires. The car
is pushed onto the REAL traffic array with the same fields the spawner gives it, and the real hit
test runs on it - a harness that reimplemented the overlap would prove only its own arithmetic.

Exit code 0 if every check passed, 1 otherwise.
"""

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
from harness import console_utf8, launch_chromium

GAME = 'games/sw/interstate.html'

INIT = r"""
window.__probe = { errors: [], road: null };
(function(){
  var real = null, wrapped = null;
  Object.defineProperty(window, 'ROAD', {
    configurable: true,
    get: function(){ return real ? wrapped : undefined; },
    set: function(fn){
      real = fn;
      wrapped = function(CFG){
        var api = real(CFG);
        window.__probe.road = api || (CFG && CFG.api) || null;
        return api;
      };
    }
  });
})();
window.addEventListener('error', function(e){ window.__probe.errors.push(String(e.message)); });
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(root):
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.socket.getsockname()[1]


class Results:
    def __init__(self):
        self.fails = []

    def check(self, ok, label, detail=''):
        print(('  ok    ' if ok else '  FAIL  ') + label + ('' if ok else '   [' + str(detail) + ']'))
        if not ok:
            self.fails.append(label)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('collide-test  .  the hit is where the car is')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 900})
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1500)

        api = page.evaluate('() => Object.keys(window.__probe.road)')
        res.check('parkTraffic' in api and 'colliderProbe' in api and 'damage' in api,
                  'the engine can park a car and report the damage')

        probe = page.evaluate("""() => { const R = window.__probe.road;
            R.setSpd(0); const t = R.parkTraffic(0, 0, 'sedan');
            return { car: t, probe: R.colliderProbe() }; }""")
        print('      parked a %s: half-widths sum to %.5f of the road'
              % ('sedan', probe['probe']['hitHalf']))

        # WALK THE PLAYER OUT SIDEWAYS AND FIND WHERE THE HIT STOPS. Damage is reset each step
        # and the car re-parked, because a hit pushes both cars apart - measuring a second time
        # without resetting measures the push rather than the overlap.
        HIT = """(dx) => {
            const R = window.__probe.road;
            R.parkTraffic(0, 0, 'sedan');
            R.setSpd(0); R.setLane(dx);
            return R.damage();
        }"""
        # A BINARY SEARCH, NOT A WALK. The first version stepped outward in 200 small moves and
        # reported an edge at 0.025 against an expected 0.223 - because a hit sets a nine-tenths
        # of a second invulnerability window, so every step after the first read as a miss. The
        # window is cleared when a car is parked now, and a search costs fourteen readings
        # instead of two hundred.
        def hits_with(dx, t):
            # DAMAGE IS CAPPED AT 100. The first version ran the sedan's search first and every
            # truck reading afterwards came back a miss, converging on an offset of zero - the
            # gauge was full, not the car missing. It is cleared before each staged collision.
            page.evaluate('() => window.__probe.road.setDamage(0)')
            before = page.evaluate('() => window.__probe.road.damage()')
            page.evaluate("([dx, t]) => { const R = window.__probe.road;"
                          " R.parkTraffic(0, 0, t); R.setSpd(0); R.setLane(dx); }", [dx, t])
            page.wait_for_timeout(90)
            return page.evaluate('() => window.__probe.road.damage()') > before + 0.5

        def hits(dx):
            page.evaluate('() => window.__probe.road.setDamage(0)')
            before = page.evaluate('() => window.__probe.road.damage()')
            page.evaluate(HIT, dx)
            page.wait_for_timeout(90)
            after = page.evaluate('() => window.__probe.road.damage()')
            return after > before + 0.5

        res.check(hits(0.0), 'a car in the same place as you is a hit')
        res.check(not hits(0.6), 'and one well clear of you is not')
        lo, hi = 0.0, 0.6
        for _ in range(14):
            mid = (lo + hi) / 2
            if hits(mid):
                lo = mid
            else:
                hi = mid
        found = (lo + hi) / 2
        print('      the hit stops at a lateral offset of %.4f' % found)
        res.check(found is not None, 'a hit fires when the cars overlap and stops when they do not',
                  'never found an edge')
        if found is not None:
            want = probe['probe']['hitHalf']
            # one step of the walk is 0.0025 of the road, so agreement within two steps is exact
            res.check(abs(found - want) <= 0.004,
                      'and it stops exactly at the sum of the two half-widths',
                      'measured %.4f against %.4f' % (found, want))

        # ---- AND THE PLAYER'S OWN HALF-WIDTH, MEASURED RATHER THAN READ ----------
        # The edge is the SUM of two half-widths, so measuring it against one car only proves
        # the sum. Two cars of known and different widths separate them: subtract the traffic
        # car's half-width from each edge and what is left is the player's, twice, from the
        # real hit path. A check that read PLAYER_W back would pass on any value at all.
        derived = []
        for t, tw in (('truck', 0.32), ('coupe', 0.26)):
            page.evaluate("(t) => window.__probe.road.parkTraffic(0, 0, t)", t)
            lo, hi = 0.0, 0.6
            for _ in range(14):
                mid = (lo + hi) / 2
                if hits_with(mid, t):
                    lo = mid
                else:
                    hi = mid
            edge = (lo + hi) / 2
            # edge = carW(tw + playerW)/2, and carW is linear, so playerW = edge*2/unit - tw
            derived.append((t, tw, edge))
            print('      %-6s (%.3f wide) collides at %.4f' % (t, tw, edge))
        # the DIFFERENCE between the two edges depends only on the two traffic widths, so it
        # pins the scale, and the scale then turns either edge into the player's own width
        (t1, w1, e1), (t2, w2, e2) = derived
        scale = (e1 - e2) / ((w1 - w2) / 2)          # pixels of offset per unit of car width
        player_w = (e1 * 2 / scale) - w1
        print('      the player therefore collides at %.4f of the road, drawn at %.4f'
              % (player_w, probe['probe']['playerW']))
        # THE TOLERANCE IS TIGHT ON PURPOSE. The search resolves to 0.00004 and the derived width
        # came in 0.0002 from the drawn one, so a loose bound would sail past the very defect this
        # ruling is about: the old collider was 0.26 against a drawn 0.265, a gap of 0.005.
        res.check(abs(player_w - probe['probe']['playerW']) < 0.002,
                  'the player collides at the width it is drawn at',
                  'measured %.4f against a drawn %.4f' % (player_w, probe['probe']['playerW']))

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()
    httpd.shutdown()
    print(('\n%d check(s) failed' % len(res.fails)) if res.fails else '\nall checks passed')
    return 1 if res.fails else 0


if __name__ == '__main__':
    sys.exit(main())
