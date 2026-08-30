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

<a id="v0-9-97"></a>
## [0.9.97] - 2026-08-30
- Fixed: **a slope measured over half a pixel is not a slope.** The sea's fill carries its edge down
  to the bottom of the screen so the nearest slice ends on the shoreline's own angle rather than
  dropping vertically - and that angle came from the slice's own two ends. A slice at the far end of
  the draw is a third of a pixel tall, so dividing by its height turned a rounding error into a line
  across the frame, wherever a nearer slice then failed to paint over the tail. A slice must be
  taller than two pixels to have an angle worth reading ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **the audit's AUD-002 was four faults in the check and one in the game.** The check took
  the largest change in x between neighbouring rows, which is only meaningful while the edge is
  steeper than 45 degrees - a straight shoreline running shallow reported a 121 px "staircase". It
  compared across rows that do not touch, so an edge leaving the screen and returning read as a
  119 px kink. A second difference is large on a real bend. And a local line fit cannot tell a
  staircase from a CREST, where the brow legitimately hides the slices between two shorelines and
  the edge steps once. What a staircase is, without reference to angle, is an edge whose steps are
  mostly nothing and occasionally a jump - so the test is now outliers against the edge's OWN median
  step ([AUD-001](../fragments/AUD-001.md), [RLG-059](../fragments/RLG-059.md)).
- Changed: **the horizon check counts water rather than a fraction of the band.** How much of the
  strip is sea depends on where the shoreline crosses it: 23, 40, 45 and 67 per cent were all
  correct pictures ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-96"></a>
## [0.9.96] - 2026-08-30
- Fixed: **the driving HUD's readouts are anchored in the same space as its controls.** Owner: "fix
  the anchored relative spacing of UI elements", on the driving HUD. The shell publishes a UI scale
  that runs from 1 on a phone to 1.8 on a big screen, and its own note says a game opts in by scaling
  its overlay - this cabinet opted its CONTROLS in and left its READOUTS behind. At 1.8 the wheel,
  pedals, bottle and dials were half as big again while TIME and DISTANCE were the same 26px they are
  on a phone, stranded in corners 200 pixels further out. Nothing was resized: every number is what
  it was, times the scale everything beside it already used, so a phone is unchanged to the pixel
  ([RLG-082](../fragments/RLG-082.md)).
- Note: **the mirror clearance is deliberately NOT scaled.** The glass is drawn on the canvas at a
  fixed 44px and does not grow, so the row below it is measured against the glass rather than against
  the scale ([RLG-082](../fragments/RLG-082.md)).
- Added: **`hud-test.py` measures a readout at two viewports** and asserts it grew by the factor the
  scale did: 26.0px at scale 1 and 46.8px at 1.8, against 26.0 and 26.0 before
  ([RLG-082](../fragments/RLG-082.md)).

<a id="v0-9-95"></a>
## [0.9.95] - 2026-08-30
- Fixed: **a car with no bottle leaves no hole.** Owner: cars without NOS did not have the gauges
  collapse down to the pedals. Hiding the bottle left the space it stood in, so the shifter and the
  dials went on measuring their height from where a bottle would have been. The cluster stacks
  bottom-up and `--bottle` is how much room the bottle takes in that stack; setting it to zero closes
  the gap and nothing else has to know why. The dials come down 46.8 px, landing exactly where the
  bottle's own floor was ([RLG-028](../fragments/RLG-028.md)).
- Added: **`tools/hud-test.py` measures the cluster as boxes.** Whether the stack closed up is a
  question about `getBoundingClientRect`, not about pixels, and it does not care what the road behind
  it is doing ([RLG-028](../fragments/RLG-028.md)).

<a id="v0-9-94"></a>
## [0.9.94] - 2026-08-30
- Fixed: **the player collides at the width it is drawn at.** Owner: "We have to make the vehicle
  colliders true to their sprite size. It's hard to tell." The car was drawn at 0.265 of the road and
  struck at 0.26, in three separate hard-coded places - about two per cent narrower than it looks,
  which is exactly the gap between what you can see and what you can predict. One number now, and
  the tyre marks it lays follow it too ([RLG-058](../fragments/RLG-058.md)).
- Added: **`tools/collide-test.py` measures where the hit actually happens.** It parks a car on the
  real traffic array, walks the player out sideways, and binary-searches the offset at which the hit
  stops firing. Two cars of different widths separate the sum into its parts, so the player's own
  half-width is MEASURED rather than read back: 0.2648 against a drawn 0.2650. With the old constant
  restored it measures 0.2597 and fails ([RLG-058](../fragments/RLG-058.md)).
- Note: **per-car widths and length are not in this.** Every player car is still drawn at one width,
  so a lorry and a roadster are the same in your hands - that is twenty-six numbers in the fleet
  table and the owner's to rule on. And a billboard sprite has no depth, so "true to the sprite"
  cannot be read literally for length ([RLG-058](../fragments/RLG-058.md),
  [RLG-055](../fragments/RLG-055.md)).

<a id="v0-9-93"></a>
## [0.9.93] - 2026-08-30
- Fixed: **the packer regenerates before it verifies.** `assets.js` is generated and takes its
  version from `sw.js`, so in a build the two agree by construction the moment the generator has run
  - but the agreement check ran BEFORE it, so bumping `sw.js` failed the very build that would have
  fixed it, and `assets.js` was seeded by hand once to get past it. The check is not weakened, which
  matters: the drift it catches is what shipped eighteen 404s behind a green build. What changed is
  when it runs ([RLG-004](../fragments/RLG-004.md)).
- Changed: **one definition of what agreement means, two callers.** `--check` has nothing to
  regenerate, so it compares the files as they are; a build compares what it just wrote
  ([RLG-004](../fragments/RLG-004.md)).

<a id="v0-9-92"></a>
## [0.9.92] - 2026-08-30
- Fixed: **the cars behind you have their headlights on after dark.** Every front sprite declared a
  `head` lamp and nothing in the game ever asked for one, so the mirror showed a road of cars driving
  at midnight with their lights off. The declaration was there; the wiring was not, which is the half
  of RLG-053 the rears finished and the fronts never did. Same clock as the street lamps
  ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **a front lamp declared its own glow, so three of them baked one into the UNLIT sprite** - a
  parked car with a lit headlight. Every rear declares its LENS and lets the sprite builder blur the
  lit drawing into a halo behind it; the fronts do the same now. Measured: front headlights spilled
  860 to 1,983 lit pixels outside their own bulb, and 178 lamps across 59 sprites now stay inside
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **`lamp-test.py` checks both faces of every car**, where it only ever checked the back. 29
  fronts, the formula class excepted by the same ruling that excuses it from indicators - a
  single-seater runs in daylight on a closed circuit and has never had headlights
  ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-91"></a>
## [0.9.91] - 2026-08-30
- Fixed: **every harness finds its own root, so any of them can be run as evidence.** Seven served
  the folder from `.` and imported from `tools`, which only works from the project directory - and
  `step.py` runs a command with the environment's root as its working directory. So each one 404'd or
  raised there and recorded a FALSE FAILURE, twice in one session before it was worth fixing
  ([RLG-039](../fragments/RLG-039.md)).
