# PRIVATEER — spec, not yet built

A first-person ship. You fly it from the bridge, you get out of the chair and
walk around it, you disable other ships and board them, and you fight through
their corridors. Between all that you dock at stations to sell what you took
or to take a contract to hunt someone.

**Status: specified, nothing written.** This document is the brief. Nothing in
`games.js` yet, no file in `games/`. Read DRIVING.md's opening before starting
— the same rule applies here: the thing that makes this game good is the
FEEL of one seat, one corridor, one boarding, and none of the breadth matters
if that is wrong.

---

## 1. WHY THIS IS ONE GAME AND NOT FOUR

The pitch has four modes in it — flight sim, walking sim, shooter, trading
game. That is four games' worth of surface for one cabinet, and the honest
risk is that it becomes four thin things instead of one good one.

What holds it together is that **all four are the same loop seen from
different distances**, and the loop is: *find something worth taking, take it,
spend what you took on being able to take more.*

    hunt        pick a target, close on it, disable it        (bridge)
    board       walk to the airlock, kit up, cross            (ship interior)
    take        fight through their ship, empty their hold    (shooter)
    spend       dock, sell, refit, take a contract            (station)

If a feature does not serve that loop, it is not in the first build. Trading
is spending, not commerce — no supply-and-demand simulation. Walking the ship
exists so that kitting up and reaching the airlock are ACTIONS, not menus.

**The one-line test for every decision: does this make the next boarding
better?** If not, cut it.

## 2. WHAT TO BUILD FIRST

Not the ship. Not the galaxy. **The boarding.**

    Build 1   BUILT — ONE corridor. You, a gun, two hostiles, a crate at the end.
              Raycast renderer, tap-to-shoot, strafe. No ship around it,
              no station, no flight. Ten seconds of play, on a phone.

If that is not fun in ten seconds it will not be fun with a galaxy attached,
and everything else in this document is wasted work. Every other system in
here is a reason to do that corridor again with different stakes.

Then, in order, each one earning the next:

    Build 2   BUILT — the bridge: sit, stick, sticky throttle, one ship to chase.
              NO WEAPONS. The question is only whether a two-axis rate stick
              and a set-and-forget throttle feel like flying on a phone.
    Build 3   BUILT — weapons and the rear cone: lasers, missiles, hit location from
              geometry, engines dark, the ship disabled
    Build 4   BUILT — dock and cross: approach slow, hold position, get out of the
              chair, walk to their airlock, and run Build 1 on the far side
    Build 5   BEING HUNTED — BUILT. Take cargo and a hunter comes: he flies
              the same pursuit, wants the same cone, and if he disables you
              you drift while a countdown runs, then defend your own deck
    Build 6   BUILT — the locker: SIDEARM / BREACHER / CARBINE and an
              armour line, chosen before launch and reaching the fight as
              damage, magazine, hull and walking speed
    Build 7   BUILT — the station: one room, four things. Contract board,
              armoury, locker, undock. Cargo pays a price, not a market.
    Build 8   BUILT — contracts and the split. Take a named bounty and
              hunter standing rises; take a ship nobody asked you to touch
              and PIRATE rises, which is what decides how fast the bounty
              hunter docks and how hard he shoots. No karma bar: the world
              just gets worse.

## 3. THE RENDERER — AND THE HONEST WARNING

Three first-person views on a phone, in one HTML file, at 60fps:

    SPACE       starfield, ships as sprites, a HUD over glass
    INTERIOR    corridors and rooms, yours and theirs
    STATION     a room with people and boards to interact with

**They should all be the same renderer.** A raycaster in the Doom mould:
grid-based walls, sprite billboards for anything that moves, floors and
ceilings flat-shaded. Raceway already proves this codebase can do a projected
3D view at 60fps on a phone, and a raycaster is cheaper than the road.

