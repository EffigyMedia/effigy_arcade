#!/usr/bin/env python3
"""FARMLAND TEST - a cornfield one side, yards the other, and the field is planted.

    .venv/Scripts/python tools/farmland-test.py

RLG-102. Owner, 2026-08-31: "I want to add another biome farmland. This one would have one
side with a cornfield and the other side flat with houses and barns. Just like the ocean,
the sides would be randomly decided at generation. The skyline would just be open sky just
like ocean."

THREE CLAIMS, AND THE THIRD IS THE ONE WITH NO PRECEDENT IN THE ENGINE.

    THE SIDES ARE ROLLED, and both views agree about which side is which. A cornfield on
    the left out of the windscreen and on the right in the mirror is one place disagreeing
    with itself, and it is exactly what a SECOND side-roll would produce - which is why the
    coast's roll was generalised rather than copied.

    THE YARD SIDE IS BUILDINGS. Every other place in the game puts the same kind of thing
    on both sides; this is the first that does not.

    AND THE CORNFIELD IS PLANTED RATHER THAN SCATTERED. This is the new part. Every other
    roadside in the engine is a scatter - a hash decides whether an object stands here, a
    second hash jitters where in the band it stands - and the eye reads woodland or desert
    precisely BECAUSE it is irregular. A field is the opposite: straight rows, evenly
    spaced. So the check asks whether the placements are REGULAR, which is the one property
    that separates a field from scrub and the one a screenshot of a 3-pixel-wide sprite
    cannot settle.

WHAT IT CANNOT DO. It cannot say whether the corn LOOKS like corn, or whether a farmland at
dusk is pretty. Those are the owner's on a device.

Exit code 0 if every check passed, 1 otherwise.
"""

import argparse
import functools
import http.server
import socketserver
import sys
import threading
from collections import Counter
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
        print(('  ok    ' if ok else '  FAIL  ') + label + ('' if ok else '   [' + detail + ']'))
        if not ok:
            self.fails.append(label)


def drive(page):
    page.wait_for_function('!!window.__probe.road', timeout=10000)
    page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
    page.click('[data-act="play"]')
    page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
    page.click('[data-act="drive"]')
    page.wait_for_timeout(1600)


