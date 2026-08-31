#!/usr/bin/env python3
"""
SCENERY TEST - a tree approaches the way a thing at that distance has to.

    .venv/Scripts/python tools/scenery-test.py

RLG-073. Owner, 2026-08-30: scenery moves away far faster than it approaches - reported about the
forward view, and visible in the mirror as well.

THIS ANSWERS THE GEOMETRY HALF, AND ONLY THAT HALF. Whether a roadside is pleasant to drive past is
the owner's eye; whether an object obeys perspective is arithmetic, and the two are worth separating
before anything is tuned. Perspective gives one law that cannot be argued with:

    apparent width x distance = a constant

so the harness follows ONE object down the road and multiplies. If the product drifts, the scenery
is not being drawn where it is. If it holds, the size is exact and any remaining complaint is about
the FADE or the draw distance rather than about the geometry.

IT FLATTENS THE ROAD FIRST, and that is not a convenience. On the shipped road an object near the
horizon moves mostly because the terrain under it does: the first run of this measurement read a
50-pixel jump that was a hill, not a defect. Hills and bends are removed so the only thing left in
the number is the approach.

AND IT DRIVES PAST THE COUNT-IN. The first version waited 1.4 seconds of a 3 second hold, so the car
was stationary for most of the measurement and the object barely moved - a number the harness had
caused itself, which is the fault this project has been caught by twice before.

Exit code 0 if every check passed, 1 otherwise.
"""

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from collections import defaultdict
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

# width x distance may wander by this share of its own median across a whole approach
WIDTH_DRIFT = 0.02


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(root):
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
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
    print('scenery-test  .  a tree approaches the way it has to')

    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_context(viewport={'width': 480, 'height': 900},
                                   has_touch=True, is_mobile=True).new_page()
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(4200)          # past the three second count-in
        page.evaluate("""() => { const R = window.__probe.road;
            R.setWet(0); R.setSnow(0); R.setBiomePair('FOREST','FOREST');
            R.clearTraffic(); R.flattenRoad(); R.traceScenery(true); }""")
        # let the flattened road settle before the first sample, or frame one
        # carries the geometry that was there a moment ago
        page.wait_for_timeout(500)
        page.evaluate('() => window.__probe.road.sceneryFrame()')

        rows = page.evaluate("""async (n) => {
            const R = window.__probe.road, out = [];
            for(let i = 0; i < n; i++){
                R.setSpd(R.MAX_SPD * 0.35);
                R.clearTraffic();
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                out.push({ pos: R.roadPos(), objs: R.sceneryFrame() });
            }
            return out;
        }""", 80)

        seen = defaultdict(list)
        for n, f in enumerate(rows):
            for o in f['objs']:
                seen[(o['idx'], o['side'], o['row'])].append((n, o))
        res.check(bool(seen), 'the roadside has scenery on it to follow',
                  'nothing was traced')
        if not seen:
            browser.close()
            httpd.shutdown()
            return 1

        # the object seen across the most frames, which is the one that made the
        # longest journey toward the camera
        key, track = max(seen.items(), key=lambda kv: len(kv[1]))
        # the distance is taken from the SAME record as the width, stamped as the
        # object was drawn - not from a position read after the frame
        pairs = [(o['z'] - o['pos'], o['w']) for n, o in track
                 if o['z'] - o['pos'] > 500 and o['w'] > 0.5]
        res.check(len(pairs) >= 20, 'and it was followed a long way in',
                  'only %d usable samples' % len(pairs))

        if len(pairs) >= 20:
            near, far = min(p[0] for p in pairs), max(p[0] for p in pairs)
            print('      followed %s from %.0f units away in to %.0f' % (str(key), far, near))
            res.check(far / max(near, 1) > 1.8,
                      'and it more than halved its distance, so this is an approach',
                      'from %.0f to %.0f' % (far, near))

            # ---- THE ONE LAW PERSPECTIVE CANNOT ARGUE WITH ------------------
            prod = sorted(d * w for d, w in pairs)
            med = prod[len(prod) // 2]
            drift = (prod[-1] - prod[0]) / med
            print('      width x distance: %.0f to %.0f, median %.0f, drift %.2f%%'
                  % (prod[0], prod[-1], med, drift * 100))
            res.check(drift <= WIDTH_DRIFT,
                      'an object is drawn the size its distance says it is',
                      'the product drifted %.1f%% across the approach' % (drift * 100))

            # ---- AND IT ARRIVES WITHOUT JUMPING -----------------------------
            # A step in width is a step in position: both come from the same scale.
            ws = [w for _, w in sorted(((o['pos'], o['w']) for n, o in track))]
            steps = [b / a for a, b in zip(ws, ws[1:]) if a > 0.5]
            if steps:
                print('      frame to frame it grows by at most %.1f%%' % ((max(steps) - 1) * 100))
                res.check(max(steps) < 1.06,
                          'and it grows smoothly rather than in steps',
                          'one frame grew it by %.1f%%' % ((max(steps) - 1) * 100))

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()

    httpd.shutdown()
    if res.fails:
        print('')
        print('  %d check(s) failed' % len(res.fails))
        return 1
    print('')
    print('  the geometry is exact; what it FEELS like is not measured here')
    return 0


if __name__ == '__main__':
    sys.exit(main())
