#!/usr/bin/env python3
"""
HUD TEST - the thumb cluster stacks up from the pedals, and closes over what a car does not have.

    .venv/Scripts/python tools/hud-test.py
    .venv/Scripts/python tools/hud-test.py --shots

RLG-028. The owner: cars without NOS did not have the gauges collapse down to the pedals. Hiding the
bottle left the space it stood in, so a car without one drove with a hole in its instruments.

IT MEASURES BOXES, NOT PIXELS. Every element in the cluster is a positioned box, so the question
"did the stack close up" is a question about `getBoundingClientRect` - which is exact, and which does
not care what the road behind it is doing.

AND IT RUNS IN A TOUCH CONTEXT, because the shell hides the whole cluster on a device that reports no
touch (RLG-069): a desktop harness measures nothing and reports success.

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

/* every box in the thumb cluster, in CSS pixels from the BOTTOM of the stage - which is the
   direction the cluster is anchored in, so it is the direction to measure in */
window.__probe.cluster = function(){
  var h = document.documentElement.clientHeight;
  var out = {};
  ['pedals','gas','brake','nitro','shifter','paddles','dials','wheel'].forEach(function(id){
    var el = document.getElementById(id);
    if(!el) return;
    var r = el.getBoundingClientRect();
    var shown = r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none';
    out[id] = shown ? { bottom:+(h - r.bottom).toFixed(1), top:+(h - r.top).toFixed(1),
                        w:+r.width.toFixed(1), h:+r.height.toFixed(1) } : null;
  });
  out.nonos = document.body.classList.contains('nonos');
  out.manual = document.body.classList.contains('manual');
  return out;
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
        print(('  ok    ' if ok else '  FAIL  ') + label + ('' if ok else '   [' + str(detail) + ']'))
        if not ok:
            self.fails.append(label)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--shots', action='store_true')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()
    console_utf8()
    res = Results()
    out = Path(args.out) if args.out else ROOT / '_hud'
    if args.shots:
        out.mkdir(parents=True, exist_ok=True)
    httpd, port = serve(ROOT)
    print('hud-test  .  the cluster stacks up from the pedals')
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
        page.wait_for_timeout(1400)

        def cluster(body):
            # THE DIALS TRANSITION OVER 0.18s AND THE CLASS LANDS BEFORE THEY MOVE. Reading
            # 200ms after the car changes caught the class already on and the layout not yet
            # settled, which reads as "the stack did not close up" when it is still closing.
            page.evaluate('(k) => window.__probe.road.setBody(k)', body)
            page.wait_for_timeout(600)
            return page.evaluate('() => window.__probe.cluster()')

        withnos = cluster('ROADSTER')
        res.check(withnos.get('nitro') is not None and not withnos['nonos'],
                  'a car with a bottle shows one', str(withnos.get('nitro')))
        res.check(withnos.get('dials') is not None,
                  'and the dials are on screen', str(withnos.get('dials')))

        # LORRY and CAB are the two the fragment names as having a button they could never use
        nonos = cluster('LORRY')
        print('      with a bottle:  nitro %s  dials at %s'
              % (withnos.get('nitro'), (withnos.get('dials') or {}).get('bottom')))
        print('      without one:    nitro %s  dials at %s'
              % (nonos.get('nitro'), (nonos.get('dials') or {}).get('bottom')))
        res.check(nonos.get('nitro') is None and nonos['nonos'],
                  'a car with no bottle shows none', str(nonos.get('nitro')))
        res.check(nonos.get('dials') is not None,
                  'and still has its dials', str(nonos.get('dials')))

        drop = withnos['dials']['bottom'] - nonos['dials']['bottom']
        print('      the dials come down by %.1f px' % drop)
        res.check(drop > 20,
                  'the gauges collapse toward the pedals when there is no bottle',
                  'they moved %.1f px' % drop)

        # AND NOTHING LANDS ON A CONTROL. `#pedals` is a container that the bottle itself sat
        # inside, so measuring against ITS box says nothing - the first version of this check
        # failed on a layout the capture shows to be correct. The pads are the controls, and
        # they are what must stay clear.
        pads = [nonos.get('gas'), nonos.get('brake')]
        pads = [p2 for p2 in pads if p2]
        if pads and nonos.get('dials'):
            highest = max(p2['top'] for p2 in pads)
            res.check(nonos['dials']['bottom'] >= highest - 2,
                      'and they stop above the pedal pads rather than on them',
                      'dials at %.1f, the pads reach %.1f' % (nonos['dials']['bottom'], highest))

        if args.shots:
            page.evaluate('() => window.__probe.road.setBody("ROADSTER")')
            page.wait_for_timeout(250)
            page.screenshot(path=str(out / 'hud-with-nos.png'))
            page.evaluate('() => window.__probe.road.setBody("LORRY")')
            page.wait_for_timeout(250)
            page.screenshot(path=str(out / 'hud-no-nos.png'))
            print('      wrote %s' % out)

        errs = page.evaluate('() => window.__probe.errors')
        res.check(not errs, 'no page errors', str(errs))
        browser.close()
    httpd.shutdown()
    print(('\n%d check(s) failed' % len(res.fails)) if res.fails else '\nall checks passed')
    return 1 if res.fails else 0


if __name__ == '__main__':
    sys.exit(main())
