"""Measure what Interstate's rivals actually do. It changes nothing.

RLG-033 part 1. The fragment asks for racing lines, defending and personality, and the owner ruled
that none of it is built before there are numbers describing the behaviour that exists now. The
reason is RLG-029, one unit ago: the rubber band's tow was believed to be a weak effect that wanted
tuning, and it was not weak - it was arithmetically unreachable, and no amount of tuning would ever
have found that. An impression about AI behaviour is worth exactly as much.

WHAT IS MEASURED
----------------
  passes/min   a rival's z crossing a traffic car's z, counted per rival per minute. This is a
               COMPLETED overtake. Cars are identified by a tag put on them the first time they
               are seen, so a car that de-spawns and a car that was passed are not confused.
  blocked      the share of samples with a SLOWER car within two seconds of travel ahead, in the
               same lane. Stated in seconds of travel rather than in the engine's own 3600 units,
               deliberately: a harness that measures with the engine's constants is testing the
               engine's arithmetic against itself.
  off-centre   the share of samples more than 0.06 lanes from the nearest lane centre. A car that
               is overtaking is between lanes; a car that never leaves a lane centre is not
               overtaking at all.
  lateral      mean lateral speed in lanes per second - how much steering is happening.

THE CONTROL ARM
---------------
The same discipline as `band-test.py`, and for the same reason: a number with nothing to compare it
against cannot tell you whether the mechanism you are looking at is the one producing it.

  dodge on     road.js exactly as it ships
  dodge off    road.js with the rivals' lateral term forced to zero, rewritten IN THE SERVER, in
               memory, no file touched on disk

`dodge` is the entire steering intelligence a rival has: it leans away from anything ahead in its
lane and otherwise drifts back to a lane centre. With it off, a rival can only slow down. So the
difference between the arms is what the steering is worth. If passes/min barely moves, the rivals
are not overtaking - they are being carried past slower cars by raw speed, and the dodge is
decoration. That is the question part 2 of RLG-033 needs answered before it starts.

Math.random is seeded before any game script runs, so both arms race the same grid and the same
traffic. Runs are repeated, because one run is weather.
"""

import argparse
import functools
import http.server
import importlib.util
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


# --- find the interpreter that has Playwright --------------------------------
# The same handover as band-test.py, and see RLG-039 for why it is needed: step.py runs with the
# environment root as cwd, and on Windows CreateProcess resolves a relative EXECUTABLE against the
# calling process's directory, so the project .venv cannot be named by any relative path from there.

def _handover():
    try:
        import playwright  # noqa: F401
        return
    except ImportError:
        pass
    for candidate in (ROOT / '.venv' / 'Scripts' / 'python.exe', ROOT / '.venv' / 'bin' / 'python'):
        if candidate.exists() and candidate.resolve() != Path(sys.executable).resolve():
            sys.exit(subprocess.run([str(candidate), str(Path(__file__).resolve())]
                                    + sys.argv[1:]).returncode)
    raise SystemExit(
        '[racer-test] playwright is not importable and there is no project .venv to hand over to.\n'
        '             Build one: uv venv .venv, then uv pip install --python .venv playwright')


_handover()

from playwright.sync_api import sync_playwright   # noqa: E402

from harness import console_utf8, launch_chromium  # noqa: E402


# --- the control arm ---------------------------------------------------------
# The dodge is applied in one place. Forcing it to zero at the point of USE, rather than deleting
# the scan that computes it, keeps the arms as close as possible: the scan still runs, still costs
# the same, and still sets `want` from the blocking car. Only the steering is removed.

DODGE_LINE = '    if(dodge !== 0){'
DODGE_OFF = '    dodge = 0;\n    if(dodge !== 0){'


def road_without_dodge(src):
    hits = src.count(DODGE_LINE)
    if hits != 1:
        raise SystemExit('[racer-test] the dodge branch was found %d times in road.js, not once.\n'
                         '             Looked for: %s\n'
                         '             A control arm that patches nothing proves nothing, so this '
                         'stops rather than reporting two identical runs as a finding.'
                         % (hits, DODGE_LINE.strip()))
    return src.replace(DODGE_LINE, DODGE_OFF)


def serve(root, dodge):
    src = (root / 'road.js').read_text(encoding='utf-8')
    patched = None if dodge else road_without_dodge(src).encode('utf-8')

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if patched is not None and self.path.split('?')[0].endswith('/road.js'):
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript')
                self.send_header('Content-Length', str(len(patched)))
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(patched)
                return
            super().do_GET()

    handler = functools.partial(Handler, directory=str(root))
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    httpd.allow_reuse_address = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.socket.getsockname()[1]


