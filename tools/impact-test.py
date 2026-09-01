#!/usr/bin/env python3
"""IMPACT TEST - a collision answers where it happened, and moves both cars.

    .venv/Scripts/python tools/impact-test.py

RLG-131. Owner, 2026-08-31, after playing through: "what happens to your car should be
based off of where the collision happened. Right now, no matter where you get hit your car
loses a ton of momentum. If you run into someone's rear end, that makes sense - but should
also send the car you hit flying forward. If you sideswipe somebody, it should just bump
you in the opposite direction of the impact as well as the car that you impact it. If
someone hits you from behind, they should get slowed down and you should get pushed
forward. Right now if I cut off an opponent and they hit me, I lose all my speed and they
drive by me which kind of defeats the entire purpose of defensive maneuvering."

WHY THIS NEEDS A HARNESS AND NOT A PLAY SESSION. The subject is WHERE the hit landed, and
driving into a collision and hoping for the geometry you wanted measures the traffic AI
instead. `API.stageImpact` places one car at a chosen offset along and across the road, at
a chosen speed, and runs the collision the game runs - so each of the owner's three cases
can be asked as a question rather than waited for.

THE THREE CASES, AND EACH IS A SEPARATE CLAIM:

    you rear-end them     you lose speed AND they are shoved forward
    they rear-end you     THEY lose speed AND you are pushed forward
    you sideswipe them    both are bumped apart, and neither loses much speed

THE SECOND IS THE ONE THE OWNER ACTUALLY REPORTED. Before this, being hit from behind ran
the same line as rear-ending somebody, so cutting a rival off cost the defender everything
and the rival drove past. A check that only tested the first case would have passed on that
build.

AND ONE PROPERTY THAT IS NOT IN THE OWNER'S WORDS but is in the standing rulings: the
result must follow from what a vehicle IS rather than from a branch naming its class. Mass
comes off the width and length every vehicle already carries, so the last section asks
whether a bigger object shrugs off a smaller one.

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
    page.wait_for_timeout(1500)
    page.evaluate("() => window.__probe.road.clearTraffic()")


def stage(page, dz, dx, theirs, mine, length=380, width=0.26):
    return page.evaluate(
        "(a) => window.__probe.road.stageImpact(a[0],a[1],a[2],a[3],a[4],a[5])",
        [dz, dx, theirs, mine, length, width])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('impact-test  .  a collision answers where it happened')
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

        top = page.evaluate("() => window.__probe.road.MAX_SPD")
        fast, slow = top * 0.80, top * 0.55

        # ---------------------------------------------- you run into their back
        print()
        print('  YOU REAR-END THEM - you lose speed, and they are sent forward')
        # NOSE TO TAIL: the two cars are nearly a full car-length apart along the road, which
        # is the moment of an end-on contact. Alongside is dz near zero, and that is the
        # sideswipe further down - the SAME staging with one number changed.
        r = stage(page, dz=370, dx=0.0, theirs=slow, mine=fast)
        print('      me %.0f -> %.0f (%+.0f), them %.0f -> %.0f (%+.0f)'
              % (r['before']['mine'], r['after']['mine'], r['dMine'],
                 r['before']['theirs'], r['after']['theirs'], r['dTheirs']))
        res.check(r['dMine'] < -1,
                  'running into the back of a slower car costs you speed, which always did work',
                  'you changed by %+.1f' % r['dMine'])
        res.check(r['dTheirs'] > 1,
                  'AND the car you hit is shoved forward, which never happened before',
                  'they changed by %+.1f' % r['dTheirs'])

        # ---------------------------------------------- they run into your back
        print()
        print('  THEY REAR-END YOU - they lose speed, and you are pushed forward')
        # THIS IS THE CASE THE OWNER REPORTED. The staging is the mirror of the one above:
        # they are BEHIND (negative dz) and travelling faster. Before this change both cases
        # ran the same line and the defender paid for it.
        r2 = stage(page, dz=-370, dx=0.0, theirs=fast, mine=slow)
        print('      me %.0f -> %.0f (%+.0f), them %.0f -> %.0f (%+.0f)'
              % (r2['before']['mine'], r2['after']['mine'], r2['dMine'],
                 r2['before']['theirs'], r2['after']['theirs'], r2['dTheirs']))
        res.check(r2['dMine'] > 1,
                  'being hit from behind PUSHES YOU FORWARD instead of stopping you',
                  'you changed by %+.1f' % r2['dMine'])
        res.check(r2['dTheirs'] < -1,
                  'and the car that hit you is the one that loses speed',
                  'they changed by %+.1f' % r2['dTheirs'])
        # AND THE TWO CASES ARE OPPOSITE, which is the whole ruling in one line. On the old
        # build both of these were the same sign, and that is what defeated defensive driving.
        res.check(r['dMine'] < 0 < r2['dMine'],
                  'so the two cases are OPPOSITE - defensive driving is no longer punished',
                  'rear-ending %+.1f, being rear-ended %+.1f' % (r['dMine'], r2['dMine']))

        # ---------------------------------------------- alongside
        print()
        print('  YOU SIDESWIPE THEM - both are bumped apart, and neither loses much speed')
        r3 = stage(page, dz=0, dx=0.24, theirs=slow, mine=fast)
        print('      me %.0f -> %.0f (%+.0f), them %.0f -> %.0f (%+.0f); '
              'shifted me %+.3f, them %+.3f'
              % (r3['before']['mine'], r3['after']['mine'], r3['dMine'],
                 r3['before']['theirs'], r3['after']['theirs'], r3['dTheirs'],
                 r3['myShift'], r3['theirShift']))
        res.check(abs(r3['dMine']) < abs(r['dMine']) * 0.25,
                  'a rub down the flank costs far less speed than running into a back',
                  'a rub cost %+.1f against %+.1f for the rear-ending' % (r3['dMine'], r['dMine']))
        # APART, rather than in a stated direction. The first version of this asserted the
        # signs, which is a claim about which side the other car was staged on rather than
        # about the physics - the check failed on a build that was pushing both cars apart
        # correctly. What the ruling says is that they separate.
        res.check(r3['myShift'] * r3['theirShift'] < 0
                  and abs(r3['myShift']) > 0.01 and abs(r3['theirShift']) > 0.01,
                  'and BOTH cars are pushed apart, in opposite directions',
                  'me %+.4f, them %+.4f' % (r3['myShift'], r3['theirShift']))
        # AND AWAY FROM EACH OTHER rather than merely apart: the car staged on the right
        # goes right, and I go left. Opposite signs alone would also be satisfied by two
        # cars swapping sides through one another.
        res.check(r3['myShift'] < 0 < r3['theirShift'],
                  'and each goes away from the other, rather than through it',
                  'the other car was staged to my right at +0.24; I moved %+.4f and it moved %+.4f'
                  % (r3['myShift'], r3['theirShift']))
        # AND THE SQUARE HIT IS THE OTHER WAY ROUND. A rear-ending should barely move either
        # car sideways - if both cases shoved sideways equally, `square` would be doing nothing.
        res.check(abs(r3['myShift']) > abs(r['myShift']) * 2,
                  'while a square hit hardly moves either sideways, which is what makes them different',
                  'a rub shifted %+.4f against %+.4f for a square hit'
                  % (r3['myShift'], r['myShift']))

        # ---------------------------------------------- mass, from what it IS
        print()
        print('  A BIGGER OBJECT SHRUGS IT OFF, and nothing in the code names a lorry')
        light = stage(page, dz=370, dx=0.0, theirs=slow, mine=fast, length=380, width=0.26)
        heavy = stage(page, dz=370, dx=0.0, theirs=slow, mine=fast, length=520, width=0.32)
        print('      into a car:   I lose %+.0f, it gains %+.0f'
              % (light['dMine'], light['dTheirs']))
        print('      into a lorry: I lose %+.0f, it gains %+.0f'
              % (heavy['dMine'], heavy['dTheirs']))
        res.check(heavy['dMine'] < light['dMine'],
                  'hitting a bigger vehicle costs you more than hitting a smaller one',
                  'lorry %+.1f against car %+.1f' % (heavy['dMine'], light['dMine']))
        res.check(heavy['dTheirs'] < light['dTheirs'],
                  'and the bigger vehicle is moved less by it',
                  'lorry gained %+.1f against a car %+.1f'
                  % (heavy['dTheirs'], light['dTheirs']))

        # ---- AND NOTHING IS CONJURED. Momentum has to come from somewhere: whatever one car
        # gains along the road, the other loses, scaled by the masses. If this drifts, the
        # collision is a speed source and a player will find it.
        print()
        print('  AND NOTHING IS CONJURED - what one car gains the other loses')
        for name, rr, mine_m, theirs_m in (
                ('rear-ending', r, 1.0, 1.0),
                ('being hit', r2, 1.0, 1.0)):
            total = rr['dMine'] * mine_m + rr['dTheirs'] * theirs_m
            print('      %-12s me %+.1f, them %+.1f, net %+.1f'
                  % (name, rr['dMine'], rr['dTheirs'], total))
            res.check(abs(total) < max(2.0, abs(rr['dMine']) * 0.35),
                      '%s: the exchange roughly balances rather than making speed' % name,
                      'net %+.2f against a change of %+.2f' % (total, rr['dMine']))

        errs = page.evaluate("() => window.__probe.errors")
        res.check(not errs, 'no page errors', '; '.join(errs[:3]))
        browser.close()
    httpd.shutdown()

    print()
    if res.fails:
        print('FAILED: ' + '; '.join(res.fails))
        return 1
    print('all checks passed')
    return 0


sys.exit(main())
