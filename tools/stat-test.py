"""Do the cars do what the table says, and does everything on the road share one physics?

RLG-042, and it changes nothing. The owner ruled that "all cars, even the traffic, play off the same
reality and physics", that racer vehicles mirror the player-capable cars, and that a traffic car has
real stats with its DRIVER as the limitation. Before any of that is built, and before RLG-043 lowers
a single number, this says what is true today.

A code read says there are three models and a fourth for the garage card. A code read is not
evidence - RLG-029 established that at some cost, where the rubber band's tow was believed to be a
weak effect wanting a tune and was in fact arithmetically unreachable. So each claim here is put to
an experiment that could refute it.

THREE EXPERIMENTS
-----------------
1. CARS        Every driveable body, from a standstill, in cleared air: the real 0-60 and the real
               top speed, against `zeroSixty()` - which is what the garage card prints - and against
               `MAX_SPD * vmax`, which is what the table declares.

               The air is cleared rather than avoided: `traffic` and `cops` are emptied every tick
               for the duration. A 0-60 measured while something drives into you is a measurement of
               the collision.

2. GEARBOX     The decisive one, and it settles by EFFECT what a code read can only suggest.
               `aiGearFactor` calls `gearTable()`, which reads `optBody` - the PLAYER's car. If that
               matters, then changing the player's gearbox must change how fast the RIVALS
               accelerate, which is absurd and therefore worth proving rather than asserting.

               A rival is held two miles behind, in clean air, where the rubber band is saturated
               and identical in both arms. Its speed is knocked down to 40% of its target and the
               recovery to 90% is timed. Then the same rival, the same seed, the same grid - with
               the player sitting in a four-speed MUSCLE, and again in a six-speed FORMULA.

               Note what this does NOT test. `aiGearFactor` derives its rev fraction as
               `(rpm - IDLE) / (redline - IDLE)` where `rpm` was built from the same `redline`, so
               the redline cancels exactly and cannot be the signal. GEAR COUNT is the signal: four
               ratios against six.

3. TRAFFIC     What the traffic on the road is actually doing, by type, against what `BODY` says
               that vehicle can do. If traffic never reads `BODY`, these two columns are unrelated
               numbers and lowering one will not move the other.
"""

import argparse
import functools
import http.server
import importlib.util
import json
import re
import socketserver
import statistics
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = 'games/sw/interstate.html'
MPH = 200 / 15333


def _handover():
    """Run under whatever Python is on PATH; hand over to the venv if it lacks Playwright (RLG-039)."""
    try:
        import playwright  # noqa: F401
        return
    except ImportError:
        pass
    for candidate in (ROOT / '.venv' / 'Scripts' / 'python.exe', ROOT / '.venv' / 'bin' / 'python'):
        if candidate.exists() and candidate.resolve() != Path(sys.executable).resolve():
            sys.exit(subprocess.run([str(candidate), str(Path(__file__).resolve())]
                                    + sys.argv[1:]).returncode)
    raise SystemExit('[stat-test] playwright is not importable and there is no project .venv.')


_handover()

from playwright.sync_api import sync_playwright   # noqa: E402

from harness import console_utf8, launch_chromium  # noqa: E402


SEED_RNG = r"""
(function(){
  var s = 0x9E3779B9;
  Math.random = function(){
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
"""