def drive_test_module():
    path = Path(__file__).resolve().parent / 'drive-test.py'
    spec = importlib.util.spec_from_file_location('drive_test', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


SAMPLER = r"""
(function(mile){
  var P = window.__probe, R = P.road;
  var LANE_X = [-0.75, -0.25, 0.25, 0.75];
  var nextId = 1;
  var idOf = function(o){ if(!o.__rtid) o.__rtid = nextId++; return o.__rtid; };

  /* Per rival: how many traffic cars it has gone past, how long it spent held up, how far it
     strayed from a lane centre, and how hard it was steering. Keyed by the rival object itself,
     which survives the whole race because racers are never culled (measured, RLG-029). */
  var st = R.racers.map(function(r){
    return { r:r, passes:0, blocked:0, offCentre:0, lat:0, n:0, ahead:{}, lastX:r.x, lastT:0 };
  });
  P.racer = { rows: null, t0: performance.now() };

  P.racer.timer = setInterval(function(){
    var now = performance.now(), dt = 0.1;
    st.forEach(function(s){
      var r = s.r;
      if(r.wreck > 0){ s.ahead = {}; s.lastX = r.x; return; }
      s.n++;

      /* --- completed overtakes ------------------------------------------
         A car that WAS ahead and is now behind has been passed. Identity comes from a tag put
         on the car the first time it is seen, so a de-spawn is not counted as an overtake. */
      var nowAhead = {};
      (R.traffic || []).forEach(function(o){
        var id = idOf(o), dz = o.z - r.z;
        if(dz > 0 && dz < 9000) nowAhead[id] = 1;
        else if(dz <= 0 && dz > -3000 && s.ahead[id]) s.passes++;
      });
      s.ahead = nowAhead;

      /* --- held up ------------------------------------------------------
         A SLOWER car within two seconds of travel, in the same lane. Two seconds rather than the
         engine's own window, so this is a statement about the road and not about road.js. */
      var reach = Math.max(1, r.spd) * 2.0;
      var held = 0;
      (R.traffic || []).forEach(function(o){
        var dz = o.z - r.z;
        if(dz <= 0 || dz > reach) return;
        if(Math.abs(o.x - r.x) > 0.30) return;
        if((o.spd || o.cruise || 0) >= r.spd) return;
        held = 1;
      });
      s.blocked += held;

      /* --- line ---------------------------------------------------------- */
      var near = LANE_X[0];
      for(var i = 1; i < 4; i++)
        if(Math.abs(LANE_X[i] - r.x) < Math.abs(near - r.x)) near = LANE_X[i];
      if(Math.abs(r.x - near) > 0.06) s.offCentre++;
      s.lat += Math.abs(r.x - s.lastX) / dt;
      s.lastX = r.x;
    });
  }, 100);

  P.racer.collect = function(){
    var secs = (performance.now() - P.racer.t0) / 1000;
    return st.filter(function(s){ return s.n > 0; }).map(function(s){
      return { num: s.r.num, passesPerMin: s.passes / Math.max(secs, 1) * 60,
               blocked: s.blocked / s.n, offCentre: s.offCentre / s.n,
               lat: s.lat / s.n, spd: s.r.spd, n: s.n };
    });
  };
  return true;
})
"""


def run_arm(browser, base_url, seconds, settle, mile, label):
    dt = drive_test_module()
    ctx = browser.new_context(viewport={'width': 480, 'height': 900})
    ctx.add_init_script(SEED_RNG)
    ctx.add_init_script(dt.INIT)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    try:
        page.goto(base_url + '/' + GAME, wait_until='load')
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller',
                timeout=5_000)
            page.wait_for_timeout(1_200)
        except Exception:
            pass
        page.wait_for_function('!!window.__probe.road', timeout=10_000)

        page.click('[data-act="play"]')
        page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5_000)
        page.click('[data-act="mode"]')          # TEST DRIVE -> SINGLE RACE
        page.wait_for_timeout(150)
        page.click('[data-act="drive"]')
        page.wait_for_timeout(400)
        page.evaluate('() => window.__probe.drive()')
        page.wait_for_timeout(int(settle * 1000))

        if page.evaluate('() => window.__probe.road.racers.length') == 0:
            raise SystemExit('[racer-test] no rivals - the race did not start, so there is '
                             'nothing to measure. The garage control may have moved.')
        page.evaluate(SAMPLER + '(%r)' % mile)
        page.wait_for_timeout(int(seconds * 1000))

        rows = page.evaluate('() => window.__probe.racer.collect()')
        page.evaluate('() => { clearInterval(window.__probe.racer.timer); '
                      'window.__probe.stop(); }')
        errors += page.evaluate('() => window.__probe.errors')
        return {'label': label, 'rows': rows, 'errors': errors}
    finally:
        ctx.close()


