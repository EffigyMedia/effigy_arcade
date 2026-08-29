#!/usr/bin/env python3
"""
WEATHER PAINT TEST - the weather is on the surfaces, not over the frame.

    .venv/Scripts/python tools/weather-test.py
    .venv/Scripts/python tools/weather-test.py --headed

RLG-057. Snow cover and rain darkening used to be screen-wide rectangles drawn after the road
and after the player, so the car got as snowed on as the ground it was standing on, and a hill a
quarter of a mile away got as wet as the tarmac under the wheels. The owner rejected the snow
half of that on sight. Both are painted per segment now, mixed into each surface's own colour.

WHAT MAKES THIS A TEST AND NOT A SCREENSHOT. Reading pixels off a live frame proves nothing in
this engine - the road scrolls, the sky turns, and the tarmac strobes light and dark by segment.
This project has been burnt by that already: `lamp-test.py` read 100% and then 35% on
consecutive runs of one unchanged build. So the world is stopped first. The car is parked at a
fixed `z` at zero speed with the sky pinned, and every reading comes from that frozen frame with
nothing changed between samples except the weather.

AND THE CHECK IS SHOWN TO FAIL. The assertion that carries this file is that the PLAYER'S CAR
does not change colour when the weather does - which is precisely what the rejected build got
wrong. A check nobody has watched fail is not evidence, so the last section puts the old
full-screen wash back through `CFG.afterDraw`, touching no game file, and asserts that the same
check goes red. If it does not, this harness is measuring nothing.

Exit code 0 if every check passed, 1 otherwise.
"""

import argparse
import functools
import http.server
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from harness import console_utf8, launch_chromium

ROOT = Path(__file__).resolve().parent.parent
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
        window.__probe.cfg = CFG;
        var api = real(CFG);
        window.__probe.road = api || (CFG && CFG.api) || null;
        return api;
      };
    }
  });
})();
window.addEventListener('error', function(e){ window.__probe.errors.push(String(e.message)); });

/* The mean colour of a box on the canvas, read out of the backing store. A screenshot would go
   through a PNG encode and the page's own scaling; these are the pixels the engine drew. */
window.__probe.sample = function(x, y, w, h){
  var c = document.querySelector('canvas');
  var g = c.getContext('2d');
  var d = g.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)),
                         Math.max(1, Math.round(h))).data;
  var r = 0, gg = 0, b = 0, n = d.length / 4;
  for(var i = 0; i < d.length; i += 4){ r += d[i]; gg += d[i+1]; b += d[i+2]; }
  return { r: r/n, g: gg/n, b: b/n, lum: (0.2126*r + 0.7152*gg + 0.0722*b) / n };
};
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


FREEZE = """() => {
  const R = window.__probe.road;
  R.jumpTo(12000);
  R.setLane(0);
  R.setSpd(0);
  R.setSky(0.2, 0);
  R.setWet(0);
  R.setSnow(0);
}"""

GEO = """() => {
  const R = window.__probe.road, c = document.querySelector('canvas');
  return { W: c.width, H: c.height, horizon: R.horizon(), player: R.playerScreen() };
}"""

SAMPLE = """(spots) => {
  const S = window.__probe.sample, out = {};
  for(const k in spots){ const b = spots[k]; out[k] = S(b[0], b[1], b[2], b[3]); }
  return out;
}"""


