#!/usr/bin/env python3
"""
RETRY TEST - a retry starts a new run, not the last one continued.

    .venv/Scripts/python tools/retry-test.py

RLG-090. Owner, 2026-08-30: on a time-over, hitting RETRY carries state over into the new run - you
start in a dry biome with snow slipperiness still applied.

TWO PIECES OF STATE DISAGREEING IS WORSE THAN EITHER BEING WRONG. The place is fresh and the grip is
not, so the road looks like one thing and drives like another, and nothing on screen explains why
the car will not hold a line.

IT DIRTIES THE WORLD ON PURPOSE FIRST. A run that happened to be dry would start a clean run and
prove nothing, so the harness puts deep snow and a storm sky on the road itself, checks they are
really there, and only then starts the next run. That is the difference between testing the reset
and watching a run that had nothing to carry.

AND IT ASKS THE ENGINE WHAT A RUN OWNS RATHER THAN LISTING IT HERE. `worldState` reports exactly the
fields `freshWorld` clears, so a field added to the world is covered by this check without the check
being edited - which is the whole point of RLG-090, since three of these have now been found one
after another.

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

# ---- WHAT A CLEAN RUN MEANS, AND IT IS NOT "DRY" -------------------------
# This asserted a dry, clear sky, which was right while `freshWorld` zeroed everything and
# left the first roll to the drive. It is wrong now: a run ROLLS ITS OWN WEATHER at the
# reset, so that the player looks at the weather they are about to drive in rather than
# having it arrive on GO (RLG-090). A fresh run may legitimately start in snow.
#
# So the question is not whether the weather is off. It is whether the weather is the NEW
# run's own: nothing accumulated survives, what is falling is what this run rolled, and
# nothing is left sitting due.
SETTLE_MUST_CLEAR = 'settle'


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
    print('retry-test  .  a retry starts a new run, not the last one continued')

    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)
        page = browser.new_context(viewport={'width': 480, 'height': 900},
                                   has_touch=True, is_mobile=True).new_page()
        page.add_init_script(INIT)
        page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
        page.wait_for_function('!!window.__probe.road', timeout=10000)
        page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
        page.click('[data-act="play"]')
        page.wait_for_timeout(600)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(1200)

        # ---- DIRTY THE WORLD ON PURPOSE --------------------------------------
        # A run that happened to be dry would start a clean run and prove nothing.
        page.evaluate("""() => { const R = window.__probe.road;
            R.setSnow(0.9); R.setWet(0.8); R.setSky(0.95, 1); }""")
        page.wait_for_timeout(400)
        dirty = page.evaluate('() => window.__probe.road.worldState()')
        print('      the world was dirtied to: %s' % dirty)
        res.check(dirty['snowy'] == 1 and dirty['settle'] > 0.2 and dirty['storm'] == 1,
                  'the world really is snowy and stormy before the retry',
                  str(dirty))

        # ---- THEN START THE NEXT RUN ----------------------------------------
        # `start` is the path RETRY and DRIVE both take, so this is the same reset a
        # time-over retry runs. Going through the menu would test the menu.
        page.evaluate('() => window.__probe.road.restart()')
        page.wait_for_timeout(500)
        fresh = page.evaluate('() => window.__probe.road.worldState()')
        print('      and the next run starts at: %s' % fresh)

        # 1. NOTHING ACCUMULATED SURVIVES. Settled snow is the clearest case: it is built
        #    up over a whole run, so carrying it is carrying the last run's history.
        res.check(abs(float(fresh.get('settle', 1))) <= 1e-6,
                  'a retry starts with nothing settled on the road',
                  'settle is %s after a run that ended at %s'
                  % (fresh.get('settle'), dirty.get('settle')))

        # 2. AND WHAT IS FALLING IS THIS RUN'S OWN ROLL, not the last one's value being
        #    chased away from. A freshly rolled run starts AT its target rather than
        #    easing toward it over the first seconds of the drive.
        res.check(abs(float(fresh.get('wet', 0)) - float(fresh.get('wetTarget', 1))) <= 1e-3,
                  'and the weather it starts in is the weather it rolled',
                  'wet %s against a target of %s' % (fresh.get('wet'), fresh.get('wetTarget')))

        # 3. AND NOTHING IS LEFT SITTING DUE, which is what put a change on GO.
        due = [k for k in ('wetIn', 'cloudIn', 'biomeIn') if float(fresh.get(k, 1)) <= 0]
        res.check(not due, 'and nothing is due the moment it starts', ', '.join(due))

        # 4. THE LAST RUN'S SPECIFIC STATE IS GONE. Dirtied to deep snow and a storm sky;
        #    a new run that reproduced those exact numbers would be continuing, not starting.
        carried = [k for k in ('settle', 'storm')
                   if abs(float(fresh.get(k, 0)) - float(dirty.get(k, 0))) <= 1e-6
                   and abs(float(dirty.get(k, 0))) > 0.1]
        res.check(not carried,
                  'and the run before it left nothing behind',
                  'these came across unchanged: %s' % ', '.join(carried))

        # AND THE PLACE AGREES WITH ITSELF. The complaint was two pieces of state
        # disagreeing, so a run that starts mid-transition is the same fault again.
        res.check(fresh['from'] == fresh['to'] == fresh['biome'],
                  'and it starts in one place rather than part-way between two',
                  'biome %s, from %s, to %s'
                  % (fresh['biome'], fresh['from'], fresh['to']))

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()

    httpd.shutdown()
    if res.fails:
        print('')
        print('  %d check(s) failed' % len(res.fails))
        return 1
    print('')
    print('  all checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
