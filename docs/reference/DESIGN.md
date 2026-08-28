# REAR ONLY — WHICH IS WHAT THE DESIGN ALWAYS WANTED

    LEAGUE   CAR        LAP    SLOWEST CORNER   BRAKING   CROSSINGS
    cup      ROADSTER    63s       99mph          7.0%       0
    gt       MATADOR      73s     102mph         10.1%       0
    gp       FORMULA      97s      96mph          9.3%       0.05

Every car on a circuit is going the same way, so every car you can see is
showing you its back. The angled views were solving a problem the design did
not have to have.

**Corner sweep is capped at 90 degrees.** Past that a pseudo-3D road has left
the frame and a rival is side-on, which needs art the game does not have. Capped,
the circuits become road courses of fast sweepers and right-angle corners — most
of Silverstone, none of Monaco — and the rear sprite is always correct.

## Sweep and radius are independent levers

Capping the sweep took GP's slowest corner from 123 to 147mph, because its
hairpins were the tightest and lost the most arc. **A capped corner is still
slow if its RADIUS is small**, so GP's radius came down from 3,800 to 2,300 and
it gained a fourth hairpin. Only one of the two levers is constrained by the
renderer.

## And that exposed a rename I had missed

Tightening GP's hairpins changed *nothing* — the numbers came back identical to
three decimal places. The spec branch still read `league === 'formula'`, so
asking for `'gp'` fell silently through to the CUP spec. **GP had been running
CUP's circuits since the rename**, and every measurement of "gp" I have reported
since was actually a cup track.

A rename that leaves one comparison behind is invisible: no error, no warning,
just a different branch quietly taken. The only reason it surfaced is that a
change which should have moved a number did not.

## The profile painters stay, unbuilt

`paintProfile` and `paintQuarter` are no longer generated, and are kept
deliberately: a KART RACER needs them, because a rival mid-drift is side-on by
definition. Dead until then.

# HOW BIG IS THE ART, ACTUALLY

The concern about my drawing was fair, so I measured rather than argued.

    AHEAD     WIDTH ON A 390px SCREEN     VIEW
     1200        137px                    rear
     2500         66px                    rear
     5000         33px                    quarter
     9000         18px                    quarter
    16000         10px                    quarter

**The angled views are drawn at 10 to 33 pixels.** I have been judging them at
210. At 33px a three-quarter is a coloured wedge with a dark window, which is
what it needs to be; at 10px it is four pixels of red.

The REAR view is the only one that ever gets large — 137px at the distance you
actually race someone — and that is precisely the art that already works.

## What this does and does not excuse

It does not make the three-quarter good. It does mean the budget for it is
**silhouette and colour**, not craft: the right outline, the window in the right
place, the near end darker than the far end. Detail is invisible before it is
drawn.

## The honest read on the art

Front and rear worked for reasons that do not transfer:

  - they are SYMMETRIC. Draw half, mirror it, and errors cancel. Symmetry
    itself reads as "car".
  - they were built over many sessions with correction on every part — the
    marques, the lamps, the arches, the stripes, the light bar. Dozens of
    rounds of being told what was wrong.

A profile has no symmetry. Every proportion is a free choice, and the side of a
car is the view people know best — a wrong wheelbase is obvious to everyone.

**The front and rear are good because they were art-directed, not because I can
draw.** The same will be true of anything else that has to look right, and the
side view will take more rounds, not fewer, because there is no symmetry to
lean on.

Where that leaves the options:

    1  keep iterating with tight feedback — works, and it is slow
    2  spend the effort where it shows: the 137px rear, not the 33px flank
    3  cap corners at 90 degrees so the angled views are barely needed
    4  you author the silhouettes, I do the shading, the palette wiring and
       the integration — which is the division of labour that has actually
       been working

# THE ANGLED VIEWS, PROPERLY DRAWN

The first pass was bad and the criticism was exact: **the three-quarter was the
profile painter with `squash:0.45`**, which makes a narrow side view, not a
three-quarter. And the profile itself was a slab with two circles.

## A three-quarter is TWO FACES

Not a compressed anything. It shows the TAIL and one FLANK at the same time,
meeting at the corner of the car — and that corner, with a highlight down it, is
the entire reason the view reads as three-dimensional.

    tail face     nearly square on, the left third, both lamps, rear glass
    flank         recedes right toward a vanishing point, narrowing
    the crease    a bright line where they meet
    far wheel     smaller and higher than the near one, which is perspective

`paintQuarter` is its own painter now.

**And my first attempt at it was a doorstop** — I ran the glass from the tail
all the way to the nose in one dark wedge. A cabin sits in the MIDDLE of a
flank: metal ahead of it, metal behind it, a roof that drops at both ends, and a
pillar between the side windows.

## The profile is a real side view

    a wedge, nose low, tail cut off square
    wheel arches PUNCHED OUT of the body with destination-out
    raked screen and a fastback tail, with a B-pillar
    sill shadow, door shut line, a wing mirror
    tail lamp left, head lamp right, because the car points right

The arches are the part that matters: cutting them out of the body rather than
drawing wheels on top is what stops it looking like a brick with circles.

## Still not right

The profile reads as a saloon rather than as whichever car it is supposed to
be — every body shares one silhouette, so a MUSCLE and a ROADSTER look
identical from the side. The rear sprites have per-body shapes; the angled ones
do not. That is the next thing, and it is the same `BODY` record driving it.

# BILLBOARD ANGLES — built, and honestly half-tuned

Your idea, and it is the right one: OutRun, Pole Position and SNES Mario Kart
all did exactly this. A car ahead in a corner is showing you its FLANK, and how
much depends on how far the road has turned between your z and theirs.

Three views now exist per body per paint — REAR, THREE-QUARTER, PROFILE — drawn
by one painter with a `squash` parameter, because a three-quarter IS a profile
seen at an angle. One sprite serves both hands: a left-hander is a right-hander
mirrored, so `drawSprite` takes a `flip`.

    yaw = the road's heading change between here and there
        = integral of curvature x CURVE_K over that stretch

## Two calibration failures worth recording

**First constant: 0.055.** Read off the screen-pixel slope cache. Measured yaw
never exceeded 0.06 radians over 30,000 units, so **every car stayed on REAR
and the whole system was dead code.** A feature that never triggers is worse
than no feature, because it looks finished.

**Then, integrating the real curvature: saturated at the clamp.** 21,000 units
ahead is 3.5% of a lap, and a circuit turns 360 degrees over one — so the angle
ran past 109 degrees and everything became PROFILE. Clamped to a right angle,
because past 90 degrees the road has left the frame and you cannot see the car
anyway.

## Where it stands

    +5s   3000 ahead   +25 deg   quarter
    +10s  3000 ahead   -90 deg   profile
    views chosen: quarter 1, profile 34

**It works and it is not balanced.** Cars flip to full profile far too eagerly —
the thresholds (0.16 and 0.52 radians) were chosen before I knew the real
distribution, and the answer is more views rather than different cut points:
eight angles instead of three would make it smooth rather than snapping.

That is the next pass, and it is cheap: the painter already takes an angle
parameter, so eight sprites is a loop bound rather than new artwork.

## Why this matters beyond Raceway

It is the same system a kart racer needs to show a rival mid-drift, and it is
the only way any pseudo-3D racer has ever handled the problem. The road still
cannot bend past 90 degrees on screen — that limit is unchanged — but the CARS
can now look right through a corner the road only hints at.

# THE ROAD WAS DRAWN STRAIGHT ON EVERY CIRCUIT

Asking "what does a hairpin look like?" was the right question, because the
answer turned out to be **it looks like a motorway**.

`rebuildBend()` integrates the visual bend over a span measured from
`curveSegs` — the ENDLESS road's segment list, which a circuit never fills. On
Raceway the span was one step, the bend cache held a single entry, and the road
rendered dead straight.

The map was right, the physics was right, the car was being shoved sideways by a
curvature the picture never showed. `CFG.roadSpan()` supplies a lap and a half.

**Fixed, but NOT yet verified in view** — my probe for jumping the car to a
specific point on the lap does not move it, so the screenshots still show the
start line. The bug and the fix are both certain; the picture is not.

# THE HARD LIMIT YOU ARE ASKING ABOUT

## A pseudo-3D road cannot draw a hairpin

The camera faces forward, always. Curvature is drawn by offsetting each slice
sideways in SCREEN pixels as it recedes — that is the whole trick, and it works
beautifully up to about a 90-degree turn.

Past that the road runs off the side of the frame and there is nothing to draw,
because a road that has turned 180 degrees is BEHIND the camera. There is no
sideways view to render it into.

    what a car ahead does in a hairpin today
      it slides toward the edge of the screen, gets smaller, and vanishes
      off the side. It does not turn to face you, because the renderer has
      no notion of a car's heading relative to the camera.

Three ways out, and they are genuinely different games:

    1  CAP THE CORNERS at about 90 degrees. Cheapest by far. The circuits
       become road courses with fast sweepers and no true hairpins — which
       is most of Silverstone and none of Monaco.
    2  ROTATE THE CAMERA with the car. That is real 3D, not pseudo-3D, and
       it is a different renderer: every sprite needs a heading, the road
       needs to be a mesh, and the whole `road.js` projection goes.
    3  CUT AWAY at the apex — an overhead or chase shot for the corner, then
       back. Cheap and it reads, but it takes control away at the exact
       moment control matters.

**Option 1 is what I would ship.** The generator already produces the corner
band; capping the sweep is one clamp. Options 2 and 3 are the same size as the
rest of Raceway put together.

## Crossovers, tunnels and overpasses need a second ribbon

`drawRoad` walks ONE ribbon indexed by z, far to near. A crossing means a
DIFFERENT part of the lap is visible in the same frame at a different place on
screen — the renderer has no way to express that, because a screen position is
derived from a single z.

To do it properly the road becomes a list of visible SEGMENTS rather than a
range of z, each projected independently and depth-sorted. That is a rewrite of
the thing everything else sits on.

**A tunnel is much cheaper and worth doing first:** it is a z-range with a roof
and a light change, and it needs no second ribbon at all. An overpass seen from
underneath is the same trick. Only a genuine crossing — where you can see the
road you will be on in two minutes — needs the rewrite.

## What I would do, in order

    1  verify the bend fix actually bends the road in view
    2  cap corner sweep at 90 degrees so the renderer is never asked for
       something it cannot draw
    3  tunnels, as a z-range effect
    4  curate the seeded tracks
    5  leave true crossings and overpasses until there is a reason to
       rewrite the projection — they are the most expensive item on the
       whole list and the least visible while driving

# COURSE LENGTH: THE NUMBERS ARE FINE, MY WRITE-UP WAS NOT

    LEAGUE   LAP     5-LAP RACE   FUEL LASTS   TYRES LAST (was)
    cup      62s      5.2 min      3.5 laps      14.2 laps
    gt       74.5s    6.2 min      2.9 laps      11.8 laps
    gp       90.2s    7.5 min      2.4 laps       9.8 laps

**Laps of 62-90 seconds are right** — an F1 lap is 70-110, a GT lap 90-120. A
five-lap race is 5-7.5 minutes, which is an arcade race. Courses do not need to
be longer.

"3.5 laps in 88 seconds" was me writing "the tank lasts 3.5 laps" ambiguously.
Sorry.

**But the same measurement caught a real error.** I claimed tyres lasted "about
two and a half laps". Measured properly they lasted **10 to 14** — longer than
any race, so tyres were decoration and only fuel decided anything. The claim
came from a ratio I never checked against a real lap time. Wear is now 1.90,
putting a MEDIUM at roughly three laps.

# AUTHORED VS PROCEDURAL: YOU ARE RIGHT, AND THERE IS A THIRD OPTION

Everything built in the last two passes — **sector bests, the live delta,
qualifying, lap records** — is about improving on a track you KNOW. A lap record
on a circuit you will never see again is meaningless. Procedural generation was
quietly undermining the features built on top of it.

But hand-authoring a few dozen circuits is a lot of work to produce something
the generator already makes well.

## SEED THE GENERATOR AND CURATE ITS OUTPUT

The generator is now **deterministic**: `buildCircuit(league, seed)` is a pure
map from a number to a track. Verified — seed 12345 twice gives 819,720 units
and 28 corners both times; a different seed gives a different track.

That turns it from a runtime feature into an AUTHORING TOOL. Run it offline
thousands of times, keep the good ones, ship the seeds. A curation pass over 120
seeds:

    tried 120, passed 118 (zero crossings, aspect under 1.45)
      seed  1000    22 corners  719k  aspect 1.18
      seed  8919    25 corners  704k  aspect 1.05
      seed 24757    26 corners  762k  aspect 1.01

**A track becomes a number.** Fixed, repeatable, nameable, learnable — and the
authoring cost is choosing from a list rather than drawing anything.

## What that gets us that neither pure option does

    authored          every track good, but weeks of work and a fixed count
    procedural        infinite, but no track is worth learning
    seeded + curated  every track good, learnable, named — and adding twenty
                      more is an afternoon of looking at minimaps

The next step is a curation run of a few thousand, judged on crossings, aspect,
corner mix and lap time, then a `TRACKS` table of the survivors with names. The
generator stays; it just stops running while you play.

# 2. SECTORS AND THE DELTA

A lap time tells you how you did after it is over. A DELTA tells you how you are
doing NOW, which is the whole hook of a time trial: "+0.31" against your best is
a reason to take the next corner differently.

The lap is cut in three by DISTANCE — real circuits place sector lines by feel,
but by distance is honest and needs no authoring. Each sector keeps the best it
has ever been, and the HUD shows the live delta against it.

    LAP 1/5   FUEL 83%   M 93%   S2 +0.41

Colouring follows the convention every timing screen uses, because it is read at
a glance and nobody has to be taught it: PURPLE for the best that sector has
ever been, GREEN for better than your own best, YELLOW for worse.

Verified over a full lap: sector bests recorded at **24.68 and 17.62**, and the
index advances S1 → S2 → S3 in order.

**A guard worth noting:** a sector only records if it lasted more than half a
second. Without it, a lap that starts mid-sector writes a fragment as a record
and the delta is nonsense for the rest of the session.

# AND IT EXPOSED A BALANCE BUG

The sector run showed **fuel empty in 54 seconds** — less than ONE lap of a
64-88 second circuit, when a race is five.

`0.55` was tuned before the corner fix tripled lap times, and nothing had
re-measured it since. Both consumables are now set against the lap times the
game actually has:

                     BEFORE            AFTER
    fuel burn        empty in 54s      59% left after 88s (~3.5 laps)
    tyre wear        untouched         90% left after 88s (~2.5 laps)

One stop is the natural plan; a SOFT forces two; a HARD makes one stop
comfortable at the cost of pace. **That is the choice the compounds exist to
offer, and it did not exist an hour ago** — fuel ran out before strategy could
matter.

I tuned tyres twice: 1.15 wore them out in a single lap, which is the same
mistake in the other direction.

# 1. QUALIFYING

The title screen shows a grid. The game did not have one — you were dropped
into a race in whatever position the field happened to leave you. Now a flying
lap decides where you start.

    A SINGLE RESULT
      your time    1:08.412
      pole         1:06.496
      last         1:11.922
      grid         P6 of 12

      #8   1:06.496
      #3   1:06.497        — a thousandth apart, which is what qualifying is
      #9   1:06.873
      #4   1:07.515

    GRID SLOT over 200 identical laps
      P1   1     P4   30    P7   35
      P2   2     P5   45    P8   23
      P3  18     P6   40    P9    6

Centred on P5-P6, with pole rare and reachable. A lap 4% quicker moves you most
of the way up the sheet, which is the pressure a qualifying session is for.

## The rivals do not drive

Their times are drawn around yours, biased slightly slower (-3.8% to +5.2%), so
a clean lap is rewarded and a scruffy one punished. Simulating eleven cars for a
minute would cost a minute of real time and give less control over the spread.

**This is a deliberate fake and it should stay one.** The alternative is a
loading screen.

## Two seams added to the engine

    CFG.garageButtons()      extra buttons in the pre-run panel
    CFG.garageActions(start) their handlers, given the engine's own start()

Highway passes neither and is unchanged. Raceway adds QUALIFY above DRIVE,
because it comes first, and the button reports the grid it won: `QUALIFY · P6`.

Qualifying ends itself: the first completed lap IS the session, so the lap
counter calls `finishQualifying()` and stops the run.

# CUP · GT · GP

`formula` is `gp`, and the entry rung is **CUP**.

    CUP   Roadster, Tuner, Muscle
    GT    Stallion, Matador, Crest
    GP    the open-wheelers

One-make cup racing — Porsche Cup, Clio Cup — is exactly what a three-car
single-class series IS, so the name is the real term rather than a label. And
all three are short, real, and read as a ladder: CUP · GT · GP.

"SPORTS" was a category description. CUP is a series.

# THE HORIZON BELONGS TO THE BIOME

Biomes changed the ground and the weather and left the skyline alone, so a
DESERT still showed a city of lit towers. What stands on the horizon is the
strongest single signal of where you are, and it was the one thing that never
changed.

    CITY       towers, lit windows            — the original
    DESERT     mesas: wide, flat-topped, far apart
    MOUNTAIN   peaks: tall overlapping triangles
    TUNDRA     the same peaks, on pale slate ground
    FOREST     a treeline: narrow conifers with trunks

One plan structure carries all of them, because a silhouette is a silhouette —
only the shape generator differs. Lit windows are a city idea and are suppressed
everywhere else. `buildSkyline()` is re-run whenever the biome changes, so
Highway's cycle rebuilds the horizon as it crosses.

# RACEWAY'S TITLE IS THE GRID

Not a road to a sunset and not a map. **The start grid**, seen from behind the
last row: two staggered columns on the painted boxes, the gantry overhead
running its five reds to green, packed grandstands either side, floodlight
pylons blooming above.

It is the one image that is unmistakably a circuit racer and could not be
mistaken for Highway — there is no horizon to drive toward, only the moment
before it starts.

The two faults from the first draft were both about the panel: the grid ran
under PLAY (rows now stop at 0.70 of the ground), and the gantry sat among the
cars rather than over them (moved in front of row one and widened).

# THE CORNERS WORK

    LEAGUE    CAR        LAP     SLOWEST CORNER   BRAKING   CROSSINGS
    sports    ROADSTER    64s        99mph          6.9%       0
    gt        MATADOR      75s      102mph         10.1%       0.05
    formula   FORMULA      88s      123mph          7.7%       0.10

Against where this started: **180mph corners and 1-3% braking**. Lap times of
64-88 seconds are what a real circuit runs, braking is in the 7-10% band, and
crossings stayed at zero.

## THE SCALE CONSTANT WAS THE LEVER

`k = turn / (len * K)`. At Highway's `0.00028` a corner tight enough to slow a
formula car had a radius of 320 units — crossed in 0.07 seconds, far too short
to brake for, so the car was flung off rather than slowed. Radius and duration
could not both be satisfied.

A SMALLER K makes a given radius bite harder, so the corner can be physically
large enough to last:

    K           R=4000     k      cap      time in corner
    0.00028      —        0.9    218mph    0.9s    not a corner
    0.000030     —        8.3    110mph    1.49s
    0.000022     —       11.4     94mph    1.74s
    0.000040     —        6.3    128mph    1.30s   ← shipped

`CURVE_K` is Raceway's own. Highway is untouched.

## AND CUSPS WERE THE REAL SLOWEST POINT

At 0.000022 the corners came out at **31mph** — a car park, not a hairpin. The
minimum radius was 265 where the hairpins asked for 3,800, which means leftover
spline cusps were the slowest point on every lap and the designed corners never
governed anything.

A cusp is one sample wide and invisible at speed. Curvature is clamped to the
tightest hairpin the league ASKED for, so the slowest point on a lap is now a
corner somebody designed.

    before clamp   min radius 265    slowest 31mph
    after clamp    hairpin governs   slowest 99-123mph

## WHAT THIS COST, AND WHAT IS LEFT

Nothing was lost: crossings 0, lap times went from 68s to 88s (better), and the
minimap is unaffected because `circuitShape` integrates with the same constant
the segments are built from — they cancel.

Still open:

    biome ART            a desert still shows city towers
    traffic queueing     written last pass, still unverified
    qualifying, sectors, start gantry, pit art, flags
    tyre grip -> cornerG defined, not connected

# THE CORNER PROBLEM, DIAGNOSED

## The minimap is NOT fake

First thing checked. The curvature the engine asks for matches the circuit's own
segments **421 of 421 samples**, and the path closes to exactly -1.000 laps. The
map draws the road the car drives.

## The governing equation

    k = 1 / (R * 0.00028)

**Curvature depends on the radius and NOTHING else** — not on how finely the arc
is sampled, not on how long it lasts. That single line explains why every
attempt for the last several passes failed: stretching, clustering, squeezing
and resampling all changed the SAMPLING and left the radius alone.

Solving it for the speed cap gives the band the generator had never produced:

    RADIUS      k      FORMULA    ROADSTER
     3000     1.19      218mph     176mph     not a corner at all
      900     3.97      159        106
      420     8.50      109         73
      320    11.16       95         63

I had been asking for 2,600. A hairpin is about 320.

## Two real bugs found and fixed on the way

**Hairpins are now explicit circles.** For each one, the span of path points is
replaced by points on a circle of the radius we want, tangent at both ends —
Cartesian geometry rather than a polar nudge. Verified: minimum radius is now
215-594 against the 340/430/520 asked for, where it used to be 49,000 or a cusp.

**The segment builder had a 400-unit floor.** `segLen = max(400, dist)` — and
`k = turn/(len*0.00028)`, so clamping the length UP crushes k DOWN. A hairpin's
points sit 59 units apart; the floor called that 400 and turned a curvature of
10.6 into 1.56, which is a motorway sweeper. **Every geometric fix I made was
correct and then thrown away on that line.** It is 12 now.

## AND IT STILL DOES NOT WORK — here is why

    R=340   arc 1068 units   at 200mph that is 0.07 SECONDS
    R=520   arc 1634 units   at 200mph that is 0.11 seconds
    R=1200  arc 3770 units   at 200mph that is 0.25 seconds

A correctly tight hairpin is crossed in **seven hundredths of a second**. No car
can brake for it, so the speed never falls — the car is simply flung off the
outside, which is a fail state, not a corner.

The radius is right and the duration is impossible, and the two cannot both be
satisfied at this scale. **The world scale and the speed scale are mismatched by
roughly ten times.** A 200mph car covers a 500,000-unit lap in 33 seconds, so
every corner on it is milliseconds long.

## THE FIX IS A SCALE CHANGE, NOT ANOTHER GEOMETRY PASS

Three candidates, and I have not chosen between them:

  1. **Change `0.00028` for circuits.** It converts radius to curvature. A
     larger constant makes a given radius bite harder, so a hairpin can be
     physically bigger and still slow the car. Cheapest, and it only affects
     Raceway if it is passed through a seam.
  2. **Slow the cars in world units** — same mph on the dial, fewer units per
     second. Changes every distance in the game.
  3. **Make the tracks ten times larger** and keep the corner radii where they
     are. Laps become minutes, which may be right for a circuit anyway.

Option 1 is the one to try first: it is one number, it is testable in a pass,
and it leaves Highway untouched.

# FOUR MORE FIXES

## Traffic queues behind YOU

The car-ahead loop only ever looked at other TRAFFIC, so a car came up behind a
slow or stopped player and drove straight through them. You are a car on the
road like any other: same 5,000-unit look-ahead, same lane test, same
`gap < 420 ? 0 : spd + gap*0.35` rule.

**Written and shipped, NOT verified.** My probe could not reach the traffic
array to seed a controlled case, and I ran out of room to add the accessor. It
is a nine-line change mirroring a loop directly above it, but treat it as
unproven until you drive up to a queue.

## The car slides in the wet

Lateral position converged on the target however wet the road was — rain and
snow changed the cornering force and nothing about the STEERING.

    slick = 1 - wetGrip()
    carry = min(0.86, slick x (snow ? 2.6 : 1.5))
    slideX = slideX x carry + steerInput
    playerX += slideX

Dry, `slideX` is discarded every frame and the handling is exactly what it was.
Wet, some lateral velocity survives into the next frame; **in snow, most of it
does** — which is why snow is a curve and not a dimmer version of rain. Hitting
a barrier zeroes it, because a wall does not care how slippery the road is.

## The gate shows the gears the car HAS

Three rails and six slots for every car, so a LORRY and a MUSCLE car — both
four-speeds — were shown a pattern with gears they do not have.

    MATADOR   6   (three rails, six slots)   the original
    TUNER     5   gears5                      two and a half rails
    ROADSTER  5   gears5
    MUSCLE    4   gears4                      two rails, four slots
    LORRY     4   gears4

Verified: the body class follows the body. The plate narrows with the gate, so a
four-speed is a smaller object, not a six-speed with bits hidden.

## Raceway is not a highway any more

`CFG.circuitOnly` removes civilian traffic, police, speed traps, roadblocks and
crates. Verified 0 cops after four seconds at full throttle.

# STILL OPEN

    the minimap may be fake      unproven that the curvature the car feels is
                                 the curvature the map draws — the first thing
                                 to check now the highway furniture is gone
    biome ART                    a desert still shows city towers
    corner speeds                the blocker, unchanged
    traffic queueing             written, unverified

# THE HAZE WAS DRAWN OVER THE VERGE

Four passes on this, and the answer was one line moved.

    drawWorld();
    drawRoad();
    drawHaze();     <-- painted a lighter film across everything it overlapped

`drawHaze()` ran AFTER `drawRoad()`. Wherever the haze band and the verge
overlapped, a translucent strip was laid on top of grass that was already the
right colour. That is the seam under the skyline.

**Haze is atmosphere BEHIND the road, not a film over it.** Moved above
`drawWorld()`, so it sits on the sky and the distant ground and the road and
verge draw over it — which is what distance actually does.

## FOUR WRONG DIAGNOSES, IN ORDER

    1  the base fill was purple-blue      changed it to green. Band remained.
    2  the base ignored the biome         made it biome-aware. Band remained.
    3  the base was a flat colour         made it a gradient. Band became a WALL.
    4  the road stopped short             DRAW 95 -> 150. Genuinely a bug, and
                                          it did shrink the band — but it was
                                          not this bug.
    ✓  the haze was drawn on top          moved it before the road.

Every one of the first four was about what was UNDERNEATH. The problem was
always what was on TOP. I had even found and thinned this exact draw two passes
earlier — dropped its alpha from 0.50 to 0.16 — and called it fixed, when
lowering the alpha of a film only gives you a fainter film.

**"It draws a haze OVER the verge where they overlap" was the whole answer**,
and it took being told twice.

# THE GROUND BAND: THE ROAD WAS STOPPING SHORT

Three passes blamed the COLOUR of the ground base. The screenshot proved it was
never a colour problem.

`DRAW = 95` segments. The road and its verge simply **ran out before the
horizon**, and the base fill showed through the gap as a band under the
skyline. Whatever colour that fill took, a band was going to be there.

**Making it a gradient made it worse, and that is what proved it** — the ramp
made the gap obvious instead of hiding it, which is the most useful failure of
the three. `DRAW = 150` now, and the road reaches the skyline.

    attempt 1   purple-blue → green          wrong colour, band remained
    attempt 2   green → biome colour          wrong colour, band remained
    attempt 3   flat → gradient               band became a WALL
    actual      DRAW 95 → 150                 the road reaches the horizon

I spent three passes tuning the paint on a hole.

# RACEWAY WAS RUNNING HIGHWAY'S WORLD

You were right: it had civilian traffic, police, speed traps, roadblocks and
repair crates on a closed circuit. A track with a lorry on it is not a race, and
it is why the game still felt like the highway with a map in the corner.

`CFG.circuitOnly` turns all of it off — spawners, waves, crates, cop logic, the
trap and super-cruiser watches. Verified: **0 cops in Raceway** after four
seconds at full throttle, where Highway had its usual complement.

# STILL WRONG — reported, not fixed

    the minimap             may be drawing a track the drive does not follow;
                            I have not proved the curvature the car feels is
                            the curvature the map shows
    gearbox UI              4- and 5-speed cars use the 6-speed gate
    biome ART               grass and weather change; the SKYLINE does not —
                            a desert still shows city towers
    lateral grip in the wet the car still stops dead sideways; it should keep
                            sliding, more in snow than rain
    traffic behind you      cars drive THROUGH a slow player instead of
                            slowing and queueing
    corner speeds           the outstanding blocker, unchanged

# COURSE GENERATION: PARTIAL PROGRESS, NOT A FIX

The measured fault was DURATION, not sharpness: a tight radius that exists for
400 units is crossed in six hundredths of a second, so the brakes never do
anything.

The path is now resampled — every sample whose local turn is in the top 20% for
that track gets three more inserted along its own arc, which stretches the
corner without changing its radius.

    BEFORE                        AFTER
    sports   brake 2.9%  155mph   brake 4.1%  155mph
    gt       brake 2.1%  162mph   brake 3.8%  171mph
    formula  brake 1.2%  182mph   brake 2.4%  192mph

**Braking roughly doubled. Corner speeds did not fall at all.** So the stretch
is doing something real — more of the lap is spent slowing down — but not the
thing that matters: a formula car still never drops below 192mph against a
target nearer 60-80.

And it cost something. Lap length went from ~200k to 600k-1,290k units, because
inserting samples adds road. The lap TIMES are unchanged (46-78s) only because
the added road is corner road taken slowly — but the geometry is now much
larger than the minimap assumes.

## WHAT I THINK IS ACTUALLY WRONG

Stretching a corner makes it longer at the SAME radius. The car arrives at
218mph, and a corner it can take at 192 does not slow it below 192 however long
it is. **The radius has to come down, not the duration** — duration only decides
how long you sit at the cornering limit once you are there.

Which means the real target is the one measured two passes ago: the generator
produces radii of either ~250 units (a cusp) or ~49,000 (a sweeper) and almost
nothing between. A corner that caps a formula car at 70mph needs a radius near
3,000-6,000 sustained, and the polar construction has never produced that band.

**This needs the hairpin built in Cartesian space** — an explicit circle of the
radius you want, spliced into the loop — which is the change I identified
earlier and have still not made. Everything since has been attempts to reach
that band by adjusting the polar construction, and none of them has.

# RACEWAY'S TITLE, REDONE AS A SIBLING

The overhead map was legible and cold — an information graphic, not a title.
It is Highway's dusk now: the same sky ramp, the same banded sun, the same grid
running toward you, the same warm wordmark. What changed is the ROAD.

    Highway    a straight running dead to the horizon, city towers behind it
    Raceway    a kerbed circuit sweeping into a corner, GRANDSTANDS behind it,
               a start gantry over the track with five reds counting down

Same world, different promise. That is what a sibling title should do, and it
is why the green wordmark went back to chrome — a different palette said
"different game" when the point is "same game, different discipline".

**Three passes to make it legible, and each fault was a measurement I had not
taken:**

    the road ran off frame        bend 0.16 → 0.055
    the near half sat behind PLAY y0 h*0.98 → h*0.76, gantry t 0.30 → 0.50
    the tarmac was invisible      #1d1a24 on a #1a0b26 ground. Only the centre
                                  dashes read. Tarmac has to be LIGHTER than
                                  the land it crosses — #2f2b3a now, with the
                                  kerbs in red and white rather than a dark
                                  plum that vanished the same way.

# THE HAZE WAS HALF OPAQUE

Not a colour mismatch and not the streetlights — `drawHaze` was painting a
grey-blue gradient at **0.50 alpha over a band 13% of screen height**, and it
runs AFTER the road. So a translucent sheet sat across the far verge, the base
of the skyline and the first stretch of tarmac, every frame.

That is the ghosting: the verge was not showing through anything, something was
being drawn on top of IT.

    was    a = 0.50   d = 13% of H   full strength at the horizon line
    now    a = 0.16   d =  7% of H   faded at the line, peaking just below it

