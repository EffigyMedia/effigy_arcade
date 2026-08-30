#!/usr/bin/env python3
"""
BIOME TEST - a biome change is a place you drive into, not a colour that flips.

    .venv/Scripts/python tools/biome-test.py
    .venv/Scripts/python tools/biome-test.py --headed

RLG-022. The owner asked for the new biome's colour to be taken by the road slices "from the
furthest point forward" so it travels toward the camera, with a blend band between the two, and for
the band under the horizon to match the foreground and sit slightly darker. RLG-059 adds that each
biome must be strict about its ground colour.

WHY THIS NEEDS A HARNESS AND NOT A SCREENSHOT. The transition takes as long as it takes to drive the
length of the drawn road. One frame cannot show travel, and two frames of a moving game differ for a
dozen reasons that have nothing to do with the biome. So this reads the sweep as numbers over time -
where the boundary is, and how much of the new place each end of the draw is showing - and asserts
the SHAPE of the change rather than any single value.

WHAT IT WOULD CATCH. A flip - the old behaviour - shows the same mix at the car and at the horizon
at every instant. A sweep shows the horizon ahead of the car for the whole transition, and the gap
closing as the player drives at it. The last section puts the flip back and checks that this
distinction actually fails.

Exit code 0 if every check passed, 1 otherwise.
"""

import argparse
import functools
import http.server
import socketserver
import sys
import time
from pathlib import Path
import threading

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


SET_SNOWY_TUNDRA = """() => {
  const R = window.__probe.road;
  R.setBiomePair('TUNDRA', 'TUNDRA');
  R.setWet(0.9); R.setSnow(0.8);
}"""

# park the car just short of the band, so the crossing happens inside the run
# rather than 150 segments of driving later
PARK_AT_BAND = """() => {
  const R = window.__probe.road, s = R.biomeSweep();
  R.jumpTo((s.edge - s.band * 5) * 200);
}"""

READ_WEATHER = """() => {
  const R = window.__probe.road, s = R.biomeSweep();
  return { cross:s.atCar, wcross:s.atCarWeather, wet:R.wet(),
           settle:R.settle(), inb:s.player };
}"""

