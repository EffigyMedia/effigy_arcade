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

READ_FLOORS = """() => {
  const R = window.__probe.road, out = {};
  const keep = R.biomeSweep().player;
  for(const k of R.BIOME_KEYS()){ R.setBiomePair(k, k); out[k] = R.snowFloor(); }
  R.setBiomePair(keep, keep);
  return out;
}"""

BARE_THEN_TUNDRA = """() => {
  const R = window.__probe.road;
  R.setBiomePair('DESERT', 'DESERT');
  R.setWet(0); R.setSnow(0); R.setPool(0);
  R.setBiomePair('TUNDRA', 'TUNDRA');
}"""

# snow ON TOP of the floor, so the unwind has somewhere above it to come down from
TUNDRA_DEEP = """() => {
  const R = window.__probe.road;
  R.setBiomePair('TUNDRA', 'TUNDRA');
  R.setWet(0.9); R.setSnow(0.95);
}"""

DRY_DESERT = """() => {
  const R = window.__probe.road;
  R.setBiomePair('DESERT', 'DESERT');
  R.setWet(0); R.setSnow(0); R.setPool(0);
}"""

# IT HAS TO SNOW FIRST, and that is not set dressing. The unwind runs at the rate
# the last fall was depositing at, and a run that never accumulated falls back to
# 0.006 a second - which moves settle by 0.025 over the whole reading and reaches
# no floor at all. The first version of this check set the level directly and then
# measured a slope so shallow that a floor and no floor were indistinguishable.
SNOW_FIRST = """(k) => {
  const R = window.__probe.road;
  R.setBiomePair(k, k);
  R.setWet(0.9); R.setSnow(0.30);
}"""

# then stop it, just above the floor, with the fall rate now set
STOP_JUST_ABOVE = """() => {
  const R = window.__probe.road;
  R.setSnow(0.58); R.setWet(0);
}"""

GRIP_IN_TUNDRA = """() => {
  const R = window.__probe.road;
  R.setBiomePair('TUNDRA', 'TUNDRA');
  R.setWet(0); R.setSnow(0.5); R.setPool(0);
  return R.wetGrip();
}"""

CAR_AND_ROAD = """() => {
  const R = window.__probe.road;
  const p = R.playerScreen();
  const v = R.vergeGap(12000);
  return { car: p ? +p.w.toFixed(2) : null, edge: v ? v.edge : null };
}"""

READ_SETTLE = "() => window.__probe.road.settle()"