Real distance haze is barely there. 0.16 over 7% reads as depth; 0.50 over 13%
reads as fog on the lens. Fading the top stop also stops it drawing a hard edge
along the horizon.

**Two earlier attempts at this missed because I was looking for the wrong kind
of fault.** I checked the ground colour twice — first the purple-blue base, then
the biome mismatch — and both were real bugs, but neither was THIS one. A veil
drawn over the scene and a wrong colour underneath it look identical in a
screenshot; the difference is only visible in the draw order.

# THE GROUND UNDER THE SKYLINE, AGAIN

I fixed this once by changing the base fill from purple-blue to green. Biomes
then made it wrong a second way: a **fixed** green under a DESERT's sand, under
a TUNDRA's slate, and under settled snow.

`groundBase()` derives it from the biome's own verge colour — darkened a shade,
whitened by `settle`, dimmed at night. It cannot drift from the verge again
because it is computed from the same value.

**A constant that happened to match is not a fix**, it is the same bug waiting
for the next feature. The first version was only ever right for one biome
because there was only one.

# RACEWAY HAS ITS OWN TITLE

Highway's title is a sunset at the end of an endless road — the wrong promise
for a circuit racer, and it was showing HIGHWAY over it as well.

Two seams:

    CFG.titleArt   gets the context and geometry, returns true if it drew the
                   scene. Anything it does not draw falls through, so a fork
                   can replace the whole picture or none of it.
    CFG.logoCool   the wordmark palette. `AR.wordmark(g, 'HIGHWAY', ...)` was
    CFG.logoHot    hardcoded; it reads `GAME_TITLE` now.

Raceway's is a track seen from ABOVE — the minimap idiom the game already uses,
drawn large and floodlit, with two cars running a lap and the pit straight in
red. **It uses the real generator**, so the title is showing a circuit the game
could actually deal you, and the name and corner count print underneath.

Cold chrome and track green against Highway's warm chrome, so the two read as
siblings rather than reskins.

# BIOMES, SNOW, AND FUEL THAT KNOWS ABOUT REVS

## BIOMES — shared, and they decide the weather

One record per place. The ground, the skyline and the WEATHER ODDS all come
from it, so a desert cannot snow and a tundra is rarely dry:

    BIOME       RAIN   SNOW   CLEAR   verge
    FOREST      42%     6%     52%    deep green
    DESERT       4%     0%     96%    sand
    MOUNTAIN    30%    34%     36%    grey-green
    CITY        38%    10%     52%    concrete
    TUNDRA      10%    62%     28%    pale slate

**A circuit is somewhere; a highway goes somewhere.** Raceway pins one biome per
course through a `CFG.biome` seam — verified across six runs: TUNDRA, CITY,
TUNDRA, MOUNTAIN, DESERT, CITY, and each stayed put for the whole race. Highway
cycles every 70-130 seconds and announces the change.

## SNOW

    falls    rounder, slower, drifting sideways — not a streak leaning with
             the speed, because that is rain
    settles  `settle` climbs while it snows and decays slowly after, whitening
             the verge by up to 85% toward white
    costs    grip -52% falling and -14% more from settled snow; braking -46%
             and -12%. Worse than rain, and it KEEPS costing after it stops.

The road wash goes white rather than dark, which is the difference between a
wet road and a covered one.

## FUEL IS THROTTLE x RPM

It was a function of SPEED, which is wrong: an engine drinks by how hard it is
working and how fast it is spinning, not by how far along the road it happens to
be.

    burn = 0.30 + throttle x revFrac^1.35 x 2.15

A car held at the limiter in second now burns far more than the same car loafing
at the same speed in sixth — which is the whole reason a driver short-shifts to
save fuel. Measured at full throttle: 100 → 91 → 82 → 73 → 64.

## THE SAME ORDERING TRAP, TWICE MORE

`BIOME_KEYS` was attached to the API at the END of ROAD(), but `onReset` fires
during setup — so a fork picking its biome got `undefined`. It is a function
attached at the top now, with the other lazy helpers.

That is the third time this session a seam has needed something the API had not
filled in yet. **Anything a seam might touch belongs at the top of the factory,
not the bottom.**

# WEATHER (SHARED) AND THE PIT LANE

## WEATHER — in road.js, so Highway gets it too

Rain is not a circuit idea; a wet highway is as good a reason to lift as a wet
corner. One number, `wet`, 0 to 1, and everything reads it:

    grip      falls to 62% of dry — `cornerG` rises and the car runs wide
    braking   falls to 68%, which is what actually catches people out
    look      the road darkens and picks up a sheen; 90 streaks lean with speed

It builds and clears over 35-80 seconds rather than switching, so a run HAS
weather rather than a weather setting. `optWeather` selects dry, mixed or wet.

**A grip change nobody can see is a bug report**, which is why the visuals went
in at the same time as the physics rather than after.

## FUEL, TYRES AND THE PIT LANE — Raceway

    FUEL   burns with the THROTTLE, not with time, so a lap at full noise costs
           more than a lap spent braking
    TYRES  wear with LATERAL load, so corners eat them and straights do not
    PIT    the last 9% of the lap. Under 60mph the crew works — fuel in at a
           fixed rate, tyres back to new. The time lost is the price.

Measured over 24 seconds at full throttle:

    fuel 100 → 94 → 88 → 81 → 74 → 69 → 65
    tyre 100 → 100 → 99 → 98 → 97 → 97 → 97
    HUD  LAP 1/5   FUEL 65%   M 97%

Fuel is the pressure on a short race and tyres on a long one, which is the
split that makes compound choice a decision. Three compounds are defined —
SOFT grips 1.10 and wears 1.70, HARD 0.92 and 0.62 — though the tyre grip is
not yet wired into `cornerG`.

## TWO FAILURES WORTH RECORDING

**A `const` in the temporal dead zone.** `hudScore` is called during ROAD()'s
setup, before the game file has finished executing, so `const COMPOUNDS` threw
`COMPOUNDS is not defined` and took the whole game down. `var` hoists, which is
what a value the engine may ask for during construction needs.

**An edit that silently did nothing.** My anchor was `let R = {}`, which an
earlier pass had already changed to a Proxy — so the definitions never landed
while the CODE THAT USED THEM did. The game loaded, threw on the first frame,
and reported fuel 100 forever. A replace that matches nothing should be an
error, not a no-op; I check the grep count after every edit now for exactly
this reason and skipped it here.

## STILL TO DO

    pole position lap     qualifying — the time-trial mode with a grid result
    start/finish line     a visible gantry and lights
    tyre grip → cornerG   defined but not yet connected
    pit road ART          it is a speed zone with no visual yet
    flags, environments, bridges

# THE FRONT LIGHT BAR

The tail drew one for any `force` body and the nose drew none, so the super
cruiser had a bar you could only see in a mirror.

Same proportions as the rear, exactly:

    housing   0.24 to 0.76 across, 0.045 tall
    lenses    0.235 wide each, inset 0.005
    stanchions at 0.285 and 0.695, 0.020 wide

Only the Y differs, because the two painters build their cabins differently:
the tail works from `cabinTop` and the nose from its own `roofT`. The bar sits
on that roof at `roofT - 0.030h`.

**The colours mirror.** Seen head-on the car's own left carries the red and its
right the blue — the reverse of the view from behind, which is what you would
actually see walking round the car.

Verified by cropping the REAL fleet sheet rather than a probe, after last pass's
lesson about tests that reimplement what they are testing.

# WHERE DEVELOPMENT STANDS

## HIGHWAY — essentially complete

    six cars from the start   three SPORTS, three SUPER
    gold in SUPER             unlocks FORMULA
    gold in SPORTS            unlocks five IRIDESCENT paints
    rivals                    run the class YOU chose
    CRUISER                   20 timed miles under pursuit
    SUPERCRUISER              the same, at a 180mph AVERAGE
    speed traps               parked cruisers, anything over 80mph engages them
    super cruisers            sustained 150+ with heat; count scales with heat
    stats                     top speed, 0-60, grip, braking, horsepower, MASS
    launch                    rev in neutral, drop it, power-to-weight decides
    NOS                       fast classes only
    slipstream, mirror, brake lights, countdown, music — all done

## RACEWAY — the circuit works, the corners do not

    DONE      closed loops, zero crossings, three leagues, lap counting,
              the minimap, and everything shared from road.js
    OPEN      **corners are too fast to matter.** A formula car never drops
              below 182mph and braking is 1-3% of a lap against a target of
              ~15%. The tight radius exists but only across a few hundred
              units, so at 218mph the car is through the apex before the
              brakes do anything.

              The fix is geometric: a hairpin needs its tight radius SUSTAINED
              over several thousand units, which means control points clustered
              in a genuine arc rather than one apex between two squeezed
              neighbours. Attempts so far either did nothing or produced cusps
              and crossings.

    THEN      qualifying, sector times, pit lane, fuel, tyres, environments,
              flags, weather — in that order
    QUEUED    bridges, once shapes are settled

## AND ONE MORE MEASUREMENT LESSON

The super cruiser's wheel was still round in the sheet after I reported it
fixed. `MK` is the MARQUE, and the super cruiser wears the CRUISER's — so
testing `MK !== 'SUPERCRUISER'` could never exclude it. The BODY key is what
identifies the car.

**My probe reported flat-bottom because it REIMPLEMENTED the check rather than
calling it.** A test that rewrites the logic it is testing will agree with
itself no matter what the game does. The fleet sheet, which draws the real
thing, was the only honest witness.

# THE LIGHT BAR, MEASURED ON BOTH AXES

Sampling the built sprites for the rows and columns where the strong blue and
strong red pixels actually are:

    VERTICAL
      CRUISER        rows 18-22 of 164     mid 0.122
      SUPERCRUISER   rows 49-53 of 168     mid 0.304

    HORIZONTAL (both cars agree to three decimals)
      blue head      centre 0.370 of sprite width
      red head       centre 0.625
      each head      0.235 wide

Both bars are drawn from the same 0.24-0.76 span, which is why the X figures
match even though the Y figures are a third of a car-height apart.

Against the car's CENTRE, the heads are at **-0.130 and +0.125** — not the
±0.20 the glow was using, which put each one about seventy thousandths of a
car-width outboard of the lens it was meant to be lighting. They were also
**0.17 wide against a real 0.235**, so each glow was narrower than the lamp
under it.

    was    bx = p.x ± 0.200w    head 0.170w    by = p.y - 0.90h
    now    bx = p.x - 0.130w or + 0.125w
           head 0.235w
           by = p.y - h*(1 - barY)

**Three rounds of adjusting by eye, then one probe.** Every time I have guessed
at a coordinate this session it has taken several passes; every time I have read
the pixels it has taken one. The measurement is the cheap part.

# THE LIGHT BAR, MEASURED

`h*0.90` was one number for every force car. Sampling the built sprites for the
rows where the strong blue and strong red pixels actually are:

    CRUISER        rows 18-22 of 164    mid 0.122
    SUPERCRUISER   rows 49-53 of 168    mid 0.304

Nearly a third of a car-height apart. The estimate happened to land on the
cruiser's bar and floated well above the super cruiser's.

`barY` is that measured fraction, stored on the BODY record. The sprite is drawn
from `p.y - h` to `p.y`, so the head goes at `p.y - h*(1 - barY)`. Any future
force car declares its own, and nothing is guessed.

**Two rounds of adjusting by eye got nowhere.** Reading the pixels took one probe.

# NOS IS NOT FOR EVERYONE

Every driveable body had a bottle, including the LORRY and the CAB.

    NOS      FORMULA, the three SUPER, the three SPORTS, SUPERCRUISER
    no NOS   CRUISER, COUPE, SALOON, CAB, PICKUP, VAN, LORRY

Gated at all three entry points — the touch button, the keyboard, and the pad —
because any one of them left open is the whole rule undone. `body.nonos` also
hides the button and the gauge, so a car without a bottle does not show one.

# THE SUPER CRUISER'S WHEEL

It is a MATADOR underneath, so it keeps the supercar's flat-bottomed rim rather
than the patrol car's round one.

    FORMULA        flat-bottom      CRUISER    round
    MATADOR        flat-bottom      ROADSTER   round
    SUPERCRUISER   flat-bottom      LORRY      round

# THE SUPER CRUISER GETS ITS LIGHTS

Three separate things were hardcoded to the word `CRUISER`, so a second police
car had a livery and no way to use it:

    inCruiser()          the horn-latch, the siren, the traffic scatter
    the player light draw the two heads and the wash on the road
    paintCar             never drew a BAR at all — only `paintRig('cop')` did

All three read a `force` flag on the BODY record now. Declaring a car as force
gets it the whole machinery: latching horn, siren at 1.25, traffic scattering at
90%, the alternating heads, the coloured wash, the two-paint palette, and a bar
on its roof.

    CAR            force   bar UI   paints
    CRUISER        yes     yes      WHITE/BLACK
    SUPERCRUISER   yes     yes      WHITE/BLACK
    MATADOR        no      no       all twelve
    ROADSTER       no      no       all twelve

**And the bar sat above the roof, not on it** — the same trap the stripes fell
into months ago. The cabin BOX starts at `cabinTop`, but the drawn roof is a
curve inset from it, so anything placed at `cabinTop` floats. A third of the way
down the cabin span is where the metal actually is.

I had also written a whole second `playerBar()` function before noticing the
game already draws one; the only thing wrong with it was the body name in its
condition. Reading before writing would have saved the detour.

# THE SUPER CRUISER IS A REAL CAR NOW

It was only a sprite — no stats at all — so nothing in the game could ask how
fast it was and it could not appear on a fleet sheet. It has a `BODY` record
like everything else, and its picture is built FROM that record, so the two can
never drift apart.

    CAR            TOP   HP   MASS   P/W    GRIP  BRAKE  BOX   0-60
    SUPERCRUISER   184   690   1770   1.30   1.38  1.44   6sp   3.1s
    MATADOR        194   690   1580   1.46   1.38  1.28   6sp   2.9s
    CRUISER        190   370   1810   0.68   0.92  1.00   5sp   4.0s

**Against the MATADOR it is taken from:** the same engine, the same gearbox, the
same grip — and **190kg of equipment**. Cage, radio, lights, ram bar. That mass
is the entire difference and it does the whole job:

    top speed   −10mph      it cannot outrun what it chases
    0-60        +0.2s        it cannot out-launch it either
    braking     +12%         because that is what a pursuit car gets

So it can stay with a supercar and it cannot beat one, which is exactly what a
police interceptor should be. Note it is a far more serious car than the
ordinary CRUISER: nearly twice the power-to-weight and a whole second quicker to
sixty.

**`npc:true`** keeps it out of the garage — 14 selectable bodies, 1 NPC — while
still giving it stats and a place on the fleet sheet. That flag is now the
general mechanism for a car that exists in the world but is not yours.

The fleet render is fifteen vehicles: rear, front and wheel.

# MASS — WHAT HORSEPOWER PUSHES AGAINST

Horsepower had nothing to work against, so I was using `pull` as a stand-in for
weight. That was wrong twice over: `pull` is torque, and a lorry with 420hp was
being held back by a number that means something else entirely.

Mass is kilograms and it does one job: divide the power.

    CAR        HP    MASS kg   P/W    LAUNCH
    FORMULA   1000      740    4.50   SMOKE
    STALLION   710     1520    1.56   SMOKE
    MATADOR    690     1580    1.46   SMOKE
    MUSCLE     480     1720    0.93   SMOKE
    TUNER      320     1290    0.83   SMOKE
    ROADSTER   240     1010    0.79   SMOKE
    COUPE      210     1340    0.52   SMOKE
    SALOON     160     1480    0.36
    PICKUP     220     2150    0.34
    CAB        130     1620    0.27
    VAN        140     2400    0.19
    LORRY      420   14,000    0.10   bogs

A formula car is a fifth of a saloon and a twentieth of a lorry. The lorry has
the second-highest horsepower in the game and cannot move itself off the line —
**for a physical reason now, not because a torque figure was standing in for
one.** ROADSTER's 1,010kg is what lets 240hp launch as hard as MUSCLE's 480.

# THE FLEET — FOURTEEN CARS

`fleetSheet()` lives in the shared engine, so either game can render it. Rear,
front and wheel for all fourteen, including ROADSTER, which was missing from
the last sheet.

# RACEWAY GETS ALL OF IT

Verified at runtime inside Raceway, not assumed:

    FORMULA   hp 1000  mass   740  p/w 4.50  grip 1.95  brake 1.85
    ROADSTER  hp  240  mass  1010  p/w 0.79  grip 1.34  brake 1.12
    LORRY     hp  420  mass 14000  p/w 0.10  grip 0.42  brake 0.40

    shared functions reachable: mass, ptw, hp, fleetSheet, cops, heat
    and it still drives: HUD reads LAP 1/5

Everything from the last several passes — grip, braking, horsepower, mass, the
launch, speed traps, super cruisers, the class system — is in `road.js`, so it
arrived in Raceway without a line being written there.

# TWO CLASSES FROM THE START

    fresh save        MATADOR ROADSTER TUNER MUSCLE CREST STALLION — 12 paints
    after both golds  + FORMULA, and 17 paints

Six cars immediately: three SPORTS and three SUPER. The tournament is a choice
of ladder now rather than a slow drip of cars.

    gold in SUPER   → FORMULA, a novelty you were never meant to be given
    gold in SPORTS  → five IRIDESCENT paints — ORACLE, PRISM, ABALONE,
                      SCARAB, EMBER. Each is a body colour with a DIFFERENT
                      hue in the highlight, which is what makes a flip-paint
                      read as flip.

**Rivals run your class.** Take a sports car and the grid is sports cars; take
a supercar and it is supercars. That is what makes the sports league a league
rather than a handicap.

**The super cruiser is earned harder than the cruiser.** Same twenty timed
miles under pursuit, but at a **180mph average** — not a peak, an average, so it
cannot be done by sprinting and coasting.

# THE BUG THAT WAS EATING EVERY FRAME

    ReferenceError: lane is not defined
        at scatter (road.js:4552)
        at step (road.js:5486)

`scatter` fell back to a variable `lane` that does not exist in this engine —
the player's lateral position is `playerX`. **Every frame a cop was on the road,
`step()` threw at that line and everything after it was skipped**: the trap
watch, the super-cruiser watch, the clock.

It had been throwing since sirens were given to NPC cruisers, and I spent three
passes reading the wrong lines looking for it. A stack trace found it in
seconds. Speed traps and super cruisers now run with zero errors.

## And two more that only a stack trace would have found

**`SUPERCRUISER` in the LOCK table** made the garage try to build a body that
does not exist in `BODY`.

**Rig-bodied rivals through `paintCar`.** Rivals were always supercars, so they
were built with `paintCar`, which needs `bodyTop` and `cabinTop`. A sports grid
sends ROADSTER, TUNER and MUSCLE through the same line — `rig` bodies with no
such fields — and the gradient got NaN and **the game did not boot at all**.
They go through `paintRig` now, the painter their NPC versions already use.

# SPEED TRAPS, SUPER CRUISERS, AND A COAST-DOWN

## The race hands you back to the AI — and the audio finally stops

Crossing the line left YOU steering through traffic while the end card was up:
you could still crash after winning. `coasting` now takes the car, centres it
and bleeds the speed off.

**That also fixed the latching audio, and explains why my earlier fix did not.**
`snd.quiet()` ran ONCE on the finish — and then `snd.drive()` was called sixty
times a second afterwards and set every voice straight back. Silencing something
that is being continuously refreshed needs the REFRESH to stop, not a louder
silence. `coasting` gates the call.

## Traps replace the heat spawn

Cops appeared out of nowhere when heat rose. Now a TRAP is a cruiser parked on
the verge with its engine off, and anything passing above **80mph** sets it
moving — you, or a rogue tuner, or a rival. It does not care who you are, only
how fast you went past. Heat only decides how thickly they are laid: 2 to 4 on
the road at once.

## The SUPER CRUISER

A MATADOR in force colours, with the CRUISER's marque, built from the same shape
record a driveable MATADOR uses. Sent only when a car is genuinely running:
**sustained above 150mph for four seconds with heat already on you.** Heat
decides how many, up to four. Never parked at a roadside — a speed trap is for
catching ordinary traffic and these are not for that.

## STILL BROKEN — do not treat this as done

**Traps spawn and park correctly** (verified: 1-2 on the road at a time). I did
NOT get one to trigger in testing, and **no super cruiser ever deployed.**

There is a `lane is not defined` throwing somewhere in the frame loop. I chased
it through three candidates — renamed a shadowed `lane` in `spawnSuper`, then
replaced an out-of-scope `LANES` — and it survived both, which means it predates
this work and I have been fixing the wrong lines. It is almost certainly what is
swallowing the trap trigger and the super spawn, since both run in that loop.

The next step is to find where that throw actually is, not to tune the trap
distances again.

# HAIRPINS AS SUSTAINED ARCS — AND WHY IT IS STILL NOT ENOUGH

A hairpin is now four or five control points held at the SAME short radius
across a narrow band of angle, so the spline threads a constant tight turn
rather than spiking at one point. Length comes for free because the points are
spread along the arc.

    LEAGUE    CAR        LAP    SLOW CNR  BRAKE%  CROSS  TIGHTEST RADIUS
    sports    ROADSTER    38s    153mph    3.0      0        555
    gt        MATADOR      51s   162mph    3.1      0.04     243
    formula   FORMULA      72s   182mph    1.8      0        243

Better than the sharp-point version and **crossings are back to zero**. Still
nowhere near the target: braking should be ~15% of a lap and a formula car
should be seeing 60-80mph in a hairpin, not 182.

## MEASURING THE ACTUAL RADII FOUND THE REAL FAULT

Fitting a circle through every three consecutive path samples:

    tightest radius      38 units
    5th percentile      906
    median           49,373
    track size      219,188

**A radius of 38 on a 219,000-unit track is not a corner, it is a CUSP** — a
spike where the spline overshoots and doubles back on itself. That is where
"peak curvature 14" was coming from, and it explains everything:

  - it is invisible: at 218mph a cusp is crossed in six thousandths of a second
  - it cannot be braked for: the brakes remove almost nothing in that window
  - it is what produced the crossings, because an overshoot IS a crossing

Widening the arc band from 0.30-0.44 to 0.55-0.72 removed the cusps — tightest
radius now 243-555 — and the crossings with them.

## WHAT IS ACTUALLY NEEDED

The median radius is 49,000 and the corners are 243. There is nothing in
between, and a driveable circuit is mostly the in-between: a hairpin wants
about 3,000-6,000, a sweeper 20,000+.

The polar construction cannot produce that band. Radius-from-centre is not
radius-of-curvature: pulling a control point inward while keeping its angular
position makes an arc of a LARGE circle centred on the origin, so the local
curvature stays gentle until the fold becomes so extreme it cusps. There is no
middle setting.

**A hairpin has to be built in Cartesian space** — an explicit small circle of
the radius you want, spliced into the loop — not by moving a polar control
point. That is the next change, and it is a change of construction rather than
of numbers.

# HAIRPINS BY CLUSTERING — AND MY SIMULATION WAS LYING

## The clustering works, geometrically

A hairpin is not one point pulled deep — that overshoots and crosses. It is
THREE points close together in ANGLE at a short radius: the spline has to turn
hard to thread them, and the radius it achieves is set by how far apart they
are. Clustering is the geometry; depth is not.

Peak curvature went from **5-13 to 8.7-14.6** with the same jitter. The
mechanism is right.

## But the simulation had been lying for four passes

Every report said the slowest corner was **62, 63, 63 mph** across three
leagues and three cars with different grip. I called that "a ceiling from the
spline smoothing" and wrote a whole analysis on it.

It was the STARTING SPEED. My driver began each lap at `MAX * 0.30` = 60mph and
accelerated, so `minV` never fell below where it started. It was measuring the
grid, not a corner.

Measuring a warm SECOND lap tells the truth, and the truth is worse:

    LEAGUE    CAR        LAP    SLOW CNR   TOP     BRAKE%  FLAT%  CROSS
    sports    ROADSTER    38s    154mph    176mph   2.9     69%    0
    gt        MATADOR      47s   168mph    194mph   2.1     85%    0.04
    formula   FORMULA      67s   192mph    218mph   1.2     89%    0.16

**A formula car never drops below 192mph.** The corners exist and are sharp —
peak k of 14 — but they are too SHORT to matter. At 218mph the car crosses a
600-unit sample in 0.036 seconds; the brakes remove almost nothing in that time,
so it simply carries straight through the apex.

## THE ACTUAL PROBLEM: CORNERS NEED LENGTH, NOT SHARPNESS

A tight radius sustained over 200 units is a kink. Sustained over 6,000 it is a
corner you must brake for. The clustering makes a sharp POINT; what a hairpin
needs is a sustained ARC.

The next change is to hold the tight radius across several samples — more
control points around the apex at a constant short radius, rather than one
apex between two squeezed neighbours.

**Crossings held at 0 to 0.16** after backing the squeeze off from 0.16-0.30
(which caused 2-7 crossings a lap) to 0.42-0.60.

# LAPS NOW LAST — AND A LIMIT FOUND

Simulated with the real car stats: a driver who brakes for corners and
accelerates on straights, using the same curvature-vs-speed rule the game uses.

    LEAGUE    CAR        LAP     SLOW CNR  TOP     BRAKE%  FLAT%  CROSS
    sports    ROADSTER    47s     62mph    176mph   2.7     44%     0
    gt        MATADOR      69s    63mph    194mph   2.2     73%     0
    formula   FORMULA     101s    63mph    218mph   0.9     83%    0.24

**Lap times are right now**: 47 to 101 seconds, against 14-20 before. The
tracks were the right shape and a quarter of the size they needed.

Scaling `size` alone would have made every corner a sweep — that was the
95%-straight failure from two passes ago — so the control-point COUNT scales
with it. More corners over a longer lap keeps each corner as sharp as it was.

## THE LIMIT: SMOOTHING BOUNDS THE MINIMUM RADIUS

Braking is 0.9-2.7% of a lap. Real racing is nearer 15%. And look at the
slowest corner: **62, 63, 63** — identical across three leagues and three cars
with different grip. That is not a coincidence, it is a ceiling.

A Catmull-Rom through control points 15,000 units apart cannot have a radius
much below about 5,000, no matter how hard a point is pulled in. The spline
smooths the fold away. So every league bottoms out at the same corner speed and
no car ever has to stand on the brakes.

**I tried deepening the spike from 1.55 to 2.60 and it made things worse:**
braking fell to 0.8% and formula circuits crossed themselves 12 times a lap.
Folding a point harder does not tighten the radius, it just makes the path
overshoot.

The fix is geometric, not a tuning value: a hairpin needs its control points
CLUSTERED CLOSE TOGETHER, not one point pulled far in. Three points a short
distance apart make a genuine tight radius; one point pulled deep makes a
crossing. That is the next piece of work, and it is a change to how control
points are placed rather than to how far they move.

# I SHIPPED A ZIP WITHOUT road.js

Both driving games booted to black with `ROAD is not defined`. `road.js` 404'd:
the extraction created it as a shared engine and **it was never added to
`ROOT_FILES`**, the hardcoded list of what gets copied into the build.

Every check passed. The HTML was fine, the syntax gate was fine, the catalogue
matched, 18 cabinets met the standard — because all of them look at the SOURCE
tree, where the file exists. Only the artefact was broken.

## THE INCLUDE CHECK

Every `<script src>` in every shipped cabinet must resolve to a file that is
actually in the build:

    refusing to pack: a cabinet includes a file that is missing
        games/sw/highway.html needs ../../road.js — not in the build
        games/sw/raceway.html needs ../../road.js — not in the build

Proved both ways — dropped from the list, the build refuses; restored, it packs
and prints `every included script is present`.

Verified in the shipped zip: `road.js` present, highway `0.1 MI`, raceway
`LAP 1/5`, no errors. Cache bumped to v23.

**A hardcoded list of files is exactly the thing that goes stale**, and this is
the second time this week a green build shipped something broken — the first
was a syntax error. Both are now gates. The pattern to watch: every check I had
was reading the source, and nothing was reading the output.

# THE DAMAGE ROLL IS IN THE LOG

    Bone Knife → MITE L2 −4 (9) + 5 (ATK) = 14 vs (3) + 3 (DEF) = 6
         1d6 → 3  ·  margin +1  =  4
    Bone Knife → MITE L2 −7 (17) + 5 (ATK) = 22 vs (14) + 3 (DEF) = 17
         1d6 → 6  ·  margin +1  =  7
    Bone Knife → MITE L2 miss (1) + 5 (ATK) = 6 vs (5) + 3 (DEF) = 8

The to-hit sum was already printed — seeing 14 against 6 is the difference
between "bad luck" and "wrong weapon". The DAMAGE had no such line: a bare
"−4" told you nothing about whether the dice were kind or the weapon is wrong
for this thing.

`lastRoll` records the whole line as `weaponDice` rolls it, and the log shows
every term that touched it:

    the dice        1d6, or 3×2d8+1 for a shotgun
    the raw roll    each shot listed when there is more than one
    QUALITY         only when it is not 1.0
    CAL             the calibration multiplier, only above level 1
    pry             the warden bonus, when it applies
    margin          what the to-hit sum added
    CRIT            ×2+2 when it lands

Terms that did nothing are omitted, so a level-one knife prints `1d6 → 3 = 3`
and a good sabre at calibration four prints the whole chain.

## DERELICT IS FIXED

Confirmed: `SHARD_TEXT` written, every item type picks up cleanly, 90 moves of
real play with no error and no freeze.

# DERELICT: IT WAS THE SHARD, NOT THE LAMP

The guard I added caught it. Walking onto every item type in turn, through the
real `stepInto` path:

    lamp  ok    stim  ok    mod   ok    tool  ok
    cell  ok    ammo  ok    scrap ok    key   ok
    shard: THREW — SHARD_TEXT is not defined

**`SHARD_TEXT` was referenced in two places and defined in none.** Picking up a
shard threw inside `stepInto`, which is inside the walk loop — so `busy` was
never cleared and the game stopped answering every tap. Quit and come back and
it was still stuck, because the flag survives the veil.

That is the hang, and it explains why the lamp looked guilty: the lamp is
simply a pickup that often sits near a shard, and I tested the lamp in
isolation — where it always worked.

The table is written: four voices, one per omega, five recovered log fragments
each. Verified 5 lines returned for the run's omega, every pickup passes, and
90 moves of real play produce no error and no freeze.

**What actually found it** was not more reading. It was the guard printing the
message, and then walking onto EVERY item type instead of the one I suspected.
I had tested the lamp three times.

# ONE ENGINE — CONFIRMED, AND IT FOUND A GAP

Highway and Raceway share `road.js` completely. Neither game file contains a
single `brake:` or `grip:` — both are in the engine, and Highway reads them at
runtime:

    HIGHWAY, live:  FORMULA brake 1.85 grip 1.95   LORRY brake 0.40 grip 0.42

**Checking exposed that `grip` was set on three cars only.** The other eleven
silently defaulted to 1.0, so a formula car and a lorry cornered identically —
and the only reason nobody noticed is that Highway has no corners worth the
name. Every car carries it now:

    CAR        TOP   GRIP  BRAKE      CAR       TOP   GRIP  BRAKE
    FORMULA    218   1.95  1.85       MUSCLE    188   0.82  0.86
    STALLION   206   1.34  1.30       COUPE     160   0.86  0.88
    CREST      200   1.42  1.32       SALOON    148   0.78  0.80
    MATADOR    194   1.38  1.28       PICKUP    136   0.64  0.68
    CRUISER    190   0.92  1.00       CAB       132   0.70  0.72
    ROADSTER   176   1.34  1.12       VAN       120   0.58  0.62
    TUNER      164   1.00  1.02       LORRY      80   0.42  0.40

Grip and braking track each other, which is right — both come from tyre and
downforce — with ROADSTER the deliberate exception: it grips like a supercar
(1.34) and stops like the road car it is (1.12).