def trace(page, frames_ms=260):
    """Every scenery placement in a window, from the engine's own trace."""
    page.evaluate("() => window.__probe.road.traceScenery(true)")
    page.wait_for_timeout(frames_ms)
    rows = page.evaluate("() => window.__probe.road.sceneryFrame()")
    page.evaluate("() => window.__probe.road.traceScenery(false)")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('farmland-test  .  a cornfield one side, yards the other')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 900})
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller',
                timeout=5000)
            page.wait_for_timeout(1000)
        except Exception:
            pass
        drive(page)

        # ------------------------------------------------ the place itself
        print()
        print('  THE PLACE')
        keys = page.evaluate("() => window.__probe.road.BIOME_KEYS()")
        res.check('FARMLAND' in keys, 'farmland is on the board', str(keys))
        shape = page.evaluate("() => window.__probe.road.roadShape('FARMLAND')")
        every = {k: page.evaluate("(k) => window.__probe.road.roadShape(k)", k) for k in keys}
        # ---- AMONG PLACES WITH A SKY, and the narrowing is a real correction ------------
        # This read "the flattest place on the board" and was true when it was written. The
        # TUNNEL is flatter, at 0.06, and that is not a competing landscape: a bore is a
        # shape somebody dug, and RLG-105 calls its relief AUTHORED rather than a tendency
        # of the land. Comparing farmland against it would be comparing a landscape with a
        # civil engineering drawing. The class is "places with a sky", which is a line the
        # engine already draws.
        land = {k: v for k, v in every.items()
                if page.evaluate("(k) => window.__probe.road.skyForm(k)", k) != 'none'}
        flattest = min(land, key=lambda k: land[k]['hill'])
        print('      relief %.2f, sinuosity %.2f   (flattest place with a sky: %s)'
              % (shape['hill'], shape['bend'], flattest))
        res.check(flattest == 'FARMLAND',
                  'and it is the flattest place with a sky over it, which is the gap it fills',
                  '%s is flatter at %.2f' % (flattest, land[flattest]['hill']))
        res.check(shape['hill'] > 0,
                  'and still never completely flat, which the owner has said twice',
                  'relief %.3f' % shape['hill'])

        clim = page.evaluate("() => window.__probe.road.climateFor('FARMLAND')")
        print('      temp %.2f, precip %.2f, cloud bias %.2f  ->  stated snow %.3f'
              % (clim['temp'], clim['precip'], clim['bias'], clim['snow']))
        # THE OPEN SKY COST NOTHING, which is the test of whether the coastal work was built
        # as a tendency or as a special case. Farmland states the coast's own number.
        coast = page.evaluate("() => window.__probe.road.climateFor('COASTAL')")
        res.check(abs(clim['bias'] - coast['bias']) < 1e-6,
                  'it has the coast open sky for free, which is the coastal work being a tendency',
                  'farmland %.2f against the coast %.2f' % (clim['bias'], coast['bias']))
        # AND IT SNOWS, DESPITE A STATED SNOW CHANCE OF ZERO. This is the whole point of the
        # two-temperature model and farmland is the case the owner raised it with: "farmland
        # can be snowy, but you have snow chance at zero."
        mom = page.evaluate("([k,n]) => window.__probe.road.rollMomentsFor(k, undefined, n)",
                            ['FARMLAND', 1500])
        share = mom['snow'] / max(1 - mom['dry'], 1e-9)
        print('      its stated snow chance is %.3f, and it snows on %.0f%% of what falls on it'
              % (clim['snow'], share * 100))
        # FOUR PER CENT, NOT THIRTY, AND THE DIFFERENCE IS A CLAIM IN THE RECORD THAT WAS
        # LOOSE. RLG-109 says a global swing of 0.25 "gives farmland snow on roughly three
        # precipitation events in ten". Thirty per cent is the fraction of MOMENTS cold
        # enough to snow AT ALL - moments below 0.50 out of a range of 0.35 to 0.85 - and it
        # is not the fraction of falls that come down as snow, because the share is near zero
        # at the warm end of that window. Integrating the model gives 4.5%, and the engine
        # measures 3.8%. The model is right and the sentence was wrong; the fragment is
        # corrected rather than the threshold being quietly set to whatever passed.
        res.check(clim['snow'] == 0 and share > 0.02,
                  'a temperate place with a stated snow of ZERO still has snowy days',
                  'stated %.3f, actual %.1f%% of falls' % (clim['snow'], share * 100))
        res.check(share < 0.15,
                  'and they are OCCASIONAL rather than a second winter, which is what temperate means',
                  'it snows on %.1f%% of falls' % (share * 100))

        # ------------------------------------------------ the two sides
        print()
        print('  A CORNFIELD ONE SIDE AND YARDS THE OTHER')
        page.evaluate("() => window.__probe.road.setBiomePair('FARMLAND','FARMLAND')")
        page.wait_for_timeout(500)
        rows = trace(page)
        ahead = [r for r in rows if r['view'] == 'ahead']
        res.check(len(ahead) > 40, 'the roadside was traced', '%d placements' % len(ahead))
        side = page.evaluate("() => window.__probe.road.sideRoll()")
        crop = [r for r in ahead if r['side'] == side]
        yard = [r for r in ahead if r['side'] != side]
        print('      the rolled side is %s: %d placement(s) on it, %d on the other'
              % ('left' if side < 0 else 'right', len(crop), len(yard)))
        res.check(len(crop) > 0 and len(yard) > 0,
                  'BOTH sides carry something, unlike the coast where one is water',
                  'crop side %d, yard side %d' % (len(crop), len(yard)))
        # THE FIELD IS DENSER THAN THE YARDS, which is what a planted field means: every rank
        # at every segment, against a scatter that rolls for each.
        res.check(len(crop) > len(yard) * 2,
                  'and the field is far denser than the yards, because a field is planted',
                  '%d against %d' % (len(crop), len(yard)))

        # ------------------------------------------------ planted, not scattered
        print()
        print('  AND THE FIELD IS PLANTED RATHER THAN SCATTERED')
        # THE ROWS MUST LINE UP ACROSS SEGMENTS. A scatter jitters the offset within its band
        # per segment, so the same rank lands at a different distance from the road each time;
        # a planted field does not. Counting DISTINCT offsets per rank is the difference, and
        # it is the property no screenshot of a three-pixel sprite could settle.
        offs = {}
        for r in crop:
            offs.setdefault(r.get('row', 0), set()).add(round(r['off'], 4))
        yoffs = {}
        for r in yard:
            yoffs.setdefault(r.get('row', 0), set()).add(round(r['off'], 4))
        crop_distinct = max((len(v) for v in offs.values()), default=0)
        yard_distinct = max((len(v) for v in yoffs.values()), default=0)
        print('      the crop uses %d distinct distance(s) from the road per rank; '
              'the yards use %d' % (crop_distinct, yard_distinct))
        res.check(crop_distinct == 1,
                  'every stand in a rank sits at the SAME distance, so the rows are straight',
                  'a rank used %d different distances' % crop_distinct)
        res.check(yard_distinct > 1,
                  'while the yards still jitter, so the regularity is the crop and not the engine',
                  'the yards used %d' % yard_distinct)
        res.check(len(offs) >= 4,
                  'and the field has several ranks running away from the road',
                  '%d rank(s)' % len(offs))

        # ------------------------------------------------ both views agree
        print()
        print('  AND THE MIRROR AGREES WITH THE WINDSCREEN ABOUT WHICH SIDE IS WHICH')
        mirror = [r for r in rows if r['view'] == 'mirror']
        if not mirror:
            rows2 = trace(page, 420)
            mirror = [r for r in rows2 if r['view'] == 'mirror']
        mcrop = [r for r in mirror if r['side'] == side]
        myard = [r for r in mirror if r['side'] != side]
        print('      in the glass: %d placement(s) on the rolled side, %d on the other'
              % (len(mcrop), len(myard)))
        res.check(len(mirror) > 0, 'the glass drew a roadside at all', '%d' % len(mirror))
        # THE SAME IMBALANCE, in the same direction. A second side-roll would have produced
        # the field on one side out of the front and the other side in the glass, which is
        # precisely the fault generalising the coast roll exists to prevent.
        res.check(len(mcrop) > len(myard),
                  'and the field is on the SAME side in both, which one shared roll guarantees',
                  'glass has %d on the rolled side against %d' % (len(mcrop), len(myard)))

        # ------------------------------------------------ the side is rolled
        print()
        print('  AND WHICH SIDE IS GENUINELY ROLLED')
        sides = []
        for _ in range(40):
            page.evaluate("() => window.__probe.road.startBiomeChange('FARMLAND')")
            sides.append(page.evaluate("() => window.__probe.road.sideRoll()"))
        left = sides.count(-1)
        print('      over 40 placements: %d left, %d right' % (left, len(sides) - left))
        res.check(all(v in (-1, 1) for v in sides),
                  'the field is on a side, never both and never neither', str(set(sides)))
        res.check(3 < left < 37, 'and the side is rolled rather than fixed',
                  '%d left of 40' % left)

        errs = page.evaluate("() => window.__probe.errors")
        res.check(not errs, 'no page errors', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('FAILED: ' + '; '.join(res.fails))
        return 1
    print('all checks passed')
    print('  what the corn LOOKS like is not measured here')
    return 0


sys.exit(main())
