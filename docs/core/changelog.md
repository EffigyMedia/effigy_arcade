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