Space is the same renderer with the walls turned off and the sprites given
depth — a ship at 4km is a billboard scaled by distance, exactly as traffic
is in Highway.

    interior    grid of cells, walls from a bitmask, doors as thin walls
    space       no grid; sprites in a sphere around you, painter's order
    station     the interior renderer, bigger cells, more sprites

**The warning, and it is the whole risk of this cabinet:** Raceway is 89KB and
road.js is 469KB, and that is ONE first-person view with one interaction
model. This is three views and four interaction models. It will be the
biggest thing in the arcade by a wide margin, and it is the first cabinet that
should probably be built as a shared engine from day one — `void.js` beside
`road.js` — rather than a single file that grows into one.

Decide that before Build 2, not after Build 5.

## 4. THE SHIP AS A PLACE

The reason to walk around instead of using a menu: **the ship has to be
somewhere you know.** Six rooms, no more, laid out so you can cross it in
about eight seconds and learn it in about three minutes.

    BRIDGE      the chair. Sit to fly. Forward view is the glass.
    LOCKER      the wall of kit. What you carry is chosen HERE, in advance,
                which is what makes it a decision rather than a menu tap
                during a fight.
    HOLD        what you have taken, as objects on the floor. It should be
                possible to look at your hold and see that you have had a
                good week.
    ENGINE      damage shows here. A hit that kills your engines is a fire
                in this room, and you walk to it with an extinguisher.
    AIRLOCK     where boarding happens, both directions.
    BUNK        save point, and the one room that is yours.

**Interaction is a single verb.** One button, context-sensitive: SIT, OPEN,
TAKE, USE. Not an inventory system with a cursor. A phone has one thumb free.

The hold and the locker are the same object seen twice: the locker is what
you can carry on your body, the hold is what the ship can carry. Moving a
thing between them is the entire equipment system.

## 5. DISABLING, NOT DESTROYING

The flight model exists to set up a boarding, so **killing a ship has to be a
failure state, not a win.** A destroyed ship has no cargo and no bounty.

    ENGINES     disabled: it stops running. This is the shot you want.
    WEAPONS     disabled: it stops shooting back. This is the safe shot.
    HULL        at zero it explodes and you get nothing.

So the fight is: strip weapons if you are careful, strip engines if you are
greedy, and every shot at the hull is money burning. That single inversion is
what makes this a pirate game rather than a shooter with a ship on the front.

Targeting a subsystem should be a HOLD on the target — a second of steady aim
while it shoots at you — so that the greedy choice costs nerve.

## 5a. FLYING, AND THE FIGHT

**Decided in conversation, 2026-08-28. This section is the flight model.**

Controls mirror Highway's, because the hands already know them:

    RIGHT   a diegetic throttle LEVER that stays where you leave it —
            0% to 100%, with a detent past it to 110% AFTERBURN — and two
            weapon buttons above it, lasers then missiles. Bottom to top in
            order of how often the thumb needs them.
    LEFT    a flight stick that renders where you touch, exactly as
            Raceway's wheel does. Two axes, pitch and yaw. NO ROLL: on a
            phone roll is disorientation with no upside, and without it
            "up" stays up and the starfield keeps reading as a horizon.
            RATE control, not position — push and hold to keep turning.

The lever is the important one. A momentary throttle occupies a thumb; a
sticky one is SET and then forgotten, which frees that thumb for the weapons
and turns flying into stick-and-trigger. Same rhythm as the gearbox and the
pit stop.

### The engines are on the back, and that is the whole game

Engines disable. Everything else destroys — and a destroyed ship has no
cargo and no bounty. So the fight is not aiming, it is **getting behind
them**, and they will turn to deny it.

    hit location comes from GEOMETRY, not a target menu. The angle between
    the shot and their facing decides it: a rear cone of about 60° is
    engines, everything else is hull. No subsystem selector, no cycling.

You earn the engine shot by being in the cone, and you know you are there
because you can see their exhaust. Aim can therefore be generous — position
is the difficulty. That is the same shape as the corridor, where the fight is
about where you stand, and it is why a rate stick is enough.