- Fixed: **`scene-test.py` waited thirty seconds for a screen that must never exist.** It clicked
  CONTROLS to check the attract animation stops when a menu takes over, and this project ruled a
  controls page out of existence - `menu-test.py` asserts its absence. It uses OPTIONS, which every
  title has ([RLG-039](../fragments/RLG-039.md), [RLG-002](../fragments/RLG-002.md)).
- Fixed: **`scene-test.py` needed its output directory as an argument**, so running it the way every
  other harness is run raised before it opened a browser ([RLG-039](../fragments/RLG-039.md)).

<a id="v0-9-90"></a>
## [0.9.90] - 2026-08-30
- Fixed: **the title card wears the car's own tail lights.** Owner: the title menu shows the wrong
  tail lights, and it may be that the title is not using the right renderer. It was using the right
  renderer and then painting over it - two red rectangles at hand-written coordinates and a halo at
  two more, on a sprite that already knew where its lamps were and what they look like. The lamps run
  from the same declaration the road uses, inside the same transform the car is drawn in, so they
  lean with it and a reskin moves both ([RLG-077](../fragments/RLG-077.md)).
- Changed: **the lamp declaration can paint onto any canvas.** It painted into the road's own context
  and had no way to be told otherwise, which is why the title grew its own rectangles in the first
  place. One argument, and every surface that draws a car can light it the same way
  ([RLG-077](../fragments/RLG-077.md), [RLG-053](../fragments/RLG-053.md)).
- Added: **`tools/title-test.py` strips the declaration and looks again.** If the lamps come from the
  declaration they go out; if the title paints its own, nothing changes - which is what the old code
  did. Measured: 550 red pixels lit, 0 stripped; with the rectangles put back, 1,253 stripped against
  1,331 lit ([RLG-077](../fragments/RLG-077.md)).

<a id="v0-9-89"></a>
## [0.9.89] - 2026-08-30
- Fixed: **the pattern is centred in the plate.** Owner: "The 4-speed needs to be centered in its
  housing." It was not, and neither was the six-speed - the rails began at 13 and the plate ran on
  past the last one. The knob was 4px out as well, which is the same fault from the other side. One
  number does both: a rail centred under its knob starts 9px right of it, and the cross rail then
  ends the same distance from each edge on every plate ([RLG-069](../fragments/RLG-069.md)).
- Fixed: **a five-speed shows five positions.** Owner: "We need to make sure that the 5-speed only
  shows the 5 positions." It showed six with the sixth reading neutral, which is a gearbox fact
  dressed up as a picture. Its third rail stops at the cross rail, and the knob will not go down it
  ([RLG-069](../fragments/RLG-069.md)).
- Added: **a black knob for the production and utility cars.** Owner: "I also want production and
  utility vehicles to have a black leather or plastic shifter with white text on it." The saloon, the
  cab, the coupe, the pickup, the van and the lorry get a moulded black one with the number in white;
  the sports, super and formula classes keep the polished ball. The police cars are NOT in it, which
  is a decision rather than an oversight - a cruiser is a production saloon underneath, but this game
  treats the police as a class of their own ([RLG-069](../fragments/RLG-069.md)).

<a id="v0-9-88"></a>
## [0.9.88] - 2026-08-30
- Fixed: **muting a bus mutes its reverb.** Owner: "if I was to mute the music, the reverb bus still
  plays so we want to make sure muting the music also mutes that bus." There was one convolver and
  its return went straight to master, so a voice was connected twice and only the dry copy rode the
  mute - the music went quiet and its tail kept ringing. Each bus has its own reverb now, returning
  into the bus, so a tail rides the same gain its dry copy rides
  ([RLG-078](../fragments/RLG-078.md)).
- Changed: **the reverbs are built on demand.** A convolution is not free and no bus needs one until
  a voice sends to it. Measured in play: two get built, music and effects
  ([RLG-078](../fragments/RLG-078.md)).
- Added: **`tools/verb-test.py` listens rather than reads.** A routing fault changes no gain
  anywhere, so there is no value on the graph that could be wrong - the only thing that answers it is
  the signal. It taps the output through a new `Arcade.audio.tap()` and measures the tail. Falsified
  by putting the shared return back: a muted bus then leaves its tail at 88% of full
  ([RLG-078](../fragments/RLG-078.md)).

<a id="v0-9-87"></a>
## [0.9.87] - 2026-08-30
- Fixed: **the gate is the gears the car has.** A four-speed could be dragged onto a third rail it
  has no gears for, because the knob's travel was clamped to the length of the rail table rather than
  to the car - and `gearFactor` returns zero past the end of the ratio table, so the car stopped
  pulling in a gear it does not have. Two rails for a four-speed, three above it, and the knob cannot
  leave them ([RLG-069](../fragments/RLG-069.md)).
- Fixed: **a five-speed no longer engages a sixth.** The slot below fifth is where reverse lives in a
  road car and this game has no reverse, so it reads NEUTRAL rather than a gear the engine does not
  have ([RLG-069](../fragments/RLG-069.md)).
- Fixed: **a five-speed's plate was wider than a six-speed's**, which is the one thing it cannot be.
  Three hand-set widths that followed from nothing - 86, 92 and 74 - are now the last rail's knob
  position plus the padding it has on the left, so the plate is the gate it holds. On a phone the
  size of a control is the control ([RLG-069](../fragments/RLG-069.md)).
- Fixed: **the knob came back inside the gate when the car changed.** Leaving a six-speed in sixth
  and taking out a four-speed left it standing on a rail that car does not have
  ([RLG-069](../fragments/RLG-069.md)).
- Added: **`tools/gate-test.py` walks the gate with the game's own `shiftStep`**, and
  **`tools/gate-shot.py`** photographs the plate for a car of each gear count. Both run in a TOUCH
  context: the shell hides the whole thumb cluster on a device that reports no touch, so a desktop
  harness measures a plate zero pixels wide and reports success
  ([RLG-069](../fragments/RLG-069.md)).

<a id="v0-9-86"></a>
## [0.9.86] - 2026-08-30
- Fixed: **the shoreline is a line, not a staircase.** The sea was filled as a rectangle at the near
  shore for the whole height of a slice, so the coast came out as a hard step per segment beside a
  road drawn as a smooth quad - the most visible thing about the coast in every capture taken. The
  water's edge is a quad now, from the far shore to the near one, out of the same numbers
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **a pale hairline every eight pixels, all the way out to sea.** Each slice paints the ground
  full width and paints its water back over it, so the top row of every fill was antialiased against
  sand rather than against the water already there. Each fill starts a pixel higher, which puts that
  row under the fill in front of it ([RLG-059](../fragments/RLG-059.md)).
- Added: **`coast-test.py` measures the edge row by row.** A line moves by its slope every row; a
  staircase does not move for the height of a slice and then jumps by the slope times that height.
  Measured: largest step 4-5 px against a mean of 2-3, where the rectangle gave 11, 12 and 63
  ([RLG-059](../fragments/RLG-059.md)).
- Added: **`fps-test.py` covers the two new places.** The coast reads 60.4 fps across three samples,
  the ceiling, so the quad costs nothing measurable. Swamp is 57.2 to 60.4 and forest is still the
  heaviest at 47.2 to 48.8 ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-85"></a>