# THE THREE LEAGUES, BUILT

    LEAGUE    STRAIGHT  HAIRPIN  LAP     CHARACTER
    sports     47-60%    0%      123-136k  no hairpins, no great sweeps,
                                           relentlessly medium
    gt         64-74%    0-2%    168-207k  a mix, with real corners
    formula    73-75%    1-2%    235-336k  longest straights AND the
                                           sharpest turns

That is what the research described: a grand prix circuit is not gentle, it has
the widest RANGE. Sports is the twisty one where ROADSTER's grip pays; formula
is where FORMULA's 1.85 braking into a hairpin decides the lap.

Zero crossings on every circuit generated.

# BRAKING IS A STAT — IT WAS NOT

**Answering the question directly: no, the engine did not allow per-car
braking.** `rate = braking ? 9000` was a flat constant for every vehicle in the
game — a lorry stopped as hard as a formula car. On a straight road nobody
notices; on a circuit, braking is half the lap.

`brake` multiplies that rate now, defaulting to 1.0 so anything without the stat
behaves exactly as before:

    FORMULA   1.85        CRUISER   1.00        CAB      0.72
    CREST     1.32        TUNER     1.02        PICKUP   0.68
    STALLION  1.30        COUPE     0.88        VAN      0.62
    MATADOR   1.28        MUSCLE    0.86        LORRY    0.40
    ROADSTER  1.12        SALOON    0.80

A formula car stops **4.6 times harder than a lorry** and 2.3 times harder than
a saloon. That is the axis that separates a racing car from a road car most
sharply, and it was the one the game did not have.

# THE LEAGUES WERE BACKWARDS

I had FORMULA as the smoothest league — fewest tight corners. The research says
that is wrong, and your instinct was right.

A grand prix circuit is not gentle; it has the widest RANGE. Silverstone's Copse
is taken at 180mph and Monaco's Fairmont hairpin at 30, and both are formula
corners. What separates the league is not an absence of hairpins but the
presence of **both extremes**. Hairpins are also described as "a real test of a
car's braking capabilities" — so they belong with the cars that can brake.

    LEAGUE    STRAIGHT  TIGHT   HAIRPIN  PEAK k  CROSS  LAP
    sports      56%      1.0%    0.0%     2.51     0    131k
    gt          64%      3.7%    0.8%     4.50     0    194k
    formula     75%      3.5%    1.5%     8.83     0    285k

**Formula now has the most straight AND the sharpest corners** — peak curvature
8.8 against sports' 2.5. A sports circuit is uniformly medium: no great sweeps,
no true hairpins, and the least room to use power. GT sits between.

The mechanism is a `spike`: a control point pulled hard IN, so the path folds
back to reach it. Formula rolls one 30% of the time per point, GT 18%, sports
8%.

Crossings remain zero across all 120 sampled circuits.

# THE TRACKS DROVE LIKE A MOTORWAY

The shapes were closed, crossing-free and lobed — and measuring how they would
actually DRIVE found the real problem:

    before                        after
    straight   95.5% of the lap   59%
    tight       0.0%               4.5%
    peak k      0.02               4.28
    lap        982,000 units      154,000

`size` is the RADIUS of the control circle, so 105,000 gave a lap of about
660,000 units. A lap that long spreads 2\u03c0 of turning so thinly that every
sample came out at **k = 0.02** — below the threshold at which anything counts
as a corner at all. They looked like circuits on the map and drove like a
straight road.

Scaled to 15,500-24,000, which puts laps in the 150k-200k band and produces k
values of 1 to 4 — the range Highway's cornering force was tuned against.

    LEAGUE    STRAIGHT   TIGHT   PEAK k   LAP
    sports      59%       4.5%    4.28    154k
    gt          59%       3.5%    3.60    176k
    formula     63%       1.2%    2.67    197k

The leagues now differ in the right direction: a sports circuit has the tightest
corners, a formula circuit the fastest and longest.

**A shape can be right and the track still wrong.** Nine passes were spent on
what the minimap looked like; not one of them asked what the numbers underneath
would feel like through a steering wheel. The map is a picture of the road, not
a test of it.

## THE ORDER OF WORK FROM HERE

    1  DONE   closed, no crossings, lobed, correctly scaled
    2  next   verify by DRIVING — lap times, whether corners need braking
    3  then   pit lane, fuel, tyres
    4  later  bridges, once shapes are settled and crossings can be limited
              to one or two per circuit rather than allowed freely

# THE SLIVERS WERE A DUPLICATE FUNCTION

    LEAGUE    CROSS   ASPECT
    sports      0      1.09
    sports      0      1.00
    gt          0      1.07
    gt          0      1.18
    formula     0      1.02
    formula     0      1.04

**Zero crossings, aspect 1.00 to 1.18** — closed loops that fill their box.

## WHY THEY WERE RIBBONS

There were **two `buildMiniPath` functions** in the file. I wrote a new one that
draws `path2` — the closed shape the road is read from — and left the old one
below it, which re-integrated curvature and re-applied the ancient closing
correction. The second definition wins in JavaScript, so the map had been
drawing the stale path the whole time.

That is why the measurement said aspect 1.05 while the picture showed a sliver:
**they were describing different objects.** The number was right about the
track; the picture was right about what was drawn. Deleting the duplicate made
them agree.

This is the third duplicate-definition bug this session — after the two
`drawMarque` branches and the two `FRONT_SP.truck` assignments. The pattern is
always the same: an edit that ADDS rather than REPLACES, and no error anywhere.

## LOBES, NOT A BLOB

Radii drawn independently gave a circle with a wobble. The reference shapes push
OUT and pull IN, and that alternation is what makes a shape read as a circuit:

    rad[i] = 1 + (i % 2 ? -1 : +1) * jitter * rnd(0.55, 1.0)
                + rnd(-jitter*0.35, jitter*0.35)

The deliberate alternation carries the shape; the jitter rides on top so no two
tracks are the same.

## BRIDGES — not now, but the door is open

Several reference circuits cross themselves and use a bridge to do it. The
generator currently guarantees NO crossings by sorting the control points by
angle, which makes a star-shaped polygon.

Allowing a crossing would mean: relax the sort for one pair of points, detect
where the path intersects itself, mark those two road positions as a pair, and
draw the upper one as a bridge deck over the lower. The detection already
exists — `crossings()` finds them. It is the RENDERING that is a new system.

# CLOSED FIRST, CURVATURE SECOND

`buildCircuit` is rewritten. It no longer walks a sequence of segments hoping
they come back — it builds a **closed shape** and reads the curvature off it.

    points around a circle, angles jittered then SORTED   → star-shaped, so it
                                                            cannot cross itself
    radii jittered within a band                          → character, not a
                                                            splinter
    Catmull-Rom through them, closed                      → a smooth loop
    walk it, measure the turn between headings            → the segments

Closure is now a property of the source shape and cannot be violated by
anything downstream. The minimap draws `path2` — the very points the road was
read from — so the picture and the track are the same object.

    LEAGUE    CROSS   GAP     ASPECT
    sports      0     0.011    1.05
    sports      0     0.007    1.11
    gt          0     0.007    1.07
    gt          0     0.012    1.07
    formula     0     0.010    1.09
    formula     0     0.009    1.02

**Zero crossings on all nine.** The closing gap is 0.7-1.2% of the track's size,
which is one sample step — the loop meets itself.

## AND MY TEST WAS LYING AGAIN

The first run of this reported gap 1.0 and aspect 12 and I nearly rewrote it a
second time. The generator was fine: the harness measured the NORMALISED map
coordinates instead of the raw path, so it was reading a number that had already
been squashed into a unit box. Measuring `path2` directly gave 0.011 and 1.05.

That is twice now that a bad harness has accused good code — and once that a bad
harness excused bad code. The measurement needs checking as carefully as the
thing it measures.

## STILL WRONG: THE SHAPES ARE SLIVERS

The rendered tracks are closed, clean and crossing-free, and they are all narrow
vertical ribbons. The aspect ratio I measure says 1.05 — square — while the
picture plainly shows a sliver, so one of the two is wrong again and I have not
found which.

Do not treat the shapes as finished. Closure and self-intersection are solved
and measured; the PROPORTIONS are not.

# THE CROSSINGS ARE REAL — AND THE GENERATOR IS WRONG

You were right: the picture had crossings and the counter said zero. Two
separate faults, and fixing them exposed a third that is the actual problem.

## 1. The map drew a different track than the validator tested

`buildMiniPath` still carried the old closing correction — it measured the
leftover turn and spread it back over every step. Once closure became exact by
construction that correction was BENDING the track away from the shape the
validator had approved. Generator and map now use the same walk.

## 2. The closing chord was never tested

The map calls `closePath()`, which draws a straight line from the last point
back to the first. The crossing loop stopped at `pts.length - S`, so **the one
segment doing most of the crossing was the one segment nobody looked at.**
Those thin straight lines slicing through the tracks were that chord.

Included now — and with it honest, the count went from a flat 0 to 1-8.

## 3. THE REAL FAULT: turning 360 degrees does not close a loop

    LEAGUE    CROSS   CLOSING GAP (fraction of the track's own size)
    sports      3      1.014
    sports      1      1.347
    gt          5      0.887
    formula     8      1.002

A gap of 1.0 means the finish is a full track-width from the start.

The generator guarantees the total TURN is 2\u03c0. That is necessary and it is not
sufficient: a spiral also turns through 360 degrees. Closing needs the sum of
the position VECTORS to be zero, and sequential (curvature, length) segments
have no way to enforce that — which is why the tracks look like loops without
being loops.

**This needs the other architecture.** Generate a closed shape FIRST — points
around a circle, jittered, smoothed into a spline — and then READ the curvature
off that path to produce the segments. Closure is then a property of the source
shape and cannot be violated. It is a rewrite of `buildCircuit`, not a tuning
pass, and it is the honest next step.

**What I got wrong:** I reported "zero crossings on all nine" from a counter
that was not testing the segment causing them, over a picture that plainly
disagreed. The picture was the evidence and I trusted the number.

# ONE SIGNATURE STRAIGHT, OR NONE

Straights were drawn independently from a wide range, so EVERY track got a long
one somewhere by accident and the corners bunched at the far end — the long
diagonal with a mess on it.

Rolled once, per track:

    55%   this circuit HAS a signature straight — exactly one, at a random
          corner, and every other straight is SHORT
    45%   it does not — a flowing circuit with no dominant feature, every
          straight in the middle of the range

Then each remaining straight is tied to the corner it FEEDS: a tight turn gets
a 30-35% longer approach, because that is the braking zone, and a fast sweeper
needs no run-up.

    LEAGUE    CNR  CROSS  ASPECT  TURNERR  LONGEST STRAIGHT SHARE
    sports     8     0     1.52    0.025    0.33
    sports     8     0     1.35    0.008    0.28
    sports     9     0     1.89    0.003    0.23
    gt         9     0     1.31    0.002    0.19
    gt         9     0     1.06    0.001    0.25
    gt         9     0     1.34    0.017    0.26
    formula   13     0     1.19    0.042    0.13
    formula   10     0     1.36    0.014    0.22
    formula   10     0     1.69    0.004    0.23

**Zero crossings on all nine**, and the longest straight now takes between 13%
and 33% of the total straight distance instead of dominating every track. A
0.13 circuit is thirteen corners with no real straight at all; a 0.33 has one
you will use the slipstream down.

**Where it is still short:** the shapes are closed, clean and varied in
character, but several still run on a diagonal axis rather than filling their
box. The angle SHARES are random, so a run of small shares points the track one
way for a long time. Biasing the shares to alternate large and small — rather
than drawing each independently — is the next thing.

# CIRCUITS THAT ACTUALLY CLOSE

    LEAGUE    CNR  CROSS  ASPECT  TURN ERR
    sports     9     0     1.12    0.016
    sports     8     0     1.49    0.000
    sports     8     0     1.93    0.010
    gt         9     0     1.09    0.009
    gt         9     0     2.00    0.010
    gt        10     0     1.52    0.011
    formula   10     1     1.91    0.002
    formula   11     1     1.49    0.001
    formula   12     0     1.03    0.016

Turn error **0.000 to 0.016** — every lap goes round exactly once. Crossings 0
or 1. Aspect 1.03 to 2.0.

## THE MATHS WAS IMPOSSIBLE, NOT UNLUCKY

The first generator picked a curvature and a length independently. A corner of
k=4 over 6,000 units turns `4 * 0.00028 * 6000` = **6.7 radians** — more than a
full circle, in ONE corner. Ten corners turned through ten laps.

No amount of rejection sampling was going to find a closing track in that space,
and forcing closure by spreading the error over every corner just bent every
turn away from what had been chosen. I tried both before working out that the
numbers themselves made it unreachable.

## THE FIX, IN TWO STEPS

**Deal out the angle first.** A lap turns 2\u03c0, once. Each corner gets a share,
counter-turns costing extra so they still balance.

**Then length first, curvature second.** My first attempt derived the LENGTH
from the angle — which needed a clamp to keep corners plausible, and the clamp
threw the angle away again. Turned round:

    len = a plausible corner length
    k   = angle / (len * 0.00028)

Nothing is clamped, so the sum is exact. If a `k` comes out implausible the
whole CANDIDATE is discarded, which is what the search loop is for.

## WHAT THE SEARCH IS STILL FOR

Closure is now guaranteed by construction, so the 400 attempts are spent
entirely on taste: not crossing itself, and not being a splinter. It keeps the
best-scoring candidate even if none passes outright, so it always returns a
track.

**Still to improve:** the tracks are recognisably loops but they favour a long
diagonal with detail bunched at one end. The straight lengths are drawn
independently of the angles, so a run of small-share corners produces a long
thin stretch. Tying straight length to the turn that follows it is the next
thing to try.

# THE CAR WORK IS SHARED NOW

The extraction took HIGHWAY's copy of the engine, so ROADSTER, per-car grip and
the rebalanced sports triangle were left behind entirely — they existed only in
the old Raceway file I had just overwritten. **The refactor silently deleted a
session's worth of work**, and the build did not care: 18 cabinets passed, both
games ran.

Recovered from a scratch copy and moved into `road.js`, where both games get it:

    ROADSTER   176mph  grip 1.34  badge ROADSTER  rig roadster
    TUNER      164mph  grip 1.00  badge TUNER     rig tuner
    MUSCLE     188mph  grip 0.82  badge MUSCLE    rig muscle

Verified in HIGHWAY, which never had any of it before.

What moved: the roadster body (low cabin, twin humps), its winged marque, the
`marque` override so a car can share a BODY without sharing an identity, the
round-rim wheel list, per-car `cornerG()`, and the unlock key.

**Two duplicate-declaration faults on the way in**, both from a text grab that
overshot its end anchor — `BEND_STEP` and `isOpen` each declared twice, each
stopping the parse. `node --check` caught both in seconds. Grabbing text by
start-and-end string is fine; not verifying what came back is not.

## What is still Raceway-only, correctly

    buildCircuit / trackZ / lapOf     a finite road that wraps
    buildMiniPath / drawMiniMap       the track map
    the six seam callbacks            laps, HUD, reset

363 lines. Everything else is shared.

# ROAD.JS — ONE ENGINE, TWO GAMES

Highway and Raceway were 96.5% identical: 9,100 lines the same, 332 different.
Every fix had to be applied twice by hand, and they were already drifting.

    before                          after
    highway.html   9,131 lines      727 lines
    raceway.html   9,399 lines    1,076 lines
    (nothing shared)               road.js  8,486 lines

**Highway passes almost nothing** — `ROAD({ id:'highway', title:'Highway' })`.
It is the plain case, and every seam it leaves unset falls through to what it
always did. Raceway supplies five callbacks and 300 lines of circuit code.

## THE SEAMS

    CFG.curvature   (z) => k        a circuit answers; a road falls through
    CFG.grade       (z) => g
    CFG.hudScore    (dist) => str   "4.6 MI" or "LAP 1/5"
    CFG.onReset     ()              build a circuit, reset the lap counter
    CFG.onStep      (dt)            count laps
    CFG.afterDraw   (ctx)           the minimap

Six one-line touchpoints in 8,486 lines. That is the whole interface.

## THE HARD PART: A SEAM FIRES BEFORE THE ENGINE RETURNS

`onReset` runs during setup. A fork that captured the RETURN value of `ROAD()`
still held nothing when its first callback ran — `R.rint is not a function`.

Two fixes, both about ordering:

  - the engine writes its surface onto the CONFIG object (`CFG.api`) on its
    first line, so a fork can reach it from the very first seam
  - the helpers are exposed as WRAPPERS, not direct references. `rnd` and
    `rint` are `const` arrows and are in their temporal dead zone at the top of
    the factory; a wrapper is only called later, by which time they exist

Raceway reads the surface through a `Proxy` that forwards to `CFG.api`, so it
never has to care when the engine filled it in.

## AND THE BUILD HAD TO LEARN

`pack.sh` checked each cabinet's HTML for PLAY, OPTIONS and a controls page.
Those strings now live in the shared engine, so it reported a game with no menu
at all. It reads the file AND every same-origin script it includes now — which
is what the browser does.

Verified: highway `0.1 MI`, raceway `LAP 1/5`, both clean, 18 cabinets pass.

# STANDALONE BUILDS — SHARED SOURCE, SINGLE-FILE RELEASE

You were right that shipping a shared `road.js` is just one more file. But it
does not even have to be that: `pack.sh --standalone <id>` emits ONE
self-contained HTML with every `<script src>` folded in.

    ./pack.sh --standalone raceway
      standalone: raceway  (2 shared scripts inlined, 498K)

Verified by serving that single file **alone in an empty directory**: no errors,
canvas up, drives, HUD reads LAP 1/5. Nothing else on disk.

So the answer to the concern is: develop against shared modules, release a
single file. One source tree, two kinds of artifact, and no reason to keep the
duplicate copy of 8,000 lines that Raceway is today.

**Two faults, both found by testing the artifact rather than the source:**

  - a blanket regex also rewrote the string `"<script src="` that appears
    INSIDE arcade.js, corrupting the code it had just inlined. The rewrite is
    bounded to the head now, before the first inline script.
  - arcade.js and audio.js both contain the literal text `</script>` in
    comments. Inlined verbatim that closes the block early and the rest of the
    file parses as HTML — the game loaded and would not run. Split as `<\/`,
    which is valid JS and invisible to the HTML parser.

Neither would have shown up anywhere except in the built file.

# THE MINIMAP — YES, AND IT IS ALMOST FREE

A circuit is already a list of (curvature, length). Walk it, turning by `k` as
you go, and you have the shape of the track as a closed polyline — the same
outline a Crash Team Racing track-select shows. Nothing new has to be stored.

Two details make it work:

  - **it has to CLOSE.** Random curvature does not return to its start, so the
    total turn is measured and the closing error is spread evenly over every
    step of a second walk. The loop then joins itself.
  - **it is normalised into a unit box**, so a 282k formula circuit and a 161k
    park circuit draw at the same size on screen.

Built once per circuit and cached. Drawing it each frame is a polyline and one
blip per car:

    casing      dark, fat, round-joined
    surface     pale yellow on top of it — the reference's exact idiom
    start line  red, across the ribbon at index 0
    rivals      white dots at `miniAt(r.z)`
    you         a green dot drawn last, so you are never hidden

Six generated circuits are in `tracks.png` — real loops, 9 to 12 corners,
161k to 282k long, and each league visibly different in character.

**Where it falls short:** several tracks have long thin spikes and cross
themselves more than a real circuit would. The generator alternates straight
and turn without ever asking whether the shape it is drawing is a good one.
Rejecting layouts that self-intersect too often, or that have an extreme aspect
ratio, would fix it — and the minimap is exactly the tool for judging that,
because now the generator can SEE what it made.

# RACEWAY — THE CIRCUIT

Until this pass Raceway was a byte-for-byte copy of Highway with a different
title and save keys. It now has the one system that makes it a different game.

## A finite road that wraps

Highway's road is INFINITE: `pushCurve` adds segments ahead and old ones are
shifted off behind. A circuit is the same generator with one difference — it is
finite and it repeats. Build N segments once, then answer "what is the curvature
at z" with `z % trackLength`.

Everything downstream is untouched, because nothing else asks how long the road
is. `curvatureAt`, `gradeAt`, the bend integration and the skyline parallax all
just want a number for a given z.

    buildCircuit(league)   a straight then a turn, N times, plus a pit straight
    trackZ(z)              ((z % L) + L) % L
    lapOf(z)               Math.floor(z / L)

Generated and verified: **RACEWAY 4376, 172,839 units, 12 corners** — and while
driving, `pos` climbs without bound while `trackZ(pos)` stays inside the track
length. The wrap works.

## Three leagues, three shapes of track

    formula   10-14 turns   longest straights   30% tight   fastest corners
    gt         9-13 turns   medium              42% tight
    sports     8-12 turns   shortest            55% tight   most technical

The sports circuit is deliberately the twistiest — that is where ROADSTER's grip
earns its keep and where MUSCLE's top speed is worth least.

## NOT YET VERIFIED: lap counting

The counter is written and moved out of the race-only branch so it runs in every
mode, but **I could not prove it increments.** My probe cannot assign to the
module-scoped `pos`, so "jump forward one lap" did nothing and the test showed
lap 0 throughout — which is a broken TEST, not necessarily a broken feature.

Treat lap counting as unproven until it is driven.

# RACEWAY — THE FORK

Forked from Highway. Same car, same road engine, a CIRCUIT instead of a
highway. Registered as cabinet 18, own save namespace (`raceway-opts`), loads
clean.

# I SHIPPED TWO BLACK SCREENS

Highway and Raceway both opened to nothing. The cause was not the cache and not
the device: **I packed and presented a zip while both files had a syntax
error.** The unclosed brace from the roadster work was in the build, and every
check in `pack.sh` passed over it — the catalogue matched, the cache listed 46
files, all 18 cabinets met the minimum standard. None of those checks asks
whether the browser can READ the file.

## THE SYNTAX GATE

Every game's inline script is now extracted and run through `node --check`
before anything is packed. A cabinet that does not parse stops the build:

    refusing to pack: a cabinet does not parse
        games/sw/raceway.html  /tmp/_syn0.js:8484 | })(); |  ^

Proved both ways — fault reintroduced, build refuses; fault removed, build
passes with `every cabinet parses`.

This is the check that should have existed from the first day. It costs a
second, and it is the difference between a bad build and a bad release. I had
even been running `node --check` by hand earlier in the session to find this
exact class of error, and did not think to put it in the pipeline.

## THE ROADSTER KEEPS ITS ROOF

I removed the roof to distinguish it, and that was wrong for a reason I should
have seen before drawing it: **an open cockpit needs a driver in it.** A car
with an empty hole where a person should be does not read as a convertible, it
reads as a car with a missing polygon — which is exactly how it looked.

Reverted. The difference moved to proportion instead:

    roofline   0.30 against the coupe's 0.22 — much lower
    cabin      0.38 wide against 0.44 — shorter, set back
    deck       twin speedster humps behind the cabin
    wing       none at all

A roadster with the top up is still not a coupe, and nobody has to be drawn
sitting in it.

**Still the weakest of the three at a glance.** TUNER has a wing and MUSCLE has
stripes and quad lamps — both readable in a tenth of a second. ROADSTER reads as
"the low one with no wing", which works side by side and is thin at speed in a
mirror. If it needs more, the humps are the place to push: they are the one
shape no other body has.

## A ROADSTER HAS NO ROOF

ROADSTER and TUNER were both the coupe shell with different furniture, so from
behind they were the same car with a wing added. The thing that actually makes a
roadster a roadster is that **the greenhouse is not there**:

    rear    an open cockpit well, two headrest fairings, a low roll hoop
    front   a short raked windscreen with the fairings peeking over it

That is a silhouette you can name at a glance from either end, and it cost one
branch: skip the cabin, draw the hoop. Carried into Highway too, so ROADSTER can
join it as a second SPORTS-class car.

**It broke the file twice.** Opening an `else` around the greenhouse meant
closing it in two painters, and my first two anchors matched the wrong
`closePath` — the game would not parse at all. Checking with `node --check` on
the extracted script is faster than loading the page to find out.

## THE FORMULA CLASS — one body, three cars

Formula cars are not visually distinct from one another, and pretending
otherwise would be wrong as well as expensive. Three entries share the open
wheeler body and differ in **stats, name and livery colour** — which is exactly
how the real thing works.

That also resolves the naming conflict: the class is FORMULA, and none of the
cars in it is.

## THE THREE CLASSES — naming

Recommendation, same word in code and on screen so there is no translation
layer to get wrong:

    code        in game     the cars
    'sports'    SPORTS      ROADSTER, TUNER, MUSCLE
    'gt'        GT          STALLION, MATADOR, CREST
    'formula'   FORMULA     the open-wheeler

**Why not "gran prix".** It is spelled Grand Prix, and a Grand Prix IS formula
racing — so as a middle rung it fights the top rung for meaning. GT is what
those three cars actually are, everyone knows it, and it is two characters wide
in a HUD.

**One conflict to settle.** The FORMULA class currently contains a car called
FORMULA. That is the same ambiguity that bit us with TYPE-T — a name that is
sometimes a category and sometimes a thing. Either:

  - rename the CAR (it is the only open-wheeler, so it can take a marque name
    like the others — something in the register of STALLION and MATADOR), or
  - rename the CLASS to OPEN or OPEN WHEEL

Renaming the car is the better fix: the class name is the one a player reads
most often, and FORMULA is the right word for a class.

**And one gap.** A one-car class is not a class. SPORTS and GT have three each;
FORMULA needs at least two more before the league means anything, or it is a
single-car time trial with a rosette.

## THE ROADSTER

    top          176 mph        grip      1.34  (best in class)
    0-60         5.1s           CORNER_G  0.313
    gearbox      5-speed        badge     ROADSTER — a winged disc
    redline      9.5k           shape     coupe body, narrowest arches
    pitch        0.96           wheel     production (round)
    horn         1.04

Light, small and underpowered: it loses every straight and carries speed through
a corner neither of the others can touch.

**Two things the render caught.** Its wheel was flat-bottomed — it was missing
from the `roundRim` list, so a production car had a supercar's rim. And it wore
the generic oval on the boot, because it borrows the coupe's SHAPE and the shape
decides the badge. A `marque` field now overrides that, so a car can share a
body without sharing an identity.

## THE LIGHT POOL — I MADE IT WORSE

`sc` is `scale * ROAD * W`, which is HUGE near the camera. So `sc * 0.55`
produced a TALLER pool than the slice-based version it replaced, and the haze
got stronger rather than going away.

A pool of light on tarmac is a FLAT ellipse — wide across the road, shallow up
it, because you are looking at the ground almost edge on. And it has to be
capped, or the nearest lamp on a crest paints half the screen:

    was    rh = (y1-y2) * 5.5      grew and shrank with the slice
    then   rh = sc * 0.17          capped at 6% of screen height
    width  rw = sc * 2.2           capped at 55% of screen width
    alpha  0.26 -> 0.13            it was twice as bright as it needed to be

**I changed the formula without checking the magnitude of the variable I moved
to.** Both are in Highway and Raceway.

## SLIPSTREAM WAS TOO STRONG

9% is a boost, not a tow — and a 0.34 lateral window is most of a lane, so
weaving through traffic kept clipping it and the car surged for no reason the
player could see.

    gain    9% -> 4.5%      completes a pass you were already close to
    window  0.34 -> 0.20    you have to actually be BEHIND the car

## THE SPORTS LEAGUE — built and measured

    CAR        TOP    0-60    GRIP  | FAST BEND  MEDIUM  HAIRPIN
    ROADSTER   176    5.1s    1.34  |    176       131     106
    TUNER      164    3.2s    1.00  |    144       106      85
    MUSCLE     188    4.1s    0.82  |    150       110      89

    best top      MUSCLE     worst  TUNER
    best 0-60     TUNER      worst  ROADSTER
    best corner   ROADSTER   worst  TUNER

**Each is best at exactly one thing and worst at exactly one other.** No car is
the right answer on every circuit, which is the only test a three-car league has
to pass.

ROADSTER can hold a hairpin at 106mph where the others are down at 85 and 89 —
a 20% advantage that compounds over every corner of a lap. It pays for it with
the worst launch in the class by nearly two seconds.

**My first pass failed that test.** I gave ROADSTER middling straight-line stats
and the best grip, which is not a trade — it is simply the best car. It has to
give something up, and for a small light underpowered thing the honest thing to
give up is the launch.

**And my first measurement was useless**: I picked one representative bend, and
it was gentle enough that all three could take it flat out, so every car
reported its own top speed and the table said nothing. Three curvatures — fast,
medium, hairpin — is what makes the difference visible.

## GRIP: how it works

`CORNER_G` was a global feel dial, because on a straight road a corner you can
take flat is a corner nobody thinks about. It is now per-car.

It is the force a bend exerts on YOU, so a HIGHER number is a car pushed wide
more easily — grip is its inverse. `cornerG() = 0.42 / grip`:

    ROADSTER  grip 1.34  ->  CORNER_G 0.313
    TUNER     grip 1.00  ->  CORNER_G 0.420
    MUSCLE    grip 0.82  ->  CORNER_G 0.512

## The stat Highway never needed: GRIP

Highway measures a car on top speed and 0-60, because a straight road only ever
asks those two questions. A circuit asks a third: **how fast can you take a
corner without running wide.** The cornering force is already
`curvature * v² * CORNER_G`, so `CORNER_G` becomes a per-car number instead of a
global feel dial — and that is the axis the whole game turns on.

It also settles the third sports car. TUNER pulls hard and runs out of top end;
MUSCLE is the reverse. The missing corner of that triangle is the one that is
slow in a straight line and **quickest through the bends**:

    TUNER     quick off, low top, average grip
    MUSCLE    slow off, high top, poor grip
    ROADSTER  lowest top of the three, best grip by a distance

Light, small, no power. It wins on a twisty circuit and loses on a fast one,
which is exactly what makes a three-car league interesting.

## WHAT ELSE — the things not yet on the list

**Qualifying.** A single hot lap sets your grid slot. Nearly free: it is the
time-trial mode with a different result screen, and it turns the start of a race
into something you earned rather than something assigned.

**Sector times and a live delta.** The one thing that makes time trials
addictive is a number that says "you are 0.3 up on your best RIGHT NOW". Split
the lap in three, store the best, show the delta. Cheap, and it is the entire
hook of the time-trial mode.

**Flags.**
  - YELLOW where a car is wrecked ahead — and no overtaking under it
  - BLUE when the leader is catching you to lap you
  - CHEQUERED, which you already have as a finish line
Flags cost almost nothing and they are most of what makes a race feel officiated
rather than simulated.

**Lapped traffic.** Once a race is long enough, the leaders catch the tail. That
is where slipstream, blue flags and pit strategy all start interacting — and it
is free, because rivals already exist and already lap.

**Track limits.** You said speed and penalty. The rule needs to be stated: I
would put a lap time on it — all four wheels off, and that lap does not count.
Simple to explain, brutal in a time trial, and it needs no new UI.

**Grid start with lights.** The countdown SFX built two passes ago is already
five reds and a go. It was written for a clock running out; it is a better fit
here.

**A championship.** The tournament frame is four rounds and a points table.
A season is the same thing with more rounds and a standings screen between them.

## On the things you did list

**Fuel and tyres replacing damage** is the right trade. Damage is a punishment
for contact; fuel and tyres are a decision you make BEFORE the race and live
with. That is a better game. Keep a light contact penalty so ramming is not
free — but it should cost time, not health.

**Tyre compounds only matter if the race is long enough to need two stints.**
Soft/medium/hard is a real choice at 12 laps and noise at 3. That sets your
minimum race length more than anything else does.

**Weather** doubles the value of compounds — wet tyres, a drying line — but it
is also the biggest single piece of work here. It is the last thing to build,
not the first.

**Environments** are the cheapest big win on the list. The skyline is already a
generated sprite with a palette; forest, desert and mountains are the same
generator with different silhouettes and a different `hazeTint`.

