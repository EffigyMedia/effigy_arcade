#!/usr/bin/env python3
"""
START TEST - the car is HELD on the line, not merely covered by a number.

    .venv/Scripts/python tools/start-test.py

RLG-088. Owner, 2026-08-30: hitting DRIVE should give a three, two, one, GO countdown, with some
flare.

THE FLARE IS NOT WHAT THIS CHECKS, and it cannot be. Whether a number lands with a punch is the
owner's eye on the device; what a harness can say is whether the countdown is TRUE. A countdown
drawn over a car that is already accelerating is a lie the first frame gives away, so this asks the
three questions that make it real:

  1. the car does not move while the count is up;
  2. the run clock does not start either, so the count is not eating the player's time;
  3. and it does release - the car moves afterwards, or the game has simply stopped.

AND IT ASKS WHETHER THE COUNT IS SKIPPABLE ONLY AFTER THE FIRST RUN, because a start that can be
hurried the very first time is a start most players never see, and one that can never be hurried is
a toll on the player who is enjoying it most.

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
    print('start-test  .  the car is held on the line')

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

        # ---- THE THROTTLE IS HELD DOWN THE WHOLE TIME ------------------------
        # This is what makes the hold a real question rather than an observation. A car
        # nobody is asking to move will sit still whether it is held or not, so the first
        # version of this check passed on a build with no countdown in it at all. The pedal
        # goes down before the count starts and stays down: the car must not move anyway,
        # and it must move the moment the count lets go.
        page.dispatch_event('#gas', 'pointerdown')

        # sample the whole count, from the frame after DRIVE to well past GO
        seen = []
        for _ in range(26):
            page.wait_for_timeout(160)
            seen.append(page.evaluate('() => window.__probe.road.startLine()'))

        held = [s for s in seen if s['left'] > 0]
        after = [s for s in seen if s['left'] <= 0 and s['go'] <= 0]
        res.check(len(held) >= 8,
                  'the count actually runs for about three seconds',
                  'only %d sample(s) had any count left' % len(held))
        if held:
            print('      the count ran from %.2f down to %.2f over %d samples'
                  % (held[0]['left'], held[-1]['left'], len(held)))

        # ---- 1. THE CAR IS HELD ----------------------------------------------
        moving = [s for s in held if s['spd'] > 0]
        res.check(not moving, 'the car does not move while the count is up',
                  'it reached %d mph-units with %.2f still to go'
                  % (max((s['spd'] for s in moving), default=0),
                     max((s['left'] for s in moving), default=0)))

        # AND THE ROAD DOES NOT PASS UNDER IT EITHER. Speed is what the engine reports;
        # distance is what actually happened. A hold that froze the readout while the world
        # kept moving would pass the check above and fail the player.
        if len(held) >= 2:
            crept = held[-1]['dist'] - held[0]['dist']
            print('      distance travelled during the count: %.4f miles' % crept)
            res.check(abs(crept) < 1e-6,
                      'and the road does not pass under it',
                      'it covered %.4f miles while held' % crept)

        # ---- 2. THE CLOCK DOES NOT START -------------------------------------
        if len(held) >= 2:
            lost = held[0]['clock'] - held[-1]['clock']
            print('      run clock during the count: %.2f to %.2f'
                  % (held[0]['clock'], held[-1]['clock']))
            res.check(abs(lost) < 0.05,
                      'and the count does not eat the run clock',
                      '%.2f seconds went while the car was held' % lost)

        # ---- 3. AND IT LETS GO -----------------------------------------------
        res.check(bool(after), 'the count ends', 'it never reached zero')
        res.check(any(s['spd'] > 0 for s in after),
                  'and the car moves once it does, on a throttle that was already down',
                  'still stationary %d sample(s) after GO' % len(after))
        if after:
            print('      with the pedal down throughout: 0 while held, %d after'
                  % max(s['spd'] for s in after))

        # ---- 4. THE PIPS FIRE ONCE EACH, NOT EVERY FRAME ----------------------
        pips = [s['pip'] for s in held]
        runs = [p for i, p in enumerate(pips) if i == 0 or p != pips[i-1]]
        print('      the numbers sounded in the order %s' % runs)
        res.check(runs == sorted(set(runs), reverse=True) and len(runs) == len(set(runs)),
                  'each number is sounded once, and they count down',
                  'the sequence was %s' % runs)

        # ---- 5. THE FIRST START IS SEEN WHOLE, THE NEXT CAN BE HURRIED --------
        # A start that can be skipped the very first time is a start most players never
        # see; one that can never be skipped is a toll on whoever is enjoying it most.
        first = seen[0]
        res.check(first['seen'] is False,
                  'the first count of a session cannot be hurried',
                  'the game already thought a start had been seen')
        later = [s for s in seen if s['seen']]
        res.check(bool(later), 'and it is remembered once it has been seen',
                  'no sample reported a start had been seen')

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()
    httpd.shutdown()
    print(('\n%d check(s) failed' % len(res.fails)) if res.fails else '\nall checks passed')
    return 1 if res.fails else 0


if __name__ == '__main__':
    sys.exit(main())
