# Changelog

The append-only index of what shipped and when, keyed to version. One short dated entry per feature
commit. Newest on top. **An entry is never edited after the fact.**

Each entry links to the fragment that holds the full record. This project keeps no `tracker.md`, so
a link points at the fragment file itself: `[RLG-001](../fragments/RLG-001.md)`. Both directions
must resolve, and that is verified at every audit.

**The history before this file begins is Tiny Arcade's**, and it came across whole rather than being
squashed. That project's own changelog stops at 0.9.11 and stays in its own repository. The version
here reset to 0.1.0 at the fork: the engine did not get younger, but this product's own work had
barely started, and 0.9.x would have claimed otherwise.

---

<a id="v0-9-44"></a>
## [0.9.44] - 2026-08-29
- Fixed: **the player's front sprite is built in the same box as its rear.** The garage's two views
  were not misaligned, they were different shapes: a road car's tail is painted into that shape's own
  canvas and its face was being painted into a flat 220x168, so the same car came out with different
  proportions. The same hardcoded box was in three other places, including the rival caches - so
  every sports-class rival on the road was drawn at the wrong aspect ratio. One `rigBox()` now, read
  by all of them ([RLG-072](../fragments/RLG-072.md)).
- Fixed: **drive-test knows about the ladder.** It expected the supercars in the garage and asserted
  150mph in a car that now tops out at 153 - so a garage change reported itself as a slow engine. It
  expects the sports class and asserts nine tenths of whatever car it is sitting in
  ([RLG-070](../fragments/RLG-070.md)).

<a id="v0-9-43"></a>
## [0.9.43] - 2026-08-29
- Fixed: **an old save no longer starts with the supercars.** The migration that protects a returning
  player's cars counted the SAVED CAR as evidence of a career, and the old default body was a
  MATADOR - so every save ever written held a supercar key and every returning player was handed the
  class for nothing. Only a tournament prize counts now
  ([RLG-070](../fragments/RLG-070.md)).

<a id="v0-9-42"></a>
## [0.9.42] - 2026-08-29
- Fixed: **the garage's two views are the same car.** Aligning their sprite boxes was not enough and
  neither was one shared scale: the two painters draw the car at different sizes inside their own
  canvases, so the front came out about nine per cent bigger. Each end is now scaled so their solid
  bodywork is the same WIDTH - the one dimension both views share - and the floor line is read from
  the tyres rather than from the soft shadow under them ([RLG-072](../fragments/RLG-072.md)).

<a id="v0-9-41"></a>
## [0.9.41] - 2026-08-29
- Fixed: **every vehicle in the mirror is the real car.** The police were still drawn as the
  placeholder block, and no car fades to a simplified render any more: the level of detail, the
  cross-fade and the MIRROR setting are all gone, and the mirror is always the full one. The two
  police cars gained the fronts they never had ([RLG-074](../fragments/RLG-074.md)).
- Added: **`tools/face-test.py`** - asks the engine what the mirror would draw for every vehicle in
  the game, and fails if any of them has no face or a blank one. Three vehicles have been found in
  this state by eye, on a phone, weeks after shipping ([RLG-074](../fragments/RLG-074.md)).

<a id="v0-9-40"></a>
## [0.9.40] - 2026-08-29
- Changed: **the whole fleet's stat table, and acceleration and braking are derived rather than
  declared.** Every class below the supercars comes down and the gaps between classes are equal:
  formula 248-276, super 190-206, sports 142-160, production 100-120, utility 80-94. Acceleration is
  `1.56 * sqrt(hp/mass) * launch` and braking is `grip * mech`, so horsepower, mass and grip are now
  what a car IS and the two old multipliers are gone. Mass is deliberately absent from braking: in a
  tyre-limited stop it cancels, and what makes a heavy vehicle stop badly already lives in its grip
  ([RLG-055](../fragments/RLG-055.md)).
- Changed: **each police car is the slowest of the class it polices, and the best-braked.** The super
  cruiser sits 4mph under the slowest supercar, which makes its own note about the cage costing it
  4mph true; the cruiser sits 4mph under the slowest sports car ([RLG-055](../fragments/RLG-055.md)).
- Fixed: **the three stat comments that described numbers this change moved** - the 200mph ceiling,
  the sports-class rungs, and the super cruiser's note ([RLG-055](../fragments/RLG-055.md)).

<a id="v0-9-39"></a>
## [0.9.39] - 2026-08-29
- Fixed: **the formula cars reach their own top speed.** A safety clamp at 260mph and a speedometer
  face fixed at 260 were both written when the quickest car did 206 - so COMET, declared at 276, was
  held at 260 with a pegged needle. Both are derived from the fleet now, and the dial's red band is
  the car's own ceiling rather than a fixed 200. Measured: 248, 260 and 276 of 248, 260 and 276; with
  the old clamp restored, COMET reaches 260 ([RLG-075](../fragments/RLG-075.md)).

<a id="v0-9-38"></a>
## [0.9.38] - 2026-08-29
- Fixed: **the garage's two views stand on one floor at one scale.** They were bottom-aligned by
  their sprite boxes, which are different shapes with the car in a different place inside each - so
  one end floated and the two were different sizes. The painted content of each sprite is measured
  and the pair is placed by that ([RLG-072](../fragments/RLG-072.md)).

<a id="v0-9-37"></a>
## [0.9.37] - 2026-08-29
- Fixed: **the racers have faces in the mirror.** The mirror fades a painted nose in over a
  simplified block as a car closes, but it looked the nose up by traffic TYPE - and a racer carries a
  body and a paint instead, so every rival stayed a coloured lozenge while the van beside it had a
  face. Rival fronts are built on demand, about eight in a race, rather than doubling a hundred
  cached canvases on a phone ([RLG-074](../fragments/RLG-074.md)).

<a id="v0-9-36"></a>
## [0.9.36] - 2026-08-29
- Added: **`stat-test` measures braking and cornering.** RLG-055 was blocked on it: every body
  declares a `brake` and a `grip` and nothing had ever checked what they do. Braking is a stopping
  distance from 140 to 40mph; cornering is the drift through one bend with **no steering input at
  all**, divided by the push the engine applied. Both stats turn out honest - braking spreads four to
  one, and the measured `cornerG` times the declared grip is 0.420 with a standard deviation of 0.006
  across sixteen bodies. Both halves were watched failing with the stats removed
  ([RLG-055](../fragments/RLG-055.md)).
- Added: **five probe instruments** the measurement needed - `setBrake`, `pushK`, `targetX`,
  `curvatureAt` and `setLane` ([RLG-055](../fragments/RLG-055.md)).

<a id="v0-9-35"></a>
## [0.9.35] - 2026-08-29
- Added: **the garage shows both ends of the car.** Only the tail was ever built for the player, and
  the garage is the one screen where you look at the car instead of following it. Each end is about
  half the size the single picture was, and the card is fifty pixels shorter with it - two cars side
  by side are limited by their width, so the taller card was a band of nothing
  ([RLG-072](../fragments/RLG-072.md)).