## Build order I would suggest

    1  closed circuit + laps          the only genuinely new system
    2  ROADSTER + per-car grip        makes the leagues mean something
    3  qualifying, sectors, delta     reuses what exists
    4  pit lane, fuel, tyres          the strategic layer
    5  environments                   cheap, transformative
    6  flags and lapped traffic       polish that reads as depth
    7  weather                        the expensive one, last

# TINY ARCADE — Design Doc & Work Queue

The plan: keep making original titles, and alongside them build a floor of
clean-room takes on the classics. Our names, our art, our sounds, our code.

This file is the checklist. Tick boxes as they land. Every entry is written to
be picked up cold, so a game can be built in one sitting without re-deciding
anything.

**Status key** — ☐ queued · ◐ in progress · ☑ shipped · ⊘ parked

---

## 0. How the launcher is organised

Three shelves. The floor page shows only these; tapping one opens its rack.

| Shelf | Holds | `cat` |
|---|---|---|
| **GOLDEN ERA** | clean-room takes on the 1970s–80s cabinets — section 3 | `golden` |
| **SECOND WAVE** | the 1990s floor — section 3b | `second` |
| **EFFIGY ORIGINALS** | ours outright, descended from nothing — section 5 | `original` |

Every entry in `games.js` carries a `cat`. A game with no `cat` falls to
`original`, which is the safe default but should never be left implicit.

---

## 1. House rules

Every machine on this floor obeys the same contract. This is what makes a new
game a drop-in rather than a project.

### The arcade contract

- Lives at `games/<id>.html`, self-contained, one file.
- `<head>` carries:
  ```html
  <meta name="arcade-title"  content="Ribbit">
  <meta name="arcade-accent" content="#5bd66c">
  <script src="../audio.js"></script>
  <script src="../arcade.js"></script>
  ```
- Root markup is `#stage` (absolute, `inset:0`) wrapping `#frame`.
- `#frame` sized from `var(--stage-h, 100dvh)`, never raw `100dvh`.
- **A game must never define `--stage-h` or `--safe-top` in its own `:root`.**
  `arcade.js` loads from `<head>` and appends its stylesheet during parse, so a
  `:root` block later in the document wins on source order and silently
  discards the shell's calculation. All four games did this, so every frame was
  38px taller than the room it had — invisible until Derelict's HUD grew and
  pushed the action bar off the bottom of the screen. Use the fallback form at
  the point of use and let the shell own the value.
- Top safe-area padding written `var(--safe-top, env(safe-area-inset-top,0px))`.
- A `resize` listener that fully recomputes layout — `arcade.js` fires one after
  it installs the title bar.
- Opens fine on its own, with no launcher and no bar.

### Definition of done

A game is not shipped until all of these are true.

- [ ] Plays with **touch**, **keyboard**, and **gamepad**. No mode is second-class.
- [ ] Touch input goes through **`Arcade.gesture`**, so a thumb anywhere on the
      page steers. Never bind steering to the canvas alone — making someone hit
      a 360px target to turn is a fight with the game rather than its hazards.
- [ ] Music bed on `bus:'music'`. Drones and pads too — not just sequenced notes.
- [ ] SFX on `bus:'sfx'`. Continuous voices use `hold` / `holdNoise`.
- [ ] Pause hushes it; resume restores it; mute toggles are independent.
- [ ] Audio starts on the **first gesture** with no mute-toggle dance.
- [ ] `Arcade.save` slot with a `label` for the cabinet card.
- [ ] Title screen, game-over screen, and a way back to the arcade.
- [ ] Clean console — zero errors on load, play, pause, death, restart.
- [ ] Fits 375×667, 390×844, and iPad portrait and landscape.
- [ ] **Overlays cannot spill.** `#veil{overflow-x:hidden}`, `#veil *{max-width:100%}`
      and long words allowed to break. A title set in a webfont is sized by
      whichever face actually loaded — if the real one is unavailable the
      fallback's metrics differ, so a heading that fits in development can run
      off the side of a device where the font *does* load. Never trust the
      typeface; cap the box. Check at 320px, the narrowest phone still in use.
- [ ] Holds 60fps on a mid phone.
- [ ] Entry in `games.js`: `file, id, name, accent, genre, hook, attract`.
- [ ] **The hook reads like cabinet glass, not a store listing.** Concrete, one
      or two short sentences, and structurally *different* from its neighbours.
      Four cards that are each two clauses of the same length read as filler
      however good the games are. Watch for a verb reused across two cards, and
      for lists of three — both are tells.
- [ ] **Attract animation moves the same direction the real game moves.**
      (Deep shipped scrolling backwards. Check this every time.)
- [ ] Balance sanity-checked — headless sim or a scripted bot where the genre allows.

### Naming and look

**Every clone entry records what it is a clone of** — inline under its heading
and in the lookup table above. Six months on, "Myriapod" tells you nothing
about what you were building; "after Centipede" tells you everything.


Game *rules* are not copyrightable; the *presentation* is. Tetris has won cases
against clones that kept the familiar playfield proportions, piece colours and
block styling under a different name. So for every title here:

- Our name, our palette, our typography, our sound.
- No lifted sprite shapes, colour schemes, level layouts or character designs.
- Where a mechanic needs a familiar read, express it in our own visual language.
- Each game gets a distinct accent so the launcher never shows two of a colour.

### What each one is a clone of

Kept here so nobody has to reverse-engineer it later. Ours on the left, the
machine it descends from on the right.

| Ours | After | | Ours | After |
|---|---|---|---|---|
| Penboy | Pac-Man | | Myriapod | Centipede |
| Soviet Blocks | Tetris | | The Well | Tempest |
| Ribbit | Frogger | | Grid Riot | Robotron: 2084 |
| Ricochet | Breakout / Arkanoid | | Lance | Joust |
| Phalanx | Space Invaders | | Fuse | Bomberman |
| Swarm | Galaga | | Southpaw | Punch-Out!! |
| Girder | Donkey Kong | | Plumb | Pipe Mania |
| Aegis | Missile Command | | Tilt | Marble Madness |
| Coil | Snake / Blockade | | Horde | Gauntlet |
| Popshot | Puzzle Bobble | | Burrow | Dig Dug |
| Ziggurat | Q*bert | | Feather | Lunar Lander |
| Vector | Asteroids | | | |

**Deep**, **Derelict** and **Highway** are ours outright and descend from nothing.
**Raceway** descends from Highway.

### Not built yet

Same rules apply: our name, our palette, our sound. The right-hand column is
what it descends from, not what it is called.

| Ours | After | Cat | The hard part |
|---|---|---|---|
| — | Battlezone | ge | first-person WIREFRAME 3D with hidden-line removal. Nothing in the arcade projects like this. |
| — | Scorched Earth | sw | terrain that deforms AND collapses under itself; the between-round shop is the whole meta-game |
| — | Doom | sw | the raycaster is the easy half — the level format and the enemy AI are the work |
| — | Mario Kart | sw | **karts on a circuit is the easy half.** The weapons, the rubber-banding and the item balance are the game, and none of it exists anywhere in the arcade. |

### The kart racer, specifically

It is the ONE on this list that already has its engine. `road.js` gives it the
road, the projection, the cars, the traffic AI, laps, the minimap and the
circuit generator; Raceway has already proved a fork costs about 1,400 lines.
What it does not have is the part that makes a kart racer a kart racer:

    ITEMS         a box on the road, a roll against your position, and a
                  weapon that fires forward, drops behind, or is used on
                  yourself. Nothing in the arcade has an inventory.
    RUBBER-BAND   last place gets the good items and a speed bump; the leader
                  gets a banana. This is the design, not a cheat — without it
                  a kart racer is a slower Raceway.
    DRIFT-BOOST   hold a slide through a corner, release for a shove. It is
                  the skill floor AND ceiling of the genre, and Highway's
                  cornering already pushes the car wide, which is half of it.
    HAZARDS       shells to dodge, oil to slide on, things ON the road that
                  are not other cars.

**Karts are not cars.** Lighter, slower, no gearbox, and they turn far harder
than anything in the current fleet — the `CURVE_K` work in Raceway is the
groundwork for a vehicle that corners at 40mph rather than 120.

Track shape matters differently too: a kart circuit wants shortcuts, jumps and
alternate lines, which the closed-spline generator has no concept of.

Names still to be chosen. Two of the four need 3D projection that nothing
currently shares, and they need DIFFERENT kinds: Battlezone is wireframe line
work, Doom is textured columns and sprite billboards. Worth building whichever
comes first in a way the other can borrow, the way `road.js` now serves both
driving games.

### Accent register

Claimed so far, keep new ones clear of these:

| Accent | Game | | Accent | Game |
|---|---|---|---|---|
| `#4de0c8` | Deep | | `#ffd23c` | Penboy |
| `#7fd8ff` | Derelict | | `#ff4f6d` | Soviet Blocks |
| `#ff8a3d` | Highway | | `#5bd66c` | Ribbit |
| `#00e5ff` | Ricochet | | `#c3ff4a` | Phalanx |
| `#b06cff` | Swarm | | `#ff6b2c` | Girder |
| `#ff3b5c` | Aegis | | `#7cf5a0` | Coil |
| `#ff9ecd` | Popshot | | `#e0a458` | Burrow |
| `#ffb347` | Ziggurat | | `#cfd8e3` | Feather |
| `#9fb4ff` | Vector | | `#8cff6a` | Myriapod |
| `#ff2d95` | The Well | | `#ff5d3a` | Grid Riot |
| `#f2c14e` | Lance | | `#ff7a45` | Fuse |
| `#ffe066` | Southpaw | | `#4ec9d6` | Plumb |
| `#a8e10c` | Tilt | | `#c99bff` | Horde |

---

## 2. Shared engine backlog

Things several games need. Build them **when the first game that needs one
arrives**, not before — but design them for the second and third.

- [x] **`Arcade.gesture`** — built, and every machine uses it. Page-wide
      pointer input: `onSwipe(fn)` for one-per-flick directions, `onDrag(fn)`
      for continuous steering. It ignores gestures that start on a control or
      an open overlay, and stops while the shell is paused.
- [ ] **`Arcade.grid`** — tile map helper: draw, collide, A* pathfind.
      Needed by Penboy, Fuse, Horde. Derelict has a private version worth lifting.
- [ ] **`Arcade.fx`** — particle burst / float-text helper. Every game has
      re-implemented this; consolidate on the third repeat.
- [ ] **`Arcade.scores`** — local top-ten table with initials entry, and a
      shared results screen. Very arcade, and it makes the save layer earn its keep.
- [ ] **`Arcade.haptics`** — `navigator.vibrate` with a no-op fallback.
- [ ] **`Arcade.sticks`** — on-screen twin-stick overlay. Grid Riot needs it;
      Vector may want it.
- [ ] **`Arcade.tilt`** — device orientation, including the iOS
      `requestPermission()` gesture dance. Only Tilt needs it, and Tilt is held
      for last, so this is the final piece of engine work.
- [ ] **Landscape support** in `arcade.js` — a few of these want a wide board.
      Currently the shell assumes portrait.
- [ ] **Attract-loop kit** — the launcher's cabinet animations are hand-written
      per game. A tiny shared helper would stop them drifting out of sync with
      their games.

---

## 3. The queue

### Tier 1 — drops straight into the cabinet

Portrait, one thumb, no new engine work beyond the shared backlog.

---

#### 01 · PENBOY — *maze chase*
*After **Pac-Man** — Namco, 1980.*
**Status:** ☑ shipped **Size:** L **Accent:** `#ffd23c`

**The idea.** Four hunters, and the only thing that makes them prey is a
resource you have four of.

**Controls.** Swipe or drag a direction; input is *buffered* so a turn taken
slightly early still registers at the junction. D-pad / left stick / arrows.

**Build**
- [ ] Tall maze, roughly 19×23, hand-authored not generated — a good maze is a
      designed object. Side tunnels that wrap.
- [ ] Movement locked to corridors, cornering that forgives an early input.
- [x] Four hunters with genuinely different target rules: one chases your tile,
      one aims where you're heading, one pincers with the first, and one
      **guards the power pellets** rather than chasing at all. The classic
      "loses its nerve up close" rule is tuned for a 28-wide maze; at 15 wide
      the scared radius covers the board and it just looks broken.
      Two rules keep guarding fair: it stands *beside* the pellet rather than
      on it, and it rotates its post every twelve seconds or so. A guard that
      camps the tile denies the resource outright, which is a lock, not a
      threat — the same trap applies to any future guard behaviour.
- [ ] Scatter / hunt phase timer — they periodically break off, which is what
      gives the maze its rhythm.
- [ ] Power pellet → vulnerable phase, escalating chain score, flashing warning
      before it ends.
- [ ] Bonus item appearing mid-maze at two dot thresholds.
- [ ] Death animation, life counter, level advance with tighter timings.

**Audio.** Bed: a rising interval loop that ratchets up a semitone per level.
The classic "siren" idea, ours. SFX: dot bite (alternating two-note), pellet
power (descending arpeggio), hunter eaten (rising sweep), death (long fall).

**Save.** `{best, label:'BEST 12,400', level}`

**Look.** Shipped as **blueprint**: pale cyan maze lines on dark drafting
paper. The specific things kept clear of the original, because the first build
drifted straight back into them:
- player is a **drafting nib**, not a disc with a chomping mouth
- hunters have **no faces** — a survey tick on the leading edge carries heading
- frightened is **voided**: hollow, dashed, drained. Not blue.
- eaten is a **dashed wireframe** being redrawn. Not a pair of eyes.
- power marks are **survey stations** on the mid-flanks, not fat dots in the
  four corners
- cleared squares **ink in**, so the sheet fills up as you survey it rather
  than emptying out

**Watch out.** The hunter AI *is* the game. Budget most of the time there.
Uniform-random hunters feel terrible; the personalities are the point.

---

#### 02 · SOVIET BLOCKS — *stacker*
*After **Tetris** — Pajitnov, 1984.*
**Status:** ☐ **Size:** M **Accent:** `#ff4f6d`

**The idea.** Your name, and it's the right one.

**Controls.** Drag left/right to move, tap to rotate, swipe down to soft drop,
flick down to hard drop, swipe up to hold. Keys: arrows + Z/X + space + C.
Pad: d-pad, A/B rotate, LB hold, RT hard drop.

**Build**
- [ ] Seven-bag randomiser — never the drought of a pure random bag.
- [ ] Rotation system with wall kicks. Without kicks it feels broken.
- [ ] Ghost piece, hold slot, next-three preview.
- [ ] Lock delay with a move-reset cap, so you can slide a piece home.
- [ ] Line clear scoring with back-to-back and combo bonuses.
- [ ] Gravity curve by level; level up per ten lines.
- [ ] Top-out detection and a proper game-over stack fill.

**Audio.** Bed: a driving minor folk-ish loop in 4/4 that adds voices as the
level climbs — do **not** use the actual folk tune everyone expects. SFX:
move tick, rotate, soft lock, hard drop thud, line clear (pitch by lines
cleared), tetris fanfare, top-out collapse.

**Save.** `{best, lines, label:'BEST 88,200'}`

**Look.** This is the one with real legal history. **No** familiar piece
colours, no 10×20 well proportions, no glossy bevelled blocks. Proposal:
**riveted steel plate** — pieces are single-colour stamped metal with a bolt in
each cell, well is 8 wide and deep, palette rust/oxide/gunmetal on concrete.

**Watch out.** Feel is everything and it lives in the details: lock delay,
kick tables, input repeat rate. Budget a tuning pass as long as the build.

---

#### 03 · RIBBIT — *lane crosser*
*After **Frogger** — Konami, 1981.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#5bd66c`

**The idea.** Two halves that fail in opposite ways — the road kills you if you
touch anything, the river kills you if you touch nothing.

**Controls.** Swipe in a direction = one hop. Tap ahead = hop forward.
Arrows / d-pad.

**Build**
- [ ] Grid of lanes; hop is a discrete animated step, not free movement.
- [ ] Road lanes: vehicles of different widths and speeds, alternating direction.
- [ ] River lanes: floating platforms, some that submerge on a timer, some that
      carry you off the edge if you ride too far.
- [ ] Five home slots at the top; filling all five clears the level.
- [ ] Per-life timer, bonus for time remaining.
- [ ] Occupied-slot collision, drowning, squash — three distinct deaths.

**Audio.** Bed: bright pentatonic hop-along, sparse, gets a percussion layer per
level. SFX: hop (short pitch-up blip), splash, squash, home (chime), timer
warning, level clear jingle.

**Save.** `{best, label:'BEST 9,340'}`

**Look.** Not a green frog on grey asphalt. Proposal: **night storm drain** —
you're something small and pale crossing a wet road under sodium lights, then a
culvert. Reflections on the road surface.

**Watch out.** Riding a platform to the screen edge must kill you, or the river
half has no tension.

---

#### 04 · RICOCHET — *paddle breaker*
*After **Breakout / Arkanoid** — Atari / Taito, 1976 / 1986.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#00e5ff`

**The idea.** The ball's angle is a function of *where* on the paddle it lands,
which quietly turns a reflex game into an aiming game.

**Controls.** Drag anywhere to slide the paddle (relative drag, so the thumb
never covers it). Arrows / left stick. Tap or A to launch.

**Build**
- [ ] Paddle with positional English; ball speed steps up over rally length.
- [ ] Brick grid with multi-hit bricks and a few indestructible ones.
- [ ] Power-ups that fall and must be caught: widen, multiball, sticky catch,
      slow, laser. Catching a bad one is a real risk — include one.
- [ ] Ten-plus hand-authored layouts, then procedural beyond.
- [ ] Ball-stuck detection with a nudge, or a horizontal rally can loop forever.

**Audio.** Bed: minimal pulse that adds layers as bricks clear, so the room
empties out audibly. SFX: paddle hit (pitch by position), brick (pitch by row),
wall, power-up chime, ball lost.

**Save.** `{best, level, label:'BEST 21,900'}`

**Look.** Not rainbow rows. Proposal: **oscilloscope** — phosphor green vector
lines on black, bricks as hollow rectangles that flare and decay when hit,
paddle a bright segment, subtle beam persistence trail.

**Watch out.** The slow, steep, near-horizontal ball is the classic frustration.
Clamp the angle away from horizontal on every bounce.

---

#### 05 · PHALANX — *ranked shooter*
*After **Space Invaders** — Taito, 1978.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#c3ff4a`

**The idea.** The formation speeds up as you thin it, so killing them is what
makes them dangerous. One shot on screen at a time — every trigger pull is a
decision.

**Controls.** Drag to move, tap to fire. Arrows + space. Stick + A.

**Build**
- [ ] 5×11 formation, step-march with the sideways-then-down cadence.
- [ ] Speed scales inversely with survivors; the last one is frantic.
- [ ] **One player shot in flight at a time.** Non-negotiable, it's the design.
- [ ] Shields that erode pixel-blockwise from both sides.
- [ ] Bonus craft crossing the top on a timer.
- [ ] Formation reaching the shield line = game over.

**Audio.** Bed: the four-note descending march, ours, accelerating with the
formation — the tempo *is* the difficulty readout. SFX: fire, hit, player death,
bonus craft warble, shield chip.

**Save.** `{best, wave, label:'BEST 14,700'}`

**Look.** Not green pixel aliens. Proposal: **x-ray plate** — white silhouettes
on a grey-black wash, forms that read as unpleasant marine life, faint bone
structure visible inside them.

---

#### 06 · SWARM — *formation dive shooter*
*After **Galaga** — Namco, 1981.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#b06cff`

**The idea.** They arrive along paths, sit in ranks, then peel off and come at
you individually. And one of them can steal your ship — which you can steal back
for double the firepower.

**Controls.** Drag to move, tap or hold to fire. Arrows + space. Stick + A/RT.

**Build**
- [ ] Entry patterns — bezier or spline flights into formation slots.
- [ ] Formation breathing, then timed dive runs along curved paths.
- [ ] Capture beam: lose a life, ship held above; destroy the captor to get it
      back and fly doubled — wider guns, wider hitbox. The trade is the hook.
- [ ] Bonus stage: a wave that never shoots, scored on hit percentage.
- [ ] Two-shot limit and a hit-rate stat on the results screen.

**Audio.** Bed: arpeggiated, urgent, with a distinct capture motif. SFX: fire,
enemy hit, dive whoosh, tractor beam (rising shimmer), rescue fanfare.

**Save.** `{best, hitRate, label:'BEST 46,100'}`

**Look.** Not insects. Proposal: **origami** — folded paper craft, flat colour,
crease lines, they unfold as they die.

**Watch out.** Path authoring is the bulk of the work. Build a tiny path editor
or define them mathematically from the start.

---

#### 07 · GIRDER — *climb and dodge*
*After **Donkey Kong** — Nintendo, 1981.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#ff6b2c`

**The idea.** Everything the antagonist throws obeys gravity and slopes, so the
hazards are readable and the route is a puzzle.

**Controls.** Drag left/right to run, tap to jump, drag up on a ladder to climb.
Arrows + space. D-pad + A.

**Build**
- [ ] Sloped girders, ladders, gaps. Platform collision that handles slopes.
- [ ] Barrels that roll downhill, choose ladders sometimes, and speed with slope.
- [ ] Jump arc with a fixed shape — jumping is committal, not steerable.
- [ ] Hammer power-up: temporary, destroys hazards, disables climbing.
- [ ] Three or four distinct stage layouts that cycle with rising speed.
- [ ] Bonus timer that drains and pays out on completion.

**Audio.** Bed: short looping stage themes, one per layout, plus a "hurry" tempo
lift when the timer gets low. SFX: jump, land, climb step, barrel roll (looping,
panned by position), hammer swings, stage clear.

**Save.** `{best, stage, label:'BEST 32,400'}`

**Look.** Not a construction-site ape. Proposal: **scaffolded cathedral** —
you're a small figure climbing restoration scaffolding, the antagonist is a
gargoyle throwing masonry. Stone, rust, tarpaulin.

---

#### 08 · AEGIS — *point defence*
*After **Missile Command** — Atari, 1980.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#ff3b5c`

**The idea.** You cannot win. You can only be slow to lose, and the game is
honest about that at the end.

**Controls.** Tap where you want the interceptor to burst — the natural touch
game on this list. Cursor + click, or stick + A.

**Build**
- [ ] Three batteries with separate ammo; nearest-battery auto-select.
- [ ] Interceptors travel to the tapped point *then* detonate — leading the
      target is the skill.
- [ ] Expanding blast spheres that destroy anything entering them, chaining.
- [ ] Six cities; incoming splits mid-flight at higher waves.
- [ ] Smart bombs that dodge nearby blasts; bomber and satellite craft.
- [ ] Wave bonus for unused ammo and surviving cities.
- [ ] Ending: when the last city falls, everything stops and the screen says so.

**Audio.** Bed: slow dread pulse, tempo rising with the number of tracks in
flight — so a busy sky *sounds* busy. SFX: launch, blast bloom, incoming
whistle, city loss (heavy, low), the final one long and terminal.

**Save.** `{best, wave, label:'BEST 51,200'}`

**Look.** Not vector cities on black. Proposal: **weather radar** — everything
is a returned signal, sweeping phosphor, cities as clustered light, incoming as
tracked contacts with faint prediction lines.

---

#### 09 · COIL — *snake*
*After **Snake / Blockade** — Gremlin, 1976.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#7cf5a0`

**The idea.** Winning is the losing condition. The better you do, the less room
you have.

**Controls.** Swipe. Arrows / d-pad. Buffer one queued turn so fast double-turns
around a corner work.

**Build**
- [ ] Grid, discrete steps on a tick, speed rising with length.
- [ ] Self and wall collision; reversal blocked.
- [ ] Food, plus an occasional timed bonus worth a chunk that spawns awkwardly.
- [ ] Optional obstacle layouts unlocked by score.
- [ ] Tail flash so you can see where the end is about to leave.

**Audio.** Bed: sparse tick-based pulse that quantises to the movement tick, so
music and motion lock together and speed up as one. SFX: eat (rising by length),
turn (soft tick), death (sharp cut then silence).

**Save.** `{best, length, label:'BEST 214'}`

**Look.** Not a green snake on black. Proposal: **fibre optic** — a light pulse
travelling a dark bundle, head bright, body a fading glow, food as junction nodes.

---

#### 10 · POPSHOT — *aim and match*
*After **Puzzle Bobble** — Taito, 1994.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#ff9ecd`

**The idea.** Match-three where the wall comes down to meet you and bank shots
are the expert move.

**Controls.** Drag to aim with a dotted trajectory including wall bounces,
release to fire. Stick to aim, A to fire.

**Build**
- [ ] Hex-offset grid, snap-to-nearest attachment.
- [ ] Aim line with reflection preview off the side walls.
- [ ] Flood-fill match of three or more, then **orphan detection** — anything no
      longer connected to the ceiling drops, and that's where the big scores are.
- [ ] Ceiling descends every N shots; a shot counter warning.
- [ ] Colour set shrinking to only what remains on the board.
- [ ] Level layouts plus endless mode.

**Audio.** Bed: light, bouncy, in a major key — the one cheerful machine on the
floor. SFX: shoot, stick, pop (pitch rising through a chain), drop cascade,
ceiling descent clunk, level clear.

**Save.** `{best, level, label:'BEST 74,300'}`

**Look.** Not glossy coloured bubbles. Proposal: **soap and light** — thin-film
iridescent spheres, colour from interference rather than fill, they burst into
droplets.

---

#### 11 · BURROW — *dig and pop*
*After **Dig Dug** — Namco, 1982.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#e0a458`

**The idea.** You author the terrain by moving through it, which means you're
building your own escape routes and your own traps.

**Controls.** Drag a direction to dig. Arrows, tap-and-hold to pump. D-pad + A.

**Build**
- [ ] Destructible soil with distinct strata; tunnels are permanent and shape
      everything after.
- [ ] Pump mechanic: hold to inflate, release lets it deflate — commitment under
      pressure, and interruptible.
- [ ] Two enemy types: one that follows tunnels, one that can pass through soil
      when frustrated. The second is what stops turtling.
- [ ] Rocks that fall when undermined, crushing anything below, worth more.
- [ ] Score bonus for depth of the kill.

**Audio.** Bed: a walking loop that only plays *while you are moving* — silence
when you stop is the signature, and it makes the game feel alive. SFX: dig
scrape, pump (rising per stage), pop, rock rumble and impact, ghosting hum.

**Save.** `{best, depth, label:'BEST 38,600'}`

**Look.** Not a cartoon digger. Proposal: **archaeological section** — a
cutaway of stratified earth, you're a surveyor's drill, the things down there are
rendered like specimen illustrations.

---

#### 12 · ZIGGURAT — *isometric hopper*
*After **Q*bert** — Gottlieb, 1982.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#ffb347`

**The idea.** Diagonal-only movement on an isometric pyramid, which makes your
own controls the primary obstacle. Lean into it.

**Controls.** Swipe diagonally — four directions only. Rotate the d-pad 45° so
the mapping is honest. Show a small control diagram on the title screen.

**Build**
- [ ] Isometric pyramid, 7 rows, correct draw order.
- [ ] Tile state flipping on landing; some levels need two visits per tile.
- [ ] Falling off the edge as a real, frequent death.
- [ ] Enemies: one that bounces down the pyramid, one that chases, one that
      reverts tiles behind you.
- [ ] Escape discs at the edges that lift you back to the top.
- [ ] Level complete when every tile is flipped.

**Audio.** Bed: odd-meter, slightly wrong-footed — 7/8, matching how the controls
feel. SFX: hop (two-tone), land, tile flip (pitch by progress), fall (long
descending), disc lift, curse-word bubble on death (gibberish, ours).

**Save.** `{best, level, label:'BEST 26,800'}`

**Look.** Not orange cubes. Proposal: **paper model** — folded card ziggurat with
visible tabs and creases, tiles flipping like turned pages.

**Watch out.** Isometric input mapping is where players bounce off. Consider a
brief on-screen hint the first few times they move.

---

#### 13 · FEATHER — *lander*
*After **Lunar Lander** — Atari, 1979.*
**Status:** ☑ BUILT **Size:** S **Accent:** `#cfd8e3`

**The idea.** A game about arriving slowly. Everything else is fuel arithmetic.

**Controls.** Left/right screen halves for rotation, bottom-centre or a second
finger for thrust. Arrows + up. Stick + RT.

**Build**
- [ ] Newtonian thrust, rotation, constant gravity, no drag.
- [ ] Procedural terrain with flat pads at score multipliers — smaller pad, more
      points.
- [ ] Landing check on vertical speed, horizontal speed, *and* attitude. Fail any
      and it's a crash.
- [ ] Fuel as the real clock; a fuel bonus carried into the next site.
- [ ] Camera zoom on final approach — the moment that sells the whole game.
- [ ] Crash debris and a slow-motion beat before the screen resets.

**Audio.** Bed: near-ambient, a slow pad and a distant beacon ping; goes almost
silent on approach. SFX: thruster (continuous `hold`, pitch/level by throttle),
low-fuel alarm, touchdown (soft double thump), crash, pad bonus chime.

**Save.** `{best, landings, label:'BEST 4,120'}`

**Look.** Not white vector lines. Proposal: **instrument glass** — the terrain
drawn as a radar altimeter profile with overlaid HUD figures, the craft a
schematic. All information, barely any scenery.

---

### Tier 2 — need a control rethink for touch

---

#### 14 · VECTOR — *inertia shooter*
*After **Asteroids** — Atari, 1979.*
**Status:** ☑ BUILT **Size:** M **Accent:** `#9fb4ff`

**The idea.** Momentum you cannot cancel. Every shot fired is a course you're
now committed to.

**Controls.** The problem to solve. Proposal: **drag to aim and thrust** — drag
from the ship, direction sets heading, distance sets throttle, release to stop
thrusting; tap anywhere to fire. Keys keep classic rotate/thrust. Pad: left stick
aims, RT thrusts, A fires.
- [ ] Prototype the touch scheme *first*; if it isn't fun in ten minutes, park it.

**Build**
- [ ] Screen wrap for everything, including bullets.
- [ ] Rocks splitting large → medium → small, each faster.
- [ ] Hyperspace: escape that might kill you.
- [ ] Two saucer types, one that aims properly.
- [ ] Wave escalation and a thrust flame that reads as acceleration.

**Audio.** Bed: two alternating bass notes accelerating with wave count — pure
tension, no melody. SFX: thrust (continuous filtered noise), fire, rock break
(pitch by size), saucer siren, hyperspace tear.

**Save.** `{best, wave, label:'BEST 33,700'}`

**Look.** Not white outlines. Proposal: **ice** — rocks as fractured translucent
crystal that spall along fault lines, ship a dark wedge, blue-white on deep navy.

---

#### 15 · MYRIAPOD — *field shooter*
*After **Centipede** — Atari, 1981.*
**Status:** ☐ **Size:** M **Accent:** `#8cff6a`

**The idea.** The playfield is destructible and the destruction is what makes the
enemy dangerous — mushrooms you leave up are the walls that steer the centipede
into your lap.

**Controls.** Drag to move within the bottom band, auto-fire. Trackball
originally, so drag is the honest translation. Stick + RT.

**Build**
- [ ] Centipede that splits into independent segments when shot mid-body.
- [ ] Mushroom field, damaged in stages, that redirects descent.
- [ ] Spider bouncing through the player band, worth more the closer it dies.
- [ ] Flea dropping new mushrooms straight down when the field thins.
- [ ] Scorpion poisoning mushrooms, making the centipede dive straight at you.
- [ ] Field partially regrows between waves.

**Audio.** Bed: skittering percussive loop that thickens with the number of live
segments. SFX: shot, segment hit, mushroom chip, spider bounce, poison dive
(pitch bend down), death.

**Save.** `{best, wave, label:'BEST 62,900'}`

**Look.** Not a garden. Proposal: **circuit board** — mushrooms as components,
the myriapod a fault propagating along traces, everything green-gold on dark
substrate.

