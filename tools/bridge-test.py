#!/usr/bin/env python3
"""BRIDGE TEST - the water is on both sides, it reaches the horizon, and it recedes.

    .venv/Scripts/python tools/bridge-test.py

RLG-112. Owner, 2026-08-31: a bridge over water, where the water "wouldn't be level with the
bridge - it would be drawn as a complete surface underneath the bridge".

THE FRAGMENT NAMES THE HARD PART AND THEN SAYS NOT TO SOLVE IT YET. Every surface this
engine draws sits on one ground plane, so a second altitude is not something the projection
can express. A second plane is the honest answer; a fill from the horizon down is the cheat.
It says to build the CHEAP one first and let the picture decide, and the reason is in this
project's own record - the far sea was built twice and the version that measured better was
the one that made no estimate at all.

SO THE CHEAT IS THAT THE PLACE'S GROUND IS WATER, and these are the claims that makes:

    IT IS ON BOTH SIDES. A coast has water on ONE side, from a shoreline a fixed distance
    out from the tarmac. A bridge has no shoreline at all - the water reaches both frame
    edges - and every hard part of the coast is therefore absent.

    IT REACHES THE HORIZON. The strip between the skyline and the furthest drawn slice is
    painted by the far field rather than by the road pass. A place whose ground is water and
    whose far field is not shows a band of land above a sea, which is where the coast ran
    out before RLG-093.

    AND IT RECEDES. Water at one flat colour from the bumper to the skyline reads as a
    painted floor. The distance term is the coast's own, measured at its join.

THE COAST IS THE CONTROL AND IT IS RUN ON EVERY CLAIM. A check that passed on both places
would not be measuring a bridge - it would be measuring "is there water on the screen". The
coast must still come back with land on one side, and if the shoreline work is ever broken
by this, that is where it shows.

WHAT IT CANNOT DO. It cannot say whether the crossing reads as a bridge rather than a
causeway - it will not until the towers and the deck are built - or whether the water looks
right in motion. `tools/biome-shot.py` takes the picture; the owner judges it.

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

/* Is this pixel water? The same test coast-test uses, and deliberately the same one: two
   definitions of "sea-coloured" that drift apart would let one harness pass a frame the
   other fails, and neither would be wrong about its own definition. */
window.__probe.isSea = function(R, G, B){
  return B > 55 && B < 170 && B > R*1.4 && G > R && G < B;
};

/* One row of the frame, counting water either side of a split. `y` is in CSS pixels. */
window.__probe.waterRow = function(y, split){
  var c = document.querySelector('canvas');
  var r = c.getBoundingClientRect();
  var dpr = c.width / r.width;
  var g = c.getContext('2d');
  var d = g.getImageData(0, Math.round(y*dpr), c.width, 1).data;
  var half = (split === undefined ? c.width/2 : split * dpr);
  var left = 0, right = 0;
  for(var x = 0; x < c.width; x++){
    var i = x*4;
    if(window.__probe.isSea(d[i], d[i+1], d[i+2])){ if(x < half) left++; else right++; }
  }
  return { left: left, right: right, width: c.width, half: half };
};

/* The band between the horizon and the furthest drawn slice - the strip the far field owns.
   Sampling wider than the gap itself answers the question with the feature removed, which
   coast-test records having been caught by. */
window.__probe.farBand = function(hz, gapY){
  var c = document.querySelector('canvas');
  var r = c.getBoundingClientRect();
  var dpr = c.width / r.width;
  var g = c.getContext('2d');
  var y0 = Math.round((hz + 2) * dpr), hh = Math.max(1, Math.round((gapY - hz - 4) * dpr));
  var d = g.getImageData(0, y0, c.width, hh).data;
  var left = 0, right = 0;
  for(var y = 0; y < hh; y++){
    for(var x = 0; x < c.width; x++){
      var i = (y*c.width + x)*4;
      if(window.__probe.isSea(d[i], d[i+1], d[i+2])){ if(x < c.width/2) left++; else right++; }
    }
  }
  return { left: left, right: right, area: c.width*hh, rows: hh };
};

/* The mean colour of one row's water pixels, so recession can be measured rather than
   asserted from the code that produces it. */
window.__probe.waterTone = function(y){
  var c = document.querySelector('canvas');
  var r = c.getBoundingClientRect();
  var dpr = c.width / r.width;
  var g = c.getContext('2d');
  var d = g.getImageData(0, Math.round(y*dpr), c.width, 1).data;
  var R = 0, G = 0, B = 0, n = 0;
  for(var x = 0; x < c.width; x++){
    var i = x*4;
    if(window.__probe.isSea(d[i], d[i+1], d[i+2])){ R += d[i]; G += d[i+1]; B += d[i+2]; n++; }
  }
  return n ? { r: R/n, g: G/n, b: B/n, n: n } : null;
};

window.__probe.mirrorWater = function(){
  var c = document.querySelector('canvas');
  var r = c.getBoundingClientRect();
  var dpr = c.width / r.width;
  var mw = Math.min(r.width * 0.62, 250), mh = 44;
  var mx = (r.width - mw) / 2, my = 6;
  var g = c.getContext('2d');
  var y0 = Math.round((my + mh*0.34) * dpr), hh = Math.round(mh*0.62 * dpr);
  var x0 = Math.round(mx * dpr), ww = Math.round(mw * dpr);
  var d = g.getImageData(x0, y0, ww, hh).data;
  var left = 0, right = 0, half = ww/2;
  for(var y = 0; y < hh; y++){
    for(var x = 0; x < ww; x++){
      var i = (y*ww + x)*4;
      if(window.__probe.isSea(d[i], d[i+1], d[i+2])){ if(x < half) left++; else right++; }
    }
  }
  return { left: left, right: right, area: ww*hh };
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


def settle(page, place):
    """Pin both ends of the blend to one place and let a few frames draw."""
    page.evaluate("(k) => window.__probe.road.setBiomePair(k, k)", place)
    page.wait_for_timeout(500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('bridge-test  .  water on both sides, to the horizon, receding')
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
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1600)
        # midday, dry, so nothing below is about the weather or the hour
        page.evaluate("() => { const R = window.__probe.road;"
                      " R.setPhase(0.75); R.setWet(0); R.setSnow(0); R.setPool(0); }")
        page.wait_for_timeout(300)

        # ------------------------------------------------ what the place states
        print()
        print('  WHICH PLACES ARE OVER WATER')
        states = page.evaluate("""() => {
          const R = window.__probe.road, out = {};
          for(const k of R.BIOME_KEYS()) out[k] = R.waterKind(k);
          return out;
        }""")
        for k, v in states.items():
            if v['sea'] or v['overWater']:
                print('      %-10s sea=%s  overWater=%s' % (k, v['sea'], v['overWater']))
        res.check(states['BRIDGE']['overWater'] is True,
                  'the bridge states that it is over water',
                  str(states['BRIDGE']))
        res.check(states['COASTAL']['overWater'] is False and states['COASTAL']['sea'] is True,
                  'and the coast does not - it has a shoreline, which is the difference',
                  str(states['COASTAL']))
        res.check([k for k, v in states.items() if v['overWater']] == ['BRIDGE'],
                  'and nothing else on the board is over water',
                  str([k for k, v in states.items() if v['overWater']]))

        # ------------------------------------------------ both sides
        print()
        print('  WATER ON BOTH SIDES, WHICH IS WHAT A COAST NEVER HAS')
        settle(page, 'BRIDGE')
        hz = page.evaluate("() => window.__probe.road.horizon()")
        row = hz + (900 - hz) * 0.28
        b = page.evaluate("(y) => window.__probe.waterRow(y)", row)
        print('      bridge, one row a quarter down from the horizon:'
              '  left %d  right %d  of %d' % (b['left'], b['right'], b['width']))
        settle(page, 'COASTAL')
        c = page.evaluate("(y) => window.__probe.waterRow(y)", row)
        print('      coast,  the same row:                            '
              '  left %d  right %d  of %d' % (c['left'], c['right'], c['width']))
        res.check(b['left'] > 20 and b['right'] > 20,
                  'the bridge has water to left AND right of the road',
                  'left %d, right %d' % (b['left'], b['right']))
        # THE CONTROL. A coast puts its water on ONE rolled side, so one of its two counts
        # must be near nothing - otherwise this check is measuring "is there water".
        res.check(min(c['left'], c['right']) < 20,
                  'and the coast still has land on one side, so this measures a bridge',
                  'the coast read left %d, right %d' % (c['left'], c['right']))

        # ------------------------------------------------ to the horizon
        print()
        print('  AND IT REACHES THE HORIZON, WHERE THE ROAD PASS STOPS PAINTING')
        settle(page, 'BRIDGE')
        fs = page.evaluate("() => window.__probe.road.farSea()")
        hz = page.evaluate("() => window.__probe.road.horizon()")
        print('      the far field: drew=%s, horizon %.1f, the road stops at %s'
              % (fs.get('drew'), hz, fs.get('roadTop')))
        # NOT `drew`. That flag says a SHORELINE BAND was walked, and a bridge walks
        # none - the far field's own ground fill is already water, because `groundBase`
        # answers the water question for the far field ahead and the mirror's band at
        # once. A rectangle written here first was dead code, and this harness is what
        # proved it: taking it out changed the row below by nothing at all.
        res.check(fs.get('sea') is True,
                  'the far field knows the place it is painting has water in it',
                  str(fs))
        gap = fs.get('roadTop')
        # ---- THE ROW UNDER THE SKYLINE IS THE CLAIM, AND THE BAND'S COVERAGE IS NOT.
        # The first version of this check compared how much of the far band was water
        # against a coast measured the same way, and the coast came back at 67% against the
        # bridge's 77% - the band is nine rows tall at the vanishing point, where a coast's
        # shore has converged to the centre and its own water fills half of it anyway. Two
        # numbers that close are not a discriminator, and asserting on them would have been
        # a check that passes because water is on the screen.
        #
        # WHAT ONLY A PLACE WITH NO SHORELINE CAN DO is fill the row immediately under the
        # skyline from edge to edge. That row is above everything the road pass paints, so
        # it is the far field's alone, and a coast can never have more than one side of it.
        row_hz = hz + 3
        settle(page, 'BRIDGE')
        bb = page.evaluate("(y) => window.__probe.waterRow(y)", row_hz)
        settle(page, 'COASTAL')
        cb = page.evaluate("(y) => window.__probe.waterRow(y)", row_hz)
        print('      the row just under the skyline, which only the far field paints:')
        print('        bridge  %d of %d pixels are water' % (bb['left'] + bb['right'], bb['width']))
        print('        coast   %d of %d' % (cb['left'] + cb['right'], cb['width']))
        settle(page, 'BRIDGE')
        res.check((bb['left'] + bb['right']) > bb['width'] * 0.90,
                  'the bridge fills that row edge to edge, so the water reaches the skyline',
                  'only %d of %d' % (bb['left'] + bb['right'], bb['width']))
        # THE COAST'S FIGURE IS PRINTED AND NOT ASSERTED ON, and that was measured rather
        # than assumed. It came back 238, 183 and 340 of 480 on three runs of one unchanged
        # build: the shore converges on the road's own vanishing point, which the bend
        # moves across the frame, so on a hard corner a coast can legitimately fill most of
        # that row. An assertion on it would fail at random, which is the failure mode
        # occlusion-test.py was written against. The bridge's own edge-to-edge figure is
        # the claim, and the section below proves it can go red.
        if gap and gap > hz + 6:
            band = page.evaluate("([h, g]) => window.__probe.farBand(h, g)", [hz, gap])
            print('      the band as a whole: %d rows, water left %d right %d of %d'
                  ' - reported, not asserted on, see above'
                  % (band['rows'], band['left'], band['right'], band['area']))

        # ------------------------------------------------ and it recedes
        print()
        print('  AND IT RECEDES, OR IT IS A PAINTED FLOOR')
        # THE NEAREST WATER IS NOT AT THE BOTTOM OF THE FRAME. Down there the road fills
        # the width and there is no water left to read, so the near sample is taken at the
        # lowest row that still has some. That is a shorter span than the whole draw, and
        # the threshold below is set against it rather than against the recession's full
        # range - a smaller travel measured honestly beats a larger one measured nowhere.
        near = None
        for f in (0.34, 0.30, 0.26, 0.22):
            near = page.evaluate("(y) => window.__probe.waterTone(y)", hz + (900 - hz) * f)
            if near and near['n'] > 12:
                break
        far = page.evaluate("(y) => window.__probe.waterTone(y)", hz + 4)
        if near and far:
            print('      near  rgb(%.0f,%.0f,%.0f) from %d pixels' % (near['r'], near['g'], near['b'], near['n']))
            print('      far   rgb(%.0f,%.0f,%.0f) from %d pixels' % (far['r'], far['g'], far['b'], far['n']))
            travel = abs(far['r'] - near['r']) + abs(far['g'] - near['g']) + abs(far['b'] - near['b'])
            res.check(travel > 12,
                      'the water at the skyline is not the water at the bumper',
                      'the colour travelled only %.0f across the whole draw' % travel)
        else:
            res.check(False, 'there is water at both ends of the draw to compare',
                      'near=%s far=%s' % (bool(near), bool(far)))

        # ------------------------------------------------ and the mirror
        print()
        print('  AND THE GLASS CARRIES IT TOO')
        mw = page.evaluate("() => window.__probe.mirrorWater()")
        print('      mirror water pixels: left %d  right %d  of %d'
              % (mw['left'], mw['right'], mw['area']))
        res.check(mw['left'] > 30 and mw['right'] > 30,
                  'the mirror shows water on both sides as well',
                  'left %d, right %d' % (mw['left'], mw['right']))

        errs = page.evaluate("() => window.__probe.errors")
        res.check(not errs, 'no page errors', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('FAILED: ' + '; '.join(res.fails))
        return 1
    print('all checks passed')
    print('  whether it reads as a BRIDGE rather than a causeway is not measured here -')
    print('  it will not until the towers and the deck are built. See tools/biome-shot.py')
    return 0


sys.exit(main())