def spots_for(geo):
    """Where to read. The car's rectangle comes from the engine, never from a guess.

    `playerScreen` is {x: centre, y: BOTTOM, w, h} - the sprite is drawn at (-w/2, -h) - so the
    bodywork box is taken above `y` rather than around it.
    """
    W, H, hz = geo['W'], geo['H'], geo['horizon']
    ground = H - hz
    out = {
        # tarmac, up the road and well clear of the car
        'road':  [W*0.45, hz + ground*0.42, W*0.10, ground*0.06],
        # the land at the edge of the frame, which is ground and never road
        'verge': [W*0.01, hz + ground*0.42, W*0.06, ground*0.06],
        # the band between the furthest drawn slice and the horizon
        'far':   [W*0.30, hz + ground*0.015, W*0.40, ground*0.025],
        # sky, which nothing painted on the ground may reach
        'sky':   [W*0.30, hz*0.40, W*0.40, hz*0.12],
    }
    p = geo['player']
    if p and p.get('w'):
        out['car'] = [p['x'] - p['w']*0.18, p['y'] - p['h']*0.62,
                      p['w']*0.36, p['h']*0.24]
        # TARMAC AT THE CAR'S OWN FEET, taken beside it rather than at a guessed
        # depth. A wet road is dark where you look down at it and bright where
        # you look along it, so one road sample cannot judge rain: this is the
        # near end, and `road` above is the far one.
        out['roadNear'] = [p['x'] + p['w']*0.62, p['y'] - p['h']*0.16,
                           p['w']*0.45, p['h']*0.12]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('weather-test  .  the weather is on the surfaces, not over the frame')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_page(viewport={'width': 480, 'height': 900})
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller',
                timeout=5000)
            page.wait_for_timeout(1200)
        except Exception:
            pass
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1600)

        def settle_frame():
            page.evaluate(FREEZE)
            page.wait_for_timeout(450)

        def weather(wet, snow):
            page.evaluate("([w, s]) => { const R = window.__probe.road;"
                          " R.setSpd(0); R.setWet(w); R.setSnow(s); }", [wet, snow])
            page.wait_for_timeout(400)
            st = page.evaluate("() => { const R = window.__probe.road;"
                               " return { wet: R.wet(), snowy: R.snowy(), settle: R.settle(),"
                               " pool: R.pool(), biome: R.biome(), phase: R.phase() }; }")
            # PRINT WHAT WAS ACTUALLY SET. `setWet` and `setSnow` write variables the weather
            # timer also writes, so a reading taken on trust can be a reading of a state the
            # engine moved out from under the test.
            print('        state: wet %(wet)s  snowy %(snowy)s  settle %(settle)s'
                  '  pool %(pool)s  biome %(biome)s  phase %(phase)s' % st)
            return st

        settle_frame()
        geo = page.evaluate(GEO)
        res.check(bool(geo['player']), 'the engine reports where the player is drawn',
                  str(geo['player'])[:120])
        spots = spots_for(geo)
        res.check('car' in spots, 'the car has a rectangle to read from', str(sorted(spots)))
        dry = page.evaluate(SAMPLE, spots)

        print()
        print('  SNOW - the cover follows the ground')
        weather(0.9, 1.0)
        snow = page.evaluate(SAMPLE, spots)
        d = lambda k: snow[k]['lum'] - dry[k]['lum']
        res.check(d('verge') > 24, 'the ground brightens under full cover',
                  '%.1f -> %.1f' % (dry['verge']['lum'], snow['verge']['lum']))
        res.check(d('road') > 14, 'the road surface brightens with it',
                  '%.1f -> %.1f' % (dry['road']['lum'], snow['road']['lum']))
        res.check(d('far') > 14, 'the band under the horizon brightens too',
                  '%.1f -> %.1f' % (dry['far']['lum'], snow['far']['lum']))
        res.check(snow['road']['lum'] < snow['verge']['lum'],
                  'the road stays darker than the land, so the corridor is still readable',
                  'road %.1f vs verge %.1f' % (snow['road']['lum'], snow['verge']['lum']))
        res.check(abs(d('car')) < 6,
                  'the car is NOT snowed on - the cover is ground, not a wash over the frame',
                  '%.1f -> %.1f' % (dry['car']['lum'], snow['car']['lum']))
        res.check(abs(d('sky')) < 6, 'the sky is not touched by cover on the ground',
                  '%.1f -> %.1f' % (dry['sky']['lum'], snow['sky']['lum']))

        print()
        print('  RAIN - the darkening is on the slices')
        weather(0, 0)
        page.evaluate('() => window.__probe.road.setPool(0)')
        page.wait_for_timeout(300)
        base = page.evaluate(SAMPLE, spots)
        weather(1.0, 0)
        # the water is put on the road directly rather than waited for. Seventeen
        # seconds of real rain is what it takes to reach this, and a harness that
        # waits for it is a harness nobody runs.
        page.evaluate('() => window.__probe.road.setPool(1)')
        page.wait_for_timeout(300)
        # printed again, because the line above changed the state after the last
        # one was reported and a reader would otherwise credit the reading to the
        # wrong weather
        print('        state: ' + str(page.evaluate(
            "() => { const R = window.__probe.road;"
            " return 'wet ' + R.wet() + '  pool ' + R.pool() + '  grip ' + R.wetGrip(); }")))
        rain = page.evaluate(SAMPLE, spots)
        w = lambda k: rain[k]['lum'] - base[k]['lum']
        res.check(w('roadNear') < -4, 'the tarmac at the car soaks and goes dark',
                  '%.1f -> %.1f' % (base['roadNear']['lum'], rain['roadNear']['lum']))
        res.check(w('verge') < -3, 'the land darkens with it',
                  '%.1f -> %.1f' % (base['verge']['lum'], rain['verge']['lum']))
        res.check(w('roadNear') < w('road'),
                  'and the far road gives the sky back, so it loses less light than the near',
                  'near %.1f vs far %.1f' % (w('roadNear'), w('road')))
        res.check(abs(w('car')) < 8,
                  'the car is NOT painted with the road it is standing on',
                  '%.1f -> %.1f' % (base['car']['lum'], rain['car']['lum']))
        res.check(abs(w('sky')) < 4, 'and the sky above the horizon is left alone',
                  '%.1f -> %.1f' % (base['sky']['lum'], rain['sky']['lum']))

        print()
        print('  ACCUMULATION - both weathers build over time and unwind again')

        def slope(reader, seconds=3.0):
            a = page.evaluate(reader)
            time.sleep(seconds)
            b = page.evaluate(reader)
            return (b - a) / seconds, a, b

        def grip():
            return page.evaluate('() => window.__probe.road.wetGrip()')

        SETTLE = '() => window.__probe.road.settle()'
        POOL = '() => window.__probe.road.pool()'

        for name, reader, start, rate_floor in (
                ('snow', SETTLE, "() => { const R = window.__probe.road;"
                                 " R.setSnow(0.30); R.setWet(0.80); }", 0.010),
                ('rain', POOL, "() => { const R = window.__probe.road;"
                               " R.setSnow(0); R.setPool(0.30); R.setWet(0.80); }", 0.020)):
            page.evaluate(start)
            page.wait_for_timeout(400)
            up, u0, u1 = slope(reader)
            slick_building = grip()
            page.evaluate('() => window.__probe.road.setWet(0)')
            page.wait_for_timeout(400)
            # `slope` is signed and an unwind runs downhill, so the rate is its
            # negation. Comparing the raw value asserted that a falling number was
            # rising, which is a check that can only ever fail.
            fall, d0, d1 = slope(reader)
            down = -fall
            slick_after = grip()
            # rain runs off about twice as fast as snow melts, so each weather is
            # asked about its OWN ratio rather than about one shared number
            want = 1.0 if name == 'snow' else 2.0
            res.check(up > rate_floor, '%s: it builds while it falls' % name,
                      '%.4f/s, %s to %s' % (up, u0, u1))
            res.check(down > rate_floor, '%s: and it unwinds once it stops' % name,
                      '%.4f/s, %s to %s' % (down, d0, d1))
            res.check(up > 0 and abs(down - up*want) < up*want*0.35,
                      '%s: it comes off at the rate it went on' % name,
                      'up %.4f/s, down %.4f/s, wanted %.1fx' % (up, down, want))
            res.check(slick_after > slick_building,
                      '%s: and the grip comes back as it goes' % name,
                      'grip %.3f while building, %.3f after' % (slick_building, slick_after))

        print()
        print('  DEEP IS WORSE THAN FALLING - what lies on the road is the hazard')
        for name, deep, shallow in (
                ('snow', "() => { const R = window.__probe.road; R.setWet(0.9); R.setSnow(1); }",
                         "() => { const R = window.__probe.road; R.setWet(0.9); R.setSnow(0.02); }"),
                ('rain', "() => { const R = window.__probe.road;"
                         " R.setSnow(0); R.setWet(0.9); R.setPool(1); }",
                         "() => { const R = window.__probe.road;"
                         " R.setSnow(0); R.setWet(0.9); R.setPool(0); }")):
            page.evaluate(shallow); page.wait_for_timeout(120)
            thin = grip()
            page.evaluate(deep); page.wait_for_timeout(120)
            thick = grip()
            res.check(thick < thin - 0.03,
                      '%s: a covered road is slipperier than the same weather falling' % name,
                      'falling only %.3f, lying %.3f' % (thin, thick))
            res.check(thick >= 0.34,
                      '%s: and it never takes the car away entirely' % name, '%.3f' % thick)

        print()
        print('  THE CHECK IS NOT VACUOUS - the old wash goes back and must be caught')
        page.evaluate("""() => {
          const R = window.__probe.road, cfg = window.__probe.cfg;
          window.__probe.priorAfter = cfg.afterDraw || null;
          cfg.afterDraw = function(g){
            /* the rejected build, restored: one screen-wide rectangle from the horizon down,
               painted over the road and over the car exactly as it used to be */
            const c = document.querySelector('canvas'), hz = R.horizon();
            g.fillStyle = 'rgba(228,238,252,0.55)';
            g.fillRect(0, hz, c.width, c.height - hz);
          };
        }""")
        weather(0.9, 1.0)
        washed = page.evaluate(SAMPLE, spots)
        moved = washed['car']['lum'] - dry['car']['lum']
        res.check(abs(moved) >= 6,
                  'with the old wash back the car reading moves, so the check above was real',
                  'car %.1f -> %.1f' % (dry['car']['lum'], washed['car']['lum']))
        page.evaluate("() => { window.__probe.cfg.afterDraw = window.__probe.priorAfter; }")

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors during the run', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('  %d FAILED: %s' % (len(res.fails), '; '.join(res.fails)))
        return 1
    print('  every check passes - the weather is painted on the geometry')
    return 0


if __name__ == '__main__':
    sys.exit(main())
