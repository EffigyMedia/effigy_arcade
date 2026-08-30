#!/usr/bin/env python3
"""
GATE TEST - the shifter holds the gears the car has, and no others.

    .venv/Scripts/python tools/gate-test.py

RLG-069. The gate drew three rails and six slots for every car, and the knob's travel was clamped to
the length of the rail table rather than to the car - so a four-speed could be dragged into slots
labelled 5 and 6, and `gearFactor` returns zero past the end of the ratio table, which means the car
stopped pulling in a gear it does not have.

IT WALKS THE GATE WITH THE GAME'S OWN `shiftStep`. A harness that reimplemented the H-pattern would
prove only that the harness agrees with itself; this calls the function the thumb calls and reads
the gear that came out.

AND IT NEEDS A TOUCH CONTEXT. The shell adds `no-touch` to the body when the device reports no touch
and the whole thumb cluster is `display:none` under it - a desktop context measures a plate 0 pixels
wide and reports success.

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

# every slot the knob can be walked to, as (right-steps, down-steps) from the top of rail 0.
# The H is the point: you cannot go sideways except through the middle, so reaching rail 2
# means centre, right, right, then up or down.
WALK = """(n) => {
  const R = window.__probe.road;
  /* BACK TO A KNOWN PLACE, AND THE ORDER MATTERS. Sideways only works from the centre of
     the H, so a walk that goes left first from the top of a rail does nothing at all and
     then reports whichever rail it was already on as rail 0. Two ups guarantee the top
     whatever the knob was doing, one down puts it on the cross rail, and only then does
     left mean anything. */
  R.shift(0, -1); R.shift(0, -1); R.shift(0, 1);
  for(let i = 0; i < 6; i++) R.shift(-1, 0);
  R.shift(0, -1);
  const seen = [];
  /* every rail the knob will go to, and both ends of each */
  for(let rail = 0; rail < 4; rail++){
    if(rail){ R.shift(0, 1); R.shift(0, -1); /* to the centre */ R.shift(1, 0); }
    R.shift(0, -1);  const up = R.gate();
    R.shift(0, 1); R.shift(0, 1); const dn = R.gate();
    seen.push({ rail: up.rail, up: up.gear, down: dn.gear });
    R.shift(0, -1);  /* back to the centre for the next move across */
  }
  return seen;
}"""


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
    ap.add_argument('--cars', default='LORRY,VAN,MUSCLE,ROADSTER,TUNER,CRUISER,SUPERCRUISER')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('gate-test  .  the gate holds the gears the car has')
    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_context(viewport={'width': 480, 'height': 900},
                                   has_touch=True, is_mobile=True).new_page()
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
        for _ in range(4):
            if page.eval_on_selector('[data-act="box"] b',
                                     'el => el.textContent').strip().startswith('MANUAL'):
                break
            page.click('[data-act="box"]')
            page.wait_for_timeout(80)
        res.check(page.eval_on_selector('[data-act="box"] b',
                                        'el => el.textContent').strip().startswith('MANUAL'),
                  'the manual gearbox can be selected')
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1000)

        g0 = page.evaluate('() => window.__probe.road.gate()')
        res.check(g0['manual'] and g0['plateW'] > 0,
                  'the gate is drawn on a touch device', str(g0))

        worst, widths = [], {}
        for key in args.cars.split(','):
            page.evaluate('(k) => window.__probe.road.setBody(k)', key)
            page.wait_for_timeout(140)
            g = page.evaluate('() => window.__probe.road.gate()')
            seen = page.evaluate(WALK, None)
            reach = sorted({s['up'] for s in seen} | {s['down'] for s in seen})
            gears = g['gears']
            top = max(reach)
            print('      %-13s %d-speed  %d rails  plate %.0fpx  reaches %s'
                  % (key, gears, g['rails'], g['plateW'], reach))
            # 0 is neutral and is always reachable; no gear above what the car has may be
            if top > gears:
                worst.append('%s (%d-speed) reaches %d' % (key, gears, top))
            # and every gear the car HAS must be reachable, or the gate has lost one
            missing = [n for n in range(1, gears + 1) if n not in reach]
            if missing:
                worst.append('%s (%d-speed) cannot reach %s' % (key, gears, missing))
            # the plate follows the rails, and the comparison is between plates rather than
            # against a number: the element carries the UI scale, so its measured width is
            # not the width in the stylesheet.
            widths.setdefault(g['rails'], []).append((key, g['plateW']))

        res.check(not worst, 'no car reaches a gear it does not have, and none loses one',
                  '; '.join(worst))
        two = [w for _, w in widths.get(2, [])]
        three = [w for _, w in widths.get(3, [])]
        res.check(len(set(two)) <= 1 and len(set(three)) <= 1,
                  'every plate with the same rails is the same size', str(widths))
        res.check(bool(two) and bool(three) and max(two) < min(three),
                  'a two-rail plate is smaller than a three-rail one',
                  '%s against %s' % (two, three))

        # and the five-speed's sixth slot is NEUTRAL rather than a sixth gear
        page.evaluate('() => window.__probe.road.setBody("ROADSTER")')
        page.wait_for_timeout(140)
        seen5 = page.evaluate(WALK, None)
        last = [s for s in seen5 if s['rail'] == 2]
        res.check(bool(last) and last[0]['up'] == 5 and last[0]['down'] == 0,
                  'a five-speed has fifth at the top of the third rail and neutral below it',
                  str(last))

        # a four-speed cannot get onto the third rail at all
        page.evaluate('() => window.__probe.road.setBody("MUSCLE")')
        page.wait_for_timeout(140)
        seen4 = page.evaluate(WALK, None)
        res.check(max(s['rail'] for s in seen4) == 1,
                  'a four-speed knob never leaves the two rails it has',
                  str(sorted({s['rail'] for s in seen4})))

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()
    httpd.shutdown()
    print(('\n%d check(s) failed' % len(res.fails)) if res.fails else '\nall checks passed')
    return 1 if res.fails else 0


if __name__ == '__main__':
    sys.exit(main())
