# HIGHWAY AND RACEWAY — WHAT IS BUILT, WHAT IS NOT

Written 2026-08-23. Every "built" line below was confirmed present in code, not
recalled. Where something is built but unverified in play, it says so.

    road.js            9,354 lines   the shared engine
    highway.html         730         a config call
    raceway.html       1,415         circuit, pit, title, six seams

Anything in `road.js` is in BOTH games automatically. That is the default; the
tables below only note where it is not.

---

## BUILT — the shared engine (both games)

### The car

| Feature | Notes |
|---|---|
| 15 bodies | 14 driveable + SUPERCRUISER (`npc:true`) |
| Two classes | SPORTS (Roadster, Tuner, Muscle) · SUPER (Stallion, Matador, Crest) |
| Top speed | per-car `vmax`, 80 to 218mph |
| Acceleration | per-car `pull` |
| **Grip** | per-car, inverts into `cornerG` |
| **Braking** | per-car multiplier on the 9000 base |
| **Horsepower** | 130 to 1000 |
| **Mass** | 740kg to 14,000kg |
| **Power-to-weight** | derived, drives the launch |
| Gearboxes | 4/5/6-speed, per-car redline and rev bands |
| Engine note | per-car pitch, one table shared with NPC traffic |
| Marques | 9, front and rear, `marque` overrides the body default |
| Wheels | flat-bottom for supercars and formula, round for production |
| Paints | 12 base + 5 iridescent; force cars restricted to 2 |

### Driving

| Feature | Notes |
|---|---|
| Pseudo-3D road | curvature, hills, bends that swing the skyline |
| Cornering force | `curvature × v² × cornerG` — you get pushed wide |
| Manual/auto box | paddles, rev limiter, shift penalty in the 0-60 sim |
| **Neutral-drop launch** | rev in neutral, drop it, power-to-weight decides the kick |
| NOS | acceleration only, never top speed; fast classes only |
| **Slipstream** | 4.5% inside 3,600 units, same lane, above 55% of top |
| Damage, wrecks, respawn | |
| Rolling start | second gear, ~26mph |
| Brake lights | follow the pedal, not deceleration |
| Rear mirror | one eye height for every car, 2.15× the driving eye |

### World

| Feature | Notes |
|---|---|
| **5 biomes** | Forest, Desert, Mountain, City, Tundra |
| **Biome weather odds** | desert 4% rain / 0% snow; tundra 62% snow |
| Highway cycles biomes | every 70-130s, announced |
| Day/night | full cycle, sodium lamps, moon, dawn/dusk tints |
| **Rain** | grip −38%, braking −32%, leaning streaks |
| **Snow** | grip −52%, braking −46%, drifting flakes |
| **Settled snow** | whitens the verge, keeps costing after it stops |
| Traffic | 8 types, per-type engine notes, rogues at 102-122mph |
| **Speed traps** | parked cruisers; anything over 80mph engages them |
| **Super cruisers** | sustained 150+ with heat; count scales with heat |
| Roadblocks, crates, skids, tyre smoke | |

### Presentation

| Feature | Notes |
|---|---|
| Two music beds | 152 BPM race, 140 BPM menu, no restart between menus |
| Audio starts on load | `init()` attempted before any gesture |
| Countdown | one pitch, rising urgency, its own sound at zero |
| Engine, wind, tyres, sirens | held voices, silenced on every exit |
| Garage | body, paint, stripes, gearbox, options |
| Tournament | 4 rounds, points, medals |
| **Title art seam** | `CFG.titleArt` + `logoCool`/`logoHot` |
| Fleet sheet | `fleetSheet()` renders all 15, rear/front/wheel |

---

## BUILT — Highway only