## [0.9.85] - 2026-08-30
- Changed: **the sea reaches the horizon.** Owner: "maintaining the ocean sided render into the
  background up to the horizon?" The road is drawn for a fixed number of segments and stops short of
  the skyline; the band above it is the far field, which was land. So a coast faded into sand at the
  horizon and a limit of the renderer showed through as a fact about the world. The band takes the
  water now, on the same side, behind the same shoreline, in the windscreen and in the mirror
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **the horizon's shoreline is a value, not a trend.** The first version read the shore at two
  depths and carried the line between them upward, which needed the nearer slice to sit lower on the
  screen - not true on a road that climbs, so the band was skipped about a third of the time. At
  infinite distance the shore arrives where the road does, which is exact and costs nothing
  ([RLG-059](../fragments/RLG-059.md)).
- Added: **`tools/coast-test.py` measures the strip the road never paints.** Sampling wider passed
  two runs in three with the feature removed, because below that strip the road paints its own sea.
  The engine now reports where the road pass stopped, and the check reads only above it
  ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-84"></a>
## [0.9.84] - 2026-08-30
- Fixed: **nothing stands in the sea.** Owner: "we need to make sure that scenery objects aren't
  generated in the side with the ocean." The roadside pass placed from one spec on both sides,
  because until the coast arrived no place had a reason to differ left from right - so palms and
  rocks stood in the water on whichever side the coast had rolled onto. The side the water is on is
  skipped, using the segment's own biome rather than the car's, so the shore empties where the ground
  colour changes ([RLG-059](../fragments/RLG-059.md)).
- Added: **palms and beach houses on the landward side.** Owner: "we might want random palm trees and
  beach houses on the opposing side." Four palms, two rocks and two houses, picked flat from the
  placement hash, so a shoreline has more trees on it than buildings. One house stands on piles with
  a deck, the other is low and long on the sand ([RLG-059](../fragments/RLG-059.md)).
- Added: **a beach house lights up at night**, on the same clock as the city's windows and the street
  lamps, with a light left on over the door. A house with dark windows in a place where everything
  else has lit up reads as abandoned. The spec now carries its own `buildLit` beside `build`, the
  same shape the lamps on the cars use - the thing that knows how an object is drawn is the thing
  that says where its light comes out ([RLG-059](../fragments/RLG-059.md)).
- Changed: **a palm has a crown.** Seen beside the houses at close range the first one read as a few
  leaves on a telephone pole. Longer fronds, nine of them, drooping at the tips
  ([RLG-059](../fragments/RLG-059.md)).
- Added: **the water is behind you as well.** The mirror's ground is one flat fill, so the glass
  showed a coast with no coast in it. Same shoreline, same side, same tone as the windscreen
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **the BUILD row has been saying MIXED since 0.9.56.** `road.js` stamps the version it was
  written for so a device can tell a fresh shell from a cached engine, and that stamp had not moved
  in twenty-seven versions - so the one diagnostic for a half-stale install cried wolf on every
  install ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-83"></a>
## [0.9.83] - 2026-08-30
- Changed: **the sea runs alongside the road, on one side, with beach between.** Owner: "I was kind
  of wanting the ocean to be either on the left side or right side (randomly rolled each time the
  biome is generated) of the road, with some beach between it and the road." The first version put it
  across the whole horizon, which reads as a road running INTO the sea rather than along it. The
  shoreline is a fixed distance out from the tarmac in the same units the roadside uses, so it
  converges with the road and rides the crests ([RLG-059](../fragments/RLG-059.md)).
- Added: **the side is rolled when the place is generated**, not when it is drawn - a value rolled
  per frame would put the water on alternating sides sixty times a second. Measured over 40
  placements: 17 left, 23 right ([RLG-059](../fragments/RLG-059.md)).
- Changed: **swamp and coast are the flattest of all.** Owner: "swamp and beach are the flattest of
  all biomes I suspect." They are, and for a reason a player feels without being told - both are
  places at sea level, where a city is graded flat by people and still runs over whatever hills were
  there. 0.15 and 0.18 against the city's 0.30, and still never zero
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **a test hook took a different path from the game.** `startBiomeChange` set the biome pair
  directly and never rolled the sea's side, so the check for "the side is rolled" came back 40 out of
  40 on one side while the game was rolling it correctly. One function rolls it now and both callers
  use it ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-82"></a>
## [0.9.82] - 2026-08-30
- Added: **two more places, an OCEAN coast and a SWAMP.** Seven biomes now. They are a table entry
  and some art, which is the point of the last two days: the ground at every hour, the weather odds,
  the taper a place imposes on weather arriving from elsewhere, the skyline, the roadside scenery and
  how much the road climbs and turns all read from that one record. Neither needed a new branch
  anywhere to be accepted ([RLG-059](../fragments/RLG-059.md)).
- Added: **an ocean has sea under its horizon.** Without it a coast is just a beach - pale sand
  either side, palms, no water anywhere. `farGround` is what the land BECOMES at the far end of the
  draw, and it goes through the same hour, weather and haze the land does. Every other biome leaves
  it out and the band stays the ground's own colour ([RLG-059](../fragments/RLG-059.md)).
- OCEAN rains 0.34 and never snows, nearly flat but winding along the water - the only place besides
  forest that bends more than it climbs. SWAMP is the wettest on the board at 0.62, the same figure
  tundra snows at, and turns a lot because a road through standing water goes round what it cannot
  cross ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-81"></a>
## [0.9.81] - 2026-08-30
- Added: **the biome shapes the road - how much it climbs and how much it turns.** Owner: "the biome
  should probably also drive the magnitude of the road's vertical curvature - mountains on one
  extreme and desert > city on the other. Never completely flat but much less so", and "the
  verticality and bendiness of the road is also dictated by the biome." Each segment is scaled as it
  is GENERATED, by the biome at the place that segment will be - not at draw, because a bend that
  changed magnitude as you approached it would be the road moving under you
  ([RLG-059](../fragments/RLG-059.md)).
- Mountain is 1.00 on both, so **the road as it has always been IS the mountain road** and everywhere
  else is calmer. Nothing gets steeper or tighter than the renderer has always handled, which matters
  because the corner cap is a renderer limit rather than a taste one. City is 0.30, never 0
  ([RLG-059](../fragments/RLG-059.md)).
- Measured over 4,000 generated segments each: mountain turns 2.42 and climbs 2.16; city turns 0.69
  and climbs 0.67. A short drive could NOT show this - the roll's own variance is larger than the
  difference between two biomes, and a desert out-bent a mountain in one ten-segment sample. The
  chevron boards count for the corner as scaled, so a calmed city bend is not signed as the hairpin
  it was rolled as ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-80"></a>
## [0.9.80] - 2026-08-30
- Changed: **the place you are entering decides how fast its weather ends.** Owner: "the speed of the
  taper should be dictated by the new biome... a snowy forest transitioning to tundra should more
  than likely not even taper off at all, a snowy forest transitioning to city could have a chance of
  tapering it off at a normal rate, and a snowy forest transitioning to desert should quickly taper
  off." The engine asked only whether the destination could produce the weather AT ALL, so a tundra
  and a city were treated identically and a desert like both - snow carried into a tundra only by
  accident of the test rather than because the place wants it
  ([RLG-022](../fragments/RLG-022.md)).