Because they turn to keep their tail away, holding the cone is a
SPEED-MATCHING problem: too fast and you overshoot past them and lose it, too
slow and they open the range. Which is what the sticky lever is for.

### Two weapons, one dilemma

    LASERS    low damage, fast, cheap. Safe to work on a rear cone with.
    MISSILES  hard-hitting, needs a lock, and LIKELY TO OVERKILL. Fire one
              at a hull and you will probably destroy a ship you wanted to
              loot.

So missiles are what you reach for when you are losing, and using them costs
you the prize. The pirate's arithmetic, in one button.

### Afterburn has to cost something

110% builds heat, and at redline **your own engines cut out and you drift** —
you become the disabled ship. The one tool that lets you catch a runner is
the one that can hand you to a bounty hunter. Same inversion as
hull-versus-engines, applied to the throttle.

### Docking is a hold

Once they are disabled: approach slow, line up on their airlock, and hold
position inside a tolerance for a couple of seconds. It echoes the pit stop's
press-and-hold, and it gives the crossing a beat instead of a cutscene. Then
you get out of the chair and walk it — diegetic both ways, there and back.

## 5b. BEING HUNTED

**The design closes on itself here.** Every system above runs backwards with
nothing new built: a bounty hunter disables YOU, docks with YOU, and boards.
The renderer, the mob AI, the docking hold and the airlock are all already
there. The only thing that changes is which ship the corridor is.

And it is yours. The one you have been walking around all game, with the
locker you kitted from and the hold full of everything you took. That is a
defence you actually care about, because the loss is LEGIBLE — it is on the
floor where you can see it.

**This is the argument that saves §4.** The spec was unsure whether walking
the ship survives contact with a phone, or whether it should collapse into
four camera positions you tap between. It survives, because knowing your own
layout becomes tactical: you know the sightlines down your corridor, you know
the bridge is a dead end, you know the airlock is the choke point. Nobody
boarding you knows any of that.

### Being disabled must be survivable, and frightening

If a hull breach ends the run, this never happens. So:

    engines out    you drift, weapons offline
    then           a minute or two before they dock

That dead time is the best moment in the game and it costs nothing to build.
What do you do with it? Get out of the chair. Get to the locker. Pick your
ground.

### Repair is the pit stop

Engines out is a FIRE in the engine room, and §4 already put an extinguisher
there. So the loop after you survive the boarders is: fix the ship under time
pressure. That is Raceway's pit-stop pattern reused, and it is what finally
earns the engine room its place on the deck plan.

### Losing

Open question, deliberately. Losing the ship and the cargo permanently is
honest and probably too brutal for an arcade cabinet. The softer version:
**they take your hold and leave you drifting.** You keep the ship, you lose
the week's work, and now you have a name to hunt — a loss that becomes the
next contract.

## 6. THE SHOOTER

Doom's rules, not a modern shooter's. That is the correct reference and it is
also the only one that fits a phone:

    no aiming up or down — the world is flat, autoaim in the vertical
    strafe, not lean
    hitscan weapons, generous hitboxes
    enemies telegraph LOUDLY and slowly; the fight is positional
    ammo is scarce enough that the locker choice mattered

**Boarded ships are small.** Four to eight rooms, generated from a handful of
hand-authored layouts, not fully procedural — a procedurally generated
corridor is exactly as interesting as a corridor, which is to say not at all.
The variety comes from what is IN them: crew, cargo, a captain who runs for
the escape pod with the good loot if you are slow.

**A boarding should last ninety seconds.** Long enough to be a fight, short
enough that the loop comes round again quickly.

## 7. STATIONS

Not hubs with services. **One room, four things in it**, so the whole station
is legible in a single glance:

    BROKER      sell what is in your hold, at a price that is a number,
                not a market simulation
    BOARD       contracts: bounties to take, cargo to deliver
    ARMOURY     buy the kit that changes the shooter
    DOCK        leave

The trading is deliberately thin. If it turns into a spreadsheet the game has
drifted away from the corridor.

