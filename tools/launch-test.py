#!/usr/bin/env python3
"""
LAUNCH TEST - the grid starts from rest, and the player launches from neutral.

    .venv/Scripts/python tools/launch-test.py

RLG-118 and RLG-110, owner-decided 2026-08-31. Two halves of one start line:

  RLG-118  the grid was given a FLYING start. Every rival was built at about 91 per cent of its
           own top speed and the count-in freezes the world by returning early from step(), so the
           field was never held at zero - it was simply not stepped. Eleven cars already at racing
           speed were released against a player sitting at nothing.

  RLG-110  the player is held in NEUTRAL and revving is what buys the launch. The engine had a
           full free-revving neutral branch already and it was gated on the manual gearbox, so an
           automatic sat at idle however hard the throttle was held.

WHAT A HARNESS CAN AND CANNOT SAY. It can say the grid is at zero, that the box is in neutral, that
the needle moves, and that the three outcomes of the window agree with where the needle actually
was. It cannot say whether the window is HOLDABLE with a thumb, or whether the amber band is
legible on a phone. Those are the owner's, on the device.

THE WINDOW IS NOT AIMED AT BY THIS TEST. Landing the needle on a target from a harness is a race
against the engine's own rev decay and would make the check a timing test rather than a behaviour
one. Instead three starts are driven - never touching the throttle, holding it flat, and walking the needle
toward the band - and what is asserted is the RELATION: where the needle was, against what the game said
happened. That cannot pass by accident and it cannot flake on a frame.

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


def open_page(browser, port, race=False):
    """A fresh context every time, so no run inherits the last one's save or its `seenStart`."""
    page = browser.new_context(viewport={'width': 480, 'height': 900},
                               has_touch=True, is_mobile=True).new_page()
    page.add_init_script(INIT)
    page.goto('http://127.0.0.1:%d/%s' % (port, GAME), wait_until='load')
    page.wait_for_function('!!window.__probe.road', timeout=10000)
    page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
    page.click('[data-act="play"]')
    page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
    if race:
        # the MODE control cycles TEST DRIVE -> SINGLE RACE -> TOURNAMENT; one press is a race
        page.click('[data-act="mode"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
    page.click('[data-act="drive"]')
    return page


def drive_start(page, throttle):
    """Run one start. `throttle` is 'none', 'flat' or 'aim'.

    'none' never touches the pedal, 'flat' holds it down throughout, and 'aim' walks the needle
    toward the middle of the band the way a thumb has to. The pedal is a real pointer event on the
    real button - nothing is set through the API, because the thing under test is what the player's
    thumb does."""
    rows = []
    down = False
    if throttle == 'flat':
        page.dispatch_event('#gas', 'pointerdown')
        down = True
    for i in range(60):
        page.wait_for_timeout(50)
        row = page.evaluate('() => Object.assign({}, window.__probe.road.launch(),'
                            ' { line: window.__probe.road.startLine() })')
        rows.append(row)
        # ---- AIM: THE PEDAL IS A BUTTON, SO THE NEEDLE IS WALKED ------------------
        # This is the same thing a thumb has to do - press to bring the needle up, release and
        # let it drift, press again before it falls out - and it is the only check there is that
        # the band is reachable at all. It is deliberately no cleverer than a person: it sees the
        # needle at 50ms intervals, which is SLOWER than a player watching the dial.
        if throttle == 'aim' and row['count'] > 0:
            if row['rev'] < row['peak'] and not down:
                page.dispatch_event('#gas', 'pointerdown'); down = True
            elif row['rev'] >= row['peak'] and down:
                page.dispatch_event('#gas', 'pointerup'); down = False
    if down:
        page.dispatch_event('#gas', 'pointerup')
    return rows


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    return 0.0 if dx == 0 or dy == 0 else num / (dx * dy)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    console_utf8()
    res = Results()
    httpd, port = serve(ROOT)
    print('launch-test  .  the grid starts from rest and the player launches from neutral')

    with sync_playwright() as p:
        browser = launch_chromium(p, headless=not args.headed)

        # ================================================================== RLG-110
        print('\n  the box, and the engine in it')
        runs = {}
        for how in ('none', 'flat', 'aim'):
            page = open_page(browser, port)
            runs[how] = drive_start(page, how)
            page.context.close()

        flat = runs['flat']
        held = [r for r in flat if r['count'] > 0]
        after = [r for r in flat if r['count'] <= 0]

        res.check(len(held) >= 20, 'the count runs long enough to launch in',
                  'only %d samples had any count left' % len(held))

        # 1. NEUTRAL, ON THE AUTOMATIC BOX. The default gearbox is the automatic, so this is the
        #    exact case RLG-110 says was broken: `engineRpm` clamped the gear to 1 for it.
        res.check(all(r['gear'] == 0 for r in held),
                  'the box is in neutral for the whole count, on the automatic gearbox',
                  'gears seen: %s' % sorted({r['gear'] for r in held}))
        res.check(all(r['armed'] for r in held),
                  'and the launch is armed while it is held')

        # 2. AND THE ENGINE IS FREE. Before the fix the needle sat at idle with the pedal flat,
        #    because the revs were derived from a road speed the count-in was holding at zero.
        top = max((r['rev'] for r in held), default=0)
        print('      needle with the pedal flat: %.3f of the redline at its highest' % top)
        res.check(top > 0.90, 'a held throttle winds the engine to the limiter',
                  'it only reached %.3f of the redline' % top)

        # 3. AND IT COMES BACK DOWN. `lift` releases the pedal part way through the count.
        aim = runs['aim']
        lheld = [r for r in aim if r['count'] > 0]
        if lheld:
            peak_at = max(r['rev'] for r in lheld)
            ended = lheld[-1]['rev']
            print('      after lifting: %.3f at its highest, %.3f by the end of the count'
                  % (peak_at, ended))
            res.check(ended < peak_at, 'and the needle falls again when the throttle is released',
                      'it was %.3f at its highest and %.3f at the end' % (peak_at, ended))

        # 4. NEVER TOUCHING IT LEAVES THE ENGINE AT IDLE
        none_held = [r for r in runs['none'] if r['count'] > 0]
        idle_top = max((r['rev'] for r in none_held), default=1)
        res.check(idle_top < 0.15, 'and it idles when the throttle is never touched',
                  'it reached %.3f of the redline with nobody on the pedal' % idle_top)

        # ================================================================== the window
        print('\n  the window, and the three things that can happen at it')
        landed = {}
        for how in ('none', 'flat', 'aim'):
            rows = [r for r in runs[how] if r['count'] <= 0 and r['note']]
            if not rows:
                res.check(False, 'the %s start reached a verdict' % how, 'no sample carried a note')
                continue
            r = rows[0]
            landed[how] = r
            print('      %-5s  needle %.3f   band %.3f-%.3f   %s'
                  % (how, r['at'], r['lo'], r['hi'], r['note']))

        # THE RELATION IS THE CHECK. Where the needle was, against what the game said happened.
        # This cannot pass by accident: a build that ignored the window would have to produce the
        # right verdict for three different needle positions by chance.
        for how, r in landed.items():
            if r['at'] < r['lo']:
                want, why = 'BOGGED', 'under the band'
            elif r['at'] > r['hi']:
                want, why = 'WHEELSPIN', 'over the band'
            else:
                want, why = 'LAUNCH', 'inside the band'
            res.check(want in r['note'],
                      'the %s start landed %s and the game said so' % (how, why),
                      'needle %.3f against %.3f-%.3f, and it said %s'
                      % (r['at'], r['lo'], r['hi'], r['note']))

        # AND A GOOD LAUNCH IS WORTH SOMETHING. Speed a second after GO, which is the only thing
        # the player is actually buying.
        def speed_after(rows):
            got = [r['line']['spd'] for r in rows if r['count'] <= 0]
            return got[19] if len(got) > 19 else (got[-1] if got else 0)

        spds = {how: speed_after(runs[how]) for how in runs}
        print('      speed a second after GO:  %s'
              % '   '.join('%s %d' % (k, v) for k, v in spds.items()))
        inband = [k for k, r in landed.items() if r['lo'] <= r['at'] <= r['hi']]
        res.check(bool(inband),
                  'at least one of the three starts landed inside the window',
                  'none did, so the window may be unreachable: %s'
                  % {k: (r['at'], r['lo'], r['hi']) for k, r in landed.items()})
        for good in inband:
            for bad in landed:
                if bad == good:
                    continue
                res.check(spds[good] > spds[bad],
                          'a launch inside the window beats the %s start' % bad,
                          '%d against %d a second later' % (spds[good], spds[bad]))

        # ================================================================== RLG-118
        print('\n  the grid')
        grids = []
        for _ in range(3):
            page = open_page(browser, port, race=True)
            page.wait_for_timeout(400)
            during = page.evaluate('() => window.__probe.road.grid()')
            # the frame the count lets go, and a second past it
            page.wait_for_timeout(2900)
            at_go = page.evaluate('() => window.__probe.road.grid()')
            page.wait_for_timeout(1000)
            later = page.evaluate('() => window.__probe.road.grid()')
            grids.append((during, at_go, later))
            page.context.close()

        during, at_go, later = grids[0]
        res.check(len(during) == 11, 'a race grid is eleven rivals',
                  'it was %d' % len(during))
        res.check(all(r['spd'] == 0 for r in during),
                  'every rival is at a standstill while the count is up',
                  'fastest was %d' % max((r['spd'] for r in during), default=0))

        # THE FLYING START, WHICH IS THE WHOLE OF RLG-118. Before the fix each car sat at 0.92 of
        # its own base speed the instant the count let go.
        worst = max((r['spd'] / max(1, r['base']) for r in at_go), default=1)
        print('      at GO the fastest rival is at %.3f of its target speed' % worst)
        res.check(worst < 0.10, 'and none of them is already at racing speed when it lets go',
                  'one was at %.3f of its own target' % worst)

        # AND THEY DO GET GOING, or the fix has simply parked the field
        moving = [r for r in later if r['spd'] > 0]
        share = max((r['spd'] / max(1, r['base']) for r in later), default=0)
        print('      a second later %d of 11 are moving, the fastest at %.3f of target'
              % (len(moving), share))
        res.check(len(moving) == len(later), 'they all pull away once it does',
                  'only %d of %d were moving' % (len(moving), len(later)))
        res.check(share < 0.95, 'and they are still building speed rather than snapping to it',
                  'one was already at %.3f of its target' % share)

        # THE LAUNCH SPREAD IS NOT THE GRID ORDER. `r.base` already strings the field out by grid
        # position; a launch spread drawn from the same order would compound with it and the back
        # of the grid would never see the front again. Pooled over three grids, so a single
        # unlucky draw cannot decide it.
        xs, ys = [], []
        for g, _, _ in grids:
            for r in g:
                xs.append(r['i'])
                ys.append(r['q'])
        r_iq = pearson(xs, ys)
        print('      launch quality against grid position over %d rivals: r = %+.3f'
              % (len(xs), r_iq))
        res.check(abs(r_iq) < 0.60,
                  'a rival\'s launch is its own, not its grid slot',
                  'they correlate at r = %+.3f' % r_iq)

        browser.close()

    httpd.shutdown()
    print('')
    if res.fails:
        print('FAILED: ' + '; '.join(res.fails))
        return 1
    print('all checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
