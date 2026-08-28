"""INTERSTATE OCCLUSION - are cars hidden, or are they missing?

Crest occlusion in this engine has been wrong twice, and both times it was
invisible to every gate: the road still drove, the console stayed clean, and the
only symptom was that things stopped being on it. One of those attempts culled
EVERY distant sprite and the note left in the source records the result - "23
cars in range, 0 drawn".

A screenshot cannot settle it either, because an empty road and a road whose
cars are all behind a hill look the same in one frame.

So this drives for a while and reads `API.spriteStats()`, which counts what the
sprite pass did rather than what it was asked to do:

  drawn    fully visible
  clipped  straddling a crest - drawn, cut off at the silhouette
  culled   entirely under a crest

What it asserts:
  * sprites are being drawn at all, in quantity          (the 0-drawn failure)
  * culling is not swallowing most of them               (the over-cull failure)
  * over a run with hills, at least some get CLIPPED     (partial occlusion
    actually happening, rather than the test being disabled again)
"""
import sys, threading, http.server, socketserver, functools

sys.path.insert(0, 'tools')
from harness import launch_chromium, console_utf8
from playwright.sync_api import sync_playwright

console_utf8()

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}'

SECONDS = 22


def main():
    bad = 0

    def ok(cond, label, detail=''):
        nonlocal bad
        if not cond:
            bad += 1
        print(f'  {"ok  " if cond else "FAIL"}  {label}' + (f'   {detail}' if detail else ''))

    with sync_playwright() as p:
        b = launch_chromium(p, headless=True,
                            args=['--mute-audio', '--autoplay-policy=no-user-gesture-required'])
        page = b.new_context(viewport={'width': 480, 'height': 900}).new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{BASE}/games/sw/interstate.html', wait_until='load')
        # THE FIRST VISIT RELOADS ITSELF. sw.js claims the client on activate,
        # arcade.js reloads on controllerchange, and anything clicked before
        # that lands on a document that is about to be thrown away - which is
        # why the first version of this test reached the title and no further.
        try:
            page.wait_for_function(
                '() => navigator.serviceWorker && navigator.serviceWorker.controller',
                timeout=5000)
            page.wait_for_timeout(1200)
        except Exception:
            pass

        # title -> garage -> drive, by the same handles the drive harness uses
        try:
            page.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
            page.click('[data-act="play"]')
            page.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
            page.click('[data-act="drive"]')
            page.wait_for_timeout(1200)
        except Exception as e:
            ok(False, 'could reach the drive', f'{type(e).__name__}: {e}')
            b.close(); srv.shutdown(); return 1

        has = page.evaluate("() => !!(window.__road && window.__road.spriteStats)")
        ok(has, 'the engine exposes spriteStats')
        if not has:
            b.close(); srv.shutdown(); return 1

        # hold the throttle so the road actually passes under us
        page.evaluate("() => { window.__road.setSpd && window.__road.setSpd(9000); }")

        tot = {'drawn': 0, 'clipped': 0, 'culled': 0}
        frames = 0
        for _ in range(SECONDS * 4):
            page.wait_for_timeout(250)
            st = page.evaluate("() => window.__road.spriteStats()")
            if st and (st['drawn'] or st['clipped'] or st['culled']):
                frames += 1
                for k in tot:
                    tot[k] += st[k]

        ok(frames > 0, 'the sprite pass ran', f'{frames} sampled frames')
        ok(tot['drawn'] > 200, 'sprites are drawn, in quantity',
           f"drawn={tot['drawn']} clipped={tot['clipped']} culled={tot['culled']}")
        seen = tot['drawn'] + tot['clipped']
        ok(seen > 0 and tot['culled'] < seen,
           'culling is not swallowing the road',
           f"visible={seen} culled={tot['culled']}")
        ok(tot['clipped'] > 0,
           'some cars are CUT OFF by a crest rather than deleted',
           f"clipped={tot['clipped']}")
        ok(errs == [], 'no page errors', errs[0][:100] if errs else '')
        b.close()

    srv.shutdown()
    print(f"\n  {'occlusion hides, it does not delete' if not bad else str(bad) + ' FAILURES'}")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