## 8. PIRATE OR HUNTER

The split should be a CONSEQUENCE, not a class you pick at the start:

    take a bounty, kill the named target        → hunter standing rises
    board a ship nobody asked you to touch      → pirate standing rises

And each closes some doors. High pirate standing: stations start refusing you,
and bounty hunters come for YOU — which is the same encounter you have been
running all game, pointed the other way, and that is the moment the whole
design pays off. High hunter standing: better contracts, and pirates travel in
pairs to meet you.

**No morality text, no karma bar.** Two numbers, and the world's behaviour is
the only feedback.

## 9. WHAT THE MINIMUM STANDARD NEEDS (see README)

The usual list applies, and three of its items are unusually hard here:

- **the music bed reacts to play** — four views, so four states of one bed:
  a drone on the bridge, it drops to almost nothing while walking, it goes
  hard and percussive on a boarding, it warms up in a station
- **fits 320x568 through 430x932** — a raycaster is resolution-dependent for
  performance. Render at a fixed internal width and scale up.
- **pause and EXIT TO ARCADE from mid-game** — mid-BOARDING is the hard case.
  Decide early whether leaving the ship's interior is savable state or
  whether a boarding is atomic.

## 10. THE PARTS THIS SPEC IS LEAST SURE ABOUT

Written down so they are not mistaken for decisions:

- **Whether flight is fun with one thumb.** Still untested, but no longer
  open-ended: §5a settles it as two axes, no roll, rate control, with a
  sticky throttle. Three degrees of freedom were the risk and they are gone.
  Build 2 exists to answer what is left.
- **Whether the walk-around survives contact with a phone.** §5b makes the
  case that it does — your own deck plan becomes tactical the moment someone
  boards you. But the case is an argument, not a measurement. Build 4 still
  answers it and the answer is still allowed to be no.
- **How big the galaxy is.** The spec avoids saying, because the honest
  answer is "as small as it can be while still feeling like somewhere" and
  that number comes from playing Build 6, not from planning.

## 11. THE ONE-LINE PITCH, FOR THE ARCADE CARD

    Hunt a ship. Cripple it. Board it. Take everything.

---

# SECOND GENERATION — THE SYSTEM

**Specified 2026-08-28. Nothing below is built.** Builds 1-8 made a loop:
hunt, cripple, board, take, sell, get hunted. This section is the world that
loop lives in. It is a bigger game than the one above by an order of
magnitude, and the ordering matters more than any single feature in it.

## 0. THE HONEST WARNING, FIRST

The cabinet today is ~1,400 lines in one file. What follows needs, at minimum:
a walkable ship interior with several layouts, a hub station with vendors and
NPCs, a dialogue system, a real-time star system, warp between systems, procgen
planet-side locations, a shipyard with multiple purchasable hulls, and radiant
quests. That is not a file. That is `void.js` — the shared engine PRIVATEER.md
§3 said should exist "from day one, not after Build 5", and this is the point
where refusing to split it stops being a preference and starts being the reason
the thing fails.

**Split the engine before building any of this.** `void.js` owns the raycast
renderer, the interior grid format, the sprite pipeline, the interaction verb,
the save schema and the dialogue runtime. The cabinet becomes a data file and a
handful of callbacks, exactly as `raceway.html` is to `road.js`.

Second warning, learned in the corridor: **procgen breadth is where this dies.**
A procedurally generated corridor is exactly as interesting as a corridor. Every
"procgen wild location" must be assembled from hand-authored chunks with
authored contents — the generator picks and stitches, it does not invent.

## 1. THE KEYSTONE: THE SHIP AS A PLACE

Everything else hangs off this, so it is built first and alone.

    the pilot seat is an OBJECT you walk to and interact with
    sitting  -> the cockpit window becomes the view, space in real time
    the interior is still THERE around the window, drawn from the seat
    a button, top right, gets you up again whenever you want

That last line is the whole design. Flight is not a mode you enter, it is a
chair you are sitting in. The bridge view we already have becomes what you see
THROUGH a window frame, with the ship's interior geometry drawn around it.

