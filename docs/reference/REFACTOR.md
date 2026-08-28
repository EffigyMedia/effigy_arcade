# HANDING THE DRIVING GAMES TO A FRESH PAIR OF EYES

Written 2026-08-23, at the end of a long session on `road.js`.

    road.js        9,838 lines   177 functions   133 top-level bindings
    highway.html     750
    raceway.html   1,875

## Why a fresh model is the right instinct

I wrote nearly all of this, which means I am the worst reader of it. I know why
every odd line is there, so odd lines do not look odd to me. Someone reading it
cold has no such anchoring.

Three specific places where that will pay:

    step()        914 lines. It does physics, traffic, police, weather,
                  biomes, laps, the clock and the seams. Nobody designed it
                  to be that; it accreted, and I stopped seeing it.
    paintCar()    634 lines, and `paintFront` another 447 with a great deal
                  of shared reasoning between them expressed twice.
    zUnlocked()   585 lines. I could not tell you what most of it does.

## But the honest risk

**This session shipped broken builds three times** — a syntax error, a missing
file, and two games with no menu — and every one passed the checks that
existed. A refactor of 9,838 lines has far more surface than any of those.

The gap is not structure. **It is that there is no test that plays the game.**
`pack.sh` checks that files parse, that scripts resolve, that the catalogue
matches. It cannot tell you the car accelerates, the laps count, or the corners
slow you down. Every one of those has been verified this session by a
throwaway Playwright probe that was then deleted.

**If a refactor happens, the harness should come first.** Roughly:

    boot both games, drive 30 seconds, assert:
      no page errors
      speed rises above 150mph
      the HUD changes
      a lap increments in Raceway
      fuel and tyres fall
      the garage lists the expected cars

That is an afternoon, it is reusable forever, and without it a refactor is a
guess.

## What to hand over with the code

Things that are load-bearing and invisible:

  - **the seam contract.** `CFG.curvature/grade/hudScore/onReset/onStep/
    afterDraw/titleArt/garageButtons/garageActions/biome/roadSpan/curveK/
    circuitOnly/logoCool/logoHot`. Highway passes almost none of them; that is
    the design, not an oversight.
  - **the API is filled in two stages.** Anything a seam might touch is
    attached at the TOP of `ROAD()`, because `onReset` fires during setup,
    before the function returns. This has bitten three times.
  - **`k = 1 / (R * CURVE_K)`.** Curvature depends on radius and nothing else.
    Several days of work went into rediscovering that.
  - **the corner cap is a RENDERER limit, not a taste one.** Past 90 degrees
    the road leaves the frame.
  - **`paintProfile` and `paintQuarter` are deliberately unbuilt.** They are
    for a kart racer. Do not delete them as dead code.

## What I would NOT refactor

The painters look repetitive and are not: each body's proportions were tuned
against screenshots over many sessions, and the duplication is the record of
that tuning. Collapsing them into one parameterised painter would be elegant
and would lose the tuning.

---

# THE MENUS

29 buttons, all built by string concatenation into `openVeil(html, handlers)`.
Three screens: title, garage, end card.

## What is wrong with them

    everything is a wall of identical buttons \u2014 PLAY, OPTIONS, QUIT look the
    same as TIMED \u00b7 ON and HOT PURSUIT \u00b7 OFF, so a mode toggle reads as an
    action

    the garage does eleven jobs on one screen: car, paint, stripes, gearbox,
    mode, timed, pursuit, qualify, drive. It is a settings page wearing a
    game's clothes.

    nothing is grouped. There is no visual difference between "what I am
    driving", "what kind of run this is" and "go".

    Raceway inherited all of it, including HOT PURSUIT, which a circuit racer
    has no use for.

## What I would do

    1  SPLIT the garage. Car and livery on one screen; session settings on
       another reached from it. The car is the thing you came to look at and
       it is currently sharing space with a gearbox toggle.
    2  TOGGLES SHOULD NOT LOOK LIKE ACTIONS. A switch with a state belongs on
       a row with its label on the left and its state on the right, not in a
       button that says "TIMED \u00b7 ON".
    3  ONE primary action per screen, visually louder than everything else.
    4  LET A FORK HIDE WHAT IT DOES NOT USE \u2014 `CFG.garageHide:['chase']` so
       Raceway stops offering a police chase.
    5  The end card should show the SESSION: lap times, best lap, sectors,
       grid position. All of that is recorded and none of it is displayed.

Point 5 is the one with the most value per hour: the game now measures
qualifying, sector bests and lap times, and then throws them away.

---

# ADDENDUM — 2026-08-23, later session

The harness argued for above is built: `tools/drive-test.py` (drives both
games) and `tools/smoke-test.py` (boots all 18). See START-HERE.md. What it
found, beyond the corner numbers:

  - a first visit used to reload itself (`clients.claim` → `controllerchange`
    → reload); fixed in arcade.js with the `hadController` guard
  - sw.js: assets.js was in no cache list; a stale-link navigation now falls
    back to the launcher instead of the host's 404; staleWhileRevalidate
    could resolve to nothing; the dead `fillCache`/'precache' path is deleted
  - sync.sh shipped a fraction of the app (predated games/<cat>/, road.js,
    assets.js, fonts/) — rewritten, now refuses to push dead links
  - caches bumped to v24 for the engine change

One correction for the record: an early harness run reported Raceway tyres
dying in 20 seconds. That was the AUTOPILOT sawing the wheel — lateral load
is what wears tyres — not the game. Smoothed, wear is ~36%/lap: 2.8 laps of
life in a 5-lap race, which reads as tuned, not broken. Measure with a
steady driver before believing a number the driver can influence.