def drive_test_module():
    path = Path(__file__).resolve().parent / 'drive-test.py'
    spec = importlib.util.spec_from_file_location('drive_test', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(root):
    httpd = socketserver.TCPServer(
        ('127.0.0.1', 0), functools.partial(Quiet, directory=str(root)))
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.socket.getsockname()[1]


# --- experiment 1: what a car actually does ----------------------------------

CARS = r"""
(async function(bodies){
  var P = window.__probe, R = P.road, out = [];
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  /* ---- CLEAR THE AIR -----------------------------------------------------
     A 0-60 measured while a van drives into the back of you is a measurement of
     the van. Traffic and police are emptied every tick for the whole run; they
     respawn and are emptied again. */
  var sweep = setInterval(function(){
    if(R.traffic) R.traffic.length = 0;
    var c = R.cops && R.cops(); if(c) c.length = 0;
  }, 50);
  try {
    for(var i = 0; i < bodies.length; i++){
      var key = bodies[i];
      /* ---- REFUSE TO MEASURE A GAME THAT IS NOT RUNNING --------------------
         This is the guard the first version did not have. A car cannot be timed
         while the run is over, and a harness that reports 0mph for that has not
         found a slow car - it has stopped measuring and not noticed. */
      if(R.state !== 'driving')
        throw new Error('the run left `driving` before ' + key + ' (state=' + R.state +
                        '). Nothing after this point would be a measurement.');
      R.setBody(key);
      await sleep(250);
      /* --- 0 to 60, best of three. The BEST rather than the mean: a slow run
         has a cause (a nudge, a frame hitch) and a fast one does not, so the
         minimum is the closest thing to the car's own figure. */
      var times = [];
      for(var a = 0; a < 2; a++){
        R.setSpd(0);
        await sleep(120);                       /* let the gearbox settle at rest */
        var t0 = performance.now(), t = 0;
        while(performance.now() - t0 < 20000){
          await sleep(16);
          if(R.spd * (200/15333) >= 60){ t = (performance.now() - t0) / 1000; break; }
        }
        if(t > 0) times.push(t);
      }
      /* --- top speed: hold it flat and take the peak ------------------------
         30 seconds, not 10. The first version held for ten seconds starting from
         a standstill it had just created, and reported STALLION at 135mph
         against a declared 206 - which is not a top speed, it is how far a car
         gets in ten seconds. */
      var peak = 0, t1 = performance.now();
      while(performance.now() - t1 < 30000){
        if(R.state !== 'driving')
          throw new Error('the run left `driving` while timing the top speed of ' + key);
        await sleep(50);
        if(R.spd > peak) peak = R.spd;
      }
      out.push({ key: key, zeroSixty: times.length ? Math.min.apply(null, times) : null,
                 attempts: times.length, topUnits: peak, state: R.state });
    }
  } finally { clearInterval(sweep); }
  return out;
})
"""


# --- experiment 2: whose gearbox are the rivals using? -----------------------

GEARBOX = r"""
(async function(cfg){
  var P = window.__probe, R = P.road, mile = cfg.mile;
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  R.setBody(cfg.body);
  await sleep(300);
  /* the middle of the field by pace, held two miles back: clean air, and a
     rubber band that is saturated and therefore identical in both arms */
  var live = R.racers.filter(function(r){ return !r.wreck; });
  if(live.length < 3) return null;
  live.sort(function(a, b){ return a.base - b.base; });
  var r = live[(live.length/2)|0];
  var pin = setInterval(function(){ r.z = R.pos - 2*mile; }, 40);
  var runs = [];
  try {
    for(var a = 0; a < cfg.reps; a++){
      r.spd = r.base * 0.40;
      var target = r.base * 0.90, t0 = performance.now(), t = 0;
      while(performance.now() - t0 < 15000){
        await sleep(16);
        if(r.wreck > 0){ t = 0; break; }
        if(r.spd >= target){ t = (performance.now() - t0) / 1000; break; }
      }
      if(t > 0) runs.push(t);
      await sleep(200);
    }
  } finally { clearInterval(pin); }
  return { body: cfg.body, gears: (R.BODY[cfg.body] && R.BODY[cfg.body].gears) || 6,
           runs: runs, base: r.base, vmax: r.vmax, rivalBody: r.body };
})
"""


# --- experiment 3: is traffic reading the table? -----------------------------

TRAFFIC = r"""
(function(){
  var R = window.__probe.road, seen = {};
  (R.traffic || []).forEach(function(o){
    var t = o.type || '?';
    (seen[t] = seen[t] || []).push(o.cruise || o.spd || 0);
  });
  return seen;
})
"""

# what a traffic object of each type would be if it read BODY. `sedan2` is the second
# saloon sprite and shares SALOON's record.
TYPE_TO_BODY = {'truck': 'LORRY', 'van': 'VAN', 'pickup': 'PICKUP', 'coupe': 'COUPE',
                'tuner': 'TUNER', 'muscle': 'MUSCLE', 'taxi': 'CAB',
                'sedan': 'SALOON', 'sedan2': 'SALOON'}


def boot(page, base_url, race):
    page.goto(base_url + '/' + GAME, wait_until='load')
    try:
        page.wait_for_function(
            '() => navigator.serviceWorker && navigator.serviceWorker.controller', timeout=5_000)
        page.wait_for_timeout(1_200)
    except Exception:
        pass
    page.wait_for_function('!!window.__probe.road', timeout=10_000)
    page.click('[data-act="play"]')
    page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5_000)
    # hot pursuit off: a roadblock or a PIT in the middle of a 0-60 is not a 0-60
    el = page.query_selector('[data-act="chase"] b')
    if el and el.inner_text().strip() == 'ON':
        page.click('[data-act="chase"]')
        page.wait_for_timeout(120)
    # ---- AND THE CLOCK OFF -------------------------------------------------
    # The first run of this harness measured fourteen cars and reported zero mph for nine of
    # them. TEST DRIVE has a countdown, experiment 1 takes longer than the countdown, and
    # everything after it expired was measured on a game that had ENDED. The numbers looked
    # like results.
    el = page.query_selector('[data-act="timed"] b')
    if el and el.inner_text().strip() == 'ON':
        page.click('[data-act="timed"]')
        page.wait_for_timeout(120)
    if race:
        page.click('[data-act="mode"]')
        page.wait_for_timeout(150)
    page.click('[data-act="drive"]')
    page.wait_for_timeout(400)
    page.evaluate('() => window.__probe.drive()')