<a id="v0-9-34"></a>
## [0.9.34] - 2026-08-29
- Removed: **the silver and bronze prizes.** They paid the TUNER and the MUSCLE car, and both are in
  the starting class since the ladder was built - so second and third place were handing over cars
  the player already owned. What those places should pay instead is being explored
  ([RLG-071](../fragments/RLG-071.md)).

<a id="v0-9-33"></a>
## [0.9.33] - 2026-08-29
- Added: **the formula class - VECTOR, APEX and COMET.** One formula car became three, each at least
  twenty per cent above the *best* supercar in every stat: 248, 260 and 276mph, biased to
  acceleration, balance and top end. They share one design and are told apart by name, badge and
  numbers - VECTOR wears blue chevrons, APEX the gold bolt, COMET a comet
  ([RLG-070](../fragments/RLG-070.md)).
- Changed: **`classOf` knows a third class.** A formula car used to fall through into 'super' and race
  road cars. The grid, the ladder, the yoke, the missing indicators and the missing wipers all follow
  the class now, so nothing names these three cars again ([RLG-070](../fragments/RLG-070.md)).
- Changed: **the ladder of classes.** A fresh install holds the sports class alone. A sports gold
  opens the supercars, a supercar gold opens the formula class, and a formula gold opens the
  iridescent paints. An existing save that shows a career keeps the supercars it already had
  ([RLG-070](../fragments/RLG-070.md)).
- Added: **a third debug switch.** All racers, police, all traffic - the patrol car used to ride on
  the racers' switch, so testing a pursuit opened the whole ladder with it
  ([RLG-070](../fragments/RLG-070.md)).

<a id="v0-9-32"></a>
## [0.9.32] - 2026-08-29
- Added: **a plain steering wheel for the production and utility cars.** They were being given the
  sports wheel with its flat bottom rounded off - carbon weave, chrome spoke inserts, a bezel round
  the switchgear and a racing tick at twelve o'clock. The plain wheel is its own object: a moulded
  rim, plain arms, no weave and no tick, and a wide horn pad in place of the machined hub. The lorry
  takes a thinner rim than the rest ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-31"></a>
## [0.9.31] - 2026-08-29
- Changed: **racing stripes belong to the supercars and the sports cars.** The rule was an exclusion
  of the two cars that already wear a livery, which left every van and saloon free to wear a pair of
  Le Mans stripes. It is a list now - the formula car stays out because its livery is its bodywork -
  and the STRIPES button no longer appears in the garage for the six production and utility cars
  ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-30"></a>
## [0.9.30] - 2026-08-29
- Changed: **each vehicle is drawn in the paint it is allowed to wear.** The fleet sheet built every
  body in white, so the cab was white and both patrol cars were white. The cab takes its forced
  yellow, and each patrol car appears twice - once in each of the force's two liveries, built from
  `COP_PAINT` rather than the garage palette. Everything else stays white
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **a stripes frame on every row.** Stripes are paint rather than a body, so any car can wear
  them except one already wearing a livery of its own - the formula car and both cruisers, whose
  cells are empty ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-29"></a>
## [0.9.29] - 2026-08-29
- Fixed: **the utility vehicles have windscreen wipers.** The pickup, the van and the lorry were the
  only things on the road without a pair. Each has its own branch in the front painter, because a
  lorry's face is mostly glass and a pickup's cab sits back behind its bed, and every one of those
  branches returns before the shared registration at the bottom of the painter - so the wipers were
  never handed back for those three. Each branch registers its own now, and the lorry's takes the
  cab's paint rather than the trailer's ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-28"></a>
## [0.9.28] - 2026-08-29
- Changed: **the road cars are earned by distance on the clock.** The old rule was a hundred miles on
  TEST DRIVE with any settings, opening every road car at once. Now **25 miles unlocks UTILITY** and
  **50 miles unlocks PRODUCTION**, and both need the timer running. A save holding the retired
  `traffic` flag keeps both ([RLG-067](../fragments/RLG-067.md)).
- Changed: **the lorry's trailer takes a much darker shade of the chosen colour** instead of a fixed
  beige, and the cab still wears the colour itself. It exposed a fault the rear view had hidden - the
  FRONT painter drew the cab out of the trailer's shade, so the whole face was the colour of the box
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **a hint of the trailer above the lorry's cab.** Head on, a lorry is a cab with a box behind
  and above it; without that the front view was a tall van ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **the wipers are no longer baked into the sprite.** They were drawn parked into the canvas
  AND handed back for animation, so anything sweeping them painted a second pair over the first -
  both poses at once ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **the blower floated above the bonnet**, and it is anchored to the bonnet line now rather
  than to a number chosen beside it ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the blower is a bug catcher** - three round trumpets with red mouths on a narrow
  injector hat, a polished ribbed case, and the drive pulley at the bottom, the whole unit about a
  fifth of the car's width and standing through the bonnet. Two earlier attempts were wide flat
  scoops, which is bodywork rather than an engine ([RLG-053](../fragments/RLG-053.md)).
- Verified, not assumed: a cab is always yellow, the two force cars are black-and-white only, and the
  lorry's cab is what carries the paint ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-27"></a>
## [0.9.27] - 2026-08-29
- Added: **every FRONT declares its lamps** - `head`, `turn.l`, `turn.r`, and the front pair of the
  police bar. 84 lamps became 130 across the same 26 vehicles
  ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **every car's headlights were on at noon.** `headGlow` painted a bloom straight into the
  sprite, so a parked car glowed in the garage. A headlight is a lamp like any other now
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **wipers.** A wiper is not a lamp - it has a POSITION, not an on and off - so a sprite
  carries `wipers(g, t)` beside its lamps, 0 parked and 1 at full sweep, and bakes the parked pose.
  They wear the car's own paint and a lighter shade of it ([RLG-060](../fragments/RLG-060.md),
  [RLG-053](../fragments/RLG-053.md)).
- Changed: **the muscle car loses its forced stripes and gains an exposed blower** standing out of
  the bonnet and cutting into the screen, drawn in front of the wipers. Its outer headlight is a
  bigger bulb than its inner one ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **every supercar wore MATADOR's face.** `paintFront` takes its body under `bodyType` and the
  fleet accessor was passing `kind` - five cars, one nose
  ([RLG-053](../fragments/RLG-053.md)).
- Changed: **a front indicator is its own lamp, never a headlight.** At the rear a cluster is a row
  of repeated elements and the outermost can be the amber; at the front there are two lamps and
  taking one removes a headlight. STALLION and MATADOR stack theirs under the lamp at the lamp's own
  rake; CREST's banded bar gives up its outermost segment, which is the rear's answer for the rear's
  reason ([RLG-053](../fragments/RLG-053.md)).
- Changed: **one sheet per class** - `docs/fleet-super.png`, `-sport`, `-police`, `-production`,
  `-utility`. One picture of everything was unreadable at any size that fits on a screen. Two rows
  per vehicle, back then front, and the steering wheels at the end
  ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-26"></a>
## [0.9.26] - 2026-08-29
- Fixed: **the van has one brake light and one indicator above it, per side.** It was a single tall
  red lamp with an amber band across its top - one object that read as two - and two earlier attempts
  each adjusted the wrong part of it ([RLG-053](../fragments/RLG-053.md)).
