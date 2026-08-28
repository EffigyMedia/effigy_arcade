/* =====================================================================
   EFFIGY ARCADE — games.js

   The whole catalogue. To add a machine:
     1. drop its .html into games/
     2. put <script src="../arcade.js"></script> plus the two arcade
        meta tags in its <head>
     3. add one object to this list

   attract: which little idle animation the card plays.
            'dive' | 'grid' | 'road' | 'maze' | 'none'

   Files live in games/<cat>/, one folder per shelf. `file` must match the
   folder its `cat` names — pack.sh fails the build if they disagree.

   cat:     which shelf it lives on.
            'ge'   \u2014 clean-room takes on the 1970s\u201380s cabinets
            'sw'   \u2014 the 1990s floor: fighters, shmups, light-gun
            'em' \u2014 ours outright, descended from nothing

   hook: write it like cabinet glass, not like a store listing. One or two
         short sentences, concrete, and no two cards built the same way —
         if every line is two clauses of the same length the rack reads as
         filler however good the games are.
   ===================================================================== */
window.EFFIGY_ARCADE = [
  {
    file:  'games/em/quietus.html',
    id:    'quietus',
    cat:   'em',
    name:  'Quietus',
    accent:'#7fd8ff',
    genre: 'ROGUELIKE \u00B7 TURN-BASED',
    hook:  'Nothing aboard is alive. Plenty of it still moves.',
    attract:'grid'
  },
  {
    file:  'games/sw/interstate.html',
    id:    'interstate',
    cat:   'sw',
    name:  'Redline Interstate',
    accent:'#ff8a3d',
    /* The genre line says what KIND of game this is — three words, the way
       every other card reads, not a list of menu items. The hook had been
       describing a build that no longer exists: it claimed sixteen bodies of
       traffic when there were never more than seven. */
    genre: 'DRIVING \u00B7 RACE \u00B7 ENDLESS',
    hook:  'Four races, a clock that only checkpoints reset, and the law behind you.',
    attract:'road'
  },
  {
    file:  'games/sw/motorsport.html',
    id:    'motorsport',
    cat:   'sw',
    name:  'Redline Motorsport',
    accent:'#4dd6a0',
    /* the fork: the same car and the same road engine, on a CIRCUIT. What
       Redline Interstate measures in miles survived, this measures in laps. */
    genre: 'RACING \u00B7 CIRCUIT \u00B7 LAPS',
    hook:  'Procedural circuits in three leagues, and a pit lane that decides it.',
    attract:'road'
  },
  {
    file:  'games/em/hardpoint.html',
    id:    'hardpoint',
    cat:   'em',
    name:  'Hardpoint',
    accent:'#ffb454',
    genre: 'SPACE \u00B7 FIRST PERSON',
    hook:  'Engines disable. Everything else destroys, and a wreck has no cargo.',
    attract:'hunt'
  }
];