| Feature | Notes |
|---|---|
| Endless road | infinite curve/hill generation |
| Distance + clock | checkpoints extend the clock |
| Race mode | 11 rivals, live places above each car |
| Test Drive | timed or open |
| Hot Pursuit | heat, busting, PIT manoeuvre |
| Unlocks | gold in SUPER → Formula · gold in SPORTS → iridescent · 20mi → Cruiser · 20mi at 180 avg → Super Cruiser · 100mi → traffic bodies |

## BUILT — Raceway only

| Feature | Notes |
|---|---|
| **Closed circuits** | built from a closed spline, zero crossings |
| Three leagues | sports / gt / formula, different corner character |
| Lap counting | `pos / circuit.len` |
| Minimap | live, with rival blips |
| **Fuel** | burns on throttle × rpm^1.35 |
| **Tyre wear** | burns on lateral load; three compounds defined |
| **Pit lane** | last 9% of the lap, under 60mph the crew works |
| One biome per circuit | pinned for the whole race |
| Own title screen | floodlit track from above, real generated circuit |

---

## WHAT IS NEXT — in order

Written after the corner fix landed. The order is by dependency, not by size.

### 1. Qualifying, and the grid it feeds

A hot lap that sets your starting position. It is the time-trial loop with a
different result screen, and it makes the start of a race something you earned.
**Cheapest large win on the list**, because the title screen already shows a
grid — the game promises this and does not deliver it.

### 2. Sector times and a live delta

Split the lap in three, keep the best, show "+0.31" against it. This is the
entire hook of a time trial and it is arithmetic on data the game already has.

### 3. The start line, and lights

There is no visible line and no start sequence. The countdown sound built weeks
ago is already five reds and a go; it was written for a clock running out and
belongs here.

### 4. Pit road art

The pit lane exists as a speed zone with no picture: no lane, no wall, no
boxes. Fuel and tyres are already real, so this is the last piece of a
mechanic that otherwise works.

### 5. Tyre compounds into cornerG

`COMPOUNDS` defines grip 1.10 / 1.00 / 0.92 and it is not connected. One line,
and it turns a cosmetic choice into a strategic one.

### 6. Flags and lapped traffic

Yellow where a car is wrecked, blue when the leader is catching you. Both are
cheap and both make a race feel officiated rather than simulated.

### Longer

    championship across circuits
    track-limits penalty
    bridges, now that shapes are settled
    a proper RACEWAY wordmark — the current one is a holding palette

## NOT BUILT

### Raceway — blocking

| Feature | Why it matters |
|---|---|
| **Corners fast enough to matter** | A formula car never drops below 182mph; braking is 1-3% of a lap against a target near 15%. The tight radius exists but only over a few hundred units. **This is the one that makes it a racing game or not.** |
| Tyre grip → cornerG | compounds are defined but not connected |

### Raceway — features

| Feature | Notes |
|---|---|
| Qualifying / pole position | a hot lap that sets the grid |
| Sector times and live delta | the hook of time trials |
| Start/finish gantry | no visible line or lights |
| Pit road art | it is a speed zone with no picture |
| Flags | yellow, blue, chequered |
| Lapped traffic | leaders catching the tail |
| Track limits penalty | "all four off and the lap does not count" |
| Championship | a season across circuits |
| Bridges | queued until shapes are settled |

### Highway

| Feature | Notes |
|---|---|
| Reward screens | Cruiser reveal exists; Super Cruiser has none |
| Derelict-style intro | art redo still pending |

### Both

| Feature | Notes |
|---|---|
| Environment ART per biome | the ground and weather change; the SKYLINE does not — desert still shows city towers |
| Weather option in the menu | `optWeather` exists in code with no UI |
| Compound choice in the menu | `compound` exists in code with no UI |

---

## UNVERIFIED — built but not played through

These exist in code and were confirmed by probe, not by playing:

- the full tournament ladder, both classes, to gold
- the Cruiser and Super Cruiser unlock conditions firing
- a speed trap actually triggering in normal play
- a super cruiser deploying and giving chase
- lap counting incrementing over a real 5-lap race