---

#### 16 · THE WELL — *tube shooter*
*After **Tempest** — Atari, 1981.*
**Status:** ☐ **Size:** M **Accent:** `#ff2d95`

**The idea.** You run the rim of a hole and everything climbs toward you.

**Controls.** Drag around the rim, tap to fire, two-finger tap for the panic
weapon. Stick + A + LB.
- [ ] Reuse the pseudo-3D projection from Highway rather than writing another.

**Build**
- [ ] A set of tube cross-sections — closed rings and open troughs.
- [ ] Enemies climbing segment by segment; one that reaches the rim and hunts
      you along it.
- [ ] Spikes left behind that kill you on the dive between levels.
- [ ] One-per-level panic weapon that clears the tube.
- [ ] The dive down the tube between levels, in control.

**Audio.** Bed: hard, metallic, tempo lifting per level; near-silence during the
dive so the arrival hits. SFX: fire (pitch by rim position), enemy destroyed,
enemy reaching the rim (alarm), panic weapon (huge descending sweep), dive rush.

**Save.** `{best, level, label:'BEST 88,400'}`

**Look.** Not neon vector. Proposal: **industrial shaft** — riveted metal
segments in perspective, enemies as machinery climbing the walls, sparks.

---

#### 17 · GRID RIOT — *twin-stick survival*
*After **Robotron: 2084** — Williams, 1982.*
**Status:** ☐ **Size:** M **Accent:** `#ff5d3a`

**The idea.** Move and shoot in different directions, and the thing worth points
is fragile and not you.

**Controls.** Needs `Arcade.sticks` — two virtual sticks, floating, anchored
where each thumb lands. Physical pad is the ideal here; keyboard WASD + arrows.
- [ ] Landscape mode may suit this better. Requires the shell to support it.

**Build**
- [ ] Wave-based arena, everything spawning at the edges.
- [ ] Enemy types: a slow shambler, a fast seeker, a shooter, and an
      indestructible hulk that only crushes.
- [ ] Rescuable humans worth escalating points, killable by anything including you.
- [ ] Waves with authored spawn compositions, not random soup.
- [ ] Screen-edge spawn telegraphs so deaths feel fair.

**Audio.** Bed: relentless driving loop, one layer per active enemy type — the
mix tells you what's on screen. SFX: fire, enemy pop by type, human rescued
(rising chime), human lost (sour), player death.

**Save.** `{best, wave, saved, label:'BEST 121,000'}`

**Look.** Not chrome robots. Proposal: **security feed** — top-down monochrome
camera view with timecode, enemies as tracked blobs with ID boxes, humans as
green outlines that turn red.

---

#### 18 · LANCE — *flap duel*
*After **Joust** — Williams, 1982.*
**Status:** ☐ **Size:** M **Accent:** `#f2c14e`

**The idea.** Altitude decides collisions. Two things meet, the higher one wins,
and both of you are fighting the same terrible physics.

**Controls.** Tap to flap, drag left/right for lateral drift. A to flap, stick to
steer.

**Build**
- [ ] Flap physics: each tap an impulse, gravity constant, momentum preserved.
      Getting this feel right *is* the game.
- [ ] Platform layout with wrap-around sides.
- [ ] Enemy riders with the same physics and three aggression tiers.
- [ ] Defeated riders drop an egg — collect it or it hatches into a tougher one.
- [ ] A lava layer and something in it that grabs you if you fly too low.
- [ ] A pterodactyl-equivalent to end camping.

**Audio.** Bed: sparse, tense, mostly percussion, rising with wave. SFX: flap
(air push, pitch by velocity), joust impact (metal clash), egg drop, egg hatch,
lava grab.

**Save.** `{best, wave, label:'BEST 43,500'}`

**Look.** Not knights on ostriches. Proposal: **deep sea** — you ride something
finned in a black trench, "flapping" is a swim stroke, the lava layer is a vent.

---

### Tier 3 — bigger builds

---

#### 19 · FUSE — *grid bomber*
*After **Bomberman** — Hudson Soft, 1983.*
**Status:** ☐ **Size:** L **Accent:** `#ff7a45`

**The idea.** Your weapon is on a timer and doesn't care whose side you're on.

**Controls.** D-pad style movement — swipe or an on-screen pad — plus a bomb
button. This one may want a persistent on-screen control cluster.

**Build**
- [ ] Tile grid: solid pillars, destructible crates, open floor.
- [ ] Bombs with a fuse, cross-shaped blast, chain detonation.
- [ ] Power-ups from crates: more bombs, longer blast, kick, remote trigger.
- [ ] Enemy AI with distinct movement rules; some pass through crates late on.
- [ ] Self-damage — always.
- [ ] Level timer that spawns something unpleasant when it expires.
- [ ] Reuse the grid + pathfind helper.

**Audio.** Bed: jaunty and mechanical, tempo lift when the level timer gets low.
SFX: bomb place (clunk), fuse tick (audible, positional), blast, crate break,
power-up, enemy death, self-death (comic and sad).

**Save.** `{best, level, label:'BEST 55,000'}`

**Look.** Not cute. Proposal: **demolition site** — you're a controlled-demolition
engineer, bombs are charge packs, crates are masonry, the "enemies" are
malfunctioning site drones.

---

#### 20 · SOUTHPAW — *timing boxer*
*After **Punch-Out!!** — Nintendo, 1984.*
**Status:** ☐ **Size:** L **Accent:** `#ffe066`

**The idea.** Every opponent is a pattern with a tell. The game is learning to
read, and it plays beautifully on touch because it's all timing, not dexterity.

**Controls.** Swipe left/right to dodge, down to duck, tap left/right to punch,
hold to block, tap the star meter to throw the big one.

**Build**
- [ ] Opponent behaviour trees: idle → tell → attack → recovery window.
      The tell must be readable and honest.
- [ ] Punish window on recovery — this is the whole reward loop.
- [ ] Stamina: whiffing costs you, so spamming is punished.
- [ ] Knockdown, count, and getting back up.
- [ ] Six opponents with escalating and *distinct* patterns, plus a rematch mode
      where the patterns shift.
- [ ] Big readable animation. Most of the art budget goes here.

**Audio.** Bed: crowd ambience plus a per-opponent motif; the crowd reacts to
the fight. SFX: jab, hook, block, dodge whoosh, stagger, knockdown, bell, count.

**Save.** `{best, opponent, label:'REACHED SOUTHPAW'}` — progression, not score.

**Look.** Not a boxing ring pastiche. Proposal: **wireframe sparring** — the
opponent rendered as a motion-capture skeleton with the tell highlighted in the
accent colour, so reading the tell is diegetic.

**Watch out.** The only title here that's about *learning* rather than reflex.
Needs the most animation and the most patient tuning. Worth it — it's the most
distinctive thing on the list.

---

#### 21 · PLUMB — *flow builder*
*After **Pipe Mania** — The Assembly Line, 1989.*
**Status:** ☐ **Size:** M **Accent:** `#4ec9d6`

**The idea.** You're always building ahead of a problem that's already moving.

**Controls.** Tap a cell to place the next piece from the queue. Tap an existing
piece to overwrite it at a cost. Cursor + A.

**Build**
- [ ] Grid, piece queue of five, no rotation — you take what you're given.
- [ ] Flow that starts on a timer and never stops.
- [ ] Distance scoring; crossover pieces; overwrite penalty.
- [ ] One-way valves and pre-placed obstacles per level.
- [ ] Level target distance, with the flow accelerating each level.

**Audio.** Bed: a ticking industrial loop, and the flow itself is audible —
a moving trickle that speeds up. SFX: place, overwrite (metal wrench), flow
enters a pipe, leak (failure), level clear.

**Save.** `{best, level, label:'BEST 18,200'}`

**Look.** Not cartoon plumbing. Proposal: **schematic** — a technical drawing on
graph paper, flow as a spreading ink stain, leaks as blots.

---

#### 22 · TILT — *gyro roller*
*After **Marble Madness** — Atari, 1984.*
**Status:** ⊘ parked — held for last **Size:** L **Accent:** `#a8e10c`

**The idea.** Tilt the phone, roll the ball. The physical one. Nothing else on
the floor uses the device this way.

**Controls.** Device orientation, with a drag fallback for desktop and a stick
fallback for pad.
- [ ] iOS needs `DeviceOrientationEvent.requestPermission()` from a gesture —
      an explicit "TILT TO PLAY / ALLOW" step on the title screen.
- [ ] Calibrate to whatever angle the player is holding at start. Non-negotiable.

**Build**
- [ ] Isometric course with ramps, gaps, narrow beams.
- [ ] Rolling physics with real momentum; falling off is the main failure.
- [ ] Course timer carried between stages.
- [ ] Hazards: things that push, things that eat the ball, moving sections.
- [ ] Six courses of rising cruelty.

**Audio.** Bed: light, curious, slightly anxious; tempo tied to the timer. SFX:
roll (continuous, pitch and level by speed — the signature sound), wall knock,
fall (doppler down), goal chime, timer warning.

**Save.** `{best, course, label:'BEST COURSE 4'}`

**Look.** Not a marble on wood. Proposal: **glass and mercury** — a bead of
liquid metal on frosted glass panels lit from beneath.

**Watch out.** Highest technical risk on the list: permissions, calibration,
motion sickness, and it's unplayable on a desktop without the fallback. Build the
fallback first.

---

#### 23 · HORDE — *arena crawler*
*After **Gauntlet** — Atari, 1985.*
**Status:** ⊘ parked — held for last **Size:** L **Accent:** `#c99bff`

**The idea.** Spawners, not enemies, are the problem. Kill the source or drown.

**Deliberately parked.** Derelict already owns turn-based dungeon crawling on
this floor. Revisit only with a clear separation: **real-time**, arena-shaped,
no fog, no keycards, health as a constantly draining clock you buy back with
food. If that separation doesn't hold, cut it.

**Build (if revived)**
- [ ] Real-time movement and auto-fire in the facing direction.
- [ ] Spawners that emit until destroyed.
- [ ] Health draining on a timer; food and potions on the floor.
- [ ] Four classes with genuinely different ranges and speeds.
- [ ] Keys and doors — reuse Derelict's colour-lock generator.

---

## 3b. The 1990s floor — a second queue

The section above is the golden age: single screens, one input, ninety-second
runs. This one is the decade after — fighters, shmups, run-and-guns, beat 'em
ups, light-gun cabinets. Bigger, louder, and much heavier on animation.

**Read this before scheduling any of them.** The 80s machines are one mechanic
each, which is why they drop into a phone in a sitting. A 90s cabinet is usually
*several* systems at once plus a mountain of frames, and most of them assumed
two hands, a stick and six buttons. So the work here is not the systems — it is
deciding what the phone version keeps and what it honestly cannot.

Nothing below is scheduled. Add to it freely; write the full spec when one gets
picked, in the same shape as the entries above.

**Fit key** — ● drops in · ◐ needs a control rethink · ○ needs a real redesign

### Fighters

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **KUMITE** | Street Fighter II · Capcom, 1991 | ○ | Special moves as *motions*, not buttons. On a phone the motion is the swipe — quarter-circle is a real gesture. |
| **VERDICT** | Mortal Kombat · Midway, 1992 | ○ | The finisher: a punish window so long it is theatre. Keep the ceremony, lose the gore. |
| **IAIDO** | Samurai Shodown · SNK, 1993 | ◐ | One clean hit ends it. A fighter where the health bars barely matter suits short sessions. |
| **FACET** | Virtua Fighter · Sega, 1993 | ○ | Sidestep — the third axis. Hardest of the four to make honest on touch. |

### Shmups

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **TETHER** | R-Type · Irem, 1987/90s line | ● | The detachable pod you can fling ahead or dock behind. It is a positioning puzzle wearing a shooter's clothes. |
| **OPTION** | Gradius · Konami | ● | Trailing satellites that echo your path, and a power bar you *spend* — the choice is the game. |
| **CURTAIN** | DonPachi / DoDonPachi · Cane, 1995/97 | ● | Bullet-hell with a hitbox one pixel across. Portrait is its native shape and drag is its native input. |
| **THUNDERHEAD** | Raiden · Seibu Kaihatsu, 1990 | ● | Two weapons you swap by pickup colour, and the slow dread of a big screen-filling boss. |

### Run and gun

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **SPREAD** | Contra · Konami, 1987/90s line | ◐ | Named for the gun everyone remembers. One hit kills, so the whole game is spacing. |
| **SCRAP TANK** | Metal Slug · Nazca/SNK, 1996 | ◐ | The vehicle you climb into and can lose. Best animation on any arcade board, and that is the risk. |

### Beat 'em ups

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **PRECINCT** | Final Fight / Streets of Rage · Capcom / Sega, 1989/91 | ◐ | Crowd control on a 2.5D plane: the depth axis is the whole defence. |
| **WARBAND** | Golden Axe · Sega, 1989 | ◐ | Mounts you steal from the enemy, and a magic bar that scales with what you hoard. |
| **HIVE** | Alien vs Predator · Capcom, 1994 | ○ | Two wildly asymmetric characters in the same brawler. Ambitious; park until Precinct proves the genre works. |

### Light gun

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **PEDAL** | Time Crisis · Namco, 1995 | ● | The cover pedal — you choose between safety and being able to shoot. That is a *button*, and it is the whole game. Best fit on this list. |
| **QUARANTINE** | House of the Dead · Sega, 1996 | ● | Branching routes decided by who you save. Tap-to-shoot is native to touch. |

### Racing and driving

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **HAIRPIN** | Sega Rally · Sega, 1995 | ◐ | Surface change you feel through the wheel — tarmac, gravel, snow. Overlaps Highway; needs a clear separation first. |
| **FARE** | Crazy Taxi · Sega, 1999 | ○ | A timer you extend by doing the job well. Open-world, so the biggest build here by a distance. |

### Puzzle and rhythm

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **GEM DUEL** | Super Puzzle Fighter II · Capcom, 1996 | ● | Competitive puzzling: your combos land as junk on the other board. |
| **DRAWSTRING** | Magical Drop · Data East, 1995 | ● | Pull and throw a whole column instead of placing one piece. Fast, and a natural drag. |
| **SIXTEENTH** | beatmania · Konami, 1997 | ● | Rhythm on the synth engine we already have — no samples needed, and nothing else on the floor is a music game. |

### Flight

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **BOGEY** | Ace Combat / Top Gun · Namco / Sega, 1995 | ◐ | Chase cam behind the aircraft, and a **lock-on that takes time** — you hold the enemy in the reticle and wait, which is a nerve mechanic rather than an aiming one. Portrait is wrong for dogfighting; this one may want landscape. |

### Sports

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **TWO ON TWO** | NBA Jam · Midway, 1993 | ● | Two-a-side, no fouls, and a **heat streak** — three baskets running and the ball is on fire. Physics loose enough to dunk from the arc. The rules fit on a card, which is why it works on a phone. |

### Rhythm

| Ours | After | Fit | The one idea worth keeping |
|---|---|---|---|
| **DOWNBEAT** | DDR / Guitar Hero · Konami / Harmonix, 1998/2005 | ● | Notes falling to a line, scored on **timing windows** rather than hits. Runs on the synth engine we already have, so the chart *is* the music — no samples, and the track can be generated from the same sequencer that plays every other bed on this floor. Supersedes **SIXTEENTH** above; keep one, not both. |
| **TABLETOP** | Micro Machines · Codemasters, 1991 | ● | Overhead, tiny cars on household surfaces, and the whole game is the **shared camera**: everyone races in one frame, and anyone who falls off the edge of it is out. That single rule makes the lead worth having — a leader pulls the frame forward and drags the field off the back of it — and it works on a phone because it needs two thumbs and no map. |
| **RUT** | Ironman Off-Road / 4x4 · Jaleco, 1989 | ◐ | Isometric truck racing over terrain that *deforms*: ruts deepen where the field has driven, so lap three is rougher than lap one and the racing line you inherited is the one you made. Prize money between heats buys tyres, suspension and a bigger engine. Heavier and slower than TABLETOP — the two are not the same game and should not share a cabinet. |
| **SISTERS** | Super Mario Bros. · Nintendo, 1985 | ◐ | Two sisters, one controlled at a time, and **tagging resumes from wherever the other is standing** — so a level becomes a question of where you parked her. Working title; see the note in the spec about not echoing the original's name. |

### Accents for these, when they get scheduled

Clear of everything in the register above.

| Accent | Game | | Accent | Game |
|---|---|---|---|---|
| `#e8443f` | Kumite | | `#ff9f1c` | Spread |
| `#7a1f2b` | Verdict | | `#8d6b3f` | Scrap Tank |
| `#d9d0b8` | Iaido | | `#3fa7d6` | Precinct |
| `#5f7fa8` | Facet | | `#c9a227` | Warband |
| `#00d4a0` | Tether | | `#6b8f3a` | Hive |
| `#b7f000` | Option | | `#ff5470` | Pedal |
| `#ff2fb9` | Curtain | | `#9bb1a2` | Quarantine |
| `#ffd166` | Thunderhead | | `#c1440e` | Hairpin |
| `#f4d35e` | Fare | | `#a06cd5` | Gem Duel |
| `#4cc9f0` | Drawstring | | `#f72585` | Downbeat |
| `#2ec4ff` | Bogey | | `#ff7d00` | Two On Two |

### If you want a starting batch from this list

**PEDAL · CURTAIN · GEM DUEL.** A light-gun cabinet, a bullet-hell and a
competitive puzzler: three genres, all natively portrait, all natively touch,
and not one of them needs a fighting game's animation budget. The fighters and
beat 'em ups are the ones to attempt once there is an animation pipeline worth
the name — they are where this decade gets expensive.


---

## 4. Suggested batches

Three at a time, always mixed so no two consecutive builds feel the same.

- **Batch A** — ☑ Penboy · ☐ Soviet Blocks · ☐ Ricochet
  *A chase, a stacker, a paddle game. Three different muscles, all one-thumb,
  none overlapping anything on the floor. Ships the `gesture` helper.*

- **Batch B** — ☐ Ribbit · ☐ Phalanx · ☐ Coil
  *All small. A fast batch to build momentum and prove the pipeline.*

- **Batch C** — ☐ Aegis · ☐ Feather · ☐ Popshot
  *Tap-precision, physics, and aim. Ships `Arcade.scores`.*

- **Batch D** — ☐ Swarm · ☐ Girder · ☐ Burrow
  *The three medium arcade classics. Ships `Arcade.fx`.*

- **Batch E** — ☐ Ziggurat · ☐ Myriapod · ☑ Vector
  *Awkward-controls tier. Prototype each control scheme before committing.*

- **Batch F** — ☐ The Well · ☐ Lance · ☐ Plumb
  *Reuses the pseudo-3D work; two physics games and a puzzler.*

- **Batch G** — ☐ Fuse · ☐ Southpaw
  *The two biggest. Southpaw is the flagship — give it room.*

- **Batch H** — ☐ Grid Riot
  *Needs the twin-stick overlay, and possibly landscape support in the shell.*

- **Batch I — last, by decision** — ⊘ Tilt · ⊘ Horde
  *Both parked until everything else is on the floor. Tilt carries the most
  technical risk on the list and Horde has to prove it is not just Derelict
  in real time. Revisit only when the rest is done.*

---

## 5. Effigy Originals — ongoing

The clones are the floor. These are the reason for the arcade.

- ☑ **Deep** — one-thumb descent
- ☑ **Derelict** — turn-based ship crawler: line-of-sight pursuit, patrols, fast
  pack hunters, a twenty-piece armoury with four ammunition types, consumables,
  a gear screen, drawn sprites, and a headlamp that stops at bulkheads
- ☑ **Highway** — pseudo-3D pursuit
- ☑ **Pellet** — maze chase (first of the clone floor)
- ☐ *next original* — no brief yet. Keep a slot open in every other batch so
  the floor never becomes only clones.

Ideas parked for later:
- A tide-based puzzler where the board floods and drains on a fixed clock.
- Something using the microphone.
- A one-button rhythm game built on the existing synth engine.
- A courier game across a procedural city, scored on route choice not reflex.

---

## 6. Housekeeping

- [ ] Move Derelict's grid/pathfind code into `Arcade.grid` when Penboy needs it.
- [ ] Consolidate the three private particle systems into `Arcade.fx`.
- [ ] `games.js` grows long — consider grouping by tier in the launcher once
      there are more than about a dozen cabinets.
- [ ] Launcher: filter or search once the rack exceeds roughly fifteen machines.
- [ ] Consider a service worker so the arcade genuinely runs offline including
      fonts. Currently fonts fall back without a network.
- [ ] Per-game credits line on the game-over screen.

---

---

## 7. Derelict — combat rework (BUILT — melee, ranged, corner rule)

Nothing below is built yet. Sign it off or mark it up and it goes in.

### Resolution

    ATKR = ATK + 1d20        DEFR = DEF + 1d20
    hit if ATKR > DEFR, otherwise a miss

| roll | outcome |
|---|---|
| attacker nat 20, defender not nat 20 | damage **doubled** |
| defender nat 20, attacker not nat 20 | damage **halved** (a graze) |
| attacker nat 20 **and** defender nat 1 | **instant kill** |
| attacker nat 1 **and** defender nat 20 | full damage **reflected onto the attacker** |
| attacker nat 1 otherwise | clean miss, no damage |

Margin matters too: every 5 points of `ATKR − DEFR` above the hit adds **+1**
damage, so a big swing against something slow is worth more than a scrape past
something quick.

### Player

    ATK = 3 + level + weapon bonus
    DEF = 3 + level + plating

### Damage dice

**Melee** — costs stamina, invites a counterattack

| weapon | damage | ATK | notes |
|---|---|---|---|
| Fists | 1d4 | +0 | always available, never dropped |
| Bone Knife | 1d6 | +1 | quiet |
| Salvage Bar | 1d8 | +0 | +1d6 against PLATED |
| Shock Baton | 1d6+2 | +1 | stuns one turn |
| Bulkhead Sabre | 2d6 | +2 | |
| Tooth Saw | 3d6 | −1 | 1 fuel, cleaves everything adjacent |

**Tools** — repurposed, and it shows

| tool | damage | ATK | notes |
|---|---|---|---|
| Core Sampler | 1d6 | +0 | bleed 1d4 for 3 turns |
| Cutting Torch | 1d8 | +0 | 1 fuel, ignores plating, burn 1d6 ×2 |
| Arc Welder | 2d4 | +1 | 1 cell, stuns one turn |
| Rivet Gun | 1d6 | +1 | ranged 2 |

**Firearms** — no counterattack, but the lamp decides your reach

Every frame has a slug baseline. The other two feeds trade reach against power
in opposite directions, which is what makes carrying the right one a decision:

    laser   one die weaker  ·  +2 squares  ·  pierces plating   RED
    plasma  one die harder  ·  −2 squares  ·  sets them burning  GREEN

The feed has one colour and it is the same everywhere: the cells and flasks on
the deck, the receiver of a loaded weapon, the muzzle flash, and the light that
flash throws. `--laser:#ff3b3b`, `--plasma:#3bff8a`.

For the multi-shot frames the die stays at d4 and the **shot count** steps
instead, since d4 has nothing below it.

| frame | slug | laser · +2 sq | plasma · −2 sq |
|---|---|---|---|
| Rivet Gun | 1d6 · 2 sq | — | — |
| Pistol | 1d6 · 4 sq | 1d4 · 6 sq | 1d8 · 2 sq |
| SMG | 3 × 1d4 · 4 sq | 2 × 1d4 · 6 sq | 4 × 1d4 · 2 sq |
| Shotgun | 2d6 · 3 sq | 2d4 · 5 sq | 2d8 · 2 sq |
| Rifle | 2d8 · 9 sq | 2d6 · 11 sq | 2d10 · 7 sq |
| LMG | 5 × 1d4 · 6 sq | 4 × 1d4 · 8 sq | 6 × 1d4 · 4 sq |

Optimal range floors at 2, so nothing ends up as a gun you must be standing on
top of. The **Rivet Gun is slug only** — it is a hull tool with a hopper, not a
weapons platform.

### Class traits

One per class, so the choice is never only about numbers. All of these are on
the **frame**, not the ammunition.

| class | trait | what it does |
|---|---|---|
| Rivet Gun | **SCRAP-FED** | out of slugs, it will chew cells or plasma as improvised slugs — same 1d6, no penalty. It never truly runs dry. |
| Pistol | **QUICKDRAW** | the only gun with no close-quarters penalty. Every other firearm takes **ATK −4** with a hostile adjacent; this one does not. That is why you keep it. |
| SMG | **SUPPRESSING** | each projectile that lands drops the target's ATK by 1 for its next turn. A full burst makes the thing in front of you much worse at hitting back. |
| Shotgun | **KNOCKBACK** | shoves the target one tile directly away. Into a wall, off a ledge, into fire — the placement is the weapon. |
| Rifle | **AIMED** | if you did not move on your previous turn, it ignores the range falloff entirely. Set up and it reaches eighteen squares at full accuracy. |
| LMG | **SPRAY** | splits its five shots across up to three targets in the beam, rather than dumping all of them into one. |
| Flamethrower | **FIRE** | cone, and everything it touches burns. See below. |

The adjacency penalty is new and load-bearing: it is what stops a rifle being
strictly better than everything, and it gives the pistol a permanent job as
your second slot.

### Range falloff

The listed range is the **optimal** range. You may fire out to **double** it and
no further.

    beyond optimal, up to 2× :  ATK penalty = 12 − (size of the damage die)
    beyond 2×                :  no shot

So the penalty falls straight out of the die, and big dice shoot long:

| die | d4 | d6 | d8 | d10 | d12 |
|---|---|---|---|---|---|
| **penalty past optimal** | −8 | −6 | −4 | −2 | **−0** |

Which means the feed choice moves your accuracy as well as your reach. A plasma
pistol is 1d10 at 2 squares but only −2 out to 4, so it stays usable past its
band; an SMG is −8 the moment you step outside four squares and turns into
noise. The rifle keeps −4 all the way to eighteen, where the lamp stops you long
before the barrel does.

### Incendiary

| weapon | feed | damage | optimal | max | falloff |
|---|---|---|---|---|---|
| Flamethrower | fuel | 1d6 **+ burn 1d6 × 3** | 3 sq | 6 sq | −6 |
| Charge (frag) | thrown | 3d12 centre / 1d12 splash, stuns | 4 sq | 8 sq | **−0** |
| Incendiary | thrown | 2d12 centre / 1d12 splash **+ burn 1d8 × 3** | 4 sq | 8 sq | **−0** |
| **Chem Light** | thrown | none — it is a light | 5 sq | 10 sq | −6 |

The flamethrower fires a **cone** — three tiles wide at full reach — and every
tile it sweeps catches fire for 2 turns. An incendiary sets its whole blast
radius alight for 4.

### Throwing

You are not throwing *at* a creature, you are throwing *at a tile* — nothing
dodges a grenade, it just goes off. So thrown objects roll a **placement check**
against a flat target rather than against DEF:

    ATK + 1d20  vs  10          (range falloff applies as a penalty)

Falloff uses a **heft die** in place of the damage die, because how an object
flies has nothing to do with what it does on landing. A charge is dense and
throws true; a light stick tumbles.

| thrown | heft | past-optimal penalty |
|---|---|---|
| Charge, Incendiary | d10 | −2 |
| Chem Light | d6 | −6 |

Landing odds, worked through:

| | within optimal | past optimal |
|---|---|---|
| Charge, level 1 / 5 / 10 | 75% / 95% / 100% | 65% / 85% / 100% |
| Chem Light, level 1 / 5 / 10 | 75% / 95% / 100% | **45% / 65% / 90%** |

*(This supersedes the earlier note about d12 explosives having no falloff. That
was a tidy observation but it left max range doing nothing, which was the whole
problem — a range band with no roll attached is just an arbitrary cutoff.)*

### Scatter and bounce

A failed placement check does not fizzle. The object goes somewhere:

    1d8  direction   (N NE E SE S SW W NW)
    1d4  distance    in squares

If the path meets a bulkhead it **bounces**, keeping whatever distance it had
left. Three cases:

| it hits | what happens |
|---|---|
| a wall square on | straight back the way it came |
| a wall on one side of a diagonal | mirror **only the blocked component** — NE off a wall to the east becomes NW |
| an inside corner, both sides blocked | reverse both components, straight back along the diagonal |

A diagonal that clips only the corner tile — both orthogonal neighbours open —
also reverses, because there is nothing to deflect off.

After four bounces it stops caring and drops where it is, so a grenade cannot
ping-pong forever in a one-tile pocket.

**Verified** across 4,832 throws on a test chamber with flat walls, a pillar and
an inside corner: nothing ever ended inside a bulkhead, nothing left the board,
and no step of any path clipped a wall. 37% of throws bounced at least once.

Worked examples:

    from 5,1 heading N  3 sq  ->  5,4   ceiling, straight back
    from 10,3 heading E 4 sq  ->  6,3   notch wall, straight back
    from 5,5 heading SE 4 sq  ->  1,1   clipped the pillar corner, reversed

### Chem Light

A throwable that does nothing but see for you.

- Lands where you aim; no attack roll. A bad throw just rolls a tile.
- Lights a **radius 3** patch for **12 turns**, and the light is cast **from the
  stick**, not from you — so it sees round corners you cannot.
- Chem-lit tiles count as lit for everything: you see hostiles standing in them,
  and because `inShotRange` needs a lit target, **you can shoot into the patch**.
  Throw one down a corridor and the corridor becomes a firing lane.
- It reveals terrain permanently the way your own lamp does, so it doubles as a
  scout — and scanning new sectors is what repairs you.

This is the answer to the Filament Lamp being deliberately feeble. You are not
stuck with three squares; you are stuck with three squares **unless you spend
something**. It also gives the Arc Lantern a rival rather than an obsolescence:
lantern is passive and permanent, chem lights are burst and disposable.

### Burning

**Burn N** — the target takes the burn die at the end of each of its turns for
N turns. Re-applying does not stack the duration; it refreshes it and keeps the
larger die.

**Fire tiles** — a new board state, and it needs art:

- Anything **ending its turn on a burning tile** takes 1d6 and catches burn 1.
  That includes you. Incendiaries are a positioning decision, not a free nuke.
- Fire **lights the tile**. A burning square is visible through the fog even
  outside your lamp, so an incendiary is also a flare — it shows you the room
  it is cooking. This falls out of the lamp system for free and is worth having.
- Overlay: animated flicker under the actors, amber through to red, with the
  floor plating still readable underneath. Plus a small flame glyph so it reads
  at a glance on a phone. Burning **actors** get the same glyph pinned to their
  sprite, next to the health pip.

Blind fire at a heard contact rolls at **ATK −4** and halves the dice. It
**stacks** with the falloff penalty, so a long blind shot with an SMG is ATK −12
and half damage — technically legal, practically a waste of ammunition. That is
the correct answer for spraying into the dark.

**Thrown and carried**

| item | effect |
|---|---|
| Charge | 4d6 at the centre, 2d6 to everything adjacent, stuns |
| Med-gel | heals 2d6 |
| Trauma Kit | heals 4d8, purges corrosion |

### Hostiles

Scaled by deck tier: `ATK`, `DEF` and damage dice all step up every third deck.

| species | ATK | DEF | damage | trait |
|---|---|---|---|---|
| Crawler | 1 | 1 | 1d4 | — |
| Skitter | 1 | 4 | 1d3 | fast, packs of four |
| Husk | 2 | 1 | 1d6 | strikes first |
| Spitter | 2 | 0 | 1d6 | corrodes the suit |
| Gorger | 2 | 3 | 1d8 | regenerates |
| Warden | 2 | 6 | 1d8 | plated |
| Wraith | 3 | 2 | 1d6 | drains charge |
| Shrike | 3 | 3 | 1d6 | fast, pairs |
| Stalker | 4 | 2 | 1d8 | hunts across the deck |
| Apex | 5 | 5 | 2d8 | guards the hatch |

