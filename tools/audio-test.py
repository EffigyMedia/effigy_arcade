"""HARDPOINT AUDIO - does the sound actually follow the ship?

A sound test cannot listen. What it CAN do is read the Web Audio graph: every
held layer is a GainNode and an OscillatorNode with live values on them, so the
question "does the engine get louder when you open the throttle" has a number
behind it.

This exists because the whole point of the audio pass is that the layers are
CONTINUOUS and STATE-DRIVEN. A one-shot either fires or it does not, and a
missing one is obvious the first time you play. A held layer that has quietly
stopped tracking the throttle sounds like a game with an engine drone, and
nobody notices for a month.

What it asserts, in order:
  * the four held layers exist once the run has begun
  * engine level RISES with the throttle
  * engine pitch RISES with speed
  * burn is silent below 100% and audible above it
  * ENGINES DARK takes the engine to silence and leaves the air behind, which
    is the mechanic the game is built on
  * the alarm appears with heat and is silent without it
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

# PUSH THE STATE, THEN WAIT REAL TIME, THEN READ.
#
# The first version of this file looped snd.step forty times and read the graph
# immediately, and every measurement came back frozen at its starting value. The
# code was fine; the test was wrong. `setTargetAtTime` ramps from the AUDIO
# clock, so forty calls in one instant all re-target from the same moment and
# nothing has moved yet. The clock has to actually advance before a held layer
# is anywhere near where it was sent.
#
# So: one push, a real wait, then read. It costs about half a second per
# measurement and it is the only way the numbers mean anything.
PUSH = """(st) => {
  const s = Object.assign({thr:0, spd:0, heat:0, cut:0, hull:100}, st);
  snd.step(0.05, s, false);
}"""

READ = """() => {
  const g = l => (l && l.gain ? l.gain.gain.value : null);
  return {
    eng:  g(snd.eng),  engHz: snd.eng ? snd.eng.osc.frequency.value : null,
    burn: g(snd.burn), air: g(snd.air), alarm: g(snd.alarm)
  };
}"""

SETTLE = 520          # ms - long enough for the ramps to arrive


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
        page = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(f'{BASE}/games/em/hardpoint.html', wait_until='load')
        page.wait_for_timeout(2000)

        started = page.evaluate("() => { snd.begin(); return !!(snd.eng && snd.burn && snd.air && snd.alarm); }")
        ok(started, 'the four held layers exist once a run begins')
        if not started:
            print('\n  the audio context never opened - nothing else can be measured')
            b.close(); srv.shutdown(); return 1

        def sample(st, settle=SETTLE):
            page.evaluate(PUSH, st)
            page.wait_for_timeout(settle)
            return page.evaluate(READ)

        idle = sample({'thr': 0, 'spd': 0})
        half = sample({'thr': 50, 'spd': 160})
        full = sample({'thr': 100, 'spd': 320})
        burn = sample({'thr': 110, 'spd': 320})
        # THE SPIN-DOWN IS SLOW ON PURPOSE, so this one is given the time it
        # was designed to take. Engines do not stop like a switch, and the
        # 0.55s time constant means 520ms only gets a third of the way there -
        # which the first run of this test reported as a failure of the code
        # rather than of its own patience.
        dark = sample({'thr': 0, 'spd': 200, 'cut': 2.5}, settle=2200)
        hot  = sample({'thr': 105, 'spd': 300, 'heat': 95})
        hurt = sample({'thr': 60, 'spd': 200, 'hull': 12})

        ok(idle['eng'] < half['eng'] < full['eng'],
           'engine level rises with the throttle',
           f"{idle['eng']:.3f} -> {half['eng']:.3f} -> {full['eng']:.3f}")
        ok(idle['engHz'] < half['engHz'] < full['engHz'],
           'engine pitch rises with speed',
           f"{idle['engHz']:.0f}Hz -> {half['engHz']:.0f}Hz -> {full['engHz']:.0f}Hz")
        ok(full['burn'] < 0.002 and burn['burn'] > 0.02,
           'the burn is silent below 100% and audible above it',
           f"100%={full['burn']:.4f}  110%={burn['burn']:.4f}")

        # the mechanic the game is built on
        ok(dark['eng'] < 0.006,
           'ENGINES DARK spins the engine down to silence within ~2s',
           f"{dark['eng']:.4f} from {full['eng']:.3f}")
        ok(dark['air'] > full['air'],
           'and leaves the air louder than it was under power',
           f"under power {full['air']:.3f}, dark {dark['air']:.3f}")

        # A PULSE HAS TO BE MEASURED AS A PEAK, NOT AS A SNAPSHOT. Both alarms
        # are square pulses, so a single reading lands wherever the phase
        # happens to be - the first run of this check reported the heat alarm
        # as silent because it sampled during an off-beat, and passed anyway on
        # the hull alarm beside it. That is a check that would have missed a
        # genuinely dead alarm.
        def peak(st, ms=700):
            # SETTLE FIRST, THEN MEASURE. Without this the peak catches the tail
            # of the PREVIOUS state decaying, which reported an alarm on a
            # healthy ship purely because the sample before it had a failing
            # hull. A peak over a transition is not a peak of anything.
            for _ in range(6):
                page.evaluate(PUSH, st)
                page.wait_for_timeout(50)
            hi = 0
            for _ in range(14):
                page.evaluate(PUSH, st)
                page.wait_for_timeout(ms // 14)
                hi = max(hi, page.evaluate(READ)['alarm'])
            return hi

        quiet_alarm = peak({'thr': 100, 'spd': 320})
        heat_alarm  = peak({'thr': 105, 'spd': 300, 'heat': 95})
        hull_alarm  = peak({'thr': 60,  'spd': 200, 'hull': 12})

        ok(quiet_alarm < 0.002, 'no alarm when nothing is wrong', f"peak {quiet_alarm:.4f}")
        ok(heat_alarm > 0.004, 'the heat alarm sounds at redline', f"peak {heat_alarm:.4f}")
        ok(hull_alarm > 0.004, 'and a separate one for a failing hull', f"peak {hull_alarm:.4f}")

        ok(errs == [], 'no page errors', errs[0][:100] if errs else '')
        b.close()

    srv.shutdown()
    print(f"\n  {'audio follows the ship' if not bad else str(bad) + ' FAILURES'}")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