- Measured, snow leaving a forest: into TUNDRA support 0.62 and **no taper at all**; into CITY
  support 0.10 and the ordinary crossing; into DESERT support 0.00 and gone over a third of it -
  quick, but still a taper rather than the snap it used to be. Settled snow melts only in the last
  case: a city that snows one time in ten does not melt what is already lying
  ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-79"></a>
## [0.9.79] - 2026-08-30
- Fixed: **a run starts in one place, with that place's weather.** Owner: "my first test run started
  with a raining desert." `biomeNext` began at 0, so the biome timer fired on the very first frame -
  and the guard for "first call" tested whether that frame had been longer than a SECOND. A real
  first frame is about sixteen milliseconds, so it took the CHANGE branch instead: the car started in
  the declared default of FOREST with a transition placed at the horizon, and the weather rolled
  against FOREST, which rains 42% of the time. Seconds later the car drove into whatever had been
  placed ahead ([RLG-022](../fragments/RLG-022.md)).
- Added: **a check read before anything else touches the state** - that a run does not begin part-way
  through a biome change, and that whatever is falling is weather the starting place can produce. It
  was watched failing on the old code, reproducing the report exactly: started in FOREST, changing to
  TUNDRA ([RLG-022](../fragments/RLG-022.md)).

<a id="v0-9-78"></a>
## [0.9.78] - 2026-08-30
- Fixed: **headlight beams follow the clock, not the weather.** Owner: "my headlights were on midday.
  The headlights need to follow the time of day like all other lights. It might have been because it
  was raining." It was. `lampsOn()` treats weather as night by the owner's own earlier ruling, so a
  shower at noon switched the beams on. Both rulings stand and they are about different things: a
  LAMP comes on in rain, and a BEAM is the light you can see lying on the road, which is invisible in
  daylight however wet it is. The lamps keep `lampsOn()`; the beam takes the day cycle alone
  ([RLG-060](../fragments/RLG-060.md)).
- Added: **a check that keeps the two apart.** Measured in heavy rain: at midday the lamps read 1.00
  and the beam 0.00; at midnight both read 1.00 ([RLG-060](../fragments/RLG-060.md)).

<a id="v0-9-77"></a>
## [0.9.77] - 2026-08-30
- Fixed: **the road widens and the cars do not.** Owner: "the road was supposed to get wider while
  everything else stayed the same size... I want the cars to be the same size they used to be just
  the road widening so cars at their original dimensions fit in the lanes better." Every vehicle's
  width was a fraction of `ROAD`, so widening grew every car by the same fifth and nothing fit any
  better. Widths read against `CAR_UNIT` now - the road half-width as it was before the widening -
  while POSITIONS still use `ROAD`, because a car's lateral place is a lane
  ([RLG-024](../fragments/RLG-024.md)).
- Fixed: **the collision widths went with them.** Left in road units while the sprites shrank, a car
  would have collided wider than it looked - you clip something you can see you have missed, which is
  worse than the fault being fixed and invisible to any check that does not drive into something on
  purpose ([RLG-024](../fragments/RLG-024.md)).
- Added: **a check that the car does not grow with the road.** Measured: the player is 230.17 pixels
  wide at ROAD 1900, 2300 and 3000, while the road edge goes 31.9, 38.6, 50.4
  ([RLG-024](../fragments/RLG-024.md)).

<a id="v0-9-76"></a>
## [0.9.76] - 2026-08-30
- Changed: **the road is a fifth wider, and the lanes with it.** `ROAD` goes from 1900 to 2300. The
  lanes come for nothing because `LANE_X` is normalised, and everything that moves sideways is
  already written in lane units. Chosen by capturing 1900, 2300 and 2700 and comparing: at 2700 the
  near tarmac swallows the frame, the car looks small on it and the verge is pushed out of the near
  view ([RLG-024](../fragments/RLG-024.md)).
- Fixed: **a roadside sign is roadside, not road.** It stood at 1.34 road widths from the centre and
  was sized by the road's width, so widening would have walked the chevron boards away from the kerb
  and grown them. A sign is the size of a car door whatever the carriageway behind it is doing
  ([RLG-024](../fragments/RLG-024.md)).
- Fixed: **the signs had no occlusion either.** Their guard was `overBrow`, the same dead call the
  lamps were found behind - it returns false on its first line. They go through the cars' crest gate
  now, like everything else beside the road ([RLG-073](../fragments/RLG-073.md)).

<a id="v0-9-75"></a>
## [0.9.75] - 2026-08-30
- Added: **the mirror shows the skyline and the roadside behind you.** The same sprites, from the
  same cache, placed by the same hash of the same world segment index - so a tree you have just
  driven past is in the glass at the size and place it was. It shows `biomeFrom`, because behind you
  is where you have been: during a crossing the windscreen shows the place arriving and the glass
  shows the place leaving ([RLG-079](../fragments/RLG-079.md)).
- Added: **nothing looms in a pane 44 pixels tall.** The sizes are proportionally right, but the
  windscreen is 900 pixels and the mirror is 44, so the nearest trees buried the road and the cars on
  it - the one thing the mirror is for. Anything over a fifth of the glass is left out
  ([RLG-079](../fragments/RLG-079.md)).
- Added: **`tools/fps-test.py`, which reports its SPREAD.** On one unchanged build a forest measured
  54.5, 60.2 and 57.0 fps in three consecutive runs, and over more samples 48.0 to 60.4. Two rounds
  of scenery tuning had already been done against single readings inside that spread. A change is
  only real if two ranges do not overlap ([RLG-059](../fragments/RLG-059.md)).
- Corrected: **the frame-rate claim in v0.9.71 was noise.** "Mountain measured 54.5 fps against 60
  everywhere else" is a single reading inside a 12-fps spread and it did not support the conclusion
  drawn from it. The mountain row count stays at three because it still reads as a valley, which was
  confirmed by looking - not because of the number ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-74"></a>
## [0.9.74] - 2026-08-30
- Fixed: **the roadside takes the hour's light, not only the horizon.** The scenery sprites baked
  fixed colours, so a tree was a daylight tree at midnight while the skyline behind it had gone dark.
  Same treatment as the skyline: the tint is mixed in at build time and the cache is keyed by the
  hour bucket, so nothing passes over the frame ([RLG-080](../fragments/RLG-080.md)).
- Fixed: **the night colour has to be DARKER than what it lights.** `source-atop` is a mix toward the
  colour given, so the colour decides the direction - anything darker than the target gets brighter.
  The first version used a mid blue-grey and a forest tree went from 45.6 by day to 63.5 at night:
  the night tint was lighting the trees up. A picture would not have shown it either, because against
  a near-black sky a slightly brighter tree still reads as dark
  ([RLG-080](../fragments/RLG-080.md)).
- Added: **a check that the roadside darkens after dark**, and `API.setPhase` so it can ask the
  question in a second rather than waiting out a four-minute day. Measured: rock 74.3 to 44.1, forest
  45.6 to 33.0, skyline 68.9 to 25.8 ([RLG-080](../fragments/RLG-080.md)).