---

## 8. Derelict — queued, in order

0. ~~**Dice combat**~~ — built. Two things had to change from the paper design:
   the **execute is now a finisher** (a nat-20 against a nat-1 only kills a
   target already under half, otherwise it is a brutal crit) because at 1-in-400
   per swing and ~240 swings a run it would have ended 45% of runs out of
   nowhere; and **damage is multiplied by calibration level**, because flat dice
   go stale against hostiles that gain HP every deck and a flat per-level bonus
   would have made every weapon converge. All of section 7 is now built: throwing with the
   flat-10 placement check and bouncing scatter, fire tiles that burn and
   light, chem lights that see round corners, the flamethrower cone, and
   incendiaries that can catch you as well.
1. ~~**Stamina**~~ — built. Green bar. Melee costs stamina in proportion to its dice;
   sprinting more than six tiles in one move costs stamina. Under six tiles is
   free and shown with a pale green tint, the way the firing envelope is shown
   in red. A REST action recovers it.
2. ~~**Two weapon slots**~~ — built. Two hands plus fists, which are never a
   slot and never droppable. Walking onto a weapon with both hands full opens a
   prompt comparing it against what you carry; taking it leaves the old one on
   that tile, declining leaves the new one. Every weapon now has its own
   silhouette on the deck, drawn by class, so a rifle reads as a rifle from
   across the room. Old saves keep their two best weapons and bin the rest.
3. ~~**Corner rule**~~ — built, and it governs movement as well as attacks.
4. ~~**Dice combat**~~ — built. See item 0.
5. ~~**Zoned levels**~~ — built. A deck is a chain: zone 0 is open, zone *k*
   sits behind the *k*-th door, and the card for that door lies in zone *k-1*.
   The gates were already chosen from tiles that cut the hatch off, so they
   nest along one route by construction — the fault was selecting them **by
   index**, which put two doors on consecutive corridor tiles and produced the
   adjacent cards. Selection is now by distance along the route with a minimum
   gap of four, and the layout is **proved before it is used**: every door must
   be walkable-up-to before the next one, and the hatch must stay sealed while
   any door is shut. A layout that fails is discarded and the deck regenerated.
   Verified over 360 decks: closest two doors 4 tiles, every card obtainable in
   turn, hatch behind the final door 360/360.
6. ~~**Bigger decks with a scrolling camera**~~ — built. The window is a fixed
   11x14; the deck is larger from the very first level and grows with depth,
   13x18 up to 25x36, so the camera is doing work from deck one rather than
   switching on later. It centres on the diver and clamps at the hull, and taps
   are offset by it. **The floorplan bounds had to scale too** — they were
   written as absolute tile counts for the old fixed hull, so every larger deck
   failed all 80 generation attempts and fell back to one open box with no
   walls. They are a fraction of hull area now.
7. ~~**Bestiary ×4**~~ — built. 38 species and five apexes, up from ten and one.
   The new ones are drawn from **six body plans** — crawl, biped, float, plate,
   mass, swarm — varied by size, limb count, eye count and spines, rather than
   thirty bespoke sprites. That keeps a family resemblance inside a tier, so a
   new deck reads as a different part of the ship. Twelve tiered rosters, and
   the apex on the hatch is drawn from a pool that opens up with depth
   (Broodmaw, Warlord, Sovereign, Leviathan), so the thing on the salvage is no
   longer the same silhouette every run. New traits: AMBUSH (holds still until
   you are within two), SHRIEKS (wakes the compartment once), SPLITS (comes
   apart into two smaller on death), LEECH (heals itself for what it takes),
   BLEEDS. All 38 colours verified distinct.
8. **Bulkhead facing** — the lit edge of a hull tile faces the room, so a tile
   can carry an edge on two, three or four sides.
9. **Organic walls** — currently they do not read as organic. Redraw or animate,
   or cut them.
10. **Pathing** — better routes for long-distance clicks and for hostiles.

## 8e. Derelict — the suit (BUILT)

Weapons derive ATK. DEF should derive the same way, from something you chose —
right now it is `3 + level + resist`, and `resist` comes from a couple of
one-off upgrade cards, so defence is the only number on the sheet the player
cannot build toward.

### The frame

Two weapon slots and your hands; **three mod slots and the bare suit**. Mods are
individually weaker than weapons, which is why there are three of them.

    DEF = 3 + level + sum(mod DEF)
    ATK = 3 + level + weapon ATK

**`resist` is gone.** There used to be a separate percentage sitting beside DEF,
but nothing ever multiplied incoming damage by it — it was folded into DEF
anyway, so the upgrade card promising *"all incoming damage reduced by 20%"* was
describing arithmetic that never happened. One number now, and armour is what
raises it. Old saves convert their resist into DEF rather than losing it.

The bare suit is the armour equivalent of fists: it works, it is never taken
away, and it is not good.

### Mods

Every one has a cost. A mod that is only "+2 DEF" is a stat, not a decision.

| mod | DEF | cost | note |
|---|---|---|---|
| **Hull Plate** | +4 | −4 max stamina | The obvious one, and it makes you slow. |
| **Mesh Underlay** | +3 vs melee only | — | Nothing against anything shooting at you. |
| **Ablative Skin** | +5 | degrades 1 per hit taken, to 0 | Enormous, briefly. Repairable at a bench. |
| **Reactive Weave** | +2 | — | Returns 1d4 to anything that lands a melee blow. |
| **Sealed Liner** | +1 | — | Immune to corrosion. Spitters stop mattering. |
| **Insulated Layer** | +2 | −2 charge capacity | Halves fire and burn damage. |
| **Faraday Mesh** | +2 | −1 lamp radius | Halves electrical damage; drain does nothing. |
| **Servo Harness** | +1 | −1 weapon slot | +6 max stamina, +2 free movement squares. |
| **Ceramic Inlay** | +3 | −15% scan repair | Halves plasma and heat. |

### Why this matters more than it looks

The four Omegas each have an immunity, a resistance and a **weakness on a damage
axis**. Three of the mods above resist a specific axis. So a shard telling you
*it withdrew from the torch, then came straight back* is not just a hint about
which gun to carry — it tells you what to fit before deck 12.

That closes the loop properly: the documents inform the build, the build decides
the fight, and the fight is why you went down.

### Where they come from

Marines wear armour, so they drop mods. Lockers and crew effects hold them. A
bench somewhere on the run lets you swap and repair — which gives the ascent a
reason to pass back through a deck you remember.

**Two slots.** Three let you stack DEF 11 at level one, which flattened the
early decks; with two, every mod you fit costs you another one. Built and verified: bare suit DEF 4, three mods
fitted DEF 11; Hull Plate costs 4 stamina, Servo Harness gives 6 back and takes
a weapon slot (2 → 1), Faraday shortens the lamp 3 → 2, Mesh Underlay reads
4 DEF against a gun and 7 in reach. Fitting a fourth prompts, and the one you
take off stays on the deck.

**Marines drop what they wore** — their armour is drawn from this same table,
so the mod on the floor is the one that was making them hard to hit.

## 8d. Derelict — the twelve-deck run (FRAME BUILT)

The wreck gets a bottom, and a reason to reach it.

**Down.** ~~Twelve decks. Each stores its own structure for the run, because you
climb back through them. Deck 1 gains an airlock to the outside; every deck
gains an up-hatch.~~ Built.

`stashDeck()` freezes a deck as you leave it — map, what is still on the floor,
which doors you opened, which oxygen stations you drank. `restoreDeck()` brings
it back. Verified over a four-deck round trip: items, opened doors and drained
stations all survive exactly.

**Hostiles ARE stored.** Backtracking up during the descent brings back exactly
what you left alive — otherwise walking up a deck and back down would be a free
way to wipe a compartment you could not handle. Verified: 8 hostiles, kill 2,
leave, return, 6 remain.

**Depth runs 13-24 on the way out, and the roster has to keep up.** `ROSTER`
only has twelve tiers, so clamping to it made the entire climb draw the same
top-tier cast — flat, and indistinguishable from deck 12. The ascent now pools
the deepest tiers and **widens that pool as you rise**, with marines folded in
throughout: the crew is between you and the airlock, and that is what makes the
climb a different game rather than the descent replayed.

| deck | depth | hostiles | avg lvl |
|---|---|---|---|
| 12 | 13 | 9 | 7.0 |
| 8 | 17 | 12 | 9.0 |
| 4 | 21 | 16 | 12.0 |
| 1 | 24 | 18 | 13.0 |

Compare deck 8 going down — 14 hostiles at average level 4.9 — with deck 8
coming up: fewer bodies, far higher level, a deeper cast. The last stretch to
the airlock is the hardest part of the run.

### The persistence rules, stated plainly

| when | what happens |
|---|---|
| descending, revisiting a deck | restored exactly — dead stay dead, loot stays taken |
| killing the Omega | **only deck 12** repopulates, under your feet |
| climbing into a deck for the first time | repopulates once, harder |
| revisiting any ascent deck | restored exactly — no second reroll |

Decks are **not** all re-rolled when the Omega dies. It happens lazily, one deck
at a time, the first time the climb reaches each. Everything above deck twelve
sits untouched until you get there.

Verified: descent, killed 3 of 9, returned to 6. Ascent, deck 11 came up with
10, killed 4, dropped back and found 6.

**A deck is repopulated exactly once**, the first time you climb into it on the
way out — re-rolled against `depthOf()`, so the same deck came back with 16
where it had 6. After that it persists in **both** directions: going back down
mid-ascent restores it garrison and all, rather than rebuilding.

Without that, walking down a deck and back up would re-roll a garrison you could
not fight — the same exploit the descent already guards against, only in
reverse. Verified in play: 16 hostiles on deck 6, kill 4, climb to 5, drop back
to 6, and **12 are still there**. The map is remembered; nothing living in
it is. The climb re-rolls a heavier garrison against `depthOf()`, so the same
space is a different fight on the way out — 14-19 hostiles per deck against
8-12 going down.

Every deck's up-hatch sits on the tile you arrived at, so the geometry always
agrees; deck one's is the airlock, drawn differently. Reaching deck 12 turns the
run around rather than continuing, and `showEscape()` is a placeholder ending
until the per-Omega cinematics exist — a run that can be *won* needs a win
screen from the day the frame lands.

### What stops a run being unwinnable

**Not seeding the counter.** An earlier pass forced a weapon on the weakness
axis onto every deck until you carried one — which handed you the answer the
datashards exist to teach and made reading them pointless. Removed.

**Not fists, either.** They are always available and they are not a fallback:
against the Lamprey, which is *weak* to melee, fists take **38 swings** while it
kills you in four.

| weapon | per swing | swings to kill |
|---|---|---|
| Fists | ~24 | 38 |
| Bone Knife | ~37 | 25 |
| Bulkhead Sabre | ~84 | 11 |
| Chainsaw | ~100 | 10 |

**What actually stops it:** the wreck is full of the answer and it stays where
you left it. Across forty runs of eleven decks, ~7 weapons appear per run
spanning **all five axes** — melee 32%, shock 26%, heat 17%, kinetic 15%, fire
10% — none of them planted. And because decks persist, a weapon you walked past
on deck six is still on deck six. Reaching twelve with the wrong loadout means
**climbing back for the right one**, at the cost of oxygen and a re-populated
deck.

That is a real penalty rather than a dead end, and working out *what to fetch*
is exactly what the shards are for.

### The Hollow Light needed a weakness you cannot trip over

Being "in light" was satisfied by walking up to it — your lamp lights whatever
you can see, so the immunity meant nothing and it was simply x2 always.

It now takes damage only while standing in **thrown** light: a chem stick
burning on a tile near it. Your own lamp does not count. So the stick is the
attack and the blow is the follow-through, and the fight is about placing light
under something that keeps moving.

### Quality tiers — BUILT

One scale across everything found. **GOOD is the baseline the tables were
written against**, so nothing needed rebalancing — the other tiers bracket it.

| tier | dice | note |
|---|---|---|
| Poor | x0.75 | |
| Good | x1.00 | the existing numbers |
| Excellent | x1.30 | |
| Exquisite | x1.30 | plus a perk suited to the item |

Exquisite perks are the item's own virtue taken further, not a generic bump:
ranged pierces the first target, melee cleaves a second, tools never fumble, a
suit mod weighs nothing, an optic reaches a square further.

    floor, deck 1     poor 19%  good 54%  excellent 23%  exquisite  4%
    floor, deck 12    poor  8%  good 57%  excellent 22%  exquisite 12%
    marine drop       poor 62%  good 31%  excellent  6%  exquisite  1%

**Marines carry mostly poor kit** — it has been on a corpse for weeks with
nobody servicing it. The crew had good equipment once, so a rare one still has
theirs.

The depth bonus is **capped**: uncapped, deck twelve produced exquisite gear 17%
of the time, which made the last decks a lottery rather than a reward.

**An armoury locker always yields Excellent**, and cracking it pays calibration
on a curve — `max(2, 8 - attempts)` — so reading the lock well is worth more
than brute-forcing it.

### Armoury lockers — BUILT

A ship's terminal wanting a four-figure release code. Four figures from six, no
repeats — 360 possibilities. Each attempt reports how many are **in place** and
how many are **present but elsewhere**, and every attempt costs a turn.

Solved by deduction: **4.0 attempts on average, 6 worst case** over 300 trials.
So the wager is about four breaths of air against a weapon a tier above what an
ordinary locker holds, and guessing wildly costs more than thinking.

It sits on loot, not on story. **A puzzle in front of a datashard was considered
and rejected** — the shard already *is* the puzzle, and putting a lock before it
says the deduction is not enough on its own. Lockers are optional, so a player
who does not want it walks past.

You can step away and come back: the code and every attempt so far persist with
the deck, so an unsolved locker is still waiting with your working intact.

### Killing an Omega pays for the climb — BUILT

The climb out is harder than the descent and you arrive at it spent. A trophy
tied to what you killed, rather than a generic power-up:

| Omega | trophy | what it does on the ascent |
|---|---|---|
| The Ninefold Weight | **Sealed Ballast** | it grew by taking on mass — the suit holds +60% oxygen |
| The Choir | **One Voice** | it answered blows by dividing — your shots split, hitting a second target for half |
| The Lamprey | **Closing Distance** | it would not be shot at — you move two free squares more per turn |
| The Hollow Light | **Afterimage** | it lived in the dark — your lamp reaches three squares further and never dims |

Each is permanent and costs no mod slot, since it is earned rather than found.
Measured on pickup:

    Sealed Ballast     oxygen 200 -> 300
    Afterimage         lamp 3 -> 6 squares
    Closing Distance   a 10-step dash costs 4 -> 2 stamina
    One Voice          a second lit target within 3 takes half the blow

The free-movement overlay had to learn about Closing Distance too — it drew a
fixed six squares, so the trophy would have been invisible and the green tint
would have been lying about what a move costs.

### Music — BUILT, with vertical re-orchestration

Three layers on the **same grid**, so they stay locked to each other and to the
drone. Nothing restarts when the state changes; the layers fade across, which is
why a fight can begin mid-phrase and still land on the beat.

| layer | when | what it is |
|---|---|---|
| **explore** | always | the deck's motif, ducked but never silenced |
| **contact** | anything hunting you within 9 | driving eighths, a rising figure, a hat on the sixteenth |
| **apex** | an alpha or an Omega in the room | a tritone pedal, an off-beat stab, a falling sweep |

Measured through a full cycle:

    exploring          explore 1.00  combat 0.00  apex 0.00
    3 ticks of combat  explore 0.84  combat 0.53  apex 0.00
    10 ticks           explore 0.61  combat 0.96  apex 0.00
    apex arrives       explore 0.34  combat 1.00  apex 0.98
    room goes quiet    explore 1.00  combat 0.00  apex 0.00

**Exploration ducks to 55% under combat and 30% under an apex rather than
cutting out.** It is the floor the other two stand on — killing it entirely made
the transition sound like a different track rather than the same room getting
worse.

Attack and release are deliberately asymmetric: combat rises in about ten ticks
and decays over forty. Trouble arrives faster than it leaves.

Six figures over the existing drone, one drawn per deck. All in D minor or its
phrygian shade so they sit against the pedal the bed already holds, and all
sparse — the ambience is the floor, these only place a few notes on it.

| figure | density | what it is |
|---|---|---|
| **vigil** | 0 | two falling notes, very far apart |
| **descent** | 1 | a stepwise fall, D E♭ F, unhurried |
| **toll** | 1 | a struck bell on the half, its fifth underneath |
| **circling** | 2 | a figure that keeps returning to the same note |
| **lament** | 2 | phrygian — the flat second, which never settles |
| **pursuit** | 3 | a low pulse that will not stop |

Selection is weighted by depth, so the sparse ones sit shallow and the busy ones
sit deep:

    deck  1: vigil 27%, descent 20%, toll 20%
    deck  8: circling 27%, pursuit 20%, lament 20%
    deck 12: circling 33%, lament 20%, toll 17%

And a deck never repeats the figure of the one you just left — **0 repeats
across 480 transitions**. The change is what tells you the ship has changed.

Measured on the music bus: 0.133 for the sparsest through 0.186 for the busiest,
so the density gradient is audible and not just structural.

Several ominous minor-key loops that cycle at random deck to deck, layered over
the existing ambience rather than replacing it. The synth engine and sequencer
already carry every other bed in the arcade, so this is composition rather than
new code. Worth writing them at different densities so a shallow deck and deck
eleven do not sound alike.

**BUILT: the four Omegas and the property system.** Chosen at the airlock and
stored on `P`, so the shards can be about the thing you will actually meet.

    omegaScale()          kinetic  shock  heat  fire  melee  blast  light
    The Ninefold Weight      —      x2     ½     1     1      1      1
    The Choir                1      —      x2    1     ½      1      1
    The Lamprey              —      —      —     —     x2     —      —
    The Hollow Light         —      —      —     —     —      —      x2

`damageAxis()` asks what a blow is made of from the weapon itself, so nothing
new had to be added to the armoury. The Hollow Light additionally takes nothing
while standing in darkness — the chem lights become the weapon.

The log makes the answer unmistakable: *"it does nothing. KINETIC is wasted on
this"* against an immunity, *"SHOCK TEARS INTO IT"* against a weakness. A player
who cannot tell will assume the fight is long rather than the weapon wrong.

**Ranged had its own damage site** and was bypassing the whole system — a rifle
hurt something immune to rifles. Both paths scale now.

### Calibration should not require murder

It came from exactly two places — kills and data shards — so the only reliable
route to a level was clearing a deck, which pushes you to farm exactly where
oxygen is trying to move you on. Three sources added, none of them combat:

| source | value |
|---|---|
| reaching a new deck | 2 + deck/3 |
| installing the salvage core | 3 |
| surveying the wreck | 1 per 40 fresh tiles |

That guarantees a floor. A run with **no kills at all** now reaches level 14 by
deck twelve — ATK 19 against Omega DEF 16, so a quiet player arrives able to
fight. A thorough one reaches around 25.

**That spread is wide, but it matters less than it looks**, because levels only
decide whether you *land* a blow. An Omega immune to your axis takes nothing at
level 25 just as it takes nothing at level 5 — the fight is about what you
carry, and calibration only buys you the right to make the attempt. Worth
watching in play whether the HP growth at high levels flattens the run.

**Omega DEF is a flat 16**, not scaled by level. They only ever appear on deck
twelve, so there is nothing for the number to scale against, and a fixed figure
is something the armoury can be designed around rather than a value that drifts
with how the run went.

**HP is fixed too**, for the same reason — around 900, varying by species. Left
scaled it came out at 165, which the right weapon removed in **two swings** after
a twelve-deck descent.

Where the fight lands, sabre against the Lamprey's melee weakness:

| arrival | level | lands | per swing | swings to kill |
|---|---|---|---|---|
| pacifist, no kills | 14 | 43% | ~84 | **11** |
| exhaustive, cleared every deck | 25 | 86% | ~302 | **3** |

Both are fights. The quiet player works for it and the thorough one is rewarded
for the levels they earned, which is the right shape — and neither can touch it
at all with the wrong axis.

*(An earlier note here claimed the fight was unplayable at DEF 13. That was
wrong — the test had hardcoded the player to level 5 for a deck-12 fight.)*

**The Omega.** Chosen at the airlock, fought on deck 12. Four of them, each a
different cosmic horror with **five** properties: a **pattern**, an
**immunity**, a **resistance**, a **weakness**, and **the damage type it deals**.

That fifth one is what makes the suit matter. Immunity and weakness tell you
what to *carry*; dealt damage tells you what to *wear* — Insulated against a
thing that burns, Faraday against a thing that arcs, Ceramic against a thing
that comes in hot. Five properties, five shards, and between them they specify a
complete loadout. Four is what the armoury supports — the axes are kinetic (24% of
weapons), electrical (24%), heat/plasma (20%), melee (24%), fire (8%), plus
blast, stun and bleed from consumables. The fourth needs **light as a damage
axis**, which is new code but makes the chem light and the lamp into weapons and
turns the fog system into the fight.

A weakness must sit on an axis you can reliably find, or a bad drop run is
unwinnable through no fault of the player. **Once the Omega is chosen, seed a
weapon on its weakness axis into the drop tables by deck 8.**

**Datashards.** Five across the whole run, one per property, not one per deck —
scarcity makes each an event and lets them be side-objective rewards. Find none
and the fight is still winnable, just expensive and learned by dying.

The dealt-damage shard is the easiest to write honestly, because a ship keeps
records of injuries. A medical log listing the same burn on four crew, or a
maintenance note about scorched bulkheads on one deck, says what it does to you
without ever saying it.

### The shard rule

Shards are **documents, not diary entries**. A manifest, a work order, a denied
requisition, a medical chart, a maintenance log. Documents cannot emote, and the
horror is in the reader's arithmetic rather than the prose.

- No shard may name a feeling, describe darkness or silence, or use "something".
- Only facts, quantities, procedure and names. If a line could not appear on a
  real form aboard a working ship, cut it.
- **Hints must be inferable, not encoded.** "Deck 4 lighting circuit tripped
  twice, welder missing from locker 4C" is inference. "Electrical damage is
  effective" is a strategy guide, and the moment a shard reads like one the
  whole device collapses.

**Up.** The Omega dies, the self-destruct starts, and you climb out through the
same twelve decks — remembered, not mapped, and restocked with stronger things.
The descent clock in `tickAlarm()` is **built and gated behind `P.ascending`**;
it belongs to the climb, where the pressure has a reason.

### Showing the loadout on the sprite

Both the diver and the marines should wear what they carry. Two notes before
anyone starts drawing.

**The weapon is nearly free.** Every weapon already has a per-class silhouette,
drawn for the floor. Scaled down and held at the sprite's side it costs almost
nothing new, and the feed colour is already doing work — a red receiver reads as
a beam weapon from across the compartment.

**The space is smaller than it feels.** Measured on the real board:

| | cell | body |
|---|---|---|
| iPhone 14 | 33px CSS | **~20px** |
| iPhone SE | 22px CSS | **~13px** |

Thirteen pixels of torso will not show nine distinct armour mods, and pretending
otherwise produces mush that reads as noise. What *is* legible at that size:

- **Weapon class** — blade, sidearm, long gun, heavy. Four silhouettes, not
  twenty-five.
- **Feed colour** — red, green, or bare steel on the receiver. Already built.
- **Armour weight** — light, medium, heavy, as body bulk. Three silhouettes.
- **One accent** — a single coloured pip or trim for the dominant mod, so a
  Faraday build and an Insulated build are told apart by colour rather than form.

So: four weapon shapes × three body weights × an accent. That reads at 13px and
still gives a marine a recognisable loadout at a glance, which is the actual
goal — you want to know what is coming down the corridor before it arrives.

Anything finer belongs in the gear screen, where there is room for it.

### Launcher — shelves, numbering, favourites

Cabinets are numbered by **position on their shelf**, so every shelf reads 01,
02, 03 whatever it holds, and the numbers follow the sort rather than
contradicting it.

Sorting is **A–Z / Z–A only**. Favourites are not a third mode to go and
select — a starred cabinet always sits above the unstarred ones, and the toggle
decides the alphabetical direction *inside* each group. One control, two states,
and the star does the prioritising.

The star lives on the marquee of each card. It is inside a link, so its handler
stops the event or tapping it would launch the cabinet.

### The ascent — open decisions

### The self-destruct is cut

Two clocks on the ascent is one too many, and oxygen is the better of them.

The arithmetic: a straight-line crossing of a deck is ~26 turns, so a thorough
run — looting, fighting, doubling back — is nearer 80. Twenty-four decks at that
rate is **~1890 turns against a 1200-turn suit**. Oxygen is already binding
before a second timer is added, and the stations you drank on the way down are
what decide whether you make it.

Oxygen is also simply the better mechanic here. It runs the whole game rather
than switching on and changing the rules; it is **spatial**, because stations are
places on a map you are navigating from memory; and it is **elastic** — you can
plan around it, carry canisters, fit a suit that spends less. A countdown can
only be raced.

`tickAlarm()` stays in the file, gated behind `P.ascending` and unused. Its
staged escalation — the deck waking, then hunting, then the compartment failing
— is worth **re-pointing at low oxygen instead**, so the ship starts coming
apart when your air does. That is the drama the self-destruct was for, attached
to the resource that already matters.

### Oxygen — the run's clock

**One meter for the whole run**, not a timer per deck. It does not reset when
you descend, which is what makes lingering expensive *everywhere* and turns
"search this locker or not" into a real question. Empty, and the suit starts
taking integrity directly.

**Stations hold a charge and you draw from it.** Filling the suit takes only
what it needed out of the bottle, so a sip at 90% costs 10% of the station and a
desperate top-up at 30% drains it:

    suit 90%  ->  drew 120, station left 90%
    suit 70%  ->  drew 360, station left 60%
    suit 30%  ->  drew 720, station left  0%

That keeps the decision — the same station has to serve you going down *and*
coming back — while being far kinder than all-or-nothing, because an early sip
no longer costs the whole bottle. The gauge on the front empties as it goes, so
a part-used station reads from across the compartment. Drawing air on the way
down is still air you will not have on the way up — so the ascent is harder because of a decision you made an hour earlier,
rather than because a script switched a timer on. **That is the ascent clock,
and it is a better one:** you can bargain with it, you can plan around it, and
running dry on deck 4 of the climb is your own arithmetic rather than bad luck.

Stepping onto a charged station asks rather than takes. A spent one is drawn
unlit with its gauge on the floor, so a deck you have already drained reads at a
glance on the way back through.

**Consumption scales with stamina.** Fresh you sip at the base rate; wrung out
you pull nearly three times as much:

    stamina 100%  ->  1.00 per turn      suit lasts 200 turns
    stamina  50%  ->  1.90 per turn
    stamina   0%  ->  2.80 per turn      suit lasts  71 turns

That ties the two meters in the right direction — sprinting and swinging cost
stamina, and spending stamina costs air — so a fight is expensive twice over and
resting is not only about getting your strength back. The oxygen figure turns
amber when you are breathing hard.

**The budget, after three passes.** The first was absurd: a 1200-breath suit
covered fifteen thorough decks, two-thirds of the whole run, and the stations
were garnish. Cutting the suit *and* halving the stations then suffocated every
play style, because the two changes pull the same way and stack badly. Where it
landed:

| play style | outcome |
|---|---|
| brisk, rested | out with 3.2 bottles spare |
| normal, some fighting | out on fumes |
| normal, tops up at every station | out on fumes |
| thorough and tired | suffocates on the last deck of the climb |
| exhaustive, exhausted, greedy | dies on the way down |

Suit 200, one station per deck holding 60% of a suit. Sized against a
*purposeful* crossing (~26 turns), because a diver under air pressure moves with
intent.

**Air canisters restore about a third of the suit** — one use, and they
do not overfill: using one at 90% wastes most of it, exactly like drawing from a
station, and using one at 100% is refused rather than thrown away.

A third is the deliberate figure. The suit covers roughly fifteen thorough deck
crossings, so a canister buys about **five** — enough to save a climb that went
wrong, not enough to make the stations irrelevant. They drop like any other
consumable and turn up in lockers and med cabinets.
Suit mods should modify **capacity** and **consumption rate** as their cost or
benefit — that is a third axis for the armour table alongside DEF and resistance.

The suit currently holds 1200 breaths at 1 per turn, roughly two decks unaided.
**That is the number to tune.** Raise it and the run softens; lower it and the
stations stop being a choice.

**Repopulated hostiles pay out during the climb.** Farming them is fair when a
self-destruct is running: the timer is the cost, and min/maxing under a clock is
a skill rather than an exploit. The no-payout rule only needs to apply to
backtracking on the way *down*, where there is nothing stopping you.

**Alphas and cores on the ascent — yes, but they should mean something else.**
On the way down a core is the key to the next deck. On the way up the hatch is
already open, so a core needs a different job or it is just points. Two options:

- **Fuel.** Each core installed on the climb buys back time on the self-destruct.
  That makes the alpha a genuine choice under a timer — fight the thing, or run.
- **Ballast.** Cores are what you are carrying out, and the score at the end is
  what you surfaced with. Simpler, and it makes the last deck a real gamble.

I lean **fuel**, because it converts the clock from a fixed budget into something
you can bargain with, and bargaining with a timer is more interesting than
racing one.

### Endings

**A win cinematic per Omega**, shown on reaching your ship. Each one should
answer the question its shards were asking — you assembled what the thing was
from four documents, and the ending is where you find out if you read it right.
Same rule as the shards: no atmosphere, no adjectives reaching for a mood. The
most effective ending for this game is probably **your own incident report**,
written in the same voice as the paperwork you have been reading all run.

~~**A proper death screen.**~~ Built, and deliberately short — it is read in
about four seconds, so everything on it has to survive that. Deck, calibration,
ATK and DEF; what killed you and **what it was carrying**; what was recovered
from the suit; and the running record between you and that species: *you have
killed 14 of them, they have killed you 3 times*. That tally persists across
every run.

~~Still to come: a win cinematic per Omega.~~ Built — see section 13, which is
the editable source in the same way section 12 is. Each ending renders on the
same LCD panel the shards use, so the run closes in the voice it was told in.

### Audio still to write

Derelict has 30 sounds and every one the code calls is now defined — `reveal`
was being called for a chem light landing and did not exist, so it fell through
to the pickup blip. These are the gaps the new systems open:

| moment | why it has to exist |
|---|---|
| marine fires at you | by feed, so you can tell what is shooting before you see it |
| a shot passes close | the near miss is the warning |
| searching a prop | and a **distinct empty**, so failure is audible |
| datashard found | must not sound like loot — this is the one that matters |
| armour mod fitted / destroyed | ablative plate failing should be a moment |
| Omega entrance, per-Omega motif | four of them, four themes |
| **weakness landed** | the confirmation you read the documents right |
| **immunity landed** | a flat, wrong, dead sound — the answer is no |
| self-destruct bed | escalating, for the ascent |
| up-hatch / airlock | the way out |
| something arriving behind you | for a repopulated deck |

The two in bold are the important ones. If a player can *hear* that a weapon is
doing nothing, the Omega fight teaches itself without a single line of UI.

### Also queued

- **Armed marines.** Ranged hostiles carrying real weapons, dropping the weapon
  or its ammunition. Rare high-tier carry, scaling with depth. Needs one
  fairness rule: **firing reveals the shooter** — a muzzle flash lights their
  tile — or being shot from unlit blackness is a tax rather than a threat.
  Player muzzle flash is already built, for exactly that consistency.
