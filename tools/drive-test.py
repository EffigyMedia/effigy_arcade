#!/usr/bin/env python3
"""
DRIVE TEST — the harness that actually plays the game.

pack.sh proves the files parse. This proves the car moves.

    python3 tools/drive-test.py                 both games
    python3 tools/drive-test.py highway         one game
    python3 tools/drive-test.py --seconds 45    drive longer
    python3 tools/drive-test.py --headed        watch it

Exit code 0 if every check passed, 1 otherwise.

It touches no game file. The engine is captured by wrapping `window.ROAD`
before road.js runs, so the harness sees `CFG.api` — the same surface a fork
sees — and nothing has to be instrumented for testing.
"""

import argparse
import functools
import http.server
import socket
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from harness import console_utf8, launch_chromium

ROOT = Path(__file__).resolve().parent.parent
MPH = 200 / 15333          # MAX_SPD is 200mph, road.js:80

GAMES = {
    'highway': 'games/sw/highway.html',
    'raceway': 'games/sw/raceway.html',
}

# Every car the garage must offer from a clean save. Both classes are
# unlocked from the start; FORMULA and the traffic bodies are not.
EXPECTED_CARS = ['ROADSTER', 'TUNER', 'MUSCLE', 'STALLION', 'MATADOR', 'CREST']


# --- capture the engine before it runs ---------------------------------------

INIT = r"""
window.__probe = { errors: [], road: null };
(function(){
  var real = null;
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
  var wrapped = null;
})();
window.addEventListener('error', function(e){
  window.__probe.errors.push(String(e.message));
});
window.addEventListener('unhandledrejection', function(e){
  window.__probe.errors.push('unhandled rejection: ' + e.reason);
});

/* ---- THE AUTOPILOT --------------------------------------------------------
   Holding the throttle and nothing else is not a driver. On a circuit it
   drifts wide on the first corner and spends the rest of the run grinding a
   barrier at 55mph, which fails a speed assertion for a reason that has
   nothing to do with the engine being broken.

   So: a proportional centre-seeker, running in the page on rAF, pressing the
   same arrow keys a player would. It steers back to the middle of the road
   and lifts off when it is badly out of shape. It is not quick — it is
   CONSISTENT, which is what an assertion needs.
   ------------------------------------------------------------------------- */
window.__probe.drive = function(){
  var P = window.__probe, R = P.road;
  P.log = []; P.peakMph = 0; P.raf = null;
  var held = {};
  var key = function(k, want){
    if(!!held[k] === !!want) return;
    held[k] = want;
    window.dispatchEvent(new KeyboardEvent(want ? 'keydown' : 'keyup',
      { key:k, bubbles:true, cancelable:true }));
  };
  /* ---- where to aim ------------------------------------------------------
     The road has FOUR lanes, at the positions road.js calls LANE_X. Aiming
     anywhere else straddles two of them, which is how the first version of
     this driver managed to clip cars in both — the engine counts anything
     within 0.20 lanes as a collision, so a line at 0.0 is inside the two
     middle lanes at once.

     So: only ever aim at a lane centre. Prefer the one you are already in,
     change only when something slower is sitting in it, and look further
     ahead the faster you are going. */
  var LANE_X = [-0.75, -0.25, 0.25, 0.75];
  var aim = function(){
    var cars = R.traffic || [], me = R.playerX;
    var horizon = 9000 + R.spd * 2.4;      /* ~1.8s of road at 190mph */
    var blocked = [0, 0, 0, 0];
    for(var i = 0; i < cars.length; i++){
      var dz = cars[i].z - (R.pos + R.PLAYER_Z);
      if(dz < 0 || dz > horizon) continue;
      if((cars[i].spd || cars[i].cruise || 0) > R.spd) continue;   /* pulling away */
      for(var l = 0; l < 4; l++)
        if(Math.abs(cars[i].x - LANE_X[l]) < 0.34) blocked[l] = 1;
    }
    var here = 0;
    for(var k = 1; k < 4; k++)
      if(Math.abs(LANE_X[k] - me) < Math.abs(LANE_X[here] - me)) here = k;
    if(!blocked[here]) return LANE_X[here];
    /* nearest clear lane, so the change is one lane rather than three */
    for(var d = 1; d < 4; d++){
      if(here - d >= 0 && !blocked[here - d]) return LANE_X[here - d];
      if(here + d <= 3 && !blocked[here + d]) return LANE_X[here + d];
    }
    return LANE_X[here];                   /* boxed in: hold the line */
  };

  var t0 = performance.now(), last = 0, want = 0, aimT = 0;
  var tick = function(){
    P.raf = requestAnimationFrame(tick);
    var x = R.playerX, mph = R.spd * 200 / 15333;
    if(mph > P.peakMph) P.peakMph = mph;
    key('ArrowUp', true);                       /* throttle pinned */
    /* re-pick the line five times a second: any faster and it dithers
       between two lanes and never commits to either */
    if(performance.now() - aimT > 120){ aimT = performance.now(); want = aim(); }
    key('ArrowLeft',  x > want + 0.06);
    key('ArrowRight', x < want - 0.06);
    /* off the road: lift and let it settle */
    key('ArrowDown', Math.abs(x) > 0.95);
    var t = performance.now();
    if(t - last > 250){
      last = t;
      P.log.push({ t:+((t - t0)/1000).toFixed(2), mph:+mph.toFixed(1),
                   pos:R.pos, x:+x.toFixed(3), dmg:R.dmg, state:R.state,
                   lap:  (typeof lap  !== 'undefined') ? lap  : null,
                   fuel: (typeof fuel !== 'undefined') ? fuel : null,
                   tyre: (typeof tyre !== 'undefined') ? tyre : null });
    }
  };
  tick();
};
window.__probe.stop = function(){
  if(window.__probe.raf) cancelAnimationFrame(window.__probe.raf);
  ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].forEach(function(k){
    window.dispatchEvent(new KeyboardEvent('keyup', { key:k, bubbles:true }));
  });
};
"""