<a id="v0-9-73"></a>
## [0.9.73] - 2026-08-30
- Added: **the player's headlights beam down the road at night.** The cone is walked in WORLD space
  and its edges projected like anything else, so it follows the bend, rides the crests and narrows
  over a brow exactly as the tarmac does - a fixed triangle on the glass would sit dead straight
  while the road bent away underneath it. It is a bounded shape clipped to the ground plane, not an
  overlay: it cannot touch the sky and it does not light the player's own paintwork
  ([RLG-060](../fragments/RLG-060.md)).
- Added: **a hot pool just ahead of the bumper.** Two cones alone read as searchlights, because the
  gradient runs down the road rather than across it and they are therefore brightest where they are
  widest. A dipped beam puts most of its light in a short pool at the front of the car, and that pool
  is what makes the light read as coming from the car rather than from the camera
  ([RLG-060](../fragments/RLG-060.md)).
- Note: **the comfort option does not apply and that is deliberate.** RLG-060's setting exists for
  the lightning FLASH, which is a photosensitivity hazard. A headlight beam is steady light with no
  transient. If oncoming traffic is ever added to the forward view its beams point at the camera and
  that judgement has to be made again ([RLG-060](../fragments/RLG-060.md)).

<a id="v0-9-72"></a>
## [0.9.72] - 2026-08-30
- Added: **the skylines have depth.** Three bands are painted back to front into one strip, the far
  one small and pale and the near one large and dark, each mixed toward the sky AT THE HORIZON by its
  own amount. A ridge behind a ridge in the same colour is a wall, not a range
  ([RLG-080](../fragments/RLG-080.md)).
- Added: **every shape has an inside.** Towers get setbacks and masts, peaks a snow line and a
  sunward shoulder, mesas a talus skirt, treelines holes in them. Each is the thing that says what
  kind of object it is from a mile away, rather than detail for its own sake
  ([RLG-080](../fragments/RLG-080.md)).
- Added: **the silhouettes take the hour's own light.** A tint pass was tried before and removed
  because `source-atop` washed the sky as well as the buildings - the sky is opaque, so painting over
  every opaque pixel paints the sky. The colours are mixed in at BUILD time from the same `skyStops`
  the windscreen uses, so nothing passes over the frame at all
  ([RLG-080](../fragments/RLG-080.md)).
- Fixed: **the skyline cache is keyed by the hour as well as the biome.** A cached sprite is now a
  sprite of one hour, so without the bucket it would hold the colour of whatever moment it was first
  drawn at, through dusk and midnight - which would have looked like the tint not working rather than
  like a stale cache. One entry per biome, replaced when the bucket moves: keeping all forty would be
  180MB of canvas for a horizon ([RLG-080](../fragments/RLG-080.md)).

<a id="v0-9-71"></a>
## [0.9.71] - 2026-08-30
- Fixed: **a thick biome fills from the road edge out past the side of the screen.** One object per
  segment per side is a hedge - a single row at one distance - which is why the first version read as
  a band near the horizon with nothing close. Forest, mountain and tundra now walk several rows
  outward from the tarmac edge to beyond the frame, drawn outside in so a near trunk stands in front
  of what is behind it. The sparse places keep one row, because sparseness is the point of them
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **an object's inner edge sits at its placement point**, so a tree at the kerb stands beside
  the tarmac rather than half over it ([RLG-059](../fragments/RLG-059.md)).
- Changed: **the mountain rows were cut from four to three**, and the row density with them. Filling
  cost frames where the objects are largest: measured 54.5 fps against 60 everywhere else, on a
  desktop, which is a warning rather than a verdict for a phone. At three rows it is 60 and it still
  reads as a valley ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-70"></a>
## [0.9.70] - 2026-08-30
- Added: **mountain draws rock faces in three layers, and the road cuts through them.** "Various
  layers" was the one thing the owner described structurally rather than by subject, so there are
  three bands at three distances out, each paler and taller than the one in front, with slopes that
  lean OUT of the frame rather than standing square to it. The layer rises with how far out the rock
  stands, because the palette is what makes depth read ([RLG-059](../fragments/RLG-059.md)).
- Added: **tundra is mountain, painted white** - the same shapes with a different palette rather than
  a sixth set of art, which is what makes the two places read as one landscape under different
  weather. Its skyline is pale now too: against white cliffs and snow-covered ground the near-black
  silhouette read as a hole cut in the picture ([RLG-059](../fragments/RLG-059.md)).
- Note: **every other skyline is still one flat near-black at one depth**, and beside the new rock it
  now looks it. That is [RLG-080](../fragments/RLG-080.md), which the owner has already asked for and
  which follows this.

<a id="v0-9-69"></a>
## [0.9.69] - 2026-08-29
- Changed: **the roadside is measured from the road EDGE, in its own unit, so widening the road
  cannot move it.** Everything beside the road was written in multiples of `ROAD` - the lamps at 1.15
  of it, the trees at 1.35 - so the coming wider road would have pushed the whole roadside outward
  and grown it, thinning the forest at exactly the moment the tarmac got closer to it. Measured: with
  `ROAD` at 1900, 2600 and 3400 the road edge moves 31.9, 43.6, 57.1 pixels while the lamp and tree
  gaps hold at 41.5 and 54.2 ([RLG-024](../fragments/RLG-024.md), [RLG-059](../fragments/RLG-059.md)).
- Changed: **`ROAD` is a tunable rather than a constant.** RLG-024 is going to change it, the lanes
  are normalised fractions of it and so widen with it automatically, and making it settable turns
  that change into a runtime experiment instead of a rebuild - which is also what makes the
  independence above measurable at all ([RLG-024](../fragments/RLG-024.md)).

<a id="v0-9-68"></a>
## [0.9.68] - 2026-08-29
- Added: **the city has buildings, and their windows light up at night.** Four heights with setbacks
  on the taller ones, a window grid that reads as texture by day, and a second sheet carrying only
  the glass, drawn over the top with an alpha that follows the same clock the street lamps use. The
  two sheets come from one description of where the windows are, so a lit window cannot drift away
  from the hole it shines out of ([RLG-059](../fragments/RLG-059.md)).
- Changed: **the street lamps are city scenery, and nowhere else has them.** They were drawn on every
  eighth segment of everywhere, so a desert at midnight was lit by street lighting. The segment's
  biome decides, so the lighting ends where the city ends rather than under the car
  ([RLG-059](../fragments/RLG-059.md)).
- Consequence, stated because nobody asked for it in those words: **four biomes are now dark at
  night.** A forest at midnight has no light in it but the moon. That follows from the ruling rather
  than being a separate decision, and it is the kind of thing to look at rather than read about
  ([RLG-059](../fragments/RLG-059.md)).

<a id="v0-9-67"></a>
## [0.9.67] - 2026-08-29
- Added: **roadside scenery, per biome, drawn toward the camera like the lamps.** FOREST puts thick
  conifer on both sides; DESERT puts a sparse scatter of saguaro, and its emptiness is what makes the
  other places read as full. CITY, MOUNTAIN and TUNDRA declare nothing yet and so draw nothing, with
  no branch anywhere to say so ([RLG-059](../fragments/RLG-059.md)).