- ~~**Props.**~~ Built. Nine kinds — five searchable (crew locker, med cabinet,
  tool chest, crew effects, body bag) and four set dressing (console, pipe run,
  spilled cargo, remains). Searching **costs a turn and can come up empty**:
  the turn prices exploration against the oxygen, and the empty result is what
  stops a container being a slower floor pickup. Roughly 7 per deck, scaling
  with depth.

  Blocking props are written in as **real walls before the zone validator and
  `sealSqueezes()` run**, so every existing guarantee is computed against them.
  Each one also tests connectivity before it commits and reverts if it would
  cut the deck.

  **Two pre-existing generator bugs surfaced doing this**, neither caused by
  props: the floorplan was only ever validated for *size*, so a BSP split could
  leave an isolated pocket and the item placer would drop a keycard into it; and
  the floor list handed to the item placer was captured *before* props and
  `sealSqueezes` modified the map, so loot could be placed onto a wall. Both
  fixed — the floorplan must now be one connected space, and the list is rebuilt
  after the map is final. Verified over 180 decks: **0 items walled off, 0 on
  wall tiles**.

## 8c. Derelict — balance pass

Three faults, two of them mine from this run of work.

**The levelling treadmill.** Hostile level tracked yours one for one, and since
their damage multiplies by level while your integrity only gains a flat +10,
every calibration made you *less* able to survive a blow — 13.6 crawler hits at
level one, 6.4 at level four. Levelling was a punishment dressed as a reward,
and it is what put the wall on deck two. Depth sets the difficulty now, with
your own level as a small nudge so salvage is not a free ride.

**Decks were unwinnable.** `boss` was set by `type === 'apex'`, so the four
apexes added with the bestiary — Broodmaw, Warlord, Sovereign, Leviathan — never
dropped the salvage core and the hatch could never open. Half the sim runs were
ending with the deck fully cleared, every door open, 98.5% integrity and no way
down. It read as the bot being stuck, which is why it went unnoticed for two
sessions. Verified: 640 decks, every one spawns exactly one core-bearer.

**Deck one was crowded** — nearly nine hostiles before you have found anything.
The count ramps from five now and reaches the same ceiling by the time it
matters.

Where it landed, measured per deck in isolation with a competent policy:

| deck | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| death rate | 0% | 3% | 8% | 28% |

And across full runs the depth histogram decays smoothly to deck 13 rather than
piling up on a single wall. Average 3.7 cores installed per run.

## 8b. Deep — done

1. ~~**Rotation**~~ — the diver noses into the turn now rather than banking away
   from it, so it reads as cutting a line instead of being dragged sideways.
2. ~~**Depth zones**~~ — paced against the clock, not the tape measure. The
   descent covers 100m every ~2.4s, so the first cut (300m) put you in pitch
   black seven seconds into a dive, before the run had started. The line is now
   900m with a 550m fade:

   | depth | time | darkness | deep-water fish |
   |---|---|---|---|
   | 300m | 7.2s | 0.00 | none |
   | 500m | 11.1s | 0.27 | none |
   | 600m | 12.8s | 0.46 | half |
   | 800m | 16.1s | 0.82 | most |
   | 900m | 17.7s | 1.00 | all |

   So the water dims noticeably around eight seconds, goes genuinely dark past
   twelve, and reaches full black only on a dive that lasts.
3. ~~**Bioluminescence**~~ — past the line the water column goes to flat black
   and the surface shafts are gone. Deep fish are lit from within by their own
   colour and carry a wider halo; the ledges' rock fades to nothing while the
   crust on the lip brightens, so an obstacle stops being a shape and becomes
   two points of light you steer between.

## 9. Highway — done

- ~~**The brake juddered at the floor.**~~ Speed was moved by a fixed step each
  frame — add `rate*dt` below the target, subtract it above — so on the brakes
  the car overshot and oscillated **±150 units every frame, forever**. Invisible
  on a rounded mph readout, but it meant the car was genuinely decelerating half
  the time, which is why the screech never stopped: the sound was reporting the
  truth about a physics bug. It approaches the target without crossing it now.
  A speed floor was added as well (silent under 46mph), because tyres do not
  sing at a crawl — but the floor alone would have hidden the judder.

- ~~**The cycle runs on a clock, not the odometer.**~~ Tying it to distance
  meant slowing down slowed time and flooring it sped time up — a paradox you
  feel every time you brake. `DAY_SECONDS = 240`, four minutes a lap, about what
  twelve miles used to cost at a decent pace. Verified: six real seconds
  advanced the day by 6.1 either way, while distance covered differed threefold.
  The clock deliberately does **not** reset between runs, so the sky keeps its
  own time.

- ~~**The buildings were transparent.**~~ The skyline drew at 0.55–0.85 alpha to
  "recede into the dark", so the sun and moon showed straight through it. A
  silhouette recedes by approaching the sky colour, not by turning to glass. It
  is opaque now — and the tint pass I first replaced it with had to go too,
  because `source-atop` paints over every opaque pixel and the sky is opaque, so
  it washed a visible band across the sky as well.

- ~~**Sun and moon.**~~ Both sit at opposite ends of **one diameter**, and the
  wheel turns with the clock — so when one is up the other is exactly as far
  down, and neither is ever placed by hand. Height decides visibility and the
  horizontal sweep falls out of the same angle. The sun reddens and both fade as
  they touch the horizon; the skyline draws over them, so they set behind the
  city. Parallax is 0.01 of the camera, essentially fixed.

  Cycle doubled to **twelve miles a lap**, so a full day is a long run rather
  than a lap of the block.

- ~~**The sky popped once a lap.**~~ `nightFall()` ramped 0 → 1 across
  midday→dusk and then wrapped straight back to dusk, where darkness is 0 — a
  hard snap from near-black to full daylight every six miles. Dusk is where the
  darkening *starts*, so the afternoon has to stay lit; only the golden band
  moves in it. Measured at the lap boundary: the sky now steps **3** where it
  jumped **96 and 108**.

- ~~**Day/night cycle.**~~ A full one, six miles a lap: **dusk → night → dawn →
  midday → dusk**. You set off at dusk because that is the shot the game is
  named for. Two curves drive everything — `nightFall()` peaks at night and
  bottoms at midday, `goldenHour()` peaks at dusk and dawn and is gone at both
  extremes — so the sky, the sodium haze on the horizon and the skyline's
  opacity all follow one clock.

  The skyline is **two sprites**: the buildings, and their windows on a separate
  sheet drawn over the top with alpha following `nightFall()`. So the city
  lights come on at dusk, burn through the night and go out by mid-morning. A
  handful of windows are cold blue among the sodium orange.

- ~~**NOS thruster and brake screech.**~~ Two sustained voices rather than
  one-shots. The thruster is a wide bandpassed hiss that opens while the bottle
  is live and swells with speed. The screech is a tight high band gated on
  **measured deceleration**, not on the pedal: it tracks how much speed the car
  actually lost this frame, so it sings on the stop and falls silent once you
  settle at the brake floor even with your thumb still down. Holding a fixed
  pitch there would have droned.

- ~~**Steering weight and parallax.**~~ The wheel is about a third lighter
  (a lane change costs less thumb travel) and the car reaches its mark faster,
  so a lane change lands when you ask for it rather than a beat later. The
  skyline's parallax dropped from 0.07 of the camera to 0.018, with the stars
  at 0.006 — it was sliding like a wall a few streets away rather than a city
  on the horizon.

- ~~**Brake.**~~ Below NOS on a steep diagonal — brake low and outboard where
  the thumb rests, NOS above and inboard so it takes a deliberate reach. plus down-arrow and S. Holding it
  settles at 45mph from 180 and lights the button. It cancels nitrous — you
  cannot boost and brake — and it is what makes the PIT a decision rather than
  an accident, because it is how you drop back *alongside* a cruiser instead of
  blowing past it.

- ~~**PIT manoeuvre.**~~ Catch a cruiser **alongside** rather than nose to tail,
  while steering into it and carrying speed, and it spins out. Square-on contact
  is still just a crash — the lateral component is what decides it, so the
  manoeuvre has to be deliberate. Reuses the existing `wreckCop()` spin, which
  was already written for cruisers that hit a barrier.

- ~~**Idles at 60mph on the title card.**~~ The road moves before you press
  anything. The title state was *decaying* speed to a stop; it now holds at idle
  while the wrecked state still rolls to a halt.

- ~~**Always leave a legitimate line through traffic.**~~ A wave never fills
  every lane, but cars run at different speeds, so given enough road a fast one
  drifts into the last free lane and the wall closes — which is what made some
  runs unavoidable damage. `keepLaneOpen()` watches the road ahead in 1500-unit
  bands; in any band where all four lanes are occupied, the car **furthest from
  you** eases off until it falls out of that band. Nothing is deleted and
  nothing is slowed on your account, so the road is no softer — there is simply
  always a line. Measured over 478 bands of live road: **zero fully blocked**.


© 2026 Effigy Media. All rights reserved.

---

# 12. DATASHARDS — editable source

Twenty documents, five per Omega, one per property. **This section is the
source and it is now ingested into the game** — the table in `derelict.html` was
generated from these blocks verbatim. Edit here, tell me, and I re-import.

**In play:** five per run, drawn only from the Omega you were dealt, one each on
decks 2, 4, 6, 8 and 10. The order is shuffled per run, so meeting the same
Omega twice teaches it differently. The old random `shard` pickup was removed
from the drop table — it was competing with the authored ones and diluting them. Edit anything here and it gets read back into the game verbatim, so
rewrite freely — the format is what matters, not my wording.

    id     which Omega, which property
    title  the document's own header, as it would be filed
    body   the document. Lines break where the form breaks.

### How they are set

**Orbitron** is now Derelict's display face throughout, replacing Oxanium.

Shards render in **Share Tech Mono** on a dark green panel with scanlines
across it — you are reading them off the suit's own display, not off the paper
they were printed on. Monospace matters: the manifests stack their weights in a
column, and the column is where the horror is.

Left-aligned explicitly. The overlay centres its text, which threw the columns
out and made a form read like a poem.

### The rule these follow

No shard names a feeling, describes darkness or silence, or uses "something".
Facts, quantities, procedure, names. If a line could not appear on a real form
aboard a working ship, it is wrong. The hint must be **inferable, never
encoded** — a maintenance note about a tripped circuit, not "electricity works".

The ship is the **Kestrel**, a bulk hauler. Nine containers, a crew of about
forty, and a transfer it should not have accepted.

---

## Omega: The Ninefold Weight
*grows · immune kinetic · resists heat · weak shock · deals kinetic*

    [ninefold/pattern]
    CARGO MANIFEST — CONTAINER 9 OF 9
    Consignor: withheld under commercial terms
    Gross at loading:        412 kg
    Gross at Kestrel transfer: 419 kg
    Gross at 0600 inspection:  474 kg
    Discrepancy noted third time. Seal intact all three readings.
    Reweigh scheduled daily until resolved.

    [ninefold/immunity]
    REQUISITION 118 — DENIED
    Requested: 400 rounds, ship's small arms locker
    Denied by: Second Officer Aldridge
    Ground: expenditure of 900 rounds during incident 4-11 produced no
    measurable effect. Container 9 gross unchanged before and after.
    No further issue authorised.

    [ninefold/resistance]
    ENGINEERING — CUTTING LOG
    Torch applied to container 9 seam, 40 minutes continuous.
    Seam temperature 1,180 C. No separation.
    Torch bottle exhausted. Second bottle not authorised.
    Note: gross weight up 6 kg since the attempt.

    [ninefold/weakness]
    MAINTENANCE LOG — DECK 4
    Arc welder missing from locker 4C. Not signed out.
    Deck 4 lighting circuit tripped 0300. Reset. Tripped again 0340.
    Locker 4C found open. Welder not recovered.
    Deck 4 sealed pending inspection. Inspection not carried out.

    [ninefold/deals]
    MEDICAL — SUMMARY, WEEK 31
    Presenting: 0043 ribs, 0051 collarbone, 0062 ribs, 0071 hip.
    All crush injuries. All to the left side.
    No lacerations, no burns, no chemical exposure in any of the four.
    Note to watch officer: it is not sharp. It is heavy.

---

## Omega: The Choir
*splits · immune shock · resists melee · weak heat · deals shock*

    [choir/pattern]
    HOLD INVENTORY — RECONCILIATION
    Item logged at intake:  1
    Count, week 29:         1
    Count, week 30:         3
    Count, week 31:         7
    Counts performed by three separate ratings and agree.
    Intake documentation lists no multiples.

    [choir/immunity]
    ELECTRICAL — FAULT REPORT
    Deliberate discharge, 400V bus, applied at hold 3 per Chief's order.
    Bus tripped. No response from subject.
    Second discharge at 800V. Bus tripped. No response.
    Chief's note: it is drawing off the bus, not resisting it.
    Do not attempt a third.

    [choir/resistance]
    ARMOURY — EDGED WEAPON CONDITION
    Four boarding axes returned bent at the haft.
    Two ship's knives returned with tips broken off.
    None of the six show blood or tissue on the blade.
    Recommend edged weapons be withdrawn from the standing issue.

    [choir/weakness]
    GALLEY — INCIDENT
    Fat fire in the number two fryer, 0210. Extinguished 0214.
    Rating 0038 reports the count in hold 3 fell from seven to four
    during the four minutes the fire was burning.
    Count returned to seven by 0900.
    Galley closed. Fryer not repaired.

    [choir/deals]
    MEDICAL — SUMMARY, WEEK 30
    Presenting: 0038, 0044, 0059. All the same.
    Entry wound at the hand, exit at the opposite foot.
    Tissue cooked along the path between.
    Two are wearing their earthing straps. It made no difference.

---

## Omega: The Lamprey
*closes · immune ranged · resists blast · weak melee · deals fire*

    [lamprey/pattern]
    BRIDGE LOG — 0340
    Contact reported at 60 metres, corridor 2.
    Contact reported at 20 metres, same corridor, same watch, 40 seconds later.
    Rating withdrew. Contact at 4 metres on reaching the bulkhead door.
    It does not hold a distance. It removes one.

    [lamprey/immunity]
    ARMOURY — AMMUNITION RECONCILIATION
    Small arms expenditure, week 32: 1,340 rounds.
    Recovered from bulkheads and deck plating aft of hold 2: 1,290 rounds.
    Remaining 50 rounds accounted for by the two ratings who fired downward.
    Nothing was stopped. Everything passed through and hit the ship.

    [lamprey/resistance]
    DEMOLITION — CHARGE EXPENDED
    Two shaped charges placed at the corridor 2 junction.
    Both detonated. Junction destroyed to a radius of 6 metres.
    Deck plating buckled. Two frames sheared.
    Subject observed in corridor 2 at 0500, unchanged.
    No further charges available.

    [lamprey/weakness]
    MEDICAL — RATING 0071, DECEASED
    Injuries consistent with close struggle. Hands and forearms.
    Ship's axe recovered beside him, blade fouled with tissue not his own.
    Tissue sample retained, container 7C.
    First tissue recovered aboard. He was the only one who let it get close.

    [lamprey/deals]
    DAMAGE CONTROL — CORRIDOR 2
    Paint blistered along 14 metres of the port bulkhead.
    Cable insulation charred, three runs, replaced.
    Deck coating scorched in a continuous line, not in patches.
    No accelerant found. No electrical fault found. No fire reported.

---

## Omega: The Hollow Light
*unlit · immune to everything · weak to thrown light · deals heat*

    [hollowlight/pattern]
    WATCH LOG — DECK 7
    0100 lamps out, section C. Nothing reported on the walk-through.
    0130 lamps out, section D. Nothing reported.
    0200 lamps out, section E. Rating did not complete the walk-through.
    Sections C, D and E are consecutive.

    [hollowlight/immunity]
    STANDING ORDER 9 — DECK 7
    Following the loss of 0044, 0051, 0066 and 0080, all attempts against
    the deck 7 subject are suspended.
    Rounds, blades, charges and the cutting torch have all been tried by
    the parties named above. All four are lost.
    Deck 7 is sealed. Nobody goes down with a weapon. Nobody goes down.

    [hollowlight/weakness]
    STORES — FLARE ISSUE
    Chemical light sticks, 200 issued to deck 7 party, week 33.
    12 returned.
    Party leader's note on the return: the ones we dropped and left burning
    did more than the ones we carried.
    Reissue requested. Stores empty.

    [hollowlight/deals]
    MEDICAL — SUMMARY, WEEK 33
    Presenting: 0080 face and hands, 0066 forearms, 0051 shoulder.
    Full-thickness burns. No blistering, no reddening at the margins.
    Tissue cooked through rather than scalded.
    Nothing on any of them was alight. Their clothing is not even singed.

    [hollowlight/extra]
    ENGINEERING — LAMP CIRCUIT, DECK 7
    Circuit tests good. Bulbs test good. Bulbs fitted and lit at the bench.
    Fitted on deck 7 they read zero current and give no light.
    Bench and deck 7 are on the same bus.
    Chief's note: the fault is not in the circuit.

---

---

# 13. ENDINGS — editable source

**Art.** Every cinematic frame is DRAWN AT RUNTIME, not shipped as an image.
The eight scenes as PNGs came to roughly 11MB of base64 against a 660K game;
as canvas code they cost almost nothing and scale to any screen. `CINE` in
`derelict.html` holds them, sharing one corridor builder and one
recovered-footage grade — grain, scanlines, vignette, timestamp, recording dot.

**Order:** title screen → the approach → the first deck. It plays on BOARD, not
on load — the title is the game's front door and a cinematic has no business in
front of it. Resuming a saved run skips it, since you are already aboard, and
once seen the title offers THE APPROACH to watch it again.

**Everything on a frame is a fraction of its width** — border inset, type size,
the recording dot — so the furniture holds its proportions at any size. Fixed
pixel values looked right on one screen only. The crawl scales with it:

    iPhone SE   frame 232x166   crawl 11.5px
    iPhone 14   frame 340x204   crawl 14.0px
    Pro Max     frame 340x204   crawl 15.0px

**The approach** plays before the first deck: beacon, wreck, holds,
airlock, one line of the brief over each, with SKIP on every frame. Replayable
from the pause menu.

One per Omega, shown on reaching your own ship. Same rule as the shards: it is
**your incident report**, filed after the fact, in the voice of the paperwork
you spent the run reading. No adjectives reaching for a mood. What you saw, what
you did, what is still true.

**The fixed prose is the part that is always true** — what the ship was, what is
still aboard, who worked it out first. Everything about *your* run is composed
at the end from a log kept while you played: the weapon you actually used and
its quality, how many ineffective attempts you made and with what, how many
documents you recovered, lockers cracked, stations drained, oxygen at the
airlock, what you took off the body.

So these blocks must not assert anything the game can contradict. An earlier
draft said "destroyed at contact range with an edged weapon", which was a lie
in any run that emptied a rifle into it.

What the run log records, and what each fact becomes:

| recorded | line in the report |
|---|---|
| weapon, quality, deck of the killing blow | *Destroyed on deck 12 with an excellent Bulkhead Sabre.* |
| attempts made on an immune axis | *9 attempts were made with kinetic and recorded as ineffective.* |
| none of those | *No ineffective method was attempted. The party arrived informed.* |
| documents recovered, and whether the weakness was among them | *Recovered 5 of 5 ship documents. One of them was the reason this worked.* |
| none recovered | *No ship documents were recovered. This was worked out the long way.* |
| lockers cracked | *Released 2 sealed armoury lockers en route.* |
| stations drained on the descent | *4 oxygen stations were drawn dry on the way down. This was felt on the way up.* |
| oxygen at the airlock | *Oxygen remaining at the airlock: 34 per cent.* |
| trophy taken | *Recovered from the subject: Closing Distance.* |

So a prepared run and a desperate one produce visibly different reports from the
same Omega. Articles are handled — *an* excellent sabre, *a* poor pistol, and
fists become **"with bare hands"** rather than "with a Fists".

The frame is fixed and the body varies:

    [omega]
    body — the report itself

---

    [ninefold]
    INCIDENT REPORT — KESTREL, CONTAINER 9
    Filed by the undersigned, sole surviving party aboard.
    The container is still aboard the Kestrel. The seal is still intact.
    Recommend the Kestrel is not boarded again and not salvaged.
    Recommend the consignor named on manifest 9 be traced.
    Nothing on that manifest was carried by accident.

    [choir]
    INCIDENT REPORT — KESTREL, HOLD 3
    Filed by the undersigned, sole surviving party aboard.
    I did not count them as I worked. I counted them afterward, from
    what was left, and I am confident in the figure.
    The Kestrel's inventory has been recovered and is attached.
    It lists one. It has always listed one.

    [lamprey]
    INCIDENT REPORT — KESTREL, CORRIDOR 2
    Filed by the undersigned, sole surviving party aboard.
    It does not hold a distance. It removes one.
    Rating 0071 worked this out before I did and it cost him.
    His name should be on this report and it is.

    [hollowlight]
    INCIDENT REPORT — KESTREL, DECK 7
    Filed by the undersigned, sole surviving party aboard.
    Carried light had no effect at any point. Light placed on the
    deck and left burning had effect immediately.
    I cannot account for the difference and I am not going to try.
    Stores issued 200 sticks to the party before mine. Twelve came back.

---

---

### CUT: ARC, PATCH, SURGE and the charge resource

They were a generic suit-power bar — free damage, a heal, a double-hit — the
default three abilities in anything, touching none of what Derelict is about.
Power should come from **what you found and what you are carrying**, not from a
meter that refills on its own.

Removed with them: the CHARGE meter, POWER CELL and CAPACITOR pickups, and three
cores that existed only to feed the system (CAPACITOR BANK, ARC AMPLIFIER,
SIPHON).

**Two things had to be repointed rather than deleted:**

- **ARC was the only guaranteed shock source**, which mattered for the Ninefold.
  Shock now comes only from gear — shock weapons are 26% of floor drops, so the
  axis is well covered, but you must be carrying one.
- **The DRAIN trait** (wraith, revenant, hollow) stripped charge. It takes 2
  stamina instead — which costs oxygen, since consumption scales with
  exhaustion, so the trait bites harder than it used to.

Actions are now STRIKE, REST, GEAR.

# 14. OPEN — Derelict is NOT done

**Saving: one real bug, one false alarm. Both resolved.**

The real one: `saveRun()` did not carry `decks`, the stashed floors — so
resuming forgot the entire wreck above you and the climb had nothing to climb
through. Fixed.

The false alarm: a test then reported a run writing **no run at all**. That test
moved with arrow keys, which had just been removed, so no turn ever elapsed and
nothing was ever queued to save. The save was never broken. A second reading of
`arcade.js` also looked like it found an empty `set: function(){}` stub — that
is `A.options.set`, not `A.save.set`, and is deliberate.

Verified end to end: dive to deck 5, reload, CONTINUE — deck, all five stashed
floors, Omega, motif, level and oxygen all identical across the reload.

**The twelve-deck run has never been played end to end.** Every piece is
verified in isolation and the seams between them are not. Specifically never
played: the Omega fight at deck 12 with a real character, the turnaround, a full
climb, the ending firing from actual play rather than a forced call.

**Balance numbers come from a sim bot that has been wrong before.** The 4/6-swing
Omega figures, the oxygen curve and the calibration floor are all arithmetic, not
observed play.

**`P.data` is a dead field** — displayed on the escape screen, never incremented.
Same class as the canister that was never wired.

**Untested combinations:** quality x Omega scaling, trophies during the climb,
a shard read while an armoury lock is open, the intro on a resumed run.

### Ricochet pickups — fourteen, weighted

Drop chance 16% per popped brick. Weighted so the strong ones are rare and the
bad ones are common enough that catching is a decision rather than a reflex.

| pickup | | what it does |
|---|---|---|
| WIDE / SHRINK | W S | paddle wider / narrower |
| QUICK / SLUDGE | Q L | paddle answers faster / slower to the same drag |
| SLOW / FAST | O F | ball speed down / up |
| MULTI | M | two more balls, up to five |
| STICKY | C | catch and re-aim, six times |
| LASER | \| | the paddle actually shoots now — bolts from both shoulders |
| PIERCE | P | the ball tears straight through six bricks without bouncing |
| BOMB | B | the next three kills take their neighbours with them |
| NET | N | one free save at the floor, then spent |
| LIFE | + | a spare ball |
| INVERT | X | steering reverses for six seconds |

**Bad ones are always red and always signposted.** A curse disguised as a gift
is just a punishment for playing well — you should be able to choose to dodge
it, which means the capsule has to tell you.

**A caught pickup prints what it did** under the bricks for a second and a half.
Without that a player catches a letter and never learns what any of them mean.

The ball is recoloured while pierce (blue) or bomb (orange) is live, and the net
draws as a dashed line across the floor so its one use is visible.

### Music and SFX for both Golden Era cabinets

**Soviet Blocks — an original folk-idiom tune.** The famous one is
*Korobeiniki*, a Russian folk song from 1861 and long out of copyright, but this
is written fresh in the same idiom rather than borrowed: A natural minor with a
raised seventh at the cadence, fast duple pulse, and the call-and-response shape
where a phrase leaps up and walks back down. Sixteen bars in two halves that
answer each other, a square-wave lead with a quiet fifth stacked on it, and a
root-and-fifth bass sitting under it like a bayan left hand.

**Tempo is the tension curve.** 125 bpm at level 1 through 210 at level 14,
where it caps. It is the one place a player feels the difficulty without reading
a number. A high tick also arrives once the well passes eight rows — the room
getting nervous rather than a drum track.

Added SFX: piece move, soft landing, hold.

**Ricochet — a bed that gains layers as the wall comes down**, per the spec.
Four layers keyed to the fraction cleared: pulse always, bass from 25%,
arpeggio from 50%, a doubled arpeggio from 72% and a high sustained fifth from
80%. Measured across a level:

    0% cleared   0.0165
    30%          0.0324
    67%          0.0403
    93%          0.0561

A 3.4x climb, so the room audibly crowds as you approach the last few bricks.
The first pass was inaudible — the added layers were quieter than the pulse they
sat under, and RMS barely moved.

### Both Golden Era cabinets reskinned

**Ricochet** dropped the oscilloscope for the same block language as Soviet
Blocks: solid beveled bricks coloured by row, brushed-steel paddle with warm
caps at the shoulders (so the aiming zones stay readable), and a ball shaded as
a sphere lit from the upper left. Indestructible bricks are hatched steel rather
than a crossed outline.

**Soviet Blocks** moved off the neon chart onto the period. Palette: state flag
red, unlacquered brass, wheat gold, army green, oxblood, enamel blue and the
pale duck-egg every Soviet stairwell was painted to waist height. Warm dark
ground instead of blue-black, a brass grid, a lamp vignette over the well, and
blocks drawn as stamped metal — mitred bevels with a lit corner and a deep
shadowed one, plus a hairline of wear. Title carries СОВЕТСКИЕ БЛОКИ; game over
reads ИГРА ОКОНЧЕНА. Accent moved `#e8484f` → `#c8102e`.

### Attract cards — second pass

**Girder** was thin diagonal lines with a dot for a climber. Now: stone courses,
the lancet window, uprights, five sloped decks with lit top edges, ladders with
rungs between them, TWO pieces of masonry tumbling downhill in opposite
directions on alternating slopes, the hi-vis climber running and jumping, and
the gargoyle with ribbed wings, horns and its one lit eye, rearing as it winds
up.

**Phalanx** drew generic invader blobs. Now the three real body plans — medusa
at the back, crab in the middle, louse at the front, each with the darker core
that makes it an x-ray plate — plus shields eroding cell by cell above the
ground line and the single shot in flight, which is the design.

**Soviet Blocks** read olive rather than near-black. The gold grid at 5.5% packs
into about eleven lines at 88px and washes the whole field. Halved to 2.8% and
the vignette deepened; sampled pixel is now `rgb(39,32,14)`, which is the warm
near-black the game uses.

### Deep — the launch

You no longer begin in the water. You begin hanging off a davit under a boat on
the surface: the hull rolls on the swell, the sub swings on its wire a beat
behind it, then the catch lets go and it falls and hits the water. Three seconds,
and it tells the player where they are, which nothing else in the game did.

Built as a `launch` state ahead of `diving`, with its own draw pass — sky above
the waterline, a moving swell drawn twice (filled and stroked), the boat rocking
with a wheelhouse and a lit window, the davit arm, and a taut wire whose anchor
point is transformed through the boat's roll so it stays attached as she moves.
On release the wire whips back and the sub falls; the splash is expanding rings
and droplets. Sounds: a winch groan under load, a hard clack on release, and the
hit.

### Highway — what happens if you stop in a pursuit

The honest answer before this pass was **nothing**, which made the brake pedal
free and the whole HOT PURSUIT mode weaker for it. Cops only ever hurt you by
ramming, so a stationary car was the safest car on the road.

Now a cruiser that holds station on a car doing under 10% of top speed **boxes
it in**, and three seconds later the run ends as BUSTED. A loud-hailer barks
twice a second, the edges of the screen close in red, and a bar drains with the
count on it. The only way out is to move.

**They stop AROUND you.** Each cruiser takes a station rather than chasing your
centre: one either side at 0.42 off your lane, one across the front 620 ahead.
So the stop reads as being surrounded rather than tailgated.

Verified end to end — brake to zero with three cruisers out:

    spd 2040  bustT 0.00   closing
    spd    0  bustT 0.65
    spd    0  bustT 1.33
    spd    0  bustT 2.05
    spd    0  bustT 2.75
    spd    0  bustT 3.01   BUSTED

**Three things had to change for that rule to be reachable at all:**

- `k.spd` was clamped to a **minimum of 2000**, so a cruiser could never stop
  and therefore could never surround a stationary car — it just circled past
  forever.
- It also had to be able to **reverse**. Clamping the boxing speed at zero left
  a cruiser that had overshot frozen four thousand units up the road, unable to
  come back, so the box never closed.

- Cops carried on down the road when you stopped. `want` targets `spd + closing
  rate`, which is right at speed, but a stationary player meant every cruiser
  drove off over the horizon and never came back — measured gap growing past
  17,000 and still climbing. A pursuing car now holds within 400 of your speed
  when you are crawling.
- `BRAKE_SPD` was 45mph and `spd` was floored at 1700, so "stopped" was never
  actually reachable.

Verified: brake to zero with a cruiser on you and `bustT` climbs 0.55 -> 1.3 ->
2.05 -> BUSTED.

### Deep — the surface has its own sound

The deep drone used to start the moment you pressed PLAY, which gave away where
the game was going before the sub had left the hook. It now waits for the water.

On the boat: a broad wash of noise that **rises and falls on the same swell
phase the hull is riding**, and gulls — two or three descending cries at
irregular intervals, each an up-then-down slide, so they never sound metered.
The splash cuts the wash and brings in the drone and the bed together.

Measured on the bus: 0.084 on the surface, 0.114 once under.

### Highway — gauges moved onto the objects

**The gate was a four-speed.** It drew two vertical rails, which is four slots,
however the code labelled them. Three rails now, and the SLOT table and the drag
clamp were rescaled to match or the knob would snap to positions the plate does
not have.

**The bottle IS the nitrous gauge.** The `#nosFill` bar sat under the pedals
where the controls covered it. A CSS variable set each frame fills the bottle
from the neck end; the empty part reads as dark glass.

**Damage is smoke off the bonnet.** Nothing under 25%, a wisp by half, a plume
and an orange flicker under it past 88%.

Two things about that smoke are worth keeping:

- **It is driven off the clock, not off distance travelled.** Tied to `pos` the
  plume froze whenever the car was slow or stopped — exactly when you are most
  likely to be badly damaged.
- **It is grey, not black.** True black smoke on a dark night road is invisible.
  It runs pale grey down to dirty charcoal and leans on volume and opacity to
  say "bad" rather than on darkness.

**Still not right:** the plume reads at high damage where the fire glow carries
it, but the mid-range wisp is too subtle to notice in play. Needs eyes on a real
screen rather than more guesses from me.

### Highway — reverse lamps, and the controls were too big

**Reverse lamps.** A cruiser backing up to close the box now shows white lamps
low on its tail, with a glow. Without them a car sliding toward you does it for
no visible reason.

**A 25mph floor was the alternative and it is the wrong fix** — it would undo the
brake pedal, which is the thing that made stopping possible in the first place.
The lamps cost a dozen lines and add a detail; the floor would remove a feature.