This also answers §10's open question — whether walking the ship survives a
phone — for real rather than by argument. If getting up mid-flight to run to the
engine room is good, the ship is a place. If it is a chore, cut it to four
camera positions and lose nothing else.

    Build 9    one ship, six rooms, walkable. The seat works. Getting up
               works. Nothing else changes.

## 2. THE HUB

The station stops being a menu and becomes a room you walk, with the same
renderer and the same interaction verb.

    BROKER      sells your hold
    SHIPYARD    hulls and upgrades (§4)
    ARMOURY     kit
    BOUNTY BOARD    the authored contracts, as now
    NPCs        the radiant work (§3)

The four menu screens we have become four people or terminals standing in a
room. **The menus do not disappear** — walking up to the broker opens the
broker screen. The walking is context and atmosphere; the transaction is still
a list, because a list is the right UI for a transaction on a phone.

    Build 10   the hub as a room, with today's four menus behind four
               interactables

## 3. DIALOGUE, AND RADIANT WORK

**Not an LLM. Not a branching tree.** A slot-filling grammar:

    template   "{name} wants {verb} {object} from {place}. Pays {n} CR."
    slots      drawn from the system that actually exists right now

The quest is generated from the WORLD STATE, not from a fiction: if the system
has an ice planet with a wreck on it, the NPC can ask you to go to that wreck.
This keeps radiant work honest — every quest points at a place that exists, and
completing it changes the same numbers the authored contracts change.

Dialogue is a small stack of nodes: greeting, offer, accept, decline, on-return.
Four or five lines per NPC archetype, with slots. It reads as varied because the
NOUNS vary, which is the same trick the seeded circuits use in Raceway.

    Build 11   the grammar, three NPC archetypes, radiant quests that point
               at real locations

## 4. SHIPS

Buying a ship is buying a DIFFERENT INTERIOR, which is why §1 is the keystone.
Three hulls is enough to make the choice real:

    SHUTTLE     what you start with. Six rooms, cramped, cheap to run.
    HAULER      big hold, slow, more rooms to defend when boarded
    CORVETTE    fast, hard-hitting, small hold — a hunter's ship, not a
                pirate's

Upgrades are numbers on top: engines, hull, weapons, cargo. The interesting
ones change how a BOARDING goes — a bigger ship is a longer corridor to defend,
and that is a real cost that a stat line cannot express.

    Build 12   the shipyard, three hulls, upgrades that touch flight and
               boarding both

## 5. THE STAR SYSTEM

Real time, one star, a handful of planets, each a biome: dead, temperate,
ocean, volcanic, arctic. Flight between them uses the model we already have —
sticky throttle, rate stick — with distances that make the afterburn heat
mechanic matter over minutes rather than seconds.

**Planets are hubs with weather.** Landing puts you in a location built from
authored chunks with a biome skin. Not a planet. A place ON a planet.

    Build 13   one system, four planets, travel between them in real time
    Build 14   landing, and one authored location per biome
    Build 15   warp: a second system, and a reason to go there

## 6. WHAT IS DELIBERATELY NOT IN THIS

- no seamless planet-to-space transition. You land at a place.
- no crew, no ship-to-ship boarding by AI other than the bounty hunter
- no economy simulation. Prices are numbers.
- no base building, no mining, no crafting
- no save-anywhere. The bunk is the save point, as §4 always said.

## 7. THE ORDER, AND THE OFF-RAMP

    9   walkable ship + pilot seat        <- the keystone, build alone
    10  the hub as a room
    11  dialogue grammar + radiant quests
    12  shipyard and three hulls
    13  the star system
    14  landing and biome locations
    15  warp and a second system

**Build 9 is also the off-ramp.** If walking the ship is not good on a phone,
stop, keep the menus, and the game that exists is still the game that exists.
Everything from 10 onward assumes 9 answered yes.

---