- Changed: **on every laterally-clustered car the indicator is OUTBOARD** - roadster, tuner, cruiser,
  coupe, saloon, cab. Inboard put the two ambers together in the middle of the car, where they read
  as one central lamp rather than as a side being signalled. Carved out of the cluster, so the tail
  is the width it always was ([RLG-053](../fragments/RLG-053.md)).
- Changed: the fleet sheet names each vehicle once. **There is no garage version and traffic version
  - it is one car** ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-25"></a>
## [0.9.25] - 2026-08-29
- Fixed: **the van had two indicators.** Its cluster has always carried an amber band across the top
  of each red lamp; the conversion added a bulb above it. The band is declared as the indicator now
  and the added bulb is gone - the art was already right and nothing was reading it
  ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **the lorry's roof row lit pale yellow when asked to light red.** A lit lamp composites with
  `lighter`, which adds, and amber plus red is yellow. The row is dark red when off and bright red
  when braking, which is what a lorry's rear roof markers are
  ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-24"></a>
## [0.9.24] - 2026-08-29
- Changed: **STALLION keeps all four rings as brake lights**, and the indicator is the dot inside the
  outer two - the first attempt made the outer rings themselves amber, which changed what the brake
  light is ([RLG-053](../fragments/RLG-053.md)).
- Changed: **MUSCLE has four boxes a side**, the outermost one the indicator, matching MATADOR's
  outermost chevron ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the VAN indicates above its brake lights**, and only there
  ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the LORRY's roof running lights brake as well** - they are part of the tail declaration
  now, which is what you actually see of a lorry slowing at night
  ([RLG-053](../fragments/RLG-053.md)).
- Changed: `fleet-sheet` prints each row's painter, so two rows that look alike in white can be told
  apart rather than read as duplicates ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-23"></a>
## [0.9.23] - 2026-08-29
- Added: **the whole fleet declares its lamps** - 84 lamps across 26 vehicles, each a single drawing
  run unlit into the sprite and again lit on top of it. Every rear sprite in the game is converted
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **every vehicle but the FORMULA has indicators**, wired and working, with the blink phase
  running whether or not anything is signalling so a lamp that comes on is in step with the road.
  **The FORMULA has none by the owner's ruling** - a single-seater does not carry them, and that is
  what the car is rather than something unfinished
  ([RLG-052](../fragments/RLG-052.md), [RLG-053](../fragments/RLG-053.md)).
- Added: **the police bar is four addressable lamps**, on the cruiser and the super cruiser alike,
  so a bar can run a pattern instead of pulsing as one blob. `drawCopLights` no longer paints its
  own bar over the sprite's - and the two never agreed: the lit bar sat at 0.19 of the car's width
  against the sprite's 0.235 ([RLG-053](../fragments/RLG-053.md)).
- Changed: the unlit bulb is a **dark amber** and the lit one a **bright amber**; on MATADOR the
  indicator **is** the outermost chevron of the tail cluster, and on STALLION it is the outer two of
  the four rings - so a signal is the same design as the brake light beside it
  ([RLG-053](../fragments/RLG-053.md)).
- Added: `tools/fleet-sheet.py` and `docs/fleet.png` - the fleet drawn dark, braking, indicating
  each way, and with the bar. One row per painter, so the garage SALOON and the traffic sedan are
  one car in two liveries rather than two rows ([RLG-053](../fragments/RLG-053.md)).
- Added: `lamp-test` checks all 84 lamps with no colour knowledge - it runs each declaration lit and
  unlit and compares **pixels**. Its first version compared bounding boxes and could not see one
  lamp of a pair sliding inside the box; a deliberate 3% drift passed. It now fails at 50 stray
  pixels of 1,156 ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-22"></a>
## [0.9.22] - 2026-08-29
- Added: **a lamp is one drawing, run twice.** A painter declares its lamps as functions that draw
  themselves and take one argument - lit or not. The sprite runs each unlit as it bakes; the screen
  runs the same function again through a transform that maps the sprite onto the car. One
  description, executed twice, so a reskin moves the bulb and its light together
  ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **there were three descriptions of the player's tail lamps.** The sprite's own art,
  `playerBrakes` (which **nothing ever called**), and a third inline in `drawPlayer` - the one you
  actually saw. `playerBrakes` is deleted rather than converted; the inline copy remains only for
  bodies not yet converted ([RLG-053](../fragments/RLG-053.md)).
- Fixed: the player's tail glow was drawn **outside the transform that draws the car**, so it did not
  lean with it ([RLG-053](../fragments/RLG-053.md)).
- Added: **the MATADOR has indicators, wired and unasked.** An unlit amber bulb at each blade
  housing, lit through the same declaration, with the blink phase running at ~1.5Hz whether or not
  anything is signalling - so a lamp that comes on is in step with every other one on the road.
  Nothing in the game asks for it, which is the ruling and not an omission
  ([RLG-052](../fragments/RLG-052.md), [RLG-053](../fragments/RLG-053.md)).
- Added: `tools/lamp-test.py` - runs the declaration lit into a blank canvas and checks those pixels
  sit where the **baked sprite's** own unlit bulb sits. Shifting only the lit pass by 5% fails it.
  Two earlier versions diffed live frames and were reporting weather: 800-1,300 pixels of the car
  change between two frames with the lamp off ([RLG-053](../fragments/RLG-053.md)).
- **Not converted:** CREST, STALLION, FORMULA, the cruiser, the super cruiser, every traffic body,
  the front sprites and the rear-view. `lamp-test` skips rather than passes on those, so a
  half-converted engine cannot read as a finished one ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-21"></a>
## [0.9.21] - 2026-08-29
- Fixed: **fully visible cars vanished beyond the bottom of a valley.** `horizon` is a fixed line at
  40% of the canvas - where sky meets ground on *flat* road - and the sprite pass culled anything
  standing above it as "off screen". Beyond a dip the far side rises, the road is painted well above
  that line, and a car standing on it was thrown away while in plain sight. The screen is the bound
  now ([RLG-041](../fragments/RLG-041.md)).
- Measured, splitting the two cases before changing either: **2,083 and 3,469 vehicle-frames per run
  were culled as "off screen" while on the screen; genuinely off the top, 3 and 5.** Total pops fell
  from 53-56 per minute to 9-20 ([RLG-041](../fragments/RLG-041.md)).
- Not kept: fading small sprites at a crest instead of clipping them. The reasoning was sound - at
  25,000 units a car is six pixels tall and the crest line legitimately moves several pixels a frame
  - but it **did not move any measured number**, so it was removed rather than shipped beside the
  fix that works ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-20"></a>
## [0.9.20] - 2026-08-29
- Fixed: **cars flickered in a valley below you**, reported from the device on v0.9.19 once the brow
  flicker was gone. Three faults in the near end of the crest table, found by recording the
  *distance* of every step over ten pixels: 618 of 632 were within 4,000 units of the player
  ([RLG-041](../fragments/RLG-041.md)).
- Fixed: **the crest table started at `pos`, and the camera is `PLAYER_Z` ahead of it.** Its first
  five entries projected points *behind the camera*, where a sample flickering between refused and
  accepted poisons the running minimum for everything after it. The `n < 2` guard in `crestAt` was a
  patch over exactly that and is gone ([RLG-041](../fragments/RLG-041.md)).