**The control cluster covered the player's own car.** Measured: pedals 62x122
inside a 150x186 box, a 118x132 shifter, a 96x44 bottle and a 52px horn, all
stacked in the lower right and running past the bottom edge of the screen.

Everything is about 70% of what it was and tucked into the corner:

    pedals    46x84 in a 104x126 box   (was 62x122 in 150x186)
    shifter   86x94                    (was 118x132)
    bottle    72x30                    (was 96x44)
    horn      40x40                    (was 52x52)

The gate slots and the drag clamp were rescaled with it, or the knob would have
snapped to positions the plate no longer has. Nothing now overlaps anything else
and the whole cluster ends 12px above the safe area.

### Highway — stop, horn, gearbox

**It can stop.** `BRAKE_SPD` was 45mph and the speed was clamped to a floor of
1700 — about 22mph — so the car could never actually halt. Both removed:
braking now reaches zero in about two seconds.

**The horn** is a chrome boss beside the pedals, and it is TWO sawtooth notes a
third apart held together — a single tone reads as a doorbell. Sounding it gives
cars ahead in your lane a **55% chance each** of moving over, and only if there
is a lane free. A horn is a request, not a command, and the ones that stay put
are what make the ones that move feel like a break.

**Six-speed manual**, off by default, toggled in options. An H-gate with two
rails cut into the plate and a chrome knob you drag between six slots; it
follows your thumb and snaps to the nearest on release, so you can feel your way
to a gear. Each ratio has a speed band and a pull factor — measured at about a
third of top speed:

    gear 1 -> 0.12   on the limiter, nothing left
    gear 3 -> 0.82   in its band
    gear 5 -> 0.34   lugging
    gear 6 -> 0.34   lugging

With the box on automatic the game picks for you and every ratio pulls 1.00, so
nothing changes for a player who never turns it on.

### Deep and Highway — earlier changes

**Deep's title buttons did nothing.** Two causes. The veil carried
`pointer-events:none` — correct when it was a tap-anywhere panel, fatal once it
held a menu, because the canvas won `elementFromPoint`. And `.mbtn`/`.tmenu` had
no CSS at all: an earlier insert missed its anchor, so they rendered as bare
**37x19** buttons. Now 250x48 with a real style, and the whole
opts->ctrl->back->back chain works.

**Highway: HOT PURSUIT.** The toggle now names what turning it ON does, and the
default road is empty. Cops are opt-in.

**Highway: pedals.** Brake and accelerator side by side as rubber pads on steel
arms, hinged at the top, tilting away and brightening on press. The nitrous is a
**bottle lying on its side above the accelerator** — pressing it is gas and
nitrous together, which is what the button always did.

**Highway: neutral.** Off the gas the car no longer holds a speed. `top` drops
to zero with a gentle rate, so it rolls:

    on the gas   13800
    coast 2s      5241
    coast 6s      3547     (26% of cruise, still moving)
    brake 0.7s   12513 -> 6063

Braking is still far harder than lifting, so the two are distinct choices.
**The first second of lift-off drops more sharply than the rest** — worth
tuning by feel rather than by more numbers from me.

**Highway: the brake screech was a hiss** because it was one tight high band.
Real tyre screech is a low roar of rubber tearing with a squeal riding on it, so
it is now three voices — a broad low body at 200-380Hz carrying the most level,
a mid grind around 1-1.9kHz, and the original high squeal on top.

# 15. ZIGGURAT — built

`games/golden/ziggurat.html`, accent `#ffb347`. Seventeenth cabinet.

**The controls ARE the obstacle and they are never softened.** Four diagonals,
no orthogonal move at all. Down-left and down-right take you a row further down;
the two up moves come back toward the apex. A swipe is split by the two
diagonals into four quadrants, so there is nowhere for a sideways input to go.

**The mapping is the barrier**, so the spec's rotated d-pad diagram is on the
TITLE screen rather than buried in options, and an on-screen line names the
scheme for the first four moves of a run before removing itself.

Also built: seven rows in correct back-to-front draw order, tiles needing TWO
visits every third level, falling off the edge as a real and frequent death,
three enemies — a crumpled ball that tumbles down the face, a paper dart that
actually chases you, and an eraser that takes the colour back off the card —
escape wheels at the edges that lift you to the top, and level complete when
every tile is turned.

**A 7/8 bed.** Seven beats to the bar with the bass on 1, 4 and 6, so it never
lets you settle — the same joke the controls are playing. It is the only cabinet
in the arcade not in four.

**Look: paper model.** A folded card ziggurat. Visible tabs at every corner,
a crease ruled across each tile top, pencil-line edges, and tiles that turn from
card through amber to rose as they are claimed. The player is a folded cone with
two ink eyes; deaths print gibberish curses in a paper speech flag — ours, not
the original's.

# 15. POPSHOT — built

`games/golden/popshot.html`, accent `#ff9ecd`. Sixteenth cabinet.

**Orphan detection is the game, and it is verified.** Rigged a board with an
anchored raft plus a stalk of two holding an eight-bubble payload:

    one shot completes the stalk
    board 15 -> 4      three popped, EIGHT more fell

Orphans pay **40 a bubble against 10 for a pop**, so cutting a support is worth
four times shooting at the thing you want gone. That is the expert move and the
scoring says so.

Also built: hex-offset grid with snap-to-nearest, an aim line that previews the
wall bounce and draws a ghost ring where the shot will land, the ceiling
descending every few shots that fail to pop (with the count in the header), and
**a colour set that shrinks to what is actually left on the board** so the
endgame is solvable rather than a lottery.

**Look: soap and light.** Thin-film spheres — colour from a radial sweep with a
brighter rim than middle, an interference band swept diagonally across one side,
a specular highlight. They burst into seven droplets that fly outward and
shrink, rather than fading. The bed is major-key and light: the one cheerful
machine on the floor.

**A testing note worth keeping.** The first orphan test read board 15 -> 43,
which looked like a catastrophic bug. It was the opposite: the cascade emptied
the board completely, the level cleared, and a bigger one was built — so the
count I measured was the NEXT level. Rigging an anchored raft that survives gave
the real number.

# 15. FEATHER — built

`games/golden/feather.html`, accent `#cfd8e3`. Fifteenth cabinet.

**The camera zoom is the moment, and it works.** Below 120 units of altitude the
view scales in toward the craft — measured **1.00 at height, 2.33 at
touchdown** — so the ground stops being a profile line and becomes a place. The
bed thins at the same time, near-silent on final approach, so the last few
seconds are quiet and close.

**All three checks, and the failure tells you which one.** Verified:

    slow, level, no drift  ->  DOWN · x1 PAD · +562
    too fast down          ->  TOO FAST DOWN
    drifting sideways      ->  DRIFTING
    not level              ->  NOT LEVEL

Naming the fault matters: "crashed" teaches nothing, "DRIFTING" teaches you to
watch H.SPD next time.

**Pads pay by how small they are** — x1 for nine cells down to x6 for three —
and the count drops as the sites go on. Score is the multiplier times a base,
plus a softness bonus for touching down slower than you had to, plus whatever
fuel is left, which carries the arithmetic into the next site.

**Look: instrument glass.** The terrain is a radar altimeter profile, the craft
a schematic octagon with legs and an attitude tick, and the HUD figures ARE the
scenery — ALT, V.SPD, H.SPD and ATT, each turning red the moment it leaves
tolerance. An arrow at the screen edge points to the nearest pad with its
distance, so you are never lost in a world three times wider than the glass.

# 15. BURROW — built

`games/golden/burrow.html`, accent `#e0a458`. Fourteenth cabinet.

**The bed plays only while you are moving.** `snd.tick` returns immediately if
`moving <= 0`, and `moving` is set to 0.22s on every dug step. Stop and the music
stops with you — the spec called that the signature and it is, because the
silence is where the fear is.

**Cutting is slow. Running your own tunnel is fast.** Measured: **302 ms per
cell through fresh soil, 101 ms through a tunnel — 3x.** This is the mechanic
that makes the whole premise work, and the first build did not have it: both
cost the same, so terrain you authored was worth nothing and there was no reason
to plan a route. Now you cut a loop early so you can outrun something down it
later, which is what the genre is actually about.

**Both types ghost, not just one.** In the original, anything that gets stuck
gives up on tunnels and comes through the dirt as a pair of eyes. The wisp loses
patience after 1.4, the grub needs 3.2 — so the grub ghosting is an event and
the wisp ghosting is a habit. A ghost re-forms the instant it reaches open
ground, cannot be pumped while it is inside rock, and is drawn as **eyes only,
tracking toward you**, which is the clearest warning the genre has.

**Two enemy types, and the second is the point.** A grub follows tunnels. A wisp
follows tunnels until it is frustrated — boxed in with only one option for a few
turns — and then comes **straight through the soil** at you. That is what stops
you digging a hole and sitting in it, so it earns its place rather than being a
second sprite.

**Rocks are undermined, not triggered.** Digging the cell directly beneath one
sets it shaking for half a second, then it drops, crushes anything in the column
for 500 plus depth, and crumbles away half a second after landing.

**Depth pays.** A kill is worth its base plus 40 a row below the surface, so the
whole incentive is to go down into the strata where the walls are further apart
than your nerve.

**Everything is one cell.** In the original the player and the monsters are the
same size, and ours were not — the grub was 14 wide with a 17px taut ring
against a surveyor about 10 wide, so it read as a boss rather than a peer.
All four now sit inside a single cell and inflation grows from parity.

**Three monsters, matching the original's roles.** Grub follows tunnels. Wisp
loses patience fast and ghosts. **Drake breathes fire along its row** — three
cells of open ground, and it rears with a gathering glow at its mouth for a
third of a second before it burns, so the attack is dodgeable rather than
arbitrary. It is worth 400 against the grub's 200, and it carries a dorsal crest
and a hotter palette so it is identifiable at a glance in a dark gallery.

**The player is a person.** The first build drew an abstract drill bit — a
triangle and a box — which had no character at all. It is now a surveyor: hard
hat with a lamp that throws a small pool of light the way you face, canvas
jacket with a hi-vis band down the middle so you can always find yourself
against the dirt, a brass pump tank slung on the back with a strap, both arms
forward on the lance, and a hose looping from the tank to the lance. The body
rotates to face travel; the head stays upright.

**The pump is a real harpoon and hose**, not a line. The lance fires a head
that buries in the target, and a segmented brass hose runs back to the tank with
ribs along it. **A bulge of air travels down the hose on every stroke**, so you
watch the pressure going in rather than counting stages — and the target's taut
outline swells with it.

**Look: archaeological section.** Four strata — topsoil, clay, silt, bedrock —
each with its own colour and grain, labelled down the left margin as on a
section drawing. Soil is lit along the top edge only where it meets air, so a
tunnel reads as freshly cut. The player is a surveyor's drill; the things down
there are drawn like specimen plates, the grub ruled into segments and the wisp
with faint internal structure.

# 15. VECTOR — built

`games/golden/vector.html`, accent `#9fb4ff`. Thirteenth cabinet.

**Named VECTOR, not Shards.** "Shards" described the debris rather than the
experience, and the word is worn thin by loot-game currencies. The game is about
momentum you cannot cancel, so the maths is what is killing you — which is what
VECTOR says. It also holds the house pattern: every cabinet on this floor is one
plain word.

**The touch scheme was built first**, as the spec instructed. Drag anywhere: the
vector from where you pressed to where your thumb is now gives heading AND
throttle together, so aiming and accelerating are one gesture rather than two
controls. Release and thrust stops — momentum does not. A press that never
became a drag is a shot. Two fingers is hyperspace.

It works: 480 points in a first run, and it cost two ships, which is about right.
A dashed aiming line draws from the ship while you drag, so the scheme teaches
itself in the first few seconds.

There is a **whisper of drag** — 0.995 per frame — so a long run is not one
endless slide, but nowhere near enough to be a brake. The momentum is still
yours to live with.

**Rocks spall along their fault lines.** Each carries three fault angles drawn
faintly inside the crystal, and when it breaks the halves fly apart
perpendicular to the first fault rather than in random directions — so the
break looks like a consequence of the shape you were looking at.

Also built: wrap for everything including bullets, three sizes each faster than
the last, hyperspace that checks whether it dropped you inside a rock (and has a
6% chance of killing you anyway), a big saucer that fires at random and a small
one from wave 3 that **leads its shots**, and a bed of two alternating bass
notes that speeds up every second wave. No melody — tension only.

**Look: ice.** Fractured translucent crystal lit from the upper left, blue-white
on deep navy, the ship a dark wedge with a lit leading edge and a thrust flame
scaled by throttle.

# 15. AEGIS — built

`games/golden/aegis.html`, accent `#ff3b5c`. Twelfth cabinet.

**The ending is the reason this one exists.** When the last city falls,
everything stops — spawning halts, the sky freezes, the bursts finish opening in
slow motion and the screen washes red. Then it says what happened rather than
"game over":

> You were never going to win this. There is no wave at which they stop coming
> — there is only how long you kept six lights on a dark map.

**Tempo is the sky.** The dread pulse fires every 6th step with nothing in the
air, every 2nd with more than eight tracks, and gains a high tick above seven.
A busy sky sounds busy without a single new asset.

Also built: three batteries with separate ammo and nearest-battery auto-select,
so **where you tap chooses the gun**; interceptors that fly to the point and
*then* detonate, which makes leading the target the whole skill; chaining
bursts; splitting incoming from wave 3; darts from wave 4 that steer away from
any burst within 34 units, so you bracket them rather than chase; wave bonus on
unused ammo and surviving cities; and a city rebuilt every fifth wave if there
is a gap for it.

**Look: weather radar.** Range rings and bearing lines centred on the middle
battery, a phosphor wedge sweeping the sky, cities as clustered returns, and
every contact carrying a faint dashed prediction line to where it will land —
which is what turns panic into triage.

# 15. COIL — built

`games/golden/coil.html`, accent `#7cf5a0`. Eleventh cabinet.

**The bed runs on the MOVEMENT clock**, not a bpm — `frame()` advances a step
counter by `dt / tickTime()` and fires a note whenever it crosses an integer, so
the music cannot drift from the motion and both accelerate as one. The shell's
scheduler is only holding the bus open. It also thickens as you fill the board:
a sine at length 12, a hat at length 24.

Verified with a bot steered at the food: 110 points, grew 3 to 11, tick tightened
0.185s to 0.157s, bonus node spawned, died on a wall.

**The tail square is free the tick it leaves**, which is the difference between
a snake that feels fair and one that kills you for following your own tail.

**One turn is buffered**, and a long drag re-arms mid-swipe, so a fast double
turn round a corner actually lands rather than being eaten.

**The bonus node is deliberately awkward** — it scores candidate squares by how
close they are to an edge and picks from the worst few, so it is worth 150 and
usually somewhere you would rather not go. It expires in seven seconds.

**Look: fibre optic.** A light pulse travelling a dark bundle — head a white
core, body a glow fading to nothing along its length, food and bonus as junction
nodes with four short fibres running off them. The tail ring brightens through
the tick so you can see exactly when the end is about to move off.

# 15. GIRDER — built

`games/golden/girder.html`, accent `#ff6b2c`. Tenth cabinet.

**The slope is the whole design.** A deck is two numbers — y at the left, y at
the right — and everything derives from that: the walking surface, where the
masonry lands, and how fast it rolls, since speed scales with `Math.abs(slope)`.
Four layouts with different slope patterns cycle, so reading a stage means
reading its gradients.

**The jump is committal.** The horizontal component is sampled at the moment you
leave the plank and cannot be changed in the air. Jumping a block you misjudged
is a mistake you have to watch happen, which is the genre.

**The hammer costs something.** Seven seconds, smashes masonry for 300 a piece,
and **disables climbing while you hold it** — so taking it commits you to
clearing the deck you are on rather than escaping upward. It also sits where
fetching it is a detour.

Also built: masonry that sometimes takes a ladder down instead of running to the
end of a plank, 100 for a clean jump-over, a bonus timer paying out on the top
deck, and a "hurry" tick that enters the bed when the timer drops under a
quarter.

**Look: scaffolded cathedral.** Stone courses, a lancet window with cold
daylight — the one thing in the frame that is not warm — sagging tarpaulin,
timber decks lit along their top edge. The antagonist is a gargoyle with folded
ribbed wings and a single lit eye, leaning back as it winds up.

# 15. RIBBIT — built

`games/golden/ribbit.html`, accent `#5bd66c`. Ninth cabinet, and the one that
had been skipped over — 03 in the list, built after 06.

Everything on the spec's build list is in: discrete hopping on a grid, road
lanes of differing widths and speeds alternating direction, floating logs and
pads where **the pads submerge on a six-second timer** and outline red before
they go, five home slots, a per-life timer paying a bonus on what is left, and
three distinct deaths — squash, drown, and occupied slot.

**Riding to the edge kills you**, which the spec flagged as load-bearing: without
it the river half has no tension, because you could simply sit on a log.

**It is a frog.** The spec proposed "something small and pale, not a green
frog", and as drawn that read as a pebble. It is now an actual frog seen from
directly above — broad shouldered body tapering to the rear, big thighs with
shins folded alongside, three splayed webbed toes, short forelegs angled
forward, and **bulging gold eyes sitting on TOP of the head near the front**,
which is the single feature that makes a top-down shape read as a frog rather
than as a mouse. The hind legs kick out and straighten through the arc of a hop.

**Pale lime** (`#c8e86a` skin, `#a3c94e` shading), warm enough to hold up
against the sodium pools without going fluorescent. The gold eyes still read
against it because the iris is a deeper amber than the skin.

**Look: night storm drain.** Something small and pale crossing a wet road under
sodium, then a culvert. Three pools of sodium light on the asphalt, headlights
that smear along the road ahead of each vehicle, and the water above it all
nearly black.

**A boot bug worth recording.** `lane.off` was created on the first `step()`,
but `draw()` ran first — so `wrapX` returned NaN, `createLinearGradient` threw
on a non-finite value, and the title screen never appeared at all. The game was
completely dead on load and the only symptom was an empty veil. Initialise
scroll offsets where the lane is built.

# 15. SWARM — built

`games/golden/swarm.html`, accent `#b06cff`. Eighth cabinet.

**Paths are mathematical, as the spec warned to make them.** A cubic bezier from
an off-screen control point to a formation slot, four entry shapes used in
rotation, and dive paths generated from the slot and the player's current x. No
path editor, nothing hand-authored to maintain, and every wave flies differently
because the dives are built against wherever you happen to be standing.

**The capture is the hook and it works.** Measured:

    capture   lives 3 -> 2, ship held under the captor
    rescue    lives 3, doubled true, captor gone

    shots in flight, firing 8 times
      single ship  2
      doubled      4

So the trade is real in both directions: twice the guns, twice the width to be
hit, and you have to kill the thing holding your ship to get it.

**Orientation bug, fixed.** Every hull is drawn nose-UP in local space, and the
caller rotates. The player was being drawn at `Math.PI` — upside down — and
ranked enemies sat at `0`, so the entire formation faced AWAY from the player it
was about to dive at. Ranked and entering foes are now `Math.PI` (facing you),
the player is `0`, and a captured ship hangs nose-down under its captor.

**The hulls are modelled per kind** rather than one silhouette in three colours:

| | |
|---|---|
| flagship | broad delta, twin outboard nacelles, a shadowed lip along the base |
| escort | swept wings with a lit leading edge, single engine bell |
| drone | small and blunt, stubby wing pair |
| player | narrow interceptor, long nose, two outboard engines with exhaust |

All four share the specular spine seam and a domed canopy with a highlight, so
they read as one fleet built by one yard.

**Look: machined hulls, not origami.** The paper idea was dropped so the Golden
Era shelf reads as one set. Same language as Soviet Blocks and Ricochet: a solid
body with a lit upper facet, a shadowed lower one, a bright specular seam down
the spine, a dark under-plate for the wings, and a spherically shaded canopy lit
from the upper left. The field gains the machined grid and vignette the other
two use. On death the hull throws lit, tumbling fragments rather than unfolding.

**Bonus stage — built.** Every fourth wave. They fly the entry curves and never
rank up, never shoot, never ram; anything you miss simply leaves. Scored on the
percentage hit, 200 a kill, and **5000 for a clean sweep**. Verified: wave 4
triggers it, 15 of 16 scored as 94%, and it rolls into wave 5.

# 15. PHALANX — built

`games/golden/phalanx.html`, accent `#c3ff4a`. Seventh cabinet.

**The two load-bearing mechanics, measured:**

    march interval as the formation thins, wave 1
      55 alive -> 620 ms      12 alive -> 242 ms
      25 alive -> 356 ms       1 alive -> 145 ms
    at wave 5 the last one steps every 103 ms

    one shot at a time: firing twice leaves exactly one in flight

**The march IS the bed.** Rather than a loop running alongside the formation,
`Arcade.music.start` owns the clock and is re-armed whenever the interval
changes. So the tempo a player hears cannot drift from the thing it describes,
and it still sits on the music bus, obeys the mute and the volume slider, and
stops with the game.

That is also how the minimum standard was satisfied honestly: `pack.sh` rejected
the first build for having no music bed, and the right answer was to make the
march a real bed rather than to loosen the check.

Also built: 5x11 formation with the sideways-then-down cadence, only the lowest
of a column can drop a bomb, four shields eroding cell by cell from either side,
a bonus craft on a timer, and the formation reaching the shield line ending the
run outright.

**Look:** x-ray plate. Pale silhouettes on a grey wash with a darker core
showing through, three body plans — medusa at the back, crab in the middle,
louse at the front.

# 15. RICOCHET — built

`games/golden/ricochet.html`, accent `#00e5ff`.

Built to the spec above. The oscilloscope look works: phosphor green on black,
bricks as hollow rectangles that flare and grow outward as they die, paddle a
bright segment, beam persistence on the ball.

**The paddle carries the idea.** Its gradient is bright at the shoulders and dim
in the middle, so the aiming zones are *visible* rather than something you have
to be told — hit it near the edge and the ball leaves at up to 60 degrees.

Done from the spec's build list: positional English, speed stepping with rally
and level, multi-hit and indestructible bricks, six power-ups (one of them
SHRINK, which is the bad one you must dodge), ten authored layouts then
procedural with a guaranteed soft row, and the anti-horizontal clamp — vertical
speed never drops below a third, so the creeping near-flat ball cannot happen.

Not yet done from the spec: the layered music bed that thins as bricks clear,
and the laser power-up is caught and timed but does not yet fire.

# 15. SOVIET BLOCKS — built

Golden Era, `games/golden/blocks.html`, accent `#e8484f`.

**The parts that make it feel right rather than merely correct:**

- **Seven-bag randomiser.** All seven shuffled, dealt, reshuffled. Pure random
  gives droughts long enough to feel broken; the bag guarantees the piece you
  need within twelve.
- **Wall kicks.** A rotation that would clip is nudged through nine offsets
  before failing. Without it, spinning against a wall just refuses and the game
  feels stiff.
- **Lock delay** of 0.45s on the floor, so a piece can still be slid into a gap
  at the last instant.
- **Ghost piece** at 16% so you can see where it lands.
- **Hold**, once per piece.
- Four lines at once pays 800 x level against 100 for one — the reason to build
  a well and wait.

**Controls:** drag across the well to move by columns crossed, tap to rotate,
swipe down to drop, swipe up to hold. Four buttons do the same for anyone who
prefers them. Keyboard and gamepad both mapped.

**A sizing bug worth remembering.** The well rendered taller than the phone and
pushed the buttons off screen. Two analytical fixes both missed by a few pixels
— `innerHeight - head - pad` ignores the safe-area padding, and measuring the
gap directly still came out 7px over. The fix is empirical: size it, measure the
real overlap, shrink, repeat up to six times. Verified even margins on 320x568,
360x640, 390x844 and 430x932.

# 15. SWEEP — all four cabinets

Run 2026-08-20. Penboy, Deep, Highway, Derelict.

**One real bug, affecting every game: the service worker never registered.**
`arcade.js` derived its path as `'../sw.js'` for a game, but games live TWO
levels down (`games/<shelf>/x.html`), so it resolved to `games/sw.js` — which
does not exist. Every cabinet 404'd on its service worker and silently lost
offline support; the arcade has never actually worked offline from a game. It
now derives the root from the `arcade-home` meta each game already declares.
Verified: all four games and the launcher register cleanly, no 4xx.

**Clean on everything else:**

| check | result |
|---|---|
| JS parses | all four |
| runtime errors over ~25 interactions | 0 in all four |
| 4xx responses | none |
| `arcade-home` meta declared | all four |
| shell bar + pause menu opens and resumes | all four |
| viewport overflow at 390x844 | none |

**Not bugs, but worth knowing:** only Derelict writes a save — the other three
are score-only by design. Derelict still has orphaned `snd.arc/patch/surge`
sound definitions with no callers; harmless, a few dozen bytes.

**Two false alarms from my own tooling**, recorded because they cost real time:
a dangling-reference scan that flagged every object-method shorthand, and two
wrong CSS selectors that reported the pause button missing from all four games.
When a check fails identically everywhere, suspect the check.

# 15. QUEUE

**Title screens — spec fixed, Derelict built, three to go.**

The name of the game and four buttons. Nothing else — no flavour paragraph, no
legend, no control recap. The game teaches itself; the front door only has to
open.

    PLAY
    CONTINUE      only when a run exists
    OPTIONS       houses CONTROLS
    QUIT          back to the launcher

**One control scheme, not two.** Movement keys (arrows, WASD, QEZC) are gone.
The game is built around pointing at a tile, and a keyboard-shaped alternative
made it two different games with two different feels — a mouse does exactly what
a thumb does. The keyboard keeps one job: space or enter dismisses a panel,
because reaching for the mouse to acknowledge a card is worse than not.

So CONTROLS reads the same on every device; only the verb changes:

    TOUCH                        POINTER
    Tap a tile     move there    Click a tile     move there
    Tap a hostile  read/strike   Click a hostile  read/strike

**Two latent crashes found while cutting it.** The keyboard bound `1`/`2`/`3`
and the gamepad bound `x`/`y`/`rb` to `arc()`, `patch()` and `surge()` — deleted
functions. Any of those presses would have thrown.

**CONTROLS is detected, not asked.** `Arcade.touch` decides whether the page
lists taps or keys, so a phone never reads "press Esc" and a desktop never reads
"tap a tile". Verified both ways.

**`Arcade.home()` added to the shell** — QUIT had nothing to call. Every cabinet
already declares an `arcade-home` meta tag; this reads it, so QUIT means the same
thing everywhere. Lands on `index.html#original` from Derelict.

Still to do: **Penboy, Highway, Deep** — Deep has no title screen at all and
starts cold.

**Original queue entry:** All four have one, but they were written
one at a time and it shows. They should share a structure — the machine's name,
its one-line hook, best score, and a single obvious way in — while keeping their
own typeface and palette. The unbuilt games inherit the same structure.

**Cinematics as a shell convention.** The pattern proven in Derelict — canvas
scenes drawn at runtime, a shared grade, a frame sequence between title and run
— belongs in `arcade.js` so any cabinet can call it. Roughly:

    Arcade.cinema.play([{art:fn, text:'...'}], { key:'derelict.intro', onDone })

with SKIP, once-per-device memory and the replay entry handled by the shell
rather than re-implemented per game. Derelict becomes the first caller instead
of the only implementation.


---

#### SW-04 · TABLETOP — *overhead elimination racer*
*After **Micro Machines** — Codemasters, 1991.*
**Status:** ☐ **Size:** M **Accent:** `#ff8a3d`

**The idea.** One camera for the whole field, and the frame is the arena. Fall
off the edge and you are out of the race — so the lead is not just position, it
is a weapon. Pull far enough ahead and the trailing cars drop off the back of
the screen by themselves.

That single rule does the work three systems would otherwise do: it is the
catch-up mechanic, the tension curve and the win condition at once, and it needs
no minimap, no lap counter in the corner, and no rubber-band AI to explain.

**Controls.** Auto-throttle, two thumbs: **hold left, hold right.** No pedal.
The original was two buttons and it is still the right answer on a phone — the
skill is when to lift, not how hard to press.

**Build**
- [ ] Overhead surfaces, not tracks: a breakfast table, a workbench, a pool
      table, a bathroom shelf. Hazards are objects — cereal, a spilled mug, a
      razor, the pockets.
- [ ] The shared frame: it follows the centre of the pack, weighted toward the
      leader. Falling outside costs a point and respawns you at the back.
- [ ] Points, not places: a point per car eliminated, race ends at a target.
- [ ] Grip model per surface — wood, glass, felt, water — so a corner taken the
      same way behaves differently on the pool table than on the workbench.
- [ ] Four opponents with different aggression, not one AI with four speeds.

**Audio.** Bed: a small, cheap, upbeat loop that pitches up as the frame
tightens. SFX: engine (pitch by speed), skid, edge-fall (a receding tumble),
elimination chime, surface change.

**Save.** `{best, wins, label:'BEST 24 POINTS'}`

**Look.** Not toy cars on a photo. Proposal: **scale model** — real materials
seen from directly above, strong single light so every object throws a hard
shadow onto the surface, cars small enough that they read as die-cast.

**Watch out.** The camera IS the game, so it has to be tuned before anything
else. Too loose and nobody is ever eliminated; too tight and the race is a
coin-flip. Build the frame logic first and race two dumb cars in it until it
feels right.

---


---

#### SW-05 · SISTERS — *side-scrolling platformer*
*After **Super Mario Bros.** — Nintendo, 1985.*
**Status:** ☐ **Size:** L **Accent:** `#4ec9d6`

**On the name.** Working title. Every other clone on this floor is named at
arm's length — Penboy, Soviet Blocks, Ricochet, Phalanx, Swarm — and none of
them echo the original's name. **SISTERS** keeps the two-hander premise without
borrowing the cadence. Alternatives in the same register: **RELAY**, **KIN**,
**TAG**, **PIPEWORK**, **OVERALLS**.

**The idea.** Two sisters, and you are only ever controlling one — **the other
is where you left her.** Tag at any time and play resumes from wherever the
other sister is standing, so the level is a puzzle about parking one of them
somewhere useful. A gap you cannot clear alone is trivial if the other is
already on the far side holding a switch.

That is the one addition that earns the clone. Everything else is honest
platforming: run, jump, stomp, a run button that raises your top speed and your
stopping distance.

**Controls.** Two thumbs. Left thumb steers, right thumb has **JUMP** and
**TAG**. Hold JUMP for height; the run modifier is automatic above a speed
threshold rather than a third button.

**Build**
- [ ] Tile world with solid, one-way and breakable tiles.
- [ ] Momentum with real acceleration and skid — the feel is the whole genre.
- [ ] Variable jump height by hold length, coyote time, and a jump buffer.
      Without those three it will feel wrong however good the rest is.
- [ ] Stomp, with a bounce, and a chain bonus for stomping without landing.
- [ ] The TAG swap, the level built around it, and a camera that eases rather
      than cuts when control changes hands.
- [ ] Four enemies with honest patterns: a walker that turns at ledges, one
      that does not, a jumper, and a thrower.
- [ ] Pipes, a hidden room per level, and a flag at the end scored on height.
- [ ] Eight levels across two surfaces, plus a boss that needs both sisters.

**Audio.** Bed: bright, major, and it **transposes up a third when you tag**, so
the swap is audible. SFX: jump, stomp, brick break, coin, pipe, flag, death.

**Save.** `{best, level, coins, label:'WORLD 2-3'}`

**Look.** Not mushrooms and pipes in primary colours. Proposal: **enamel signs**
— chipped painted metal, thick outlines, a limited sign-writer's palette, and
weathering on every surface. It reads as period without reading as theft.

**Watch out.** This is the biggest build on the floor: L, not M. The jump feel
alone is a week of tuning in a normal project. Build the movement in an empty
room and get it right before a single level exists — if the jump is wrong the
levels cannot save it, and if the jump is right the levels are easy.

---
