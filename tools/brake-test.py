#!/usr/bin/env python3
"""
BRAKE AND GRIP TEST - what the fleet actually does when it stops and when it turns.

    .venv/Scripts/python tools/brake-test.py

RLG-055, which is blocked on exactly this. `stat-test.py` measures straight-line acceleration and top
speed and nothing else; the owner ruled brake and grip into the fleet table, and RLG-042's lesson is
why the measurement has to come first - there, the top-speed column turned out TRUE while three
comments around it were false, and nobody could have predicted which way that would fall. Lowering a
number without knowing whether it was honest produces a change nobody can interpret afterwards.

MEASURE ONLY. This file proposes no numbers and changes nothing. It reports what the cars do.

WHY IT IS NOT INSIDE `stat-test.py`, WHICH IS WHERE RLG-055 ASKED FOR IT. That harness boots the whole
fleet and drives each car flat out; braking and cornering need a different procedure - a fixed entry
speed, a held brake, and for the cornering experiment NO STEERING INPUT AT ALL. Grafting a second
driving procedure into a harness built for one risks the acceleration numbers that are already
trusted. The fleet picture is assembled from both, and this file says so rather than quietly
diverging.

AND THE CORNERING EXPERIMENT HAS NO DRIVER IN IT, which is the point. RLG-055's own warning is that
grip must not be measured with the drive-test autopilot, because it saws at the wheel and lateral load
is what wears tyres - this project has already once been told that Raceway's tyres died in twenty
seconds when the autopilot was the cause. So the wheel is not touched. `grip` acts through `cornerG`,
which decides how hard a bend pushes the car WIDE; the car is put on a bend at a fixed speed with the
steering untouched, and the measurement is how fast it is pushed out. Nothing a driver does can
influence it, because there is no driver.

WHAT `grip` DOES AND DOES NOT DO, established by reading before measuring. It is consulted in exactly
two places: `brakeOf`, which scales the braking rate, and `cornerG`, which scales how hard a bend
pushes you wide. It does NOT affect how fast the car answers the wheel - that rate is the same for
every body and is moved only by the weather. So a "grippy" car in this engine stops harder and holds
its line, and does not place itself more sharply.

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

/* ---- BRAKING, SAMPLED IN THE PAGE ------------------------------------------------------------
   From a fixed entry speed to a fixed exit speed, with the brake held. Timed by the page's own
   clock and measured against the road's own position, so neither number is reconstructed from
   frame counts on this side of the wire. */
window.__probe.brakeRun = function(from, to, capMs){
  const R = window.__probe.road;
  return new Promise(function(done){
    R.setSpd(from); R.setBrake(true);
    var z0 = R.roadPos(), t0 = performance.now(), frames = 0;
    (function step(){
      frames++;
      var now = performance.now(), spd = R.spdNow();
      if(spd <= to || now - t0 > capMs){
        R.setBrake(false);
        done({ ms: now - t0, dist: R.roadPos() - z0, frames: frames, end: spd });
        return;
      }
      requestAnimationFrame(step);
    })();
  });
};

/* ---- AND CORNERING, WITH THE WHEEL UNTOUCHED -------------------------------------------------
   The car is set on the road at a fixed speed and left alone. `targetX` is where the driver is
   asking the car to be; a bend moves it outward through `cornerG`, and nothing else does while no
   input arrives. So the drift of `targetX` over a fixed window IS the cornering push. */
window.__probe.pushRun = function(ms){
  const R = window.__probe.road;
  return new Promise(function(done){
    /* `targetX` is a live GETTER on the API, not a call - a property defined
       beside `playerX` and `dmg`. Reading it as a function is what broke the
       first version of this file. */
    var x0 = R.targetX;
    var t0 = performance.now(), worst = 0, n = 0, sum = 0;
    (function step(){
      var x = R.targetX;
      var d = Math.abs(x - x0);
      if(d > worst) worst = d;
      sum += Math.abs(R.pushK ? R.pushK() : 0); n++;
      if(performance.now() - t0 > ms){
        done({ drift: worst, samples: n, meanPush: n ? sum/n : 0 });
        return;
      }
      requestAnimationFrame(step);
    })();
  });
};
"""

