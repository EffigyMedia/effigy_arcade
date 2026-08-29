"""Draw the whole fleet, unlit and lit, and save it as a picture.

RLG-053 converted every vehicle's lamps to a DECLARATION - one drawing, run unlit into the sprite
and again lit onto the screen. This renders that: every vehicle the engine can put on the road, each
one dark, then with its tail lit, then with an indicator lit, and the cruiser with its bar.

It is a deliverable and it is also the check a person can make in a second: if a lit lamp is not
exactly on top of the bulb in the dark cell beside it, the declaration has drifted - which is the
fault the whole ruling exists to make impossible. `tools/lamp-test.py` asserts the same thing in
numbers; this is the version you can look at.

The sprites come from the engine itself through `API.fleet()`, so nothing here knows how a car is
painted, and a body added later appears without this file being touched.
"""
import base64
import functools
import http.server
import importlib.util
import socketserver
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'fleet.png'


def _handover():
    try:
        import playwright  # noqa: F401
        return
    except ImportError:
        pass
    for c in (ROOT / '.venv' / 'Scripts' / 'python.exe', ROOT / '.venv' / 'bin' / 'python'):
        if c.exists() and c.resolve() != Path(sys.executable).resolve():
            sys.exit(subprocess.run([str(c), str(Path(__file__).resolve())] + sys.argv[1:]).returncode)
    raise SystemExit('[fleet-sheet] playwright is not importable and there is no project .venv')


_handover()

from playwright.sync_api import sync_playwright   # noqa: E402
from harness import console_utf8, launch_chromium  # noqa: E402


SHEET = r"""() => {
  const R = window.__probe.road;
  const fleet = R.fleet();

  /* ONE ROW PER VEHICLE, NOT PER LIVERY. The garage SALOON and the traffic sedan come out of the
     same painter with different paint, so showing both is showing the fleet twice - which is what
     the first version of this sheet did. Grouped by painter, and the row says who drives it. */
  const rows = [];
  const by = {};
  for (const v of fleet) {
    if (by[v.sig] === undefined) { by[v.sig] = rows.length; rows.push({ spr: v.spr, who: [v.name] }); }
    else rows[by[v.sig]].who.push(v.name);
  }

  const CELL = 190, PAD = 16, LABEL = 230, ROW = CELL + PAD;
  const heads = ['dark', 'braking', 'right', 'left', 'bar'];
  const cols = heads.length;
  const W = LABEL + cols*CELL + PAD*2;
  const H = PAD*3 + 44 + rows.length*ROW;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#0b0c10'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f0f2f6';
  g.font = '700 22px system-ui, sans-serif';
  g.fillText('EFFIGY ARCADE - THE FLEET, LAMPS DECLARED', PAD, PAD + 22);
  g.fillStyle = '#7c8199';
  g.font = '500 13px system-ui, sans-serif';
  g.fillText('every lamp is one drawing, run unlit into the sprite and again lit on top of it',
             PAD, PAD + 40);
  for (let i = 0; i < cols; i++)
    g.fillText(heads[i], LABEL + i*CELL + 8, PAD + 62);

  const drawCell = (spr, x, y, ids, blank) => {
    g.fillStyle = '#15171e';
    g.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
    if (blank) {
      g.fillStyle = '#2a2e39';
      g.font = '500 12px system-ui, sans-serif';
      g.fillText('none', x + CELL/2 - 14, y + CELL/2);
      return;
    }
    const s = Math.min((CELL - 18) / spr.width, (CELL - 18) / spr.height);
    const dw = spr.width*s, dh = spr.height*s;
    const dx = x + (CELL - dw)/2, dy = y + (CELL - dh)/2;
    g.drawImage(spr, dx, dy, dw, dh);
    if (ids && ids.length && spr.lamps) {
      g.save();
      g.translate(dx, dy); g.scale(dw/spr.width, dh/spr.height);
      g.globalCompositeOperation = 'lighter';
      for (const id of ids) if (spr.lamps[id]) spr.lamps[id](g, true);
      g.restore();
    }
  };

  let y = PAD*2 + 52;
  for (const r of rows) {
    const spr = r.spr, L = spr.lamps || {};
    const bar = Object.keys(L).filter(k => k.indexOf('bar.') === 0);
    g.fillStyle = '#e6e9f0';
    g.font = '600 15px system-ui, sans-serif';
    g.fillText(r.who[0], PAD, y + CELL/2 - 10);
    g.fillStyle = '#8d93a8';
    g.font = '500 12px system-ui, sans-serif';
    if (r.who.length > 1) g.fillText('also ' + r.who.slice(1).join(', '), PAD, y + CELL/2 + 8);
    g.fillStyle = '#5f6579';
    g.font = '500 11px system-ui, sans-serif';
    g.fillText(Object.keys(L).join('  '), PAD, y + CELL/2 + 26);

    drawCell(spr, LABEL + 0*CELL, y, []);
    drawCell(spr, LABEL + 1*CELL, y, ['tail']);
    drawCell(spr, LABEL + 2*CELL, y, ['turn.r'], !L['turn.r']);
    drawCell(spr, LABEL + 3*CELL, y, ['turn.l'], !L['turn.l']);
    drawCell(spr, LABEL + 4*CELL, y, bar, !bar.length);
    y += ROW;
  }
  return c.toDataURL('image/png');
}"""


def main():
    console_utf8()
    dt_path = Path(__file__).resolve().parent / 'drive-test.py'
    spec = importlib.util.spec_from_file_location('dt', dt_path)
    dt = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dt)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            b = launch_chromium(p, headless=True, args=['--mute-audio'])
            ctx = b.new_context(viewport={'width': 480, 'height': 900})
            ctx.add_init_script(dt.INIT)
            pg = ctx.new_page()
            pg.goto('http://127.0.0.1:%d/games/sw/interstate.html' % port, wait_until='load')
            pg.wait_for_timeout(1600)
            pg.wait_for_selector('#veil:not(.hidden) [data-act="play"]', timeout=10000)
            pg.click('[data-act="play"]')
            pg.wait_for_selector('#veil:not(.hidden) [data-act="drive"]', timeout=5000)
            pg.click('[data-act="drive"]')
            pg.wait_for_timeout(1500)
            url = pg.evaluate(SHEET)
            b.close()
    finally:
        srv.shutdown()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(base64.b64decode(url.split(',', 1)[1]))
    print('wrote %s (%d KB)' % (OUT.relative_to(ROOT), OUT.stat().st_size // 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