- Fixed: **"no crest yet" was written as `H`, a screen coordinate.** Harmless while entries were read
  whole; not harmless once v0.9.17 interpolated between them, where a blend from `H` to a real road
  height is a brow sweeping the whole screen in one segment. The sentinel is `Infinity` now
  ([RLG-041](../fragments/RLG-041.md)).
- Fixed: **the cull was a cliff four pixels wide.** A car under the brow draws nothing through the
  clip anyway, so culling it is an optimisation, not a decision - and its threshold sat one sliver
  from visible. It is `H*0.05` now, so the flip happens where the car is already clipped away
  ([RLG-041](../fragments/RLG-041.md)).
- Measured: **flickers per minute 8-24 → 0.0, 0.0, 1.3, 0.0** across four runs, and the surviving
  silhouette steps are confined to the first two segments past the camera
  ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-19"></a>
## [0.9.19] - 2026-08-29
- Fixed: **cars appeared at the draw edge instead of arriving.** A sprite in the last sixth of the
  drawn road fades in now. Measured: a car at the edge is **6.7 px wide on a 480 px screen**, not
  the one pixel the record twice claimed - that figure had been inferred from the painter refusing
  sprites under 1.2 px, which is where a sprite stops being drawn rather than where one arrives. It
  reaches full opacity by 25,200 units, so a car comes in over about 4,800
  ([RLG-061](../fragments/RLG-061.md)).
- Still open: **how far the road should be drawn.** The fade changes the basis for deciding it - the
  draw distance can now be judged on how far you can see rather than on how badly things arrive
  ([RLG-061](../fragments/RLG-061.md)).

<a id="v0-9-18"></a>
## [0.9.18] - 2026-08-29
- Fixed: **looping sounds never came back after the app was backgrounded**, reported from the
  device. Four seconds hidden closes the audio context on purpose - a suspended iOS session can wake
  after a force-quit - and every held voice dies with it, while one-shots keep working because they
  build fresh nodes each time. The rebuild path existed and **could never run**: it lived in the
  watchdog's `closed` branch, and teardown clears the watchdog and nulls the context the branch
  tests. `A.audio.init()` fires the rebuild itself now, for every engine after the first
  ([RLG-065](../fragments/RLG-065.md)).
- Fixed: **Hardpoint never subscribed to the rebuild at all.** Quietus and `road.js` did; Hardpoint's
  four held layers could not come back even once the shell started asking
  ([RLG-065](../fragments/RLG-065.md)).
- Added: `audio-test` backgrounds the app and asks **which context a held layer belongs to**. Two
  weaker checks were written first and both were worthless - counting rebuild calls read zero on a
  fixed build, and reading the layer's gain read a healthy 0.13 on a broken one, because a GainNode
  on a closed context reports its value quite happily ([RLG-065](../fragments/RLG-065.md)).

<a id="v0-9-17"></a>
## [0.9.17] - 2026-08-29
- Fixed: **cars still popped at the brow of a hill**, reported from the device after v0.9.13. Two
  more faults in the same silhouette. The crest table holds one value per road segment and was read
  as a **staircase** - the brow did not move while a car crossed a segment, then jumped when it left
  one. It is interpolated now; the table is a running minimum, so a straight blend between entries
  *is* the silhouette ([RLG-041](../fragments/RLG-041.md)).
- Fixed: **the crest table was pinned to the segment behind the player.** It walked
  `(base + n) * SEG`, so every entry shifted by one whenever the player crossed a boundary, and the
  segment just passed - at a crest, the highest point on the road - left the running minimum in one
  step. It walks `pos + n * SEG` now and slides with the camera
  ([RLG-041](../fragments/RLG-041.md)).
- Measured: the largest single jump in the silhouette fell from **355 px to 80 px** on a 900 px
  screen, and the median move from 0.60 px to 0.40 px. Flicker rates moved too, but two runs apiece
  cannot separate that from the road being different, so **no claim is made on them**
  ([RLG-041](../fragments/RLG-041.md), [RLG-062](../fragments/RLG-062.md)).
- Removed: the skew counter that compared the two crest-index conventions. They agree by
  construction now, and a check that can only read zero is not a check
  ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-16"></a>
## [0.9.16] — 2026-08-29
- Fixed: **nothing came up behind you when you stopped**, reported from the device. Traffic was
  culled only once it had fallen 34,000 units *behind*, so anything quicker than the player drove
  away and stayed in the array forever. Measured at a standstill: the array pinned at **30 cars, all
  ahead, and within fifteen seconds all thirty were past the draw distance** — an empty road with
  thirty invisible cars on it. `spawnBehind` is gated on `traffic.length < 26` and so could never
  fire. Cars are now culled past `pos + 64000`, beyond the furthest road the run has built
  ([RLG-064](../fragments/RLG-064.md)).
- Added: `traffic-test` tags every car present when you stop and asserts that an **untagged** one
  arrives behind you. A car that was already there proves nothing
  ([RLG-064](../fragments/RLG-064.md)).

<a id="v0-9-15"></a>
## [0.9.15] — 2026-08-29
- Added: **the arcade says which build it is running.** A BUILD row in the launcher's SETTINGS
  sheet, directly above FORCE UPDATE — the two are the same question — and a build line in every
  `.ark-opts` panel, printed even when a machine has no options. The identifier is
  `Arcade.version`, the same string every commit names, so there is no second number to maintain
  ([RLG-063](../fragments/RLG-063.md)).
- Added: **a MIXED warning.** `sw.js` serves scripts network-first with a cache fallback, so a slow
  connection can hand a device a fresh `arcade.js` beside a cached `road.js`. The engine stamps
  `window.ROAD_BUILD`, and the tag reads `BUILD 0.9.15 / ROAD 0.9.14 - MIXED` in orange when the two
  disagree ([RLG-063](../fragments/RLG-063.md)).

<a id="v0-9-14"></a>
## [0.9.14] — 2026-08-29
- Changed: `occlusion-test` drives **three shorter stints on three fresh roads** and sums them,
  instead of one stint on one road. The terrain is generated per load, so its numbers swung
  `culled` 0 → 40 → 147 on a single unchanged build and one of those runs failed its own
  `drawn > 200` assertion. The per-stint figures are printed and the report says plainly that one
  run cannot be compared with another ([RLG-062](../fragments/RLG-062.md)).
- **No product file changed in this version.** It is a harness fix, found by quoting that harness
  wrongly in v0.9.12 ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-13"></a>
## [0.9.13] — 2026-08-29
- Fixed: **cars flickered at the lip of a crest**, reported from the device after v0.9.12.
  `buildHillClip` fills its table by absolute segment; `crestY` looked it up by *segments ahead of
  the player*, which is one lower whenever the car sits earlier in its segment than the player does
  — and which of the two it is flips **every time the road crosses a segment boundary, ~57 times a
  second at speed**. On flat road the two entries agree; at a crest they differ sharply, so a car
  near the brow flipped between hidden and drawn. Measured: the two conventions disagreed on 24
  vehicle-frames in 45 seconds, twice over, and only ever on cars at a crest
  ([RLG-041](../fragments/RLG-041.md)).