- Added: **placement is a hash of the segment index, not a random number.** The segment index IS the
  world position, so hashing it puts an object somewhere and leaves it there for as long as that
  segment exists, without storing anything. `Math.random()` per frame would reshuffle the whole
  roadside every frame and the forest would boil ([RLG-059](../fragments/RLG-059.md)).
- Added: **the scenery goes through the cars' crest gate**, which is the whole of RLG-073 - a tree
  behind a hill is hidden and one coming over a brow is cut off at the silhouette. Measured over
  three roads: 5,763 clipped of 386,607 asked ([RLG-073](../fragments/RLG-073.md)).
- Added: **an object belongs to its segment's biome, not to the car's**, so a transition changes the
  roadside at the same place on the road where it changes the ground rather than switching under you
  ([RLG-022](../fragments/RLG-022.md)).

<a id="v0-9-66"></a>
## [0.9.66] - 2026-08-29
- Fixed: **the mirror is framed like a mirror, and the eye height was never the fault.** It was
  raised three times from written descriptions - 1.55x, 2.15x, 3.00x - and reported still wrong after
  every one. The horizon sat at 0.16 of the glass, near the TOP, so 84% of the pane was road surface
  and the view read as looking DOWN at the tarmac. No eye height fixes that, because the eye only
  decides how fast the road falls away below that line: raising it three times made it worse each
  time. The horizon is at 0.45 now and the eye came back down to 2.20x
  ([RLG-079](../fragments/RLG-079.md)).
- Added: **`tools/mirror-shot.py`** - it renders the mirror pane on its own, enlarged, at any eye
  height, horizon, weather and hour. One look at it settled in seconds what three rounds of reasoning
  from the projection had got backwards. It asserts nothing; it is an instrument, not a gate
  ([RLG-079](../fragments/RLG-079.md)).

<a id="v0-9-65"></a>
## [0.9.65] - 2026-08-29
- Fixed: **the mirror shows the world it is in.** It never had. The sky was two fixed blues, the
  ground one fixed near-black and the tarmac two more, so the glass read as dusk in a forest at every
  hour, in every biome, in every weather - snow could cover the world and the mirror stayed dry. It
  asks the same `skyStops`, `groundBase` and `groundTone` the windscreen asks, each with one
  definition and two callers ([RLG-079](../fragments/RLG-079.md)).
- Added: **the mirror looks at the place behind you.** Its ground reads the segment index at the far
  end of what it can see, which is BEHIND the car - so during a biome change the glass still shows the
  place you are leaving while the windscreen shows the one you are entering. That falls out of asking
  the right index rather than being arranged, which is the point of the biome living on the road
  ([RLG-022](../fragments/RLG-022.md)).
- Added: **the road behind takes the same weather as the road ahead** - snow whitens it and covers the
  markings, rain soaks it. The grazing reflection is left out, because it is scaled by distance ahead
  and there is no equivalent looking back ([RLG-079](../fragments/RLG-079.md)).

<a id="v0-9-64"></a>
## [0.9.64] - 2026-08-29
- Changed: **the mirror looks down from higher up.** The owner reported from the device that it still
  shows too low to the ground. The eye rises from 2.15x the driving height to 3.00x, which spreads
  the road down the glass instead of leaving it flat along the bottom - a car 6,000 units behind moves
  from 0.158 of the pane below its horizon to 0.242.
- Changed: **the mirror height is a named tunable rather than a number inside an expression.** It has
  moved three times now - 1.55x, 2.15x, 3.00x - so `MIRROR_EYE` is the one thing about this view that
  keeps needing to move and it is findable. `API.mirrorEye()` sets it live and `API.mirrorAt()` says
  where a car at a given distance lands, so the next adjustment can be measured rather than guessed.
- Known limit, stated rather than discovered later: **the eye height and the vertical zoom are the
  same knob** in this projection, so looking further down also pushes near things off the bottom edge.
  A follower closer than about 1,300 units is now below the glass, where the limit used to be 950.
  Clamping such a car to the bottom edge - which is what a real mirror shows - would fix it and is not
  built.

<a id="v0-9-63"></a>
## [0.9.63] - 2026-08-29
- Added: **the tundra lies under snow before anything falls.** `snowFloor` is 50% there and absent
  everywhere else, and it is a floor rather than a level: a fall builds from it in the ordinary way
  and every path that takes snow away stops at it. It crosses on the WEATHER band rather than the
  ground's, because it is weather - the white should arrive with the cold, not with the colour of the
  verge ([RLG-059](../fragments/RLG-059.md)).
- Added: **arriving somewhere that lies under snow whitens the ground over seconds, not in a frame.**
  Clamping the level up to the floor would have snapped it white the instant the floor rose, which is
  the switch this run of work exists to remove. The decay stops at the floor when it is already above
  it, and a separate gentle climb handles arriving below it - about four seconds from bare to a
  tundra's half cover ([RLG-057](../fragments/RLG-057.md)).
- Changed: **the tundra is permanently slipperier, and nothing was added to say so.** `wetGrip`
  already costs `settle * 0.30`, so a floor of 0.5 takes about 15% of dry grip before a flake falls.
  That is a consequence of the ruling rather than a separate decision
  ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-62"></a>
## [0.9.62] - 2026-08-29
- Fixed: **the skyline belongs to the horizon, not to the car.** The far-field ground already showed
  the new biome the moment a boundary was placed, while the skyline was still rebuilt on ARRIVAL - so
  for the whole transition you would have seen the new biome's ground sitting under the old biome's
  sky. The horizon is the furthest segments and those are already the next place, so the skyline
  inherits from them ([RLG-022](../fragments/RLG-022.md)).
- Added: **both skyline swap mechanisms, switchable.** A crossfade is a degenerate case of the layer
  move - two skylines drawn at once, blended by opacity instead of by position - so building the
  layers gives both for one branch. `SKY_SWAP` defaults to `move`: the outgoing skyline sinks and
  shrinks behind the horizon while the incoming one rises from it. The owner rules on which reads
  better after seeing them ([RLG-022](../fragments/RLG-022.md)).
- Added: **the weather transitions as you cross, over a longer run than the ground.** Weather the new
  place cannot produce thins out in proportion to how far in you are, instead of being switched off
  at a line, and settled snow starts melting at a rate that comes on with the crossing. The weather
  band is 72 segments against the colour band's 18, because the ground underfoot changes at a line
  and the sky above it does not - measured, the weather ramps 0.00, 0.35, 0.69, 1.00 while the ground
  steps across its own ([RLG-022](../fragments/RLG-022.md)).
- Fixed: **the weather harness pins the biome as well as the hour.** The verge check went red on runs
  that landed in FOREST and green on runs that landed in DESERT, on one unchanged build, because a
  dark ground leaves the rain darkening least room to show. It is pinned to the darkest biome, so a
  pass is a pass everywhere - which a random biome could never promise
  ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-61"></a>
## [0.9.61] - 2026-08-29
- Added: **a biome change is a place you drive into.** The new biome's colour is taken by the road
  slices at the furthest point being drawn and travels toward the camera as you approach it, with an
  18-segment blend band so the join is a ramp rather than a line. The mechanism is the segment index:
  it is an absolute world position, so a boundary placed at one arrives on its own and nothing has to
  animate it. The weather, the skyline and the name flash still fire when the CAR crosses, because
  that is when you have arrived ([RLG-022](../fragments/RLG-022.md)).