# THE WEATHER TIMER KEEPS RUNNING while a measurement is going on, and in a tundra
# it starts snowing again within seconds - snow chance 0.62. The first version of
# the unwind check watched settle fall to 0.536 and then climb back to 0.554, and
# read that as the floor holding it. It was fresh snow. This holds the sky dry for
# the length of the reading, which is the only way to measure what the GROUND does.
HOLD_DRY = """() => { const R = window.__probe.road; R.setWet(0); return R.settle(); }"""

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

        # -------------------------------------------------- the tundra lies under snow
        print()
        print('  THE TUNDRA IS WHITE BEFORE ANYTHING FALLS')
        floors = page.evaluate(READ_FLOORS)
        print('      floors: %s' % floors)
        res.check(floors.get('TUNDRA', 0) > 0.4,
                  'the tundra holds snow on its own', 'floor %.2f' % floors.get('TUNDRA', 0))
        res.check(all(v == 0 for k, v in floors.items() if k != 'TUNDRA'),
                  'and nowhere else does', str(floors))

        # Bare ground, then a tundra arrives. It must CLIMB to the floor rather than
        # snapping to it - a Math.max would have yanked it up in one frame, which is
        # the switch this whole piece of work exists to remove.
        page.evaluate(BARE_THEN_TUNDRA)
        climb = []
        for _ in range(12):
            page.wait_for_timeout(250)
            climb.append(page.evaluate(READ_SETTLE))
        print('      settle climbing: %s' % ' '.join('%.3f' % v for v in climb))
        res.check(climb[-1] > climb[0], 'it whitens when you arrive somewhere that lies under snow',
                  '%.3f -> %.3f' % (climb[0], climb[-1]))
        steps = [b - a for a, b in zip(climb, climb[1:])]
        res.check(max(steps) < 0.10,
                  'and it CLIMBS rather than snapping - no single step is most of the way',
                  'largest step %.3f' % max(steps))

        # It must also not unwind past the floor. The first version of this check
        # let a deep fall unwind for five seconds and asserted it was still above
        # 0.5 - and it rested at 0.823, which is nowhere near the floor. That would
        # have passed with the floor ignored completely: it was measuring that the
        # unwind is slow, not that it stops. So it starts JUST above the floor, where
        # the only thing that can hold it is the floor itself.
        page.evaluate(SNOW_FIRST, 'TUNDRA')
        page.wait_for_timeout(900)
        page.evaluate(STOP_JUST_ABOVE)
        deep0 = page.evaluate(READ_SETTLE)
        rest = []
        for _ in range(14):
            page.wait_for_timeout(300)
            rest.append(page.evaluate(HOLD_DRY))
        print('      settle unwinding: %.3f -> %s' % (deep0, ' '.join('%.3f' % v for v in rest[-6:])))
        res.check(rest[0] < deep0, 'a fall on top of the floor does unwind',
                  '%.3f -> %.3f' % (deep0, rest[0]))
        # NEVER BELOW, rather than exactly at. It rests a little above the floor
        # because a tundra's own weather timer keeps putting snow back during the
        # reading - snow chance 0.62 - and that is the game working, not the check
        # failing. What the floor claims is that nothing takes the ground below it,
        # so that is what is asserted, over every sample rather than the last one.
        # AGAINST THE OWNER'S NUMBER, not against whatever the engine reports. Read
        # from `floors` this compared `min(rest) >= 0 - 0.02` on a build with the
        # floor deleted, which is true of anything - the check switched itself off
        # exactly when its subject went missing. 0.50 is the ruling; it is written
        # here so the assertion cannot be neutralised by the fault it tests for.
        res.check(min(rest) >= 0.48,
                  'and nothing takes it below the 50% the owner asked for, at any point',
                  'lowest %.3f' % min(rest))
        res.check(abs(rest[-1] - rest[-4]) < 0.01,
                  'and it settles rather than still sliding',
                  '%.3f then %.3f, four samples apart' % (rest[-4], rest[-1]))
        # AND THE SAME START WITHOUT A FLOOR MUST NOT STOP. If it did, this would be
        # measuring the unwind running out rather than the floor holding it.
        page.evaluate(SNOW_FIRST, 'DESERT')
        page.wait_for_timeout(900)
        page.evaluate(STOP_JUST_ABOVE)
        noFloor = []
        for _ in range(14):
            page.wait_for_timeout(300)
            noFloor.append(page.evaluate(HOLD_DRY))
        print('      the same, in a place with no floor: %s'
              % ' '.join('%.3f' % v for v in noFloor[-6:]))
        res.check(min(noFloor) < 0.47,
                  'in a place with no floor the same snow goes straight past that level, '
                  'so the floor is what held it',
                  'desert reached %.3f, tundra never below %.3f' % (min(noFloor), min(rest)))
        grip_tundra = page.evaluate(GRIP_IN_TUNDRA)
        page.evaluate(DRY_DESERT)
        page.wait_for_timeout(300)
        grip_desert = page.evaluate("() => window.__probe.road.wetGrip()")
        res.check(grip_tundra < grip_desert - 0.05,
                  'and the tundra is permanently slipperier for it, with nothing added to say so',
                  'tundra %.3f, dry desert %.3f' % (grip_tundra, grip_desert))

        # ------------------------------------ the roadside is lit by the hour
        print()
        print('  THE ROADSIDE TAKES THE HOUR, not only the horizon')
        # The scenery sprites bake their colours, so without a rebuild keyed to the
        # hour a tree stays a daylight tree at midnight. Measured as the mean colour
        # of the built sprite, because the eye is not reliable here: the same rock
        # that measures (64,72,93) at night READS as pale against a very dark sky,
        # and chasing that impression cost a round of probing before the numbers
        # settled it.
        lightness = {}
        for label, ph in (('midday', 0.75), ('night', 0.25)):
            page.evaluate('(v) => window.__probe.road.setPhase(v)', ph)
            page.wait_for_timeout(250)
            rock = page.evaluate("() => window.__probe.road.sceneryPixel('MOUNTAIN', 0)")
            tree = page.evaluate("() => window.__probe.road.sceneryPixel('FOREST', 0)")
            sky = page.evaluate("() => window.__probe.road.skylinePixel('MOUNTAIN')")
            # NOT named `lum`: there is a module-level lum() used earlier in this
            # function, and assigning the name here makes it local for the WHOLE
            # function - so the earlier call died with an unbound local.
            bright = lambda c: 0.2126*c['r'] + 0.7152*c['g'] + 0.0722*c['b']
            lightness[label] = (bright(rock), bright(tree), bright(sky))
            print('      %-8s rock %.1f   tree %.1f   skyline %.1f' % ((label,) + lightness[label]))
        res.check(lightness['night'][0] < lightness['midday'][0] - 8,
                  'the roadside rock is darker at night than at midday',
                  '%.1f vs %.1f' % (lightness['night'][0], lightness['midday'][0]))
        res.check(lightness['night'][1] < lightness['midday'][1] - 4,
                  'and so is the forest',
                  '%.1f vs %.1f' % (lightness['night'][1], lightness['midday'][1]))
        res.check(lightness['night'][2] < lightness['midday'][2],
                  'and the skyline behind them, which is what made the mismatch visible',
                  '%.1f vs %.1f' % (lightness['night'][2], lightness['midday'][2]))
        page.evaluate('() => window.__probe.road.setPhase(0.75)')

        # ------------------------------- the road widens and the cars do not
        print()
        print('  A WIDER ROAD, THE SAME CARS')
        # The owner widened the road to make the lanes bigger and got everything
        # scaled up instead, because a vehicle's width was a fraction of ROAD. The
        # car's drawn width must not move when the road does; the road's must.
        sizes = {}
        for road in (1900, 2300, 3000):
            page.evaluate('(r) => window.__probe.road.setRoadHalfWidth(r)', road)
            page.wait_for_timeout(220)
            got = page.evaluate(CAR_AND_ROAD)
            sizes[road] = got
            print('      ROAD %-6d car %-8s road edge %-8s' % (road, got['car'], got['edge']))
        cars = [sizes[r]['car'] for r in (1900, 2300, 3000)]
        edges = [sizes[r]['edge'] for r in (1900, 2300, 3000)]
        res.check(cars[0] and max(cars) - min(cars) < 0.5,
                  'the player car is the same width at every road width',
                  ' '.join(str(c) for c in cars))
        res.check(edges[0] and edges[2] > edges[0] * 1.3,
                  'while the road itself is visibly wider - so the check is not vacuous',
                  ' '.join(str(e) for e in edges))
        page.evaluate('(r) => window.__probe.road.setRoadHalfWidth(r)', 2300)

        # ------------------------------- a beam is only visible in the dark
        print()
        print('  HEADLIGHT BEAMS FOLLOW THE CLOCK, NOT THE WEATHER')
        # The owner saw beams on the road at midday and guessed it was the rain.
        # It was: lampsOn() treats weather as night by their own earlier ruling, so
        # a shower at noon switched the beams on. The LAMPS should still do that -
        # everyone drives with lights on in rain - but the pool of light lying on
        # the tarmac is invisible in daylight however wet it is.
        page.evaluate('() => window.__probe.road.setPhase(0.75)')
        page.evaluate("() => { const R = window.__probe.road; R.setSnow(0); R.setWet(1); }")
        page.wait_for_timeout(250)
        noon = page.evaluate('() => window.__probe.road.lightLevels()')
        page.evaluate('() => window.__probe.road.setPhase(0.25)')
        page.wait_for_timeout(250)
        dark = page.evaluate('() => window.__probe.road.lightLevels()')
        print('      midday in heavy rain: lamps %.2f  beam %.2f' % (noon['lamps'], noon['clock']))
        print('      midnight, same rain:  lamps %.2f  beam %.2f' % (dark['lamps'], dark['clock']))
        res.check(noon['lamps'] > 0.5,
                  'the LAMPS still come on in daytime rain, which is the owner ruling that stands',
                  '%.2f' % noon['lamps'])
        res.check(noon['clock'] < 0.04,
                  'but the BEAM does not - a light pool is invisible at noon however wet it is',
                  '%.2f' % noon['clock'])
        res.check(dark['clock'] > 0.5, 'and at night the beam is on',
                  '%.2f' % dark['clock'])
        page.evaluate("() => { const R = window.__probe.road; R.setWet(0); R.setPool(0); R.setPhase(0.75); }")

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