- Measured after: flickers 14.7 and 1.3 per minute, **all of them at the draw edge**, none mid-road
  ([RLG-041](../fragments/RLG-041.md)).
- Corrected: v0.9.12 cited `occlusion-test` going from `culled 0` to `culled 167` as proof. **That
  is withdrawn** — three runs on one unchanged build gave 0, 40 and 147. The terrain is generated
  fresh each run and that figure measures how hilly the road happened to be. The change stands on
  its own reasoning and on the sub-pixel measurement; the occlusion numbers were not evidence for it
  ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-12"></a>
## [0.9.12] — 2026-08-28
- Fixed: **cars winked out for three or four frames at mid-distance.** The engine had two occlusion
  tests for terrain: `crestY`, a real silhouette built from the hill clip every frame, and a coarse
  one that dropped a whole sprite bucket whenever its road slice was skipped. Measured, every
  flickering car sat on a slice that missed being painted by a **median of under one pixel** — a
  crest tangent, not a hill. The bucket is always emitted now and `crestY` is the only thing that
  hides a car behind terrain ([RLG-041](../fragments/RLG-041.md)).
- Changed: `occlusion-test` now reports **culled 0 → 167, clipped 14 → 160**. Cars fully behind a
  crest were being lost by the bucket gate before the real test ever saw them, which is why the
  engine reported zero culls while occlusion visibly worked
  ([RLG-041](../fragments/RLG-041.md)).
- Measured: flickers fell from 16–28 per minute to 8–12, and every survivor is at the draw-distance
  edge rather than on the road. Zero cull faults, before and after
  ([RLG-041](../fragments/RLG-041.md)).
- Known: the second mechanism is characterized and not fixed — the sprite bucket range runs to
  `DRAW+1` and the road pass walks to `DRAW`, so a car at ~30,000 units flickers for a median of one
  frame at about a pixel wide. Changing anything at the draw edge risks a worse pop-in
  ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-11"></a>
## [0.9.11] — 2026-08-28
- Added: **the engine can say why a vehicle was not drawn.** A ledger behind `API.watchDraw()`
  records the painter's own exit for every vehicle offered to it — `drawn`, `clipped`, `crest`,
  `offscreen`, `behind`, `tiny`, `huge`, `unbucketed`, `unemitted`, `nosprite`. Off in the product,
  where it costs one boolean test per sprite ([RLG-041](../fragments/RLG-041.md)).
- Added: `tools/pop-test.py` — the measurement RLG-041 asks for before any fix. It answers the
  ruling's question: **every disappearance was an object still in `traffic` or `racers` that the
  painter declined to paint. Zero cull faults in four runs.** Two mechanisms account for the
  flickers — a bucket alternating between emitted and not at ~11,000 units, and the draw-distance
  edge at ~30,300 ([RLG-041](../fragments/RLG-041.md)).
- Known: the run is a headless desktop browser at 480x900 and the owner's report is from a phone.
  **A clean run here is not evidence the reported fault is absent**
  ([RLG-041](../fragments/RLG-041.md)).

<a id="v0-9-10"></a>
## [0.9.10] — 2026-08-28
- Fixed: **traffic that gave way was never given back.** `keepLaneOpen` leans the car furthest ahead
  toward the verge to hold a corridor open and set a flag that **nothing ever cleared** — so a car
  that once made room was slowed for life, barred from merging again, and left standing between two
  lanes. It was 42–46% of every lateral move on the road, and it is what the owner reported as a car
  merging a fraction of a lane. Giving way is a timed state now: it ends, the car pulls fully into
  the nearest lane, and it recovers its cruising speed. Cars at rest between two lanes fell from
  **7.8% to 1.3%** of at-rest samples ([RLG-040](../fragments/RLG-040.md)).
- Fixed: a merge aimed at `c.x + 0.50` clamped to `0.86`, which from the outermost lane is a fifth of
  a lane onto the verge. It targets a **lane index**, one lane at a time, from the lane the car is in
  ([RLG-040](../fragments/RLG-040.md)).
- Changed: **every lateral number in the engine is now in lane widths** — merge rate, arrival,
  idle drift, spawn jitter, and the verge a yielding car leans onto. `LANE_W` sits beside `LANE_X`,
  shared by traffic and rivals, so full merging survives the road getting wider
  ([RLG-040](../fragments/RLG-040.md), [RLG-024](../fragments/RLG-024.md)).
- Changed: `cruiseFloor` was set on rogue cars every frame and read by nothing. It is the pace a car
  returns to after it has been made to slow down, which is the job it was created for
  ([RLG-040](../fragments/RLG-040.md)).
- Added: `tools/merge-test.py` — does traffic change a whole lane? It reads lateral position over
  time and no engine state, so a merge that is recorded and never carried out cannot pass it. Run
  against the engine as it was, it fails ([RLG-040](../fragments/RLG-040.md)).
- Known: the Interstate is slower for the player, because the lanes are genuinely fuller now —
  `drive-test` peak speed over eight runs 126–182mph (mean 156) against 150–188 (mean 175) before.
  **The threshold was not lowered** ([RLG-056](../fragments/RLG-056.md)).

<a id="v0-9-9"></a>
## [0.9.9] — 2026-08-28
- Fixed: **rivals never finished an overtake.** Steering was a per-frame lateral pressure that lasted
  only while something was in front, then pulled the car back to a lane index nothing ever updated —
  so a rival leaned out, unblocked its own scan, and drifted home. A lane change is a decision now:
  pick a target, commit, arrive, one lane at a time. Measured, time off a lane centre fell from
  **59–61% to 10–11%** with overtakes unchanged at ~30/min ([RLG-033](../fragments/RLG-033.md)).
- Fixed: **rivals could not see the player.** They scanned traffic, each other and the police and
  were blind to the one car you are sitting in — the same omission that once let them drive through
  you ([RLG-033](../fragments/RLG-033.md)).
- Changed: roadblocks are aimed at by **lane** rather than by coordinate, and every lane figure is in
  lane widths, so full merging survives the road getting wider
  ([RLG-040](../fragments/RLG-040.md), [RLG-024](../fragments/RLG-024.md)).
- Fixed: `drive-test`'s autopilot was blind to racers and drove into them once the rivals stopped
  wandering — 91% damage and a 127mph peak, which read as the engine failing
  ([RLG-033](../fragments/RLG-033.md)).
- Known: `speed rises above 150mph` now fails about one run in four at 146–148mph, because the road
  is genuinely busier. **The threshold was deliberately not lowered**
  ([RLG-056](../fragments/RLG-056.md)).

<a id="v0-9-8"></a>
## [0.9.8] — 2026-08-28
- Fixed: **every AI car accelerated through the PLAYER's gearbox.** `aiGearFactor` read `gearTable()`
  and `redline()`, both scoped to `optBody`, so the same rival recovered in 3.82s with the player in
  a four-speed and 4.75s in a six-speed — a 24% swing caused by a car it never met. Rivals and police
  now use their own gearbox, redline and top speed. Measured after: **−0.4%**
  ([RLG-042](../fragments/RLG-042.md)).