- Fixed: **each biome is strict about its ground at every hour.** The night and golden-hour ground
  colours were flat hex constants shared by all five biomes, so a desert at night was the same
  green-black as a forest at night - and the sweep would have been invisible for most of the day
  cycle. They are derived from the biome's own grass now, dimmed and cooled after dark and warmed at
  golden hour, so a biome added later gets both for nothing
  ([RLG-059](../fragments/RLG-059.md)).
- Fixed: **the band under the horizon is the same ground, seen further off.** It asked `bio()` - where
  the CAR is - while showing what is at the far end of the road, so a transition would have reached
  the horizon last instead of first. It reads the same `groundTone` call the furthest drawn slice
  makes. Its brightness is now normalised to a fixed fraction of the foreground rather than hoped for:
  the haze wash mixes toward a light grey, so on a dark biome it made the band BRIGHTER - a forest
  verge at 48 came out at 79 ([RLG-022](../fragments/RLG-022.md)).
- Added: **`tools/biome-test.py`** - it reads the sweep as numbers over time, because one frame cannot
  show travel. A flip shows the same mix at the car and at the horizon at every instant; a sweep shows
  the horizon leading. The harness puts the flip back and checks that the distinction fails
  ([RLG-022](../fragments/RLG-022.md)).

<a id="v0-9-60"></a>
## [0.9.60] - 2026-08-29
- Fixed: **the street lamps had no occlusion at all, and now they use the cars'.** The test guarding
  them was `!overBrow(...)`, and `overBrow` returns false on its first line - dead since `crestY` was
  re-enabled. So a post behind a hill drew straight through it and one coming over a brow arrived
  whole, which is the pop reported from the device. The crest rules are lifted out of `drawSprite`
  into one `crestGate` and both callers use it, because a second implementation that behaves
  similarly is a thing that drifts ([RLG-073](../fragments/RLG-073.md)).
- Added: **the crest gate keeps a ledger of what each kind of thing DID about its answer**, and the
  distinction is the whole value of it. Counting the outcome inside the gate records what the gate
  decided, and a caller that asks and then ignores the answer - which is exactly the fault being
  fixed - produces an identical ledger. The first version of the check passed with the defect
  deliberately put back. The count moved to the branch that acts, and it then failed at 0 clipped
  against 47 ([RLG-073](../fragments/RLG-073.md)).

<a id="v0-9-59"></a>
## [0.9.59] - 2026-08-29
- Changed: **thunder is a crack and a rumble, and distance eats the crack.** High frequencies are
  absorbed and scattered over distance and low ones are not, so a strike overhead is a crack with a
  rumble under it and the same strike a mile off is the rumble alone. The crack falls away as the
  nearness squared - it keeps 22% of its level at half distance and is gone entirely past two thirds
  - while the rumble falls in a straight line and never below 0.20. The far rumble also runs longer,
  2.8s overhead against 4.6s across the valley, because what reaches you has come by several paths
  ([RLG-060](../fragments/RLG-060.md)).
- Fixed: **the weather harness pins the time of day.** A run started at DUSK drifted into the night
  branch part way through, where the ground is already dark and the rain darkening has almost no room
  to show, and the verge check went red on one run in six at a margin of about three. Loosening the
  threshold would have hidden a real thing about the effect; measuring in daylight is what makes the
  number mean anything ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-58"></a>
## [0.9.58] - 2026-08-29
- Changed: **thunder is loud enough to be thunder.** It was mixed as a background texture, under
  `dead` and `copDown`, which are ordinary event sounds. Thunder is the loudest thing in a storm and
  it should make you look up. The three beds now peak at 0.46, 0.37 and 0.20 - about 1.8x - and the
  headroom was counted rather than guessed: the master bus is 0.85 with no compressor after it, the
  beds do not peak together, and the worst case through the master is 0.71
  ([RLG-060](../fragments/RLG-060.md)).
- Changed: **the gap between the flash and the sound is how far away the strike was.** The delay
  runs from 250ms to 5s, and the distance is rolled once so the delay, the loudness and the
  brightness of the flash all follow from it. They used to be rolled separately, so a strike could
  arrive at full volume five seconds after its flash or barely register a quarter of a second later
  ([RLG-060](../fragments/RLG-060.md)).
- Added: **the weather harness measures the sound as well as the paint.** It records the gains
  thunder hands the synthesizer, rather than reading a value back off the Web Audio graph - RLG-065
  cost three attempts on that distinction, because a GainNode on a closed context reports a healthy
  value quite happily. The old levels were put back and both loudness checks were watched going red
  ([RLG-060](../fragments/RLG-060.md)).

<a id="v0-9-57"></a>
## [0.9.57] - 2026-08-29
- Fixed: **the weather is painted on the ground, not washed over the frame.** Snow cover and the rain
  darkening were screen-wide rectangles drawn after the road and after the player, so the car got as
  snowed on as the ground it stood on and a hill a quarter of a mile away got as wet as the tarmac
  underfoot. The owner rejected the snow half on sight. Both now mix into each surface's own colour,
  per segment: the ground layer that follows the road over every crest, and the band between it and
  the horizon ([RLG-057](../fragments/RLG-057.md)).
- Fixed: **settled snow shows at every hour.** The night and golden-hour ground colours were flat
  hex values that ignored the cover, so snow vanished at sunset and returned at dawn. That is what
  the full-screen overlay had been quietly compensating for. Snow now takes the colour of the light
  on it - near white at noon, warm at golden hour, a dim blue-grey under a moon
  ([RLG-057](../fragments/RLG-057.md)).
- Added: **the road itself covers over, and that is the slippery part.** The tarmac whitens as snow
  accumulates, less than the land beside it so the corridor stays readable, and the markings go under
  the cover before the surface does ([RLG-057](../fragments/RLG-057.md)).
- Changed: **snow unwinds at the rate it arrived.** It was a one-way build with a slow leak under it.
  When the fall stops and the biome still allows snow, the cover runs back down the slope it climbed
  and the grip returns at the pace it went - a blizzard that covers the ground in forty seconds
  clears it in forty. A biome that cannot hold snow still takes it away outright
  ([RLG-057](../fragments/RLG-057.md)).
- Added: **rain accumulates too, by the same model.** Standing water builds while it rains, unwinds
  at twice that rate when it stops because water runs off a camber, and clears outright in a biome
  that cannot rain. Rain used to be a level: a shower was at its worst the second it arrived and no
  worse ten minutes later. The falling term drops from 0.38 to 0.22 to pay for it, so a shower
  arriving is gentler and a rain that has set in is worse ([RLG-057](../fragments/RLG-057.md)).
- Fixed: **the wet sheen was a third full-screen wash, and it reversed the other two.** It added more
  light than the darkening removed - measured, the tarmac came out 5.4 brighter in the rain than it
  was dry. A wet road is bright in the distance because of reflection at a grazing angle, so that is
  where it is painted now: on the road, per segment, scaled by distance, absent at your feet
  ([RLG-057](../fragments/RLG-057.md)).