# EQUIPMENT — ONE SCHEMA, NOT A CATALOGUE

**Specified 2026-08-28. Nothing built.** The ask was "a whole catalogue of
equipment, weapons, mods, armour, ship systems." What follows is deliberately
NOT a catalogue. It is one item schema, a small number of authored archetypes,
and mods that recombine them — because sixty guns is a list, and five guns with
twenty mods is a decision.

## 1. THE RULE THAT GOVERNS ALL OF IT

The locker taught this and it is not negotiable: **a stat that does not reach
the fight is decoration.** Before any item is added, name the moment the player
feels it. If that sentence cannot be written, the item does not ship.

The fight can currently feel exactly five things:

    dmg        shots to put a man down
    ammo       how long you can keep working
    hp         how much you can walk into
    speed      how fast you cross open corridor
    reach      (new) how far a shot stays accurate in a long corridor

Every weapon stat must land on one of those or add a sixth deliberately.
Anything else — "quality 12", "tier III", "+4% handling" — is a number that
exists to be read in a menu, and menus are not where this game happens.

## 2. THE SCHEMA

Everything — a rifle, a barrel, a chest plate, a shield emitter — is one shape:

    { id, class, slot, base:{...}, mods:[], power?, cost, desc }

    class   weapon | armour | shipsys | mod
    slot    what it occupies: primary/sidearm, head/torso/legs,
            engine/offense/defense/utility, or for a mod, what it fits
    base    the stat block, in the five terms above
    mods    attached ids; a mod is the same schema and applies DELTAS

One schema means one bench UI, one save format, one place where stats resolve.
Adding a weapon later is a data row, not a system.

## 3. WEAPONS ARE ASSEMBLIES, NOT ITEMS

**Revised in conversation, 2026-08-28.** The section below originally listed
five authored weapons with mods hanging off them. That distinction was never
real: if a mod is already an item with a stat block, and a weapon is already an
item with a stat block, then a gun is just what you get when you bolt several
of them together. There is no "weapon" class. There are PARTS, and an assembly.

    RECEIVER    the spine. Occupies the weapon slot, and everything else
                fits to it. Sets the action: single, burst, beam, shell.
    BARREL      reach and weight
    MAGAZINE    ammo and reload
    SIGHT       reach, and what you can see either side of it
    STOCK       recovery — how fast the gun comes back on target

Five parts, ten of each, is 100,000 assemblies out of fifty authored rows. The
ratio in §4 was already arguing for this; this is just following it to the end.

### The receiver is the spine, and it is what keeps them legible

Pure combinatorics produces a bag of noise: most combinations are
indistinguishable, a few dominate, and the player cannot form an opinion about
any of them. The fix is that ONE part carries the identity and the rest
modulate it. A shell receiver is a shotgun no matter what you hang off it. A
beam receiver is a lance. You can make a bad lance and a strange lance and a
lance nobody else has, but you cannot accidentally turn it into a carbine.

So: the two deliberately-bad-most-of-the-time weapons from the old §3 survive
as RECEIVERS — the shell receiver is death in a doorway and useless down a
hall, and no barrel fixes that. The archetypes were the right instinct; they
belong one level down.

### Fit rules, so the pool is not flat

Not every part fits every receiver, and the restrictions are physical, not
arbitrary: a shell receiver takes no long barrel, a beam receiver takes no
magazine (it takes a cell). Two or three such rules per receiver cut the pool
to the part of it that is interesting and remove the combinations that would
have been strictly dominant.

### One budget, so every assembly is a trade

Each receiver has a WEIGHT allowance. Every part spends it. You cannot fit the
long barrel, the big magazine and the heavy stock at once — the same
constraint as the ship power budget in §6, and it does the same work: it turns
a shopping list into a build. Without it, the best assembly is just "all the
biggest numbers" and the pool collapses to one answer.

### Naming

An assembly is named from its parts — receiver noun, barrel or sight adjective
— so the player can say what they are carrying without reading a stat block.
"Long Shell", "Clipped Beam". Generated, not authored, and it is how a build
becomes a thing you have an opinion about.