- Fixed: **`r.pull` was assigned to every rival and never read.** AI acceleration was a flat `2850`
  with no torque term, against the player's `1000 × gearFactor × pull`. Both now use the same
  expression ([RLG-042](../fragments/RLG-042.md)).
- Changed: **rivals accelerate about 3.5× less hard than they did**, because they had been pulling
  that much harder than any car the player can buy. Recovery from 40% to 90% of pace: 3.82s → 13.5s.
  The rubber band weakens with it — the governor from −7.80% to −3.21%, and a towed rival no longer
  reaches the raised ceiling. **Awaiting the owner's ruling** on whether `pull` is raised in the
  fleet table ([RLG-055](../fragments/RLG-055.md)).
- Changed: gear tables are cached by gear count rather than rebuilt per call — eleven rivals a frame
  made the old allocation matter ([RLG-042](../fragments/RLG-042.md)).

<a id="v0-9-7"></a>
## [0.9.7] — 2026-08-28
- Added: **a TIME control in the garage** — DUSK, MIDNIGHT, DAWN, MIDDAY. It sets where the day
  cycle *starts*; the four minutes then run on as before, so dusk still becomes night. The four are
  the four phase points the cycle already named, so no new lighting was written
  ([RLG-051](../fragments/RLG-051.md)).
- Changed: **a run no longer inherits the sky from the last one.** `dayClock` was deliberately never
  reset so the light carried across runs. A setting the player picks that the game then ignores is
  not a setting, so the choice now wins ([RLG-051](../fragments/RLG-051.md)).
- Added: `API.phase()` on the fork seam, beside `wet`, `snowy`, `settle` and `biome` — and the only
  way to test the TIME control by its effect rather than by its label
  ([RLG-051](../fragments/RLG-051.md)).
- Added: `drive-test` asserts that the run starts at the time the garage was set to. With the
  feature disabled the label check still passed and this one failed, which is why it exists
  ([RLG-051](../fragments/RLG-051.md)).

<a id="v0-9-6"></a>
## [0.9.6] — 2026-08-28
- Changed: **the police cars are won in the tournament now, under pursuit.** A gold in a sports car
  with HOT PURSUIT on also unlocks the CRUISER; a gold in a supercar unlocks the SUPERCRUISER. The
  old TEST DRIVE triggers — 20 miles on the clock, and the same 20 at a 180mph average — are removed
  completely rather than kept alongside ([RLG-049](../fragments/RLG-049.md)).
- Fixed: **the trophy screen announced "FORMULA UNLOCKED" for every gold**, and its button offered a
  FORMULA, even for a sports gold that actually pays the iridescent paint. The prize is computed
  from the class now, and a gold with pursuit off is told what it missed
  ([RLG-049](../fragments/RLG-049.md)).
- Fixed: the CRUISER's unlock card still described the TEST DRIVE trigger that no longer exists, and
  the SUPERCRUISER's card described nothing at all ([RLG-049](../fragments/RLG-049.md)).
- Known: **the new unlock branch is not executed by any harness.** A tournament is four races of 10,
  12, 16 and 24 miles with no debug route to a finish, so this shipped on a static parse plus the
  standing regression suite. A debug jump to a tournament finish is tracked
  ([RLG-050](../fragments/RLG-050.md)).

<a id="v0-9-5"></a>
## [0.9.5] — 2026-08-28
- Fixed: **the rubber band's tow did nothing at all.** A rival held two miles behind ran 179.0mph
  with the band and 178.7mph without it. `want` was multiplied by the band and capped at `AI_TOP` on
  the very next line, and every rival's base pace already exceeds that cap, so the tow was discarded
  before it could take effect. The ceiling now rises with the tow and only with the tow: measured
  **+13.21%** of a claimed 14%, with the governor unchanged at −7.80%
  ([RLG-038](../fragments/RLG-038.md)).
- Changed: a rival at full tow may now reach 205mph, above the player's 200. It only saturates past
  1.27 miles of separation, which is off the back of the screen, so the player stays the quickest
  thing they can see ([RLG-038](../fragments/RLG-038.md)).
- Added: `tools/band-test.py`, which measures the band against a band-off control arm served from
  memory, pins each rival to a fixed gap, and seeds `Math.random` so both arms race the same grid.
  It found the fault and then proved the fix ([RLG-029](../fragments/RLG-029.md)).
- Known: the other four harnesses cannot be run as step evidence. On Windows `CreateProcess`
  resolves a relative executable against the calling process's directory, so nothing can reach the
  project `.venv` from the environment root. `band-test.py` finds its own interpreter; the rest do
  not ([RLG-039](../fragments/RLG-039.md)).

<a id="v0-9-4"></a>
## [0.9.4] — 2026-08-25
- Fixed: **things spawned inside the drawn road.** Traps and cruisers were placed as close as 26,000
  into a 30,000 draw, so they appeared out of nothing in front of the player — which is what a
  rendering pop looks like. Every spawner measures from the draw distance now; nearest spawn 35,000
  ([RLG-031](../fragments/RLG-031.md)).
- Changed: a merge is judged by every corridor window that will later judge it, not just the one
  centred on it — measurably better, **not yet a guarantee**
  ([RLG-037](../fragments/RLG-037.md)).
- Changed: `traffic-test` reports the horn's effect rather than asserting it. Whether a car is in
  front of you is stochastic, and a check that fails one run in three teaches people to ignore it
  ([RLG-035](../fragments/RLG-035.md)).

<a id="v0-9-3"></a>
## [0.9.3] — 2026-08-25
- Fixed: **the horn and siren had no effect on traffic**, from three separate faults — a lane INDEX
  compared against a road position, a car that agreed to move only having its lane LABEL changed, and
  a search that started at the camera rather than the car. The sound itself was always working
  ([RLG-035](../fragments/RLG-035.md)).
- Changed: **no horn and no siren on the circuit, control included.** A closed track has neither
  traffic nor police, and a button that is present but does nothing costs the player a lap of
  wondering what they are missing ([RLG-035](../fragments/RLG-035.md)).
- Known: scatter and the lane-open guarantee pull against each other; the corridor measurement varies
  between runs and goes under the limit in some ([RLG-037](../fragments/RLG-037.md)).

<a id="v0-9-2"></a>
## [0.9.2] — 2026-08-25
- Fixed: **the revs could pass the limiter, from three separate causes.** The slipstream scaled the
  GEAR ceiling as well as the aero one; `gearRpm` clamped to `redline() + 300`; and the engine note
  was computed against a slip-reduced divisor, so a tow raised the PITCH while the revs sat pinned
  ([RLG-034](../fragments/RLG-034.md)).
- Changed: a tow now quiets and dulls the **wind** — which was the original intent — and leaves the
  engine note alone ([RLG-034](../fragments/RLG-034.md)).
- Added: a limiter check in `drive-test.py` that puts the car ON the ceiling rather than driving
  toward it; three earlier versions passed with the bug present
  ([RLG-034](../fragments/RLG-034.md)).