def new_page(browser, dt):
    ctx = browser.new_context(viewport={'width': 480, 'height': 900})
    ctx.add_init_script(SEED_RNG)
    ctx.add_init_script(dt.INIT)
    return ctx, ctx.new_page()


def main():
    console_utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument('--reps', type=int, default=4, help='recovery runs per gearbox arm')
    ap.add_argument('--only', choices=('cars', 'gearbox', 'traffic'), action='append',
                    help='run just these experiments (repeatable)')
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()

    src = (ROOT / 'road.js').read_text(encoding='utf-8')
    mile = 1.0 / float(re.findall(r'const MILE = 1 / ([0-9.]+);', src)[0])
    max_spd = float(re.findall(r'const MAX_SPD = ([0-9]+);', src)[0])

    print('stat-test  -  RLG-042  -  measures only, changes nothing')
    dt = drive_test_module()
    httpd, port = serve(ROOT)
    base = 'http://127.0.0.1:%d' % port
    try:
        with sync_playwright() as p:
            browser = launch_chromium(
                p, headless=not args.headed,
                args=['--autoplay-policy=no-user-gesture-required', '--mute-audio'])

            want = set(args.only or ('cars', 'gearbox', 'traffic'))
            cars, claims, seen, arms = [], [], {}, []

            # ---- 1. the cars ------------------------------------------------
            if 'cars' in want:
             ctx, page = new_page(browser, dt)
             boot(page, base, race=False)
             bodies = page.evaluate(
                '() => Object.keys(window.__probe.road.BODY)'
                '.filter(k => !window.__probe.road.BODY[k].npc)')
             cars = page.evaluate(CARS + '(%s)' % json.dumps(bodies))
             claims = page.evaluate(
                '(ks) => ks.map(k => ({ key:k, card: window.__probe.road.zeroSixty(k),'
                ' vmax: window.__probe.road.BODY[k].vmax }))', bodies)
             ctx.close()

            # ---- 3. the traffic (same session shape, cheap) -----------------
            if 'traffic' in want:
             ctx, page = new_page(browser, dt)
             boot(page, base, race=False)
             page.wait_for_timeout(14_000)
             seen = page.evaluate(TRAFFIC + '()')
             ctx.close()

            # ---- 2. the gearbox --------------------------------------------
            for body in (('MUSCLE', 'APEX') if 'gearbox' in want else ()):
                ctx, page = new_page(browser, dt)
                boot(page, base, race=True)
                page.wait_for_timeout(5_000)
                arms.append(page.evaluate(
                    GEARBOX + '(%s)' % json.dumps(
                        {'body': body, 'mile': mile, 'reps': args.reps})))
                ctx.close()
            browser.close()
    finally:
        httpd.shutdown()

    claim = {c['key']: c for c in claims}

    if cars:
        report_cars(cars, claim)
    if arms:
        report_gearbox(arms)
    if seen:
        report_traffic(seen, src)
    return 0