class Result:
    def __init__(self, game):
        self.game = game
        self.checks = []      # (ok, label, detail)

    def check(self, ok, label, detail=''):
        self.checks.append((bool(ok), label, detail))
        return bool(ok)

    @property
    def failed(self):
        return [c for c in self.checks if not c[0]]

    def report(self):
        print(f'\n  {self.game.upper()}')
        for ok, label, detail in self.checks:
            mark = 'ok  ' if ok else 'FAIL'
            line = f'    {mark}  {label}'
            if detail:
                line += f'   {detail}'
            print(line)


# --- server ------------------------------------------------------------------

def serve(root: Path):
    """A quiet static server on a free port. file:// breaks the service worker
    and the module-less scripts load differently; http is what ships."""
    handler = functools.partial(QuietHandler, directory=str(root))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.socket.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


# --- the drive ---------------------------------------------------------------

def boot(page, url, res):
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append('console.error: ' + m.text)
            if m.type == 'error' else None)
    page.goto(url, wait_until='load')
    # ---- the first visit reloads itself -------------------------------------
    # sw.js calls clients.claim() on activate, which fires `controllerchange`,
    # and arcade.js reloads on that. On a cold profile it lands a second or so
    # after load, wiping anything clicked in between. Wait it out rather than
    # racing it: the init script re-runs on the new document, so the probe
    # survives.
    try:
        page.wait_for_function(
            '() => navigator.serviceWorker && navigator.serviceWorker.controller',
            timeout=5_000)
        page.wait_for_timeout(1_200)
    except Exception:
        pass
    page.wait_for_function('!!window.__probe.road', timeout=10_000)

    # the title card is up, and it has a PLAY button
    page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10_000)
    res.check(True, 'boots to the title card')
    return errors


def garage_cars(page):
    """Walk the garage with NEXT and collect every car name it offers."""
    page.click('[data-act="play"]')
    page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5_000)
    names = []
    for _ in range(24):                       # generous; the list wraps
        name = page.eval_on_selector(
            '#veilBody .gname', 'el => el.textContent').strip()
        if names and name == names[0]:
            break                             # wrapped round
        if name not in names:
            names.append(name)
        page.click('[data-act="next"]')
        page.wait_for_timeout(60)
    return names


def no_pursuit(page):
    """Switch HOT PURSUIT off if the fork offers it.

    Not to make the test easy — to make it REPEATABLE. A roadblock spans the
    road and a PIT manoeuvre ends the run, so with the police on, the same
    build scores anywhere between 130 and 190mph depending on when a cruiser
    happens to spawn. The chase gets its own test; this one is about whether
    the car drives."""
    btn = page.query_selector('[data-act="chase"]')
    if btn and 'ON' in btn.inner_text().upper():
        btn.click()
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5_000)