def lum(css):
    """Perceived brightness of an 'rgb(r,g,b)' string."""
    r, g, b = [float(v) for v in css[css.index('(') + 1:css.index(')')].split(',')]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def rgb(css):
    return tuple(float(v) for v in css[css.index('(') + 1:css.index(')')].split(','))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('biome-test  .  a biome change is a place you drive into')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 900})
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller', timeout=5000)
            page.wait_for_timeout(1200)
        except Exception:
            pass
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        # MIDDAY, so the ground reads its daylight branch. The night and golden branches
        # are asserted separately below, by asking for them directly.
        for _ in range(6):
            if page.eval_on_selector('[data-act="time"] b', 'el => el.textContent').strip() == 'MIDDAY':
                break
            page.click('[data-act="time"]')
            page.wait_for_timeout(70)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1500)

        api = page.evaluate('() => Object.keys(window.__probe.road).filter(k => /biome|ground/i.test(k))')
        res.check('biomeSweep' in api and 'startBiomeChange' in api,
                  'the engine reports the sweep', str(sorted(api)))

        # ------------------------------------------------------ the ground is strict
        print()
        print('  STRICT - each biome has its own ground, at every hour')
        keys = page.evaluate('() => window.__probe.road.BIOME_KEYS()')
        res.check(len(keys) >= 5, 'all the biomes are there', str(keys))
        # The night and golden branches used to be flat constants shared by every biome,
        # so this compared equal for all five and the sweep was invisible after dark.
        for label, night, gold in (('day', 0, 0), ('night', 1, 0), ('golden', 0, 1)):
            tones = page.evaluate(
                """([n, g]) => {
                  const R = window.__probe.road, out = {};
                  for(const k of R.BIOME_KEYS()){
                    R.setBiomePair(k, k);
                    out[k] = R.groundToneAt(0, false, n, g);
                  }
                  return out;
                }""", [night, gold])
            distinct = len(set(tones.values()))
            res.check(distinct == len(tones),
                      'at %s, every biome paints a different ground' % label,
                      '%d distinct of %d: %s' % (distinct, len(tones), tones))

        # ------------------------------------------------------ the far field matches
        print()
        print('  THE BAND UNDER THE HORIZON - the same ground, slightly darker')
        page.evaluate("() => window.__probe.road.setBiomePair('FOREST', 'FOREST')")
        page.wait_for_timeout(200)
        pair = page.evaluate("""() => {
          const R = window.__probe.road;
          const here = R.biomeSweep().here;
          return { far: R.groundToneAt(here + 150, false), band: R.groundBase() };
        }""")
        f, b = lum(pair['far']), lum(pair['band'])
        res.check(b < f, 'the band is DARKER than the ground it sits behind',
                  'furthest slice %.1f, band %.1f' % (f, b))
        res.check(b > f * 0.55, 'and not so much darker that it reads as a different place',
                  'band is %.0f%% of the slice' % (100 * b / f))
        fr, br = rgb(pair['far']), rgb(pair['band'])
        # SAME COLOUR, not merely a similar brightness. A grey band of the right darkness
        # would pass a brightness test and fail the owner's request, which was that it
        # MATCH the foreground. Channel ratios say hue; brightness does not.
        spread = max(br[i] / max(fr[i], 1) for i in range(3)) - min(br[i] / max(fr[i], 1) for i in range(3))
        res.check(spread < 0.35, 'and it is the same colour, not a grey of the same weight',
                  'channel ratio spread %.3f  %s vs %s' % (spread, pair['far'], pair['band']))

        # ------------------------------------------------------ the sweep itself
        print()
        print('  THE SWEEP - the new place arrives at the horizon first')
        start = page.evaluate("() => window.__probe.road.startBiomeChange()")
        res.check(start['from'] != start['to'], 'a change was placed',
                  '%s -> %s at segment %d, car at %d' % (start['from'], start['to'],
                                                         start['edge'], start['here']))
        res.check(start['atHorizon'] > start['atCar'],
                  'the moment it is placed, the horizon shows the new place and the car does not',
                  'horizon %.3f, car %.3f' % (start['atHorizon'], start['atCar']))
        res.check(start['player'] == start['from'],
                  'and the player is still in the OLD one, so the weather has not changed yet',
                  '%s' % start['player'])

        # THE CAR HAS TO ACTUALLY GET THERE. The boundary is placed DRAW segments
        # ahead - the far edge of the drawn road - and a car rolling off the line
        # covered 16 of those 150 in five seconds, so the first version of this
        # watched a sweep that had not moved yet and called it stationary. Speed is
        # held directly rather than by holding a throttle, because nothing here is
        # testing the throttle.
        track = [start]
        for _ in range(26):
            page.evaluate("() => window.__probe.road.setSpd(window.__probe.road.MAX_SPD * 0.9)")
            page.wait_for_timeout(300)
            track.append(page.evaluate("() => window.__probe.road.biomeSweep()"))
        for row in track[::3]:
            print('      car seg %-7d edge %-7d  mix at car %.3f  at horizon %.3f  in: %s'
                  % (row['here'], row['edge'], row['atCar'], row['atHorizon'], row['player']))

        cars = [r['atCar'] for r in track]
        res.check(all(b >= a - 0.001 for a, b in zip(cars, cars[1:])),
                  'the new place never retreats - it only comes closer',
                  ' '.join('%.2f' % v for v in cars[:8]))
        res.check(cars[-1] > cars[0],
                  'and it does come closer as the car drives at it',
                  '%.3f -> %.3f' % (cars[0], cars[-1]))
        # THE WHOLE POINT: a flip would show these equal at every instant.
        gap = [r['atHorizon'] - r['atCar'] for r in track if r['atCar'] < 1]
        res.check(gap and max(gap) > 0.3,
                  'the horizon leads the car by a wide margin - this is a sweep, not a flip',
                  'largest gap %.3f' % (max(gap) if gap else 0))
        crossed = [r for r in track if r['player'] == r['to']]
        if crossed:
            print('      the car arrived: player biome became %s' % crossed[0]['to'])

        # ------------------------------------------------ the horizon leads the car
        print()
        print('  THE SKYLINE BELONGS TO THE HORIZON, NOT TO THE CAR')
        res.check(page.evaluate("() => window.__probe.road.skySwap()") in ('move', 'fade'),
                  'the swap mechanism is switchable, so both can be judged',
                  page.evaluate("() => window.__probe.road.skySwap()"))
        page.evaluate("() => window.__probe.road.setBiomePair('DESERT', 'DESERT')")
        page.wait_for_timeout(200)
        placed = page.evaluate("() => window.__probe.road.startBiomeChange('FOREST')")
        # The horizon shows what the far segments show. At the moment a change is
        # placed the far segments are already half into the new place while the car is
        # not in it at all, so the skyline must be mid-swap while the player is still
        # wholly in the old biome. Before this the skyline was rebuilt on ARRIVAL, so
        # it would have read as the old place for the whole transition.
        res.check(placed['atHorizon'] > 0.4,
                  'the moment a change is placed, the skyline is already handing over',
                  'horizon mix %.3f' % placed['atHorizon'])
        res.check(placed['player'] == 'DESERT' and placed['atCar'] == 0,
                  'while the car is still wholly in the old place',
                  'player %s, mix at car %.3f' % (placed['player'], placed['atCar']))

        # --------------------------------------------- the weather crosses with you
        print()
        print('  THE WEATHER TRANSITIONS AS YOU CROSS, rather than switching at a line')
        # Snow falling, driving into a place that cannot hold it. The old behaviour
        # zeroed the target and went to full melt the instant the car passed the
        # boundary segment. It should thin out across the band instead.
        page.evaluate(SET_SNOWY_TUNDRA)
        page.wait_for_timeout(300)
        page.evaluate("() => window.__probe.road.startBiomeChange('DESERT')")
        page.evaluate(PARK_AT_BAND)
        wx = []
        for _ in range(22):
            page.evaluate("() => window.__probe.road.setSpd(window.__probe.road.MAX_SPD * 0.35)")
            page.wait_for_timeout(220)
            wx.append(page.evaluate(READ_WEATHER))
        crossing = [r for r in wx if 0 < r['wcross'] < 1]
        for r in wx[::4]:
            print('      ground %.2f  weather %.2f   wet %.3f   settle %.3f   in %s'
                  % (r['cross'], r['wcross'], r['wet'], r['settle'], r['inb']))
        res.check(len(crossing) >= 2,
                  'the run actually spent time inside the band, so this measured something',
                  '%d of %d samples were mid-crossing' % (len(crossing), len(wx)))
        wets = [r['wet'] for r in wx]
        res.check(wets[-1] < wets[0],
                  'the snow thins out as the desert arrives',
                  '%.3f -> %.3f' % (wets[0], wets[-1]))
        # A SWITCH WOULD SHOW ONE STEP. A transition shows several intermediate
        # values, and that is the difference being asserted.
        mids = [w for w in wets if 0.05 < w < wets[0] * 0.95]
        res.check(len(mids) >= 2,
                  'and it passes through intermediate values rather than stepping off',
                  '%d intermediate: %s' % (len(mids), ' '.join('%.2f' % w for w in mids[:6])))

        # ------------------------------------------- and the distinction can fail
        print()
        print('  NOT VACUOUS - the old flip goes back and the sweep check must catch it')
        flip = page.evaluate("""() => {
          const R = window.__probe.road;
          /* the old behaviour: the biome changes everywhere at once, so every segment
             reports the same mix and there is no travel to see */
          R.setBiomePair('DESERT', 'DESERT');
          const s = R.biomeSweep();
          return { atCar:s.atCar, atHorizon:s.atHorizon };
        }""")
        res.check(abs(flip['atHorizon'] - flip['atCar']) < 0.001,
                  'with the flip back, the car and the horizon agree - which the check above forbids',
                  'car %.3f, horizon %.3f' % (flip['atCar'], flip['atHorizon']))

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors during the run', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('  %d FAILED: %s' % (len(res.fails), '; '.join(res.fails)))
        return 1
    print('  the biome arrives at the horizon and drives toward you')
    return 0


if __name__ == '__main__':
    sys.exit(main())
