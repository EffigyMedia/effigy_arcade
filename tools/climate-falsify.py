"""Put the half-migration back and prove biome-test catches it.

The failure RLG-109 was written to prevent is a road.js where SOME readers take
the climate instance and some take the recipe. It is silent: a place rolls cold
and rains anyway, and every screenshot looks correct.

THIS SCRIPT EXITS 0 ONLY IF THE GUARD FIRES. It edits `rollWeather` to read the
recipe - which is the exact half-migration - runs biome-test, and requires that
the run FAILS. A biome-test that passes against a defective engine is a vacuous
check, and this reports that as an error rather than as a pass.

It restores road.js on every path, including on its own failure.
"""
import shutil, subprocess, sys, os
from pathlib import Path

# the project root is two levels up from this file, the way every other harness
# here finds it. An absolute path written into a tracked file breaks the next
# time the environment moves - see Path_Policy.md.
ROOT = Path(__file__).resolve().parent.parent
ROAD = ROOT / 'road.js'
# the project-local venv, because Playwright cannot be installed into the
# environment's uv-managed Python. `python.exe` on Windows, `python` elsewhere.
PY_ = ROOT / '.venv' / 'Scripts' / 'python.exe'
if not PY_.exists():
    PY_ = ROOT / '.venv' / 'bin' / 'python'
BACKUP = ROOT / 'road.js.falsify-backup'

GOOD = "function rollWeather(){\n  if(optWeather === 'dry'){ wetTarget = 0; snowy = 0; wetNext = rnd(35, 80); return; }\n  const B = climate();"
BAD = GOOD.replace('const B = climate();', 'const B = bio();')
# the one check that must catch it, named so a rename cannot silently pass this
GUARD = 'the ENGINE rolls its weather against the instance'

def main():
    src = ROAD.read_text(encoding='utf-8')
    if src.count(GOOD) != 1:
        print('ABORT: rollWeather is not in the shape this proof knows how to break.')
        print('       The proof is stale, not the engine. Read it before trusting either.')
        return 2
    shutil.copyfile(ROAD, BACKUP)
    try:
        ROAD.write_text(src.replace(GOOD, BAD), encoding='utf-8')
        print('DEFECT IN: rollWeather now reads the recipe instead of the instance.')
        r = subprocess.run([str(PY_), 'tools/biome-test.py'], cwd=str(ROOT),
                           capture_output=True, text=True)
        out = r.stdout + r.stderr
        failed = [ln.strip() for ln in out.splitlines() if ln.strip().startswith('FAIL')]
        print('biome-test exit %d, %d check(s) failed' % (r.returncode, len(failed)))
        for ln in failed:
            print('   ' + ln)
        if r.returncode == 0:
            print()
            print('VACUOUS: biome-test PASSED against a half-migrated engine.')
            return 1
        if not any(GUARD in ln for ln in failed):
            print()
            print('WRONG GUARD: biome-test failed, but not on the check that names this defect.')
            print('             Something else broke; that is not proof of this one.')
            return 1
        print()
        print('PROVED: the guard fires on the half-migration, and it is the guard that names it.')
        # AND THE SILENCE IS THE POINT. Everything else stayed green, so this is one
        # check standing between the engine and a defect no screenshot would show.
        oks = sum(1 for ln in out.splitlines() if ln.strip().startswith('ok'))
        print('        %d other check(s) passed on the defective build, which is why it is silent.' % oks)
        return 0
    finally:
        shutil.copyfile(BACKUP, ROAD)
        os.remove(BACKUP)
        print('RESTORED: road.js is back to the committed build.')

sys.exit(main())