<a id="v0-9-1"></a>
## [0.9.1] — 2026-08-25
- Fixed: **slowing down on the Motorsport circuit conjured civilian traffic behind you.**
  `CFG.circuitOnly` gates four of the five spawners; the fifth lives with the speed logic rather than
  with the others and was outside it ([RLG-036](../fragments/RLG-036.md)).
- Added: `tools/circuit-test.py` — no existing harness could catch this, because `drive-test` holds
  the throttle down and this only happens when you stop
  ([RLG-036](../fragments/RLG-036.md)).

<a id="v0-9-0"></a>
## [0.9.0] — 2026-08-25
- Added: **traffic goes round slower cars.** Civilians could only ever slow for what was ahead of
  them, so the road silted up into rolling walls. They now decide, commit to and carry out a lane
  change — checking a lateral position rather than a lane index, refusing to pull out unless the
  other lane is actually faster, and never taking the last gap through
  ([RLG-032](../fragments/RLG-032.md)).
- Added: a car indicates for the beat before it moves across
  ([RLG-032](../fragments/RLG-032.md)).

<a id="v0-8-1"></a>
## [0.8.1] — 2026-08-25
- Fixed: **traffic could still pile up into a wall.** The guarantee counted lane indices rather than
  occupied width, and bucketed by `round(z/1500)` — so a wall straddling a bucket boundary looked
  passable from both sides. It measures the real corridor in a sliding window now, and starts opening
  the road before it closes rather than after ([RLG-025](../fragments/RLG-025.md)).
- Added: `tightestAhead` reports the narrowest corridor seen, and `tools/traffic-test.py` asserts it
  never goes under a car width — measured 0.452 against a 0.34 limit
  ([RLG-025](../fragments/RLG-025.md)).

<a id="v0-8-0"></a>
## [0.8.0] — 2026-08-25
- Fixed: **a car partly hidden by a crest vanished entirely.** The partial-clip path existed but was
  unreachable, and it clipped the wrong half — in this projection a crest covers a car from the
  bottom up, so the visible band is ABOVE the silhouette ([RLG-021](../fragments/RLG-021.md)).
- Added: `spriteStats` counts drawn, clipped and culled per frame; `ROAD()` publishes its API as
  `window.__road`; `tools/occlusion-test.py` proves cars are hidden rather than missing
  ([RLG-021](../fragments/RLG-021.md)).

<a id="v0-7-5"></a>
## [0.7.5] — 2026-08-25
- Fixed: **cars popped to a different texture in the rearview.** The mirror switched from a drawn
  block to a painted sprite at exactly 26px wide, and every car crossed that line in the same place
  on screen. The sprite fades in across a band now ([RLG-020](../fragments/RLG-020.md)).

<a id="v0-7-4"></a>
## [0.7.4] — 2026-08-25
- Fixed: **racers drove through the player.** They collided with traffic, cruisers, roadblocks and
  each other, and never once looked at the player. It is a rub rather than a wreck, scaled by closing
  speed ([RLG-019](../fragments/RLG-019.md)).

<a id="v0-7-3"></a>
## [0.7.3] — 2026-08-25
- Changed: **the damage smoke and fire are smaller.** At high damage the plume filled the middle of
  the frame and hid the traffic you were about to hit ([RLG-018](../fragments/RLG-018.md)).

<a id="v0-7-2"></a>
## [0.7.2] — 2026-08-25
- Fixed: **snow followed you into the desert.** The biome's odds were used to START weather and never
  to end it, so a front kept falling for the rest of its own timer wherever the road went — and
  settled snow took a minute and a half to fade ([RLG-017](../fragments/RLG-017.md)).

<a id="v0-7-1"></a>
## [0.7.1] — 2026-08-25
- Changed: **Interstate's verge costs speed, not health.** The barrier took 9 health on a repeating
  cooldown, so sliding along a wall was as expensive as hitting a truck. It scrubs speed
  continuously instead ([RLG-016](../fragments/RLG-016.md)).

<a id="v0-7-0"></a>
## [0.7.0] — 2026-08-25
- Added: **Hardpoint's full sound pass.** Four held layers that follow the ship every frame — engine
  (pitch on speed, level on throttle), afterburn, hull air, and separate alarms for heat and hull.
  Every sound before this was a one-shot, so the ship had no engine
  ([RLG-015](../fragments/RLG-015.md)).
- Added: **the engine mechanic is audible.** Engines dark spins the engine down to silence and leaves
  the air louder than it was under power — measured 0.128 to 0.002, air 0.035 to 0.055
  ([RLG-015](../fragments/RLG-015.md)).
- Added: a three-tier bed — bridge, hunted (a heartbeat on the off-beat), and boarding — plus its own
  slower bed on the title ([RLG-015](../fragments/RLG-015.md)).
- Added: nine events that were silent — the hunter arriving, losing him, the hull breach, being
  repelled, dying, the relight, the airlock, and footsteps paced by distance walked
  ([RLG-015](../fragments/RLG-015.md)).
- Added: `tools/audio-test.py`, which reads the Web Audio graph because a sound test cannot listen
  ([RLG-015](../fragments/RLG-015.md)).

<a id="v0-6-0"></a>
## [0.6.0] — 2026-08-25
- Removed: **every controls screen.** These are touch games, and a page listing gestures describes
  what the interface already shows one tap away ([RLG-014](../fragments/RLG-014.md)).
- Changed: Quietus's emergency light is **bolted over the hatch and pulses** instead of swinging
  across the frame. Nothing else in that room moves, so a drifting light read as a floating
  rectangle. It is drawn as a fitting now — housing, lens, wire guard, brackets and a throw on the
  plating ([RLG-014](../fragments/RLG-014.md)).
- Added: `tools/menu-test.py`, which asserts every title has the same set and that OPTIONS returns
  to it ([RLG-014](../fragments/RLG-014.md)).

<a id="v0-5-1"></a>
## [0.5.1] — 2026-08-25
- Fixed: **Quietus drew its title as `IET`.** Its hand-painted blood alphabet was authored for
  DERELICT and had no Q, U or S, and an unknown character draws nothing and reports nothing. The
  three letters are drawn ([RLG-013](../fragments/RLG-013.md)).
- Added: `Arcade.wordmark` reports a missing glyph on the console, once per word, naming the
  characters — and `smoke-test.py` now fails a cabinet on console errors, so a machine that quietly
  fails to draw its own name is a failing gate ([RLG-013](../fragments/RLG-013.md)).

<a id="v0-5-0"></a>
## [0.5.0] — 2026-08-25
- Added: **Hardpoint's title is an animated chase** — two ships, the hunter firing on the runner,
  lit thrusters, three parallax star layers, a sun off frame and a planet turning under it. Drawn
  every frame, nothing downloaded ([RLG-012](../fragments/RLG-012.md)).
- Changed: the veil turns to glass while the title is up, so the scene is visible rather than painted
  and covered ([RLG-012](../fragments/RLG-012.md)).
- Added: `tools/scene-test.py`, which asserts the scene paints, runs on the title, and **stops** when
  another screen takes over ([RLG-012](../fragments/RLG-012.md)).

<a id="v0-4-1"></a>
## [0.4.1] — 2026-08-25
- Changed: the driving wordmark is a **marque lockup** — REDLINE small above, INTERSTATE or
  MOTORSPORT large beneath. Set as one line it read as a single long name and shrank the half that
  actually names the game ([RLG-011](../fragments/RLG-011.md)).