### What this replaces

The five archetypes below became five RECEIVERS; the four mod slots became the
other four parts. Everything else in §4 through §9 stands — every part still
trades, the bench still shows deltas, and the three-answer test in §9 now
applies to each PART rather than to each gun.

## 3a. THE OLD ARCHETYPES, NOW RECEIVERS

Not tiers. Not rarity. Five archetypes that want different corridors:

    SIDEARM     the middle. 2 shots, 24 rounds.
    BREACHER    1 shot, 10 rounds. Point blank or nothing.
    CARBINE     4 shots, 40 rounds. For crowds.
    LANCE       1 shot at any range, 6 rounds, slow to bring back on target.
                The long-corridor answer, useless in a doorway.
    SCATTER     kills anything inside two metres, harmless past four.
                The doorway answer, useless down a hall.

The last two are the ones that make the locker interesting, because they are
BAD most of the time. A kit you would never take is a failure; a kit you take
only when you know the ship's layout is the goal.

## 4. PARTS — AND A COST FOR EVERY GAIN

Every part trades, no exceptions:

    BARREL      reach up, speed down (weight)      or reach down, speed up
    MAGAZINE    ammo up, speed down                or ammo down, reload fast
    RECEIVER    dmg up, ammo down (per-shot cost)  or dmg down, ammo up
    SIGHT       reach up, peripheral vision down (the HUD narrows)

That last one is the model for the whole system: a mod that changes what you
SEE, not only what a number says. The best mods in this game should be felt in
the corridor before they are read in the menu.

Ten parts in each of four slots against five receivers is 100,000 assemblies
from fifty authored rows — and the weight allowance means only a few hundred
of them are actually reachable for any given receiver, which is the number a
player can have opinions about.

## 5. ARMOUR — THREE PIECES, ONE TRADE

    HEAD    hp, and at heavy: the visor narrows the view
    TORSO   hp, speed
    LEGS    speed, and how far a fall or a shove costs you

Armour only ever trades HP against SPEED. Resisting the urge to add
"resistances" is what keeps it legible: a boarding is ninety seconds of
crossing open ground, and the player must be able to reason about whether they
would rather be tougher or quicker without opening a stat sheet.

## 6. SHIP SYSTEMS — POWER IS THE CONSTRAINT

Four slots, and a POWER BUDGET that cannot fit all of them at once:

    ENGINE      thrust, afterburn heat ceiling
    OFFENSE     laser rate, missile lock time
    DEFENSE     hull, and how long you drift before boarders dock
    UTILITY     cargo, scanner range, docking tolerance

Power is what makes this a build rather than a shopping list. A hot engine
leaves nothing for defense, which means when the bounty hunter finally catches
you, you drift for four seconds instead of nine — and you chose that, months
ago, in a shipyard, for a reason that felt good at the time. That is the same
inversion as afterburn heat, one layer up.

## 7. THE BENCHES

Two stations in the hub (see SECOND GENERATION §2), both the same UI:

    WEAPON SMITH    attach and detach mods
    ARMOUR BENCH    fit plates

**The bench shows the delta, not the total.** "+6 REACH, -0.2 SPEED" beats
"REACH 34". The player is choosing a change, not admiring a number.

No crafting, no materials, no salvage economy. You buy mods and you fit them.
Every additional verb here is a verb not spent in a corridor.

## 8. BUILD ORDER

These slot into the second generation after the hub exists to put them in:

    16  the schema + five receivers, replacing today's three kits
    17  parts, fit rules, the weight allowance, and the weapon smith
    18  armour and the bench
    19  ship systems and the power budget (needs the shipyard, build 12)

## 9. THE TEST FOR EVERY ITEM ADDED, EVER

    1  name the moment the player feels it
    2  name what it costs
    3  name the situation where you would take something else instead

Three answers or it does not ship. This is the rule that stops a catalogue
becoming a spreadsheet with a game attached.