- Added: **`tools/weather-test.py`** - it stops the world, then reads pixels off the frozen frame
  with only the weather changed between samples. The assertion that carries it is that the player's
  car does not change colour when the weather does, and the harness proves that check is real by
  putting the old full-screen wash back through `CFG.afterDraw` and watching the same check go red
  ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-56"></a>
## [0.9.56] - 2026-08-29
- Changed: **snow accumulates instead of settling to a level.** It used to chase the fall and stop
  there, so a flurry could never whiten the ground however long it lasted and a blizzard reached its
  ceiling in seconds. It integrates now - about forty seconds of heavy snow to cover the ground,
  three or four minutes for a flurry - and melt is a twentieth of the rate it arrived
  ([RLG-057](../fragments/RLG-057.md)).
- Changed: **deep snow is slicker than snow.** Settled cover costs more grip than the fall does: a
  road with an inch on it is the hazard and the flakes are only how it got there. Measured, grip fell
  from 0.578 to 0.340 as the ground whitened, and the floor is deliberate - below a third of dry grip
  a car feels broken rather than slippery ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-55"></a>
## [0.9.55] - 2026-08-29
- Fixed: **settled snow is two layers rather than one slab.** It was a single overlay filling
  everything from the horizon down at one strength. There is a bright far field under the horizon
  that fades downward, and a wash on the ground in front of you that fades upward, and the two
  overlap across most of the plane so there is nowhere for a seam to be
  ([RLG-057](../fragments/RLG-057.md)).

<a id="v0-9-54"></a>
## [0.9.54] - 2026-08-29
- Added: **cloud cover as a range from clear to overcast.** It is a weather variable rather than a
  consequence of rain - an overcast day with no rain in it is the commonest sky there is - and rain
  or snow raise it. `storm` is how black the cover is and follows the rain, so heavy rain is dark and
  heavy snow is bright ([RLG-057](../fragments/RLG-057.md)).
- Added: **the sun and moon bleed through the cloud**, because the cover is drawn after them
  ([RLG-057](../fragments/RLG-057.md)).
- Added: **lightning and thunder.** A strike belongs to a heavy storm and never to snow; the flash is
  two or three strikes in quick succession and lights the cloud rather than the ground, and thunder
  follows at a distance. **Not verified by ear** ([RLG-060](../fragments/RLG-060.md)).

<a id="v0-9-53"></a>
## [0.9.53] - 2026-08-29
- Added: **the wipers move, and the lens gets wet.** Every vehicle has carried a wiper since the
  fronts were drawn and the only caller was the fleet sheet - the mirror drew them parked in all
  weathers. One sweep clock for the whole road, at a rate set by how hard it is raining, because at
  sprite size a road of blades each keeping its own time reads as noise and one rhythm reads as
  weather ([RLG-060](../fragments/RLG-060.md)).
- Added: **drops on the camera lens** that arrive with the rain and the speed, crawl, and clear
  completely when the wiper passes - the same clock, so the lens clears on the stroke you can see on
  the car in front ([RLG-060](../fragments/RLG-060.md)).

<a id="v0-9-52"></a>
## [0.9.52] - 2026-08-29
- Added: **traffic signals before it merges.** A car announces the move, waits between 1.1 and 1.8
  seconds, re-checks the gap and only then crosses - and one driver in five never bothers, decided
  once per car because it is a habit rather than a coin toss. The indicator flag had been set on
  every merge decision since the merge logic was written and **no renderer had ever read it**
  ([RLG-052](../fragments/RLG-052.md)).
- Added: **`traffic-test` checks the screen, not the engine.** It forces every car to blink and
  counts amber pixels - 11 with the blinks off, 57 with them on. A check that read only the engine
  state would have passed the whole time the feature was invisible
  ([RLG-052](../fragments/RLG-052.md)).

<a id="v0-9-51"></a>
## [0.9.51] - 2026-08-29
- Changed: **the fleet sheets live in `docs/fleet/`.** Six pictures beside the prose is a folder you
  have to read past to find a document. Nothing was left behind to move: every render has overwritten
  the same six paths since the class split ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-50"></a>
## [0.9.50] - 2026-08-29
- Changed: **the dim state splits the difference between off and bright**, and carries a third of the
  glow. A running light does glow a little, and a lamp that lights with no bloom reads as a painted
  shape rather than as a light ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-49"></a>
## [0.9.49] - 2026-08-29
- Changed: **the whole lamp ladder moves down a rung.** The red that was the unlit lens is the
  running light now, and unlit is a lens with almost nothing in it - which is what an unlit red lamp
  looks like in daylight ([RLG-053](../fragments/RLG-053.md)).
- Changed: **a headlight is dark when it is off.** It was a pale grey lens whether lit or not, so the
  lit state had nothing to arrive from ([RLG-053](../fragments/RLG-053.md)).
- Added: **weather turns the lights on as if it were night.** `lampsOn()` takes the stronger of the
  clock and the weather, so a storm at noon lights the road - street lamps, tail lights, headlights
  and the mirror all read that one function ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-48"></a>
## [0.9.48] - 2026-08-29
- Added: **a little tyre under every vehicle**, drawn before the body so the sill overlaps it and
  only the bottom shows ([RLG-053](../fragments/RLG-053.md)).
- Fixed: **the front bumper is the same colour as the rear one** ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the van is a size smaller.** It was 85% of an articulated lorry; it is about 70% now
  ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the muscle car's front indicators sit behind its headlights**
  ([RLG-053](../fragments/RLG-053.md)).
- Changed: **the MATADOR and SUPER CRUISER tail is a full bank of chevrons** - eight brake blades a
  side and a two-blade indicator outboard of them ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-47"></a>
## [0.9.47] - 2026-08-29
- Fixed: **brake lights are red, and they have three states.** They were drawn additively over the
  picture underneath, which turns red into white, and their inner highlight was nearly white before
  anything was added to it. A lamp paints its own lens opaquely now, and its highlight is a lighter
  RED. Off is daylight idle, dim is the night-time running light, bright is the brake - and the level
  is driven where the car is drawn rather than faked with alpha
  ([RLG-053](../fragments/RLG-053.md)).
- Added: **a lit lamp carries a baked glow.** Rendered once at build time and blurred, drawn
  additively behind the lens. `lamp-test` gained a check that a lit lamp covers more than its own
  lens, which found four vehicles whose glow was being thrown off the canvas
  ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-46"></a>
## [0.9.46] - 2026-08-29
- Fixed: **a car's front now has the same silhouette as its back.** The rear body is a path with a
  waist - shoulders curving out to 0.955 and a sill tucking back in - and the front was a rounded
  rectangle under a comment claiming it was "exactly as the back". It was exactly as the back at the
  two edges it named and a different shape everywhere between them. The front draws the rear's own
  path now, with the rear's arch blisters ([RLG-053](../fragments/RLG-053.md)).

<a id="v0-9-45"></a>
## [0.9.45] - 2026-08-29
- Changed: **the garage's two views hang from the roof line.** A shared floor line is the physical
  way to think about it and is not what reads as aligned: the two ends carry different amounts of car
  below the body, so a common floor pushes the front's roof up. Owner's instruction - align the tops.
  The card is also sized to the cars in it rather than to a constant
  ([RLG-072](../fragments/RLG-072.md)).

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