- Changed: **HARDPOINT is cut from hull plate** — brushed steel, panel seams with rivets, scuffs, a
  rim light and a warm engine bounce, clipped to the letters so the material runs across the whole
  word ([RLG-011](../fragments/RLG-011.md)).

<a id="v0-4-0"></a>
## [0.4.0] — 2026-08-25
- Changed: **every machine owns everything it stores.** The shell's options, the audio settings and
  the record of seen intros were shared between all four; they are now scoped per machine under
  `Arcade.scope`, read from a new `<meta name="arcade-id">` ([RLG-010](../fragments/RLG-010.md)).
- Fixed: the shell's options were keyed on a slug of the cabinet's **title**, so the rename orphaned
  them — and that shape was invisible to `Arcade.save.clear`, **so erasing a machine had been
  leaving its settings behind while reporting success** ([RLG-010](../fragments/RLG-010.md)).
- Added: the launcher seeds a cabinet's audio settings once, on first visit, and the cabinet writes
  them down and owns them from then on ([RLG-010](../fragments/RLG-010.md)).
- Added: `tools/isolation-test.py`, and the `saves()` check now covers all six stores
  ([RLG-010](../fragments/RLG-010.md)).

<a id="v0-3-1"></a>
## [0.3.1] — 2026-08-25
- Added: **Hardpoint has a proper title** — a drawn wordmark, the career read back as STANDING,
  CREDITS and BEST RUN, and a first button that says `BEGIN` or `CONTINUE` rather than a `PLAY` that
  opened a station screen ([RLG-009](../fragments/RLG-009.md)).
- Fixed: Hardpoint's QUIT hardcoded `../../index.html#em`, naming a shelf that no longer exists. It
  uses `Arcade.home()` like every other machine ([RLG-009](../fragments/RLG-009.md)).

<a id="v0-3-0"></a>
## [0.3.0] — 2026-08-25
- Added: **every machine can erase its own save from its own options**, behind a two-press confirm.
  The label reads `NO SAVED DATA` when there is nothing to erase
  ([RLG-008](../fragments/RLG-008.md)).
- Fixed: `road.js` hardcoded `HIGHWAY` on its Options and Debug screens — and it serves both driving
  games, so Motorsport had been showing the other game's name above its own options
  ([RLG-008](../fragments/RLG-008.md)).
- Added: `smoke-test.py` now drives the erase path on every machine — arm, confirm, and check the
  store after the reload ([RLG-008](../fragments/RLG-008.md)).

<a id="v0-2-1"></a>
## [0.2.1] — 2026-08-25
- Fixed: **erasing a machine did not erase it.** `Arcade.save.clear` removed the save slot only, so
  options, a machine's own stored keys, and the record of which intros it had shown all survived —
  and the call reported success. The launcher's ERASE left even more behind
  ([RLG-007](../fragments/RLG-007.md)).
- Added: `Arcade.save.has(id)` and `Arcade.save.clearAll()`, and a namespace rule in the shell that
  says what belongs to a machine ([RLG-007](../fragments/RLG-007.md)).
- Added: a `saves` check in `smoke-test.py`, run against the old implementation first to prove it
  is not vacuous ([RLG-007](../fragments/RLG-007.md)).

<a id="v0-2-0"></a>
## [0.2.0] — 2026-08-25
- Changed: **the four machines are renamed**, in one unit — Derelict to **Quietus**, Privateer to
  **Hardpoint**, Highway to **Redline Interstate**, Raceway to **Redline Motorsport**. Ids, file
  paths, the catalogue, the engine's default, the drive harness and the save keys all moved together
  ([RLG-006](../fragments/RLG-006.md)).
- Changed: the cache generation is v26. Every cabinet filename changed, so a worker holding the old
  list would ask the server for four files that no longer exist
  ([RLG-006](../fragments/RLG-006.md)).
- Removed: the `#em` / `#sw` shelf hash from each cabinet's `arcade-home`, which addressed a picker
  that no longer exists ([RLG-006](../fragments/RLG-006.md)).

<a id="v0-1-2"></a>
## [0.1.2] — 2026-08-25
- Added: the icon is built from the **Effigy Media symbol** in the arcade's palette, pixelated, and
  generated by a committed script rather than being a binary nobody can regenerate. All six slats
  come from one thickness and one gap, so an uneven slat is not possible
  ([RLG-003](../fragments/RLG-003.md)).
- Fixed: **the loading counter reported files checked, not files fetched**, so it climbed to 18/18
  on every visit and a returning player saw what looked like a full download each time. Measured
  before the fix: cold 26 requests, warm reload 8 ([RLG-003](../fragments/RLG-003.md)).
- Fixed: `fonts/LICENSES.md` was precached — a document no running game asks for. The generator now
  takes `.woff2` only ([RLG-003](../fragments/RLG-003.md)).
- Changed: the cache generation is v25. `icon.png` is a core file, so without the bump every
  returning visitor would have kept serving the old icon out of cache
  ([RLG-003](../fragments/RLG-003.md)).
- Changed: the manifest `name` is `EFFIGY ARCADE`, so every install surface agrees with the
  `apple-mobile-web-app-title` that iOS pre-fills on Add to Home Screen
  ([RLG-003](../fragments/RLG-003.md)).

<a id="v0-1-1"></a>
## [0.1.1] — 2026-08-25
- Changed: **mobile only.** Touch is the input; keyboard, mouse and gamepad are out of scope. Owner
  ruling, recorded with what it makes redundant and what it does not delete
  ([RLG-002](../fragments/RLG-002.md)).
- Documented: a game leaves this arcade by one of two routes — a binary wrapper around the web
  build, or a conversion to Godot. Under the Godot route this codebase is the playable design
  document rather than the shipping artifact, so web-only plumbing is not worth investing in
  ([RLG-002](../fragments/RLG-002.md)).

<a id="v0-1-0"></a>
## [0.1.0] — 2026-08-25
- Added: **Effigy Arcade** — Derelict, Privateer, Highway and Raceway on one floor, forked from Tiny
  Arcade at v0.9.11 ([RLG-001](../fragments/RLG-001.md)).
- Changed: the launcher opens straight onto the rack. The three-shelf picker is gone; the shelf
  mechanism is kept whole behind a single shelf whose id `all` matches every cabinet, so a fifth
  machine or a real second shelf is one entry away ([RLG-001](../fragments/RLG-001.md)).
- Removed: fifteen machines, and the fourteen fonts that belonged only to them — 324KB off the
  offline precache ([RLG-001](../fragments/RLG-001.md)).
- Fixed: the `every .md is accounted for` gate tested a file called `*.md` in a folder with no root
  document, because an unmatched glob stays literal in bash. Latent in the parent, which always had
  six documents at its root ([RLG-001](../fragments/RLG-001.md)).
- Fixed: the archive step assumed `zip` is on PATH, so a build passed every gate and then died on
  its last line. It falls back to PowerShell's `Compress-Archive`
  ([RLG-001](../fragments/RLG-001.md)).