def field(arm, key):
    return [r[key] for r in arm['rows']]


ROW = '    {:<12} {:>10} {:>10} {:>11} {:>11} {:>11}'


def main():
    console_utf8()
    ap = argparse.ArgumentParser()
    ap.add_argument('--seconds', type=float, default=40.0)
    ap.add_argument('--settle', type=float, default=6.0)
    ap.add_argument('--repeats', type=int, default=3)
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()

    src = (ROOT / 'road.js').read_text(encoding='utf-8')
    found = re.findall(r'const MILE = 1 / ([0-9.]+);', src)
    if len(found) != 1:
        raise SystemExit('[racer-test] expected exactly one MILE in road.js, found %d' % len(found))
    mile = 1.0 / float(found[0])
    road_without_dodge(src)          # fail before a browser is launched

    print('racer-test  -  RLG-033 part 1  -  %gs per arm, %d pairs'
          % (args.seconds, args.repeats))

    pairs = []
    with sync_playwright() as p:
        browser = launch_chromium(
            p, headless=not args.headed,
            args=['--autoplay-policy=no-user-gesture-required', '--mute-audio'])
        for i in range(args.repeats):
            pair = {}
            for dodge, label in ((True, 'dodge on'), (False, 'dodge off')):
                httpd, port = serve(ROOT, dodge)
                try:
                    pair[label] = run_arm(browser, 'http://127.0.0.1:%d' % port,
                                          args.seconds, args.settle, mile, label)
                finally:
                    httpd.shutdown()
            pairs.append(pair)
            print('  pair %d of %d done' % (i + 1, args.repeats))
        browser.close()

    print()
    for label in ('dodge on', 'dodge off'):
        arms = [pr[label] for pr in pairs]
        errs = [e for a in arms for e in a['errors']]
        print('  ' + label.upper() + '   (%d rivals x %d runs)'
              % (len(arms[0]['rows']), len(arms)))
        if errs:
            print('    page errors: ' + errs[0][:110])
        print(ROW.format('', 'passes/min', 'blocked', 'off-centre', 'lateral', 'mph'))
        allrows = [r for a in arms for r in a['rows']]
        stat = lambda k: statistics.fmean(r[k] for r in allrows)
        print(ROW.format('field mean', '%.2f' % stat('passesPerMin'),
                         '%.0f%%' % (stat('blocked') * 100),
                         '%.0f%%' % (stat('offCentre') * 100),
                         '%.3f' % stat('lat'), '%.0f' % (stat('spd') * MPH)))
        # personality: how far apart the eleven cars are on each measure
        sd = lambda k: statistics.pstdev([r[k] for r in allrows])
        print(ROW.format('spread (sd)', '%.2f' % sd('passesPerMin'),
                         '%.0f%%' % (sd('blocked') * 100),
                         '%.0f%%' % (sd('offCentre') * 100),
                         '%.3f' % sd('lat'), '%.0f' % (sd('spd') * MPH)))
        print()

    print('  WHAT THE STEERING IS WORTH  -  dodge on against dodge off')
    for key, name, pct in (('passesPerMin', 'passes/min', False), ('blocked', 'blocked', True),
                           ('offCentre', 'off-centre', True), ('lat', 'lateral', False)):
        on = statistics.fmean(r[key] for pr in pairs for r in pr['dodge on']['rows'])
        off = statistics.fmean(r[key] for pr in pairs for r in pr['dodge off']['rows'])
        fmt = (lambda v: '%.0f%%' % (v * 100)) if pct else (lambda v: '%.3f' % v)
        print('    %-12s %10s  ->  %-10s' % (name, fmt(off), fmt(on)))
    print()
    print('  Read passes/min first. If it is the same in both arms, the rivals are not')
    print('  overtaking - they are being carried past slower cars by speed alone, and the')
    print('  lateral term is decoration. Read the spread row for personality: it is how far')
    print('  apart the eleven cars are, and a spread near zero is one driver run eleven times.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