def report_cars(cars, claim):
    print('\n  1. WHAT EACH CAR ACTUALLY DOES   (air cleared: no traffic, no police)')
    row = '    {:<14} {:>9} {:>9} {:>7}   {:>9} {:>9} {:>7}'
    print(row.format('car', 'card 0-60', 'real', 'delta', 'table top', 'real', 'delta'))
    for c in cars:
        k = c['key']
        card = claim[k]['card']
        real = c['zeroSixty']
        top_claim = claim[k]['vmax'] * 200
        top_real = c['topUnits'] * MPH
        print(row.format(
            k,
            '%.1fs' % card,
            ('%.1fs' % real) if real else '-',
            ('%+.1f' % (real - card)) if real else '-',
            '%.0f' % top_claim,
            '%.0f' % top_real,
            '%+.0f' % (top_real - top_claim)))


def report_gearbox(arms):
    print('\n  2. WHOSE GEARBOX ARE THE RIVALS USING?')
    print('     One rival, held two miles back in clean air, knocked to 40% of its target and')
    print('     timed back to 90%. Only the PLAYER changes between the two arms.')
    for a in arms:
        if not a or not a['runs']:
            print('    %-10s no clean recovery measured' % (a['body'] if a else '?'))
            continue
        print('    player in %-8s (%d-speed)   rival %-9s recovery %.2fs   runs %s'
              % (a['body'], a['gears'], a['rivalBody'],
                 statistics.fmean(a['runs']),
                 ', '.join('%.2f' % t for t in a['runs'])))
    if all(a and a['runs'] for a in arms):
        m, f = statistics.fmean(arms[0]['runs']), statistics.fmean(arms[1]['runs'])
        print('\n    The rival was the same car in both arms: %s.'
              % ('yes, ' + arms[0]['rivalBody'] if arms[0]['rivalBody'] == arms[1]['rivalBody']
                 else 'NO - %s then %s, so this comparison is void'
                      % (arms[0]['rivalBody'], arms[1]['rivalBody'])))
        print('    Difference: %+.2fs (%+.1f%%). A rival that ran its OWN gearbox would show none.'
              % (f - m, (f / m - 1) * 100))


def report_traffic(seen, src):
    print('\n  3. IS THE TRAFFIC READING THE TABLE?')
    row3 = '    {:<10} {:>7} {:>12} {:>14} {:>10}'
    print(row3.format('type', 'seen', 'on the road', 'BODY says', 'ratio'))
    for t in sorted(seen):
        vals = [v for v in seen[t] if v]
        if not vals:
            continue
        obs = statistics.fmean(vals) * MPH
        bk = TYPE_TO_BODY.get(t)
        declared = page_body_vmax(src, bk) * 200 if bk else None
        print(row3.format(
            t, len(vals), '%.0f mph' % obs,
            ('%s %.0f' % (bk, declared)) if declared else '-',
            ('%.2f' % (obs / declared)) if declared else '-'))
    print('\n  A ratio far from 1.00, and different for every type, means the two columns are')
    print('  unrelated numbers - the road is not reading the table.')


def page_body_vmax(src, key):
    """Read a body's declared vmax straight out of road.js, so the report cannot drift from it."""
    m = re.search(r"'%s':\s*\{.*?vmax:\s*([0-9.]+)" % re.escape(key), src, re.S)
    return float(m.group(1)) if m else None


if __name__ == '__main__':
    sys.exit(main())