# every driveable body, in the order the garage would show them
BODIES = ['ROADSTER', 'TUNER', 'MUSCLE', 'STALLION', 'MATADOR', 'CREST',
          'VECTOR', 'APEX', 'COMET', 'CRUISER', 'SUPERCRUISER']
# BRAKE FROM BELOW THE SLOWEST CAR'S TOP SPEED. The first version entered at 150mph, which is above
# the TUNER's 146 - so aero over-run was helping it stop, and the TUNER came out braking better than
# two cars the table says brake better than it. That was a fault in this file, not in the fleet.
FROM_F, TO_F = 0.60, 0.20      # 120mph down to 40mph on a 200mph scale
CAP_MS = 12000
PUSH_MS = 2500


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
    print('brake-test  .  what the fleet does when it stops and when it turns')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 900})
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller', timeout=5000)
            page.wait_for_timeout(1000)
        except Exception:
            pass
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(2500)

        mx = page.evaluate("() => window.__probe.road.MAX_SPD")
        # ---- AND THE CORNERING PUSH, WITH NOBODY DRIVING -------------------------------------
        print('  the cornering push on one constant bend, at %d mph, wheel untouched'
              % (0.6 * 200))
        # ON THE ROAD AS GENERATED, and BEFORE the braking runs flatten it - `flattenRoad` has
        # no inverse, and a straight road has no cornering push to measure. Ordering the two
        # experiments this way costs nothing and needs no new engine call.
        # ONE CORNER FOR EVERY CAR. The road is generated per load and advances while the run
        # proceeds, so each body met a different bend and the numbers could not be compared -
        # RLG-062's lesson, and it invalidated the first set this file produced. `bendRoad` makes
        # every segment the same curvature, so the only thing that differs between bodies is the
        # body.
        page.evaluate("""() => { const R = window.__probe.road;
            R.setWet(0); R.setSnow(0); R.setPool(0); R.bendRoad(0.6); }""")
        page.wait_for_timeout(200)
        pushes = []
        for b in BODIES:
            if not page.evaluate("(k) => { const R = window.__probe.road;"
                                 " R.setBody(k); return R.bodyKey() === k; }", b):
                continue
            # LET IT SETTLE ON THE BEND BEFORE MEASURING. The bend is imposed on a road that was
            # already generated, and the car arrives on it mid-corner; the first body measured read
            # exactly 0.0000 because its window closed before the corner reached it.
            page.evaluate("(v) => { const R = window.__probe.road;"
                          " R.setSpd(v); R.setLane(0); }", 0.6 * mx)
            page.wait_for_timeout(700)
            page.evaluate("(v) => { const R = window.__probe.road;"
                          " R.setSpd(v); R.setLane(0); }", 0.6 * mx)
            page.wait_for_timeout(150)
            r = page.evaluate("(ms) => window.__probe.pushRun(ms)", PUSH_MS)
            # RAW `grip`, NOT `brakeOf`. The braking rate is grip x mech and the cornering push
            # is grip alone, so comparing the push against brakeOf compares it with a number the
            # corner never reads - which reported 31 inverted pairs on a first run and was my
            # arithmetic, not the engine's.
            g = page.evaluate("(k) => (window.__probe.road.BODY[k] || {}).grip || 1", b)
            pushes.append({'body': b, 'drift': r['drift'], 'claim': g})
            print('      %-13s pushed %.4f of a lane over %.1fs   (grip %.3f)'
                  % (b, r['drift'], PUSH_MS / 1000.0, g))

        res.check(len(pushes) >= 4, 'enough bodies were pushed to compare',
                  'only %d' % len(pushes))
        if len(pushes) >= 4:
            spread = max(p2['drift'] for p2 in pushes) - min(p2['drift'] for p2 in pushes)
            print('  the spread across the fleet is %.4f of a lane' % spread)
            # AND IT SHOULD ORDER BY GRIP, because that is the only thing `cornerG` reads. This
            # is the cornering half of the same question the braking half asks: does a car the
            # table says holds better actually get pushed less.
            byclaim = sorted(pushes, key=lambda r: -r['claim'])
            bad = 0
            for i2 in range(len(byclaim)):
                for j2 in range(i2 + 1, len(byclaim)):
                    a2, b3 = byclaim[i2], byclaim[j2]
                    if a2['claim'] > b3['claim'] + 1e-9 and a2['drift'] > b3['drift'] + 1e-4:
                        bad += 1
            res.check(bad == 0,
                      'and a car the table says grips better is pushed wide less',
                      '%d pair(s) are the wrong way round' % bad)
        print()

        # DRY AND FLAT AND STRAIGHT for the braking run: weather moves the brake through wetBrake,
        # and a hill would add or remove speed that has nothing to do with the brakes.
        page.evaluate("""() => { const R = window.__probe.road;
            R.setWet(0); R.setSnow(0); R.setPool(0);
            if(R.flattenRoad) R.flattenRoad(); }""")
        page.wait_for_timeout(300)
        print('  braking from %d to %d mph, dry, on a flat straight road'
              % (FROM_F * 200, TO_F * 200))
        print()

        rows = []
        for b in BODIES:
            ok = page.evaluate("(k) => { const R = window.__probe.road;"
                               " if(!R.setBody) return false; R.setBody(k);"
                               " return R.bodyKey() === k; }", b)
            if not ok:
                print('      %-13s could not be selected' % b)
                continue
            page.wait_for_timeout(150)
            r = page.evaluate("([a,b,c]) => window.__probe.brakeRun(a,b,c)",
                              [FROM_F * mx, TO_F * mx, CAP_MS])
            claim = page.evaluate("(k) => window.__probe.road.brakeOf(k)", b)
            grip = page.evaluate("(k) => (window.__probe.road.bodyStat "
                                 "? window.__probe.road.bodyStat(k) : null)", b)
            rows.append({'body': b, 'ms': r['ms'], 'dist': r['dist'],
                         'claim': claim, 'end': r['end']})
            print('      %-13s %6.0f ms   %7.0f units   brakeOf says %.3f'
                  % (b, r['ms'], r['dist'], claim))

        res.check(len(rows) >= 6, 'enough of the fleet could be measured',
                  'only %d bodies' % len(rows))
        print()

        # ---- DOES THE TABLE TELL THE TRUTH ABOUT BRAKING -------------------------------------
        # The question RLG-042 asked about top speed, asked about the brakes. Not "is the number
        # right" - the number is a multiplier and cannot be right or wrong on its own - but does a
        # car the table says stops harder actually stop harder.
        if len(rows) >= 6:
            best = min(rows, key=lambda r: r['dist'])
            worst = max(rows, key=lambda r: r['dist'])
            print('  the shortest stop is the %s at %.0f units; the longest is the %s at %.0f'
                  % (best['body'], best['dist'], worst['body'], worst['dist']))
            byclaim = sorted(rows, key=lambda r: -r['claim'])
            bydist = sorted(rows, key=lambda r: r['dist'])
            agree = sum(1 for i, r in enumerate(byclaim) if bydist[i]['body'] == r['body'])
            print('  the table ranks %d of %d in the order they actually stop'
                  % (agree, len(rows)))
            # A ranking, not a rate. The multiplier and the distance are not the same quantity, so
            # what can be checked is that they ORDER the fleet the same way.
            inversions = 0
            for i in range(len(rows)):
                for j in range(i + 1, len(rows)):
                    a, b2 = byclaim[i], byclaim[j]
                    if a['claim'] > b2['claim'] + 1e-9 and a['dist'] > b2['dist']:
                        inversions += 1
            res.check(inversions == 0,
                      'a car the table says brakes better actually stops shorter',
                      '%d pair(s) are the wrong way round' % inversions)
        print()

        errs = page.evaluate("() => window.__probe.errors")
        res.check(not errs, 'no page errors', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('FAILED: ' + ', '.join(res.fails))
        return 1
    print('all checks passed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