def drive(page, res, seconds, is_raceway):
    """Hold the throttle and watch the numbers."""
    page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5_000)
    no_pursuit(page)
    page.click('[data-act="drive"]')
    page.wait_for_timeout(400)

    state = page.evaluate('() => window.__probe.road.state')
    res.check(state not in ('title', 'garage'), 'leaves the menus on DRIVE',
              f'state={state!r}')

    hud_before = page.eval_on_selector('#score', 'el => el.textContent')

    page.evaluate('() => window.__probe.drive()')
    page.wait_for_timeout(int(seconds * 1000))
    samples = page.evaluate('() => window.__probe.log')
    peak = page.evaluate('() => window.__probe.peakMph')

    res.check(peak > 150, 'speed rises above 150mph', f'peak {peak:.0f}mph')

    moved = samples[-1]['pos'] - samples[0]['pos']
    res.check(moved > 0, 'the road moves under the car', f'{moved:,.0f} units')

    on_road = sum(1 for s in samples if abs(s['x']) < 1.0) / len(samples)
    res.check(on_road > 0.9, 'stays on the road', f'{on_road*100:.0f}% of samples')

    # A wreck is not "damage got high" — Highway is a game about traffic and
    # a scrape is part of it. It is the RESPAWN: damage reaching the top and
    # dropping back to nothing. Watch for the reset, not the number.
    worst = max(s['dmg'] for s in samples)
    wrecks = sum(1 for a, b in zip(samples, samples[1:])
                 if a['dmg'] - b['dmg'] > 40)
    res.check(not wrecks, 'never wrecked',
              f'{wrecks} respawn(s), worst damage {worst}%' if wrecks
              else f'worst damage {worst}%')

    hud_after = page.eval_on_selector('#score', 'el => el.textContent')
    res.check(hud_after != hud_before, 'the HUD changes',
              f'{hud_before!r} -> {hud_after!r}')

    if is_raceway:
        lap_len = page.evaluate('() => circuit && circuit.len') or 0
        laps_driven = (moved / lap_len) if lap_len else 0

        def per_lap(vals):
            """A run is a fraction of a lap, so a raw drop says nothing. Scale
            it to a lap: that is the number a player experiences."""
            if not vals or not laps_driven:
                return None
            return (vals[0] - vals[-1]) / laps_driven

        fuel = [s['fuel'] for s in samples if s['fuel'] is not None]
        fpl = per_lap(fuel)
        res.check(fpl and 0 < fpl < 60, 'a tank lasts a stint',
                  f'{fpl:.0f}% of fuel per lap ≈ {100/fpl:.1f} laps' if fpl else 'not found')

        tyre = [s['tyre'] for s in samples if s['tyre'] is not None]
        tpl = per_lap(tyre)
        # a set that cannot finish one lap makes the pit compulsory rather
        # than a decision, and grip has nowhere to fall from
        res.check(tpl and 0 < tpl < 80, 'a set of tyres lasts more than a lap',
                  f'{tpl:.0f}% of tyre per lap ≈ {100/tpl:.1f} laps' if tpl else 'not found')

        lap_check(page, res)

    page.evaluate('() => window.__probe.stop()')
    return samples


def lap_check(page, res):
    """Does the lap counter actually count?

    A lap is ~480,000 units and the autopilot is not quick, so driving a whole
    one costs a couple of minutes per run — too slow to be run often, and a
    test nobody runs is not a test. Instead: jump to just short of the line
    with the engine's own `jumpTo` and drive across it. Same counter, same
    code path, six seconds."""
    before = page.evaluate('() => lap')
    jumped = page.evaluate("""() => {
        if(typeof circuit === 'undefined' || !circuit) return false;
        const R = window.__probe.road;
        const laps = Math.floor(R.pos / circuit.len);
        R.jumpTo((laps + 0.995) * circuit.len);
        return true;
    }""")
    if not jumped:
        res.check(False, 'a lap increments', 'no circuit to jump on')
        return
    try:
        page.wait_for_function(f'() => lap > {before}', timeout=20_000)
        after = page.evaluate('() => lap')
        res.check(True, 'a lap increments', f'{before} -> {after} (jumped to the line)')
    except Exception:
        res.check(False, 'a lap increments',
                  f'still {page.evaluate("() => lap")} after crossing the line')


def run_game(browser, base, game, seconds, res):
    ctx = browser.new_context(viewport={'width': 480, 'height': 900})
    ctx.add_init_script(INIT)
    page = ctx.new_page()
    try:
        errors = boot(page, f'{base}/{GAMES[game]}', res)

        cars = garage_cars(page)
        missing = [c for c in EXPECTED_CARS if c not in cars]
        res.check(not missing, 'the garage lists the expected cars',
                  ', '.join(cars) if not missing else 'missing ' + ', '.join(missing))

        drive(page, res, seconds, game == 'raceway')

        errors += page.evaluate('() => window.__probe.errors')
        res.check(not errors, 'no page errors',
                  '' if not errors else errors[0][:120])
    finally:
        ctx.close()


def main():
    console_utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument('games', nargs='*', choices=list(GAMES), default=None)
    ap.add_argument('--seconds', type=float, default=30.0)
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()
    wanted = args.games or list(GAMES)

    httpd, port = serve(ROOT)
    base = f'http://127.0.0.1:{port}'
    results = []
    print(f'drive-test  ·  {base}  ·  {args.seconds:g}s per game')
    with sync_playwright() as p:
        browser = launch_chromium(
            p,
            headless=not args.headed,
            args=['--autoplay-policy=no-user-gesture-required', '--mute-audio'])
        for game in wanted:
            res = Result(game)
            try:
                run_game(browser, base, game, args.seconds, res)
            except Exception as e:
                res.check(False, 'harness completed', f'{type(e).__name__}: {e}')
            res.report()
            results.append(res)
        browser.close()
    httpd.shutdown()

    bad = sum(len(r.failed) for r in results)
    total = sum(len(r.checks) for r in results)
    print(f'\n  {total - bad}/{total} checks passed')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
