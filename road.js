/* ===========================================================================
   ROAD — the shared driving engine

   Interstate and Motorsport were 96.5% identical: 9,100 lines the same, 332
   different. Every fix had to be applied twice by hand, and the two were
   already drifting — ROADSTER and per-car grip existed in one and not the
   other.

   This is that shared 96.5%, as one factory. A game calls `ROAD(CFG)` and
   supplies only what makes it different. The engine asks CFG at four seams
   and behaves normally when they are absent, so Interstate passes almost nothing.

   THE SEAMS
     CFG.id          save namespace     'interstate' | 'motorsport'
     CFG.title       the <h1>
     CFG.curvature   (z, fallback) => k        a circuit answers, a road does not
     CFG.grade       (z, fallback) => g
     CFG.hudScore    (dist) => string          "4.6 MI" or "LAP 1/5"
     CFG.onReset     ()                        build a circuit, reset laps
     CFG.afterDraw   (ctx)                     the minimap
     CFG.overlay     (ctx)                     a full-screen takeover, last
     CFG.onStep      (dt)                      lap counting

   Everything else — the road, the cars, the physics, the audio, the garage —
   lives here once.
   =========================================================================== */
window.ROAD = function(CFG){
  CFG = CFG || {};
  var GAME_ID    = CFG.id    || 'interstate';
  var GAME_TITLE = CFG.title || 'Interstate';

  /* ---- THE SURFACE, BEFORE ANY SEAM FIRES -----------------------------
     `onReset` runs during setup, long before this function returns, so a fork
     that captured the return value still held nothing when its first callback
     ran. The object is created here and filled as things become available;
     The helpers cannot be attached here — several are `const` arrows and are
     in their temporal dead zone at this point. They are exposed as WRAPPERS
     instead, which are only called later, by which time the real ones exist. */
  var API = {};
  CFG.api = API;
  API.rnd    = function(a,b){ return rnd(a,b); };
  /* attached here, not at the end: `onReset` fires during setup and a fork
     picking its biome needs the list before ROAD() returns */
  API.BIOME_KEYS = function(){ return BIOME_KEYS; };
  API.rint   = function(a,b){ return rint(a,b); };
  API.rr     = function(g,x,y,w,h,r){ return rr(g,x,y,w,h,r); };
  API.segAt  = function(segs,z){ return segAt(segs,z); };

"use strict";

/* =====================================================================
   SODIUM — a straight highway, a fast car, and a police force with
   an opinion about it. Pseudo-3D projection over a flat road.
   ===================================================================== */

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const frame = document.getElementById('frame');
const veil = document.getElementById('veil');
const veilBody = document.getElementById('veilBody');
const warnEl = document.getElementById('warn');
const nitroBtn = document.getElementById('nitro');
const brakeBtn = document.getElementById('brake');
const gasBtn   = document.getElementById('gas');
const hornBtn  = document.getElementById('horn');
let braking = false, gas = false;

/* ---------- road constants ---------- */
const SEG = 200;             // segment length
const RUMBLE = 3;            // segments per stripe
const ROAD = 1900;           // half-width of road
const LANES = 4;
const DRAW = 150;   /* was 95 — the road stopped short of the horizon and
                       the ground base showed as a band under the skyline */             // segments drawn
const CAM_H = 1050;
const FOV = 100;
const CAM_D = 1/Math.tan((FOV/2)*Math.PI/180);
const PLAYER_Z = CAM_H*CAM_D;
const LANE_X = [-0.75,-0.25,0.25,0.75];

const MAX_SPD = 15333;   /* 200 mph at the top of fourth */
/* NOS no longer raises the ceiling. With a real gearbox the limiter is the
   limiter — a bottle of nitrous cannot make fourth gear turn faster than it
   turns. What it does is get you THROUGH the gears, so it is pure acceleration
   now, and the top speed is the same with it or without. */
/* ---- NOTHING WENT OVER 200 ----------------------------------------------
   `NOS_SPD = MAX_SPD` capped every car at the reference speed, so a car whose
   `vmax` is 1.09 could reach 218 on paper and never did. The cap is gone and
   `carTop` — that car's own ceiling — is what governs.

   Nitrous does NOT raise it. It multiplies the acceleration rate, so you get
   through the rev bands faster and arrive at the same top speed sooner.
   ------------------------------------------------------------------------ */
const OFF_SPD = 4200;

let W=360, H=640, dpr=1, horizon=0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- state ---------- */
let state='title';
let pos, playerX, camX, targetX, spd, dmg, nos, nosOn, nosTime;
let dist, score, combo, comboTime, heat, heatT, runTopMph = 0;

/* ---- THE CLOCK ------------------------------------------------------------
   Out Run's spine: you are always running out of time, and the only thing that
   buys more is distance. Sixty seconds to start, twenty at every checkpoint,
   and a gantry every two miles so you always know where the next one is.

   At zero the throttle simply stops answering — you keep whatever speed you
   had and coast. That is a far better ending than a hard cut: you can see the
   next gantry coming and know whether you will roll under it, and sometimes
   you do. Coasting past one buys the twenty seconds and the run continues.
   -------------------------------------------------------------------------- */
const CLOCK_START = 60, CLOCK_BONUS = 20, CP_MILES = 2;
/* TEST DRIVE is practice: the clock is optional there. A race always has one. */
let timedRun = true;
/* stripes are paint, not a body — any car can wear them */
let optStripes = false;
/* debug only — never saved, never treated as an unlock */
let dbgRacers = false, dbgTraffic = false;
/* ---- ONE LIVERY PER RUN --------------------------------------------------
   A force does not run half its cars in white and half in black on the same
   night. The livery is chosen once when the run starts and every cruiser wears
   it — including yours, so there is no "player version" and "NPC version", just
   the cars that are out tonight.
   ------------------------------------------------------------------------- */
let copLivery = 'WHITE';
const COP_PAINT = {
  WHITE: { body:'#dfe4ec', hi:'#f4f7fb', lo:'#96a0ad' },
  BLACK: { body:'#23262c', hi:'#3a3f47', lo:'#111317' }
};
/* a formula car has a livery and a police car has one too — neither takes
   stripes over the top of it */
function stripesAllowed(){ return optBody !== 'FORMULA' && optBody !== 'CRUISER'; }
/* A FUNCTION, not a const: it was declared halfway down step() and read above
   it, so the temporal dead zone threw on the FIRST frame and killed the whole
   update — which is why the skyline looked frozen even after being fixed. */
function clockRuns(){ return (mode === 'race') || timedRun; }

/* ===========================================================================
   THE TOURNAMENT

   Four races at 10, 12, 16 and 24 miles. Points by finishing position on the
   usual descending scale, carried between rounds. The standings are what make
   a bad race matter later — a fourth place in round one is still recoverable,
   which is the only reason to keep driving.

   A gold at the end unlocks FORMULA, and the unlock is permanent.
   =========================================================================== */
const TOUR_MILES = [10, 12, 16, 24];
const TOUR_PTS   = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, 0, 0];   /* by place */
let tourOn = false, tourRound = 0, tourPts = 0, tourField = [];

function tourReset(){
  tourRound = 0; tourPts = 0;
  /* eleven rivals who carry their own points between rounds */
  tourField = [];
  for(let i=0;i<11;i++) tourField.push({ n:i, pts:0 });
}
function tourScore(myPlace){
  tourPts += TOUR_PTS[Math.min(myPlace-1, TOUR_PTS.length-1)];
  /* the rest of the field fills the other places, strongest first */
  let slot = 1;
  const order = tourField.slice().sort((a,b) => b.pts - a.pts);
  for(const r of order){
    if(slot === myPlace) slot++;
    r.pts += TOUR_PTS[Math.min(slot-1, TOUR_PTS.length-1)];
    slot++;
  }
}
function tourStanding(){
  /* where the player sits overall */
  let ahead = 0;
  for(const r of tourField) if(r.pts > tourPts) ahead++;
  return ahead + 1;
}
function unlocked(key){
  const sv = (AR && AR.save) ? AR.save.get((GAME_ID + '-opts')) : null;
  return !!(sv && sv[key]);
}
function zUnlocked(){ return unlocked('formula'); }
let clock = CLOCK_START, nextCP = 0, cpGantries = [], lastBeep = -1, wreckWait = 0;
let traffic, cops, blocks, crates, fx, shake, hitFlash, sirenPhase, lastKmh, iframe;
let bestScore=0, bestDist=0, runs=0;
const SV = AR && AR.save ? AR.save.get(GAME_ID) : null;
if(SV){ bestScore = SV.best || 0; bestDist = SV.bestMi || SV.bestKm || 0; }
let acc, last;

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>a+Math.random()*(b-a);
const rint=(a,b)=>a+((Math.random()*(b-a+1))|0);

/* =====================================================================
   SOUND — an engine you can hear working, and sirens that get closer
   ===================================================================== */
var AR = window.Arcade;
var BASS = [55, 55, 65.41, 55, 73.42, 55, 82.41, 73.42];      // A C D E
var LEAD = [440, 523.25, 659.25, 523.25, 587.33, 493.88, 440, 392];

var snd = {
  eng:null, wind:null, siren:null, sirenPhase:0,

  armed:false,
  arm: function(){
    if (snd.armed || !AR.audio.onReset) return;
    snd.armed = true;
    AR.audio.onReset(function(){ snd.eng = null; snd.thrust = null;
      snd.sqA = snd.sqB = snd.sqC = snd.screechLow = null; snd.begin(); });
  },
  begin: function(){
    if (!AR) return;
    AR.audio.init();
    if (!AR.audio.ctx) return;  // no engine yet; a real gesture will call us back
    snd.arm();
    if (!snd.eng){
      snd.eng   = AR.sfx.hold({ freq:70, type:'sawtooth', cutoff:520, q:3.2 });
      snd.eng2  = AR.sfx.hold({ freq:70, type:'square',  cutoff:400, q:2, detune:14 });
      snd.wind  = AR.sfx.holdNoise({ freq:900, q:0.5 });
      snd.siren = AR.sfx.hold({ freq:700, type:'sine', cutoff:2600, q:1 });
      /* NOS: a wide bandpassed hiss, opened up while the bottle is live */
      snd.thrust = AR.sfx.holdNoise({ freq:1800, q:0.35 });
      /* A real car horn is TWO notes a third apart played together, with a
         buzzy edge — a single sine reads as a doorbell. */
      snd.horn1 = AR.sfx.hold ? AR.sfx.hold({ freq:440, type:'sawtooth', gain:0, cutoff:1500 }) : null;
      snd.horn2 = AR.sfx.hold ? AR.sfx.hold({ freq:554.4, type:'sawtooth', gain:0, cutoff:1700 }) : null;
      /* Brakes: a tight, high band that only sings while the tyres are losing
         speed. Held at a fixed pitch it would drone; it tracks the rate of
         deceleration instead, so it screeches on the stop and dies as you
         settle. */
      /* ---- what a tyre actually does -----------------------------------
         A squealing tyre is not noise. The contact patch grips, stretches,
         releases and grips again hundreds of times a second — STICK-SLIP —
         and that is a periodic oscillation, so it has a pitch and a stack of
         harmonics. Filtering noise can only ever give you a hiss, however
         many bands you use, because there is no periodicity in it to hear.

         So the squeal is now TONAL: a sawtooth fundamental around 700Hz with
         two harmonic partials above it, each detuned slightly so they beat
         against one another, run through a sharp resonant filter. Noise stays,
         but only as the scrub underneath — the roar of rubber abrading —
         rather than as the sound itself.
         ------------------------------------------------------------------- */
      snd.sqA = AR.sfx.hold({ freq:700,  type:'sawtooth', cutoff:2400, q:9 });
      snd.sqB = AR.sfx.hold({ freq:1057, type:'square',   cutoff:3000, q:7, detune:12 });
      snd.sqC = AR.sfx.hold({ freq:1412, type:'sawtooth', cutoff:3600, q:6, detune:-16 });
      snd.screechLow = AR.sfx.holdNoise({ freq:320, q:0.7 });   /* the scrub */
    }
    AR.music.start(152, 4, snd.bed); menuBedOn = false;
  },

  shift: function(g){
    if(!AR) return;
    const t = AR.audio.now();
    const into = (g === undefined) ? gear : g;
    if(into < 1 || into > 4){
      /* NEUTRAL: the lever falls into the middle of the gate with nothing to
         engage, so it is softer, hollower and has no engagement thud. */
      /* still softer than an engaged gear, but audible */
      AR.sfx.noise({ t, freq:900, to:420, dur:0.070, gain:0.140, filter:'bandpass' });
      AR.sfx.tone({ t:t+0.014, freq:150, to:112, dur:0.110, type:'triangle',
                    gain:0.125, cutoff:700 });
      return;
    }
    /* ---- A SHIFT YOU CAN HEAR --------------------------------------------
       Three layers at 0.07 gain across 35 milliseconds, under a running
       engine, wind and tyres — correct in shape and inaudible in practice, the
       same fault as the countdown beep.

       Roughly tripled, and lengthened: a 35ms knock is a click at any volume,
       so the collar and the ring get long enough to register as a mechanism
       rather than a tick.
       -------------------------------------------------------------------- */
    AR.sfx.noise({ t, freq:2400, to:700, dur:0.055, gain:0.200, filter:'bandpass' });
    AR.sfx.noise({ t:t+0.020, freq:420, to:140, dur:0.115, gain:0.260, filter:'lowpass' });
    AR.sfx.tone({ t:t+0.022, freq:196, to:124, dur:0.130, type:'square',
                  gain:0.185, cutoff:1200 });
    AR.sfx.tone({ t:t+0.028, freq:1560, to:1180, dur:0.090, type:'sine',
                  gain:0.095, verb:0.25 });
  },

  warnCop: function(){
    if(!AR) return;
    /* the loud-hailer: a short two-tone bark, unpleasant on purpose */
    AR.sfx.tone({ freq:660, to:520, dur:0.16, type:'square', gain:0.075, cutoff:1800 });
    AR.sfx.noise({ freq:1400, dur:0.10, gain:0.03, filter:'bandpass' });
  },

  honk: function(on){
    if(!AR) return;
    if(snd.horn1 && snd.horn1.set){
      /* set() is (freq, level, CUTOFF, glide) — passing the glide third was
         setting the filter to 0.012Hz, which silenced the horn completely. */
      /* ---- each car has its own horn --------------------------------
         Same two-note chord, transposed per body: STALLION is a bright,
         high Italian bark, CREST sits a tone and a half below it, and
         MATADOR is between them. None goes lower than the original note by
         much — a supercar horn is not a lorry's. */
      const hp = (BODY[optBody] && BODY[optBody].horn) || 1;
      snd.horn1.set(440*hp,   on ? 0.085 : 0, 1500*hp, on ? 0.008 : 0.04);
      if(snd.horn2) snd.horn2.set(554.4*hp, on ? 0.070 : 0, 1700*hp, on ? 0.008 : 0.04);
    } else if(on){
      /* no holdable voice: a short blast instead, still two notes */
      AR.sfx.tone({ freq:440,   dur:0.22, type:'sawtooth', gain:0.075, cutoff:1500 });
      AR.sfx.tone({ freq:554.4, dur:0.22, type:'sawtooth', gain:0.060, cutoff:1700 });
    }
  },

  /* ---- other cars' engines ------------------------------------------------
     A small pool of voices, handed to whichever vehicles are nearest. Each is
     PLACED in stereo by how far off your line it sits and pitched by its own
     revs, so a car you overtake sweeps across the ears and falls away behind
     you — the Doppler-ish parallax you get from the real thing without any
     Doppler maths.
     ------------------------------------------------------------------------- */
  voices: [],
  /* ---- WHAT EACH VEHICLE SOUNDS LIKE -------------------------------------
     Every NPC ran the same curve — `54 + rr*rr*250 + rr*95` — so a lorry, a
     taxi and a tuner all made one noise at different volumes. Each type has an
     engine now: a pitch multiplier and its own rev ceiling, matching the player
     car where they share a body.

       truck   a diesel: low, and it runs out of revs early
       van     the same idea, a little higher
       tuner   TUNER's 10k band and 0.78 pitch
       muscle  MUSCLE's 10k band and 0.66 pitch — the lowest thing on the road
       cop     CRUISER's 11k and 0.72
       taxi    a tired saloon
       coupe   the quickest of the ordinary traffic
     ---------------------------------------------------------------------- */
  /* ---- ONE SET OF MACHINERY -----------------------------------------------
     There was a separate ENGINE table for NPCs, so a lorry you passed and a
     lorry you drove were tuned in two different places and could drift apart.
     Gone: an NPC reads the SAME `BODY` entry its driveable version uses — same
     pitch, same redline, same top speed.

     `rig` is how a body says which traffic shape it wears, so the lookup is
     just "which BODY has this rig". Built once.
     ------------------------------------------------------------------------ */
  /* built on FIRST USE, not at load: `snd` is defined above `BODY`, so
     reading it here at definition time threw before the game could start */
  _rig: null,
  rigBody: function(){
    if(snd._rig) return snd._rig;
    var m = {};
    for(var k in BODY) if(BODY[k].rig) m[BODY[k].rig] = k;
    m.sedan2 = m.sedan;          /* the variant borrows the saloon's numbers */
    snd._rig = m;
    return m;
  },

  traffic: function(list){
    if(!AR || !AR.audio.ctx) return;
    if(!snd.voices.length){
      /* Four was a guess I never checked. Measured, 9 to 15 vehicles sit
         inside the 36,000 falloff on a busy road, so four voices meant most of
         the traffic was silently dropped and the road sounded emptier than it
         looked. Sixteen covers the worst case seen; each is one oscillator,
         one filter, one gain and one panner, which is nothing next to the
         per-frame canvas work. Voices past the audible set are held at zero
         gain rather than torn down, so nothing clicks as cars come and go. */
      for(var i=0;i<16;i++){
        snd.voices.push({
          a: AR.sfx.hold({ freq:90, type:'sawtooth', cutoff:600, q:2.4, pan:0 }),
          busy: null
        });
      }
    }
    var near = list.slice().sort(function(p,q){
      return Math.abs(p.z - pos) - Math.abs(q.z - pos);
    }).slice(0, snd.voices.length);

    /* ---- keep the traffic in its place ---------------------------------
       Web Audio has no fixed voice budget, so sixteen engines cost nothing
       and the master measured 0.35-0.41 either way — but the COMBINED level
       of the traffic still climbs with the count, and a crowded road should
       not drown out your own car, the sirens or the music.

       So the whole traffic bed is normalised: work out what it wants to be,
       and if that exceeds the ceiling, scale every voice down together. Ten
       cars nearby are then ten cars you can pick out individually, not ten
       cars that are each as loud as one car would have been.
       -------------------------------------------------------------------- */
    var want = 0, i2, cc, dd;
    for(i2=0;i2<near.length;i2++){
      cc = near[i2];
      dd = Math.abs(cc.z - pos);
      want += Math.pow(Math.max(0, 1 - dd/36000), 1.4);
    }
    /* the ceiling rises with the level, or normalising would just undo it */
    var TRAFFIC_CEIL = 5.0;          /* in units of one voice at full level */
    snd.tScale = want > TRAFFIC_CEIL ? TRAFFIC_CEIL / want : 1;

    for(var v=0; v<snd.voices.length; v++){
      var vo = snd.voices[v], c = near[v];
      if(!vo.a) continue;
      if(!c){ vo.a.set(90, 0, 400, 0.12); continue; }
      var d = c.z - pos;
      var dist = Math.abs(d);
      /* fades out by about a hundred metres either way */
      /* THE SCALE WAS WRONG BY AN ORDER OF MAGNITUDE. I assumed a car in the
         middle distance sat a couple of thousand units away; measured, the
         nearest vehicle on a busy road is 20,000 to 35,000 out, because the
         road's z axis is far coarser than the lateral one. A 4,200 falloff
         could never reach anything, which is why every voice read silent no
         matter how much level I threw at it.

         36,000 is roughly the visible road, so a car appearing at the horizon
         fades in and is loudest as it draws alongside. */
      var fall = Math.max(0, 1 - dist / 36000);
      if(fall <= 0.01){ vo.a.set(90, 0, 400, 0.12); continue; }
      /* its own revs: speed against ITS top, through the same gearing */
      /* the same BODY the driveable version uses */
      var bk = snd.rigBody()[c.type];
      var B2 = bk ? BODY[bk] : null;
      var pitch = B2 ? (B2.pitch || 1) : 1;
      var ceil  = B2 ? B2.vmax : 0.9;
      /* its revs against ITS OWN top speed, not a shared one — a lorry at
         60mph is near its limit where a coupe at 60 is barely off idle */
      var rr = Math.min(1, (c.spd || c.cruise || 0) / (MAX_SPD * ceil));
      var hz = (54 + rr*rr*250 + rr*95) * pitch;
      /* ---- DOPPLER ------------------------------------------------------
         Approaching traffic should sit sharp and drop as it passes. The shift
         is driven by the CLOSING speed — its speed relative to yours — and
         signed by which side of you it is on, so the drop happens exactly as
         it goes by rather than fading in and out at one pitch. */
      var closing = ((c.spd || c.cruise || 0) - spd) / MAX_SPD;   /* -1 .. +1 */
      var side    = d > 0 ? 1 : -1;      /* ahead of you, or behind */
      hz *= 1 + clamp(-closing * side, -0.5, 0.5) * 0.16;
      /* PLACEMENT: lateral offset, exaggerated as it gets close, because a
         car alongside is hard left or hard right and one far ahead is centred */
      var lateral = ((c.x || 0) - playerX);
      /* same correction: "close" is thousands of units, not hundreds */
      var closeness = 1 - Math.min(1, dist / 14000);
      vo.a.place(clamp(lateral * (0.9 + closeness*1.9), -1, 1), 0.07);
      /* ---- LOUD ENOUGH TO HEAR IT MOVE ---------------------------------
         0.058 with a SQUARED falloff meant a car at half distance was at a
         quarter level and a car at the horizon was inaudible — so the panning
         and the pitch shift were happening below the threshold where anyone
         could notice them. The effects were correct and unhearable.

         0.115 and a gentler falloff (`fall^1.4`): near enough double at close
         range, and far more than double in the middle distance, which is
         exactly where a car crossing the stereo field is most interesting.
         ---------------------------------------------------------------- */
      vo.a.set(hz, 0.115 * Math.pow(fall, 1.4) * snd.tScale, 300 + rr*900, 0.07);
    }
  },

  /* ---- the menu has its own music -------------------------------------
     The driving bed carried straight over the title because nothing stopped
     it, which made a game over feel like the run was still going. This is
     slower, wider and in no hurry — a car park at night rather than a road.
     ---------------------------------------------------------------------- */
  menuBed: function(step, t){
    if (!AR) return;
    /* ---- 140 BPM ELECTRO -------------------------------------------------
       The last one put a melody note on every eighth for eight bars \u2014 96 notes
       with barely a rest \u2014 which is a flute solo, not a track. That is the
       "phonetic and chaotic" part: constant pitch change with nothing to hold
       onto.

       Electro is the opposite discipline. The parts are FEW and they REPEAT:

         - four on the floor, and that is the whole drum argument
         - a two-note bass hook that does not change for four bars
         - one arp figure, four notes, looping unchanged \u2014 the ear locks on
         - a chord every four bars, and nothing else moves

       Sixteen steps at 140. Roughly a third the note count of the last one,
       and every note is somewhere you already expect it.
       -------------------------------------------------------------------- */
    var s = step % 16, bar = Math.floor(step/16) % 8;

    /* Am \u2013 Am \u2013 F \u2013 G, four bars each half so it breathes */
    var ROOTS = [55.00, 55.00, 43.65, 49.00, 55.00, 55.00, 43.65, 49.00];
    var root  = ROOTS[bar];

    /* ---- four on the floor ---------------------------------------------- */
    if (s % 4 === 0) AR.sfx.drum('kick', t, s === 0 ? 0.80 : 0.66);
    if (s === 4 || s === 12) AR.sfx.drum('snare', t, 0.46);
    /* offbeat hats only \u2014 the space between them is what makes it move */
    if (s % 4 === 2) AR.sfx.drum('hat', t, 0.26);
    if (bar % 4 === 3 && s === 14) AR.sfx.drum('open', t, 0.24);

    /* ---- the bass hook: two notes, unchanged for four bars --------------- */
    if (s === 0 || s === 6){
      AR.sfx.tone({ t:t, freq: root*0.5, dur: s === 0 ? 0.34 : 0.18,
                    type:'square', gain:0.155, bus:'music', cutoff:230, q:3 });
    }
    if (s === 10){
      AR.sfx.tone({ t:t, freq: root*0.5*Math.pow(2,7/12), dur:0.16,
                    type:'square', gain:0.115, bus:'music', cutoff:280, q:3 });
    }

    /* ---- ONE arp figure, looping ---------------------------------------- */
    var ARP = [0, 7, 12, 7];
    if (s % 4 === 0){
      var n = ARP[(s/4) | 0];
      AR.sfx.tone({ t:t, freq: root * Math.pow(2, n/12) * 4,
                    dur:0.16, type:'square', gain:0.055,
                    bus:'music', cutoff:2400, q:2, verb:0.28 });
    }

    /* ---- a pad, once every four bars ------------------------------------ */
    if (s === 0 && bar % 4 === 0){
      [0, 7, 15].forEach(function(iv, k){
        AR.sfx.tone({ t:t + k*0.015, freq: root * Math.pow(2, iv/12),
                      dur:3.4, type:'sawtooth', gain:0.038 - k*0.007,
                      bus:'music', cutoff:760 + k*220, attack:0.35, verb:0.45 });
      });
    }
  },

  /* a bright two-note rise — unmistakable over the engine */
  checkpoint: function(){
    if(!AR) return;
    const t = AR.audio.now();
    [0, 4, 7, 12].forEach((n, i) =>
      AR.sfx.tone({ t: t + i*0.055, freq: 523.25*Math.pow(2, n/12),
                    dur: 0.30, type:'square', gain: 0.085, cutoff: 3600, verb: 0.30 }));
    AR.sfx.noise({ t, freq: 5200, to: 2400, dur: 0.12, gain: 0.05, filter:'bandpass' });
  },
  /* the last five seconds: a hard pip, rising as it runs out */
  tick: function(secondsLeft){
    if(!AR) return;
    /* ---- LOUD ENOUGH TO BE A WARNING -------------------------------------
       This fired correctly all five times and nobody ever heard it: a 0.09s
       square at 0.075 gain, against an engine, wind, tyres, traffic and music.
       A crash is 0.26. The last five seconds of a run deserve at least that.

       Three parts, so it reads as a COUNTDOWN and not a blip:
         - a hard pip that rises a step each second
         - a low body under it, so it has weight on a phone speaker
         - the last one is a longer, higher tone — you can hear which beep
           was the final one without looking at the clock
       -------------------------------------------------------------------- */
    /* ---- ONE PITCH, RISING URGENCY --------------------------------------
       A pitch that climbs each second reads as a fanfare. A countdown holds
       ONE note and gets more insistent — that is what makes it ominous rather
       than celebratory. Same 880Hz every time; what changes is how hard it is
       struck, how long it rings, and how much low weight sits under it.
       ------------------------------------------------------------------ */
    if(secondsLeft <= 0){
      /* ZERO: not a pip. The note bends DOWN and dies — the sound of the thing
         you were counting toward arriving. */
      AR.sfx.tone({ freq: 880, to: 196, dur: 0.90, type:'square',
                    gain: 0.30, cutoff: 2600, verb:0.45 });
      AR.sfx.tone({ t: AR.audio.now()+0.02, freq: 440, to: 98, dur: 0.95,
                    type:'triangle', gain: 0.20, cutoff: 1200 });
      AR.sfx.noise({ t: AR.audio.now()+0.04, freq: 900, to: 120, dur: 0.70,
                     gain: 0.10, filter:'lowpass' });
      return;
    }
    const urg = (6 - secondsLeft) / 5;          /* 0.2 at five, 1.0 at one */
    AR.sfx.tone({ freq: 880, dur: 0.13 + urg*0.10, type:'square',
                  gain: 0.22 + urg*0.16, cutoff: 3200, q:1.5 });
    AR.sfx.tone({ freq: 440, dur: 0.11 + urg*0.09, type:'triangle',
                  gain: 0.10 + urg*0.14, cutoff: 1300 });
  },

  bed: function(step, t){
    if (!AR) return;
    var s = step % 16, bar = Math.floor(step/16) % 8;

    /* --- riff: E5 E5 G5 D5 over eight bars, with a turnaround --- */
    var ROOTS = [41.20, 41.20, 48.99, 36.71, 41.20, 41.20, 32.70, 36.71];
    var root = ROOTS[bar];

    /* --- double kick: straight eighths, doubled up on the last bar --- */
    if (s % 2 === 0 || (bar === 7 && s % 1 === 0))
      AR.sfx.drum('kick', t, s % 4 === 0 ? 0.86 : 0.60);

    /* --- backbeat, hard --- */
    if (s === 4 || s === 12){
      AR.sfx.drum('snare', t, 0.62);
      AR.sfx.noise({ t:t, freq:2200, dur:0.10, gain:0.10, filter:'bandpass', q:1.2, bus:'music' });
    }
    /* --- sixteenth hats, opening on the offbeat --- */
    AR.sfx.drum('hat', t, s % 2 ? 0.20 : 0.32);
    if (s === 14) AR.sfx.drum('open', t, 0.30);
    if (bar === 7 && (s === 8 || s === 10 || s === 12 || s === 14))
      AR.sfx.drum('tom', t, 0.42);

    /* --- palm-muted sixteenths on the root: the engine of the whole thing --- */
    var gallop = (s % 4 === 0) ? 1 : (s % 2 === 0 ? 0.82 : 0.6);
    AR.sfx.tone({ t:t, freq:root, dur:0.075, type:'square', gain:0.235*gallop,
                  bus:'music', cutoff:420 + gallop*260, q:6 });
    AR.sfx.tone({ t:t, freq:root*0.5, dur:0.09, type:'square', gain:0.125*gallop,
                  bus:'music', cutoff:260, q:3 });

    /* --- power chords: root and fifth, three detuned saws for the grind --- */
    if (s === 0 || s === 3 || s === 6 || s === 11){
      var stab = s === 0 ? 0.20 : 0.145;
      [1, 1.4983, 2].forEach(function(mul, i){
        AR.sfx.tone({ t:t, freq:root*2*mul, dur:0.20, type:'sawtooth',
                      gain:stab*(i===2?0.6:1), bus:'music', cutoff:1500, q:5 });
        AR.sfx.tone({ t:t+0.004, freq:root*2*mul*1.008, dur:0.19, type:'sawtooth',
                      gain:stab*0.55*(i===2?0.6:1), bus:'music', cutoff:1400, q:5 });
      });
    }

    /* --- lead: E minor pentatonic, shredding over the back half --- */
    var PENT = [329.63, 392.00, 440.00, 493.88, 587.33, 659.25];
    if (bar >= 4){
      var run = [0,2,3,5,4,3,2,0,3,5,4,2,5,4,3,2];
      if (s % 2 === 0 || bar >= 6){
        var lf = PENT[run[s] % PENT.length] * (bar >= 6 && s % 8 > 4 ? 2 : 1);
        AR.sfx.tone({ t:t, freq:lf, dur:0.14, type:'sawtooth', gain:0.105,
                      bus:'music', cutoff:3400, q:4, verb:0.22 });
        AR.sfx.tone({ t:t+0.006, freq:lf*1.006, dur:0.13, type:'square', gain:0.055,
                      bus:'music', cutoff:3000 });
      }
    }

    /* --- a held fifth underneath, so the bottom never drops out --- */
    if (s === 0)
      AR.sfx.tone({ t:t, freq:root*1.4983, dur:0.95, type:'sawtooth', gain:0.055,
                    bus:'music', cutoff:900, attack:0.02, verb:0.3 });
  },

  /* driven every frame from the game loop */
  drive: function(spd, top, off, nos, copNear, decel){
    if (!snd.eng) return;
    var r = spd / top;
    /* The note ran 62Hz to 230Hz — under two octaves for the whole rev range,
       so the top of a gear barely sounded different from the middle and an
       upshift was almost inaudible. It now spans 58Hz to 470Hz, better than
       three octaves, so the climb to the limiter is something you can hear
       coming and the drop on a shift is unmistakable. */
    /* the WHOLE curve scales, not just the floor — a V12 is higher everywhere,
       not just at idle */
    var ep = enginePitch();
    var rpm = (58 + r * r * 300 + r * 112 + (nos ? 34 : 0)) * ep;
    snd.eng.set(rpm, 0.050 + r*0.042, 380 + r*2400, 0.05);
    snd.eng2.set(rpm*0.5, 0.024 + r*0.021, 280 + r*1400, 0.05);
    snd.wind.set(600 + r*2100, (off ? 0.045 : 0.009) + r*0.016, 0.10);

    /* thruster: present the whole time the bottle is open, and it swells a
       little with speed so it sits on top of the engine rather than under it */
    if (snd.thrust){
      if (nos) snd.thrust.set(1500 + r*1900, 0.055 + r*0.030, 0.05);
      else     snd.thrust.set(1500, 0, 0.22);
    }

    /* screech: only while genuinely shedding speed. `decel` is 0-1, how hard
       the car is slowing right now, so once it settles at the brake floor the
       sound stops even though the pedal is still down. */
    if (snd.sqA){
      var sq = Math.max(0, Math.min(1, decel || 0));
      /* the slip rate is never steady, so the pitch shivers */
      snd.scrPhase = (snd.scrPhase || 0) + 0.94;
      var wob = 1 + Math.sin(snd.scrPhase) * 0.115;
      /* silent at a crawl: tyres do not sing at 46mph */
      /* and it has to be a proper slide, not a twitch */
      if (sq > 0.30 && r > 46/200){
        /* The fundamental climbs with speed; the partials track it so the
           whole stack moves as one voice rather than three sounds. */
        var f0 = (620 + r*420) * wob;
        /* about a third of the level it was: it reads as a squeal without
           dominating the mix every time you touch the brakes */
        snd.sqA.set(f0,      0.018 + sq*0.052, f0*3.4, 0.018);
        if (snd.sqB) snd.sqB.set(f0*1.51, 0.010 + sq*0.030, f0*4.2, 0.018);
        if (snd.sqC) snd.sqC.set(f0*2.02, 0.006 + sq*0.018, f0*5.0, 0.018);
        if (snd.screechLow)
          snd.screechLow.set(260 + r*180, 0.018 + sq*0.042, 0.030);
      } else {
        snd.sqA.set(620, 0, 2000, 0.05);
        if (snd.sqB) snd.sqB.set(940, 0, 2600, 0.05);
        if (snd.sqC) snd.sqC.set(1260, 0, 3200, 0.05);
        if (snd.screechLow) snd.screechLow.set(280, 0, 0.08);
      }
    }

    /* your own bar wails too, and louder than a distant pursuit */
    var mine = (typeof barOn !== 'undefined' && barOn) ? 1.25 : 0;
    var wail = Math.max(copNear, mine);
    if (wail > 0){
      snd.sirenPhase += 0.055;
      var two = Math.sin(snd.sirenPhase) > 0 ? 760 : 560;
      snd.siren.set(two, 0.048 * wail, 2600, 0.02);
    } else {
      snd.siren.set(undefined, 0, undefined, 0.15);
    }
  },
  /* ---- THE LAUNCH ------------------------------------------------------
     Tyres letting go for a moment: a bark of noise that falls in pitch as they
     find grip, with the engine's own note flaring under it. Scales with the
     kick so a gentle drop chirps and a hard one screams.
     ------------------------------------------------------------------- */
  launch: function(k){
    if(!AR) return;
    const t = AR.audio.now();
    const g = Math.min(1, k);
    AR.sfx.noise({ t, freq: 1800 + g*900, to: 420, dur: 0.16 + g*0.34,
                   gain: 0.10 + g*0.26, filter:'bandpass', q:1.6 });
    AR.sfx.tone({ t, freq: 150 + g*90, to: 70, dur: 0.20 + g*0.26,
                  type:'sawtooth', gain: 0.10 + g*0.16, cutoff: 900 });
    if(g > 0.45)
      AR.sfx.noise({ t: t+0.05, freq: 900, to: 260, dur: 0.30,
                     gain: 0.10 * g, filter:'lowpass' });
  },

  quiet: function(){
    if (!snd.eng) return;
    snd.eng.set(60, 0.01, 300, 0.4);
    snd.eng2.set(30, 0, 260, 0.4);
    snd.wind.set(400, 0, 0.4);
    snd.siren.set(undefined, 0, undefined, 0.3);
    if (snd.thrust)  snd.thrust.set(1500, 0, 0.3);
    if (snd.sqA) snd.sqA.set(620, 0, 2000, 0.3);
    if (snd.sqB) snd.sqB.set(940, 0, 2600, 0.3);
    if (snd.sqC) snd.sqC.set(1260, 0, 3200, 0.3);
    if (snd.screechLow) snd.screechLow.set(280, 0, 0.3);
  },

  nearMiss: function(){
    if (!AR) return;
    AR.sfx.noise({ freq:400, to:2600, dur:0.24, gain:0.095, filter:'bandpass', q:1.1 });
  },
  nitro: function(){
    if (!AR) return;
    var t = AR.audio.now();
    AR.sfx.noise({ t:t, freq:300, to:5200, dur:0.5, gain:0.11, filter:'bandpass', q:0.8 });
    AR.sfx.tone({ t:t, freq:180, to:900, dur:0.4, type:'sawtooth', gain:0.10, cutoff:2400 });
  },
  bump: function(hard){
    if (!AR) return;
    var t = AR.audio.now();
    AR.sfx.noise({ t:t, freq:1600, to:120, dur:hard?0.5:0.28, gain:hard?0.26:0.17,
                   filter:'lowpass', q:1.6 });
    AR.sfx.tone({ t:t, freq:hard?140:190, to:48, dur:hard?0.42:0.24, type:'square',
                  gain:hard?0.15:0.10, cutoff:800 });
    AR.sfx.noise({ t:t+0.04, freq:3400, dur:0.16, gain:hard?0.14:0.08, filter:'highpass' });
  },
  copDown: function(){
    if (!AR) return;
    var t = AR.audio.now();
    AR.sfx.noise({ t:t, freq:2200, to:70, dur:0.85, gain:0.22, filter:'lowpass', q:1.2 });
    AR.sfx.tone({ t:t, freq:220, to:40, dur:0.9, type:'sawtooth', gain:0.16, cutoff:900 });
    AR.sfx.tone({ t:t+0.28, freq:1300, to:300, dur:0.5, type:'sine', gain:0.06, verb:0.5 });
  },
  warn: function(){
    if (!AR) return;
    var t = AR.audio.now();
    for (var i=0;i<3;i++)
      AR.sfx.tone({ t:t+i*0.20, freq:1180, dur:0.11, type:'square', gain:0.15, cutoff:3000 });
  },
  threaded: function(){
    if (!AR) return;
    var t = AR.audio.now();
    [659.25, 880, 1318.5].forEach(function(f,i){
      AR.sfx.tone({ t:t+i*0.07, freq:f, dur:0.3, type:'square', gain:0.12, cutoff:4000, verb:0.4 });
    });
  },
  dead: function(){
    if (!AR) return;
    var t = AR.audio.now();
    AR.sfx.noise({ t:t, freq:2600, to:60, dur:1.5, gain:0.26, filter:'lowpass', q:1.4 });
    AR.sfx.tone({ t:t, freq:260, to:34, dur:1.7, type:'sawtooth', gain:0.18, cutoff:700, verb:0.5 });
    snd.quiet();
  }
};

/* ---------- sizing ---------- */
function resize(){
  const r = cv.getBoundingClientRect();
  if(!r.width||!r.height) return;
  dpr = Math.min(2, window.devicePixelRatio||1);
  W = r.width; H = r.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  horizon = Math.round(H*0.40);
  skyline = null;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', ()=>setTimeout(resize,150));

/* ---------- projection ---------- */
/* ---- where the road sits on the glass ------------------------------------
   With touch controls the right-hand third of the screen is pedals, dials and
   the bottle, so a centred road puts the car under the furniture. Shifting the
   whole view LEFT centres it in the space actually left over. On desktop the
   controls are gone, so it re-centres.
   -------------------------------------------------------------------------- */
let viewShift = 0;
function updateViewShift(){
  const noTouch = document.body.classList.contains('no-touch');
  viewShift = noTouch ? 0 : -W * 0.085;
}
/* ---- THE ROAD BENDS -------------------------------------------------------
   A pseudo-3D road curves by displacing each segment sideways as it recedes.
   The classic way is to accumulate the offset while drawing, but `proj()` is
   called from everywhere — sprites, skids, the mirror — so it needs a value
   any z can be asked for.

   `bendAt(z)` is the lateral displacement of the road CENTRELINE at z, built by
   integrating curvature twice and cached at 400-unit resolution. Everything
   that lives on the road — you, traffic, rivals, cruisers, lamp posts — keeps
   its lane position and gets the bend added in projection, so nothing needs to
   know the road is turning. It just is.
   -------------------------------------------------------------------------- */
/* ---- the two cornering dials ---------------------------------------------
   CORNER_G  how hard a bend throws you, everything else being equal. The only
             arbitrary number in the model — raise it if corners feel like
             scenery, lower it if they feel like ice.
   CORNER_LAG how quickly the load builds and bleeds as you enter and leave a
             bend. Higher is snappier, lower is more languid.
   The force itself is curvature x speed^2, which is real: a corner taken flat
   at 90 pulls a quarter of what it does at 180.
   -------------------------------------------------------------------------- */
/* ---- GRIP IS A PER-CAR STAT NOW ----------------------------------------
   On a straight road this was a global feel dial, because a corner you can
   take flat is a corner nobody has to think about. On a circuit it is the
   third axis — top speed, acceleration, and how hard you can lean on a bend.

   `CORNER_G` is the force a bend exerts on YOU, so a HIGHER number is a car
   that gets pushed wide more easily. Grip is therefore its inverse: a grippy
   car has a low `CORNER_G`.

   EVERY car carries the stat now. It was set on the three sports cars only,
   and the other eleven silently defaulted to 1.0 — which meant a formula car
   and a lorry cornered identically, and the only reason nobody noticed is that
   Interstate has no corners worth the name.
   ------------------------------------------------------------------------ */
const CORNER_G_BASE = 0.42, CORNER_LAG = 1.8;
function cornerG(){
  const g = ((BODY[optBody] && BODY[optBody].grip) || 1) * wetGrip();
  return CORNER_G_BASE / g;
}

const BEND_STEP = 300;
let bendCache = [], slopeCache = [], hillCache = [], gradCache = [];
let bendZ0 = 0, curveSegs = [], hillSegs = [];

/* the sequence of bends, generated ahead as the road is consumed */
let signs = [];
function pushCurve(){
  const roll = Math.random();
  let k, len;
  if(roll < 0.30){ k = 0;                     len = rnd(7000, 15000); }
  else if(roll < 0.56){ k = rnd(0.9, 1.9);    len = rnd(6000, 12000); }
  else if(roll < 0.82){ k = rnd(2.4, 4.2);    len = rnd(5000, 10000); }
  else {                k = rnd(5.0, 8.0);    len = rnd(4000, 7000); }
  if(k && Math.random() < 0.5) k = -k;
  /* ---- warning boards ----------------------------------------------------
     A bend you cannot see coming is a trap rather than a corner. Every turn
     gets a board a little way before it, on the OUTSIDE of the bend where you
     are looking anyway, carrying one chevron for a gentle curve, two for a
     medium and three for a hard one. Straight from Out Run, and the reason its
     corners feel fair at speed.
     ------------------------------------------------------------------------ */
  const startZ = bendZ0 + totalLen(curveSegs);
  if(k !== 0){
    const mag = Math.abs(k) < 2.0 ? 1 : Math.abs(k) < 4.4 ? 2 : 3;
    signs.push({ z: startZ - 5200, dir: Math.sign(k), mag,
                 side: Math.sign(k) > 0 ? 1 : -1 });
  }
  curveSegs.push({ k, len });
  if(k !== 0) curveSegs.push({ k:0, len: rnd(3500, 7000) });
}
/* ---- and the road rises and falls -------------------------------------- */
function pushHill(){
  const roll = Math.random();
  let g2, len;
  if(roll < 0.34){ g2 = 0;                    len = rnd(8000, 16000); }
  else if(roll < 0.66){ g2 = rnd(1.2, 2.8);   len = rnd(6000, 12000); }
  else {                g2 = rnd(3.4, 5.6);   len = rnd(5000, 9000); }
  if(g2 && Math.random() < 0.5) g2 = -g2;
  hillSegs.push({ k:g2, len });
  if(g2 !== 0) hillSegs.push({ k:0, len: rnd(3000, 6000) });
}
function segAt(list, z){
  let acc = bendZ0;
  for(const seg of list){
    if(z < acc + seg.len) return seg.k;
    acc += seg.len;
  }
  return 0;
}
function curvatureAt(z){
  /* a circuit answers here; an endless road falls through */
  if(CFG.curvature) return CFG.curvature(z);
  return segAt(curveSegs, z);
}
function gradeAt(z){
  if(CFG.grade) return CFG.grade(z);
  return segAt(hillSegs, z);
}

/* is this stretch straight AND level enough to put a roadblock across? */
function isStraight(z){
  return Math.abs(curvatureAt(z)) < 0.30 &&
         Math.abs(curvatureAt(z + 6000)) < 0.30 &&
         Math.abs(gradeAt(z)) < 1.0;
}

function totalLen(list){ let t=0; for(const s2 of list) t += s2.len; return t; }
function rebuildBend(){
  const need = pos + 100000;
  while(bendZ0 + totalLen(curveSegs) < need) pushCurve();
  while(bendZ0 + totalLen(hillSegs)  < need) pushHill();
  while(curveSegs.length > 1 && bendZ0 + curveSegs[0].len < pos - 40000){
    const drop = curveSegs[0].len;
    curveSegs.shift();
    /* hills are indexed off the same origin, so they must shift together */
    let acc = 0;
    while(hillSegs.length > 1 && acc + hillSegs[0].len <= drop){ acc += hillSegs[0].len; hillSegs.shift(); }
    if(hillSegs.length) hillSegs[0].len -= (drop - acc);
    bendZ0 += drop;
  }
  /* ---- integrate, in SCREEN PIXELS ---------------------------------------
     THIS is what was wrong. The offset was being multiplied by `scale` in the
     projection, so it shrank to nothing at distance and every road converged
     on the same vanishing point — which is why four "bends" came out as four
     straights from slightly different angles.

     A pseudo-3D bend is applied in SCREEN SPACE: each segment further away is
     nudged sideways by the accumulated curvature, un-scaled, so the far end of
     the road swings right off the side of the glass. Same for hills, only
     vertically.
     ------------------------------------------------------------------------ */
  signs = signs.filter(sg => sg.z > pos - 4000);
  bendCache = []; slopeCache = []; hillCache = []; gradCache = [];
  let dx = 0, x = 0, dy = 0, y = 0;
  /* ---- THE ROAD WAS DRAWN STRAIGHT ON EVERY CIRCUIT --------------------
     `span` is how far ahead the bend is integrated, and it was measured from
     `curveSegs` — the ENDLESS road's segment list, which a circuit never
     fills. So on Motorsport the span was one step, the bend cache held a single
     entry, and the road rendered dead straight.

     The map was right, the physics was right, the car was being pushed
     sideways by a curvature the picture never showed. A hairpin looked like a
     motorway.

     A fork supplies its own length, and the integration runs over it.
     ------------------------------------------------------------------- */
  const span = (CFG.roadSpan ? CFG.roadSpan()
              : Math.max(totalLen(curveSegs), totalLen(hillSegs))) + BEND_STEP;
  for(let z = bendZ0; z < bendZ0 + span; z += BEND_STEP){
    bendCache.push(x);  slopeCache.push(dx);
    hillCache.push(y);  gradCache.push(dy);
    dx += curvatureAt(z) * 0.010;
    x  += dx;
    dy += gradeAt(z) * 0.010;
    y  += dy;
  }
}
/* ===========================================================================
   BILLBOARD ANGLES

   A car ahead of you in a corner is not showing you its back — it is showing
   you its flank, and by how much depends on how far the road has turned
   between your position and theirs.

   That number is already cached. `slopeCache` holds the heading at every z, so
   the relative angle is a subtraction:

       yaw = slope(theirZ) - slope(myZ)

   Pick a sprite from it, the way every arcade racer since Pole Position has:
   rear when they are pointing away, three-quarter as they turn in, full
   profile through the apex. The road cannot bend past 90 degrees on screen,
   but the CARS can look right the whole way, and the same system is what a
   kart racer needs to show a rival mid-drift.
   =========================================================================== */
/* ---- THE SIDE VIEW ------------------------------------------------------
   A car from the flank is a different drawing, not a squashed rear: a long
   low body, a cabin set back, two wheels under the arches, and the lights at
   the ends rather than across the tail.

   `squash` is how much of the length is foreshortened — 1.0 is dead side-on,
   0.45 is the three-quarter view. One painter serves both, because a
   three-quarter IS a profile seen at an angle plus a sliver of the back.
   -------------------------------------------------------------------------- */
/* ---- NOT BUILT, AND KEPT ON PURPOSE -------------------------------------
   `paintProfile` and `paintQuarter` are no longer generated: on a circuit
   every car faces the way you do, so a rear sprite is the only view needed.
   They are kept because a KART RACER does need them — a rival mid-drift is
   side-on to you by definition, and that game is on the planned list.

   Dead until then, deliberately.
   -------------------------------------------------------------------------- */
function paintProfile(o){
  return function(g, w, h){
    const P = o;
    const x0 = w*0.045, L = w*0.91;
    const bot  = h*0.845;
    const sill = h*0.615;          /* the line the doors sit on */
    const belt = h*0.520;          /* where glass meets metal */
    const roof = h*0.320;

    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(w*0.5, bot+h*0.020, L*0.50, h*0.038, 0, 0, 6.2832); g.fill();

    /* ---- wheels, with arches cut around them ------------------------------ */
    const wr = h*0.125, wy = bot - wr*0.72;
    const wheels = [x0 + L*0.215, x0 + L*0.795];
    for(const wx of wheels){
      g.fillStyle = '#0b0d11';
      g.beginPath(); g.arc(wx, wy, wr, 0, 6.2832); g.fill();
      g.fillStyle = '#c9d2dd';
      g.beginPath(); g.arc(wx, wy, wr*0.50, 0, 6.2832); g.fill();
      g.fillStyle = '#7b838f';
      g.beginPath(); g.arc(wx, wy, wr*0.20, 0, 6.2832); g.fill();
    }

    /* ---- the body: a wedge, nose low, tail cut off ----------------------- */
    const bg = g.createLinearGradient(0, belt, 0, bot);
    bg.addColorStop(0, P.hi); bg.addColorStop(0.38, P.body);
    bg.addColorStop(0.80, P.body); bg.addColorStop(1, P.lo);
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(x0 + L*0.995, sill - h*0.045);            /* nose top */
    g.quadraticCurveTo(x0 + L*1.005, sill + h*0.030, x0 + L*0.965, sill + h*0.055);
    g.lineTo(x0 + L*0.885, sill + h*0.070);            /* along the sill */
    g.lineTo(x0 + L*0.700, sill + h*0.082);
    g.lineTo(x0 + L*0.300, sill + h*0.082);
    g.lineTo(x0 + L*0.110, sill + h*0.070);
    g.quadraticCurveTo(x0 - L*0.005, sill + h*0.040, x0 + L*0.005, sill - h*0.055);
    g.lineTo(x0 + L*0.030, belt + h*0.008);            /* the tail face */
    g.lineTo(x0 + L*0.300, belt - h*0.006);            /* deck to the cabin */
    g.lineTo(x0 + L*0.760, belt + h*0.004);
    g.quadraticCurveTo(x0 + L*0.930, belt + h*0.020, x0 + L*0.995, sill - h*0.045);
    g.closePath(); g.fill();

    /* the arches, punched out of it */
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for(const wx of wheels){
      g.beginPath(); g.arc(wx, wy, wr*1.14, Math.PI, 0); g.fill();
    }
    g.restore();

    /* ---- the greenhouse: raked screen, fastback tail ---------------------- */
    g.fillStyle = P.lo;
    g.beginPath();
    g.moveTo(x0 + L*0.300, belt);
    g.lineTo(x0 + L*0.400, roof + h*0.010);
    g.lineTo(x0 + L*0.605, roof);
    g.quadraticCurveTo(x0 + L*0.715, roof + h*0.030, x0 + L*0.762, belt);
    g.closePath(); g.fill();
    const gg = g.createLinearGradient(0, roof, 0, belt);
    gg.addColorStop(0, '#4a5f78'); gg.addColorStop(0.5, '#18222e'); gg.addColorStop(1, '#0d131b');
    g.fillStyle = gg;
    g.beginPath();
    g.moveTo(x0 + L*0.325, belt - h*0.008);
    g.lineTo(x0 + L*0.415, roof + h*0.026);
    g.lineTo(x0 + L*0.596, roof + h*0.018);
    g.quadraticCurveTo(x0 + L*0.695, roof + h*0.044, x0 + L*0.738, belt - h*0.008);
    g.closePath(); g.fill();
    /* the B-pillar */
    g.fillStyle = P.lo;
    g.fillRect(x0 + L*0.470, roof + h*0.020, L*0.020, belt - roof - h*0.026);

    /* ---- detail: sill shadow, door line, mirror -------------------------- */
    g.fillStyle = 'rgba(0,0,0,.30)';
    g.fillRect(x0 + L*0.115, sill + h*0.056, L*0.775, h*0.020);
    g.strokeStyle = 'rgba(0,0,0,.26)';
    g.lineWidth = Math.max(1, h*0.008);
    g.beginPath();
    g.moveTo(x0 + L*0.480, belt + h*0.004);
    g.lineTo(x0 + L*0.470, sill + h*0.068);
    g.stroke();
    g.fillStyle = P.lo;
    g.beginPath();
    g.ellipse(x0 + L*0.700, belt + h*0.014, L*0.024, h*0.020, 0, 0, 6.2832); g.fill();

    /* the shoulder highlight that makes it read as metal */
    g.strokeStyle = 'rgba(255,255,255,.20)';
    g.lineWidth = Math.max(1, h*0.011);
    g.beginPath();
    g.moveTo(x0 + L*0.055, belt + h*0.030);
    g.lineTo(x0 + L*0.930, belt + h*0.040);
    g.stroke();

    /* lights: tail LEFT, head RIGHT, because the car points right */
    g.fillStyle = P.lamp || '#d61b3c';
    rr(g, x0 + L*0.012, belt + h*0.026, L*0.034, h*0.042, 2); g.fill();
    g.fillStyle = '#fff6dd';
    rr(g, x0 + L*0.952, sill - h*0.030, L*0.036, h*0.034, 2); g.fill();
  };
}

/* ---- THE THREE-QUARTER IS A DIFFERENT DRAWING -----------------------------
   Not a narrow profile. A three-quarter shows the TAIL and one FLANK at the
   same time: the back face compressed toward you, and the side receding away
   from its edge to a vanishing point. Two faces meeting at the corner of the
   car, which is the whole reason the view reads as three-dimensional.
   -------------------------------------------------------------------------- */
function paintQuarter(o){
  return function(g, w, h){
    const P = o;
    const bot = h*0.845, belt = h*0.520, roof = h*0.330, sill = h*0.615;
    /* the tail face occupies the left third; the flank recedes to the right */
    const tx = w*0.055, tw = w*0.300;          /* tail face */
    const vx = w*0.965;                        /* the far end of the flank */

    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(w*0.48, bot+h*0.020, w*0.46, h*0.038, 0, 0, 6.2832); g.fill();

    /* the near wheel, under the tail */
    const wr = h*0.120;
    g.fillStyle = '#0b0d11';
    g.beginPath(); g.arc(tx + tw*0.62, bot - wr*0.72, wr, 0, 6.2832); g.fill();
    g.fillStyle = '#c9d2dd';
    g.beginPath(); g.arc(tx + tw*0.62, bot - wr*0.72, wr*0.48, 0, 6.2832); g.fill();
    /* the far wheel, smaller and higher — perspective */
    const wr2 = wr*0.72;
    g.fillStyle = '#0b0d11';
    g.beginPath(); g.arc(vx - w*0.075, bot - wr2*1.35, wr2, 0, 6.2832); g.fill();
    g.fillStyle = '#9aa4b1';
    g.beginPath(); g.arc(vx - w*0.075, bot - wr2*1.35, wr2*0.44, 0, 6.2832); g.fill();

    /* ---- the FLANK, receding ------------------------------------------- */
    const fg = g.createLinearGradient(tx+tw, 0, vx, 0);
    fg.addColorStop(0, P.body); fg.addColorStop(1, P.lo);
    g.fillStyle = fg;
    g.beginPath();
    g.moveTo(tx + tw, belt - h*0.010);
    g.lineTo(vx, belt + h*0.030);                    /* the far top edge */
    g.lineTo(vx, sill + h*0.046);
    g.lineTo(tx + tw, sill + h*0.078);
    g.closePath(); g.fill();
    /* ---- ITS GREENHOUSE, WHICH IS NOT THE WHOLE FLANK -------------------
       My first attempt ran the glass from the tail all the way to the nose in
       one dark wedge, which is why it read as a doorstop rather than a car.
       A cabin sits in the MIDDLE of the flank: metal ahead of it, metal
       behind it, and a roof that comes down at both ends.
       ------------------------------------------------------------------ */
    const cA = tx + tw*1.02, cB = vx - w*0.285;      /* where the cabin lives */
    const rY = roof + h*0.055;
    g.fillStyle = P.lo;
    g.beginPath();
    g.moveTo(cA, belt + h*0.004);
    g.lineTo(cA + (cB-cA)*0.22, rY);
    g.lineTo(cB - (cB-cA)*0.16, rY + h*0.026);
    g.lineTo(cB, belt + h*0.030);
    g.closePath(); g.fill();
    const qg = g.createLinearGradient(cA, 0, cB, 0);
    qg.addColorStop(0, '#2b3b4e'); qg.addColorStop(1, '#101822');
    g.fillStyle = qg;
    g.beginPath();
    g.moveTo(cA + (cB-cA)*0.04, belt - h*0.002);
    g.lineTo(cA + (cB-cA)*0.25, rY + h*0.016);
    g.lineTo(cB - (cB-cA)*0.19, rY + h*0.038);
    g.lineTo(cB - (cB-cA)*0.05, belt + h*0.024);
    g.closePath(); g.fill();
    /* the pillar between the two side windows */
    g.fillStyle = P.lo;
    g.fillRect(cA + (cB-cA)*0.48, rY + h*0.020, (cB-cA)*0.045, belt - rY + h*0.002);

    /* ---- the TAIL face, nearly square on ------------------------------- */
    const bg = g.createLinearGradient(tx, 0, tx+tw, 0);
    bg.addColorStop(0, P.lo); bg.addColorStop(0.45, P.body); bg.addColorStop(1, P.hi);
    g.fillStyle = bg;
    g.beginPath();
    g.moveTo(tx, belt + h*0.010);
    g.lineTo(tx + tw, belt - h*0.010);
    g.lineTo(tx + tw, sill + h*0.078);
    g.lineTo(tx, sill + h*0.066);
    g.closePath(); g.fill();
    /* the rear glass on the tail face */
    g.fillStyle = P.lo;
    g.beginPath();
    g.moveTo(tx + tw*0.10, belt + h*0.006);
    g.lineTo(tx + tw*0.26, roof + h*0.022);
    g.lineTo(tx + tw*0.94, roof + h*0.030);
    g.lineTo(tx + tw*0.98, belt - h*0.010);
    g.closePath(); g.fill();
    g.fillStyle = '#141c26';
    g.beginPath();
    g.moveTo(tx + tw*0.16, belt);
    g.lineTo(tx + tw*0.30, roof + h*0.040);
    g.lineTo(tx + tw*0.90, roof + h*0.046);
    g.lineTo(tx + tw*0.92, belt - h*0.006);
    g.closePath(); g.fill();

    /* the corner crease where the two faces meet — this is what sells it */
    g.strokeStyle = 'rgba(255,255,255,.26)';
    g.lineWidth = Math.max(1, h*0.010);
    g.beginPath();
    g.moveTo(tx + tw, belt - h*0.010);
    g.lineTo(tx + tw, sill + h*0.078);
    g.stroke();

    /* tail lights on the tail face, one head lamp glimpsed at the far end */
    g.fillStyle = P.lamp || '#d61b3c';
    rr(g, tx + tw*0.10, belt + h*0.040, tw*0.34, h*0.040, 2); g.fill();
    rr(g, tx + tw*0.56, belt + h*0.036, tw*0.34, h*0.040, 2); g.fill();
    g.fillStyle = 'rgba(255,246,221,.85)';
    rr(g, vx - w*0.035, belt + h*0.062, w*0.030, h*0.026, 2); g.fill();
  };
}

function yawTo(z){
  /* ---- MEASURED, NOT GUESSED -------------------------------------------
     My first constant was 0.055 and the yaw never exceeded 0.06 over 30,000
     units of road — so every car stayed on the REAR sprite and the whole
     system was dead code.

     The honest number comes from the geometry rather than the screen cache:
     the road's heading changes by `k * K * dz`, which is the same integral
     the shape walker uses. Integrating the real curvature between here and
     there gives radians directly.
     ------------------------------------------------------------------- */
  const K = (CFG.curveK ? CFG.curveK() : 0.00028);
  const step = 900;
  const a = Math.min(pos, z), b = Math.max(pos, z);
  let ang = 0;
  for(let q = a; q < b; q += step) ang += curvatureAt(q) * K * step;
  /* ---- ONLY WHAT YOU CAN SEE -------------------------------------------
     Integrating all the way to a car 21,000 units up the road saturated at
     the clamp, because that is 3.5% of a lap and a circuit turns 360 degrees
     over one. But you cannot SEE a car through a corner — by the time the
     road has turned 90 degrees it has left the frame.

     The angle that matters is the one accumulated over the DRAWN road, so it
     is clamped to a right angle and the far cars simply sit at profile, which
     is what they would look like anyway.
     ------------------------------------------------------------------- */
  const HALF_PI = Math.PI * 0.5;
  return Math.max(-HALF_PI, Math.min(HALF_PI, z < pos ? -ang : ang));
}

/* which of the angled sprites to draw, and whether to mirror it */
function billboard(z){
  const y = yawTo(z);
  const a = Math.abs(y);
  const flip = y < 0;
  if(a < 0.16) return { view:'rear',    flip:false };
  if(a < 0.52) return { view:'quarter', flip:flip };
  return              { view:'profile', flip:flip };
}

function lookup(arr, z){
  if(!arr.length) return 0;
  const f = (z - bendZ0) / BEND_STEP;
  if(f <= 0) return arr[0];
  const i2 = f|0;
  if(i2 >= arr.length-1) return arr[arr.length-1];
  const t = f - i2;
  return arr[i2]*(1-t) + arr[i2+1]*t;
}
/* Relative to the camera: at your own position the road is dead ahead and
   level, so both the offset AND the slope at `pos` are subtracted out. */
function bendPx(z){
  return lookup(bendCache, z) - lookup(bendCache, pos)
       - lookup(slopeCache, pos) * ((z - pos)/BEND_STEP);
}
function hillPx(z){
  return lookup(hillCache, z) - lookup(hillCache, pos)
       - lookup(gradCache, pos) * ((z - pos)/BEND_STEP);
}

function proj(worldX, worldZ){
  const dz = worldZ - pos;
  const scale = CAM_D/dz;
  return {
    ok: dz > 30,
    scale,
    /* ---- THE BEND IS A SCREEN OFFSET, NOT A WORLD ONE -------------------
       This was inside the `scale*` term, so the further away a slice was the
       SMALLER its displacement became — every slice converged on the same
       vanishing point and the road stayed dead straight while the whole thing
       slid sideways. That is a camera pan, not a corner.

       In a pseudo-3D racer the offset accumulates in SCREEN space and is not
       divided by distance: near slices barely move, far slices swing right off
       the side of the glass, and the road visibly curves away. Out Run does
       exactly this. `bendAt()` returns pixels now and is added AFTER the
       perspective term.
       ---------------------------------------------------------------------- */
    x: W/2 + viewShift + scale*(worldX - camX*ROAD)*W/2 + bendPx(worldZ),
    y: horizon + scale*CAM_H*H/2 + hillPx(worldZ),
    w: scale*ROAD*W/2
  };
}

/* ---------- sprites ---------- */
/* ---- A STRIPE IS THE CAR'S OWN COLOUR, DARKER ----------------------------
   Four hardcoded greys meant a red car wore charcoal stripes and a white one
   wore the same charcoal — they read as a decal stuck on rather than paint.
   `shade()` takes the body colour and drops it toward black, so the stripe is
   always the same hue as the car and always reads against it.
   ------------------------------------------------------------------------- */
/* light body -> dark band; dark body -> WHITE band. Measured off the body's
   own luminance rather than named colours, so it holds for anything. */
function liveryBand(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return 'rgba(20,26,40,.85)';
  const n = parseInt(m[1], 16);
  const lum = (0.299*((n>>16)&255) + 0.587*((n>>8)&255) + 0.114*(n&255)) / 255;
  return lum < 0.45 ? 'rgba(238,243,250,.92)' : shade(hex, 0.34);
}

/* ---- HOW WIDE THE STRIPES ARE ------------------------------------------
   STALLION and CREST are the widest bodies, so a stripe that reads as bold on
   MATADOR looks like a pinstripe on them. The pair is defined ONCE here, by
   body, and both the front and the rear painter read it — so the two ends can
   never disagree about the width or the gap.
   ------------------------------------------------------------------------ */
const STRIPE_W = { 'STALLION':0.115, 'CREST':0.115, 'MATADOR':0.085 };
function stripeCols(key){
  const w = STRIPE_W[key] || 0.085;
  const gap = w * 0.28;                       /* the lane between them */
  return { w:w, xs:[0.5 - w - gap/2, 0.5 + gap/2] };
}

function shade(hex, k){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if(!m) return 'rgba(22,24,30,.62)';
  const n = parseInt(m[1], 16);
  const r = Math.round(((n>>16)&255) * k);
  const g2 = Math.round(((n>>8)&255) * k);
  const b = Math.round((n&255) * k);
  return 'rgb(' + r + ',' + g2 + ',' + b + ')';
}

/* the pure helpers go onto the surface AS SOON AS THEY EXIST, because a seam
   like `onReset` fires during setup and needs them before ROAD() returns */
function rr(g,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath();
}
function sprite(w,h,paint){
  const c = document.createElement('canvas');
  c.width=w; c.height=h;
  paint(c.getContext('2d'), w, h);
  return c;
}

// generic rear-of-car painter
/* ---- the three cars ------------------------------------------------------
   Not three colours of the same shape. Each has its own proportions, and the
   silhouette is what you recognise at a glance in a mirror:

     STALLION  long nose, cab set back, a shallow ducktail  — the front-engined
             grand tourer
     MATADOR  wedge. Flat, wide, hard shoulders, a big rear wing — the mid-
             engined poster car
     CREST  rounded haunches over the rear wheels, low roof, integrated lip —
             the rear-engined one
   -------------------------------------------------------------------------- */
/* Each also DRIVES differently, and the numbers follow the shape rather than
   being decoration: the long-nosed GT is geared for a top end and takes its
   time getting there; the winged wedge has the downforce and the short gearing
   to leap but pays for it in drag; the rear-engined one puts its weight over
   the driven wheels and sits between them.

   `pull` scales acceleration, `vmax` scales top speed. They pull in opposite
   directions on purpose so no car is simply better. */
const BODY = {
  /* Pushed genuinely apart. They shared a greenhouse, an arch size and a deck
     height, so only the tail treatment told them apart — which is not enough at
     road distance. Width, roof height, arch size and glass rake now all differ:

       F  the WIDEST and lowest-roofed, a long flat deck, modest arches
       L  narrow cabin, tall deck, the BIGGEST arches, hard-edged
       P  narrowest overall, tall domed roof, arches that dominate the flanks
  */
  'STALLION': { bodyTop:0.44, cabinTop:0.19, cabW:0.62, cabOff:0, roofR:0.06,
              /* cabOff shifts the cabin SIDEWAYS, not backwards — 0.04 was putting the
                 greenhouse visibly off centre on the body. The long-nose look
                 comes from the deck height, not from moving the roof. */
              hip:0.055, wing:'lip',   nose:0.30, spoiler:true, rear:'STALLION', wide:0.075, arch:0.85, horn:1.19,
              /* 200mph is the ceiling the whole game is scaled to, so the
                 fastest car sits AT it and the others come down from there —
                 anything above 1.0 was simply clamped and two cars tied. */
              /* ---- every supercar must out-run a cruiser ------------------------
                 AI_TOP is 180 and MATADOR was 172, so a police car could simply
                 drive away from the thing you had chosen to drive. The slowest
                 of the three is 188 now: they still differ, but the floor is
                 above anything else on the road. */
              mass:1520, hp:710, grip:1.34, brake:1.30, pull:0.84, vmax:1.03, note:'SLOWER OFF THE LINE \u00B7 HIGHEST TOP END' },
  'MATADOR': { bodyTop:0.52, cabinTop:0.24, cabW:0.44, cabOff:0.00, roofR:0.02,
              hip:0.105, wing:'high',  nose:0.16, spoiler:true, rear:'MATADOR', wide:0.045, arch:1.30, horn:1.06,
              mass:1580, hp:690, grip:1.38, brake:1.28, pull:1.24, vmax:0.97, note:'FASTEST OFF THE LINE \u00B7 LOWEST TOP END' },
  /* ---- THE PRIZE ---------------------------------------------------------
     A Formula car: highest acceleration AND highest top end, which breaks the
     trade every other car obeys. That is the point of a prize — it is not
     another option, it is better, and you had to win a tournament for it. */
  'FORMULA': { bodyTop:0.52, cabinTop:0.30, cabW:0.30, cabOff:0, roofR:0.02,
              hip:0.135, wing:'high', nose:0.10, spoiler:true,
              wide:0.145, arch:1.45, horn:1.42, rear:'FORMULA', redline:15000, pitch:1.55,
              mass:740, hp:1000, grip:1.95, brake:1.85, pull:1.34, vmax:1.09, note:'FORMULA · NO COMPROMISE' },
  /* ---- THE TWO CONSOLATION CARS ----------------------------------------
     A silver unlocks TUNER, a bronze unlocks MUSCLE. Both are ROAD cars and
     both are slower than any supercar — they are a reward for a good
     tournament, not a shortcut past one. They rev to 10,000 rather than
     12,000 and sound it: lower pitch, lower horns.

     Between themselves they mirror the supercars' trade — the tuner pulls
     harder and runs out sooner, the muscle car the other way — but both
     ceilings sit under MATADOR's 194, so no unlock ever beats the entry car on
     both counts. */
  /* `rig` means: draw this one with the TRAFFIC painter, not the supercar
     one. They are the tuner and the muscle car you already designed — giving
     them a Lamborghini and a Ferrari tail was my mistake, not a decision.
     `gears` is their own box: a muscle car has four, a tuner five. */
  /* ---- THE THREE THAT SIT BETWEEN ---------------------------------------
     These are not TYPE cars and they are not ordinary traffic. They are the
     best of what is on the road: marginally quicker than a stock coupe,
     comfortably slower than the slowest racer. That is the whole rung.

         MATADOR      194mph   2.9s     <- the racers
         CRUISER     190      4.0
         MUSCLE      184      4.9
         TUNER       172      3.2
         COUPE       160      6.0      <- ordinary traffic
     -------------------------------------------------------------------- */
  /* ---- THE SPORTS LEAGUE: A TRIANGLE, NOT A LADDER -----------------------
     Three cars, each best at exactly one thing and worst at another, so no
     one of them is the right answer on every circuit:

       TUNER     BEST acceleration   worst top speed    average grip
       MUSCLE    average             BEST top speed     worst grip
       ROADSTER  worst acceleration  average top        BEST GRIP

     Each is best at exactly one thing and WORST at exactly one other. My first
     pass made ROADSTER middling at both straight-line stats and best at grip,
     which is not a trade — it is simply the best car. It has to give something
     up, and for a small light underpowered thing the honest thing to give up
     is the launch.

     ROADSTER is the one the fork needed. It is small, light and
     underpowered — it loses every straight and it can carry speed through a
     corner neither of the others can touch. On a twisty procgen circuit it
     wins; on a fast one it is nowhere. That is the whole point of a league.
     -------------------------------------------------------------------- */
  'ROADSTER': { rig:'roadster', gears:5, wide:0.005, arch:0.88,
                horn:1.04, redline:9500, pitch:0.96, rear:'ROADSTER',
                brake:1.12, pull:0.72, vmax:0.88, mass:1010, hp:240, grip:1.34,
                note:'ROADSTER \u00B7 LIGHT \u00B7 CARRIES SPEED THROUGH ANYTHING' },
  'TUNER': { rig:'tuner',  gears:5, wide:0.030, arch:0.95,
              horn:0.86, redline:10000, pitch:0.78, rear:'TUNER',
              brake:1.02, pull:1.18, vmax:0.82, mass:1290, hp:320, grip:1.00,
              note:'TUNED \u00B7 FIVE SPEED \u00B7 QUICK, THEN DONE' },
  'MUSCLE': { rig:'muscle', gears:4, wide:0.050, arch:1.05,
              horn:0.72, redline:10000, pitch:0.66, rear:'MUSCLE',
              brake:0.86, pull:0.92, vmax:0.94, mass:1720, hp:480, grip:0.82,
              note:'MUSCLE \u00B7 FOUR SPEED \u00B7 LONG LEGS' },
  /* ---- THE CRUISER -------------------------------------------------------
     Earned by surviving, not by winning: 20 miles on TEST DRIVE with the clock
     AND hot pursuit on. It is an interceptor — a heavy saloon with a big engine
     — so it is quick in a straight line and slow to get going, sits between the
     road cars and the supercars, and keeps its light bar whoever is driving.
     Five speeds, an 11k band, and a low burbling note. */
  /* ---- THE SUPER CRUISER --------------------------------------------------
     A MATADOR the force has taken and equipped. It was only a sprite — no
     stats at all — which meant nothing in the game could ask how fast it was,
     and it could not appear on a fleet sheet.

     Against the MATADOR it comes from: the same engine and gearbox, the same
     grip, better brakes because that is what a pursuit car gets, and **190kg
     of equipment** — cage, radio, lights, ram bar. That mass is the whole
     difference. It costs 4mph of top end and a tenth off the launch, which is
     exactly right: it can stay with a supercar, and it cannot beat one.

     `npc:true` keeps it out of the garage — it is not yours.
     ---------------------------------------------------------------------- */
  'SUPERCRUISER': { npc:true, force:true, barY:0.304,
              bodyTop:0.52, cabinTop:0.24, cabW:0.52, cabOff:0, roofR:0.10,
              wide:0.030, arch:1.00, gears:6, redline:12000, pitch:1.02,
              horn:1.02, rear:'CRUISER', spoiler:'low',
              mass:1770, hp:690, grip:1.38, brake:1.44,
              pull:1.18, vmax:0.92,
              note:'INTERCEPTOR \u00B7 A MATADOR WITH A CAGE IN IT' },

  'CRUISER': { force:true, barY:0.122, rig:'cop', gears:5, wide:0.045, arch:1.00,
              horn:0.80, redline:11000, pitch:0.72, rear:'CRUISER',
              mass:1810, hp:370, grip:0.92, brake:1.00, pull:0.92, vmax:0.95, note:'INTERCEPTOR \u00B7 HEAVY, AND FAST' },
  /* ---- THE TRAFFIC, DRIVEABLE ---------------------------------------------
     A hundred miles in TEST DRIVE, on any settings, unlocks the lot. They are
     not racers and the numbers say so: nothing here beats MUSCLE's 184mph or
     its 4.9s, so the slowest supercar is still quicker than the quickest van.

     They keep the engine character their NPC versions already have — same
     pitch, same rev band — so a lorry sounds like a lorry whoever is in it.
     ------------------------------------------------------------------------ */
  'COUPE': { rig:'coupe',  gears:4, wide:0.010, arch:0.90, horn:1.02,
               redline:9000, pitch:1.05, rear:'GENERIC', mass:1340, hp:210, grip:0.86, brake:0.88, pull:0.62, vmax:0.80,
               note:'COUPE \u00B7 THE QUICKEST THING THAT IS NOT A RACER' },
  'SALOON': { rig:'sedan',  gears:4, wide:0.020, arch:0.92, horn:0.96,
               redline:8500, pitch:0.92, rear:'GENERIC', mass:1480, hp:160, grip:0.78, brake:0.80, pull:0.54, vmax:0.74,
               note:'SALOON \u00B7 ENTIRELY UNREMARKABLE' },
  'CAB': { rig:'taxi',   gears:4, wide:0.020, arch:0.92, horn:0.90,
               redline:7500, pitch:0.80, rear:'GENERIC', mass:1620, hp:130, grip:0.70, brake:0.72, pull:0.46, vmax:0.66,
               note:'CAB \u00B7 THREE HUNDRED THOUSAND MILES' },
  'PICKUP': { rig:'pickup', gears:4, wide:0.045, arch:1.05, horn:0.84,
               redline:7000, pitch:0.70, rear:'GENERIC', mass:2150, hp:220, grip:0.64, brake:0.68, pull:0.44, vmax:0.68,
               note:'PICKUP \u00B7 CARRIES THINGS, SLOWLY' },
  'VAN': { rig:'van',    gears:4, wide:0.060, arch:1.00, horn:0.78,
               redline:6500, pitch:0.58, rear:'GENERIC', mass:2400, hp:140, grip:0.58, brake:0.62, pull:0.36, vmax:0.60,
               note:'VAN \u00B7 A BOX WITH A STEERING WHEEL' },
    /* ---- FOUR SPEEDS, AND A LORRY DOES 80 ---------------------------------
     Every ordinary traffic car is a four-speed — only the tuner, the muscle
     car and the cruiser get more. And a lorry's ceiling is 80mph, not 104:
     `vmax` is a fraction of 200, so 0.40.
     -------------------------------------------------------------------- */
  'LORRY': { rig:'truck',  gears:4, wide:0.120, arch:1.10, horn:0.52,
               redline:5000, pitch:0.42, rear:'GENERIC', mass:14000, hp:420, grip:0.42, brake:0.40, pull:0.24, vmax:0.40,
               note:'LORRY \u00B7 NOTHING GETS OUT OF ITS WAY TWICE' },
  'CREST': { bodyTop:0.40, cabinTop:0.10, cabW:0.48, cabOff:0, roofR:0.30,
              hip:0.085, wing:'ducktail', nose:0.24, spoiler:true, rear:'CREST', wide:0.010, arch:1.15, dome:true, horn:0.94,
              mass:1450, hp:640, grip:1.42, brake:1.32, pull:1.02, vmax:1.00, note:'BALANCED' }
};
/* ---- HORSEPOWER --------------------------------------------------------
   `pull` is torque: how hard the car leaves a corner. HORSEPOWER is what a
   revving engine has STORED when the clutch comes up — and it is a different
   number. A muscle car has more of it than a tuner and less use for it; a
   formula car has enough to spin the wheels at any speed.

   It only does one thing: it decides whether dropping a revving engine into
   gear peels away or just bogs down.
   ------------------------------------------------------------------------ */
/* ---- MASS -----------------------------------------------------------------
   Horsepower had nothing to work against, so I was using `pull` as a stand-in
   for weight — which is wrong twice over: `pull` is torque, and a lorry with
   420hp was being held back by a number that means something else.

   Mass is in kilograms and it does one job: divide the power. Power-to-weight
   is what actually decides whether a revving engine launches a car or bogs it
   down, and the spread here is real — a formula car is a fifth of a saloon and
   a twentieth of a lorry.
   -------------------------------------------------------------------------- */
/* ---- NOS IS NOT FOR EVERYONE -------------------------------------------
   Every driveable body had a bottle, including the LORRY and the CAB. Nitrous
   belongs to the cars built to go fast: the three SPORTS, the three SUPER, the
   FORMULA car, and the SUPER CRUISER — which is a supercar the force took.
   Traffic bodies are ordinary vehicles and have none.
   ---------------------------------------------------------------------- */
function hasNos(){
  const B = BODY[optBody];
  if(!B) return false;
  if(B.nos !== undefined) return !!B.nos;
  return SPORTS_BODIES.indexOf(optBody) >= 0
      || SUPER_BODIES.indexOf(optBody) >= 0
      || optBody === 'FORMULA'
      || !!B.force && optBody === 'SUPERCRUISER';
}

function bodyMass(){
  const B = BODY[optBody];
  return (B && B.mass) || 1400;
}

/* power-to-weight, normalised so a fast road car sits near 1.0 */
function powerToWeight(){
  return (bodyHp() / bodyMass()) / 0.30;
}

function bodyHp(){
  const B = BODY[optBody];
  if(!B) return 400;
  if(B.hp) return B.hp;
  /* the derived fallback compressed everything into 448-1040, which put a
     LORRY at 448hp and a cab at 603. Every car declares its own instead; this
     is only a floor for anything that forgets to. */
  return 180;
}

/* `brake` defaults to 1 so any body without the stat behaves exactly as before */
function bodyStat(k){ return (BODY[optBody] || BODY['MATADOR'])[k]; }
let optBody = 'MATADOR';


/* ===========================================================================
   EVERY VEHICLE ITS OWN SHAPE

   These used to be one painter with a few numbers changed, so a van, a pickup
   and a saloon were the same box at different heights. From behind — the only
   angle you ever see — they are completely different objects, and a road full
   of the same silhouette is what made the traffic read as filler.
   =========================================================================== */
/* ===========================================================================
   THE FRONT OF EVERY OTHER VEHICLE

   The supercars got fronts and the rest of the road did not \u2014 which matters,
   because oncoming traffic is the only thing you ever see head-on. Each type
   keeps its own proportions from `paintRig` and gets the face that belongs to
   it: a lorry is a wall of glass, a van is a slab, a pickup has a tall square
   grille, a coupe sits low.
   =========================================================================== */
function paintRigFront(kind, o){
  return (g, w, h) => {
    const P = o;
    const cy = h;
    const grad = (y0,y1) => { const b = g.createLinearGradient(0,y0,0,y1);
      b.addColorStop(0,P.hi); b.addColorStop(0.48,P.body); b.addColorStop(1,P.lo); return b; };

    /* ---- THE REAR'S OWN NUMBERS, VERBATIM --------------------------------
       Not a fresh set of proportions. Every value below is lifted straight out
       of `paintRig` for the same `kind`, so a vehicle is dimensionally
       identical from either end and only the FACE differs. Invented dimensions
       are what made the first attempt read as five sizes of one van.
       -------------------------------------------------------------------- */
    const tw  = kind==='truck'||kind==='van' ? 0.155 : kind==='pickup' ? 0.145 : 0.13;
    const th2 = kind==='truck' ? 0.20 : kind==='pickup' ? 0.24 : 0.26;

    /* the wheels, exactly where the back puts them */
    g.fillStyle = '#0b0d10';
    rr(g, w*0.045, cy-h*th2*0.42, w*tw, h*th2*0.42, 3); g.fill();
    rr(g, w*(0.955-tw), cy-h*th2*0.42, w*tw, h*th2*0.42, 3); g.fill();
    g.fillStyle='rgba(0,0,0,.5)';
    g.beginPath(); g.ellipse(w*0.5, cy-h*0.01, w*0.46, h*0.026, 0, 0, 6.2832); g.fill();

    if(kind === 'truck'){
      /* the cab: the SAME slab as the trailer \u2014 0.045 to 0.955, top h*0.05 */
      const top = h*0.05, bot = cy - h*0.135;
      g.fillStyle = grad(top, bot);
      rr(g, w*0.045, top, w*0.91, bot-top, w*0.015); g.fill();
      /* a lorry's face is mostly screen */
      g.fillStyle = '#141c26';
      rr(g, w*0.085, top+h*0.045, w*0.83, h*0.235, w*0.012); g.fill();
      g.fillStyle = 'rgba(90,120,150,.20)';
      rr(g, w*0.085, top+h*0.045, w*0.83, h*0.070, w*0.012); g.fill();
      g.fillStyle = P.lo; g.fillRect(w*0.492, top+h*0.045, w*0.016, h*0.235);
      /* mirrors on arms, outside the cab */
      for(const mx of [0.012, 0.958]){
        g.fillStyle = P.lo; g.fillRect(w*mx, top+h*0.075, w*0.030, h*0.145);
      }
      /* the grille band, where the trailer has its door seam */
      g.fillStyle='rgba(12,14,18,.88)';
      rr(g, w*0.10, bot-h*0.165, w*0.80, h*0.095, 3); g.fill();
      g.strokeStyle='rgba(160,172,186,.22)'; g.lineWidth=1;
      for(let k=1;k<5;k++){
        const yy = bot-h*0.165 + k*h*0.019;
        /* the slats were drawn 0.115–0.885 across a panel that runs 0.10–0.90,
           so they overhung it at both ends */
        g.beginPath(); g.moveTo(w*0.125, yy); g.lineTo(w*0.875, yy); g.stroke();
      }
      /* lamps at the same height its rear lamps sit */
      for(const lx of [0.10, 0.74]){
        g.fillStyle='#f2f8ff'; rr(g, w*lx, cy-h*0.155, w*0.16, h*0.032, 2); g.fill();
        headGlow(g, w*(lx+0.08), cy-h*0.139, w);
      }
      drawMarque(g, 'GENERIC', w*0.5, bot-h*0.215, h*0.030);   /* the cab, front only */
      g.fillStyle='#20242a'; g.fillRect(w*0.055, bot-h*0.055, w*0.89, h*0.055);
      g.fillStyle='#2a2f36'; g.fillRect(w*0.06, cy-h*0.115, w*0.88, h*0.014);
      return;
    }

    if(kind === 'van'){
      /* same slab: 0.055 to 0.945, top h*0.10, bot cy-h*0.10 */
      const top = h*0.10, bot = cy - h*0.10;
      g.fillStyle = grad(top, bot);
      rr(g, w*0.055, top, w*0.89, bot-top, w*0.045); g.fill();
      g.fillStyle = 'rgba(255,255,255,.10)';
      rr(g, w*0.055, top, w*0.89, h*0.028, w*0.03); g.fill();
      /* one wide screen where the back has two door windows */
      g.fillStyle = '#141c26';
      rr(g, w*0.11, top+h*0.055, w*0.78, h*0.145, 3); g.fill();
      g.fillStyle = 'rgba(90,120,150,.18)';
      rr(g, w*0.11, top+h*0.055, w*0.78, h*0.045, 3); g.fill();
      for(const mx of [0.020, 0.950]){
        g.fillStyle = P.lo; g.fillRect(w*mx, top+h*0.075, w*0.030, h*0.105);
      }
      /* a van's face is a big flat panel: the grille takes most of it, not a
         letterbox slot */
      g.fillStyle='rgba(12,14,18,.86)';
      rr(g, w*0.145, bot-h*0.215, w*0.71, h*0.135, 4); g.fill();
      g.strokeStyle='rgba(170,182,196,.20)'; g.lineWidth=1.2;
      for(let k=1;k<4;k++){
        const yy = bot-h*0.215 + k*h*0.034;
        g.beginPath(); g.moveTo(w*0.165, yy); g.lineTo(w*0.835, yy); g.stroke();
      }
      /* lamps where the rear's tall corner lamps are: 0.07 and 0.855 */
      for(const lx of [0.07, 0.855]){
        g.fillStyle='#f2f8ff'; rr(g, w*lx, bot-h*0.135, w*0.075, h*0.070, 2); g.fill();
        headGlow(g, w*(lx+0.037), bot-h*0.100, w);
      }
      /* the van wears it on the NOSE only */
      drawMarque(g, 'GENERIC', w*0.5, bot-h*0.285, h*0.030);
      g.fillStyle='#1b1f26'; g.fillRect(w*0.055, bot-h*0.055, w*0.89, h*0.055);
      return;
    }

    if(kind === 'pickup'){
      /* ---- THE PICKUP'S OWN NUMBERS -------------------------------------
         Its back is cab 0.20 to 0.80 from h*0.10, and a BED 0.055 to 0.945
         from h*0.40 down to cy-h*0.135. I had been folding it in with the
         saloons at roofY 0.20 / deckY 0.50 / cabW 0.50, which is a different
         vehicle. A pickup's cab is narrow and tall and its body is wide and
         low, and the front has to say so. */
      const cabTop = h*0.10, bedTop = h*0.40, bot = cy - h*0.135;
      /* the cab, exactly as wide as the back's */
      g.fillStyle = grad(cabTop, bedTop);
      rr(g, w*0.20, cabTop, w*0.60, bedTop-cabTop+h*0.03, w*0.035); g.fill();
      g.fillStyle = '#10151d';
      rr(g, w*0.245, cabTop+h*0.035, w*0.51, h*0.145, 3); g.fill();
      g.fillStyle = 'rgba(130,170,210,.18)';
      rr(g, w*0.255, cabTop+h*0.042, w*0.49, h*0.048, 2); g.fill();
      for(const mx of [0.145, 0.825]){
        g.fillStyle = P.lo; g.fillRect(w*mx, cabTop+h*0.075, w*0.030, h*0.070);
      }
      /* the front body, the same 0.055 to 0.945 the bed uses */
      g.fillStyle = grad(bedTop, bot);
      rr(g, w*0.055, bedTop, w*0.89, bot-bedTop, w*0.02); g.fill();
      g.fillStyle='rgba(255,255,255,.18)';
      rr(g, w*0.055, bedTop, w*0.89, h*0.022, w*0.015); g.fill();
      /* A BIG GRILLE. A pickup's face is mostly grille and it should be */
      /* ---- THE GRILLE STOPS AT THE LAMPS -------------------------------
         It ran 0.115 to 0.885 while the lamps occupy 0.075–0.225 and
         0.775–0.925, so the mouth was painted UNDER both of them — a black
         band crossing behind the light units. It spans the gap between them
         now, derived from the lamp edges rather than set by hand. */
      const LX0 = 0.075, LW = 0.15;                 /* the lamp block */
      const gL = LX0 + LW + 0.020, gR = 1 - LX0 - LW - 0.020;
      g.fillStyle='rgba(12,14,18,.88)';
      rr(g, w*gL, bedTop+h*0.055, w*(gR-gL), h*0.175, 4); g.fill();
      g.strokeStyle='rgba(170,182,196,.22)'; g.lineWidth=1.2;
      for(let k=1;k<5;k++){
        const yy = bedTop+h*0.055 + k*h*0.035;
        g.beginPath(); g.moveTo(w*(gL+0.02), yy); g.lineTo(w*(gR-0.02), yy); g.stroke();
      }
      /* square lamps flanking it */
      for(const lx of [0.075, 0.775]){
        g.fillStyle='#f2f8ff'; rr(g, w*lx, bedTop+h*0.075, w*0.15, h*0.075, 3); g.fill();
        headGlow(g, w*(lx+0.075), bedTop+h*0.112, w);
      }
      /* the pickup front returns before the shared badge line, so it needs its
         own — on the bonnet, above the grille */
      drawMarque(g, 'GENERIC', w*0.5, bedTop + h*0.028, h*0.032);
      g.fillStyle='#1b1f26'; g.fillRect(w*0.055, bot-h*0.070, w*0.89, h*0.070);
      return;
    }

    /* ---- the saloons, the coupe and the cruiser -------------------------- */
    /* ---- THE TUNER --------------------------------------------------------
       A coupe with a boot spoiler and round lamps. Everything else about it is
       the coupe verbatim, which is the point: it is the same shell somebody has
       been at with a catalogue, and it reads as a sixth vehicle on the road for
       almost no extra geometry. */
    /* ---- THE TAXI ---------------------------------------------------------
       A sedan in cab yellow with a chequer band along its flank and a roof
       sign. No unlock, no stats — it is scenery, and a road with one on it
       looks like a road rather than a test track. */
    const isTaxi = kind === 'taxi';
    /* ---- A ROADSTER HAS NO ROOF -----------------------------------------
       ROADSTER and TUNER were both the coupe shell with different furniture,
       so from behind they were the same car. The thing that actually makes a
       roadster a roadster is that the greenhouse is not there: an open
       cockpit, two headrest fairings behind the seats, and a low roll hoop.

       That is a silhouette you can name at a glance from either end, and it
       costs one branch — skip the cabin, draw the hoop.
       ------------------------------------------------------------------- */
    /* ---- THE ROADSTER, WITH ITS ROOF ON --------------------------------
       An open cockpit needs a driver in it, and a car with an empty hole where
       a person should be looks broken — which is exactly how my first attempt
       read. So the roof stays and the DIFFERENCE moves to proportion:

         a very low, short cabin set well back
         twin speedster humps on the deck behind it
         no wing at all

       A roadster with the top up is still unmistakably not a coupe, and
       nobody has to be drawn sitting in it.
       ------------------------------------------------------------------- */
    const isOpen = kind === 'roadster';
    const isTuner  = kind === 'tuner';
    /* ---- THE MUSCLE CAR ---------------------------------------------------
       A saloon's width with a coupe's roof: long, low and heavy. It gets a
       bonnet scoop, a pair of racing stripes over the roof, and quad round
       lamps — all of which sit on the shared shell, so it costs the same
       almost-nothing the tuner did. */
    const isMuscle = kind === 'muscle';
    const isCoupe = kind === 'coupe' || isTuner || isMuscle || isOpen;
    const roofY = h*(isOpen ? 0.30 : isMuscle ? 0.20 : isCoupe ? 0.22 : 0.16);
    const deckY = h*(isCoupe ? 0.52 : 0.48);
    const bot   = cy - h*0.075;
    const cabW  = isOpen ? 0.38 : isMuscle ? 0.48 : isCoupe ? 0.44 : 0.52;

    const pRoof = roofY, pDeck = deckY, pCab = cabW;

    /* the spoiler is BEHIND the car from here, so it goes first */
    if(kind === 'tuner'){
      g.fillStyle = P.lo;
      rr(g, w*0.16, pRoof + h*0.030, w*0.68, h*0.028, 3); g.fill();
    }

    /* the greenhouse: the rear's own trapezium, mirrored */
    g.fillStyle = P.lo;
    g.beginPath();
    g.moveTo(w*(0.5-pCab/2+0.03), pRoof);
    g.lineTo(w*(0.5+pCab/2-0.03), pRoof);
    g.lineTo(w*(0.5+pCab/2+0.06), pDeck);
    g.lineTo(w*(0.5-pCab/2-0.06), pDeck);
    g.closePath(); g.fill();
    /* the screen inside it */
    g.fillStyle = '#141c26';
    g.beginPath();
    g.moveTo(w*(0.5-pCab/2+0.055), pRoof+h*0.022);
    g.lineTo(w*(0.5+pCab/2-0.055), pRoof+h*0.022);
    g.lineTo(w*(0.5+pCab/2+0.03), pDeck-h*0.015);
    g.lineTo(w*(0.5-pCab/2-0.03), pDeck-h*0.015);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(90,120,150,.18)';
    g.beginPath();
    g.moveTo(w*(0.5-pCab/2+0.055), pRoof+h*0.022);
    g.lineTo(w*(0.5+pCab/2-0.055), pRoof+h*0.022);
    g.lineTo(w*(0.5+pCab/2-0.02), pRoof+h*0.070);
    g.lineTo(w*(0.5-pCab/2+0.02), pRoof+h*0.070);
    g.closePath(); g.fill();

    /* the body: 0.055 to 0.945, exactly as the back */
    g.fillStyle = grad(pDeck, bot);
    rr(g, w*0.055, pDeck-h*0.02, w*0.89, bot-pDeck+h*0.02, w*0.035); g.fill();
    /* arch blisters, the same 0.13 / 0.87 the rear uses */
    for(const ax of [0.13, 0.87]){
      g.fillStyle = P.lo;
      g.beginPath(); g.ellipse(w*ax, bot-h*0.045, w*0.105, h*0.075, 0, 0, 6.2832); g.fill();
    }
    /* the stripes go AFTER the body — drawn before it they were painted over
       and only showed on the rear, where the order happens to be the other way */
    /* the muscle car wears them always; anything else when the option is on —
       this was `kind === 'muscle'` only, so the TUNER never got front stripes
       even with the toggle set */
    if(kind === 'muscle' || P.stripes){
      /* roof and bonnet, never across the windscreen */
      g.fillStyle = shade(P.body, 0.42);
      for(const sx of [0.415, 0.530]){
        g.fillRect(w*sx, pRoof, w*0.055, h*0.030);
        g.fillRect(w*sx, pDeck, w*0.055, bot - pDeck);
      }
    }

    /* mirrors */
    for(const sx of [-1,1]){
      g.fillStyle = P.lo;
      g.beginPath();
      g.ellipse(w*0.5 + sx*w*(pCab/2+0.075), pDeck-h*0.005, w*0.038, h*0.020, 0, 0, 6.2832);
      g.fill();
    }

    /* lamps at the rear's own lamp line: ly = deckY + (bot-deckY)*0.40 */
    const ly = pDeck + (bot-pDeck)*0.40, lh = h*0.055;
    if(kind === 'muscle'){
      /* QUAD round lamps, stacked wide, with a chrome ring each */
      for(const lx of [0.055, 0.685]){
        /* four haloes at 0.054 merged into one white bar. Smaller lamps, and
           only ONE glow per pair, centred between them. */
        for(const k of [0.068, 0.185]){
          g.fillStyle = 'rgba(185,194,205,.9)';
          g.beginPath(); g.arc(w*(lx+k), ly+lh*0.5, w*0.042, 0, 6.2832); g.fill();
          g.fillStyle = '#f2f8ff';
          g.beginPath(); g.arc(w*(lx+k), ly+lh*0.5, w*0.030, 0, 6.2832); g.fill();
        }
        headGlow(g, w*(lx+0.127), ly+lh*0.5, w);
      }
    } else if(kind === 'tuner'){
      /* ROUND lamps, a pair each side, in a dark housing */
      for(const lx of [0.055, 0.685]){
        g.fillStyle = 'rgba(12,14,18,.80)';
        rr(g, w*lx, ly-h*0.012, w*0.26, lh+h*0.024, h*0.026); g.fill();
        for(const k of [0.075, 0.185]){
          g.fillStyle = '#f2f8ff';
          g.beginPath(); g.arc(w*(lx+k), ly+lh*0.5, w*0.045, 0, 6.2832); g.fill();
          g.fillStyle = 'rgba(180,215,255,.45)';
          g.beginPath(); g.arc(w*(lx+k), ly+lh*0.38, w*0.024, 0, 6.2832); g.fill();
          headGlow(g, w*(lx+k), ly+lh*0.5, w);
        }
      }
    } else {
      for(const lx of [0.055, 0.685]){
        g.fillStyle = '#f2f8ff';
        rr(g, w*lx, ly, w*0.26, lh, 3); g.fill();
        g.fillStyle = 'rgba(180,215,255,.45)';
        rr(g, w*(lx+0.01), ly+lh*0.14, w*0.24, lh*0.30, 2); g.fill();
        headGlow(g, w*(lx+0.13), ly+lh*0.5, w);
      }
    }
    /* and on the nose */
    if(P.marque) drawMarque(g, P.marque, w*0.5, pDeck + h*0.026, h*0.030);
    else if(kind !== 'tuner' && kind !== 'muscle' && kind !== 'cop')
      drawMarque(g, 'GENERIC', w*0.5, pDeck + h*0.026, h*0.030);
    /* ---- CLEAR OF THE SCOOP ---------------------------------------------
       The muscle car's bonnet scoop runs `pDeck - 0.010` to `pDeck + 0.045`,
       and the badge at +0.026 was sitting inside it. It drops below the scoop;
       the tuner has no scoop so it keeps the higher position.

       BRACES: a bare `if` takes only the next statement, so declaring a const
       under one is a syntax error and the whole file stops parsing. */
    if(kind === 'tuner' || kind === 'muscle'){
      const bY = (kind === 'muscle') ? pDeck + h*0.072 : pDeck + h*0.026;
      drawMarque(g, kind === 'tuner' ? 'TUNER' : 'MUSCLE', w*0.5, bY, h*0.034);
    }

    /* grille and bumper, where the plate and bumper are on the back */
    g.fillStyle = 'rgba(12,14,18,.85)';
    if(kind === 'muscle'){
      /* ---- a BIG grille -------------------------------------------------
         A muscle car's face is a wide open mouth between the lamp pairs, not a
         letterbox. It runs the full span between them and is twice as deep. */
      /* the inner lamp of each pair sits at 0.685+0.185 ± 0.042, so its inner
         edge is 0.198 on the left and 0.802 on the right — the mouth has to
         start inside those, not at 0.245 which cut across them */
      const mL = 0.055 + 0.185 + 0.042 + 0.022, mR = 1 - mL;
      rr(g, w*mL, ly-h*0.012, w*(mR-mL), lh+h*0.030, 3); g.fill();
      g.strokeStyle = 'rgba(170,182,196,.20)'; g.lineWidth = 1.1;
      for(let k=1;k<4;k++){
        const yy = ly-h*0.012 + k*(lh+h*0.030)/4;
        g.beginPath(); g.moveTo(w*(mL+0.02), yy); g.lineTo(w*(mR-0.02), yy); g.stroke();
      }
      g.fillStyle = P.lo;
      g.fillStyle = P.lo;
      rr(g, w*0.375, pDeck - h*0.010, w*0.25, h*0.055, 4); g.fill();
      g.fillStyle = 'rgba(10,12,16,.9)';
      rr(g, w*0.395, pDeck - h*0.004, w*0.21, h*0.026, 3); g.fill();
    } else {
      /* the car lamps run to 0.315 and 0.685, so 0.33 clears them by 0.015 —
         tightened to 0.345 so the gap reads as a gap rather than a seam */
      rr(g, w*0.345, ly+lh*0.15, w*0.31, lh*0.62, 3); g.fill();
    }
    g.fillStyle = '#1b1f26';
    rr(g, w*0.055, bot-h*0.075, w*0.89, h*0.075, w*0.02); g.fill();

    /* the taxi wears the same band and sign from the front */
    if(kind === 'taxi'){
      const by = pDeck + h*0.055, bh2 = h*0.055, n = 12;
      for(let k=0;k<n;k++){
        g.fillStyle = (k % 2) ? '#14161a' : '#f2f4f7';
        g.fillRect(w*(0.055 + k*0.89/n), by, w*0.89/n, bh2);
      }
      g.fillStyle = '#1b1e24';
      rr(g, w*0.36, pRoof - h*0.050, w*0.28, h*0.042, 2); g.fill();
      g.fillStyle = '#ffd23c';
      rr(g, w*0.372, pRoof - h*0.044, w*0.256, h*0.030, 2); g.fill();
      /* the badge was drawn BEFORE the chequer band and the band covered it.
         It goes on after, above the chequers rather than behind them. */
      drawMarque(g, 'GENERIC', w*0.5, pDeck + h*0.018, h*0.032);
    }

    /* the cruiser keeps its bar, and its star */
    if(kind === 'cop'){
      g.fillStyle = liveryBand(P.body);
      g.fillRect(w*0.055, pDeck + h*0.100, w*0.89, h*0.045);
      drawMarque(g, 'CRUISER', w*0.5, pDeck + h*0.062, h*0.034);
      /* ---- THE REAR'S NUMBERS, VERBATIM ---------------------------------
         The bar ran 0.32 to 0.68 here and 0.24 to 0.76 on the back — the same
         fitting, 0.36 wide from the front and 0.52 from behind. These are the
         rear's values, and the housing tone with them, so the two ends cannot
         disagree about a part that is bolted to the roof. */
      g.fillStyle = '#1b1e24';
      rr(g, w*0.24, pRoof-h*0.055, w*0.52, h*0.045, 2); g.fill();
      g.fillStyle = '#2f6bff';
      rr(g, w*0.255, pRoof-h*0.050, w*0.235, h*0.034, 2); g.fill();
      g.fillStyle = '#ff2b4a';
      rr(g, w*0.51, pRoof-h*0.050, w*0.235, h*0.034, 2); g.fill();
    }
  };
}

function paintRig(kind, o){
  return (g,w,h)=>{
    const cy = h;
    const P = o;
    const grad = (y0,y1) => { const b = g.createLinearGradient(0,y0,0,y1);
      b.addColorStop(0,P.hi); b.addColorStop(0.48,P.body); b.addColorStop(1,P.lo); return b; };

    /* ground shadow — wider and softer under the tall things */
    g.fillStyle='rgba(0,0,0,.5)';
    g.beginPath(); g.ellipse(w/2, cy-5, w*0.46, h*0.045, 0, 0, 6.2832); g.fill();

    /* ---- wheels, at the right track for the vehicle --------------------- */
    const tw = kind==='truck'||kind==='van' ? 0.155 : kind==='pickup' ? 0.145 : 0.13;
    const th2 = kind==='truck' ? 0.20 : kind==='pickup' ? 0.24 : 0.26;
    g.fillStyle='#0c0d11';
    rr(g, w*0.012, cy-h*th2, w*tw, h*(th2-0.02), 3); g.fill();
    rr(g, w-w*0.012-w*tw, cy-h*th2, w*tw, h*(th2-0.02), 3); g.fill();

    if(kind === 'truck'){
      /* a box trailer: one tall slab, roof markers, doors with a centre seam */
      const top = h*0.05, bot = cy - h*0.135;
      g.fillStyle = grad(top, bot);
      rr(g, w*0.045, top, w*0.91, bot-top, w*0.015); g.fill();
      /* the two door leaves */
      g.strokeStyle='rgba(0,0,0,.38)'; g.lineWidth=Math.max(1,w*0.008);
      g.beginPath(); g.moveTo(w*0.5, top+h*0.02); g.lineTo(w*0.5, bot-h*0.02); g.stroke();
      for(const hx of [0.30, 0.70]){
        g.beginPath(); g.moveTo(w*hx, top+h*0.03); g.lineTo(w*hx, bot-h*0.03); g.stroke();
      }
      /* no badge on a trailer's back doors — the tractor unit wears it, and
         what you are looking at here is the box it is pulling */
      /* hinges and a latch bar */
      g.fillStyle='rgba(255,255,255,.14)';
      for(const hy of [0.22,0.46,0.70]) g.fillRect(w*0.045, top+(bot-top)*hy, w*0.03, h*0.02);
      g.fillStyle='#2a2c31';
      g.fillRect(w*0.46, top+(bot-top)*0.46, w*0.08, h*0.03);
      /* roof marker lamps */
      g.fillStyle=P.lamp2||'#ffb066';
      for(const mx of [0.16,0.34,0.5,0.66,0.84]) rr(g, w*mx-w*0.018, top-h*0.014, w*0.036, h*0.016, 2), g.fill();
      /* rear underrun bar and mud flaps */
      g.fillStyle='#23252a';
      rr(g, w*0.08, cy-h*0.115, w*0.84, h*0.028, 2); g.fill();
      g.fillStyle='#15161a';
      g.fillRect(w*0.05, cy-h*0.10, w*0.13, h*0.085);
      g.fillRect(w*0.82, cy-h*0.10, w*0.13, h*0.085);
      /* lamps low on the frame */
      g.fillStyle=P.lamp||'#b8371f';
      rr(g, w*0.10, cy-h*0.155, w*0.16, h*0.032, 2); g.fill();
      rr(g, w*0.74, cy-h*0.155, w*0.16, h*0.032, 2); g.fill();
      return;
    }

    if(kind === 'van'){
      /* a tall slab with a distinct roof edge, small high glass, twin doors */
      /* the generic badge goes on after the doors, below */
      const top = h*0.10, bot = cy - h*0.10;
      g.fillStyle = grad(top, bot);
      rr(g, w*0.055, top, w*0.89, bot-top, w*0.045); g.fill();
      /* roof cap */
      g.fillStyle='rgba(255,255,255,.16)';
      rr(g, w*0.055, top, w*0.89, h*0.028, w*0.03); g.fill();
      /* the two windows, high and small */
      g.fillStyle='#10151d';
      rr(g, w*0.13, top+h*0.055, w*0.33, h*0.11, 3); g.fill();
      rr(g, w*0.54, top+h*0.055, w*0.33, h*0.11, 3); g.fill();
      g.fillStyle='rgba(120,160,200,.20)';
      rr(g, w*0.14, top+h*0.062, w*0.31, h*0.035, 2); g.fill();
      rr(g, w*0.55, top+h*0.062, w*0.31, h*0.035, 2); g.fill();
      /* door seam and handles */
      g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=Math.max(1,w*0.008);
      g.beginPath(); g.moveTo(w*0.5, top+h*0.03); g.lineTo(w*0.5, bot-h*0.03); g.stroke();
      g.fillStyle='#3a3d44';
      g.fillRect(w*0.44, top+(bot-top)*0.55, w*0.045, h*0.016);
      g.fillRect(w*0.515, top+(bot-top)*0.55, w*0.045, h*0.016);
      /* tall narrow lamps up the corners, as vans have */
      g.fillStyle=P.lamp||'#c8102e';
      rr(g, w*0.07, bot-h*0.135, w*0.075, h*0.115, 2); g.fill();
      rr(g, w*0.855, bot-h*0.135, w*0.075, h*0.115, 2); g.fill();
      g.fillStyle='rgba(255,190,120,.85)';
      rr(g, w*0.07, bot-h*0.135, w*0.075, h*0.030, 2); g.fill();
      rr(g, w*0.855, bot-h*0.135, w*0.075, h*0.030, 2); g.fill();
      /* and none on the van's doors either — front only */
      /* bumper */
      g.fillStyle='#2b2e34';
      rr(g, w*0.05, cy-h*0.105, w*0.90, h*0.045, 3); g.fill();
      return;
    }

    if(kind === 'pickup'){
      /* narrow cab up top, wide open BED below — the giveaway silhouette */
      const cabTop = h*0.10, bedTop = h*0.40, bot = cy - h*0.135;
      /* the cab */
      g.fillStyle = grad(cabTop, bedTop);
      rr(g, w*0.20, cabTop, w*0.60, bedTop-cabTop+h*0.03, w*0.035); g.fill();
      g.fillStyle='#10151d';
      rr(g, w*0.245, cabTop+h*0.035, w*0.51, h*0.145, 3); g.fill();
      g.fillStyle='rgba(130,170,210,.18)';
      rr(g, w*0.255, cabTop+h*0.042, w*0.49, h*0.048, 2); g.fill();
      /* the bed, wider than the cab, with a visible rim */
      g.fillStyle = grad(bedTop, bot);
      rr(g, w*0.055, bedTop, w*0.89, bot-bedTop, w*0.02); g.fill();
      g.fillStyle='rgba(255,255,255,.18)';
      rr(g, w*0.055, bedTop, w*0.89, h*0.022, w*0.015); g.fill();
      drawMarque(g, 'GENERIC', w*0.5, bedTop + h*0.055, h*0.030);
      /* tailgate seam and handle */
      g.strokeStyle='rgba(0,0,0,.30)'; g.lineWidth=Math.max(1,w*0.007);
      g.beginPath(); g.moveTo(w*0.10, bedTop+h*0.055); g.lineTo(w*0.90, bedTop+h*0.055); g.stroke();
      g.fillStyle='#3a3d44';
      g.fillRect(w*0.44, bedTop+h*0.085, w*0.12, h*0.022);
      /* lamps on the bed corners */
      g.fillStyle=P.lamp||'#c8102e';
      rr(g, w*0.075, bot-h*0.085, w*0.15, h*0.065, 2); g.fill();
      rr(g, w*0.775, bot-h*0.085, w*0.15, h*0.065, 2); g.fill();
      /* chrome bumper, hanging low */
      g.fillStyle='#7d838c';
      rr(g, w*0.06, cy-h*0.115, w*0.88, h*0.040, 3); g.fill();
      g.fillStyle='rgba(255,255,255,.28)';
      rr(g, w*0.06, cy-h*0.115, w*0.88, h*0.014, 3); g.fill();
      return;
    }

    /* ---- the saloons, the coupe and the cruiser ------------------------- */
    /* ---- THE TUNER --------------------------------------------------------
       A coupe with a boot spoiler and round lamps. Everything else about it is
       the coupe verbatim, which is the point: it is the same shell somebody has
       been at with a catalogue, and it reads as a sixth vehicle on the road for
       almost no extra geometry. */
    /* ---- THE TAXI ---------------------------------------------------------
       A sedan in cab yellow with a chequer band along its flank and a roof
       sign. No unlock, no stats — it is scenery, and a road with one on it
       looks like a road rather than a test track. */
    const isTaxi = kind === 'taxi';
    /* ---- A ROADSTER HAS NO ROOF -----------------------------------------
       ROADSTER and TUNER were both the coupe shell with different furniture,
       so from behind they were the same car. The thing that actually makes a
       roadster a roadster is that the greenhouse is not there: an open
       cockpit, two headrest fairings behind the seats, and a low roll hoop.

       That is a silhouette you can name at a glance from either end, and it
       costs one branch — skip the cabin, draw the hoop.
       ------------------------------------------------------------------- */
    /* ---- THE ROADSTER, WITH ITS ROOF ON --------------------------------
       An open cockpit needs a driver in it, and a car with an empty hole where
       a person should be looks broken — which is exactly how my first attempt
       read. So the roof stays and the DIFFERENCE moves to proportion:

         a very low, short cabin set well back
         twin speedster humps on the deck behind it
         no wing at all

       A roadster with the top up is still unmistakably not a coupe, and
       nobody has to be drawn sitting in it.
       ------------------------------------------------------------------- */
    const isOpen = kind === 'roadster';
    const isTuner  = kind === 'tuner';
    /* ---- THE MUSCLE CAR ---------------------------------------------------
       A saloon's width with a coupe's roof: long, low and heavy. It gets a
       bonnet scoop, a pair of racing stripes over the roof, and quad round
       lamps — all of which sit on the shared shell, so it costs the same
       almost-nothing the tuner did. */
    const isMuscle = kind === 'muscle';
    const isCoupe = kind === 'coupe' || isTuner || isMuscle || isOpen;
    const roofY = h*(isOpen ? 0.30 : isMuscle ? 0.20 : isCoupe ? 0.22 : 0.16);
    const deckY = h*(isCoupe ? 0.52 : 0.48);
    const bot   = cy - h*0.075;
    const cabW  = isOpen ? 0.38 : isMuscle ? 0.48 : isCoupe ? 0.44 : 0.52;

    /* the greenhouse: narrower than the body, and raked on a coupe */
    g.fillStyle = P.lo;
    g.beginPath();
    g.moveTo(w*(0.5-cabW/2+0.03), roofY);
    g.lineTo(w*(0.5+cabW/2-0.03), roofY);
    g.lineTo(w*(0.5+cabW/2+0.06), deckY);
    g.lineTo(w*(0.5-cabW/2-0.06), deckY);
    g.closePath(); g.fill();
    /* the glass */
    const gg = g.createLinearGradient(0, roofY, 0, deckY);
    gg.addColorStop(0,'#46586c'); gg.addColorStop(0.4,'#131a24'); gg.addColorStop(1,'#0a0d13');
    g.fillStyle = gg;
    g.beginPath();
    g.moveTo(w*(0.5-cabW/2+0.055), roofY+h*0.022);
    g.lineTo(w*(0.5+cabW/2-0.055), roofY+h*0.022);
    g.lineTo(w*(0.5+cabW/2+0.03), deckY-h*0.012);
    g.lineTo(w*(0.5-cabW/2-0.03), deckY-h*0.012);
    g.closePath(); g.fill();

    /* the body: widest at the arches, tucked at the deck */
    const hipY = deckY + (bot-deckY)*0.40;
    g.fillStyle = grad(deckY, bot);
    g.beginPath();
    g.moveTo(w*0.115, deckY);
    g.lineTo(w*0.885, deckY);
    g.quadraticCurveTo(w*0.955, deckY+h*0.02, w*0.955, hipY);
    g.lineTo(w*0.955, bot-h*0.03);
    g.quadraticCurveTo(w*0.955, bot, w*0.90, bot);
    g.lineTo(w*0.10, bot);
    g.quadraticCurveTo(w*0.045, bot, w*0.045, bot-h*0.03);
    g.lineTo(w*0.045, hipY);
    g.quadraticCurveTo(w*0.045, deckY+h*0.02, w*0.115, deckY);
    g.closePath(); g.fill();

    /* arch blisters standing proud */
    for(const sx of [0.135, 0.865]){
      g.fillStyle = grad(hipY-h*0.04, bot);
      g.beginPath(); g.ellipse(w*sx, hipY+h*0.02, w*0.10, h*0.055, 0, 0, 6.2832); g.fill();
      g.fillStyle='rgba(255,255,255,.18)';
      g.beginPath(); g.ellipse(w*sx, hipY-h*0.004, w*0.065, h*0.014, 0, 0, 6.2832); g.fill();
    }
    /* the twin humps behind the cabin — the one thing on the back of a
       roadster that no other body has */
    if(isOpen){
      for(const sx of [-1,1]){
        g.fillStyle = P.lo;
        rr(g, w*0.5 + sx*w*0.135 - w*0.062, deckY - h*0.052,
           w*0.124, h*0.062, h*0.028); g.fill();
        g.fillStyle = 'rgba(255,255,255,.16)';
        rr(g, w*0.5 + sx*w*0.135 - w*0.062, deckY - h*0.052,
           w*0.124, h*0.016, h*0.010); g.fill();
      }
    }

    /* the twin humps behind the cabin — the one thing on the back of a
       roadster that no other body has */
    if(isOpen){
      for(const sx of [-1,1]){
        g.fillStyle = P.lo;
        rr(g, w*0.5 + sx*w*0.135 - w*0.062, deckY - h*0.052,
           w*0.124, h*0.062, h*0.028); g.fill();
        g.fillStyle = 'rgba(255,255,255,.16)';
        rr(g, w*0.5 + sx*w*0.135 - w*0.062, deckY - h*0.052,
           w*0.124, h*0.016, h*0.010); g.fill();
      }
    }

    /* the boot shut line, which is what says saloon */
    if(!isCoupe){
      g.strokeStyle='rgba(0,0,0,.26)'; g.lineWidth=Math.max(1,w*0.006);
      g.beginPath();
      g.moveTo(w*0.10, deckY+h*0.055); g.lineTo(w*0.90, deckY+h*0.055); g.stroke();
    }
    /* wraparound lamps — but the muscle car's are SQUARE, which is most of
       what says muscle car from behind */
    const ly = deckY + (bot-deckY)*0.40, lh = h*0.055;
    if(isMuscle){
      for(const lx of [0.075, 0.665]){
        g.fillStyle = 'rgba(16,14,16,.85)';
        rr(g, w*lx, ly-h*0.008, w*0.26, lh+h*0.016, 2); g.fill();
        for(const k of [0.020, 0.100, 0.180]){
          g.fillStyle = P.lamp || '#c8102e';
          g.fillRect(w*(lx+k), ly, w*0.060, lh);
          g.fillStyle = 'rgba(255,120,110,.45)';
          g.fillRect(w*(lx+k), ly, w*0.060, lh*0.28);
        }
      }
    } else {
    g.fillStyle = P.lamp || '#c8102e';
    rr(g, w*0.055, ly, w*0.26, lh, 3); g.fill();
    rr(g, w*0.685, ly, w*0.26, lh, 3); g.fill();
    g.fillStyle = 'rgba(255,255,255,.30)';
    rr(g, w*0.065, ly+lh*0.14, w*0.24, lh*0.30, 2); g.fill();
    rr(g, w*0.695, ly+lh*0.14, w*0.24, lh*0.30, 2); g.fill();
    /* ---- the boot spoiler, at the FRONT's height ------------------------
       The front draws it at `roofY + 0.030`; this was at `deckY - 0.055`,
       which with roofY 0.22 and deckY 0.52 is most of the car apart. Same
       expression both ends, so it cannot drift. */
    if(isTuner){
      const spY = roofY + h*0.030;
      g.fillStyle = P.lo;
      rr(g, w*0.16, spY, w*0.68, h*0.030, 3); g.fill();
      g.fillStyle = 'rgba(255,255,255,.16)';
      rr(g, w*0.16, spY, w*0.68, h*0.009, 3); g.fill();
      g.fillStyle = P.body;
      g.fillRect(w*0.255, spY + h*0.027, w*0.035, deckY - spY - h*0.027);
      g.fillRect(w*0.710, spY + h*0.027, w*0.035, deckY - spY - h*0.027);
    }

    /* the scoop, seen from behind as a raised block on the bonnet line */
    if(isMuscle){
      g.fillStyle = P.lo;
      rr(g, w*0.375, deckY - h*0.052, w*0.25, h*0.052, 4); g.fill();
    }

    }

    /* ---- the stripes are PAINT, and paint is not on the glass ------------
       They ran from the roofline down over the rear screen, which a decal
       cannot do: roof above the glass, deck below it, window clear.

       And they were sitting INSIDE the `else` opened for the round lamps, so
       they drew for every car EXCEPT the muscle one. Outside it now. */
    if(isMuscle || P.stripes){
      g.fillStyle = shade(P.body, 0.42);
      for(const sx of [0.415, 0.530]){
        g.fillRect(w*sx, roofY, w*0.055, h*0.030);
        g.fillRect(w*sx, deckY, w*0.055, bot - deckY);
      }
    }

    /* the marque, on the boot lid between the lamps — the tuner and the
       muscle car have their own, everything else gets the generic one */
    /* a car can share a BODY without sharing an identity */
    if(o.marque) drawMarque(g, o.marque, w*0.5, deckY + h*0.088, h*0.034);
    else if(!isTuner && !isMuscle && kind !== 'cop')
      drawMarque(g, 'GENERIC', w*0.5, deckY + h*0.088, h*0.034);
    if(isTuner || isMuscle)
      /* lower: it was riding on the shut line rather than sitting on the
         panel below it */
      drawMarque(g, isTuner ? 'TUNER' : 'MUSCLE', w*0.5, deckY + h*0.088, h*0.038);

    /* the taxi's chequer band and its roof sign */
    if(isTaxi){
      const by = deckY + h*0.055, bh2 = h*0.055, n = 12;
      for(let k=0;k<n;k++){
        g.fillStyle = (k % 2) ? '#14161a' : '#f2f4f7';
        g.fillRect(w*(0.055 + k*0.89/n), by, w*0.89/n, bh2);
      }
      g.fillStyle = '#1b1e24';
      rr(g, w*0.36, roofY - h*0.050, w*0.28, h*0.042, 2); g.fill();
      g.fillStyle = '#ffd23c';
      rr(g, w*0.372, roofY - h*0.044, w*0.256, h*0.030, 2); g.fill();
      drawMarque(g, 'GENERIC', w*0.5, deckY + h*0.018, h*0.032);
    }

    /* plate and bumper */
    g.fillStyle='rgba(0,0,0,.40)';
    rr(g, w*0.055, bot-h*0.075, w*0.89, h*0.075, w*0.02); g.fill();
    g.fillStyle='rgba(238,234,222,.85)';
    g.fillRect(w*0.415, bot-h*0.062, w*0.17, h*0.038);

    if(kind === 'cop'){
      /* ---- WHOSE CAR IS IT ----------------------------------------------
         An NPC cruiser wears the force's colours — a white door panel and a
         blue band. YOURS keeps the paint you chose and wears the band in a
         darker shade of it, so it is recognisably the same vehicle without
         pretending to be on duty. Either way the bar stays: it is what the
         car IS. */
      /* livery, push bar and a light bar on the roof */
      /* ---- THE BAND HAS TO CONTRAST -------------------------------------
         Darkening the body works on a white car and disappears on a black one
         — shade(#2a2f36, 0.42) is very nearly the car. So the livery INVERTS
         on a dark body: a white band on black, a dark band on white, which is
         what a real two-tone patrol scheme does. */
      /* the band contrasts with whatever the body is — white on a dark car,
         dark on a light one. Same rule for every cruiser on the road. */
      g.fillStyle = liveryBand(P.body);
      g.fillRect(w*0.045, deckY+h*0.10, w*0.91, h*0.05);
      /* the star, on the door panel */
      drawMarque(g, 'CRUISER', w*0.5, deckY + h*0.062, h*0.036);
      g.fillStyle='#1b1e24';
      rr(g, w*0.24, roofY-h*0.055, w*0.52, h*0.045, 2); g.fill();
      g.fillStyle='#2f6bff';
      rr(g, w*0.255, roofY-h*0.050, w*0.235, h*0.034, 2); g.fill();
      g.fillStyle='#ff2b4a';
      rr(g, w*0.51, roofY-h*0.050, w*0.235, h*0.034, 2); g.fill();
    }
  };
}

/* ===========================================================================
   THE FRONT OF A CAR

   There were no front views at all \u2014 the mirror only ever showed headlight
   GLOWS, so an oncoming car was two smudges of light and nothing else. This
   paints a nose: lamps, grille, splitter, arches, and for FORMULA the things
   that only a formula car has.
   =========================================================================== */
/* a headlamp: a hot point with a modest halo, never a floodlight */
function headGlow(g, x, y, w){
  g.save(); g.globalCompositeOperation='lighter';
  const lg = g.createRadialGradient(x, y, 0, x, y, w*0.12);
  lg.addColorStop(0,'rgba(255,250,220,.42)'); lg.addColorStop(1,'rgba(255,244,200,0)');
  g.fillStyle = lg; g.beginPath(); g.arc(x, y, w*0.12, 0, 6.2832); g.fill();
  g.restore();
}
function slats(g, x, y, w2, h2, n){
  g.strokeStyle = 'rgba(150,162,178,.20)'; g.lineWidth = 1;
  for(let k=1;k<n;k++){
    const yy = y + (h2/n)*k;
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x+w2, yy); g.stroke();
  }
}

function paintFront(o){
  return function(g, w, h){
    /* `o.body` is a COLOUR on every other painter, so the type comes in under
       its own name — otherwise the two collide silently and every car draws
       the same nose. */
    const kind = o.bodyType || 'MATADOR';
    const B = BODY[kind] || BODY['MATADOR'];
    /* ---- THE SAME CAR FROM BOTH ENDS ------------------------------------
       The tail applies the arch blisters OUTSIDE this half-width, so a front
       drawn at bare `wide` came out narrower than its own back. The arches are
       included here the same way, and every face is laid out against the
       result — so F is the widest at both ends, P the narrowest at both. */
    const wid = (0.42 + (B.wide || 0.03)) * (1 + (B.arch || 1) * 0.055);
    let topY = h*B.bodyTop; const botY = h*0.93;

    /* the shadow it sits in */
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(w*0.5, botY, w*wid*1.05, h*0.045, 0, 0, 6.2832); g.fill();

    if(kind === 'FORMULA'){
      /* ---- A FORMULA NOSE, from the reference ------------------------------
         The old one was a tall narrow tower. The real thing is LOW and WIDE:
         the wheels sit far outboard and are the tallest things in the picture,
         the body between them is a shallow wedge, the nose cone is broad and
         close to the ground, and the roll hoop rises from a deck that is
         barely above axle height. Nothing here is tall except the tyres.
         -------------------------------------------------------------------- */
      /* The rear fills its sprite; the front was drawn at two thirds the scale
         and read as a different, smaller car. Same tyre height and the same
         track as the rear, so the two ends are one vehicle. */
      const TW = w*0.230, TH2 = h*0.440;      /* a front tyre */
      const axle = h*0.620;
      const track = w*0.340;

      /* ---- WHAT IS BEHIND IT --------------------------------------------
         An F1 car seen head-on shows its REAR tyres past the front ones — they
         are wider and set further out — and the rear wing standing above the
         body. Drawn first, dimmed and slightly higher, so they read as being
         further away rather than as a second car.
         ------------------------------------------------------------------- */
      const RTW = w*0.215, RTH = h*0.420;
      const rAxle = h*0.606;
      /* far enough out that they clearly show past the front tyres */
      const rTrack = w*0.455;
      /* ---- IT HAS TO BE VISIBLE --------------------------------------
         At 38% none of this read at all: on a white car the whole background
         vanished and the front looked like a tub between two tyres. 0.62 is
         still clearly further away than the front but is actually THERE. */
      g.save();
      g.globalAlpha = 0.62;
      for(const sx of [-1,1]){
        const wx = w*0.5 + sx*rTrack;
        g.fillStyle = '#0d0f12';
        rr(g, wx - RTW*0.5, rAxle - RTH*0.5, RTW, RTH, RTW*0.30); g.fill();
        g.fillStyle = 'rgba(150,165,180,.10)';
        rr(g, wx - RTW*0.40, rAxle - RTH*0.42, RTW*0.80, RTH*0.15, RTW*0.14); g.fill();
      }
      /* the rear wing, above the body, on its endplates */
      /* just above the roll hoop, not up in the sky — at RTH*0.66 it floated
         clear of the whole car and read as a black bar across the frame */
      /* ---- THE ENGINE COVER, BEHIND THE COCKPIT ------------------------
         From the reference: past the roll hoop there is a body of metal
         running back to the rear axle — the airbox and the engine cover — and
         the wing sits ABOVE that, not floating on its own. Without it the car
         had nothing between the cockpit and the wing but air.
         ---------------------------------------------------------------- */
      const ecTop = rAxle - RTH*0.34, ecBot = rAxle + RTH*0.18;
      const ec = g.createLinearGradient(w*0.42, 0, w*0.58, 0);
      ec.addColorStop(0, o.lo); ec.addColorStop(0.42, o.body);
      ec.addColorStop(0.58, o.hi); ec.addColorStop(1, o.lo);
      g.fillStyle = ec;
      g.beginPath();
      g.moveTo(w*0.452, ecTop);
      g.quadraticCurveTo(w*0.5, ecTop - h*0.030, w*0.548, ecTop);
      g.lineTo(w*0.600, ecBot);
      g.lineTo(w*0.400, ecBot);
      g.closePath(); g.fill();
      /* No sidepods. They were two dark blocks either side of the cover and at
         this size they read as clutter rather than bodywork — the cover and
         the wing are the two things you actually see past a formula car's
         cockpit, and adding a third only muddied them. */

      /* the rear wing, standing on the engine cover */
      const rwY = rAxle - RTH*0.50;
      g.fillStyle = '#191d22';
      g.fillRect(w*0.115, rwY, w*0.770, h*0.046);
      g.fillStyle = 'rgba(200,215,230,.14)';
      g.fillRect(w*0.115, rwY, w*0.770, h*0.011);
      /* the swan necks holding it up off the cover */
      for(const sx of [-1,1]){
        g.strokeStyle = '#1b1f26'; g.lineWidth = Math.max(2, w*0.020);
        g.beginPath();
        g.moveTo(w*0.5 + sx*w*0.090, rwY + h*0.044);
        g.lineTo(w*0.5 + sx*w*0.075, ecTop);
        g.stroke();
      }
      for(const sx of [-1,1]){
        g.fillStyle = '#141820';
        g.fillRect(w*0.5 + sx*w*0.385 - (sx>0?w*0.030:0), rwY - h*0.020,
                   w*0.030, h*0.095);
      }
      g.restore();

      /* ---- the tyres, first: the tallest things here --------------------- */
      for(const sx of [-1,1]){
        const wx = w*0.5 + sx*track;
        g.fillStyle = 'rgba(0,0,0,.40)';
        g.beginPath(); g.ellipse(wx, axle + TH2*0.52, TW*0.60, h*0.020, 0, 0, 6.2832); g.fill();
        g.fillStyle = '#0a0b0d';
        rr(g, wx - TW*0.5, axle - TH2*0.5, TW, TH2, TW*0.30); g.fill();
        /* the shoulder, and a band low down */
        g.fillStyle = 'rgba(170,184,198,.13)';
        rr(g, wx - TW*0.40, axle - TH2*0.42, TW*0.80, TH2*0.16, TW*0.14); g.fill();
        g.fillStyle = 'rgba(0,0,0,.55)';
        rr(g, wx - TW*0.44, axle + TH2*0.16, TW*0.88, TH2*0.12, TW*0.10); g.fill();
        /* the rim, seen edge-on */
        g.fillStyle = '#4a545d';
        g.beginPath(); g.ellipse(wx, axle, TW*0.19, TH2*0.17, 0, 0, 6.2832); g.fill();
      }

      /* ---- the body: a shallow wedge, low between the wheels ------------- */
      const deckY = axle - TH2*0.30;
      const tub = g.createLinearGradient(w*0.34, 0, w*0.66, 0);
      tub.addColorStop(0, o.lo); tub.addColorStop(0.38, o.body);
      tub.addColorStop(0.56, o.hi); tub.addColorStop(1, o.lo);
      g.fillStyle = tub;
      g.beginPath();
      g.moveTo(w*0.408, deckY);
      g.quadraticCurveTo(w*0.5, deckY - h*0.030, w*0.592, deckY);
      g.lineTo(w*0.640, axle + TH2*0.40);
      g.quadraticCurveTo(w*0.5, axle + TH2*0.50, w*0.360, axle + TH2*0.40);
      g.closePath(); g.fill();

      /* the nose cone: broad, low, and forward of everything */
      g.fillStyle = o.hi;
      g.beginPath();
      g.moveTo(w*0.432, axle + TH2*0.02);
      g.quadraticCurveTo(w*0.5, axle - TH2*0.05, w*0.568, axle + TH2*0.02);
      g.lineTo(w*0.596, axle + TH2*0.44);
      g.quadraticCurveTo(w*0.5, axle + TH2*0.54, w*0.404, axle + TH2*0.44);
      g.closePath(); g.fill();
      /* the number on it */
      drawMarque(g, 'FORMULA', w*0.5, axle + TH2*0.26, h*0.034);

      /* ---- the roll hoop, low over a low deck ---------------------------- */
      g.fillStyle = o.lo;
      g.beginPath();
      g.moveTo(w*0.452, deckY);
      g.quadraticCurveTo(w*0.5, deckY - h*0.098, w*0.548, deckY);
      g.closePath(); g.fill();
      /* the halo, hugging it */
      g.strokeStyle = '#1d2229';
      g.lineWidth = Math.max(2.6, w*0.024);
      g.beginPath();
      g.moveTo(w*0.392, deckY + h*0.016);
      g.quadraticCurveTo(w*0.5, deckY - h*0.072, w*0.608, deckY + h*0.016);
      g.stroke();
      g.lineWidth = Math.max(2, w*0.018);
      g.beginPath();
      g.moveTo(w*0.5, deckY - h*0.038); g.lineTo(w*0.5, deckY + h*0.016);
      g.stroke();

      /* ---- suspension: two wishbones a side, out to the hubs ------------- */
      for(const sx of [-1,1]){
        const wx = w*0.5 + sx*track;
        g.strokeStyle = '#39424b'; g.lineWidth = Math.max(1.6, w*0.014);
        g.beginPath();
        g.moveTo(wx - sx*TW*0.34, axle - TH2*0.14);
        g.lineTo(w*0.5 - sx*w*0.030, deckY + h*0.020); g.stroke();
        g.beginPath();
        g.moveTo(wx - sx*TW*0.34, axle + TH2*0.16);
        g.lineTo(w*0.5 - sx*w*0.030, axle + TH2*0.30); g.stroke();
      }

      /* ---- the front wing: LOW, wide, and in front of the wheels --------- */
      for(let k=0;k<3;k++){
        const wy = axle + TH2*0.34 - k*h*0.028;
        const ww = 0.470 - k*0.012;
        g.fillStyle = k === 0 ? '#e9eef4' : (k === 1 ? '#c6cfd9' : '#a2adb8');
        rr(g, w*(0.5-ww), wy, w*ww*2, h*0.024, h*0.007); g.fill();
      }
      for(const sx of [-1,1]){
        g.fillStyle = '#232930';
        rr(g, w*0.5 + sx*w*0.470 - (sx>0?w*0.034:0), axle + TH2*0.02,
           w*0.034, h*0.150, 3); g.fill();
      }
      return;
    }

    /* ---- a road car's nose ------------------------------------------------
       DIMENSIONALLY THE SAME CAR as its own tail: the width comes from the
       body's `wide`, the arches from `arch`, the greenhouse from `cabW` and
       `roofR`. What differs is the FACE \u2014 lamp shape, grille, intakes \u2014 which
       is exactly how the three tails differ. A Ferrari and a Porsche are the
       same size; they are not the same face.
       -------------------------------------------------------------------- */
    const F = kind === 'STALLION' ? 'F' : kind === 'CREST' ? 'P' : 'L';
    /* a rear-engined car has almost no nose, and it should look it: P's body
       starts lower and its deck is shallower than the other two */
    if(F === 'P') topY = h*(B.bodyTop + 0.055);
    const archK = B.arch || 1;
    const hipY  = botY - h*0.30;
    /* the roofline is needed by the WING, which now draws first — so it is
       computed here rather than down in the greenhouse block */
    const cw2 = (B.cabW || 0.5) * 0.92, rr2 = h*((B.roofR||0.1)*0.4 + 0.03);
    const roofT = topY - h*0.19;

    /* ---- THE SPOILER SITS BEHIND THE CAR ---------------------------------
       Drawn last it was in FRONT of the roof and the glass, which is backwards:
       from the front of a car its own wing is the furthest thing away, behind
       the whole body. So it goes first, before the arches and the greenhouse,
       and everything else covers it — you see the ends of it past the roof and
       nothing more, which is exactly what you see on the road. */
    if(B.spoiler){
      /* `roofT` is already near the top of the sprite, so anything above it
         ran off the canvas — L's and P's wings were clipped away entirely. The
         wing sits just BELOW the roofline, which is also where it really is:
         you see it through and around the glasshouse, not floating over it. */
      const wingY = F === 'L' ? roofT + h*0.020
                  : F === 'P' ? roofT + h*0.038
                  :             roofT + h*0.075;
      /* ---- MATCH THE REAR, EXACTLY -----------------------------------
         The rear wings are measured against the SPRITE, not against `wid`:
         L's aerofoil runs 0.06 to 0.94 (0.88 across) and P's blade 0.015 to
         0.985 (0.97). Deriving the front from `wid` made L's 1.02 wide —
         wider than the car and wider than its own back. These are the rear's
         numbers, halved. */
      const wingW = F === 'L' ? 0.440 : F === 'P' ? 0.485 : wid*0.72;
      g.fillStyle = o.lo;
      if(F === 'F'){
        /* a lip: shallow, close to the deck, the body's own colour */
        rr(g, w*(0.5-wingW), wingY, w*wingW*2, h*0.022, h*0.008); g.fill();
        g.fillStyle = 'rgba(255,255,255,.16)';
        g.fillRect(w*(0.5-wingW), wingY, w*wingW*2, Math.max(1.5, h*0.007));
      } else {
        /* ---- and the rear's COLOUR too ----------------------------------
           L's aerofoil is body-coloured (`o.lo`); P's blade is dark
           ('#1a1d22'). One rule for both was always going to be wrong for one
           of them, so each front takes what its own back uses. */
        g.fillStyle = (F === 'P') ? '#1a1d22' : o.lo;
        rr(g, w*(0.5-wingW), wingY, w*wingW*2, h*0.026, h*0.006); g.fill();
        /* the REAR lifts its blade with `rgba(255,255,255,.16)`; the front was
           using a dimmer, bluer 12% and came out visibly darker than the same
           wing seen from behind. Same value both ends. */
        g.fillStyle = 'rgba(255,255,255,.16)';
        g.fillRect(w*(0.5-wingW), wingY, w*wingW*2, Math.max(1.5, h*0.009));
        for(const sx of [-1,1]){
          /* P's uprights hang from the blade and are darker still */
          g.fillStyle = (F === 'P') ? '#15171b' : o.body;
          g.fillRect(w*0.5 + sx*w*wingW*0.62 - w*0.010, wingY + h*0.024,
                     w*0.020, h*0.038);
        }
      }
    }


    /* the arches, proud of the body, so the width reads before anything else */
    for(const sx of [-1,1]){
      g.fillStyle = o.lo;
      g.beginPath();
      g.ellipse(w*0.5 + sx*w*wid*0.88, hipY + h*0.05,
                w*0.108*archK, h*0.100*archK, 0, 0, 6.2832);
      g.fill();
    }

    /* stripes on the nose: over the roof and down the bonnet, glass clear */
    const stripeOn = o.stripes && kind !== 'FORMULA';

    /* the greenhouse */
    g.fillStyle = o.lo;
    g.beginPath();
    g.moveTo(w*(0.5-wid*0.80), topY + h*0.02);
    g.quadraticCurveTo(w*(0.5-cw2*0.62), roofT, w*(0.5-cw2*0.46), roofT);
    g.lineTo(w*(0.5+cw2*0.46), roofT);
    g.quadraticCurveTo(w*(0.5+cw2*0.62), roofT, w*(0.5+wid*0.80), topY + h*0.02);
    g.closePath(); g.fill();
    /* P's dome is right; its GLASS was small inside it. The pane springs
       wider and reaches higher for that body only — the shell is untouched. */
    const glassK = F === 'P' ? 1.0 : 0.0;
    const gg4 = g.createLinearGradient(0, roofT, 0, topY + h*0.02);
    gg4.addColorStop(0,'#38495c'); gg4.addColorStop(0.5,'#141c26'); gg4.addColorStop(1,'#0d131b');
    g.fillStyle = gg4;
    g.beginPath();
    const gSpring = 0.70 + glassK*0.075;          /* wider at the shoulders */
    const gRoof   = roofT + rr2 * (1 - glassK*0.55);   /* nearer the roof */
    const gCtl    = 0.56 + glassK*0.05;
    const gTop    = 0.40 + glassK*0.05;
    g.moveTo(w*(0.5-wid*gSpring), topY - h*0.005);
    g.quadraticCurveTo(w*(0.5-cw2*gCtl), gRoof, w*(0.5-cw2*gTop), gRoof);
    g.lineTo(w*(0.5+cw2*gTop), gRoof);
    g.quadraticCurveTo(w*(0.5+cw2*gCtl), gRoof, w*(0.5+wid*gSpring), topY - h*0.005);
    g.closePath(); g.fill();
    for(const sx of [-1,1]){
      g.fillStyle = o.body;
      g.beginPath();
      g.ellipse(w*0.5 + sx*w*wid*0.94, topY + h*0.015, w*0.045, h*0.022, 0, 0, 6.2832);
      g.fill();
    }

    /* ---- THE LIGHT BAR, SEEN HEAD ON ------------------------------------
       The tail draws one for any `force` body and the nose drew none, so the
       super cruiser had a bar you could only see in a mirror.

       Same proportions as the rear, exactly — 0.24 to 0.76 across, 0.045 tall,
       two lenses 0.235 wide inset 0.005 — so the two ends are the same object.
       Only the Y differs, because the front's roof line is `roofT` rather than
       a fraction of `cabinTop`, and the two painters build their cabins
       differently. The bar sits ON that roof.

       The colours mirror: seen from the front, the car's own left carries the
       red and its right the blue, which is the reverse of the view from
       behind.
       ------------------------------------------------------------------- */
    if(B.force){
      const bY = roofT - h*0.030;
      g.fillStyle = '#1b1e24';
      rr(g, w*0.24, bY, w*0.52, h*0.045, 2); g.fill();
      g.fillStyle = '#ff2b4a';
      rr(g, w*0.255, bY + h*0.005, w*0.235, h*0.034, 2); g.fill();
      g.fillStyle = '#2f6bff';
      rr(g, w*0.51, bY + h*0.005, w*0.235, h*0.034, 2); g.fill();
      g.fillStyle = '#2b3038';
      for(const sx of [0.285, 0.695]) g.fillRect(w*sx, bY + h*0.040, w*0.020, h*0.020);
    }

    /* the body, shouldered like its own tail */
    const bg2 = g.createLinearGradient(w*(0.5-wid), 0, w*(0.5+wid), 0);
    bg2.addColorStop(0, o.lo); bg2.addColorStop(0.28, o.body);
    bg2.addColorStop(0.50, o.hi); bg2.addColorStop(0.76, o.body); bg2.addColorStop(1, o.lo);
    g.fillStyle = bg2;
    g.beginPath();
    g.moveTo(w*(0.5-wid*0.90), topY);
    g.lineTo(w*(0.5+wid*0.90), topY);
    g.quadraticCurveTo(w*(0.5+wid), topY + h*0.05, w*(0.5+wid), hipY);
    g.lineTo(w*(0.5+wid*0.94), botY);
    g.lineTo(w*(0.5-wid*0.94), botY);
    g.lineTo(w*(0.5-wid), hipY);
    g.quadraticCurveTo(w*(0.5-wid), topY + h*0.05, w*(0.5-wid*0.90), topY);
    g.closePath(); g.fill();

    if(stripeOn){
      /* the same table the rear reads, so front and back match exactly */
      const SC = stripeCols(kind);
      g.fillStyle = shade(o.body, 0.42);
      for(const sx of SC.xs){
        g.fillRect(w*sx, roofT, w*SC.w, h*0.030);
        g.fillRect(w*sx, topY, w*SC.w, botY - topY - h*0.05);
      }
    }

    /* ---- THE FACE, one per marque ---------------------------------------- */
    if(F === 'F'){
      /* wide slim lamps swept back into the wings, a low hexagonal mouth and
         two brake ducts \u2014 front-engined, so the mouth is the biggest feature */
      for(const sx of [-1,1]){
        const lx = w*0.5 + sx*w*wid*0.60;
        g.fillStyle = '#eef6ff';
        g.beginPath();
        g.moveTo(lx - sx*w*0.115, topY + h*0.085);
        g.lineTo(lx + sx*w*0.075, topY + h*0.062);
        g.lineTo(lx + sx*w*0.075, topY + h*0.102);
        g.lineTo(lx - sx*w*0.115, topY + h*0.125);
        g.closePath(); g.fill();
        headGlow(g, lx, topY + h*0.093, w);
      }
      g.fillStyle = 'rgba(10,12,16,.9)';
      g.beginPath();
      g.moveTo(w*(0.5-wid*0.50), topY + h*0.20);
      g.lineTo(w*(0.5+wid*0.50), topY + h*0.20);
      g.lineTo(w*(0.5+wid*0.40), topY + h*0.325);
      g.lineTo(w*(0.5-wid*0.40), topY + h*0.325);
      g.closePath(); g.fill();
      slats(g, w*(0.5-wid*0.46), topY + h*0.225, w*wid*0.92, h*0.075, 4);
      for(const sx of [-1,1]){
        g.fillStyle = 'rgba(10,12,16,.75)';
        rr(g, w*0.5 + sx*w*wid*0.80 - (sx>0?w*0.085:0), topY + h*0.22, w*0.085, h*0.075, 3);
        g.fill();
      }
    } else if(F === 'L'){
      /* angular Y-shaped lamps, a narrow slot, and huge triangular side
         intakes \u2014 mid-engined, so the sides do the breathing */
      /* QUADRUPLE round lamps, angled back in a slanted housing — a stack of
         two either side, which is what a Y-tail car should have at the front */
      for(const sx of [-1,1]){
        const lx = w*0.5 + sx*w*wid*0.60;
        g.save();
        g.translate(lx, topY + h*0.095);
        g.rotate(sx * 0.30);
        g.fillStyle = 'rgba(10,12,16,.88)';
        rr(g, -w*0.098, -h*0.048, w*0.196, h*0.096, h*0.020); g.fill();
        for(const k of [-1, 1]){
          g.fillStyle = '#eef6ff';
          g.beginPath(); g.arc(k*w*0.046, 0, w*0.036, 0, 6.2832); g.fill();
          g.fillStyle = 'rgba(150,190,255,.35)';
          g.beginPath(); g.arc(k*w*0.046, -h*0.008, w*0.020, 0, 6.2832); g.fill();
        }
        g.restore();
        headGlow(g, lx - sx*w*0.03, topY + h*0.088, w);
        headGlow(g, lx + sx*w*0.03, topY + h*0.102, w);
      }
      g.fillStyle = 'rgba(10,12,16,.9)';
      rr(g, w*(0.5-wid*0.34), topY + h*0.215, w*wid*0.68, h*0.055, 3); g.fill();
      for(const sx of [-1,1]){
        g.fillStyle = 'rgba(8,10,14,.85)';
        g.beginPath();
        g.moveTo(w*0.5 + sx*w*wid*0.94, topY + h*0.17);
        g.lineTo(w*0.5 + sx*w*wid*0.44, topY + h*0.30);
        g.lineTo(w*0.5 + sx*w*wid*0.94, topY + h*0.33);
        g.closePath(); g.fill();
      }
    } else {
      /* four round lamps in two pods and a plain low mouth \u2014 rear-engined, so
         the nose has almost nothing to do and looks it */
      /* ---- A BANDED UNIBROW -------------------------------------------------
         Its TAIL is one full-width bar, so its face is the same idea inverted:
         a single band running nearly the whole width, split by a short break at
         the centre, and divided into segments so it reads as lamps rather than
         a stripe. */
      const bw2 = wid*0.86, by2 = topY + h*0.075, bh2 = h*0.052;
      g.fillStyle = 'rgba(10,12,16,.88)';
      rr(g, w*(0.5-bw2), by2 - h*0.010, w*bw2*2, bh2 + h*0.020, bh2*0.6); g.fill();
      for(const sx of [-1,1]){
        const x0 = sx < 0 ? w*(0.5-bw2*0.94) : w*(0.5+bw2*0.10);
        const segW = w*bw2*0.84;
        g.fillStyle = '#eef6ff';
        rr(g, x0, by2, segW, bh2, bh2*0.5); g.fill();
        /* the bands across it */
        g.fillStyle = 'rgba(20,26,34,.55)';
        for(let k=1;k<4;k++)
          g.fillRect(x0 + segW*(k/4) - w*0.004, by2, w*0.008, bh2);
        headGlow(g, x0 + segW*0.5, by2 + bh2*0.5, w);
      }
      g.fillStyle = 'rgba(10,12,16,.85)';
      rr(g, w*(0.5-wid*0.42), topY + h*0.235, w*wid*0.84, h*0.060, h*0.024); g.fill();
    }

    /* splitter and shadow, common to all three */
    g.fillStyle = '#1b1f26';
    g.fillRect(w*(0.5-wid*0.96), botY - h*0.05, w*wid*1.92, h*0.05);
    /* ---- CLEAR OF THE LAMPS -------------------------------------------
       At `topY + 0.155` the mark landed on the lamp line of every face — on
       CREST it sat inside the unibrow. It goes ABOVE them, on the bonnet
       between the screen and the light units, where there is bare metal. */
    if(B.rear) drawMarque(g, B.rear, w*0.5, topY + h*0.038, h*0.034);
  };
}

function paintCar(o){
  return (g,w,h)=>{
    const cy = h;
    // ground shadow
    g.fillStyle='rgba(0,0,0,.5)';
    g.beginPath(); g.ellipse(w/2, cy-6, w*0.47, h*0.055, 0, 0, 6.2832); g.fill();
    // wheels
    g.fillStyle='#0d0e12';
    rr(g, w*0.015, cy-h*0.30, w*0.13, h*0.27, 3); g.fill();
    rr(g, w-w*0.145, cy-h*0.30, w*0.13, h*0.27, 3); g.fill();
    const B = o.shape || null;
    // lower body
    const bg = g.createLinearGradient(0, h*o.bodyTop, 0, cy);
    bg.addColorStop(0, o.hi); bg.addColorStop(0.5, o.body); bg.addColorStop(1, o.lo);
    g.fillStyle = bg;
    /* ---- a body with a SHOULDER, not a rounded box ----------------------
       These were rounded rectangles, which is why they read as toys. A
       supercar from behind is widest at the rear arches, tucks in above them
       to a narrow deck, and the bottom pulls in again over the diffuser. This
       is that silhouette as a single path: wide hips, a shoulder crease, and a
       tapered lower edge.
       ------------------------------------------------------------------- */
    const topY = h*o.bodyTop, botY = cy - h*0.035;
    const hipY = topY + (botY-topY)*0.42;
    /* overall width is its OWN number now rather than a function of the hips */
    const wid  = 0.42 + (B ? B.wide : 0.03);
    const deck = wid - 0.085;                     /* narrower across the deck */
    g.beginPath();
    g.moveTo(w*(0.5-deck), topY + h*0.012);
    g.quadraticCurveTo(w*0.5, topY - h*0.010, w*(0.5+deck), topY + h*0.012);
    g.quadraticCurveTo(w*(0.5+wid), topY + h*0.030, w*(0.5+wid), hipY);
    g.lineTo(w*(0.5+wid), botY - h*0.030);
    g.quadraticCurveTo(w*(0.5+wid), botY, w*(0.5+wid-0.055), botY);
    g.lineTo(w*(0.5-wid+0.055), botY);
    g.quadraticCurveTo(w*(0.5-wid), botY, w*(0.5-wid), botY - h*0.030);
    g.lineTo(w*(0.5-wid), hipY);
    g.quadraticCurveTo(w*(0.5-wid), topY + h*0.030, w*(0.5-deck), topY + h*0.012);
    g.closePath(); g.fill();
    /* ---- the arches stand PROUD ----------------------------------------
       A rear arch is a blister that catches its own light, not part of the
       flank. Drawn as separate lobes over the body with their own highlight,
       which is most of what stops these reading as slabs.
       ------------------------------------------------------------------- */
    if(B){
      for(const sx of [0.5-wid+0.055, 0.5+wid-0.055]){
        const ag = g.createLinearGradient(0, hipY - h*0.05, 0, botY);
        ag.addColorStop(0, o.hi); ag.addColorStop(0.45, o.body); ag.addColorStop(1, o.lo);
        g.fillStyle = ag;
        g.beginPath();
        const aw = 0.115 * (B.arch || 1), ah = 0.085 * (B.arch || 1);
        g.ellipse(w*sx, hipY + h*0.030, w*aw, h*ah, 0, 0, 6.2832);
        g.fill();
        /* the crown highlight */
        g.fillStyle = 'rgba(255,255,255,.20)';
        g.beginPath();
        g.ellipse(w*sx, hipY + h*0.002, w*0.075*(B.arch||1), h*0.020, 0, 0, 6.2832);
        g.fill();
      }
    }

    /* ---- the lower third is DARK ----------------------------------------
       On the real cars the painted body is a band across the middle: below the
       arch line it is all valance, vent and diffuser. Painting the bottom dark
       is what makes the colour above it read as bodywork.
       ------------------------------------------------------------------- */
    g.fillStyle = 'rgba(12,12,16,.55)';
    g.beginPath();
    g.moveTo(w*(0.5-wid+0.03), botY - h*0.085);
    g.lineTo(w*(0.5+wid-0.03), botY - h*0.085);
    g.lineTo(w*(0.5+wid-0.075), botY);
    g.lineTo(w*(0.5-wid+0.075), botY);
    g.closePath(); g.fill();

    /* ---- side intakes -----------------------------------------------------
       Every one of these cars has a black intake cut into the flank behind the
       door, and it is a big part of why they look like supercars rather than
       coupes. Three slats each side, angled with the shoulder. */
    g.save();
    g.fillStyle = 'rgba(10,10,14,.62)';
    for(const sx of [-1, 1]){
      for(let k2=0;k2<3;k2++){
        const vy = hipY - h*0.055 + k2*h*0.020;
        const vw = w*0.085 - k2*w*0.012;
        g.beginPath();
        g.roundRect(w*0.5 + sx*(wid*w*0.72) - (sx>0?0:vw), vy, vw, h*0.012, h*0.006);
        g.fill();
      }
    }
    g.restore();

    /* ---- STRIPES, if the car is wearing them --------------------------
       Paint, so they stop at the glass: one run over the roof, one down the
       deck, and the window left clear — the same rule the muscle car uses. */

    /* ---- A FORCE CAR CARRIES ITS BAR ----------------------------------
       `paintRig('cop')` draws one; `paintCar` never did, so the SUPER CRUISER
       had lights and a wash floating above a bare roof. Same span, height and
       housing as the cruiser's, so the two read as one force. */
    if(o.force){
      /* the cabin BOX starts at `cabinTop` but the drawn roof is a curve inset
         from it — the same trap the stripes fell into. A third of the way down
         the cabin span is where the metal actually is, so the bar SITS on it. */
      const cabH = h*(o.bodyTop - o.cabinTop);
      const bY = h*o.cabinTop + cabH*0.30 - h*0.040;
      g.fillStyle = '#1b1e24';
      rr(g, w*0.24, bY, w*0.52, h*0.045, 2); g.fill();
      g.fillStyle = '#2f6bff';
      rr(g, w*0.255, bY + h*0.005, w*0.235, h*0.034, 2); g.fill();
      g.fillStyle = '#ff2b4a';
      rr(g, w*0.51, bY + h*0.005, w*0.235, h*0.034, 2); g.fill();
      /* the two stanchions it sits on */
      g.fillStyle = '#2b3038';
      for(const sx of [0.285, 0.695]) g.fillRect(w*sx, bY + h*0.040, w*0.020, h*0.020);
    }

    /* the shoulder crease that runs across every one of them */
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = Math.max(1, h*0.006);
    g.beginPath();
    g.moveTo(w*(0.5-wid+0.02), hipY);
    g.quadraticCurveTo(w*0.5, hipY - h*0.020, w*(0.5+wid-0.02), hipY);
    g.stroke();
    /* a dark shadow under the arch line, which is what gives it volume */
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, h*0.010);
    g.beginPath();
    g.moveTo(w*(0.5-wid+0.02), hipY + h*0.014);
    g.quadraticCurveTo(w*0.5, hipY - h*0.004, w*(0.5+wid-0.02), hipY + h*0.014);
    g.stroke();
    // cabin
    if(o.cabin){
      const wid = 0.42 + (B ? B.wide : 0.03);
      /* shared by the dome shell AND the screen, so they cannot drift apart */
      const springX = 0.5 - wid + 0.02;
      let cabinPath = null;
      const springY = h*o.bodyTop + h*0.02;
      const apex    = h*o.cabinTop + h*0.015;
      const cg = g.createLinearGradient(0, h*o.cabinTop, 0, h*o.bodyTop+4);
      cg.addColorStop(0, o.lo); cg.addColorStop(1, o.body);
      g.fillStyle=cg;
      /* cabin width and roof radius come from the SHAPE, which is most of what
         separates a wedge from a rounded rear-engined car at a glance */
      /* A real rear screen is far narrower than the arches — these were nearly
         parallel-sided, which is the other half of why they looked like toys. */
      const cw = (B ? B.cabW*0.80 : 0.60), co = (B ? B.cabOff : 0);
      const rad = w * (B ? B.roofR*0.5 + 0.02 : 0.05);
      if(B && B.dome){
        /* ---- a full-width dome ------------------------------------------
           The 911 roofline is one continuous arc from the top of one rear
           arch across to the other — there is no flat roof panel and no
           separate pillar, which is the whole shape of the car. Drawn as a
           single curve springing from the shoulders rather than a rounded
           box sitting on the deck.
           ---------------------------------------------------------------- */
        /* Springs from the ARCHES, not from the cabin width — the first pass
           used the greenhouse dimension and covered barely half the car. */
        /* The control points were only 0.02 in from the springing line, so the
           curve went up almost vertically and then flattened — a pointed
           marquee rather than a dome. For a smooth arc they belong about a
           third of the span in, and the apex a little below the old one. */
        const span = (1 - springX*2), ctl = span*0.30;
        g.beginPath();
        g.moveTo(w*springX, springY);
        g.bezierCurveTo(w*(springX+ctl), apex,
                        w*(1-springX-ctl), apex,
                        w*(1-springX), springY);
        g.lineTo(w*(1-springX), springY + h*0.03);
        g.lineTo(w*springX, springY + h*0.03);
        g.closePath(); g.fill();
        /* the DOME sets the clip path too — it did not, so CREST fell back to
           a plain rect and its stripe overhung the arc by seven pixels */
        cabinPath = function(){
          g.beginPath();
          g.moveTo(w*springX, springY);
          g.bezierCurveTo(w*(springX+ctl), apex,
                          w*(1-springX-ctl), apex,
                          w*(1-springX), springY);
          g.lineTo(w*(1-springX), springY + h*0.03);
          g.lineTo(w*springX, springY + h*0.03);
          g.closePath();
        };
      } else {
        /* ---- THE SAME GREENHOUSE AS THE FRONT --------------------------------
           The rear cabin was a rounded BOX; the front is a shouldered curve
           springing from the body, and that shape is much better. Same
           construction here, driven by the same `cabW` and `roofR`, so a car
           has one roofline seen from either end. */
        /* ---- IDENTICAL TO THE FRONT ------------------------------------
           The front springs from `wid*0.80` and pulls its control points to
           `cabW*0.92 * 0.62`, with the roof line 0.19h above the body. Those
           are the numbers, verbatim, so the two ends cannot disagree. */
        const cw3 = (B ? B.cabW*0.92 : 0.46);
        const spX = 0.5 - wid*0.80;
        const roofY = h*o.bodyTop - h*0.19;
        g.beginPath();
        g.moveTo(w*spX, h*o.bodyTop + h*0.06);
        g.lineTo(w*spX, h*o.bodyTop + h*0.02);
        g.quadraticCurveTo(w*(0.5-cw3*0.62), roofY, w*(0.5-cw3*0.46), roofY);
        g.lineTo(w*(0.5+cw3*0.46), roofY);
        g.quadraticCurveTo(w*(0.5+cw3*0.62), roofY, w*(1-spX), h*o.bodyTop + h*0.02);
        g.lineTo(w*(1-spX), h*o.bodyTop + h*0.06);
        g.closePath(); g.fill();
        /* keep the shell's own path so the stripe can be clipped to it */
        cabinPath = function(){
          g.beginPath();
          g.moveTo(w*spX, h*o.bodyTop + h*0.06);
          g.lineTo(w*spX, h*o.bodyTop + h*0.02);
          g.quadraticCurveTo(w*(0.5-cw3*0.62), roofY, w*(0.5-cw3*0.46), roofY);
          g.lineTo(w*(0.5+cw3*0.46), roofY);
          g.quadraticCurveTo(w*(0.5+cw3*0.62), roofY, w*(1-spX), h*o.bodyTop + h*0.02);
          g.lineTo(w*(1-spX), h*o.bodyTop + h*0.06);
          g.closePath();
        };
      }
      /* ---- THE ROOF RUN, TRIMMED BY THE GLASS ITSELF --------------------
         Every attempt to compute where the roof ends and the screen begins was
         off by a few pixels, because the roof is a curve and the glass is
         inset from it by an amount that differs per body.

         So: do not compute it. Paint the stripe over the WHOLE cabin here,
         after the shell and BEFORE the glass — then the glass is drawn on top
         and trims it to exactly the lip, pixel for pixel, whatever shape the
         roof is. No constant to get wrong.
         ---------------------------------------------------------------- */
      if(o.stripes){
        /* CLIPPED to the shell above and TRIMMED by the glass below, so both
           ends land on the metal exactly — no constant either side. */
        g.save();
        if(cabinPath) cabinPath(); else g.rect(0, h*o.cabinTop, w, h);
        g.clip();
        const SC = stripeCols(o.bodyKey);
        g.fillStyle = shade(o.body, 0.42);
        for(const sx of SC.xs)
          g.fillRect(w*sx, 0, w*SC.w, h);
        g.restore();
      }

      // rear glass
      const gg = g.createLinearGradient(0, h*o.cabinTop, 0, h*o.bodyTop);
      gg.addColorStop(0,'#4a5a6e'); gg.addColorStop(0.35,'#141a24'); gg.addColorStop(1,'#0b0e14');
      g.fillStyle=gg;
      if(B && B.dome){
        /* the glass follows the same arc, inset from it */
        /* ---- the rear screen ----------------------------------------------
           A second arc filling the whole dome made the glass look like a
           bubble. On the real car the screen is a WIDE, SHALLOW pane set into
           the dome: flat-ish across the top, tucked in at the sides where the
           roof rail comes down, and it does not reach the shoulders. Springs
           from the SAME y as the dome so the rail is even on both sides.
           ------------------------------------------------------------------ */
        /* the pane was small inside a big dome. Nearer the springing line and
           taller, so it fills the glasshouse without touching the roof rail. */
        const sX = springX + 0.055, sY = springY - h*0.006;
        const sSpan = (1 - sX*2);
        const sApex = apex + h*0.030;
        g.beginPath();
        g.moveTo(w*sX, sY);
        /* up the near pillar */
        g.quadraticCurveTo(w*(sX + sSpan*0.10), sApex + h*0.014, w*(sX + sSpan*0.24), sApex);
        /* across the top, barely curved */
        g.quadraticCurveTo(w*0.5, sApex - h*0.014, w*(1-sX-sSpan*0.24), sApex);
        /* down the far pillar */
        g.quadraticCurveTo(w*(1-sX-sSpan*0.10), sApex + h*0.014, w*(1-sX), sY);
        g.closePath(); g.fill();
        /* a slim reflection across the top of the pane */
        g.fillStyle = 'rgba(150,190,230,.16)';
        g.beginPath();
        g.moveTo(w*(sX+sSpan*0.20), sApex + h*0.004);
        g.quadraticCurveTo(w*0.5, sApex - h*0.010, w*(1-sX-sSpan*0.20), sApex + h*0.004);
        g.quadraticCurveTo(w*0.5, sApex + h*0.010, w*(sX+sSpan*0.20), sApex + h*0.004);
        g.closePath(); g.fill();
      } else {
        /* and the glass takes the front's inset numbers too */
        const cw4 = (B ? B.cabW*0.92 : 0.46);
        const rr4 = h*((B ? B.roofR : 0.1)*0.4 + 0.03);
        const spX2 = 0.5 - wid*0.70;
        const roofY2 = h*o.bodyTop - h*0.19 + rr4;
        g.beginPath();
        g.moveTo(w*spX2, h*o.bodyTop - h*0.005);
        g.quadraticCurveTo(w*(0.5-cw4*0.56), roofY2, w*(0.5-cw4*0.40), roofY2);
        g.lineTo(w*(0.5+cw4*0.40), roofY2);
        g.quadraticCurveTo(w*(0.5+cw4*0.56), roofY2, w*(1-spX2), h*o.bodyTop - h*0.005);
        g.closePath(); g.fill();
      }
    }
    /* the wing, and each shape wears a different one */
    const wing = B ? B.wing : 'lip';
    if(o.stripes){
      /* FATTER on a supercar — 0.055 on a body this wide read as pinstripes.
         0.085 with a narrower gap is a proper pair of racing stripes. */
      /* ---- DRAWN LAST, SO NOTHING PAINTS OVER IT ------------------------
         Measured: the deck run reached y=162 of 168 exactly as the arithmetic
         said, then the TAIL LAMPS and bumper were drawn on top and cut the
         visible stripe off at 146. Twenty-one pixels were COVERED, not
         missing — which is why widening the numbers changed nothing.

         The maths was right and the order was wrong. It goes after the lamps
         and the badge now, the way the muscle car's already did.
         The body runs from `bodyTop` down to `cy - h*0.035`, but the stripe
         stopped at `cy - h*0.08` — short by 0.045h, which is a visible band of
         bare paint under it. On STALLION and MATADOR that gap is what made the
         stripes look like they had ridden up the car.

         Both runs measure off the SAME numbers the body uses now, so they
         cannot drift again: roof from `cabinTop` to `bodyTop`, deck from
         `bodyTop` to the bottom of the body.
         ------------------------------------------------------------------ */
      g.fillStyle = shade(o.body, 0.42);
      /* ---- FIND THE ROOF, DO NOT GUESS IT -------------------------------
         Measured at the stripe's own x: the first solid pixel of the car is at
         y=42 on STALLION and y=55 on MATADOR, while `cabinTop` is 32 and 40. The
         cabin BOX starts well above the metal because the roof is a curve
         inset from it — so every constant I tried (`cabinTop`, then
         `cabinTop + 0.015`) put the stripe in the air above the car.

         Rather than guess a third offset, the roof line is read off the shape
         the greenhouse actually draws: the cabin spans `cabinTop` to
         `bodyTop`, and the metal begins about a quarter of the way down that
         span. That holds for both bodies and cannot float again.
         ------------------------------------------------------------------ */
      /* ---- THE ROOF RUN ONLY ---------------------------------------------
         `dT` and `bT` below are the BODY stripe and are not touched by any of
         this — that run has been right since it reached the bumper.

         `rT` is the roof. The cabin BOX starts at `cabinTop` but the drawn
         roof is a curve inset from it, so the metal begins about a third of
         the way down the cabin span. Measured: at `cabinTop` the stripe sat
         8px above the car on STALLION and 13px above on MATADOR.
         ------------------------------------------------------------------ */
      const cabH = h*(o.bodyTop - o.cabinTop);
      const rT = h*o.cabinTop + cabH*0.32, dT = h*o.bodyTop, bT = cy - h*0.035;
      const SC = stripeCols(o.bodyKey);
      for(const sx of SC.xs){
        /* the roof run is NOT here — it is drawn between the cabin shell and
           the glass so the window trims it */
        /* the deck: from the boot lid all the way to the bumper */
        g.fillRect(w*sx, dT, w*SC.w, bT - dT);
      }
    }

    if(o.spoiler && wing === 'high'){
      /* a proper aerofoil on stanchions, clear of the deck */
      g.fillStyle=o.lo;
      rr(g, w*0.06, h*o.bodyTop-h*0.15, w*0.88, h*0.05, 3); g.fill();
      g.fillStyle='rgba(255,255,255,.16)';
      rr(g, w*0.06, h*o.bodyTop-h*0.15, w*0.88, h*0.016, 3); g.fill();
      g.fillStyle=o.body;
      g.fillRect(w*0.19, h*o.bodyTop-h*0.11, w*0.055, h*0.10);
      g.fillRect(w*0.755, h*o.bodyTop-h*0.11, w*0.055, h*0.10);
    } else if(o.spoiler && wing === 'ducktail'){
      /* GT3 RS: a swan-neck wing held HIGH above the deck on two uprights that
         hang from the top of the blade, with a small ducktail below it */
      g.fillStyle=o.lo;
      g.beginPath();
      g.moveTo(w*0.14, h*o.bodyTop);
      g.quadraticCurveTo(w*0.5, h*o.bodyTop-h*0.055, w*0.86, h*o.bodyTop);
      g.lineTo(w*0.86, h*o.bodyTop+h*0.02);
      g.lineTo(w*0.14, h*o.bodyTop+h*0.02);
      g.closePath(); g.fill();
      /* the uprights, hanging from above */
      g.fillStyle='#15171b';
      g.fillRect(w*0.285, h*o.bodyTop-h*0.20, w*0.028, h*0.20);
      g.fillRect(w*0.687, h*o.bodyTop-h*0.20, w*0.028, h*0.20);
      /* the blade, wider than the car */
      g.fillStyle='#1a1d22';
      rr(g, w*0.015, h*o.bodyTop-h*0.235, w*0.97, h*0.042, 2); g.fill();
      g.fillStyle='rgba(255,255,255,.18)';
      rr(g, w*0.015, h*o.bodyTop-h*0.235, w*0.97, h*0.013, 2); g.fill();
      /* end plates */
      g.fillStyle='#15171b';
      g.fillRect(w*0.005, h*o.bodyTop-h*0.245, w*0.026, h*0.062);
      g.fillRect(w*0.969, h*o.bodyTop-h*0.245, w*0.026, h*0.062);
    } else if(o.spoiler){
      /* a shallow blade along the deck */
      g.fillStyle=o.lo;
      rr(g, w*0.12, h*o.bodyTop-h*0.05, w*0.76, h*0.038, 2); g.fill();
    }
    /* ---- the rear end, drawn from the real cars ------------------------
       F  four ROUND lamps, two a side, a slim dark band between them and
          twin round pipes low in a finned diffuser  (SF90)
       L  angular Y-shaped bars sweeping outward, hexagonal pipes high in
          the centre, a deep black diffuser  (Revuelto)
       P  ONE full-width light bar across the whole tail, twin pipes together
          low in the middle  (GT3 RS)
       -------------------------------------------------------------------- */
    const kind = B ? B.rear : 'MATADOR';
    const ty = cy - h*0.34, th = h*0.11;
    const lamp1 = o.lamp2 || '#ff6a5a', lamp0 = o.lamp || '#c8102e';

    if(kind === 'FORMULA'){
      /* ---- A FORMULA TAIL, second pass -------------------------------------
         The first one had the wing floating above a cone. From the reference,
         what actually reads: the tyres are ENORMOUS and nearly touch the wing
         endplates; the wing is a deep single plane with a visible bridge over
         it; the body between the wheels is LOW and mostly dark; and the
         diffuser is the tallest, brightest thing at the bottom.
         -------------------------------------------------------------------- */
      /* BACK to the proportions that worked. The second pass shrank the tyres
         and lifted the wing, and it lost the stance entirely. */
      const TW = w*0.30, TH2 = h*0.50;
      const cyT = ty + h*0.10;

      /* the two slicks, first, so everything else sits between them */
      for(const sx of [-1,1]){
        const wx = w*0.5 + sx*w*0.335;
        g.fillStyle = '#08090b';
        /* round-shouldered, not a square slab — a slick is a barrel */
        rr(g, wx - TW*0.5, cyT - TH2*0.5, TW, TH2, TW*0.32); g.fill();
        /* the shoulder catching light, and a sidewall band */
        g.fillStyle = 'rgba(150,164,178,.10)';
        rr(g, wx - TW*0.42, cyT - TH2*0.44, TW*0.84, TH2*0.16, TW*0.10); g.fill();
        g.fillStyle = 'rgba(0,0,0,.5)';
        rr(g, wx - TW*0.46, cyT + TH2*0.10, TW*0.92, TH2*0.10, TW*0.06); g.fill();
      }

      /* the body: low, dark, and clearly narrower than the track */
      const ec = g.createLinearGradient(w*0.38,0,w*0.62,0);
      ec.addColorStop(0,o.lo); ec.addColorStop(0.5,o.body); ec.addColorStop(1,o.lo);
      g.fillStyle = ec;
      g.beginPath();
      g.moveTo(w*0.435, cyT - TH2*0.34);
      g.lineTo(w*0.565, cyT - TH2*0.34);
      g.lineTo(w*0.605, cyT + TH2*0.22);
      g.lineTo(w*0.395, cyT + TH2*0.22);
      g.closePath(); g.fill();
      /* the rain light, low and central */
      g.fillStyle = '#ff2f3a';
      g.beginPath(); g.arc(w*0.5, cyT + TH2*0.02, w*0.028, 0, 6.2832); g.fill();
      g.save(); g.globalCompositeOperation='lighter';
      const rl = g.createRadialGradient(w*0.5, cyT+TH2*0.02, 0, w*0.5, cyT+TH2*0.02, w*0.085);
      rl.addColorStop(0,'rgba(255,55,64,.6)'); rl.addColorStop(1,'rgba(255,45,55,0)');
      g.fillStyle = rl; g.beginPath(); g.arc(w*0.5, cyT+TH2*0.02, w*0.085, 0, 6.2832); g.fill();
      g.restore();

      /* the diffuser: the tallest, brightest thing down here */
      const dY = cyT + TH2*0.22;
      g.fillStyle = '#0b0d10';
      g.fillRect(w*0.30, dY, w*0.40, h*0.16);
      g.strokeStyle = 'rgba(170,186,202,.30)'; g.lineWidth = Math.max(1.2, w*0.012);
      for(let k=-2;k<=2;k++){
        g.beginPath();
        g.moveTo(w*0.5 + k*w*0.072, dY);
        g.lineTo(w*0.5 + k*w*0.086, dY + h*0.16);
        g.stroke();
      }

      /* the wing: a deep plane, right across, with a bridge above it */
      const wgY = cyT - TH2*0.62;
      g.fillStyle = '#14171b';
      g.fillRect(w*0.05, wgY, w*0.90, h*0.075);
      g.fillStyle = 'rgba(205,220,235,.14)';
      g.fillRect(w*0.05, wgY, w*0.90, h*0.014);
      /* the bridge over the top */
      g.fillStyle = '#1b1f25';
      g.fillRect(w*0.32, wgY - h*0.030, w*0.36, h*0.020);
      /* endplates, tall, nearly touching the tyres */
      for(const sx of [-1,1]){
        g.fillStyle = '#14171b';
        g.fillRect(w*0.5 + sx*w*0.455 - (sx>0?w*0.040:0), wgY - h*0.035, w*0.040, h*0.155);
      }
      /* swan necks, over the top of the plane */
      for(const sx of [-1,1]){
        g.strokeStyle = '#1c2127'; g.lineWidth = Math.max(2.5, w*0.026);
        g.beginPath();
        g.moveTo(w*0.5 + sx*w*0.115, wgY + h*0.005);
        g.quadraticCurveTo(w*0.5 + sx*w*0.150, wgY + h*0.075,
                           w*0.5 + sx*w*0.105, cyT - TH2*0.36);
        g.stroke();
      }
      drawMarque(g, 'FORMULA', w*0.5, wgY + h*0.038, h*0.030);
      return;
    }

    if(kind === 'CREST'){
      /* the bar */
      g.fillStyle = 'rgba(20,16,18,.85)';
      rr(g, w*0.10, ty - h*0.012, w*0.80, th*1.10, th*0.5); g.fill();
      const lg = g.createLinearGradient(0, ty, 0, ty+th);
      lg.addColorStop(0, lamp1); lg.addColorStop(1, lamp0);
      g.fillStyle = lg;
      rr(g, w*0.125, ty + h*0.006, w*0.75, th*0.62, th*0.31); g.fill();
      g.globalAlpha = .55; g.fillStyle = lamp1;
      rr(g, w*0.14, ty + h*0.012, w*0.72, th*0.22, th*0.11); g.fill();
      g.globalAlpha = 1;
    /* the rename missed this one, so STALLION fell past its own branch into
       the `else` and wore MATADOR's chevrons — the second time a stray single
       letter has survived a rename in this file */
    } else if(kind === 'STALLION'){
      /* four rings, and a dark band linking them */
      g.fillStyle = 'rgba(18,14,16,.72)';
      rr(g, w*0.30, ty + th*0.22, w*0.40, th*0.42, 2); g.fill();
      for(const cx0 of [w*0.145, w*0.275, w*0.725, w*0.855]){
        g.fillStyle = 'rgba(16,12,14,.9)';
        g.beginPath(); g.arc(cx0, ty + th*0.45, th*0.62, 0, 6.2832); g.fill();
        g.strokeStyle = lamp0; g.lineWidth = Math.max(1, th*0.30);
        g.beginPath(); g.arc(cx0, ty + th*0.45, th*0.40, 0, 6.2832); g.stroke();
        g.strokeStyle = lamp1; g.lineWidth = Math.max(0.6, th*0.13);
        g.beginPath(); g.arc(cx0, ty + th*0.45, th*0.40, 0, 6.2832); g.stroke();
      }
    } else {
      /* angular blades that sweep out and down at the tips */
      for(const sideL of [0,1]){
        const x0 = sideL ? w*0.54 : w*0.10, dir = sideL ? 1 : -1;
        g.fillStyle = 'rgba(18,14,16,.8)';
        rr(g, x0, ty, w*0.36, th*0.95, 2); g.fill();
        g.strokeStyle = lamp0; g.lineWidth = Math.max(1.2, th*0.34);
        g.lineCap = 'round'; g.lineJoin = 'round';
        /* ---- THREE chevrons a side ------------------------------------
           One big arrow read as a single graphic. Three nested, each smaller
           and further out, reads as a LAMP CLUSTER — and it echoes the triple
           blades on its own front intakes. */
        const ax = sideL ? x0 + w*0.02 : x0 + w*0.34;
        for(let k=0;k<3;k++){
          const inset = k * w*0.058;
          const span  = w*0.115 - k*w*0.014;
          g.strokeStyle = lamp0;
          g.lineWidth = Math.max(1.1, th*0.30 - k*th*0.045);
          g.beginPath();
          g.moveTo(ax + dir*inset, ty + th*0.20);
          g.lineTo(ax + dir*(inset + span), ty + th*0.46);
          g.lineTo(ax + dir*inset, ty + th*0.74);
          g.stroke();
          g.strokeStyle = lamp1;
          g.lineWidth = Math.max(0.5, th*0.12 - k*th*0.018);
          g.stroke();
        }
      }
    }

    /* The marque, small, high on the panel. CREST wears a full-width light
       bar rather than separate lamps, so its badge sits ABOVE the bar on the
       engine lid — the others have a panel between their lamps to sit on. */
    if(B && B.rear){
      const badgeY = B.rear === 'CREST' ? ty - h*0.085 : ty - h*0.045;
      drawMarque(g, B.rear, w*0.5, badgeY, h*0.030);
    }

    /* ---- diffuser and pipes ---------------------------------------------- */
    const dy = cy - h*0.085, dh = h*0.075;
    g.fillStyle = 'rgba(10,10,12,.92)';
    rr(g, w*0.10, dy, w*0.80, dh, w*0.02); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
    const fins = kind === 'MATADOR' ? 7 : 5;
    for(let i2=1;i2<fins;i2++){
      const fx = w*0.10 + (w*0.80)*(i2/fins);
      g.beginPath(); g.moveTo(fx, dy+1); g.lineTo(fx, dy+dh-1); g.stroke();
    }
    /* the pipes sit where each car puts them */
    g.fillStyle = '#1a1c20';
    if(kind === 'STALLION'){
      for(const px of [w*0.40, w*0.60]){
        g.beginPath(); g.arc(px, cy - h*0.145, h*0.026, 0, 6.2832); g.fill();
        g.strokeStyle = 'rgba(200,206,216,.55)'; g.lineWidth = 1;
        g.beginPath(); g.arc(px, cy - h*0.145, h*0.026, 0, 6.2832); g.stroke();
      }
    } else if(kind === 'MATADOR'){
      for(const px of [w*0.435, w*0.565]){
        rr(g, px - w*0.045, cy - h*0.215, w*0.09, h*0.045, 2); g.fill();
        g.strokeStyle = 'rgba(196,170,110,.6)'; g.lineWidth = 1; g.stroke();
      }
    } else {
      rr(g, w*0.45, cy - h*0.135, w*0.10, h*0.036, h*0.018); g.fill();
      g.strokeStyle = 'rgba(200,206,216,.5)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(w*0.50, cy-h*0.135); g.lineTo(w*0.50, cy-h*0.099); g.stroke();
    }

    // bumper + plate
    g.fillStyle='rgba(0,0,0,.42)';
    rr(g, w*0.055, cy-h*0.155, w*0.89, h*0.12, w*0.04); g.fill();
    g.fillStyle='rgba(240,235,220,.8)';
    g.fillRect(w*0.42, cy-h*0.125, w*0.16, h*0.055);
    // police livery + light bar
    if(o.police){
      g.fillStyle='#0c0f16';
      g.fillRect(w*0.055, h*o.bodyTop+h*0.02, w*0.89, h*0.10);
      g.fillStyle='#0c0f16';
      rr(g, w*0.30, h*o.cabinTop-h*0.075, w*0.40, h*0.075, 2); g.fill();
    }
  };
}

let SP = {};

/* Paint schemes for the coupe. Each is body, highlight and shadow, so the
   panel shading survives the colour change rather than going flat. */
/* Twelve paints — one for every car on a race grid, and a real choice for the
   player rather than six. Spread right round the wheel so no two rivals read as
   the same car at distance. */
const PAINT = {
  WHITE:  { body:'#dfe6ef', hi:'#ffffff', lo:'#8d9bb0' },
  RED:    { body:'#c8203a', hi:'#ff6472', lo:'#6d0f20' },
  BLACK:  { body:'#23262e', hi:'#4d5462', lo:'#0d0f14' },
  GOLD:   { body:'#d8a13c', hi:'#ffdf94', lo:'#7d5511' },
  CYAN:   { body:'#2fb8c8', hi:'#8ef0f8', lo:'#146370' },
  VIOLET: { body:'#7d4bd8', hi:'#c6a2ff', lo:'#3d1f74' },
  ORANGE: { body:'#e2661d', hi:'#ffab6b', lo:'#7d3208' },
  LIME:   { body:'#8ac926', hi:'#d3f57a', lo:'#456611' },
  PINK:   { body:'#e8459b', hi:'#ff9ccd', lo:'#7d1a50' },
  NAVY:   { body:'#2a4b9b', hi:'#7d9de8', lo:'#122455' },
  TEAL:   { body:'#149b86', hi:'#6ce8d2', lo:'#0a4f45' },
  SILVER: { body:'#9aa3ae', hi:'#e2e8f0', lo:'#4b535e' }
};
/* ---- IRIDESCENT ---------------------------------------------------------
   Won by taking gold in the SPORTS tournament. Five paints that shift between
   two hues rather than sitting on one — the highlight is a different colour
   from the body, which is what makes a flip-paint read as flip.
   ------------------------------------------------------------------------ */
const IRIDESCENT = {
  ORACLE:  { body:'#7a4fd6', hi:'#4fd6c4', lo:'#3a1f6e' },
  PRISM:   { body:'#d64f9e', hi:'#f0c04a', lo:'#6e1f4a' },
  ABALONE: { body:'#3f8fd6', hi:'#b56ff0', lo:'#1d3f6e' },
  SCARAB:  { body:'#3fb86a', hi:'#d6d24f', lo:'#1a5c33' },
  EMBER:   { body:'#e0632c', hi:'#c44fd6', lo:'#6e2a12' }
};
Object.assign(PAINT, IRIDESCENT);
const IRIDESCENT_KEYS = Object.keys(IRIDESCENT);
const BASE_PAINT_KEYS = Object.keys(PAINT).filter(k => IRIDESCENT_KEYS.indexOf(k) < 0);
const PAINT_KEYS = Object.keys(PAINT);

/* ---- what ordinary cars are painted --------------------------------------
   Deliberately DULL. The supercars own the saturated end of the spectrum, and
   they only read as special if everything around them is the colour real
   traffic actually is: silver, white, grey, black, dark blue, dark red, beige.
   -------------------------------------------------------------------------- */
const TRAFFIC_PAINT = [
  { body:'#b9bec6', hi:'#dde1e7', lo:'#7b8189' },   /* silver     */
  { body:'#d8dade', hi:'#f2f4f7', lo:'#9aa0a8' },   /* white      */
  { body:'#6e747d', hi:'#8f96a0', lo:'#454a52' },   /* grey       */
  { body:'#2f333a', hi:'#4d525b', lo:'#191b20' },   /* near black */
  { body:'#31435e', hi:'#4b6183', lo:'#1c2634' },   /* navy       */
  { body:'#5c2b30', hi:'#7d4046', lo:'#33171b' },   /* maroon     */
  { body:'#7d6a4e', hi:'#9f8a68', lo:'#4a3f2e' },   /* beige      */
  { body:'#33544a', hi:'#4a7264', lo:'#1d322c' },   /* dark green */
  { body:'#4a4550', hi:'#665f6e', lo:'#2a2730' },   /* graphite   */
  { body:'#8a6a55', hi:'#ac8a72', lo:'#503d31' }    /* tan        */
];
function trafficPaint(seed){
  const c = TRAFFIC_PAINT[Math.abs(seed|0) % TRAFFIC_PAINT.length];
  return { body:c.body, hi:c.hi, lo:c.lo, lamp:'#c8102e' };
}
let optWeather = 'mixed';
let optPaint = 'WHITE', optEasy = true, optMirror = 'FULL';   /* no cops unless HOT PURSUIT is on */
/* the cars a RIVAL may be given: the three you start with, and nothing else.
   An unlock you had to win a tournament for should not be sitting on the grid
   opposite you. */
/* ---- CLASSES --------------------------------------------------------------
   A race is run in the class of the car YOU chose. Take a sports car and the
   grid is sports cars; take a supercar and it is supercars. That is what makes
   the sports league a league rather than a handicap.
   -------------------------------------------------------------------------- */
const SPORTS_BODIES = ['ROADSTER','TUNER','MUSCLE'];
const SUPER_BODIES  = ['STALLION','MATADOR','CREST'];
function classOf(k){ return SPORTS_BODIES.indexOf(k) >= 0 ? 'sports' : 'super'; }
function rivalBodies(){
  return classOf(optBody) === 'sports' ? SPORTS_BODIES : SUPER_BODIES;
}
/* kept for the sprite pre-build, which needs every body a rival might use */
const RIVAL_BODIES = SPORTS_BODIES.concat(SUPER_BODIES);
const RIVAL_SP = {};
let TRAFFIC_SP = {}, FRONT_SP = {};
function buildSprites(){
  const shape = BODY[optBody] || BODY['MATADOR'];
  /* a `rig` body is a road car and uses the traffic painter, at that shape's
     own sprite size; everything else is a supercar and uses paintCar */
  const pt = PAINT[optPaint] || PAINT.WHITE;
  if(shape.rig){
    /* ---- EVERY SHAPE HAS ITS OWN BOX ------------------------------------
       This read `muscle ? [210,158] : [206,150]`, so a VAN, a PICKUP and a
       LORRY were all drawn into a coupe's sprite — the lorry squashed to two
       thirds of its height, which is why it came out a different size from the
       one on the road. The traffic tables have always had these numbers; the
       player build was the only place that did not use them.
       ------------------------------------------------------------------- */
    const rz = shape.rig === 'muscle' ? [210,158]
             : shape.rig === 'cop'    ? [200,164]
             : shape.rig === 'van'    ? [200,196]
             : shape.rig === 'pickup' ? [206,176]
             : shape.rig === 'truck'  ? [230,250]
             : shape.rig === 'sedan' || shape.rig === 'taxi' ? [200,164]
             : [206,150];
    /* ---- THE COLOUR IS THE CAB'S, NOT THE TRAILER'S ---------------------
       A lorry's trailer is the plain beige panel it always is. Painting the
       player's lorry in the chosen colour painted the BOX, which is the one
       part of it that never changes. The cab takes the colour instead. */
    const rigPaint = (shape.rig === 'truck')
      ? Object.assign({}, pt, { body:'#8a8477', hi:'#a8a293', lo:'#4e4a41',
                                cab: { body:pt.body, hi:pt.hi, lo:pt.lo } })
      : pt;
    SP.player = sprite(rz[0], rz[1],
      paintRig(shape.rig, Object.assign({ lamp:'#d61b3c', lamp2:'#ff7a86',
                                          player:true, marque:shape.rear,
                                          stripes:optStripes && stripesAllowed() }, rigPaint)));
  } else {
    SP.player = sprite(220,168, paintCar(Object.assign({
      cabin:true, spoiler:true, shape, bodyKey:optBody, force:!!shape.force,
      bodyTop:shape.bodyTop, cabinTop:shape.cabinTop,
      stripes:optStripes && stripesAllowed(),
      lamp:'#d61b3c', lamp2:'#ff7a86'
    }, pt)));
  }
  /* Every rival is the SAME sports car as yours, in a different paint. They
     used to be a tinted saloon, which is why the grid never looked like a
     field of equals. Built once per colour and cached. */
  /* one sprite per body AND paint, so a rival's shape and colour are both its
     own — keyed 'MATADOR|CYAN' and cached, which is 36 small canvases */
  /* and the cache only needs the bodies a rival can actually be given */
  for(const bk of RIVAL_BODIES){
    const rs = BODY[bk];
    for(const k of PAINT_KEYS){
      /* ---- A SPORTS CAR IS NOT A SUPERCAR SHAPE ------------------------
         This built every rival through `paintCar`, which wants `bodyTop` and
         `cabinTop`. That was safe while rivals were only supercars. Now that
         a sports grid is possible, ROADSTER, TUNER and MUSCLE come through
         here — and they are `rig` bodies with no such fields, so the gradient
         got NaN and the whole game failed to boot.

         A rig body goes through `paintRig`, the same painter its NPC version
         uses. */
      RIVAL_SP[bk+'|'+k] = rs.rig
        ? sprite(220,168, paintRig(rs.rig, Object.assign({
            player:true, marque:rs.rear,
            lamp:'#d61b3c', lamp2:'#ff7a86'
          }, PAINT[k])))
        : sprite(220,168, paintCar(Object.assign({
            cabin:true, spoiler:true, shape:rs, bodyKey:bk,
            bodyTop:rs.bodyTop, cabinTop:rs.cabinTop,
            lamp:'#d61b3c', lamp2:'#ff7a86'
          }, PAINT[k])));
    }
  }
  /* A pickup: tall cab, open bed, and it sits high on its springs. */
  SP.pickup = sprite(206,176, paintRig('pickup', { body:'#6b5540', hi:'#8d735a', lo:'#3e3125', lamp:'#c8102e' }));
  /* A van: one tall slab, glass right at the top. */
  SP.van = sprite(200,196, paintRig('van', { body:'#c9cdd4', hi:'#e8ecf2', lo:'#8b9099', lamp:'#c8102e' }));
  SP.sedan = sprite(200,164, paintRig('sedan', { body:'#3c4a63', hi:'#5b6d8c', lo:'#212a3b', lamp:'#c8102e' }));
  SP.sedan2 = sprite(200,164, paintRig('sedan', { body:'#6b3346', hi:'#8f4a5f', lo:'#3d1c28', lamp:'#d2313f' }));
  SP.coupe = sprite(206,150, paintRig('coupe', { body:'#2f6b5e', hi:'#469084', lo:'#193b34', lamp:'#c8102e' }));
  SP.truck = sprite(230,250, paintRig('truck', { body:'#8a8477', hi:'#a8a293', lo:'#4e4a41', lamp:'#b8371f', lamp2:'#ffb066' }));
  SP.cop = sprite(206,168, paintRig('cop', { body:'#eceff4', hi:'#ffffff', lo:'#9aa3b0', lamp:'#c8102e' }));
  /* ---- THE SUPER CRUISER ------------------------------------------------
     A MATADOR in force colours. Built through `paintCar` with the same shape
     record a driveable MATADOR uses, so it is unmistakably the same car — and
     given the CRUISER's marque, because it is one of theirs.

     My first attempt hand-assembled the options object and left out fields
     `paintCar` needs; it threw a non-finite gradient and took the whole game
     down with it. Copying the shape record wholesale is both shorter and
     correct. */
  {
    /* built from its OWN record now that it has one, so its stats and its
       picture can never drift apart */
    const SC = BODY['SUPERCRUISER'];
    SP.superCop = sprite(220,168, paintCar(Object.assign({}, SC, {
      body:'#eceff4', hi:'#ffffff', lo:'#9aa3b0',
      lamp:'#d61b3c', lamp2:'#ff7a86',
      cabin:true, spoiler:true, shape:SC,
      bodyKey:'SUPERCRUISER', marque:'CRUISER', stripes:false, force:true
    })));
  }
  /* ---- one sprite per body type PER COLOUR -----------------------------
     Ten paints across five civilian shapes is fifty small canvases, built once
     at boot. Cheap, and it turns a road of identical grey saloons into
     traffic. */
  TRAFFIC_SP = {};
  for(const kind of ['sedan','sedan2','coupe','tuner','muscle','pickup','van']){
    const rig = kind === 'sedan2' ? 'sedan' : kind;
    const size = kind === 'van'    ? [200,196]
               : kind === 'pickup' ? [206,176]
               : kind === 'coupe' || kind === 'tuner' ? [206,150]
               : kind === 'muscle' ? [210,158] : [200,164];
    TRAFFIC_SP[kind] = TRAFFIC_PAINT.map((c,i2) =>
      sprite(size[0], size[1], paintRig(rig, trafficPaint(i2))));
  }
  /* ---- AND THEIR FRONTS -------------------------------------------------
     The mirror shows oncoming cars, so it needs the noses. Same paints, same
     shapes, one sprite each — cached at build time like the rears rather than
     painted per frame. */
  FRONT_SP = {};
  for(const kind of ['sedan','sedan2','coupe','tuner','muscle','pickup','van']){
    const rig = kind === 'sedan2' ? 'sedan' : kind;
    const size = kind === 'van'    ? [200,196]
               : kind === 'pickup' ? [206,176]
               : kind === 'coupe' || kind === 'tuner' ? [206,150]
               : kind === 'muscle' ? [210,158] : [200,164];
    FRONT_SP[kind] = TRAFFIC_PAINT.map((c,i2) =>
      sprite(size[0], size[1], paintRigFront(rig, trafficPaint(i2))));
  }

  /* the taxi has ONE colour, because a cab is yellow */
  const CAB = { body:'#f2b32c', hi:'#ffd45e', lo:'#8f6408', lamp:'#c8102e' };
  TRAFFIC_SP.taxi = [ sprite(200,164, paintRig('taxi', CAB)) ];
  FRONT_SP.taxi   = [ sprite(200,164, paintRigFront('taxi', CAB)) ];

  /* ---- A TRACTOR UNIT AND A TRAILER ARE TWO THINGS ----------------------
     The four liveries were painting the WHOLE vehicle, so a blue lorry had a
     blue box behind it. A haulier's trailer is the plain panel it always is —
     beige — and the cab pulling it is whatever colour that operator painted it.

     `TRAILER` is fixed; the cab takes an ordinary traffic paint, so a lorry on
     the road can be any colour from the front and is always the same from
     behind.
     -------------------------------------------------------------------- */
  const TRAILER = { body:'#8a8477', hi:'#a8a293', lo:'#4e4a41' };
  TRAFFIC_SP.truck = TRAFFIC_PAINT.map((c,i2) => {
    const cab = trafficPaint(i2);
    return sprite(230,250, paintRig('truck',
      { body:TRAILER.body, hi:TRAILER.hi, lo:TRAILER.lo,
        cab:cab, lamp:'#b8371f', lamp2:'#ffb066' }));
  });
  FRONT_SP.truck = TRAFFIC_PAINT.map((c,i2) => {
    const cab = trafficPaint(i2);
    /* the FRONT is all cab, so it is painted in the cab's colour outright */
    return sprite(230,250, paintRigFront('truck',
      { body:cab.body, hi:cab.hi, lo:cab.lo, lamp:'#b8371f', lamp2:'#ffb066' }));
  });

  SP.repair = sprite(150,120, (g,w,h)=>{
    g.fillStyle='rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(w/2,h-6,w*0.42,h*0.07,0,0,6.2832); g.fill();
    g.fillStyle='#d8dee7';
    rr(g, w*0.10, h*0.34, w*0.80, h*0.52, 5); g.fill();
    g.fillStyle='#38424f'; g.fillRect(w*0.10, h*0.56, w*0.80, h*0.07);
    g.fillStyle='#9aa5b3'; rr(g, w*0.36, h*0.22, w*0.28, h*0.14, 4); g.fill();
    g.fillStyle='#3ddc84';
    g.fillRect(w*0.44, h*0.40, w*0.12, h*0.34);
    g.fillRect(w*0.33, h*0.51, w*0.34, h*0.12);
  });
  SP.barrier = sprite(200,120, (g,w,h)=>{
    g.fillStyle='rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(w/2,h-5,w*0.46,h*0.07,0,0,6.2832); g.fill();
    g.fillStyle='#2a2b31'; g.fillRect(w*0.12,h*0.72,w*0.06,h*0.24);
    g.fillRect(w*0.82,h*0.72,w*0.06,h*0.24);
    for(let i=0;i<8;i++){
      g.fillStyle = i%2 ? '#f2f0e6' : '#e2452f';
      g.save(); g.beginPath(); g.rect(w*0.06+i*w*0.11, h*0.30, w*0.11, h*0.42); g.clip();
      g.fillRect(w*0.02+i*w*0.11, h*0.30, w*0.16, h*0.42); g.restore();
    }
    g.strokeStyle='rgba(0,0,0,.35)'; g.lineWidth=2;
    g.strokeRect(w*0.06,h*0.30,w*0.88,h*0.42);
  });
}

/* ---------- skyline ---------- */
let skyline = null;
/* Two layers: the buildings, and the windows on their own sheet. The windows
   are drawn over the top with an alpha that follows the clock, so the city
   lights up at dusk and goes dark by mid-morning — which is the whole reason
   to have a cycle rather than a fade. */
let skylineLit = null;
function buildSkyline(){
  /* ---- THE HORIZON BELONGS TO THE BIOME --------------------------------
     Biomes changed the ground and the weather and left the skyline alone, so
     a DESERT still showed a city of lit towers. What stands on the horizon is
     the strongest single signal of where you are, and it was the one thing
     that never changed.

     The same plan structure carries all of them — a silhouette is a silhouette
     — so only the SHAPE generator differs. Lit windows are a city idea and are
     suppressed everywhere else.
     ------------------------------------------------------------------- */
  const w = 1024, h = 220;
  const B = bio();
  const plan = [];
  let x = 0;
  while(x < w){
    let bw, bh, wins = [], kind = 'tower';

    if(B.name === 'DESERT'){
      /* mesas and buttes: wide, flat-topped, far apart */
      kind = 'mesa';
      bw = rint(70, 190); bh = rint(24, 74);
      x += rint(10, 70);
    } else if(B.name === 'MOUNTAIN' || B.name === 'TUNDRA'){
      /* peaks: tall triangles, overlapping, snow-capped in tundra */
      kind = 'peak';
      bw = rint(90, 240); bh = rint(70, 200);
      x -= rint(20, 70);
    } else if(B.name === 'FOREST'){
      /* a treeline: many narrow conifers of similar height */
      kind = 'tree';
      bw = rint(12, 30); bh = rint(38, 96);
      x -= rint(2, 9);
    } else {
      bw = rint(18,54); bh = rint(30,180);
      for(let k=0;k<bh/16;k++){
        if(Math.random() < 0.42)
          wins.push([x + rint(3, bw-6), h - bh + rint(4, bh-8)]);
      }
    }
    plan.push({ x, bw, bh, wins, kind });
    x += bw + (kind === 'tower' ? rint(2,12) : rint(1,6));
  }
  skyline = sprite(w,h,(g)=>{
    g.clearRect(0,0,w,h);
    for(const b of plan){
      g.fillStyle = '#150c22';
      if(b.kind === 'peak'){
        g.beginPath();
        g.moveTo(b.x, h);
        g.lineTo(b.x + b.bw*0.5, h - b.bh);
        g.lineTo(b.x + b.bw, h);
        g.closePath(); g.fill();
      } else if(b.kind === 'tree'){
        g.beginPath();
        g.moveTo(b.x, h);
        g.lineTo(b.x + b.bw*0.5, h - b.bh);
        g.lineTo(b.x + b.bw, h);
        g.closePath(); g.fill();
        g.fillRect(b.x + b.bw*0.42, h - b.bh*0.12, b.bw*0.16, b.bh*0.12);
      } else if(b.kind === 'mesa'){
        /* flat on top, sloped at the shoulders */
        g.beginPath();
        g.moveTo(b.x, h);
        g.lineTo(b.x + b.bw*0.14, h - b.bh);
        g.lineTo(b.x + b.bw*0.86, h - b.bh);
        g.lineTo(b.x + b.bw, h);
        g.closePath(); g.fill();
      } else {
        g.fillRect(b.x, h-b.bh, b.bw, b.bh);
      }
    }
  });
  skylineLit = sprite(w,h,(g)=>{
    g.clearRect(0,0,w,h);
    for(const b of plan){
      for(const [wx,wy] of b.wins){
        g.fillStyle = Math.random() < 0.22 ? 'rgba(190,225,255,.95)' : 'rgba(255,190,110,.95)';
        g.fillRect(wx, wy, 2, 3);
      }
    }
  });
}

/* ---------- world spawning ---------- */
function laneFree(z, lane, gap){
  for(const c of traffic)
    if(c.lane===lane && Math.abs(c.z - z) < gap) return false;
  return true;
}

/* ---- what a merging driver needs to know ---------------------------------
   Two questions, asked about a LATERAL POSITION rather than a lane index,
   because a lane index is an assignment and the road is a width.
   -------------------------------------------------------------------------- */
function nearestLane(x){
  let best = 0, bd = 1e9;
  for(let i = 0; i < LANE_X.length; i++){
    const d = Math.abs(LANE_X[i] - x);
    if(d < bd){ bd = d; best = i; }
  }
  return best;
}

/* Is there a hole at `tx`, and will it still be one when we arrive? The window
   is asymmetric on purpose: a long way forward, because we are moving into
   somebody's braking distance, and less behind, because a car back there can
   lift. It also checks the PLAYER, who is a car like any other - traffic that
   merges through you is worse than traffic that never merges at all. */
function laneClear(c, tx){
  const needF = 2600, needB = 1500;
  for(const o of traffic){
    if(o === c) continue;
    if(Math.abs(o.x - tx) > (o.w + c.w)/2 + 0.05) continue;
    const dz = o.z - c.z;
    if(dz > -needB && dz < needF) return false;
    /* closing fast from behind counts as occupied even when it is not yet */
    if(dz <= -needB && dz > -6000 && o.spd > c.spd + 900) return false;
  }
  const pdz = (pos + PLAYER_Z) - c.z;
  if(Math.abs(playerX - tx) < (0.26 + c.w)/2 + 0.05 && pdz > -needB && pdz < needF) return false;
  return true;
}

/* ---- WOULD MOVING THERE CLOSE THE ROAD? ----------------------------------
   The merge logic and the keep-a-lane-open guarantee pull against each other,
   and the first version of merging won: adding lane changes took the narrowest
   corridor from 0.452 down to 0.245, under the limit. A car had found a hole,
   moved into it, and the hole was the way through.

   `keepLaneOpen` would eventually re-open it, but "eventually" is not what an
   absolute guarantee means, and undoing a merge a second after making it is
   exactly the weaving this design set out to avoid. So the check happens
   BEFORE the decision: a car does not take the last gap.
   -------------------------------------------------------------------------- */
function wouldBlock(c, tx){
  const near = [];
  for(const o of traffic){
    if(o === c) continue;
    if(Math.abs(o.z - c.z) > 1600) continue;
    near.push(o);
  }
  if(!near.length) return false;
  near.push({ x: tx, w: c.w });                 /* us, where we want to be */
  return widestGap(near) < 0.40;                /* a margin over the 0.34 limit */
}

/* How fast this stretch of road is at `tx` - the speed of the slowest thing
   ahead in it, or our own cruise if it is empty. This is what stops a car
   pulling out to sit beside the one it was already following. */
function laneSpeed(c, tx){
  let v = c.cruise;
  for(const o of traffic){
    if(o === c) continue;
    if(Math.abs(o.x - tx) > (o.w + c.w)/2 + 0.05) continue;
    const dz = o.z - c.z;
    if(dz <= 0 || dz > 6000) continue;
    v = Math.min(v, o.spd);
  }
  const pdz = (pos + PLAYER_Z) - c.z;
  if(Math.abs(playerX - tx) < (0.26 + c.w)/2 + 0.05 && pdz > 0 && pdz < 6000) v = Math.min(v, spd);
  return v;
}

/* A wave never fills every lane, but cars run at different speeds, so given
   enough road a fast one drifts into the last free lane and the wall closes.
   This keeps a line open without deleting anything or slowing the road down:
   the car furthest from you in a blocked stretch eases off, and leans toward
   the verge, until a car-width corridor exists again. You still have to find
   the gap; there is simply always one.

   ---- IT WAS ASKING THE WRONG QUESTION, IN THE WRONG PLACES ---------------
   The first version counted distinct LANE INDICES inside buckets keyed by
   `Math.round(z / 1500)`. Both halves let a wall through.

   Counting lane indices is not the same as measuring the road. Cars drift
   inside their lane, and a shunt moves one bodily sideways while its `lane`
   field still says where it was assigned - so four cars could report four
   different lanes and still leave no opening a car could fit through. What
   blocks a road is OCCUPIED WIDTH, so that is what is measured now: the
   widest free corridor between the occupied intervals, in lane units.

   And a fixed bucket splits a wall that straddles its boundary. Cars at 1,499
   and 1,501 land in different buckets, each of which then looks passable on
   its own, and the wall between them was never examined by either. The sweep
   is a SLIDING window now, stepped at half its own width, so every stretch of
   road is looked at whole by at least one window.
   ------------------------------------------------------------------------ */
let blockedAhead = 0;               /* windows with no way through, last pass */
let mergesMade = 0;                 /* lane changes traffic has decided on, this run */
/* ---- THE TIGHTEST THE ROAD GOT, not just whether it closed -----------------
   A boolean "was it ever blocked" cannot tell a working guarantee from a road
   that never crowds in the first place - and the first version of the traffic
   test proved exactly that by passing with the fixer switched off. The
   narrowest corridor seen is the measurement that discriminates: with the
   guarantee working it should sit near the threshold and never under it, and
   with the guarantee off it should go under.
   -------------------------------------------------------------------------- */
let tightestAhead = 9;

/* the widest gap between cars, in lane units, across the usable road */
function widestGap(list){
  const iv = [];
  for(const c of list){
    const half = ((c.w || 0.30) / 2) + 0.03;      /* a little air on each side */
    iv.push([c.x - half, c.x + half]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  const L = -1.0, R = 1.0;                         /* the drivable road */
  let best = 0, cursor = L;
  for(const [a, b] of iv){
    if(a > cursor) best = Math.max(best, a - cursor);
    if(b > cursor) cursor = b;
  }
  return Math.max(best, R - cursor);
}

function keepLaneOpen(dt, pz){
  const WIN = 1600, STEP = WIN / 2;                /* overlapping, so no seam */
  const NEED = 0.34;                               /* the player is 0.26 wide */
  /* ---- IT HAS TO ACT BEFORE THE ROAD CLOSES, NOT WHEN IT HAS -------------
     Correcting only once the corridor is already under a car width is too
     late: opening a gap takes a second or two of a car easing off and moving
     over, and the player covers a lot of road in that time. Measured, the
     bang-bang version let the corridor reach 0.306 - under the limit - before
     it did anything.

     So the response starts at WARN and scales with how close the corridor is
     to NEED. At the top of the band it is a nudge nobody notices; at the
     bottom it is a car getting out of the way with intent. The road then never
     arrives at the limit, which is the only way an absolute guarantee can hold.
     ---------------------------------------------------------------------- */
  const WARN = 0.62;
  const ahead = traffic.filter(c => c.z > pz - 2000 && c.z < pz + 26000);
  blockedAhead = 0;
  tightestAhead = 9;
  for(let z = pz; z < pz + 26000; z += STEP){
    const group = ahead.filter(c => c.z >= z && c.z < z + WIN);
    if(group.length < 2) continue;
    const gap = widestGap(group);
    if(gap < tightestAhead) tightestAhead = gap;
    if(gap < NEED) blockedAhead++;                  /* the contract, for the record */
    if(gap >= WARN) continue;                       // plenty of room
    /* 0 at the warning line, 1 at the limit - how hard to open it */
    const urge = clamp((WARN - gap) / (WARN - NEED), 0, 1);

    /* the car furthest from you gives way - it has the most room to do it in
       and you are least likely to be watching it */
    let worst = null, wd = -1;
    for(const c of group){
      const d = c.z - pz;
      if(d > wd){ wd = d; worst = c; }
    }
    if(worst){
      worst.cruise = Math.max(0.24 * MAX_SPD,
                             worst.cruise - MAX_SPD * (0.20 + 0.70*urge) * dt);
      worst.yielding = true;
      /* AND IT MOVES OVER. Slowing alone only opens the wall once the car has
         fallen out of the window, which at a small speed difference is a long
         way down the road - long enough for the player to arrive first. Leaning
         it toward the nearer verge opens a corridor in the same second. */
      const side = worst.x >= 0 ? 1 : -1;
      worst.x = clamp(worst.x + side * (0.25 + 0.85*urge) * dt, -0.92, 0.92);
      /* Its lane is a lie once it has been moved bodily, and the drift logic
         would otherwise haul it straight back into the wall it just left. So
         the lane is REASSIGNED to whichever one it is now nearest, rather than
         cleared: `laneFree` matches on the lane index when deciding where to
         spawn, and a car carrying -1 matches nothing - which would let a new
         car drop straight on top of the one that just moved over. */
      worst.drift = Math.abs(worst.drift || 0) * side;
      let bestLane = worst.lane, bd = 1e9;
      for(let li = 0; li < LANE_X.length; li++){
        const d2 = Math.abs(LANE_X[li] - worst.x);
        if(d2 < bd){ bd = d2; bestLane = li; }
      }
      worst.lane = bestLane;
    }
  }
}

/* Traffic overtaking from behind. Ahead-only spawning meant a slow or stopped
   car sat on an empty road: everything in front pulled away and nothing ever
   arrived. This drops a car back down the road doing a decent clip, so it
   catches you and goes past — which is what makes stopping feel exposed. */
function spawnBehind(){
  /* It was giving up after ONE blocked lane, and at a standstill the lane
     behind you is usually the one you are sitting in — so nothing ever
     arrived, which is exactly the case this exists for. Try every lane. */
  const order = [0,1,2,3].sort(()=>Math.random()-0.5);
  let lane = -1, z = 0;
  for(const L of order){
    const zz = pos - rnd(2600, 4200);
    if(laneFree(zz, L, 1500)){ lane = L; z = zz; break; }
  }
  if(lane < 0) return;
  const roll = Math.random();
  /* the tuner takes a slice out of the coupe's share — it IS a coupe, so the
     road does not get more sports cars, just a more varied set of them */
  const t = roll<0.10 ? 'truck'  : roll<0.24 ? 'van'
          : roll<0.40 ? 'pickup' : roll<0.52 ? 'coupe'
          : roll<0.58 ? 'tuner'  : roll<0.66 ? 'muscle'
          : roll<0.72 ? 'taxi'
          : roll<0.86 ? 'sedan'  : 'sedan2';
  traffic.push({
    z, lane, x: LANE_X[lane] + rnd(-0.03,0.03),
    /* it must actually be quicker than you or it will never arrive */
    /* a car coming up BEHIND has to be quicker than you or it never arrives,
       but 1.25x your speed at 190 is 237mph. Capped to something a road car
       could actually do. */
    spd: 0, cruise: Math.min(0.46 * MAX_SPD,
                             Math.max(spd * 1.12, (t==='truck' ? 0.24 : 0.34) * MAX_SPD)),
    type: t,
    w: t==='truck' ? 0.32 : t==='van' ? 0.30 : t==='pickup' ? 0.29
     : (t==='coupe'||t==='tuner') ? 0.26 : t==='muscle' ? 0.285 : 0.275,
    len: t==='truck' ? 520 : t==='van' ? 440 : t==='pickup' ? 420 : 380,
    near:false, drift: rnd(-1,1)*0.0002, fromBehind:true, paintN: (Math.random()*10)|0
  });
}

/* ---- THERE IS ALWAYS A WAY THROUGH --------------------------------------
   Each wave left one lane free, but a DIFFERENT one each time — and at 900
   units apart the free lanes never lined up, so the road became a solid wall
   with a gap that moved sideways faster than any car could. On a clock that
   is not difficulty, it is a dead end.

   `openLane` persists for a run of waves and then drifts by ONE lane, so there
   is a continuous thread through the traffic that a driver can actually
   follow, and changing lanes is a choice rather than a scramble.
   -------------------------------------------------------------------------- */
let openLane = 1, openFor = 0;
function spawnWave(z){
  if(--openFor <= 0){
    openLane = clamp(openLane + (Math.random() < 0.5 ? -1 : 1), 0, LANES-1);
    openFor = rint(3, 6);
  }
  /* at most half the remaining lanes, so it never closes up */
  const n = rint(1, Math.max(1, Math.floor((LANES-1)/2) + 1));
  const order = [0,1,2,3].filter(L => L !== openLane)
                         .sort(()=>Math.random()-0.5).slice(0,n);
  for(const lane of order){
    if(!laneFree(z, lane, 3400)) continue;
    // keep a roadblock's opening clear so it is always threadable
    let inGap = false;
    for(const b of blocks)
      if(Math.abs(LANE_X[lane] - b.gapX) < 0.34 && Math.abs(z - b.z) < 9000) inGap = true;
    if(inGap) continue;
    /* a real mix of what is on a motorway, not three saloons and a lorry */
    const roll = Math.random();
    /* the MAIN spawner — the other table is only for cars coming up behind
       you, and a type added to one and not the other appears in half the
       traffic and nowhere else */
    const t = roll<0.12 ? 'truck'  : roll<0.26 ? 'van'
            : roll<0.42 ? 'pickup' : roll<0.53 ? 'coupe'
            : roll<0.59 ? 'tuner'  : roll<0.67 ? 'muscle'
            : roll<0.73 ? 'taxi'
            : roll<0.86 ? 'sedan'  : 'sedan2';
    const rogue = (t === 'tuner' || t === 'muscle') && Math.random() < 0.20;
    traffic.push({
      z: z + rnd(-600,600), lane,
      x: LANE_X[lane] + rnd(-0.03,0.03),
      /* ---- TRAFFIC IS TRAFFIC, NOT A FIELD -----------------------------
         0.42-0.60 of MAX_SPD is 84-120mph. That was survivable when the
         player did 0-60 in a second; after the acceleration retune it means
         EVERY car on the road overtakes you, and a striped muscle car going
         past at 94 looks exactly like a rival. Motorway speeds instead:
         52-84mph for cars, 44-56 for lorries. */
      /* ---- ROGUES ----------------------------------------------------
         One in five tuners or muscle cars is not commuting. They cruise at
         100-124mph, well over the rest of the traffic, so every so often one
         comes through the pack and goes past you — which is what you thought
         you were seeing before, and it is better as a deliberate thing than
         as a symptom.

         They are still TRAFFIC: no points, no placings, they queue at
         roadblocks and they get out of the way of a siren like anyone else.
         The only difference is the number. */
      spd: 0, cruise: rogue ? rnd(0.50, 0.62) * MAX_SPD
                            : (t==='truck' ? rnd(0.22,0.28) : rnd(0.26,0.42)) * MAX_SPD,
      rogue: rogue,
      type: t,
      w: t==='truck' ? 0.32 : t==='van' ? 0.30 : t==='pickup' ? 0.29
       : (t==='coupe'||t==='tuner') ? 0.26 : t==='muscle' ? 0.285 : 0.275,
      len: t==='truck' ? 520 : t==='van' ? 440 : t==='pickup' ? 420 : 380,
      near: false, drift: rnd(-1,1)*0.0002, paintN: (Math.random()*10)|0
    });
    traffic[traffic.length-1].spd = traffic[traffic.length-1].cruise;
  }
}

/* ===========================================================================
   SPEED TRAPS AND SUPER CRUISERS

   Heat used to summon cops out of nowhere. Now there are two kinds and both
   have a reason to be there:

   A TRAP is a cruiser parked on the verge with its engine off. Anything that
   passes it above the limit sets it moving — you, a rogue tuner, a rival. It
   does not care who you are, only how fast you went past.

   A SUPER CRUISER is what gets sent when a car is genuinely running: sustained
   above 150 with heat already on you. It is a MATADOR in force colours and it
   can stay with a supercar. Heat decides how many. They are never parked at
   the roadside, because a speed trap is for catching ordinary traffic and
   these are not for that.
   =========================================================================== */
const SPEED_LIMIT = 80 / 200;          /* as a fraction of MAX_SPD */

function spawnTrap(){
  /* parked on the verge, engine off, facing the traffic */
  const side = Math.random() < 0.5 ? -1 : 1;
  cops.push({
    /* far enough ahead to be a surprise, near enough that the watch sees it
       before it is culled */
    z: pos + rnd(26000, 52000),
    x: side * 1.16,                    /* on the grass, clear of the road */
    spd: 0, wreck:0, ang:0, grace:0, cool:0, side,
    w:0.27, len:400, phase: Math.random()*6.28,
    trap: true, armed: true
  });
}

/* a trap watches everything that goes past, not just you */
function trapWatch(dt){
  for(const k of cops){
    if(!k.trap || !k.armed || k.wreck > 0) continue;
    /* the player */
    const dz = Math.abs(k.z - (pos + PLAYER_Z));
    /* a wider window: at 200mph the car covers 2,600 units in a tenth of a
       second and the check simply missed it */
    if(dz < 7000 && spd > MAX_SPD * SPEED_LIMIT){
      k.armed = false; k.trap = false; k.grace = 0.35;
      k.spd = spd * 0.55;
      snd.warnCop();
      flashWarn('SPEED TRAP');
      heat = Math.min(5, heat + 1);
      continue;
    }
    /* and anything else on the road — a rogue tuner gets pulled too */
    for(const c of traffic){
      if(!c.rogue) continue;
      if(Math.abs(k.z - c.z) > 2200) continue;
      if((c.spd || c.cruise || 0) > MAX_SPD * SPEED_LIMIT){
        k.armed = false; k.trap = false; k.grace = 0.6;
        k.spd = (c.spd || c.cruise) * 0.6;
        k.tz = c.z; k.tx = c.x; k.onPlayer = false;
        break;
      }
    }
  }
}

/* ---- the super cruiser -------------------------------------------------
   Sent only when you have been genuinely running: above 150 for several
   seconds with heat already on you. */
let fastFor = 0;
function superWatch(dt){
  const fast = spd > MAX_SPD * (150/200);
  fastFor = fast ? fastFor + dt : 0;
  if(!optEasy && heat >= 1 && fastFor > 4){
    const want = Math.min(4, Math.ceil(heat / 1.5));
    const have = cops.filter(k => k.superc && k.wreck <= 0).length;
    if(have < want){
      spawnSuper();
      fastFor = 2.2;                   /* stagger them, do not dump four at once */
    }
  }
}

function spawnSuper(){
  /* `lane` is the PLAYER's lane, a module variable — shadowing it here threw
     every time a super cruiser was due, which is why none ever appeared */
  /* the other spawners use the literal; LANES is not in scope here and
     referencing it threw every time a super cruiser was due */
  const ln = rint(0, 3);
  cops.push({
    z: pos - rnd(9000, 16000),         /* comes up from behind */
    x: LANE_X[ln],
    spd: spd * 1.04 + 1200,
    wreck:0, ang:0, grace:0.8, cool:0, side:1,
    w:0.265, len:390, phase: Math.random()*6.28,
    superc: true
  });
  snd.warnCop();
  flashWarn('INTERCEPTOR');
}

function spawnCop(){
  const z = pos - rnd(3200,4200);
  let lane = rint(0,3), tries = 0;
  while(tries++ < 8 && !laneFree(z, lane, 1800)) lane = rint(0,3);
  cops.push({
    z, x: LANE_X[lane],
    spd: spd*0.95 + 1800,
    wreck:0, ang:0, grace:1.1, cool:0, side:1,
    w:0.27, len:400, phase: Math.random()*6.28
  });
}

function spawnRoadblock(){
  // Panels are tiled across the road with one deliberate opening. Spacing is
  // chosen so no two panels can be squeezed between, and the opening leaves
  // the car GAP_SLACK of room either side of dead centre.
  const SEG  = 0.34;                       // one barrier panel, world units
  const HIT  = (SEG + 0.26)/2;             // centre distance that blocks the car
  const SLACK = 0.15;                      // wiggle room inside the opening
  const gx = clamp(LANE_X[rint(0,3)], -0.58, 0.58);
  const b = { z: pos + 34000, gapX: gx, hit:false, parts:[] };

  for(let x = gx - (HIT + SLACK); x > -1.12; x -= SEG) b.parts.push({ x, w:SEG });
  for(let x = gx + (HIT + SLACK); x <  1.12; x += SEG) b.parts.push({ x, w:SEG });

  // a cruiser parked well clear of the opening, on the far shoulder
  b.parts.push({ x: gx > 0 ? -1.06 : 1.06, w:0, cop:true, off:0 });

  // nothing may be sitting in the opening when the player arrives
  for(let i=traffic.length-1;i>=0;i--){
    const c = traffic[i];
    if(Math.abs(c.x - gx) < 0.34 && c.z > b.z - 9000 && c.z < b.z + 2000) traffic.splice(i,1);
  }

  blocks.push(b);
  flashWarn('ROADBLOCK AHEAD');
}

// widest run of road the car's centre can occupy — used to prove passability
function blockClearance(b){
  let best = 0, run = 0;
  for(let x = -1.0; x <= 1.0; x += 0.01){
    let ok = true;
    for(const p of b.parts){
      if(p.cop) continue;
      if(Math.abs(p.x - x) < (p.w + 0.26)/2){ ok = false; break; }
    }
    if(ok){ run += 0.01; if(run > best) best = run; } else run = 0;
  }
  return best;
}

function flashWarn(t){
  if (t.indexOf('ROADBLOCK') === 0) snd.warn();
  warnEl.textContent = t;
  warnEl.classList.remove('on'); void warnEl.offsetWidth; warnEl.classList.add('on');
}

/* ---------- lifecycle ---------- */
function reset(){
  /* You start PARKED, in first, with the engine idling. A run that begins at
     60mph gives away the launch, and now that first gear pulls properly off
     the line the launch is worth having. */
  pos=0; playerX=0; camX=0; targetX=0; spd=0;
  gear=1; idleRev=IDLE; autoHold=0; autoDownT=0;
  if(typeof knobRail !== 'undefined'){ knobRail=0; knobY=TOP_Y; }
  dmg=0; nos=40; nosOn=false; nosTime=0; bustT=0;
  /* ---- ROLLING START --------------------------------------------------
     Starting at a dead stop in first meant every run began with four seconds
     of nothing while the car got out of its own way — and after the
     acceleration retune that got worse, not better. You start MOVING, in the
     middle of second, which is where a race actually begins.
     ------------------------------------------------------------------- */
  gear = 2;
  spd = MAX_SPD * 0.155;
  if(CFG.onReset) CFG.onReset();
  racers=[]; place=12; finished=false; hasMoved=false;
  curveSegs=[]; hillSegs=[]; signs=[]; bendZ0=0; bendCache=[]; bendT=0; skySmooth=0; pushK=0; rebuildBend();
  /* and the field itself: `buildField` only ever ADDS, so a race left eleven
     cars on the road that TEST DRIVE then inherited */
  racers = [];
  if(mode === 'race') buildField();
  const pw = document.getElementById('placeWrap');
  if(pw) pw.hidden = (mode !== 'race');
  dist=0; score=0; combo=0; comboTime=0; heat=1; heatT=0; runTopMph=0;
  clock = CLOCK_START; nextCP = 1; cpGantries = []; lastBeep = -1; wreckWait = 0;
  /* if you are driving one, the force matches you; otherwise the night decides */
  barOn = false; wonCruiser = false; wonTraffic = false; coasting = false; runSeconds = 0;
  if(hornBtn) hornBtn.classList.remove('on');
  copLivery = (optBody === 'CRUISER')
    ? (optPaint === 'BLACK' ? 'BLACK' : 'WHITE')
    : (Math.random() < 0.5 ? 'BLACK' : 'WHITE');
  /* dayClock deliberately NOT reset: the sky keeps its own time across runs */
  traffic=[]; cops=[]; blocks=[]; crates=[]; fx=[];
  shake=0; hitFlash=0; sirenPhase=0; lastKmh=0; iframe=0;
  acc=0;
  if(!CFG.circuitOnly)
    for(let z=9000; z<52000; z+=rnd(5200,8600)) spawnWave(z);
  nextWaveZ = 52000;
  nextCopT = 9; nextBlockT = 30; nextCrateT = 16;
}
let nextWaveZ=0, nextCopT=0, nextBlockT=0, nextCrateT=0;

/* Cruising speed on the title card. The road already moves before you press
   anything, so the game starts from a car that is going rather than a car
   that is stopped — and pulling away feels like acceleration instead of a
   standing start. */
const IDLE_SPD = MAX_SPD * (60/200);   /* exactly 60 on the readout */
const BRAKE_SPD = 0;   /* the brakes stop the car, they do not settle it */

function start(){
  syncBoxClass();
  runs++;
  reset();
  snd.begin();
  state='driving';
  veil.classList.add('hidden');
}

function wreck(reason){
  /* ---- A WRECK COSTS TWO SECONDS, NOT THE RUN -------------------------
     The clock is what ends a run now, so crashing is a penalty against it
     rather than a full stop: you lose the two seconds it takes to put a
     fresh car on the road, in the middle, at rest. Whether that ends you
     depends entirely on how much time was left — which is the tension the
     whole design is built around.
     ------------------------------------------------------------------- */
  if(clock > 0){
    snd.dead();
    shake = 1.4;
    wreckWait = 2.0;
    spd = 0; dmg = 0; playerX = 0; targetX = 0; camX = 0;
    gear = 1; nosOn = false;
    /* ---- CLEAR THE THING THAT CALLED US -------------------------------
       A BUSTED wreck sets `spd = 0` and returns without ending the run — so
       the very next frame you are still crawling, still boxed in, and `bustT`
       is still over 3. It called `wreck()` again. And again, every frame,
       forever: a fresh `snd.dead()` and a `flashWarn` sixty times a second
       until the tab stops responding.

       That is the freeze on the PULL AWAY bar. The counter has to be cleared
       by the thing it triggers.
       ---------------------------------------------------------------- */
    bustT = 0;
    flashWarn('WRECKED  \u22122s');
    return;
  }
  state='wrecked';
  snd.dead();
  bestScore=Math.max(bestScore, Math.round(dist*10)/10);
  bestDist=Math.max(bestDist,dist);
  if(AR && AR.save) AR.save.merge(GAME_ID, {
    best: bestScore, bestMi: +bestDist.toFixed(1), runs: runs,
    label: 'BEST ' + bestDist.toFixed(1) + ' MI'
  });
  shake=1.4;
  for(let i=0;i<28;i++){
    fx.push({x:W/2+rnd(-40,40), y:H*0.80+rnd(-24,24),
      vx:rnd(-320,320), vy:rnd(-460,-60), life:rnd(.5,1.3), age:0,
      r:rnd(2,7), c: Math.random()<0.5 ? '#ff8a3d' : '#ffe0a0'});
  }
  /* a game over belongs to the menu, so the menu's music takes over */
  menuMusic();
  setTimeout(()=>showEnd(reason), 700);
}

/* ---- the paddles shift, and the number follows the box ------------------ */
(function(){
  const up = document.getElementById('padUp');
  const dn = document.getElementById('padDown');
  const tap = (el, d) => {
    if(!el) return;
    const go = (ev) => {
      ev.preventDefault();
      const n = gearCount();
      const want = clamp(gear + d, 1, n);
      if(want !== gear){ gear = want; if(snd.shift) snd.shift(); }
    };
    el.addEventListener('pointerdown', go);
  };
  tap(up, 1); tap(dn, -1);
})();

/* ---------- input ---------- */
let dragging=false, grabPx=0, grabX=0, padNos=false;
const keys=Object.create(null);
function px(clientX){ return (clientX - cv.getBoundingClientRect().left); }

/* page-wide relative steering, so the wheel is wherever your thumb is */
if (AR && AR.gesture) AR.gesture.onDrag(g => {
  if (state !== 'driving') return;  /* likewise: 'driving', not 'run' */
  /* A stationary car cannot change lanes — steering only works because the
     wheels are rolling. Authority fades in from a standstill up to about
     12mph, so crawling gives you a little and stopped gives you none. */
  const grip = clamp(spd / (MAX_SPD*0.07), 0, 1);
  targetX = clamp(targetX + (g.dx * grip) / (W*0.26), -1.18, 1.18);
});

cv.addEventListener('contextmenu',e=>e.preventDefault());

nitroBtn.addEventListener('pointerdown',e=>{e.preventDefault(); if(hasNos() && nos>8){ nosOn=true; snd.nitro(); }});
nitroBtn.addEventListener('pointerup',()=>nosOn=false);
nitroBtn.addEventListener('pointerleave',()=>nosOn=false);
nitroBtn.addEventListener('pointercancel',()=>nosOn=false);

/* Brake. Not just a way to avoid a crash — it is how you drop back alongside a
   cruiser instead of blowing past it, which is what makes the PIT a decision
   rather than an accident. */
function setBrake(on){
  brakeBtn.classList.toggle('on', on);
  braking = on;
  brakeBtn.classList.toggle('on', on);
  if(on) nosOn = false;               /* you cannot boost and brake */
}
/* ---- transmission -------------------------------------------------------
   Six ratios. Each has a speed band it can pull; asking for more than the gear
   can give bogs the engine, and holding a gear past its band hits the limiter.
   Automatic picks the gear for you and is the default.
   -------------------------------------------------------------------------- */
/* Four speeds. The gate was drawing two rails all along, which IS a four-speed
   H however the table was labelled — so the plate and the box now agree, and
   the bands are stretched to cover the same range in four steps. */
/* Real close-ratio four-speed numbers, near enough: a short first, a big step
   to second, then progressively smaller steps. `ratio` is the actual gearing —
   revs are road speed times ratio — and `pull` falls off with it, because
   torque at the wheel is what the ratio multiplies. */
/* This is a performance car. The old pull values (1.00 / 0.72 / 0.52 / 0.38)
   meant every upshift felt like the engine had been switched off — fourth
   pulled at a third of first. A real sports car makes more POWER higher up
   even though torque multiplication falls, so pull stays high across the box
   and only softens at the very top. */
/* Short gears that snap. Pull is highest low down where the ratio multiplies
   torque most, and the whole box is quick — you should be grabbing the next
   gear almost as soon as you are in this one. */
/* Six close ratios. Back from four because the gaps were huge — a 24% jump to
   second is a truck's gearbox, not a sports car's. */
/* ---- HOW MANY gearTable() THIS CAR HAS ----------------------------------------
   The six-speed table is the supercars'. A four- or five-speed car uses the
   same ratios but stops early and stretches the last one to the top of the
   rev range, which is what a shorter box actually feels like: fewer, longer
   pulls rather than the same pulls truncated.
   ------------------------------------------------------------------------- */
/* ---- 0 TO 60, NOT "PULL" -------------------------------------------------
   `pull` is a torque multiplier and means nothing to anyone. The same number
   run through the acceleration the car actually has gives a figure everybody
   knows. Simulated rather than guessed: step the real curve at 120Hz until it
   passes 60mph.
   ------------------------------------------------------------------------- */
function zeroSixty(key){
  const B = BODY[key] || BODY['MATADOR'];
  /* the REAL numbers: speed is in MAX_SPD units where MAX_SPD is 200mph, and
     the driving code adds `2850 * gearFactor() * pull` per second. My first
     attempt invented a 0.62 constant and produced 0.3s for everything. */
  const target = MAX_SPD * (60 / 200);
  const gt = (BODY[key] && BODY[key].gears) || 6;
  let v = 0, t = 0, shifts = 0;
  const DT = 1/120;
  while(v < target && t < 40){
    /* ---- SHIFTS COST TIME ----------------------------------------------
       The card read 2.7s against 3.2s on the road, and the difference was
       every upshift: the sim was pulling continuously through a gearbox the
       car has to actually change. A quarter of a second each, and a car with
       fewer, longer gears makes fewer of them — which is part of why a
       four-speed muscle car is not as slow as its pull suggests. */
    const nowGear = Math.min(gt, 1 + Math.floor(v / (MAX_SPD * B.vmax) * gt));
    if(nowGear > shifts + 1){ shifts++; t += 0.25; }
    /* which gear, and how much pull it has left — the same shape gearFactor
       uses: strong low down, tailing off toward the top of each ratio */
    const frac = v / (MAX_SPD * B.vmax);
    const g = Math.max(0.30, 1.55 - Math.min(1, frac * (6 / gt)) * 1.05);
    v += 1000 * g * B.pull * DT;
    t += DT;
  }
  /* NO SCALING. The card prints what the car does — which is the whole reason
     the acceleration was retuned rather than the number massaged. */
  return t;
}

function gearCount(){ return (BODY[optBody] && BODY[optBody].gears) || 6; }
function gearTable(){
  const n = gearCount();
  if(n >= GEARS.length) return GEARS;
  const cut = GEARS.slice(0, n).map(g => Object.assign({}, g));
  cut[n-1] = Object.assign({}, cut[n-1], { to: 1.0 });
  return cut;
}

const GEARS = [
  { g:1, ratio:3.82, from:0,    to:0.17, pull:1.55 },
  { g:2, ratio:2.62, from:0.13, to:0.31, pull:1.42 },
  { g:3, ratio:1.90, from:0.26, to:0.47, pull:1.28 },
  { g:4, ratio:1.44, from:0.41, to:0.65, pull:1.14 },
  { g:5, ratio:1.16, from:0.58, to:0.82, pull:1.04 },
  { g:6, ratio:1.00, from:0.75, to:1.00, pull:0.96 }
];
const REDLINE = 12000;
/* FORMULA is a V12: it spins to fifteen and sings a fifth higher than anything
   with a road-car engine in it. */
function redline(){ return (BODY[optBody] && BODY[optBody].redline) || REDLINE; }
function enginePitch(){ return (BODY[optBody] && BODY[optBody].pitch) || 1; }
/* Engine speed, from road speed and whatever ratio is selected. In neutral it
   falls back to an idle that lifts when you blip the throttle — the engine is
   not connected to anything, so the road cannot tell it what to do. */
let idleRev = 900, wasNeutral = false, launchKick = 0;
/* Revs are road speed measured against THIS GEAR'S ceiling, so every gear
   sweeps the same needle from idle to the redline and hits 12k at the top of
   its band — which is what tells you to shift. In fourth at 20mph the needle
   sits just off idle, and that is exactly why fourth will not pull you away
   from a standstill. */
const IDLE = 800;
function gearRpm(g, v){
  const G = gearTable()[g-1];
  /* against THIS car's top speed, so every car still redlines at the top of
     each gear rather than the tall one never reaching its limiter */
  const ceiling = MAX_SPD * bodyStat('vmax') * G.to;
  return clamp(IDLE + (v / ceiling) * (redline() - IDLE), IDLE, redline() + 300);
}
function engineRpm(){
  if(!optManual){
    if(gear < 1 || gear > gearTable().length) gear = 1;
    return gearRpm(gear, spd);
  }
  if(gear < 1 || gear > gearTable().length){
    /* NEUTRAL lets go of the tacho. It used to jump straight to idle, which
       read as the engine being switched off mid-shift. Off the throttle the
       revs FALL away under their own inertia; blip it and they rise. */
    /* An engine with no load on it will hit its limiter, and fast — that is
       the whole point of blipping in neutral. 6400 was exactly half the
       12,000 redline, so the needle stopped in the middle of the dial.
       It now runs to the limiter and BOUNCES off it, the way a rev limiter
       actually behaves rather than pinning flat against the stop. */
    const want = (gas || nosOn) ? redline() + 250 : IDLE;
    /* free-revving climbs much faster than under load */
    idleRev += (want - idleRev) * (want > idleRev ? 0.22 : 0.045);
    /* remember we were in neutral, so the moment a gear lands knows to look
       for a launch */
    wasNeutral = true;
    if((gas || nosOn) && idleRev > redline()*0.985){
      /* the limiter cutting in and out */
      idleRev = redline() - Math.abs(Math.sin(performance.now()/38)) * 620;
    }
    return idleRev;
  }
  /* ---- DROPPING IT INTO GEAR ------------------------------------------
     Landing in a gear catches the needle: whatever the engine was doing, the
     road now decides. But if it was REVVING when you dropped it, that stored
     energy has to go somewhere — and in a car with the power for it, it goes
     into the road.

     `launchFrom` is how far above the gear's own band the engine was. Scaled
     by horsepower and by how low the gear is, it becomes a shove; if the car
     has not got the power, nothing happens and it simply bogs.
     ------------------------------------------------------------------- */
  const landed = gearRpm(gear, spd);
  if(wasNeutral && idleRev > landed * 1.25){
    const over = Math.min(1, (idleRev - landed) / Math.max(1, redline() * 0.75));
    /* power against MASS, which is what actually decides this. `pull` was a
       stand-in until mass existed; it is not one any more. */
    const hp   = powerToWeight();
    const low  = gear <= 2 ? 1 : gear === 3 ? 0.55 : 0.22;
    const kick = over * hp * low;
    if(kick > 0.10){
      launchKick = kick;
      spd = Math.min(MAX_SPD * bodyStat('vmax'), spd + kick * 2600);
      snd.launch(kick);
      if(kick > 0.45){
        skids.push({ z: pos + PLAYER_Z, x: playerX, life: 1.0, w: 0.30 });
        shake = Math.max(shake, kick * 0.55);
      }
    }
  }
  wasNeutral = false;
  idleRev = landed;
  return idleRev;
}

/* ---- the torque curve ----------------------------------------------------
   THIS is what was missing. Pull was a flat number per gear, so fourth hauled
   you off the line as hard as first and the box may as well not have existed.
   An engine makes almost nothing below 1500rpm, peaks around three quarters of
   the way up, and falls off a cliff at the limiter. Multiply that by the gear's
   own torque multiplication and you get a car that MUST be shifted.
   -------------------------------------------------------------------------- */
/* ---- one drivetrain for everything on the road ---------------------------
   Every car uses the same torque curve and the same notion of gears. A rival
   pulling away from a standstill labours in first exactly as you do, and a
   cruiser closing on you runs out of top end at the same place its own gearing
   says it should. `AI_TOP` is 180 of the player's 200: they are quick, but the
   car you are driving is the fastest thing out here.
   -------------------------------------------------------------------------- */
const AI_TOP = MAX_SPD * (180/200);
/* the gear an AI would be in at this speed, as a fraction of ITS top */
function aiGearFactor(v, top){
  const r = clamp(v / top, 0, 1);
  let G = gearTable()[gearTable().length-1];
  for(const g2 of gearTable()) if(r <= g2.to){ G = g2; break; }
  const rpm = IDLE + (r / Math.max(0.01, G.to)) * (redline() - IDLE);
  return torqueAt(Math.min(redline(), rpm)) * (G.ratio / 2.0);
}
/* how hard any AI car accelerates toward a target speed */
function aiAccel(v, want, top, dt){
  if(want <= v) return Math.max(-5200*dt, want - v);
  return Math.min(want - v, 2850 * aiGearFactor(v, top) * dt);
}

function torqueAt(rpm){
  const f = (rpm - IDLE) / (redline() - IDLE);       /* 0 at idle, 1 at redline */
  /* The bottom has to be BRUTAL or a tall gear still hauls you off the line.
     Below a quarter of the range the engine is lugging and gives you almost
     nothing — which is why fourth from a standstill should crawl. */
  /* First gear off a standstill was painful: 2% of torque at idle meant the
     car crept for a second before anything happened. A real engine already
     makes useful torque just off idle — what it lacks is the ability to hold
     it in a TALL gear, and the ratio table handles that on its own. */
  if(f < 0.06) return 0.30;
  if(f < 0.26) return 0.30 + (f-0.06)/0.20 * 0.34; /* coming alive */
  if(f < 0.48) return 0.64 + (f-0.26)/0.22 * 0.20; /* coming on cam */
  if(f < 0.86) return 0.84 + (f-0.48)/0.38 * 0.16; /* the meat of it */
  if(f < 1.00) return 1.00 - (f-0.86)/0.14 * 0.55; /* falling off */
  return 0.06;                                     /* on the limiter */
}
let optManual = false, gear = 1, bogT = 0;
/* keeps the body class, the shifter and the dial height agreeing with the
   gearbox setting — called on change AND once at startup */
function syncBoxClass(){
  /* a car with no bottle shows no bottle */
  document.body.classList.toggle('nonos', !hasNos());
  /* the gate shows the gears the car HAS */
  const gn = gearCount();
  document.body.classList.toggle('gears4', gn <= 4);
  document.body.classList.toggle('gears5', gn === 5);
  document.body.classList.toggle('manual', !!optManual);
  /* one manual UI or the other, never both: the gate for a road car, paddles
     for the formula car */
  const paddleCar = optBody === 'FORMULA';
  const sh = document.getElementById('shifter');
  const pd = document.getElementById('paddles');
  if(sh) sh.hidden = !optManual ||  paddleCar;
  if(pd) pd.hidden = !optManual || !paddleCar;
}

/* how well the current gear suits the speed you are at */
function gearFactor(){
  /* pull = the engine's torque at these revs, times what the gear multiplies */
  if(optManual || true){
    if(gear < 1 || gear > gearTable().length) return 0;
    const G = gearTable()[gear-1];
    return torqueAt(gearRpm(gear, spd)) * (G.ratio / 2.0);
  }
  /* The automatic used to return a flat 1.00, so it ignored the ratio table
     entirely and pulled like nothing on the road. It now runs the SAME
     ratios — it just picks the gear for you, and because autoGear keeps it in
     band you rarely feel the penalty. */
  /* NEUTRAL is gear 0, so gearTable()[-1] was undefined and reading G.from threw on
     every single frame — the game appeared to hang the moment the knob passed
     through the centre of the gate, which it must do to reach any other gear. */
  if(gear < 1 || gear > gearTable().length) return 0;
  const r = spd / MAX_SPD;
  const G = gearTable()[gear-1];
  /* lugging and the limiter still hurt, but not catastrophically — being one
     gear out should cost you a length, not the whole race */
  if(r < G.from - 0.06) return 0.55;
  if(r > G.to)          return 0.30;
  return G.pull;
}
/* the automatic box, when manual is off */
/* ---- the automatic ------------------------------------------------------
   It shifts on REVS, not on a fraction of top speed — which is what it used to
   do, and why the needle never visibly ran to the limiter and back. Now you
   watch it sweep to the redline in first, drop as second engages, sweep again,
   and so on, exactly as a manual would look if you were driving it properly.

   Upshift the moment the needle touches the limiter. Downshift when the revs
   fall to where the next gear down would pull better — but only after a
   second, because an automatic hunting on every dab of the brake is worse than
   one that is slightly late.
   -------------------------------------------------------------------------- */
let autoHold = 0, autoDownT = 0;
function autoGear(dt){
  if(gear < 1 || gear > gearTable().length) gear = 1;
  if(autoHold > 0) return;
  const rpm = gearRpm(gear, spd);

  /* UP: at the limiter, and only if there is somewhere to go */
  if(gear < gearTable().length && rpm >= redline() * 0.985){
    gear++; autoHold = 0.22; autoDownT = 0; snd.shift(gear);
    return;
  }
  /* DOWN: revs have fallen out of the useful band. A second of lag, and then
     it drops as far as it needs to in one movement rather than one gear at a
     time — which is what you want when you brake hard into a corner. */
  /* 30% of the redline is 3600rpm — you have to be almost stopped to reach it,
     so it effectively never downshifted. A real box drops at part throttle
     around 45%, and KICKS DOWN at once when you ask for power it cannot give
     in this gear. */
  const wantPower = (gas || nosOn);
  const dropBelow = wantPower ? 0.56 : 0.45;
  if(gear > 1 && rpm < redline() * dropBelow){
    /* A full second was longer than it takes to stop from 120mph, so the box
       only ever dropped once you were already stationary. Off power it is
       0.18s, under power a quarter of that. Braking from 135mph to a stop
       takes barely a second, so anything longer means the box only ever drops
       once you have already stopped. */
    autoDownT += (dt || 1/60) * (wantPower ? 4 : 1);
    if(autoDownT >= 0.18){
      let g = gear;
      while(g > 1 && gearRpm(g-1, spd) < redline() * 0.97) g--;
      if(g !== gear){
        gear = g; autoHold = 0.22; snd.shift(gear);
        engineBrake();
      }
      autoDownT = 0;
    }
  } else autoDownT = 0;
}

let brakeLamp = 0;
let slipT = 0, coasting = false, runSeconds = 0, slideX = 0;

/* ===========================================================================
   WEATHER

   Shared, because rain is not a circuit idea — a wet highway is as good a
   reason to lift as a wet corner. One number, `wet`, from 0 to 1, and
   everything reads it:

     grip      falls to 62% of dry, so `cornerG` rises and the car runs wide
     braking   falls to 68%, which is what actually catches people out
     spray     the car ahead throws a plume; the slipstream still works but
               you cannot see through it
     light     the sky darkens and the road turns reflective

   It builds and clears over minutes rather than switching, so a run has
   weather rather than a weather SETTING.
   =========================================================================== */
/* ===========================================================================
   BIOMES

   The ground, the skyline and the WEATHER ODDS all come from one record, so a
   desert cannot snow and a tundra is rarely dry. Shared, because Interstate
   drives through them and Motorsport builds a circuit in one.

     rain / snow   the chance a front is that kind. They need not sum to 1 —
                   what is left over is clear weather.
     grass         two shades, the verge gradient
     sky           the horizon tint the sun sets into
     city          how built-up the skyline silhouette is, 0 to 1
   =========================================================================== */
const BIOMES = {
  FOREST:   { name:'FOREST',   rain:0.42, snow:0.06,
              grassLo:'#1d3a24', grassHi:'#2a4f31',
              sky:'#3a2c52', city:0.18, trees:0.85 },
  DESERT:   { name:'DESERT',   rain:0.04, snow:0.00,
              grassLo:'#6b5330', grassHi:'#8a6d42',
              sky:'#5a3520', city:0.05, trees:0.05 },
  MOUNTAIN: { name:'MOUNTAIN', rain:0.30, snow:0.34,
              grassLo:'#2b3a33', grassHi:'#3c4f45',
              sky:'#33405e', city:0.10, trees:0.55 },
  CITY:     { name:'CITY',     rain:0.38, snow:0.10,
              grassLo:'#2c2f36', grassHi:'#3b3f48',
              sky:'#2a2438', city:1.00, trees:0.10 },
  TUNDRA:   { name:'TUNDRA',   rain:0.10, snow:0.62,
              grassLo:'#3e4a52', grassHi:'#54626c',
              sky:'#2e3c50', city:0.06, trees:0.22 }
};
const BIOME_KEYS = Object.keys(BIOMES);
let biome = 'FOREST';
function bio(){ return BIOMES[biome] || BIOMES.FOREST; }

/* `wet` is any precipitation; `snowy` says which kind it is. Snow whitens the
   ground as it settles, which is the part you actually see. */
let wet = 0, wetTarget = 0, wetNext = 0, snowy = 0, settle = 0;

/* ---- HIGHWAY MOVES THROUGH THEM; RACEWAY SITS IN ONE ------------------
   A circuit is somewhere. A highway goes somewhere, so it changes biome every
   few miles — and the weather changes with it, which is why a desert stretch
   feels different from a mountain one without anything else being said.
   ---------------------------------------------------------------------- */
let biomeNext = 0;

/* ---- WEATHER BELONGS TO A PLACE, SO IT HAS TO LEAVE WITH IT ---------------
   The biome decided what MIGHT fall, and then nothing checked it again. A front
   picked in a tundra kept falling for the 35 to 80 seconds left on its own
   timer, so **snow followed you into the desert** and settled there. The odds
   were being used to start weather and never to end it.

   A biome that cannot produce what is falling ends it now. Rain in a desert is
   rare rather than impossible, so it is allowed to run itself out; snow with a
   zero chance is not, and neither is the settled white on the ground - that
   melts fast rather than lingering, because a desert is not somewhere snow
   sits.
   -------------------------------------------------------------------------- */
function endImpossibleWeather(){
  const B = bio();
  if(snowy && B.snow <= 0){
    wetTarget = 0;
    wetNext = Math.min(wetNext, rnd(3, 8));   /* and try again for this place soon */
    settleMelt = 1;
  }
  if(!snowy && B.rain <= 0){ wetTarget = 0; wetNext = Math.min(wetNext, rnd(3, 8)); }
}
let settleMelt = 0;

function stepBiome(dt){
  if(CFG.biome){
    const b2 = CFG.biome();
    if(b2 !== biome){ biome = b2; buildSkyline(); endImpossibleWeather(); }
    return;
  }
  biomeNext -= dt;
  if(biomeNext <= 0){
    if(biomeNext < -1){                            /* first call: pick one */
      biome = BIOME_KEYS[(Math.random()*BIOME_KEYS.length)|0];
      buildSkyline();
    } else {
      let k = biome;
      while(k === biome) k = BIOME_KEYS[(Math.random()*BIOME_KEYS.length)|0];
      biome = k;
      buildSkyline();          /* the horizon is part of the place */
      endImpossibleWeather();
      flashWarn(bio().name);
    }
    biomeNext = rnd(70, 130);
  }
}

function stepWeather(dt){
  if(optWeather === 'dry'){ wet = wetTarget = 0; return; }
  wetNext -= dt;
  if(wetNext <= 0){
    /* ---- THE BIOME DECIDES WHAT FALLS ---------------------------------
       A desert has a 4% chance of rain and none at all of snow; a tundra
       snows more often than not. The roll is against the biome, so weather
       belongs to a place rather than to a slider. */
    const B = bio();
    const r = Math.random();
    if(r < B.snow)              { wetTarget = rnd(0.45, 1.0); snowy = 1; }
    else if(r < B.snow + B.rain){ wetTarget = rnd(0.35, 0.95); snowy = 0; }
    else                        { wetTarget = 0; }
    if(optWeather === 'wet' && wetTarget === 0){ wetTarget = rnd(0.5,0.9); snowy = B.snow > B.rain ? 1 : 0; }
    wetNext = rnd(35, 80);
  }
  /* snow SETTLES: it whitens the ground long after it stops falling */
  const want = snowy ? wet : 0;
  /* ...unless the place it settled on cannot hold it. Driving out of a tundra
     into a desert used to leave the ground white for a minute and a half. */
  const fade = settleMelt ? 0.55 : (want > settle ? 0.10 : 0.03);
  settle += (want - settle) * Math.min(1, dt * fade);
  if(settleMelt && settle < 0.02){ settle = 0; settleMelt = 0; }
  /* rain arrives faster than a road dries */
  const rate = wetTarget > wet ? 0.22 : 0.055;
  wet += (wetTarget - wet) * Math.min(1, dt * rate * 3);
}

/* the two things weather actually changes */
/* snow is worse than rain, and settled snow keeps costing after it stops */
function wetGrip(){  return 1 - wet * (snowy ? 0.52 : 0.38) - settle * 0.14; }
function wetBrake(){ return 1 - wet * (snowy ? 0.46 : 0.32) - settle * 0.12; }
let horning = false, hornCool = 0, bustT = 0, behindT = 2, slowFor = 0, audioTick = 0, bendT = 0, skySmooth = 0, pushK = 0;

/* ---- rubber on the road --------------------------------------------------
   One system for every car out here. A mark is a short world-space segment at
   a lane position; they scroll past with everything else and fade, so the road
   carries a record of what has been happening on it. Smoke rises off the same
   events, which is what makes a hard corner read as hard rather than as the
   car simply being somewhere else.
   -------------------------------------------------------------------------- */
let skids = [], tyreSmoke = [], lastPX;
/* 420 marks meant 420 projections and 1,260 fill calls a frame. 180 still
   leaves a long trail behind a slide and costs a third as much. */
const SKID_MAX = 180, SMOKE_MAX = 90;

/* `heat` is 0-1: how badly the tyres are letting go */
function layRubber(x, z, heat, w){
  if(heat <= 0.05) return;
  const half = (w || 0.26) * 0.42;
  for(const side of [-half, half]){
    skids.push({ x: x + side, z, t: 1, heat });
  }
  if(skids.length > SKID_MAX) skids.splice(0, skids.length - SKID_MAX);
  /* No tyre smoke. It fought with the damage smoke coming off the bonnet for
     the same patch of screen and neither read clearly — the marks say what
     the tyres are doing on their own. */
}

/* how hard a car is scrubbing: sideways rate against speed, plus braking */
function scrubOf(o, dx, dt, v, isBraking){
  const fast = clamp(v / (MAX_SPD*0.42), 0, 1);        /* nothing at a crawl */
  if(fast <= 0.02) return 0;
  /* A higher bar: 1.9 meant an ordinary lane change sang. Only a real snatch
     at the wheel breaks the tyres loose now. */
  const lateral = clamp(Math.abs(dx) / (dt || 1/60) / 4.6, 0, 1);
  const brake = isBraking ? 0.75 : 0;
  return clamp(Math.max(lateral, brake) * fast, 0, 1);
}

function stepRubber(dt){
  for(let i=skids.length-1;i>=0;i--){
    const s2 = skids[i];
    s2.t -= dt * 0.055;                     /* rubber lasts a good while */
    if(s2.t <= 0 || s2.z < pos - 2000) skids.splice(i,1);
  }
  for(let i=tyreSmoke.length-1;i>=0;i--){
    const m = tyreSmoke[i];
    m.t -= dt * 0.9;
    m.r += dt * 0.5;
    m.x += m.drift * dt;
    if(m.t <= 0 || m.z < pos - 1200) tyreSmoke.splice(i,1);
  }
}

/* laid down before the cars, so they sit on top of their own rubber */
/* the rear lamps of any car ahead of you */
function tailLights(box, braking){
  /* below this the lamps are a pixel and a half and nobody can see them */
  if(!box || box.w < 12) return;
  const lit = lampsOn();
  const a = braking ? 0.95 : (lit > 0.01 ? 0.40 * lit : 0);
  if(a <= 0.01) return;
  /* `drawSprite` returns the CENTRE x — it draws at `p.x - w/2` — and this was
     treating it as the left edge, so every set of tail lights sat half a car
     width to the right of the car wearing them. */
  /* These MUST match what paintCar draws, or the glow floats beside the lamp.
     The sprite puts them at x = 0.135w and 0.60w, width 0.265w, at
     y = cy - 0.34h with height 0.11h — copied here rather than guessed. */
  const left = box.x - box.w/2;
  const lw = box.w*0.265, lh = box.h*0.11;
  const ly = box.y - box.h*0.34;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const lx of [left + box.w*0.135, left + box.w*0.60]){
    /* NO second lamp rect. The sprite already HAS tail lights painted into it;
       drawing another one over the top in 'lighter' at almost the same size
       made the two fight as the car scaled — which reads exactly like z
       fighting. Only the bloom is added here; the lamp itself is the sprite's. */
    /* THE FRAME COST. A radial gradient per lamp per car per frame was ~70
       gradient objects a frame with a full road — gradients are the most
       expensive thing in a 2D context and they were being rebuilt from
       scratch every time. The bloom only reads on a car that is actually
       close, so small ones get the flat lamp and nothing else. */
    if(box.w > 30){
      const gl = ctx.createRadialGradient(lx+lw/2, ly+lh/2, 0, lx+lw/2, ly+lh/2, lw*1.6);
      gl.addColorStop(0,'rgba(255,40,60,'+(a*0.55)+')');
      gl.addColorStop(1,'rgba(255,30,50,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(lx+lw/2, ly+lh/2, lw*1.6, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}

/* a chevron board on a post, beside the road */
/* ---- the checkpoint gantry -----------------------------------------------
   A green highway board on two legs spanning the whole carriageway. It has to
   be readable from a long way out, because knowing whether you will REACH it
   is the decision the clock is asking you to make.
   -------------------------------------------------------------------------- */
function drawGantry(cp){
  const p1 = proj(0, cp.z);
  if(!p1.ok) return;
  const roadW = p1.scale * ROAD * W;
  if(roadW < 6 || roadW > W*4) return;

  /* ---- a real overhead sign --------------------------------------------
     Two uprights outside the shoulder, a lattice TRUSS spanning between them
     above the road, and ONE green board hanging beneath it. That is the order
     a motorway gantry is actually built in, and it is what stops the thing
     reading as a banner floating over the tarmac.
     -------------------------------------------------------------------- */
  const half  = roadW * 0.78;
  const legH  = roadW * 0.62;
  const truss = p1.y - legH;
  const lw    = Math.max(1, roadW * 0.020);
  const th    = Math.max(2, roadW * 0.075);
  const bh    = Math.max(3, roadW * 0.20);
  const bw    = roadW * 1.06;

  ctx.fillStyle = '#4a5058';
  ctx.fillRect(p1.x - half, truss, lw, legH);
  ctx.fillRect(p1.x + half - lw, truss, lw, legH);

  ctx.fillStyle = '#5a616a';
  ctx.fillRect(p1.x - half, truss, half*2, Math.max(1, th*0.22));
  ctx.fillRect(p1.x - half, truss + th - Math.max(1, th*0.22), half*2, Math.max(1, th*0.22));
  if(roadW > 40){
    ctx.strokeStyle = '#5a616a';
    ctx.lineWidth = Math.max(0.8, th*0.13);
    const bays = 12, step = (half*2)/bays;
    for(let i2=0;i2<bays;i2++){
      const x0 = p1.x - half + i2*step;
      ctx.beginPath(); ctx.moveTo(x0, truss + th); ctx.lineTo(x0 + step, truss); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, truss); ctx.lineTo(x0 + step, truss + th); ctx.stroke();
    }
  }

  const by = truss + th;
  ctx.fillStyle = '#454b53';
  ctx.fillRect(p1.x - bw*0.30, by, lw, Math.max(1, bh*0.10));
  ctx.fillRect(p1.x + bw*0.30 - lw, by, lw, Math.max(1, bh*0.10));
  const bTop = by + Math.max(1, bh*0.10);

  ctx.fillStyle = '#0f2a18';
  ctx.fillRect(p1.x - bw/2, bTop, bw, bh);
  ctx.fillStyle = '#0d7a34';
  ctx.fillRect(p1.x - bw/2 + lw*0.6, bTop + lw*0.6, bw - lw*1.2, bh - lw*1.2);

  if(bh > 8){
    ctx.strokeStyle = 'rgba(255,255,255,.92)';
    ctx.lineWidth = Math.max(0.9, bh*0.045);
    ctx.strokeRect(p1.x - bw/2 + bh*0.14, bTop + bh*0.14, bw - bh*0.28, bh - bh*0.28);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(bh*0.52) + 'px ' +
               getComputedStyle(document.body).getPropertyValue('--disp');
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CHECKPOINT', p1.x, bTop + bh*0.52);
    ctx.restore();
  }

  const lit = lampsOn();
  if(lit > 0.01 && bh > 6){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(const fx2 of [-0.28, 0, 0.28]){
      const gx = p1.x + bw*fx2, gy = bTop + bh;
      const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, bh*0.9);
      gl.addColorStop(0, 'rgba(255,244,206,' + (0.30*lit) + ')');
      gl.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(gx, gy, bh*0.9, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  }
}

function drawSign(sg){
  const p1 = proj(sg.side * 1.34 * ROAD, sg.z);
  if(!p1.ok) return;
  if(overBrow(sg.z, p1.y)) return;
  const sc = p1.scale * ROAD * W;
  /* These were billboard-sized — a third of a road width across on a post half
     a road width tall, which at close range filled the screen like an
     interstate hoarding. A real chevron board is about the size of a car door
     on a waist-high post, so: a seventh of a road width, and CAPPED so a sign
     you are about to pass cannot dominate the frame. */
  let bw = Math.min(sc * 0.145, W * 0.115);
  const bh = bw * 0.74;
  if(bw < 2.5) return;
  const postH = Math.min(sc * 0.24, H * 0.10);
  const bx = p1.x, by = p1.y - postH - bh;

  /* the post */
  ctx.fillStyle = '#4a4f57';
  ctx.fillRect(bx - Math.max(0.5, bw*0.055), p1.y - postH, Math.max(1, bw*0.11), postH);
  /* the board: yellow diamond-ish plate with a dark border */
  ctx.fillStyle = '#141821';
  ctx.beginPath(); ctx.roundRect(bx - bw/2, by, bw, bh, Math.max(1, bw*0.08)); ctx.fill();
  ctx.fillStyle = '#f2c53d';
  ctx.beginPath();
  ctx.roundRect(bx - bw/2 + bw*0.07, by + bh*0.09, bw*0.86, bh*0.82, Math.max(1, bw*0.06));
  ctx.fill();

  /* the chevrons, pointing the way the road goes */
  if(bw > 6){
    const n = sg.mag;
    const cw = bw*0.20, gap = bw*0.055;
    const total = n*cw + (n-1)*gap;
    let cx0 = bx - total/2;
    ctx.strokeStyle = '#141821';
    ctx.lineWidth = Math.max(1, bw*0.055);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for(let i=0;i<n;i++){
      const x0 = cx0 + i*(cw+gap);
      ctx.beginPath();
      if(sg.dir > 0){
        ctx.moveTo(x0, by + bh*0.28);
        ctx.lineTo(x0 + cw, by + bh*0.50);
        ctx.lineTo(x0, by + bh*0.72);
      } else {
        ctx.moveTo(x0 + cw, by + bh*0.28);
        ctx.lineTo(x0, by + bh*0.50);
        ctx.lineTo(x0 + cw, by + bh*0.72);
      }
      ctx.stroke();
    }
  }
  /* a lit reflective sheen at night, as a real sign has */
  const lit = lampsOn();
  if(lit > 0.01 && bw > 6){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,190,' + (0.13*lit) + ')';
    ctx.beginPath(); ctx.roundRect(bx - bw/2, by, bw, bh, Math.max(1, bw*0.08)); ctx.fill();
    ctx.restore();
  }
}

function drawRubber(){
  for(const s2 of skids){
    const d = s2.z - pos;
    /* the near cull was 30, which threw marks away while they were still on
       screen sliding past the car — the one moment you can actually see your
       own rubber in a forward view */
    if(d < 4 || d > 5200) continue;
    const p1 = proj(s2.x*ROAD, s2.z);
    if(!p1.ok) continue;
    /* wider and darker: at 5% of a lane and 27% opacity they were invisible
       against tarmac that is already almost black */
    const w = Math.max(1.4, p1.scale * ROAD * W * 0.10);
    const h = Math.max(2, p1.scale * 320);
    ctx.fillStyle = 'rgba(8,8,10,' + Math.min(0.85, 0.9 * s2.t * (0.45 + s2.heat*0.55)) + ')';
    ctx.fillRect(p1.x - w/2, p1.y - h, w, h);
    /* a scuffed edge, so it is not a flat black bar */
    ctx.fillStyle = 'rgba(40,38,42,' + Math.min(0.4, 0.4 * s2.t) + ')';
    ctx.fillRect(p1.x - w*0.72, p1.y - h, w*0.26, h);
    ctx.fillRect(p1.x + w*0.46, p1.y - h, w*0.26, h);
  }
  for(const m of tyreSmoke){
    const d = m.z - pos;
    if(d < 30 || d > 5200) continue;
    const p1 = proj(m.x*ROAD, m.z);
    if(!p1.ok) continue;
    const rad = Math.max(2, p1.scale * ROAD * W * m.r * 2.2);
    const a = m.t * 0.34;
    const gr = ctx.createRadialGradient(p1.x, p1.y, 0, p1.x, p1.y, rad);
    gr.addColorStop(0, 'rgba(214,214,220,' + a + ')');
    gr.addColorStop(1, 'rgba(190,190,200,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(p1.x, p1.y, rad, 0, 6.2832); ctx.fill();
  }
}

/* ---- race mode ----------------------------------------------------------
   Twelve runners over twelve miles. You start LAST and you are slightly the
   quickest thing out there, so the whole race is a long overtake — which is
   the only structure that makes a fixed distance interesting.
   -------------------------------------------------------------------------- */
const RACE_MILES = 12;
/* the odometer does dist += spd*dt/1000*0.00777, so one mile is 1/0.00000777
   world units — derived rather than guessed, so the banner lands exactly where
   the readout says twelve. */
const MILE = 1 / 0.00000777;
const FIELD = 11;                    /* eleven rivals plus you = twelve */
let mode = 'endless';                /* or 'race' */
let racers = [], place = 12, finished = false, finishZ = 0;

function buildField(){
  racers = [];
  for(let i=0;i<FIELD;i++){
    /* strung out ahead of you at the line, quickest at the front */
    const rank = i;
    racers.push({
      z: pos + 700 + rank*520 + rnd(-120,120),
      lane: rint(0, LANES-1),
      x: 0,
      /* each is a shade slower than you, and they differ from each other so
         the field spreads rather than moving as a block */
      /* You are the quickest thing out there, but only just — the fastest
         rival runs at 92% of your top speed and the slowest at 81%, so the
         race is won by traffic craft rather than by holding the throttle. */
      base: 0,   /* set by buildField once the car is chosen */
      /* They start AT racing pace. Starting them at half speed meant you blew
         past the whole field in the first ten seconds and then watched them
         all re-pass you, so placement swung 12 to 2 to 11 and meant nothing. */
      spd: 0,
      /* ---- A CAR NUMBER, NOT A POSITION ---------------------------------
         `rank` is the grid SLOT and it counts from the car nearest you, so
         `rank + 1` painted #1 on the last car in the field and #11 on the
         leader — backwards from what a number on a car means to anyone.
         Measured at the line: #11 was 26,046 ahead and #2 was 20,115.

         Inverted, so **#1 is the car at the front**. It is painted on the boot
         and it never changes — a race number, not a placing.

         Your own position is the P x/12 readout in the HUD. One is who the car
         IS, the other is where YOU are. */
      num: FIELD - rank,
      /* the same sports car as yours, in whichever paints you did not take */
      paint: null,
      wreck: 0, ang: 0, dodgeT: 0, w: 0.265, len: 390
    });
  }
  /* ---- the grid ----------------------------------------------------------
     Rivals drive the SAME three cars you do, with the same statistics, in
     whichever paints you did not take. No flat handicap: a hard cap at 90% of
     your top speed means you can always eventually outrun the field and the
     race turns into "get clear, then cruise". Making them equals means beating
     them is a matter of driving better, and the rubber band keeps it close
     enough to stay a race.

     The mix is real too: a MATADOR rival leaps off the line and runs out of
     legs; a STALLION reels you back in on a long straight.
     -------------------------------------------------------------------------- */
  const pool = PAINT_KEYS.filter(k => k !== optPaint);
  for(let i=pool.length-1;i>0;i--){
    const j = (Math.random()*(i+1))|0;
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  /* Dealt round-robin then shuffled, so the three types are always evenly
     represented. Drawing each independently clustered badly — one grid came
     out seven STALLION from eleven. */
  /* only the three starting cars — `Object.keys(BODY)` now includes the three
     unlockables, and a grid handing you a FORMULA you have not won is absurd */
  const kinds = rivalBodies();
  const deck = [];
  for(let i=0;i<racers.length;i++) deck.push(kinds[i % kinds.length]);
  for(let i=deck.length-1;i>0;i--){
    const j = (Math.random()*(i+1))|0;
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  racers.forEach((r,i) => {
    r.x = LANE_X[r.lane];
    r.paint = pool[i % pool.length];
    r.body  = deck[i];
    const B = BODY[r.body];
    r.vmax  = MAX_SPD * B.vmax;
    r.pull  = B.pull;
    /* skill spread stays, so the grid is strung out rather than identical */
    r.base  = r.vmax * (0.99 - i*0.008 + rnd(-0.006,0.006));
    r.spd   = r.base * 0.92;
  });
  /* a tournament round sets its own distance */
  finishZ = pos + (tourOn ? TOUR_MILES[tourRound] : RACE_MILES) * MILE;
  place = 12; finished = false;
}

function stepRacers(dt){
  const k = Math.min(2.4, dt*60);
  for(const r of racers){
    if(r.wreck > 0){
      r.wreck -= dt; r.spd *= (1 - 1.6*dt); r.ang += dt*6; r.z += r.spd*dt;
      continue;
    }
    /* --- look ahead and pick a line, same idea as the cruisers --- */
    let want = r.base, dodge = 0;
    const scan = (list, isCop) => {
      for(const o of list){
        if(o === r) continue;
        if(isCop && o.wreck > 0) continue;
        const gap = o.z - r.z;
        if(gap < -120 || gap > 3600) continue;
        if(Math.abs(o.x - r.x) > 0.30) continue;
        /* something in the way: slow a little and lean off it */
        want = Math.min(want, (o.spd || o.cruise || 0) * 0.98);
        dodge += (r.x < o.x ? -1 : 1) * (1 - gap/3600);
      }
    };
    scan(traffic, false);
    scan(racers, false);
    if(!optEasy) scan(cops, true);

    /* roadblocks: aim for the gap rather than the barrier */
    for(const b of blocks){
      const gap = b.z - r.z;
      if(gap < 0 || gap > 5200) continue;
      dodge += (b.gapX - r.x) * 2.4 * (1 - gap/5200);
      want = Math.min(want, MAX_SPD*0.82);
    }

    if(dodge !== 0){
      r.dodgeT = 0.35;
      r.x = clamp(r.x + clamp(dodge, -1, 1) * 1.5 * dt, -1.05, 1.05);
    } else {
      /* drift back toward a lane centre when nothing is pressing */
      const home = LANE_X[r.lane];
      r.x += (home - r.x) * Math.min(1, dt*1.4);
      r.dodgeT = Math.max(0, r.dodgeT - dt);
    }
    r.ang = clamp((r.x - (r.px===undefined?r.x:r.px)) * 26, -0.3, 0.3);
    r.px = r.x;

    /* RUBBER BAND. A race decided in the first mile is not a race. Anyone a
       long way behind gets a tow; anyone a long way ahead gets a governor. The
       band is gentle — up to 14% either way — so it closes the field without
       ever making a rival feel like it is teleporting. */
    const lead = (r.z - pos) / MILE;              /* miles ahead of you */
    const band = clamp(-lead * 0.11, -0.14, 0.14);
    want *= (1 + band);
    /* same drivetrain as yours, capped at 180 */
    want = Math.min(want, AI_TOP);
    const rWas = r.spd;
    r.spd += aiAccel(r.spd, want, AI_TOP, dt);
    const rDec = (rWas - r.spd) / Math.max(dt, 1/240);
    if(rDec > 900) r.brakeT = 0.35; else if(r.brakeT > 0) r.brakeT -= dt;
    r.braking = (r.brakeT || 0) > 0;
    r.z += r.spd*dt;
    /* rivals lay rubber on the same terms you do */
    const rdx = r.x - (r.lastX === undefined ? r.x : r.lastX);
    r.lastX = r.x;
    const rs = scrubOf(r, rdx, dt, r.spd, r.spd < want*0.7);
    if(rs > 0.05) layRubber(r.x, r.z, rs, r.w);

    /* they can put a cruiser out, and be put out by one */
    if(!optEasy){
      for(const c of cops){
        if(c.wreck > 0) continue;
        if(Math.abs(c.z - r.z) < 260 && Math.abs(c.x - r.x) < 0.22){
          if(Math.random() < 0.5){ c.wreck = 1.2; c.spd *= 0.5; snd.copDown(); }
          else { r.wreck = 1.1; r.spd *= 0.6; }
        }
      }
    }
    /* and they crash into traffic if they misjudge it */
    for(const c of traffic){
      if(Math.abs(c.z - r.z) < 220 && Math.abs(c.x - r.x) < 0.20){
        r.wreck = 1.0; r.spd *= 0.55;
      }
    }

    /* ---- AND INTO YOU, WHICH THEY DID NOT ---------------------------------
       Racers avoided traffic, avoided cruisers, avoided roadblocks and each
       other - and drove straight THROUGH the player. Every other body on this
       road was solid to them except the one the player is sitting in, so a
       rival could occupy your lane and share your bumper for a mile.

       This is a contact hit rather than a wreck for either car. A rival is
       racing you: leaning on each other is the sport, and spinning a rival
       every time you touch would empty the field in the first mile. Both of
       you lose speed, both get pushed apart, and only you take damage, because
       you are the only one keeping a health bar.
       --------------------------------------------------------------------- */
    const pRdz = r.z - (pos + PLAYER_Z), pRdx = Math.abs(r.x - playerX);
    if(iframe <= 0 && Math.abs(pRdz) < ((r.len || 380) + 380)/2 && pRdx < ((r.w || 0.30) + 0.26)/2){
      hurt(8, 'racer');                       /* less than traffic: it is a rub, not a T-bone */
      iframe = 0.7;
      const push = Math.sign(playerX - r.x || 1);
      /* the bigger the speed difference the harder the shunt */
      const closing = Math.min(1, Math.abs(spd - r.spd) / 4200);
      playerX = clamp(playerX + push * (0.16 + closing*0.16), -1.18, 1.18);
      targetX = playerX;
      r.x     = clamp(r.x - push * (0.12 + closing*0.12), -0.92, 0.92);
      spd    *= 0.80 - closing*0.10;
      r.spd  *= 0.86;
      burst(r, '#ffd27a');
    }
  }
  /* Do NOT cull. Racers that dropped behind were deleted at 14,000 back, so
     once you got clear of the field it evaporated and could never catch up —
     which read as the rivals de-spawning. They stay in the race for the whole
     twelve miles; only the draw skips them when they are out of view. */

  /* ---- LIVE PLACES, FOR EVERYONE --------------------------------------
     A rival's boot carried its GRID number, which never changed — useful for
     telling cars apart and useless for telling how the race is going. Both
     you and every rival now get a live place from the same rule: count how
     many cars are up the road, add one.

     Computed once here, per frame, rather than in the draw — the draw runs
     per visible car and would redo the whole comparison each time.
     -------------------------------------------------------------------- */
  let ahead = 0;
  for(const r of racers) if(r.z > pos) ahead++;
  place = ahead + 1;

  for(const r of racers){
    let n = 0;
    if(pos > r.z) n++;                          /* you are up the road */
    for(const o of racers) if(o !== r && o.z > r.z) n++;
    r.place = n + 1;
  }

  if(!finished && pos >= finishZ){
    /* ---- CROSSING THE LINE ENDS IT --------------------------------------
       This called `wreck()`, which now returns early whenever the clock has
       time left — so finishing a race did nothing at all. A finish is not a
       crash and must not go through the crash path. */
    finished = true;
    /* ---- THE DRIVER IS DONE ---------------------------------------------
       Crossing the line used to leave YOU steering through traffic while the
       end card was up — you could still crash after winning. The car is handed
       to the AI: it lifts, holds its lane, and coasts down.

       `coasting` also stops `snd.drive()` re-opening the engine voices. That
       is why the audio latched: `snd.quiet()` ran ONCE on the finish and then
       drive() was called sixty times a second afterwards and set them all
       straight back. Silencing something that is being continuously refreshed
       needs the refresh to stop, not a louder silence.
       ------------------------------------------------------------------ */
    coasting = true;
    setGas(false); setBrake(false); nosOn = false;
    state = 'wrecked';
    bestScore = Math.max(bestScore, Math.round(dist*10)/10);
    bestDist  = Math.max(bestDist, dist);
    if(AR && AR.save) AR.save.merge(GAME_ID, {
      best: bestScore, bestMi: +bestDist.toFixed(1), runs: runs,
      label: 'BEST ' + bestDist.toFixed(1) + ' MI'
    });
    /* ---- SILENCE THE CAR ------------------------------------------------
       `snd.quiet()` is only reachable through `snd.dead()`, and a clean finish
       never crashes — so crossing the line left the engine, the wind, the
       tyres and the siren all HELD at whatever they were doing at 190mph, and
       they carried on under the end card forever.

       Every other exit from a run goes through `dead()` and gets silenced by
       accident. This one has to ask. */
    snd.quiet();
    menuMusic();
    snd.checkpoint();
    if(tourOn){
      tourScore(place);
      const last = (tourRound >= TOUR_MILES.length - 1);
      if(last){
        const st = tourStanding();
        /* gold unlocks the formula car, silver the tuner, bronze the muscle
           car — so a tournament is worth finishing even when the win is gone */
        if(AR && AR.save){
          /* the save keys name the CARS, not a TYPE that no longer exists */
          /* gold pays out by CLASS: the supercar ladder hands you the
             open-wheeler, the sports ladder hands you the paint */
          if(st === 1 && classOf(optBody) === 'super')
            AR.save.merge((GAME_ID + '-opts'), { formula:true });
          if(st === 1 && classOf(optBody) === 'sports')
            AR.save.merge((GAME_ID + '-opts'), { iridescent:true });
          if(st <= 2)  AR.save.merge((GAME_ID + '-opts'), { tuner:true });
          if(st <= 3)  AR.save.merge((GAME_ID + '-opts'), { muscle:true });
        }
        setTimeout(() => showTrophy(st), 700);
      } else {
        tourRound++;
        setTimeout(() => showRound(place), 700);
      }
    } else {
      setTimeout(() => showEnd(place === 1 ? 'WON'
        : 'FINISHED ' + place + ordinal(place)), 700);
    }
  }
}
function ordinal(n){
  return n===1?'ST' : n===2?'ND' : n===3?'RD' : 'TH';
}
/* ---- YOU HAVE A LIGHT BAR, NOT A HORN -----------------------------------
   In the cruiser the horn button becomes what it would actually be: a LATCHING
   switch for the bar and the siren. Press once and they are on, press again and
   they are off — a horn is momentary, a light bar is not.

   It still scatters traffic. That is the point of the thing: you are asking the
   car in front to move over, and this is the version of that request the
   interceptor has.
   ------------------------------------------------------------------------- */
let barOn = false;
let wonCruiser = false, wonTraffic = false;
/* ---- ANY FORCE CAR, NOT JUST THE CRUISER ------------------------------
   This named one body, so the SUPER CRUISER had lights on its sprite and no
   way to switch them on: no latch, no siren, no wash, no scatter. `force` is
   a flag on the BODY record, so a new police car gets the whole machinery by
   declaring itself one.
   ---------------------------------------------------------------------- */
function inCruiser(){
  const B = BODY[optBody];
  return !!(B && (B.force || optBody === 'CRUISER'));
}

function setHorn(on){
  if(inCruiser()){
    /* only the press latches; the release does nothing */
    if(!on) return;
    barOn = !barOn;
    hornBtn.classList.toggle('on', barOn);
    horning = false;
    snd.honk(false);
    return;
  }
  if(on === horning) return;
  horning = on;
  hornBtn.classList.toggle('on', on);
  snd.honk(on);
  if(on) scatter();
}
/* Anything ahead of you in your lane gets a chance to move over. Not a
   certainty — a horn is a request, not a command — and a car with nowhere to
   go stays put, which is what makes the ones that do move feel like a break. */
/* ---- ONE MECHANISM, TWO VOICES -------------------------------------------
   A horn asks and a siren tells. Same code either way — the difference is the
   odds (40% against 90%) and the fact that a siren keeps asking for as long as
   it is on, where a horn asks once per press.

   Forty is deliberately low: a horn should feel like a favour when it works,
   not a button that parts traffic.

   `fromZ` and `fromLane` let an NPC cruiser use it too, so traffic gets out of
   ITS way exactly as it gets out of yours.
   ------------------------------------------------------------------------- */
function scatter(chance, fromZ, fromLane){
  if(hornCool > 0) return;
  hornCool = 0.55;
  const oz = (fromZ === undefined) ? pos : fromZ;
  /* ---- THE BUG THAT SWALLOWED THE SPEED TRAPS ------------------------
     `lane` does not exist in this engine — the player's lateral position is
     `playerX`. Every frame a cop was on the road, `scatter` threw here, and
     because it is called from `step()` everything AFTER it in the frame was
     skipped: the trap watch, the super-cruiser watch, the clock.

     It has been throwing since sirens were given to NPC cruisers, and it took
     a stack trace to find — three passes of reading the wrong lines did not.
     ------------------------------------------------------------------ */
  const ol = (fromLane === undefined) ? playerX : fromLane;
  const odds = (chance === undefined) ? 0.40 : chance;
  for(const c of traffic){
    const ahead = c.z - oz;
    if(ahead < 40 || ahead > 1500) continue;
    if(Math.abs(c.lane - ol) > 0.6) continue;
    /* ---- THEY GET FED UP ------------------------------------------------
       Each car carries its own `heed`, starting at 1. Every time it is asked
       and refuses, that drops — so leaning on the horn behind the same car
       stops working, which is what actually happens. Asking a DIFFERENT car
       is unaffected, because the multiplier lives on the vehicle rather than
       on you.

       It recovers slowly once you are past, so a long run does not end with a
       road full of cars that will never move again.
       -------------------------------------------------------------------- */
    if(c.heed === undefined) c.heed = 1;
    if(Math.random() > odds * c.heed){
      c.heed = Math.max(0.12, c.heed * 0.62);
      continue;
    }
    const room = [];
    if(c.lane > 0) room.push(c.lane - 1);
    if(c.lane < LANES - 1) room.push(c.lane + 1);
    if(!room.length) continue;
    c.lane = room[(Math.random()*room.length)|0];
    c.swerve = 1;
    /* it moved, so it is not the one being stubborn */
    c.heed = Math.max(0.12, c.heed * 0.86);
  }
}

function setGas(on){
  gas = on;
  gasBtn.classList.toggle('on', on);
}
/* ---- dragging the knob ---------------------------------------------------
   Six slots on two rails. The knob follows the thumb while held and snaps to
   the nearest slot on release — so you can feel your way to a gear rather than
   having to hit a target exactly.
   -------------------------------------------------------------------------- */
const shifterEl = document.getElementById('shifter');
/* ---- the steering wheel ------------------------------------------------- */
const wheelCv = document.getElementById('wheel');
const wheelCx = wheelCv ? wheelCv.getContext('2d') : null;
let wheelGrab = null, wheelDpr = 0;
/* ---- what the wheel is actually showing ---------------------------------
   It was reading `playerX` — WHERE you are across the road — so it barely
   moved at full lock and it stayed put when you let go, because your lane
   position stays put. A steering wheel shows how hard you are TURNING, which
   is a rate, not a position: it winds on as you drag and unwinds to straight
   the moment you stop, exactly as the car stops changing lanes.
   -------------------------------------------------------------------------- */
let steerTurn = 0;            /* -1 hard left, +1 hard right */

/* ---- the wheel is for thumbs only ---------------------------------------
   A player with a keyboard or a pad is not going to drag a wheel, so showing
   one is clutter over the road. It hides the moment real hardware is used and
   comes back if they go back to touching the glass — the last input WINS,
   rather than a guess made once at load.
   -------------------------------------------------------------------------- */
let usingHardware = false, optTouchUI = 'AUTO';
function applyTouchUI(){
  /* AUTO follows the last input; ON and OFF are the player overriding it,
     because a phone with a pad propped up may still want thumb pedals, and
     someone playing one-handed may want them gone. */
  const hide = optTouchUI === 'OFF' ? true
             : optTouchUI === 'ON'  ? false
             : usingHardware;
  document.body.classList.toggle('hardware', hide);
  if(hide) steerTurn = 0;
}
function setInputSource(hardware){
  if(usingHardware === hardware) return;
  usingHardware = hardware;
  applyTouchUI();
}
/* ---- the wheel shows what the CAR is doing ------------------------------
   It used to wind from the finger, so holding a drag against the edge of the
   road kept turning the wheel while the car sat still against the verge. The
   angle is now taken from the car's ACTUAL lateral movement: if the car is not
   changing lanes, the wheel is straight, whatever your thumb is doing. That
   makes them exactly in sync by construction rather than by tuning.
   -------------------------------------------------------------------------- */
let wheelPrevX;
function stepWheel(dt){
  if(wheelPrevX === undefined) wheelPrevX = playerX;
  const moved = (playerX - wheelPrevX) / Math.max(1/240, dt);   /* lanes/sec */
  wheelPrevX = playerX;
  /* full lock at about 2.4 lanes a second, which is as fast as the car turns */
  const want = clamp(moved / 2.4, -1, 1);
  /* a little smoothing so it does not jitter frame to frame */
  steerTurn += (want - steerTurn) * Math.min(1, dt*14);
  if(Math.abs(steerTurn) < 0.004) steerTurn = 0;
}


/* ===========================================================================
   THE THREE MARQUES

   One drawing routine used in two places: the boss of the steering wheel and
   the badge on the tail. Drawn at whatever radius is asked for, so the same
   shape reads at 26px on a wheel and at 8px on the back of a car.

   Ours, not anybody's: a rearing horse, a charging bull, a crest with a bird.
   =========================================================================== */
function drawMarque(g, kind, cx, cy, r, tint){
  g.save();
  g.translate(cx, cy);
  g.scale(r/10, r/10);
  /* ---- BOLD, NOT DETAILED ------------------------------------------------
     These are read at about twenty pixels across on a wheel boss and eight on
     the back of a car. The first pass drew little animals with fifteen-point
     outlines, which at that size is grey mush — three ovals with a smudge in
     them. What separates a badge at a glance is its SHAPE and its COLOUR, so
     each is now a distinct outline in a distinct metal with one heavy device
     inside it.
     ---------------------------------------------------------------------- */
  if(kind === 'STALLION'){
    /* WIDE YELLOW OVAL, black bar, three red stripes — racing colours */
    g.fillStyle = '#0e1014';
    g.beginPath(); g.ellipse(0,0,10,6.6,0,0,6.2832); g.fill();
    g.fillStyle = '#f2c53d';
    g.beginPath(); g.ellipse(0,0,8.4,5.2,0,0,6.2832); g.fill();
    g.fillStyle = '#0e1014';
    g.fillRect(-8.4,-1.1,16.8,2.2);
    g.fillStyle = '#c8102e';
    g.fillRect(-4.0,-4.6,1.9,3.2);
    g.fillRect(-0.9,-4.6,1.9,3.2);
    g.fillRect( 2.2,-4.6,1.9,3.2);
  } else if(kind === 'MATADOR'){
    /* TALL BLACK HEXAGON with a gold rim and a single heavy chevron */
    g.fillStyle = '#c2a86a';
    g.beginPath();
    g.moveTo(0,-9.2); g.lineTo(6.2,-5.0); g.lineTo(6.2,5.0);
    g.lineTo(0,9.2);  g.lineTo(-6.2,5.0); g.lineTo(-6.2,-5.0);
    g.closePath(); g.fill();
    g.fillStyle = '#0e1014';
    g.beginPath();
    g.moveTo(0,-7.2); g.lineTo(4.8,-3.9); g.lineTo(4.8,3.9);
    g.lineTo(0,7.2);  g.lineTo(-4.8,3.9); g.lineTo(-4.8,-3.9);
    g.closePath(); g.fill();
    g.fillStyle = '#c2a86a';
    g.beginPath();
    g.moveTo(-3.4,-2.2); g.lineTo(0,1.4); g.lineTo(3.4,-2.2);
    g.lineTo(3.4,1.0);   g.lineTo(0,4.6); g.lineTo(-3.4,1.0);
    g.closePath(); g.fill();
  /* ---- ONE PAIR OF BRANCHES, NOT TWO -------------------------------------
     There were TWO 'T' branches and two 'M' branches: an earlier pair sitting
     above the ones I later wrote. `else if` takes the FIRST match, so the real
     designs never ran and editing them showed nothing. The stale pair is gone.
     ---------------------------------------------------------------------- */
  } else if(kind === 'CRUISER'){
    /* ---- A SHERIFF'S STAR -------------------------------------------------
       Seven points with balled tips, on a dark disc — the shape a highway
       patrol badge is, and unmistakable at eight pixels because nothing else
       on the road is a star. */
    g.fillStyle = 'rgba(10,14,22,.85)';
    g.beginPath(); g.arc(0,0,9.8,0,6.2832); g.fill();
    g.fillStyle = '#e8c45a';
    g.beginPath();
    for(let k=0;k<14;k++){
      const a = -Math.PI/2 + k*Math.PI/7, r = (k%2===0) ? 8.4 : 3.6;
      const x = Math.cos(a)*r, y = Math.sin(a)*r;
      k ? g.lineTo(x,y) : g.moveTo(x,y);
    }
    g.closePath(); g.fill();
    /* the balls on the points */
    g.fillStyle = '#f3dc92';
    for(let k=0;k<7;k++){
      const a = -Math.PI/2 + k*2*Math.PI/7;
      g.beginPath(); g.arc(Math.cos(a)*8.4, Math.sin(a)*8.4, 1.5, 0, 6.2832); g.fill();
    }
    g.fillStyle = 'rgba(10,14,22,.85)';
    g.beginPath(); g.arc(0,0,3.0,0,6.2832); g.fill();
  } else if(kind === 'GENERIC'){
    /* ---- AN ORDINARY CAR'S BADGE ------------------------------------------
       Every civilian vehicle carries one, and it must NOT look like a marque:
       a plain chrome oval with a bar across it, the shape a manufacturer's
       roundel is when you cannot read it from three lanes away. */
    g.fillStyle = 'rgba(12,14,18,.75)';
    g.beginPath(); g.ellipse(0,0,9.0,6.2,0,0,6.2832); g.fill();
    g.fillStyle = '#b9c1cb';
    g.beginPath(); g.ellipse(0,0,7.6,5.0,0,0,6.2832); g.fill();
    g.fillStyle = 'rgba(30,36,44,.85)';
    g.fillRect(-7.6,-1.0,15.2,2.0);
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.ellipse(-1.8,-2.0,4.2,1.8,0,0,6.2832); g.fill();
  } else if(kind === 'ROADSTER'){
    /* ---- THE ROADSTER'S MARK --------------------------------------------
       A pair of wings around a small disc — the oldest badge idiom there is,
       and the right one for the lightest car in the league. Silver on a dark
       ground, so it reads as chrome rather than as a colour. */
    g.fillStyle = '#0f1116';
    g.beginPath(); g.ellipse(0,0,10.2,6.4,0,0,6.2832); g.fill();
    g.fillStyle = '#cfd6de';
    for(const sx of [-1,1]){
      g.beginPath();
      g.moveTo(sx*2.6, -1.8);
      g.lineTo(sx*9.4, -3.4);
      g.lineTo(sx*9.4, -0.6);
      g.lineTo(sx*2.6,  1.0);
      g.closePath(); g.fill();
      g.beginPath();
      g.moveTo(sx*2.6, 1.4);
      g.lineTo(sx*7.8, 1.0);
      g.lineTo(sx*7.8, 3.2);
      g.lineTo(sx*2.6, 3.0);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#e8eef5';
    g.beginPath(); g.arc(0,0,3.0,0,6.2832); g.fill();
    g.fillStyle = '#b0202c';
    g.beginPath(); g.arc(0,0,1.5,0,6.2832); g.fill();
  } else if(kind === 'TUNER'){
    /* ---- THE TUNER ------------------------------------------------------
       A disc, not a shield: a rising sun on a deep red ground, rays running
       out to the rim. Round because the car is a road car and its badge is a
       cap on a boss, not a crest. */
    g.fillStyle = '#d8dee6';
    g.beginPath(); g.arc(0,0,9.6,0,6.2832); g.fill();
    g.fillStyle = '#b8202c';
    g.beginPath(); g.arc(0,0,8.0,0,6.2832); g.fill();
    g.fillStyle = '#ffd9a0';
    for(let k=0;k<8;k++){
      const a = k/8*6.2832;
      g.beginPath();
      g.moveTo(0,0);
      g.lineTo(Math.cos(a-0.16)*8, Math.sin(a-0.16)*8);
      g.lineTo(Math.cos(a+0.16)*8, Math.sin(a+0.16)*8);
      g.closePath(); g.fill();
    }
    g.fillStyle = '#fff3d6';
    g.beginPath(); g.arc(0,0,3.2,0,6.2832); g.fill();
  } else if(kind === 'MUSCLE'){
    /* ---- THE MUSCLE CAR -------------------------------------------------
       A blunt chrome shield with a single star and two bars — the American
       idiom, and about as far from the tuner's disc as a badge can get. */
    g.fillStyle = '#0e1014';
    g.beginPath();
    g.moveTo(-9,-8); g.lineTo(9,-8); g.lineTo(9,3);
    g.quadraticCurveTo(9,9, 0,10.4);
    g.quadraticCurveTo(-9,9, -9,3);
    g.closePath(); g.fill();
    g.fillStyle = '#cfd6de';
    g.beginPath();
    g.moveTo(-7.2,-6.4); g.lineTo(7.2,-6.4); g.lineTo(7.2,2.6);
    g.quadraticCurveTo(7.2,7.4, 0,8.6);
    g.quadraticCurveTo(-7.2,7.4, -7.2,2.6);
    g.closePath(); g.fill();
    g.fillStyle = '#0e1014';
    g.fillRect(-7.2,-2.2,14.4,1.7); g.fillRect(-7.2,0.9,14.4,1.7);
    /* the star */
    g.fillStyle = '#b8202c';
    g.beginPath();
    for(let k=0;k<10;k++){
      const a = -Math.PI/2 + k*Math.PI/5, r = (k%2===0) ? 4.4 : 1.9;
      const x = Math.cos(a)*r, y = Math.sin(a)*r - 3.4;
      k ? g.lineTo(x,y) : g.moveTo(x,y);
    }
    g.closePath(); g.fill();
  } else if(kind === 'FORMULA'){
    /* ---- A GOLD LIGHTNING BOLT --------------------------------------------
       No shield, no diamond, no plate. The mark IS the bolt — a single struck
       shape, which is the only thing that survives at eight pixels on a nose.
       A thin dark edge keeps it readable on a white car. */
    g.fillStyle = 'rgba(20,16,8,.85)';
    g.beginPath();
    g.moveTo(2.6,-10.4); g.lineTo(-5.6,1.0); g.lineTo(-0.4,1.0);
    g.lineTo(-3.0,10.4); g.lineTo(6.0,-1.6); g.lineTo(0.6,-1.6);
    g.closePath(); g.fill();
    const bg3 = g.createLinearGradient(-6,-10,6,10);
    bg3.addColorStop(0,'#fff0a8'); bg3.addColorStop(0.45,'#e8b23a');
    bg3.addColorStop(1,'#9a6c12');
    g.fillStyle = bg3;
    g.beginPath();
    g.moveTo(2.2,-9.2); g.lineTo(-4.6,0.4); g.lineTo(0.2,0.4);
    g.lineTo(-2.4,9.2); g.lineTo(5.2,-1.0); g.lineTo(0.2,-1.0);
    g.closePath(); g.fill();
  } else {
    /* ROUND SILVER DISC, red quarters, a bold cross */
    g.fillStyle = '#c9ced8';
    g.beginPath(); g.arc(0,0,9.2,0,6.2832); g.fill();
    g.fillStyle = '#0e1014';
    g.beginPath(); g.arc(0,0,7.6,0,6.2832); g.fill();
    g.fillStyle = '#c8102e';
    g.beginPath(); g.moveTo(0,0); g.arc(0,0,7.6,-Math.PI/2,0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0,0); g.arc(0,0,7.6,Math.PI/2,Math.PI); g.closePath(); g.fill();
    g.fillStyle = '#c9ced8';
    g.fillRect(-8.0,-1.2,16.0,2.4);
    g.fillRect(-1.2,-8.0,2.4,16.0);
  }
  g.restore();
}


function drawWheel(){
  if(!wheelCx) return;
  if(document.body.classList.contains('no-touch')) return;
  if(document.body.classList.contains('hardware')) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if(dpr !== wheelDpr){ wheelDpr = dpr; wheelCv.width = 115*dpr; wheelCv.height = 115*dpr; }
  const g = wheelCx, R = 47, cx = 57.5, cy = 57.5;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,115,115);
  g.save();
  g.translate(cx, cy);
  /* 90 degrees at full lock — a quarter turn, which is what you actually do
     with your hands still on the rim. */
  g.rotate(clamp(steerTurn, -1, 1) * 1.5708);

  const MK = (BODY[optBody] && BODY[optBody].rear) || 'L';
  /* ONE rim for all three. Three shapes was a distinction nobody asked for and
     it made the wheel unfamiliar every time you changed car — the badge is
     what should tell you which one you are in. */
  /* the formula yoke is not a ring, so it must not be drawn on one */
  const TH = (MK === 'FORMULA') ? 13 : 9.5;
  /* ---- the rim ----------------------------------------------------------
     A flat-bottomed sports wheel: circular through the top and sides, cut off
     square along the bottom, with the corners squared off where the leather
     grips are. Drawn as a stroked path rather than a circle so the flat is
     real geometry rather than something painted over it.
     -------------------------------------------------------------------------- */
  /* ---- THE WHEEL FOLLOWS THE CLASS --------------------------------------
     Three classes, not "road cars and supercars":

       FORMULA     FORMULA              a yoke, no rim at the top
       SUPERCAR    STALLION, L, P        a flat-bottomed rim
       PRODUCTION  TUNER, M, C        a plain circular rim

     The cruiser is a production car with a light bar on it, so it takes the
     production wheel — it was getting the supercar's flat bottom. Pushing the
     flat almost to the rim radius leaves a ring, and the bottom bar and its arm
     are skipped with it. */
  /* ---- WHO GETS THE ROUND WHEEL ---------------------------------------
     The production cars and ALL the ordinary traffic: a plain circular rim
     with whatever badge that vehicle carries on the boss. Only the supercars
     keep the flat bottom and only the formula car has a yoke. */
  /* SUPERCRUISER is a MATADOR underneath — it keeps the supercar's
     flat-bottomed rim, not the patrol car's round one */
  const roundRim = (MK === 'TUNER' || MK === 'MUSCLE' || MK === 'CRUISER'
                 || MK === 'GENERIC' || MK === 'ROADSTER')
                 /* MK is the MARQUE, and the super cruiser wears the CRUISER's
                    — so testing MK could never exclude it. The BODY key is the
                    thing that identifies the car. My probe tested a REWRITE of
                    this line rather than calling it, so it reported
                    flat-bottom while the sheet drew round. */
                 && optBody !== 'SUPERCRUISER';
  const flatY = roundRim ? R*0.995 : R*0.62;
  const aFlat = Math.asin(flatY/R);
  function rimPath(){
    if(MK === 'FORMULA'){
      /* ---- A FORMULA WHEEL ----------------------------------------------
         From the reference: not a ring at all. A wide rectangular yoke with
         the whole top cut away, deep thumb cut-outs, and a screen in the
         middle where a road car has a boss. */
      const hw = R*0.98, ht = R*0.46, hb = R*0.62;
      g.beginPath();
      g.moveTo(-hw, -ht);
      g.lineTo(-R*0.34, -ht);
      g.lineTo(-R*0.34, -R*0.10);
      g.lineTo( R*0.34, -R*0.10);
      g.lineTo( R*0.34, -ht);
      g.lineTo( hw, -ht);
      g.lineTo( hw,  hb*0.55);
      g.quadraticCurveTo(hw, hb, R*0.52, hb);
      g.lineTo(-R*0.52, hb);
      g.quadraticCurveTo(-hw, hb, -hw, hb*0.55);
      g.closePath();
      return;
    }
    /* In canvas, increasing angle goes DOWN the screen — so sweeping from
       aFlat to PI-aFlat drew the BOTTOM semicircle, which is why the rim kept
       coming out as a smile under the boss. The top runs from PI-aFlat round
       through 3PI/2 to 2PI+aFlat. */
    g.beginPath();
    g.arc(0, 0, R, Math.PI - aFlat, Math.PI*2 + aFlat, false);
    g.closePath();
  }
  /* The leather body. It was being over-stroked in near-black afterwards,
     which erased it against a dark road — one stroke, light enough to read. */
  g.save();
  rimPath();
  g.lineWidth = TH; g.lineJoin = 'round'; g.lineCap = 'round';
  const leather = g.createLinearGradient(-R,-R,R,R);
  leather.addColorStop(0,'#5c626c'); leather.addColorStop(0.42,'#33373d');
  leather.addColorStop(0.62,'#42474f'); leather.addColorStop(1,'#23262b');
  g.strokeStyle = leather; g.stroke();
  /* a dark seam down the middle of the stock */
  g.lineWidth = TH*0.20; g.strokeStyle = 'rgba(0,0,0,.45)';
  rimPath(); g.stroke();
  g.restore();
  /* the weave, painted into the top third and the bottom bar */
  g.save();
  g.beginPath();
  if(MK === 'FORMULA'){
    /* the carbon weave was clipped to a circular ARC of the rim, which drew a
       ghost ring above the yoke on the one wheel that is not round. It clips
       to the yoke's own path instead. */
    rimPath();
  } else {
    g.arc(0,0,R+TH/2, Math.PI*1.18, Math.PI*1.82, false);
    g.arc(0,0,R-TH/2, Math.PI*1.82, Math.PI*1.18, true);
  }
  g.closePath();
  g.clip();
  g.fillStyle = '#26292f'; g.fillRect(-R-8,-R-8,(R+8)*2,(R+8)*2);
  g.strokeStyle = 'rgba(170,180,196,.40)'; g.lineWidth = 0.7;
  for(let k=-R*2;k<R*2;k+=3.2){
    g.beginPath(); g.moveTo(k,-R-8); g.lineTo(k+R*2, R+8); g.stroke();
  }
  g.strokeStyle = 'rgba(90,96,106,.30)';
  for(let k=-R*2;k<R*2;k+=3.2){
    g.beginPath(); g.moveTo(k, R+8); g.lineTo(k+R*2, -R-8); g.stroke();
  }
  g.restore();
  /* ---- the flat bottom --------------------------------------------------
     Was a full-width slab: the weave filled a clip RECTANGLE rather than the
     rim itself, so it ran out past the stock at both ends and read as a bar
     bolted underneath. It is now a rounded bar the same thickness as the rim,
     inset to meet the leather where the corners are, with the weave clipped to
     that shape — so the flat is part of the wheel rather than sitting on it.
     -------------------------------------------------------------------------- */
  const barX = R*Math.cos(aFlat) - TH*0.16;
  if(!roundRim){
  g.save();
  g.beginPath();
  g.roundRect(-barX, flatY - TH/2, barX*2, TH, TH/2);
  g.clip();
  g.fillStyle = '#26292f'; g.fillRect(-R-8, flatY-TH, R*2+16, TH*2);
  g.strokeStyle = 'rgba(170,180,196,.34)'; g.lineWidth = 0.7;
  for(let k=-barX*2;k<barX*2;k+=3.2){
    g.beginPath(); g.moveTo(k, flatY-TH); g.lineTo(k+TH*2, flatY+TH); g.stroke();
    g.beginPath(); g.moveTo(k, flatY+TH); g.lineTo(k+TH*2, flatY-TH); g.stroke();
  }
  /* the same lit top edge the rest of the stock has */
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = TH*0.26;
  g.beginPath(); g.moveTo(-barX, flatY-TH*0.30); g.lineTo(barX, flatY-TH*0.30); g.stroke();
  g.restore();
  }

  /* the twelve-o'clock stripe — a formula yoke has no top to put one on, and
     it was left floating in the gap */
  /* the guard has to wrap the DRAW, not the style line before it — an if with
     no braces takes only the next statement, so the tick still drew */
  if(MK !== 'FORMULA'){
    g.strokeStyle = '#e8ecf2'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(0, -R-TH/2+0.5); g.lineTo(0, -R+TH/2-0.5); g.stroke();
  }

  /* rim highlight and shadow, so it reads as round stock */
  g.save();
  rimPath(); g.lineWidth = TH*0.30;
  g.strokeStyle = 'rgba(255,255,255,.13)';
  g.setLineDash([]); g.stroke();
  g.restore();

  /* ---- the spokes -------------------------------------------------------
     Two horizontal arms at nine and three with a silver bezel round the
     switchgear, and a single bottom arm with a chrome insert. */
  const armW = R*0.72, armH = 9.5, armY = 2;
  for(const sx of [-1, 1]){
    g.save();
    g.translate(sx*(R*0.34), armY);
    g.fillStyle = '#1d2025';
    g.beginPath(); g.roundRect(-armW/2, -armH/2, armW, armH, 3); g.fill();
    /* the silver surround */
    g.strokeStyle = 'rgba(196,203,214,.85)'; g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(-armW/2+1.2, -armH/2+1.2, armW-2.4, armH-2.4, 2.4);
    g.stroke();
    /* two switch blocks */
    g.fillStyle = '#0e1013';
    g.fillRect(-armW/2+3.5, -armH/2+2.6, armW*0.30, armH-5.2);
    g.fillRect( armW/2-3.5-armW*0.30, -armH/2+2.6, armW*0.30, armH-5.2);
    g.restore();
  }
  /* the bottom arm — a round wheel has three spokes, not a stalk to a flat */
  if(!roundRim){
  g.fillStyle = '#1d2025';
  g.beginPath(); g.roundRect(-6, 8, 12, flatY-4, 3); g.fill();
  g.fillStyle = 'rgba(196,203,214,.9)';
  g.beginPath(); g.roundRect(-4, 12, 8, flatY-9, 2); g.fill();
  g.fillStyle = '#0e1013';
  g.fillRect(-1.2, 14, 2.4, flatY-13);
  } else {
    /* ---- the V POINTS DOWN ---------------------------------------------
       The bar is drawn from the boss DOWNWARD, so rotating it by 130° and 50°
       swung it up and over the top — the V was inverted. ±0.52 rad splays the
       two spokes down and out to five and seven o'clock, which is where a
       three-spoke road wheel puts them. */
    for(const a of [-0.52, 0.52]){
      g.save(); g.rotate(a);
      g.fillStyle = '#1d2025';
      g.beginPath(); g.roundRect(-5, 8, 10, R-16, 3); g.fill();
      g.fillStyle = 'rgba(196,203,214,.9)';
      g.beginPath(); g.roundRect(-3.4, 11, 6.8, R-21, 2); g.fill();
      g.restore();
    }
  }

  /* ---- the boss ---------------------------------------------------------- */
  const bR = 21;
  const boss = g.createRadialGradient(-bR*0.3, -bR*0.35, 1, 0, 0, bR);
  boss.addColorStop(0,'#3a3e45'); boss.addColorStop(0.55,'#1e2126'); boss.addColorStop(1,'#0d0f12');
  g.fillStyle = boss;
  g.beginPath(); g.arc(0,0,bR,0,6.2832); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 1;
  if(MK !== 'FORMULA'){ g.beginPath(); g.arc(0,0,bR-0.5,0,6.2832); g.stroke(); }

  /* THE CAR'S OWN BADGE. A hard-coded horse lived here, drawn after the
     marque call, so every car wore the same emblem however the marque table
     was changed — which is why three different badges kept rendering
     identically. One call, and the badge belongs to the car. */
  drawMarque(g, MK, 0, 0, 12);

  g.restore();

  g.restore();
}

const dialCv = document.getElementById('gauges');
const dialCx = dialCv ? dialCv.getContext('2d') : null;
const knobEl    = document.getElementById('knob');
/* left/top of each slot inside the 118x132 plate */
/* three rails at x = 5, 27, 49; up and down on each */
/* Two rails at x = 15 and 51, joined by a cross rail at y = 33. You cannot go
   straight from 1 to 3 — you come back through the centre and across, which is
   what makes it an H rather than four buttons. */
const RAIL_X = [8, 31, 54];
const TOP_Y = 4, MID_Y = 33, BOT_Y = 62;
const SLOTS = [
  { g:1, rail:0, y:TOP_Y }, { g:2, rail:0, y:BOT_Y },
  { g:3, rail:1, y:TOP_Y }, { g:4, rail:1, y:BOT_Y },
  { g:5, rail:2, y:TOP_Y }, { g:6, rail:2, y:BOT_Y }
];
/* where the knob physically sits — a position in the gate, not a gear */
let knobRail = 0, knobY = TOP_Y;
/* Dropping into a lower gear cannot leave you doing more than that gear can
   physically turn — the engine hauls the car down to it at once, which is what
   engine braking IS, and the needle jumps to the top of the new band with it. */
function engineBrake(){
  if(!optManual) return;
  if(gear < 1 || gear > gearTable().length) return;
  const cap = MAX_SPD * gearTable()[gear-1].to;
  if(spd > cap) spd = cap;
}

function placeKnob(){
  knobEl.style.left = RAIL_X[knobRail] + 'px';
  knobEl.style.top  = knobY + 'px';
  const sl = SLOTS.find(s2 => s2.rail === knobRail && s2.y === knobY);
  gear = sl ? sl.g : 0;                       /* mid-rail is NEUTRAL */
  knobEl.querySelector('b').textContent = sl ? sl.g : 'N';
  knobEl.dataset.gear = gear;
}
/* one step through the gate. Up and down run the rail; left and right only
   work from the centre, which is what makes it an H rather than a grid. */
function shiftStep(dx, dy){
  const before = knobRail + ':' + knobY;
  if(dy < 0) knobY = knobY === BOT_Y ? MID_Y : TOP_Y;
  else if(dy > 0) knobY = knobY === TOP_Y ? MID_Y : BOT_Y;
  else if(dx && knobY === MID_Y)
    knobRail = clamp(knobRail + (dx > 0 ? 1 : -1), 0, RAIL_X.length - 1);
  if(before !== knobRail + ':' + knobY){ placeKnob(); snd.shift(); engineBrake(); }
}
let knobDrag = false;
knobEl.addEventListener('pointerdown', e => {
  if(!optManual) return;
  e.preventDefault(); e.stopPropagation();
  knobEl.setPointerCapture(e.pointerId);
  knobDrag = true; knobEl.classList.add('grab');
});
knobEl.addEventListener('pointermove', e => {
  if(!knobDrag) return;
  const r = shifterEl.getBoundingClientRect();
  const x = e.clientX - r.left - 14;
  const y = e.clientY - r.top  - 14;
  /* The thumb proposes; the GATE disposes. Off the centre rail you can only
     move along your own rail, so 1 to 3 has to go through neutral. */
  const wantY = y < (TOP_Y+MID_Y)/2 ? TOP_Y : y > (MID_Y+BOT_Y)/2 ? BOT_Y : MID_Y;
  if(wantY !== knobY){
    /* never skip the centre: step one notch at a time */
    if(knobY === TOP_Y && wantY === BOT_Y) knobY = MID_Y;
    else if(knobY === BOT_Y && wantY === TOP_Y) knobY = MID_Y;
    else knobY = wantY;
    placeKnob(); snd.shift(); engineBrake();
    return;
  }
  if(knobY === MID_Y){
    /* nearest of the three rails, not a two-way split */
    let wantRail = 0, bd = 1e9;
    for(let i2=0;i2<RAIL_X.length;i2++){
      const d2 = Math.abs(RAIL_X[i2] - x);
      if(d2 < bd){ bd = d2; wantRail = i2; }
    }
    if(wantRail !== knobRail){ knobRail = wantRail; placeKnob(); snd.shift(); engineBrake(); }
  }
});
function dropKnob(e){
  if(!knobDrag) return;
  knobDrag = false; knobEl.classList.remove('grab');
  placeKnob(); engineBrake();
}
knobEl.addEventListener('pointerup', dropKnob);
knobEl.addEventListener('pointercancel', dropKnob);
/* Arrow keys walk the knob through the gate, same as a thumb would. They are
   the shifter only while the manual box is on, so steering is unaffected
   otherwise. */
/* any real key press, not only the steering ones */
window.addEventListener('keydown', () => setInputSource(true), true);
/* a pad appearing is hardware even before it is touched */
window.addEventListener('gamepadconnected', () => setInputSource(true));

window.addEventListener('keydown', e => {
  if(!optManual || state !== 'driving') return;
  if(e.key === 'i' || e.key === 'I'){ e.preventDefault(); shiftStep(0,-1); }
  if(e.key === 'k' || e.key === 'K'){ e.preventDefault(); shiftStep(0, 1); }
  if(e.key === 'j' || e.key === 'J'){ e.preventDefault(); shiftStep(-1,0); }
  if(e.key === 'l' || e.key === 'L'){ e.preventDefault(); shiftStep( 1,0); }
});
/* gamepad: the RIGHT stick walks the gate, one notch per push */
let rsLatch = false;
setInterval(() => {
  if(!optManual || state !== 'driving') return;
  if(!AR || !AR.pad || !AR.pad.connected || !AR.pad.connected()) return;
  const ax = AR.pad.axis ? AR.pad.axis() : null;
  if(!ax) return;
  const rx = ax.rx || 0, ry = ax.ry || 0;
  if(Math.abs(rx) < 0.55 && Math.abs(ry) < 0.55){ rsLatch = false; return; }
  if(rsLatch) return;
  rsLatch = true;
  if(Math.abs(ry) > Math.abs(rx)) shiftStep(0, ry > 0 ? 1 : -1);
  else shiftStep(rx > 0 ? 1 : -1, 0);
}, 60);

/* ---- the wheel follows the thumb ----------------------------------------
   Press anywhere in the left half below the horizon and the wheel MOVES to sit
   under your finger, then steers by how far you drag from that point. You
   never have to aim for it, and it is never where your thumb is not.
   -------------------------------------------------------------------------- */
if(wheelCv){
  /* A thumb sitting ON the wheel hides most of it. The wheel is placed a
     thumb's height ABOVE where you are touching, so your hand is below the
     rim and you can actually watch it turn. */
  /* 62 put the rim well clear of the hand but too far up the glass — it read
     as a separate object rather than the thing under your thumb. Half that is
     enough to see the rim turn without losing the connection. */
  const THUMB = 32;
  const placeWheel = (cx, cy) => {
    wheelCv.style.left = Math.round(cx - 57.5) + 'px';
    wheelCv.style.bottom = Math.round(window.innerHeight - cy - 57.5 + THUMB) + 'px';
  };
  const grabStart = (e) => {
    if(document.body.classList.contains('no-touch')) return;
    if(optTouchUI === 'OFF') return;
    /* a thumb on the glass means we are back on touch */
    if(e.pointerType === 'touch' || e.pointerType === 'pen') setInputSource(false);
    /* the wheel's half of the screen, clear of the pedals and the dials */
    if(e.clientX > window.innerWidth * 0.52) return;
    if(e.clientY < window.innerHeight * 0.42) return;
    if(e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    wheelGrab = { id:e.pointerId, x:e.clientX, y:e.clientY };
    document.body.classList.add('wheeling');
    wheelCv.style.transition = 'opacity .12s ease-out';
    placeWheel(e.clientX, e.clientY);
  };
  const grabMove = (e) => {
    if(!wheelGrab || e.pointerId !== wheelGrab.id) return;
    const dx = e.clientX - wheelGrab.x;
    /* no roll, no steering — the same rule the rest of the car obeys */
    const grip = clamp(spd / (MAX_SPD*0.07), 0, 1);
    targetX = clamp(targetX + (dx * grip) / (W*0.26), -1.18, 1.18);
    /* the wheel is NOT driven from here — see stepWheel(). Winding it from
       the finger meant it kept turning after the car had hit the edge of the
       road and stopped responding. */
    wheelGrab.x = e.clientX; wheelGrab.y = e.clientY;
    placeWheel(e.clientX, e.clientY);
  };
  const grabEnd = (e) => {
    if(!wheelGrab || e.pointerId !== wheelGrab.id) return;
    wheelGrab = null;
    document.body.classList.remove('wheeling');
    /* let it drift back to its corner rather than snapping */
    wheelCv.style.transition = 'left .28s ease-out, bottom .28s ease-out';
    wheelCv.style.left = '';
    wheelCv.style.bottom = '';
  };
  window.addEventListener('pointerdown', grabStart, { passive:false });
  window.addEventListener('pointermove', grabMove);
  window.addEventListener('pointerup', grabEnd);
  window.addEventListener('pointercancel', grabEnd);
}

hornBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); setHorn(true); });
hornBtn.addEventListener('pointerup',     ()=>setHorn(false));
hornBtn.addEventListener('pointerleave',  ()=>setHorn(false));
hornBtn.addEventListener('pointercancel', ()=>setHorn(false));

gasBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); setGas(true); });
gasBtn.addEventListener('pointerup',     ()=>setGas(false));
gasBtn.addEventListener('pointerleave',  ()=>setGas(false));
gasBtn.addEventListener('pointercancel', ()=>setGas(false));

brakeBtn.addEventListener('pointerdown', e=>{ e.preventDefault(); setBrake(true); });
brakeBtn.addEventListener('pointerup',     ()=>setBrake(false));
brakeBtn.addEventListener('pointerleave',  ()=>setBrake(false));
brakeBtn.addEventListener('pointercancel', ()=>setBrake(false));
window.addEventListener('keydown', e=>{
  if(e.key === 'ArrowDown' || e.key === 's' || e.key === 'S'){ e.preventDefault(); setBrake(true); }
  if(e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W'){ e.preventDefault(); setGas(true); }
  if(e.key === 'h' || e.key === 'H'){ e.preventDefault(); setHorn(true); }
});
window.addEventListener('keyup', e=>{
  if(e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setBrake(false);
  if(e.key === 'ArrowUp'   || e.key === 'w' || e.key === 'W') setGas(false);
  if(e.key === 'h' || e.key === 'H') setHorn(false);
});

window.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight',' ','Shift'].includes(e.key)) e.preventDefault();
  keys[e.key]=true;
  if((e.key===' '||e.key==='Shift') && hasNos() && nos>8){ nosOn=true; setGas(true); }
  if(e.key==='Enter'&&state!=='driving'){ const b=veilBody.querySelector('.go'); if(b) b.click(); }
});
window.addEventListener('keyup',e=>{
  keys[e.key]=false;
  if(e.key===' '||e.key==='Shift') nosOn=false;
});

if(AR && AR.pad) AR.pad.onPress(name=>{
  if (AR.paused && AR.paused()) return;
  if(state==='driving') return;
  if(name==='a'||name==='start'||name==='x'){
    const b = veilBody.querySelector('.go');
    if(b) b.click();
  }
});

/* ---------- simulation ---------- */
function step(dt){
  // --- steering ---
  let kd=0;
  if(keys.ArrowLeft||keys.a) kd-=1;
  if(keys.ArrowRight||keys.d) kd+=1;
  const pax = AR && AR.pad ? AR.pad.axis().x : 0;
  if(pax){ kd = pax; setInputSource(true); }
  else if(AR && AR.pad){
    if(AR.pad.down('left'))  kd = -1;
    if(AR.pad.down('right')) kd =  1;
  }
  /* keyboard steering obeys the same rule: no roll, no steering */
  if(kd){
    setInputSource(true);
    targetX = clamp(targetX + kd*2.1*dt*clamp(spd/(MAX_SPD*0.07),0,1), -1.18, 1.18);
  }

  // right trigger / A holds the nitrous down
  if(AR && AR.pad && (AR.pad.down('rt') || AR.pad.down('a'))){
    if(hasNos() && nos > 8 && !nosOn){ nosOn = true; snd.nitro(); }
  } else if(padNos){ nosOn = false; }
  padNos = AR && AR.pad ? (AR.pad.down('rt') || AR.pad.down('a')) : false;
  /* The car reaches its mark faster and the cap on lateral speed is higher, so
     a lane change lands when you ask for it rather than a beat later. */
  /* ---- IT DOES NOT STOP SIDEWAYS ON ICE --------------------------------
     Lateral position converged on the target however wet the road was, so
     rain and snow changed the cornering force and nothing about the STEERING.
     A car on a slick surface keeps going the way it was going — you fight the
     slide rather than placing the car.

     `slideX` carries lateral velocity forward. Dry, it is thrown away every
     frame and the handling is exactly what it was. Wet, some of it survives;
     in snow, most of it does — which is why snow is a curve and not a
     dimmer version of rain.
     ------------------------------------------------------------------- */
  const slick = 1 - wetGrip();
  const carry = Math.min(0.86, slick * (snowy > 0.5 ? 2.6 : 1.5));
  const grip = (1 - Math.exp(-14*dt)) * (1 - carry*0.72);
  const want2 = clamp((targetX-playerX)*grip, -4.2*dt, 4.2*dt);
  slideX = slideX * carry + want2;
  playerX += slideX;
  /* a wall does not care how slippery it is */
  if(playerX < -1.18 || playerX > 1.18) slideX = 0;
  playerX = clamp(playerX, -1.18, 1.18);
  camX = lerp(camX, playerX, 1-Math.exp(-14*dt));
  camX = clamp(camX, playerX-0.10, playerX+0.10);

  // --- speed ---
  const prevSpd = spd;
  const offRoad = Math.abs(playerX) > 1.0;
  if(nosOn && nos>0){ nos = Math.max(0, nos - 26*dt); if(nos<=0) nosOn=false; }
  else nosOn=false;
  /* Off the gas the car is in neutral: it does not hold a speed, it rolls.
     Engine braking and rolling resistance bleed it off slowly — much gentler
     than the brake, so lifting is a real choice rather than a soft brake. */
  /* in neutral the throttle is connected to nothing, so it coasts however
     hard you press */
  const inNeutral = optManual && (gear < 1 || gear > gearTable().length);
  /* out of time: the throttle stops answering, but you keep what you have */
  const onGas = (gas || nosOn) && !inNeutral && (!clockRuns() || clock > 0);
  /* THE COAST EXPLOIT: boost to well past MAX_SPD, then lift, and the car
     coasted down from 19,200 at the gentle neutral rate — so laying off the
     throttle was FASTER than using it. Above the natural top speed the car
     now sheds back to it quickly whatever the pedals are doing; only below
     that does neutral coast gently. */
  const overRun = spd > MAX_SPD * bodyStat('vmax') && !nosOn;
  /* ---- THE GEAR IS A SPEED LIMIT ----------------------------------------
     This was the whole problem: `top` was MAX_SPD in every gear, so first
     would happily pull you to 180mph and the box was just an acceleration
     modifier. A gear physically cannot exceed its ratio times the redline.
     First now tops out at 24% of MAX_SPD, second 46%, third 72%, fourth all
     of it — so you MUST shift to go faster, which is what a gearbox is.
     -------------------------------------------------------------------------- */
  /* the car's own top end, and the gear's ceiling within it */
  const carTop = MAX_SPD * bodyStat('vmax');
  const gearCap = (optManual && gear >= 1 && gear <= gearTable().length)
                ? carTop * gearTable()[gear-1].to
                : carTop;
  /* ---- SLIPSTREAM --------------------------------------------------------
     Sitting in the wake of the car ahead should be worth something. It is the
     one overtaking mechanic a road game gets for free: you must choose between
     the clean air of an empty lane and the tow you only get by tucking in
     behind something.

     The rules are deliberately tight, so it rewards commitment rather than
     just being near traffic:

       - directly behind, same lane, within 3,600 units — about three car
         lengths at speed
       - only above 55% of top: there is no meaningful wake at 40mph
       - it FADES with distance, strongest right on the bumper
       - a bigger vehicle punches a bigger hole, so a lorry tows harder than
         a coupe

     Worth up to 9% on top speed, which is enough to complete a pass you could
     not otherwise make and not enough to be a free ride.
     ---------------------------------------------------------------------- */
  let tow = 0;
  if(spd > MAX_SPD * 0.55){
    /* `pz` is not declared until much further down this function, so the tow
       computes its own — it is the same expression, and taking the value early
       is cheaper than moving three hundred lines */
    const myZ = pos + PLAYER_Z;
    const all = traffic.concat(racers || []);
    for(const c of all){
      if(c.wreck > 0) continue;
      const gap = c.z - myZ;
      if(gap < 200 || gap > 3600) continue;              /* must be AHEAD */
      /* TIGHTER. 0.34 is most of a lane, so weaving past traffic kept
         clipping the tow and the car surged for no reason the player could
         see. 0.20 means you have to actually be behind it. */
      if(Math.abs((c.x || 0) - playerX) > 0.20) continue;
      const near = 1 - (gap - 200) / 3400;
      const size = (c.type === 'truck') ? 1.35
                 : (c.type === 'van' || c.type === 'pickup') ? 1.12 : 1;
      tow = Math.max(tow, near * size);
    }
  }
  slipT = tow;                        /* the HUD and the wind read this */
  /* 9% was enough to feel like a boost rather than a tow. 4.5% completes a
     pass you were already close to and does nothing on its own. */
  const slip = 1 + Math.min(0.045, tow * 0.045);

  const top = braking ? BRAKE_SPD
            : overRun ? MAX_SPD * bodyStat('vmax')
            : !onGas  ? 0
            : (offRoad ? OFF_SPD
               /* ---- NITROUS IS POWER, NOT A HIGHER CEILING ---------------
                  I had it raising top speed, which is wrong: more oxygen means
                  more power in the gear you are in, so you climb the rev bands
                  faster and reach the SAME ceiling sooner. What sets top speed
                  is aero drag, and a bottle does nothing about that.

                  So NOS is out of this expression entirely — it lives in the
                  acceleration rate below, at 2.6x. The car's own `vmax` is the
                  only thing that decides how fast it will ultimately go. */
               : nosOn  ? carTop
               : Math.min(carTop * slip, gearCap * slip));
  /* ---- BRAKING IS A STAT NOW -------------------------------------------
     It was a flat 9000 for every vehicle — a lorry stopped as hard as a formula
     car. On a straight road nobody noticed; on a circuit, braking is half the
     lap. Research is unambiguous that a hairpin "is a real test of a car's
     braking capabilities", and it is the axis that separates a racing car from
     a road car most sharply.

     `brake` multiplies the base rate, so 1.0 is what every car used to have. */
  const rate = braking ? 9000 * bodyStat('brake') * wetBrake()
             : overRun ? 5200         /* aero drag above the limiter is brutal */
             : !onGas ? 420           /* neutral: it rolls, it does not stop */
             /* It felt sluggish because the base rate FELL as you gained speed
                (5200 then 3000) at the same time as the gear ratio was cutting
                pull — two penalties stacking. A sports car in a low gear snaps
                to its limiter. The rate is now high and flat, and the gear cap
                is what stops you rather than the engine going soft. */
             /* 0-200 in two and a half seconds was a rocket, not a car. About
                a third of the rate puts it in the eight-to-ten second range,
                which is quick for a road car and still an arcade cheat. */
             /* the bottle is worth using now: better than double the shove,
                where before it was a 23% bump nobody could feel */
             /* ---- REAL ACCELERATION ---------------------------------------
                2850 put every car through 60mph in under a second, which is
                why the stat card needed a fudge factor to look sane. 1000 is
                the number that makes the HONEST figure the printed one: a
                supercar in the mid-twos, a muscle car in the mid-fours.

                NOS scales with it and keeps its edge — 2.6x the base shove
                rather than 2.5x, so the bottle is still worth the button. */
             : spd < top ? (nosOn ? 2600 : 1000) * gearFactor() * bodyStat('pull')
             : (offRoad ? 11000 : 2400);
  /* Approach the target without crossing it. It used to add or subtract a
     fixed step, so on the brakes the car overshot the floor and juddered
     +-150 units every frame forever — invisible on a rounded mph readout, but
     it meant the car was genuinely decelerating half the time and the screech
     never stopped. */
  const spdWas = spd;
  spd += clamp(top - spd, -rate*dt, rate*dt);
  /* your own brake light, on the same hysteresis every other car uses */
  if((spdWas - spd) / Math.max(dt, 1/240) > 900) brakeLamp = 0.30;
  else if(brakeLamp > 0) brakeLamp -= dt;
  /* coming to rest with the clock out is the end of the run */
  /* ---- OUT OF TIME ---------------------------------------------------
     This called `gameOver()`, which does not exist — the end-of-run screen
     is `showEnd(reason)`, reached through `wreck()`. So the clock ran out,
     the car coasted to a stop, and then nothing happened at all. The run
     simply sat there. */
  if(clockRuns() && clock <= 0 && spd < MAX_SPD*0.004 && state === 'driving'){
    state = 'wrecked';
    bestScore = Math.max(bestScore, Math.round(dist*10)/10);
    bestDist  = Math.max(bestDist, dist);
    if(AR && AR.save) AR.save.merge(GAME_ID, {
      best: bestScore, bestMi: +bestDist.toFixed(1), runs: runs,
      label: 'BEST ' + bestDist.toFixed(1) + ' MI'
    });
    snd.dead();
    menuMusic();
    setTimeout(() => showEnd('OUT OF TIME'), 500);
    return;
  }
  /* The floor was 1700 — about 22mph — so the car could never actually stop.
     It can now sit still, which is what a brake pedal is for. */
  /* the player's own rubber: hard steering at speed, or hard on the brakes */
  const pdx = playerX - (lastPX === undefined ? playerX : lastPX);
  lastPX = playerX;
  const pScrub = scrubOf(null, pdx, dt, spd, braking && spd > MAX_SPD*0.22);
  /* Laid BEHIND the car, not under it. At the car's own z the sprite covers
     its own rubber completely — the marks were there the whole time and
     hidden by the thing making them. Half a car back puts them on the tarmac
     below the bumper where you can actually see them. */
  if(pScrub > 0.05) layRubber(playerX, pos + PLAYER_Z - 340, pScrub, 0.265);
  stepRubber(dt);

  /* ---- A SIREN KEEPS ASKING ---------------------------------------------
     A horn is one request per press; a siren is a standing one. While the bar
     is on it clears the lane ahead at 90%, on the same cooldown the horn uses
     so it cannot be spammed into a wall of swerving cars. */
  if(barOn && inCruiser()) scatter(0.90);
  /* and every NPC cruiser does exactly the same from where IT is */
  for(const k of cops){
    if(k.wreck > 0) continue;
    if(k.z > pos - 400) scatter(0.90, k.z, k.x);
  }

  /* serving a wreck penalty: the world stops, the clock does not */
  if(wreckWait > 0){
    wreckWait -= dt;
    clock -= dt;
    if(clock <= 0){ clock = 0; }
    if(wreckWait <= 0) hasMoved = false;
    return;
  }

  if(state === 'driving') runSeconds += dt;
  stepBiome(dt);
  stepWeather(dt);
  if(CFG.onStep) CFG.onStep(dt);

  /* ---- THE AI BRINGS IT HOME -----------------------------------------
     Not a full driver — it does not need to be. It centres the car, keeps it
     off the barriers and lets the speed bleed away, which is exactly what a
     driver does on a slowing-down lap. */
  if(coasting && state === 'driving'){
    targetX += (0 - targetX) * Math.min(1, dt * 1.6);
    spd = Math.max(0, spd - 2600 * dt);
  }

  /* ---- the clock ------------------------------------------------------ */
  if(!finished && clockRuns()){
    clock -= dt;
    /* the last five seconds each get a beep */
    const whole = Math.ceil(clock);
    /* zero gets its own beep, so the run does not simply stop in silence */
    if(whole <= 5 && whole !== lastBeep && whole >= 0){ lastBeep = whole; snd.tick(whole); }
    if(clock < 0) clock = 0;
  }
  /* a gantry every CP_MILES, placed a little way ahead as you approach */
  while(nextCP * CP_MILES * MILE < pos + 90000){
    const cz = nextCP * CP_MILES * MILE;
    /* ---- the last board is the FINISH, not a checkpoint --------------------
       A race ending at 12 miles had a CHECKPOINT gantry sitting on the line,
       which is the wrong sign at the one place it matters. In a race nothing
       is placed at or beyond the finish, and the finish gets its own board. */
    if(mode === 'race' && cz >= finishZ - 200){ nextCP++; continue; }
    if(timedRun) cpGantries.push({ z: cz, hit:false, n:nextCP });
    nextCP++;
  }
  for(const cp of cpGantries){
    if(!cp.hit && pos + PLAYER_Z > cp.z){
      cp.hit = true;
      clock += CLOCK_BONUS;
      lastBeep = -1;
      snd.checkpoint();
      flashWarn('CHECKPOINT  +' + CLOCK_BONUS);
    }
  }
  cpGantries = cpGantries.filter(cp => cp.z > pos - 8000);

  /* patience comes back, slowly */
  for(const c of traffic)
    if(c.heed !== undefined && c.heed < 1) c.heed = Math.min(1, c.heed + dt*0.14);

  /* ---- THE CRUISER IS EARNED BY SURVIVING --------------------------------
     Twenty miles on TEST DRIVE with the clock running AND the cops on. Not a
     race — the tournament rewards winning, and this rewards lasting. All three
     conditions matter: without the clock there is no pressure, and without
     pursuit there is nothing to survive. */
  /* a hundred miles on TEST DRIVE, whatever the settings, opens the traffic */
  if(mode !== 'race' && dist >= 100 && !unlocked('traffic')){
    if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { traffic:true });
    wonTraffic = true;
    snd.checkpoint();
    flashWarn('TRAFFIC UNLOCKED');
  }
  /* ---- THE SUPER CRUISER IS EARNED HARDER ------------------------------
     The cruiser asks for 20 miles on the clock under pursuit. The SUPER
     cruiser asks for the same twenty miles at a **180mph average** — not a
     peak, an average, so it cannot be done by sprinting and coasting.
     ------------------------------------------------------------------- */
  if(mode !== 'race' && timedRun && !optEasy && dist >= 20 && !unlocked('supercruiser')){
    const avg = dist / Math.max(0.0001, (runSeconds / 3600));
    if(avg >= 180){
      if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { supercruiser:true });
      wonCruiser = true; snd.checkpoint(); flashWarn('INTERCEPTOR UNLOCKED');
    }
  }
  if(mode !== 'race' && timedRun && !optEasy && dist >= 20 && !unlocked('cruiser')){
    if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { cruiser:true });
    /* flagged now, SHOWN when the run ends — a reward screen mid-run would be
       taking the wheel away from you at 190mph */
    wonCruiser = true;
    snd.checkpoint();
    flashWarn('CRUISER UNLOCKED');
  }

  updateViewShift();
  /* the road only needs re-integrating as you consume it, not every frame */
  bendT -= dt;
  if(bendT <= 0){ bendT = 0.25; rebuildBend(); }

  /* ---- the bend PUSHES you ----------------------------------------------
     If the road bends and everything on it bends with you, there is nothing
     to do but hold the throttle. The corner has to cost something: the car is
     pushed toward the OUTSIDE of the turn, harder the faster you are going,
     so a hairpin at 200 has to be steered against or it puts you on the verge.
     That is the whole game on a curve.
     ------------------------------------------------------------------------ */
  /* ---- the push, smoothed --------------------------------------------
     `curvatureAt()` STEPS between segments, so the car was being shoved by a
     value that jumped from 0 to 5 in one frame — which is exactly the "mind of
     its own" feeling. The force is chased rather than read, so it builds as
     you enter a bend and bleeds off as you leave it, and it is a good deal
     gentler than the first guess.
     -------------------------------------------------------------------- */
  const kWant = curvatureAt(pos + PLAYER_Z);
  pushK += (kWant - pushK) * Math.min(1, dt * CORNER_LAG);
  if(Math.abs(pushK) > 0.02){
    /* Cornering load is curvature times velocity SQUARED — double the speed
       and a bend pulls four times as hard, which is why a corner you can take
       flat at 90 will put you on the grass at 180. `CORNER_G` is the only
       number here that is not physics: it is the feel dial. */
    const v = spd / MAX_SPD;
    /* MINUS. A positive curvature bends the road to the RIGHT, and inertia
       carries you to the OUTSIDE of that — which is left. Adding it pushed the
       car around the corner with the road, so a bend helped you instead of
       costing you, and the car appeared to steer itself into the turn. */
    targetX = clamp(targetX - pushK * v * v * dt * cornerG(), -1.30, 1.30);
  }
  stepWheel(dt);
  /* ---- the bottle refills itself -----------------------------------------
     Crates were the only way to get nitrous back, which meant scoring points
     to earn a boost. Points are gone; the bottle now trickles back on its own
     so the decision is WHEN to spend it rather than whether you found a box.
     A full bottle from empty takes a little over a minute and a half.
     -------------------------------------------------------------------------- */
  if(!nosOn && nos < 100) nos = Math.min(100, nos + dt * 1.1);

  if(hornCool > 0) hornCool -= dt;
  /* ---- traffic coming up behind ------------------------------------------
     Only once you have been slower than the flow for a while. A brief lift or
     a corner should not conjure a car out of nothing; sitting below the
     traffic's pace for two seconds should. `slowFor` accumulates while you are
     under the slowest cruising speed out there and resets the moment you are
     not, so it measures a genuine hold-up rather than an instant.
     -------------------------------------------------------------------------- */
  /* ---- AND NOT ON A CIRCUIT -----------------------------------------------
     `CFG.circuitOnly` switches off civilian traffic, police, roadblocks and
     crates - but the block below was outside that gate, so **slowing down on
     the circuit conjured civilian traffic up behind you**. Reported from play,
     and it is the only one of these spawners that was missed, because the
     others are all grouped together further down where the gate is obvious and
     this one sits up here with the speed logic.

     `CFG.circuitOnly` is read directly rather than through `roadFurniture`:
     that constant is declared further down this same function, so naming it
     here is a temporal dead zone and throws every frame.
     ------------------------------------------------------------------------ */
  const FLOW = MAX_SPD * 0.42;          /* the slowest thing on the road */
  if(spd < FLOW) slowFor += dt; else slowFor = 0;
  if(!CFG.circuitOnly && slowFor > 2){
    behindT -= dt;
    if(behindT <= 0){
      /* the further below the flow you are, the more of it arrives */
      const deficit = clamp(1 - spd/FLOW, 0, 1);
      behindT = 2.6 - deficit*1.7;
      if(traffic.length < 26) spawnBehind();
    }
  } else behindT = 0.4;
  if(autoHold > 0) autoHold -= dt;
  if(mode === 'race' && !finished) stepRacers(dt);
  if(!optManual) autoGear(dt);
  /* a gear that cannot pull makes the engine labour, which you hear */
  bogT = (optManual && onGas && gearFactor() < 0.4) ? Math.min(1, bogT + dt*3)
                                                    : Math.max(0, bogT - dt*3);
  /* the hard ceiling is the fastest thing any car can do on the bottle, not a
     flat 200 — this was the last reference to the constant I removed, and it
     threw every frame, which pinned the car at 31mph */
  spd = clamp(spd, 0, MAX_SPD * 1.30);
  if(offRoad){
    shake = Math.max(shake, 0.22);
    targetX = clamp(targetX, -1.18, 1.18);
    /* ---- THE VERGE COSTS TIME, NOT HEALTH ---------------------------------
       Scraping the barrier used to take 9 health, which made the edge of the
       road as dangerous as a car. It is not. Running wide is a mistake you pay
       for by losing the speed you were carrying and by fighting the wheel to
       get back on - and that is a complete punishment on its own, because in a
       game about distance against a clock, speed IS the currency.

       Damage is reserved for hitting something. A wall you are sliding along
       is not something you hit; it is somewhere you should not be.
       ---------------------------------------------------------------------- */
    if(Math.abs(playerX) > 1.15){
      playerX = Math.sign(playerX)*1.13;
      targetX = playerX*0.7;
      /* scrubbed hard and continuously, rather than in one hit - a barrier is
         something you drag along, and dragging along it should feel expensive
         every moment it lasts */
      spd *= Math.max(0, 1 - dt*1.9);
      shake = Math.max(shake, 0.34);
    }
  }

  pos += spd*dt;
  dist += spd*dt/1000 * 0.00777;
  runTopMph = Math.max(runTopMph, spd/MAX_SPD*200);     // ~ miles
  /* No score. The game is a drive, not a tally — distance is the only number
     worth keeping and the odometer already shows it. */

  // --- heat ---
  /* Heat exists only to summon cruisers and roadblocks. With them off it is a
     number that escalates and does nothing, and the HUD would still announce
     it — so the whole pursuit system stands down together. */
  if(!optEasy){
    heatT += dt;
    /* and the warning only means something when there is something to be
       heated about */
    if(heatT > 20 && heat < 5){ heatT=0; heat++; if(!optEasy) flashWarn('HEAT '+heat); }
  }
  nextCopT -= dt; nextBlockT -= dt; nextCrateT -= dt;
  /* ---- A CIRCUIT IS NOT A HIGHWAY --------------------------------------
     Motorsport was running Interstate's whole world — civilian traffic, police,
     roadblocks, repair crates — on top of its circuit. A closed track with a
     lorry on it is not a race, and it is why the game still felt like the
     highway with a map drawn on the corner.

     `CFG.circuitOnly` turns all of it off. What is left is the road, you, and
     the rivals.
     ------------------------------------------------------------------- */
  const roadFurniture = !CFG.circuitOnly;

  if(roadFurniture && nextCrateT <= 0){
    // parked on the shoulder, so taking one means leaving the road
    const side = Math.random() < 0.5 ? -1 : 1;
    crates.push({ z: pos + 30000, x: side * rnd(0.86, 1.02), got:false });
    nextCrateT = rnd(20, 34);
  }
  /* ---- TRAPS REPLACE THE HEAT SPAWN ------------------------------------
     Cops used to appear out of nowhere the moment heat rose. They are parked
     on the verge now and they catch whoever goes past too fast. The road
     always has a few; heat only decides how thickly they are laid.
     ------------------------------------------------------------------- */
  if(roadFurniture && !optEasy && nextCopT <= 0){
    const parked = cops.filter(k => k.trap).length;
    if(parked < Math.min(4, 2 + Math.floor(heat/2))) spawnTrap();
    nextCopT = Math.max(3.0, rnd(9, 16) - heat*0.8);
  }
  if(roadFurniture){ trapWatch(dt); superWatch(dt); }
  /* A roadblock across a bend is a wall you cannot see until you are in it,
     so they only go up on a stretch that is straight where it stands AND
     still straight a little further on. */
  if(!optEasy && nextBlockT<=0 && heat>=2 && isStraight(pos + 26000)){
    spawnRoadblock();
    nextBlockT = Math.max(8, rnd(30,44) - heat*2);
  }

  // --- traffic ---
  /* GUARDED. This is the only unbounded loop in the frame, and its step is
     `rnd(3400,6600) - heat*180` — at heat 19 that reaches zero and at heat 37
     it goes NEGATIVE, so nextWaveZ walks backwards and the condition can never
     be satisfied. The main thread then spins forever: every car stops, no
     input is read, and the tab is dead with no error logged anywhere. Heat
     climbs with pursuit, which is why it only ever bit with cops switched on.

     Two belts: the step can never be smaller than 900, and the loop cannot run
     more than 40 times in a frame whatever happens. */
  let waveGuard = 0;
  while(nextWaveZ < pos + 62000 && waveGuard++ < 40){
    if(roadFurniture) spawnWave(nextWaveZ);
    /* 900 was less than three car lengths. Even at full heat the road has to
       stay driveable — the floor is 3200, about eight lengths. */
    nextWaveZ += Math.max(3200, rnd(4600,8200) - heat*140);
  }
  const pz = pos + PLAYER_Z;

  /* a rogue does not sit behind you at your speed — it is going somewhere */
  for(const c of traffic)
    if(c.rogue && c.cruiseFloor === undefined) c.cruiseFloor = c.cruise;

  // --- traffic follows the car in front and queues at roadblocks ---
  keepLaneOpen(dt, pz);
  
  traffic.sort((a,b) => a.z - b.z);
  for(const c of traffic){
    const wasSpd = c.spd || 0;
    let want = c.cruise;

    // a barrier in this car's path: slow to a halt short of it
    for(const b of blocks){
      const dz = b.z - c.z;
      if(dz < -400 || dz > 9000) continue;
      let blocked = false;
      for(const p of b.parts){
        if(p.cop) continue;
        if(Math.abs(p.x - c.x) < (p.w + c.w)/2){ blocked = true; break; }
      }
      if(!blocked) continue;
      const room = dz - 900;                       // stop this far short
      want = Math.min(want, room <= 0 ? 0 : Math.min(c.cruise, room * 0.55));
    }

    // a slower car ahead in the same tyre tracks
    for(const o of traffic){
      if(o === c) continue;
      const dz = o.z - c.z;
      if(dz <= 0 || dz > 5000) continue;
      if(Math.abs(o.x - c.x) > (o.w + c.w)/2 + 0.03) continue;
      const gap = dz - (o.len + o.len)/2;
      if(gap > 2200) continue;
      want = Math.min(want, gap < 420 ? 0 : o.spd + gap * 0.35);
    }

    /* ---- AND BEHIND YOU ---------------------------------------------------
       This loop only ever looked at other TRAFFIC, so a car came up behind a
       slow or stopped player and drove straight through them. You are a car on
       the road like any other: same rule, same distances.
       ------------------------------------------------------------------- */
    {
      const dzP = (pos + PLAYER_Z) - c.z;
      if(dzP > 0 && dzP < 5000 && Math.abs(playerX - c.x) < (0.26 + c.w)/2 + 0.03){
        const gapP = dzP - (c.len + 380)/2;
        if(gapP < 2200)
          want = Math.min(want, gapP < 420 ? 0 : spd + gapP * 0.35);
      }
    }

    /* ---- AND IT CAN GO ROUND, WHICH IS THE WHOLE POINT --------------------
       Everything above this is a car reading the road and SLOWING for it. That
       was the entire repertoire: a civilian queued behind a slower car forever
       and the motorway silted up into rolling walls, because nothing on it
       ever considered the lane beside it.

       A merge is a decision, not a drift. It is made once, committed to, and
       carried out over a second or so - which is why it lives in state on the
       car rather than being re-derived every frame. A car that re-decides at
       60Hz weaves, and weaving reads as a bug even when every individual frame
       is defensible.

       The test for a safe lane is the one a driver actually makes: is there a
       hole beside me, is it still going to be a hole when I get there, and is
       the car in it closing on me. Not "is that lane index free".
       -------------------------------------------------------------------- */
    if(c.mergeCool > 0) c.mergeCool -= dt;
    if(c.mergeT > 0){
      c.mergeT -= dt;
      /* carry it out - and if the hole closed while we were moving, abort back
         to where we came from rather than pressing on into an occupied lane */
      if(!laneClear(c, c.mergeX)){
        c.mergeX = c.mergeFrom; c.mergeT = Math.min(c.mergeT, 0.9);
      }
      c.x += clamp(c.mergeX - c.x, -1.1*dt, 1.1*dt);
      if(Math.abs(c.mergeX - c.x) < 0.02 || c.mergeT <= 0){
        c.x = c.mergeX; c.mergeT = 0; c.mergeCool = rnd(2.2, 4.5);
        c.lane = nearestLane(c.x);
        c.drift = Math.abs(c.drift || 0.0004) * (Math.random() < 0.5 ? -1 : 1);
      }
      /* `!(x > 0)` rather than `x <= 0`: a freshly spawned car has no
         `mergeCool` at all, and `undefined <= 0` is FALSE - which would have
         meant no car ever merged until something had set the field, and
         nothing ever would. */
    } else if(!(c.mergeCool > 0) && !c.yielding && want < c.cruise * 0.86){
      /* held up by something. Look for a lane worth taking - the one that is
         both clear AND actually faster, because pulling out to sit beside the
         car you were following is worse than staying put. */
      const here = c.x;
      let best = null, bestGain = 0;
      for(const dir of [-1, 1]){
        const tx = clamp(here + dir * 0.50, -0.86, 0.86);
        if(!laneClear(c, tx)) continue;
        if(wouldBlock(c, tx)) continue;          /* never take the last gap */
        const gain = laneSpeed(c, tx) - laneSpeed(c, here);
        if(gain > bestGain + 200){ bestGain = gain; best = tx; }
      }
      if(best !== null){
        c.mergeFrom = here; c.mergeX = best; c.mergeT = 2.4;
        mergesMade++;
        /* an indicator, for the two seconds before it moves - the mirror and
           the forward view both already draw brake lights, and a car that
           moves across without warning is the thing that makes traffic feel
           malicious rather than busy */
        c.blink = 1.2;
      } else {
        c.mergeCool = rnd(0.8, 1.6);      /* nothing doing; look again shortly */
      }
    }
    if(c.blink > 0) c.blink -= dt;

    const rate = want < c.spd ? 9000 : 2600;       // brakes beat the engine
    c.spd += clamp(want - c.spd, -rate*dt, rate*dt);
    /* anything shedding speed has its brake lights on — used by the mirror */
    /* ---- NO CHATTER ---------------------------------------------------
       `spd < was - 60*dt` flips on and off between frames whenever a car is
       holding station, which is most of the time — that is the flicker. A
       brake light needs hysteresis: it comes on at a real deceleration and
       stays on for a beat afterwards, the way a real one does. */
    const dec = (wasSpd - c.spd) / Math.max(dt, 1/240);
    if(dec > 900) c.brakeT = 0.35;
    else if(c.brakeT > 0) c.brakeT -= dt;
    c.braking = (c.brakeT || 0) > 0;
    if(c.spd < 0) c.spd = 0;
  }

  for(let i=traffic.length-1;i>=0;i--){
    const c = traffic[i];
    c.z += c.spd*dt;
    c.x += c.drift*60*dt;
    if(Math.abs(c.x - LANE_X[c.lane]) > 0.06) c.drift *= -1;
    /* Cars were culled at 1,200 behind — but spawnBehind drops them in at
       2,600 to 4,200 back, so every single one was deleted on the very next
       frame and nothing ever came past. Anything overtaking gets room to
       actually make the pass before it is cleaned up. */
    /* The mirror can see 34,000 units back, so culling at 1,200 emptied it a
       heartbeat after anything passed you. Everything now lives as far behind
       as the mirror can draw it. */
    const cullAt = 34000;
    if(c.z < pos - cullAt){ traffic.splice(i,1); continue; }
    const dz = c.z - pz, dx = Math.abs(c.x - playerX);
    const overlap = (c.w + 0.26)/2;
    if(iframe<=0 && Math.abs(dz) < (c.len+380)/2 && dx < overlap){
      hurt(13, 'traffic');
      iframe = 0.9;
      spd = Math.min(spd*0.55, c.spd*0.80);      // drop behind them so we separate
      const push = Math.sign(playerX - c.x || 1);
      playerX = clamp(playerX + push*0.30, -1.18, 1.18);
      targetX = playerX;
      burst(c, '#ffb066');
    } else if(!c.near && Math.abs(dz) < 260 && dx < overlap+0.20){
      c.near = true;
      snd.nearMiss();


      /* A leftover from the score system: `90*combo` with combo permanently
         zero printed "+0" over the road on every near miss. Nothing to award,
         so nothing to say. */
    }
  }

  // --- nothing overlaps, whatever the controller did ---
  for(let a=traffic.length-1; a>0; a--){
    const c = traffic[a];
    for(let bIdx=a-1; bIdx>=0; bIdx--){
      const o = traffic[bIdx];
      if(Math.abs(o.x - c.x) > (o.w + c.w)/2) continue;
      const minGap = (o.len + c.len)/2 + 40;
      if(c.z > o.z && c.z - o.z < minGap){ c.z = o.z + minGap; c.spd = Math.max(c.spd, o.spd); }
      else if(o.z > c.z && o.z - c.z < minGap){ c.z = o.z - minGap; c.spd = Math.min(c.spd, o.spd); }
    }
  }
  for(const c of traffic){
    for(const b of blocks){
      let blocked = false;
      for(const p of b.parts){
        if(p.cop) continue;
        if(Math.abs(p.x - c.x) < (p.w + c.w)/2){ blocked = true; break; }
      }
      if(!blocked) continue;
      const stop = b.z - 620 - c.len/2;
      if(c.z > stop && c.z < b.z + 3000){ c.z = stop; c.spd = 0; }
    }
  }

  // --- cops ---
  for(let i=cops.length-1;i>=0;i--){
    const k = cops[i];
    if(k.wreck>0){
      k.wreck -= dt; k.spd *= (1-1.4*dt); k.ang += dt*7; k.z += k.spd*dt;
      if(k.wreck<=0 || k.z < pos-34000) cops.splice(i,1);
      continue;
    }
    if(k.grace>0) k.grace -= dt;
    if(k.cool>0)  k.cool  -= dt;

    /* ---- THE LAW IS NOT ONLY AFTER YOU ---------------------------------
       A cruiser chased `pz` and nothing else, so a rogue tuner could sit at
       122mph three lanes over and be ignored. Now it picks the nearest
       SPEEDER — you, a rival on the grid, or a rogue in the traffic — and runs
       that one down.

       You are still the default and still weighted toward: a cop already on
       you does not abandon the chase because a rogue went past. But if one is
       genuinely nearer and genuinely quick, it goes.

       It also means a pursuit you started can be taken off you by somebody
       else's driving, which is the best thing about it.
       ------------------------------------------------------------------ */
    if(k.retarget === undefined) k.retarget = 0;
    k.retarget -= dt;
    if(k.retarget <= 0){
      k.retarget = 1.4;
      let bestZ = pz, bestX = playerX, bestD = Math.abs(k.z - pz) * 0.55;
      const look = (z, x, sp) => {
        /* a target with a bad number in it poisons `k.x` and every gradient
           drawn from it — one NaN in a chase turns the whole frame black */
        if(!isFinite(z) || !isFinite(x) || !isFinite(sp)) return;
        if(sp < MAX_SPD * 0.44) return;      /* not speeding, not interesting */
        const d = Math.abs(k.z - z);
        if(d < bestD && d < 9000){ bestD = d; bestZ = z; bestX = x; }
      };
      for(const r of racers) look(r.z, r.x, r.spd);
      for(const c of traffic) if(c.rogue) look(c.z, c.x, c.spd);
      k.tz = bestZ; k.tx = bestX;
      k.onPlayer = (bestZ === pz);
    }
    const tz = (k.tz === undefined) ? pz : k.tz;
    const dz = k.z - tz;
    // run it down, hold station beside you, lunge, then peel off and reset
    const aggro = k.cool <= 0;
    const wantDz = aggro ? 120 : 900;
    /* A pursuing cruiser does not carry on down the road when you stop — it
       stops with you and boxes you in. Without this the whole BUSTED rule was
       unreachable: brake to zero and every cop simply drove off over the
       horizon and never came back. */
    let want = spd + clamp((wantDz - dz)*2.2, -2600, 3400);
    if(spd < MAX_SPD*0.10 && dz > 0) want = Math.min(want, spd + 400);
    want = Math.min(want, AI_TOP);
    const kWas = k.spd;
    k.spd += aiAccel(k.spd, want, AI_TOP, dt);
    const kDec = (kWas - k.spd) / Math.max(dt, 1/240);
    if(kDec > 900) k.brakeT = 0.35; else if(k.brakeT > 0) k.brakeT -= dt;
    k.braking = (k.brakeT || 0) > 0;
    /* A cruiser will run you down at speed but it has no bottle. On the
       boost you genuinely pull away, which is what the boost is for. */
    /* The floor of 2000 meant a cruiser could never actually stop, so it
       could not surround a stationary car — it just circled past forever.
       When you are stopped, so are they. */
    const boxing = spd < MAX_SPD*0.10;
    k.spd = clamp(k.spd, boxing ? -2600 : 2000, AI_TOP);
    k.z += k.spd*dt;
    /* and it steers at whatever it is chasing, not always at you */
    if(k.tx !== undefined && !k.onPlayer && isFinite(k.tx))
      k.x += clamp(k.tx - k.x, -1.6*dt, 1.6*dt);
    if(!isFinite(k.x)) k.x = playerX;
    const kdx = k.x - (k.lastX === undefined ? k.x : k.lastX);
    k.lastX = k.x;
    const ks = scrubOf(k, kdx, dt, k.spd, false);
    if(ks > 0.05) layRubber(k.x, k.z, ks, k.w || 0.27);
    let aim = aggro ? playerX : clamp(playerX + (k.side||1)*0.55, -1.05, 1.05);
    /* Boxing in: each cruiser takes a station AROUND the car rather than
       chasing its centre — one either side, one across the front — so the
       stop reads as being surrounded rather than tailgated. */
    if(boxing){
      k.box = k.box === undefined ? (cops.indexOf(k) % 3) : k.box;
      const off = k.box === 0 ? -0.42 : k.box === 1 ? 0.42 : 0;
      aim = clamp(playerX + off, -0.92, 0.92);
      /* the one in front sits just ahead; the flankers sit level */
      const holdDz = k.box === 2 ? 620 : 40;
      /* It must be able to REVERSE. Clamping to zero left a cruiser that had
         overshot frozen four thousand units up the road, unable to come back,
         so the box never closed. */
      k.spd = spd + clamp((holdDz - dz)*1.6, -2600, 2600);
    }

    // read the road ahead and pick a line around it. Skill rises with heat,
    // so early cruisers still make a mess of it.
    const skill = Math.min(1, 0.42 + heat*0.14);
    let dodge = 0;
    for(const c of traffic){
      const gap = c.z - k.z;
      if(gap < -200 || gap > 4600) continue;
      if(Math.abs(c.x - k.x) > (c.w + k.w)/2 + 0.14) continue;
      const urgency = 1 - Math.max(0, gap)/4600;
      const room = (c.x > 0 ? -1 : 1);
      const side = Math.abs(k.x - c.x) < 0.02 ? room : (k.x < c.x ? -1 : 1);
      dodge += side * urgency * 1.9;
    }
    for(const bl of blocks){
      const gap = bl.z - k.z;
      if(gap < 0 || gap > 6000) continue;
      let blocked = false;
      for(const p of bl.parts){
        if(p.cop) continue;
        if(Math.abs(p.x - k.x) < (p.w + k.w)/2 + 0.10){ blocked = true; break; }
      }
      if(blocked) dodge += (bl.gapX - k.x) * (1 - gap/6000) * 3.2;
    }
    if(dodge) aim = clamp(aim + dodge * skill, -1.02, 1.02);

    k.x += clamp(aim - k.x, -1.15*dt, 1.15*dt);
    k.phase += dt*7;

    if(Math.abs(k.x) > 1.16){ wreckCop(k, 'barrier'); continue; }

    // cops eat traffic too — that is the player's best weapon
    let smashed=false;
    if(k.grace<=0 && k.z > pz - 900) for(const c of traffic){
      if(Math.abs(c.z - k.z) < (c.len+k.len)/2 && Math.abs(c.x-k.x) < (c.w+k.w)/2){
        wreckCop(k,'traffic'); c.spd*=0.6; smashed=true; break;
      }
    }
    if(smashed) continue;

    for(const bl of blocks){
      if(Math.abs(bl.z - k.z) > 500) continue;
      let hitBar = false;
      for(const p of bl.parts){
        if(p.cop) continue;
        if(Math.abs(p.x - k.x) < (p.w + k.w)/2){ hitBar = true; break; }
      }
      if(hitBar){ wreckCop(k, 'barrier'); smashed = true; break; }
    }
    if(smashed) continue;

    /* ---- A WRECKED CRUISER CANNOT HIT YOU -----------------------------
       This test never checked `k.wreck`. A cop you had already put into the
       barrier stayed in the array spinning out for 1.2s — and every frame of
       that it was still a solid body at your lane and your z, so it went on
       damaging you. That is the ghost: not an invisible cop, a DEAD one you
       are still colliding with.

       The loop above it guards on `k.wreck > 0` for the AI; the collision
       never did. It does now. */
    if(k.wreck > 0) continue;
    /* ---- COLLIDE AGAINST THE PLAYER, NOT THE TARGET --------------------
       `dz` here is the AI's number: `k.z - tz`, the distance to whatever that
       cruiser is CHASING. That was fine when the only target was you — but
       once cops could chase rogues and rivals, a cop sitting 3,800 units away
       hunting a tuner had a small `dz` against ITS target and passed this
       test, so it hit you from off screen.

       That is the random damage with nobody around: a real collision, with a
       car that is nowhere near you, measured against the wrong thing.

       Measured: one hit logged at nearestCop 3793.
       ------------------------------------------------------------------ */
    const pdz = k.z - pz;
    if(iframe<=0 && Math.abs(pdz) < (k.len+380)/2 && Math.abs(k.x-playerX) < (k.w+0.26)/2){
      /* PIT: catch a cruiser on the side, alongside rather than nose to tail,
         while you are actually moving into it and carrying speed, and it goes
         around. Hitting one square-on is still just a crash — the manoeuvre has
         to be deliberate, which means the lateral component is what decides it. */
      const sideOn   = Math.abs(pdz) < (k.len + 380) / 2 * 0.55;  // overlapping, not rear-ended
      const closing  = (playerX - k.x) * (targetX - playerX) < 0; // steering into it
      const fast     = spd > MAX_SPD * 0.62;
      if(sideOn && closing && fast){
        wreckCop(k, 'pit');
        fx.push({txt:'PIT MANOEUVRE', x:W/2, y:H*0.50, vy:-60, age:0, life:1.3});
        spd *= 0.94;
        shake = Math.max(shake, 0.5);
        iframe = 0.6;
        continue;
      }
      hurt(9,'cop');
      iframe = 1.0;
      spd *= 0.78;
      const push = Math.sign(playerX - k.x || 1);
      playerX = clamp(playerX + push*0.22, -1.18, 1.18);
      targetX = playerX;
      k.x -= push*0.16;
      k.z -= 500;
      k.cool = 2.5 - heat*0.15; k.side = -push;
      burst(k, '#8fd0ff');
    }
    if(k.z < pos - 34000) cops.splice(i,1);
  }

  // --- repair crates ---
  for(let i=crates.length-1;i>=0;i--){
    const c = crates[i];
    if(c.z < pos - 1500){ crates.splice(i,1); continue; }
    if(c.got) continue;
    if(Math.abs(c.z - pz) < 460 && Math.abs(c.x - playerX) < 0.30){
      c.got = true;
      const before = dmg, nosBefore = nos;
      dmg = Math.max(0, dmg - 25);
      /* ---- IT PAYS NOS TOO ----------------------------------------------
         The crate healed and nothing else, while the two other pickup paths in
         this file both top the bottle up as well. On a clean run there is no
         damage to repair, so driving over one did literally nothing — a
         reward that is invisible most of the time is not a reward. */
      nos = Math.min(100, nos + 25);

      snd.threaded();
      const gained = Math.round(nos - nosBefore);
      const healed = Math.round(before - dmg);
      fx.push({txt: healed ? ('REPAIRED \u2212' + healed + '%  NOS +' + gained)
                           : ('NOS +' + gained + '%'),
               x:W/2, y:H*0.62, vy:-60, age:0, life:1.2});
      burst(c, '#3ddc84');
    }
  }

  // --- roadblocks ---
  for(let i=blocks.length-1;i>=0;i--){
    const b = blocks[i];
    if(b.z < pos - 2000){ blocks.splice(i,1); continue; }
    if(!b.hit && Math.abs(b.z - pz) < 420){
      iframe = Math.max(iframe, 0.6);
      b.hit = true;
      let clean = true;
      for(const p of b.parts){
        if(p.cop) continue;
        if(Math.abs(p.x - playerX) < (p.w + 0.26)/2){ clean=false; break; }
      }
      if(clean){
        /* a near miss is its own reward — no nitrous for bravado */
        nos = Math.min(100, nos+25); dmg = Math.max(0, dmg-25);
        snd.threaded();
        /* ---- NO SCORE IN THIS GAME ---------------------------------------
           These labels advertised points that do not exist — there is no score
           variable anywhere in the file, and nothing accumulates. Interstate is
           scored in MILES and in where you finish; a floating "+1500" promises
           a number the player will never see again. The event still gets its
           shout, without the fiction. */
        fx.push({txt:'THREADED THE GAP', x:W/2, y:H*0.6, vy:-60, age:0, life:1.3});
      } else {
        hurt(28,'roadblock');
        spd *= 0.3;
        burst({z:b.z, x:playerX}, '#ffd070');
      }
    }
  }

  // --- fx / timers ---
  if(iframe>0) iframe-=dt;
  if(comboTime>0){ comboTime-=dt; if(comboTime<=0) combo=0; }
  for(const f of fx){ f.age+=dt; if(f.vy!==undefined) f.y+=f.vy*dt; else { f.x+=f.vx*dt; f.y+=f.vy*dt; f.vy+=700*dt; } }
  fx = fx.filter(f=>f.age<f.life);
  shake = Math.max(0, shake - dt*2.2);
  hitFlash = Math.max(0, hitFlash - dt*2.4);
  sirenPhase += dt*7;

  var near = 0;
  for(const k of cops){
    if(k.wreck>0) continue;
    const gap = Math.abs(k.z - pz);
    if(gap < 7000) near = Math.max(near, 1 - gap/7000);
  }
  /* rate of deceleration as a fraction of the hardest the brakes can pull,
     so the screech follows what the car is doing rather than what the pedal is */
  const lost = Math.max(0, prevSpd - spd);
  const decel = braking ? Math.min(1, lost / Math.max(1, 9000 * dt)) : 0;
  /* Tyres sing when they are scrubbing, not only when the brake is on — a
     hard change of lane at speed should squeal too, and now the same number
     that lays the rubber drives the sound. */
  /* An engine note tracks REVS. Tied to road speed it swept smoothly from 0
     to 200 and never changed when you shifted — the one moment an engine most
     obviously changes pitch. Feeding it rpm means every upshift drops the note
     and every downshift blips it, for free. */
  const revFrac = clamp((engineRpm() - IDLE) / (redline() - IDLE), 0, 1);
  /* ---- audio is not a per-frame job -------------------------------------
     Sorting forty vehicles and pushing 64 automation events into Web Audio
     sixty times a second was costing real frames for no audible benefit: the
     smoothing on `setTargetAtTime` means nothing changes perceptibly between
     one frame and the next. Every fifth frame is plenty.
     ------------------------------------------------------------------------ */
  audioTick = (audioTick + 1) % 5;
  if(audioTick === 0)
    snd.traffic(traffic.concat(cops.filter(function(k){ return k.wreck<=0; }))
                       .concat(racers));
  /* dirty air is quieter and rougher than clean air — the wind drops as the
     car ahead takes the blast off you */
  /* once the run is over the car makes no noise — see `coasting` */
  if(coasting){ snd.quiet(); }
  else snd.drive(revFrac * MAX_SPD, MAX_SPD * (1 - (slipT||0)*0.22), offRoad, nosOn, near,
            Math.max(decel, pScrub * 0.9));

  /* ---- stopping with the law behind you --------------------------------
     Braking to a halt is free on an empty road and fatal in a pursuit. A
     cruiser that gets alongside a stationary car boxes it in, and three
     seconds later the run is over. The bar is the only warning you get, and
     the only way out is to move.
     ---------------------------------------------------------------------- */
  if(state === 'driving' && wreckWait <= 0){
    /* you cannot be busted for standing still during the two seconds it takes
       to put a fresh car on the road */
    const crawling = spd < MAX_SPD * 0.10;
    let boxed = false;
    if(crawling && !optEasy){
      for(const k of cops){
        if(k.wreck > 0) continue;
        if(Math.abs(k.z - pz) < 2600){ boxed = true; break; }
      }
    }
    if(boxed){
      bustT += dt;
      if(bustT > 3) wreck('BUSTED');
      else if(Math.floor(bustT*2) !== Math.floor((bustT-dt)*2)) snd.warnCop();
    } else bustT = Math.max(0, bustT - dt*1.6);
  }

  if(dmg>=100 && state==='driving') wreck('WRECKED');
}

function wreckCop(k, how){
  k.wreck = 1.2; k.spd *= 0.55;
  snd.copDown();
  /* the crate: a proper repair and a proper slug of nitrous, which is what
     makes it worth crossing the road for */
  nos = Math.min(100, nos + 25); dmg = Math.max(0, dmg - 25);
  fx.push({txt:'CRUISER DOWN', x:W/2, y:H*0.58, vy:-55, age:0, life:1.2});
  burst(k, '#ff9a5a');
}
function burst(o,color){
  const p = proj(o.x*ROAD, o.z||pos+PLAYER_Z);
  const sx = p.ok ? p.x : W/2, sy = p.ok ? p.y : H*0.8;
  for(let i=0;i<14;i++)
    fx.push({x:sx, y:sy, vx:rnd(-260,260), vy:rnd(-330,-40), life:rnd(.35,.85), age:0,
             r:rnd(2,6), c:color});
}
function hurt(n, src){
  if(state!=='driving') return;
  dmg = Math.min(100, dmg + n);
  snd.bump(n >= 20);
  combo = 0; comboTime = 0;
  shake = Math.max(shake, Math.min(1.1, n/22));
  hitFlash = 1;
  if(dmg>=100) wreck(src==='cop' ? 'TAKEN OUT' : 'WRECKED');
}

/* ---------- rendering ---------- */
/* A full cycle: dusk, night, dawn, day, back to dusk. Twelve miles a lap, and you
   set off at dusk because that is the shot the game is named for.
   Phase runs 0-1: 0 dusk · 0.25 night · 0.5 dawn · 0.75 day. */
/* A wall clock, not an odometer. Tying the cycle to distance meant slowing
   down slowed time and flooring it sped time up — a paradox you feel every time
   you brake. Four minutes a lap, which is about what twelve miles used to cost
   at a decent pace. */
const DAY_SECONDS = 240;
let dayClock = 0;
function phase(){ return (dayClock / DAY_SECONDS) % 1; }

/* 0 dusk · 0.25 night · 0.5 dawn · 0.75 midday, then round again.
   Darkness peaks at night and bottoms out at midday; the golden band peaks at
   dusk and dawn and is gone at both extremes. */
function nightFall(){
  const p = phase();
  /* Dusk is where the darkening STARTS, so the last quarter has to stay light.
     It used to ramp 0 -> 1 across midday->dusk and then wrap straight back to
     dusk, where darkness is 0 — a hard snap from near-black to full daylight
     every lap. The afternoon is lit; only the golden band moves in it. */
  if(p < 0.25) return p / 0.25;                       // dusk   -> night
  if(p < 0.50) return 1 - (p - 0.25) / 0.25;          // night  -> dawn
  return 0;                                           // dawn -> midday -> dusk
}
function goldenHour(){
  const p = phase();
  if(p < 0.25) return 1 - p / 0.25;                   // dusk fading
  if(p < 0.50) return (p - 0.25) / 0.25;              // dawn coming up
  if(p < 0.75) return 1 - (p - 0.50) / 0.25;          // burning off to midday
  return (p - 0.75) / 0.25;                           // sinking back to dusk
}

/* Works on triples, not strings, so it can be nested. Passing the rgb() string
   it used to return back into itself produced rgb(NaN,NaN,1). */
function hex3(h){ return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
function mix3(a, b, t){ return a.map((v,i) => v + (b[i]-v)*t); }
function rgb(c){ return 'rgb(' + c.map(v => Math.round(v)).join(',') + ')'; }

/* Sun and moon sit at opposite ends of one diameter, and the wheel turns with
   the clock — so when one is up the other is exactly as far down, and neither
   is ever placed by hand. Height is what decides visibility; the horizontal
   sweep falls out of the same angle.

     dusk    sun on the horizon, going down on the right
     night   sun at its lowest, moon overhead
     dawn    sun on the horizon, coming up on the left
     midday  sun overhead, moon at its lowest                                  */
function celestial(){
  const a = phase() * 6.2832;
  return {
    sun:  { x:  Math.cos(a), h: -Math.sin(a) },
    moon: { x: -Math.cos(a), h:  Math.sin(a) }
  };
}

function drawBody(b, kind){
  if(b.h < -0.10) return;                       // well below the horizon
  const cx = W*0.5 + b.x * W*0.40 - camX*W*0.010;   // barely any parallax: it is very far away
  const cy = horizon - b.h * (horizon * 0.82);
  const r  = kind === 'sun' ? W*0.055 : W*0.042;
  /* fade as it touches down, and redden the sun near the horizon */
  const up  = Math.max(0, Math.min(1, (b.h + 0.10) / 0.22));
  const low = 1 - Math.max(0, Math.min(1, b.h / 0.45));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = up * (kind === 'sun' ? 1 : 0.92);

  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*(kind === 'sun' ? 5.2 : 3.4));
  if(kind === 'sun'){
    halo.addColorStop(0,   'rgba(255,'+Math.round(210-70*low)+','+Math.round(150-110*low)+',.55)');
    halo.addColorStop(0.35,'rgba(255,'+Math.round(150-40*low)+',80,.16)');
    halo.addColorStop(1,   'rgba(255,120,60,0)');
  } else {
    halo.addColorStop(0,   'rgba(200,220,255,.34)');
    halo.addColorStop(0.4, 'rgba(160,190,255,.10)');
    halo.addColorStop(1,   'rgba(160,190,255,0)');
  }
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, r*(kind === 'sun' ? 5.2 : 3.4), 0, 6.2832); ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  if(kind === 'sun'){
    const g2 = ctx.createRadialGradient(cx, cy-r*0.2, 0, cx, cy, r);
    g2.addColorStop(0, '#fff7e2');
    g2.addColorStop(0.6, 'rgb(255,'+Math.round(214-64*low)+','+Math.round(140-100*low)+')');
    g2.addColorStop(1, 'rgb(255,'+Math.round(150-50*low)+',70)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
  } else {
    ctx.fillStyle = '#e8eeff';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(150,168,205,.55)';
    for(const [ox,oy,cr] of [[-0.28,-0.18,0.20],[0.22,0.10,0.15],[-0.05,0.34,0.11],[0.34,-0.30,0.09]]){
      ctx.beginPath(); ctx.arc(cx+r*ox, cy+r*oy, r*cr, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}

/* the verge colour, darkened, whitened by settled snow, dimmed at night */
/* the haze colour as numbers, so the ground can be mixed toward it */
function hazeRGB(){
  const n = nightFall();
  return [ Math.round(126 - n*54), Math.round(140 - n*58), Math.round(158 - n*62) ];
}

function groundBase(mix){
  const B = bio();
  const n = parseInt(B.grassLo.slice(1), 16);
  let r = (n>>16&255), g2 = (n>>8&255), b2 = (n&255);
  const t = settle * 0.85;
  r = Math.round(r + (238-r)*t); g2 = Math.round(g2 + (238-g2)*t); b2 = Math.round(b2 + (238-b2)*t);
  const dim = nightFall() > 0.5 ? 0.72 : 0.88;
  r = Math.round(r*dim); g2 = Math.round(g2*dim); b2 = Math.round(b2*dim);
  /* wash it toward the haze the same way distance does, so the gap between
     the furthest drawn slice and the horizon is the colour that slice would
     have been */
  const hz = hazeRGB();
  const t2 = (mix === undefined) ? 0.80 : mix;
  return 'rgb(' + Math.round(r + (hz[0]-r)*t2) + ','
                + Math.round(g2 + (hz[1]-g2)*t2) + ','
                + Math.round(b2 + (hz[2]-b2)*t2) + ')';
}

function drawSky(){
  const n = nightFall(), gold = goldenHour();
  /* day sky under night sky, crossfaded; the golden band on top of both */
  const g = ctx.createLinearGradient(0,0,0,horizon+2);
  g.addColorStop(0,    rgb(mix3(hex3('#2f6ea8'), hex3('#04030a'), n)));
  g.addColorStop(0.42, rgb(mix3(hex3('#6ba3cc'), hex3('#0a0715'), n)));
  g.addColorStop(0.78, rgb(mix3(mix3(hex3('#a8cbe0'), hex3('#5b2340'), gold), hex3('#140b1f'), n)));
  g.addColorStop(1,    rgb(mix3(mix3(hex3('#d6e4ec'), hex3('#a8422f'), gold), hex3('#2a1424'), n)));
  ctx.fillStyle=g; ctx.fillRect(0,0,W,horizon+2);

  /* stars come out as the light goes */
  if(n > 0.25){
    ctx.save();
    ctx.globalAlpha = (n - 0.25) / 0.75 * 0.75;
    ctx.fillStyle = '#dfe9ff';
    for(let i=0;i<40;i++){
      const sx = ((i * 137.5) % W + (-camX*W*0.006)) % W;   /* stars, further still */
      const sy = (i * 61) % Math.max(1, horizon*0.72);
      const tw = 0.55 + Math.sin(i*3.1 + dist*1.7)*0.45;
      ctx.globalAlpha = ((n - 0.25)/0.75) * 0.7 * tw;
      ctx.fillRect(sx < 0 ? sx + W : sx, sy, 1.4, 1.4);
    }
    ctx.restore();
  }

  // sodium bloom sitting on the horizon, dying back with the sun
  /* This had a FLOOR of 0.15 that never went away, so an orange haze sat on
     the horizon at noon and at midnight alike. It belongs to dusk and dawn and
     nowhere else, so it is driven purely by `gold` now and reaches zero. */
  /* the bloom is welcome at any hour now that it is not orange — it just
     glows in whatever colour the air is */
  const bloom = 0.35 + gold * 0.65;
  const b = ctx.createRadialGradient(W*0.5 - camX*W*0.03, horizon, 0, W*0.5 - camX*W*0.03, horizon, W*0.75);
  b.addColorStop(0,   hazeTint(0.42*bloom));
  b.addColorStop(0.4, hazeTint(0.14*bloom));
  b.addColorStop(1,   hazeTint(0));
  ctx.fillStyle=b; ctx.fillRect(0,0,W,horizon+2);

  const sky = celestial();
  drawBody(sky.moon, 'moon');
  drawBody(sky.sun,  'sun');

  if(!skyline) buildSkyline();
  const sw = skyline.width, sh = skyline.height;
  const scale = (H*0.13)/sh;
  const dw = sw*scale, dh = sh*scale;
  /* The skyline is miles off, so it should barely move. It was sliding at
     0.07 of the camera, which read as a wall a few streets away. */
  /* the bend swings the city across the glass — a right-hander pushes it left */
  /* The skyline slides opposite the bend, so a right-hander swings the city
     left across the glass. Computed HERE rather than in the sky gradient,
     which is a different function — it was out of scope there. */
  /* The parallax was computed from `curvatureAt()`, which STEPS from one
     segment to the next — so the skyline teleported every time a bend began or
     ended. It now follows a single smoothed value chased frame to frame, and
     is driven only by where the road actually is on screen. */
  /* ---- THE SKYLINE NEVER MOVED -------------------------------------------
     `skySmooth` was read here and declared at the top — and updated NOWHERE.
     Two earlier "fixes" changed a coefficient on a line that did not exist, so
     the value sat at 0 for the whole run and the city was welded to the
     horizon. It is chased here, where it is used, so it cannot go missing
     again.

     The city is the furthest thing in the scene, so it sweeps the most: the
     bend a long way ahead, times 2.6, chased fast enough to keep up with a
     corner rather than drifting in after it.
     ------------------------------------------------------------------------ */
  /* ---- THE SKYLINE IS MILES AWAY ---------------------------------------
     2.6 swung it 228px on a single bend — the city lurching further than the
     road did, which reads as the whole world sliding rather than as distance.
     A skyline that far off barely moves: 0.55, and chased slower so it drifts
     rather than snaps. */
  const skyWant = -bendPx(pos + 30000) * 0.55;
  /* drawSky has no dt, so the chase uses a fixed frame step — a title screen
     and a run both call this at the same rate */
  skySmooth += (skyWant - skySmooth) * 0.045;
  const skyShift = skySmooth;
  let ox = ((-camX*W*0.018) + skyShift) % dw;
  if(ox>0) ox -= dw;
  /* Buildings are opaque. They used to be drawn at 0.55-0.85 alpha to "recede
     into the dark", which meant the sun and moon showed straight through them.
     A silhouette recedes by getting closer to the sky colour, not by turning
     into glass — so the fade happens as a wash painted over the top instead. */
  for(let x=ox; x<W+dw; x+=dw) ctx.drawImage(skyline, x, horizon-dh+1, dw, dh);
  /* No tint pass. `source-atop` paints over every opaque pixel and the sky is
     opaque, so it washed a visible band across the sky as well as the
     buildings. The silhouette is dark enough to read against both a noon sky
     and a midnight one on its own. */
  /* windows on: full at night, out by day */
  if(skylineLit && n > 0.04){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, n * 1.25);
    for(let x=ox; x<W+dw; x+=dw) ctx.drawImage(skylineLit, x, horizon-dh+1, dw, dh);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

/* ---- one tint for every atmospheric layer --------------------------------
   The haze layers were fine as LAYERS — the problem was that they were fixed
   orange whatever the hour. They now take their colour from the time of day and
   blend between three: cool blue at night, warm through golden hour, neutral
   grey by day. Everything hazy in the scene reads from this, so they can never
   disagree with each other or with the sky again.
   -------------------------------------------------------------------------- */
function hazeTint(a){
  const n = nightFall(), g2 = goldenHour();
  /* day - golden - night, mixed in that order */
  const day   = [152, 162, 182];
  const golden= [214, 138,  92];
  const night = [ 58,  70, 108];
  const mix = (x,y,t) => x + (y-x)*t;
  let r = mix(day[0], golden[0], g2), gg = mix(day[1], golden[1], g2), b = mix(day[2], golden[2], g2);
  r = mix(r, night[0], n); gg = mix(gg, night[1], n); b = mix(b, night[2], n);
  return 'rgba(' + Math.round(r) + ',' + Math.round(gg) + ',' + Math.round(b) + ',' + a + ')';
}

function drawHaze(){
  /* THE THIRD ORANGE SOURCE. The lamps were fixed, the bloom was gated, and a
     hard rgba(196,88,54,.62) band was still being painted across the horizon
     every frame regardless of the hour — which is the wash that kept coming
     back. It is a neutral atmospheric haze now: cool grey-blue, the colour
     distance actually is, and it thins out at night instead of glowing. */
  /* ---- IT WAS HALF OPAQUE ---------------------------------------------
     `a = 0.50` over a band 13% of screen height, painted AFTER the road — so
     a solid grey-blue veil sat across the far verge, the skyline base and the
     first stretch of tarmac every frame. That is the ghosting: not a colour
     mismatch, a translucent sheet drawn on top of the scene.

     Real distance haze is barely there. 0.16 over 7% reads as depth; 0.50
     over 13% reads as fog on the lens. And it is FADED OUT at the very top
     rather than starting at full strength, so it never draws a hard edge
     along the horizon line.
     ------------------------------------------------------------------- */
  const d = H*0.07;
  const a = 0.16;
  const g = ctx.createLinearGradient(0, horizon-2, 0, horizon+d);
  g.addColorStop(0,    hazeTint(a*0.55));   /* soft at the line itself */
  g.addColorStop(0.18, hazeTint(a));
  g.addColorStop(0.55, hazeTint(a*0.28));
  g.addColorStop(1,    hazeTint(0));
  ctx.fillStyle=g; ctx.fillRect(0,horizon-2,W,d+2);
}

/* Sodium lamps down the verge. They come on partway into dusk and go off
   partway into dawn, with a short warm-up rather than a switch — a bank of
   street lights does not snap on. This is the illumination only; there are no
   poles to model at this scale, just pools of light on the tarmac. */
function lampsOn(){
  const p = phase();
  /* Dawn is phase 0.50. They used to hold full until 0.55 and not go out until
     0.65 — a sixth of a day of street lights burning in broad morning light.
     The fade now STRADDLES dawn: starting to drop at 0.44 and dark by 0.52, so
     they are going out as the sun comes up rather than long after it. */
  if(p < 0.10) return p / 0.10;                      // coming up at dusk
  if(p < 0.44) return 1;                             // lit all night
  if(p < 0.52) return 1 - (p - 0.44) / 0.08;         // out across dawn
  return 0;                                          // daylight
}

/* ---- how far you can SEE over a crest ------------------------------------
   The road paints far-to-near so it hides itself correctly, but sprites are a
   separate pass and were ignoring the hills entirely — cars, signs and lamp
   posts on the far side of a brow drew straight through the tarmac, which is
   what read as the road being transparent.

   Walking near to far, the lowest screen y the road reaches is the horizon of
   the nearest crest: anything beyond that is over the brow and out of sight.
   `hillClip[n]` holds that value per segment so the sprite pass can test it.
   -------------------------------------------------------------------------- */
let hillClip = [];
function buildHillClip(){
  const base = Math.floor(pos/SEG);
  hillClip = new Array(DRAW+2);
  /* THE MINIMUM MUST EXCLUDE THE SEGMENT ITSELF. It was written as the running
     minimum INCLUDING n, so a sprite's own road height was always equal to the
     value it was tested against and the test could essentially never fire —
     which is why everything still drew through the terrain. `hillClip[n]` is
     now the highest the road has reached BEFORE n, which is what a crest
     between you and that point actually is. */
  let minY = H;
  for(let n=0; n<=DRAW+1; n++){
    hillClip[n] = minY;                       /* record BEFORE folding n in */
    const pn = proj(0, (base+n)*SEG);
    if(pn.ok && pn.y < minY) minY = pn.y;
  }
}
/* is a point at this z hidden behind a crest between here and there? */
/* the screen y of the crest between here and worldZ, or null if clear */
function hiddenBehindHill(worldZ){
  const n = Math.floor((worldZ - pos)/SEG) - Math.floor(pos/SEG) + Math.floor(pos/SEG);
  const idx = Math.floor((worldZ - pos)/SEG);
  if(idx < 1 || idx > DRAW) return false;
  /* the slice it stands on was skipped, so the ground in front hides it */
  return roadY[idx] === undefined;
}
function crestY(worldZ){
  /* ---- RE-ENABLED, AND THE SIGN IS THE WHOLE STORY ----------------------
     This was disabled because it was wrong in both directions at once, and
     the note left behind said the real answer was to interleave sprites with
     the road slices. **That interleave has since been built** - sprites are
     emitted during the road pass now - so the reason for switching it off is
     gone, and what is left is the part that was never right: which side of
     the line is hidden.

     In this projection further away is HIGHER on screen, so a smaller y. A
     crest between you and a car covers the car FROM THE BOTTOM UP, and what
     survives is the roof. So the visible band is ABOVE the crest line, and the
     old code clipped to `rect(0, brow, W, H - brow)` - everything below it.
     That is exactly inverted, which is why it hid the wrong half and why
     flipping the comparison never fixed it.

     `hillClip[n]` is the highest the road reached BEFORE n, which is the
     silhouette of the nearest crest between here and there. On a flat road it
     sits just above every sprite's own base, so nothing is clipped, which is
     the behaviour that broke last time.
     -------------------------------------------------------------------- */
  if(!hillClip.length) return null;
  const n = Math.floor((worldZ - pos)/SEG);
  if(n < 2 || n >= hillClip.length) return null;
  const v = hillClip[n];
  return (v === undefined || v >= H) ? null : v;
}
function overBrow(worldZ, screenY){
  return false;   /* see crestY: the whole test was inverted */
  if(!hillClip.length) return false;
  const n = Math.floor((worldZ - pos)/SEG);
  if(n < 2 || n >= hillClip.length) return false;
  /* A generous margin: a hair of tolerance made things flicker in and out as
     the clip was rebuilt each frame. Half a segment of slack is invisible and
     stable. */
  return screenY < hillClip[n] - H*0.012;
}

/* ---- where the road actually got painted ---------------------------------
   `roadY[n]` is the screen y of the road surface at segment n, recorded as the
   road paints and left undefined for any slice that was SKIPPED because it sat
   behind a crest. That is the honest answer to "is this point visible": if the
   slice a car stands on was never drawn, the car is behind a hill.

   A single running minimum could never express this — it has no memory of
   which slices were actually painted. This does.
   -------------------------------------------------------------------------- */
let roadY = [], spriteBuckets = {}, emitted = {};
function drawRoad(){
  buildHillClip();
  spriteStats = { drawn:0, culled:0, clipped:0 };
  roadY = []; emitted = {};
  let groundMax = -1e9;
  const lamp = lampsOn();
  const base = Math.floor(pos/SEG);
  let maxy = H;
  for(let n=DRAW; n>=0; n--){
    const idx = base + n;
    const z1 = idx*SEG, z2 = z1 + SEG;
    const p1 = proj(0, z1), p2 = proj(0, z2);
    /* ---- A SKIPPED SLICE MUST STILL EMIT ------------------------------
       These guards drop degenerate geometry — a slice off the bottom of the
       screen, a projection that did not resolve. They are NOT occlusion. But
       they ran before `emitBucket`, so any car standing on such a slice simply
       vanished for that frame, and as a car crossed between segments it
       flickered. Only the crest test may hide a sprite; everything else has to
       let it through. */
    if(!p1.ok || !p2.ok){ emitBucket(n); continue; }
    if(p2.y >= H){ emitBucket(n); continue; }
    const dark = ((idx/RUMBLE)|0) % 2 === 0;
    const fade = clamp(1 - n/DRAW, 0, 1);
    const y1 = p1.y, y2 = p2.y;
    if(y1 < y2){ emitBucket(n); continue; }

    /* ---- THE GROUND, not just the verge ---------------------------------
       The strip either side of the tarmac was being drawn only as tall as the
       road slice, so everything above it was still sky — which meant a crest
       rose in front of the skyline instead of hiding it. Because the road is
       painted far-to-near, filling the FULL height from each slice down to the
       bottom of the screen builds the terrain up automatically: distant slices
       fill high, nearer ones paint over them lower, and the silhouette of the
       land follows the road over every brow.
       -------------------------------------------------------------------- */
    /* GRASS, as Out Run has it — the land either side is green, banded like
       the tarmac so it strobes past at speed, and it takes the sky's own
       light so it goes deep and blue at night rather than staying lit. */
    /* the biome's own verge, lifted toward white as snow settles on it */
    const B = bio();
    const mixW = (a, t) => {
      const n = parseInt(a.slice(1), 16);
      const r = (n>>16&255), g2 = (n>>8&255), b2 = (n&255);
      const m = v => Math.round(v + (238 - v) * t);
      return 'rgb(' + m(r) + ',' + m(g2) + ',' + m(b2) + ')';
    };
    const grassLo = mixW(B.grassLo, settle * 0.85);
    const grassHi = mixW(B.grassHi, settle * 0.85);
    /* `gold` lives in the sky function, so the tint is taken from the day
       cycle directly rather than a variable that is not in scope here. */
    const nAmt = nightFall(), gAmt = goldenHour();
    ctx.fillStyle = nAmt > 0.5 ? (dark ? '#12251a' : '#162d1f')
                  : gAmt > 0.25 ? (dark ? '#2f4a2c' : '#395638')
                  : (dark ? grassLo : grassHi);
    /* ---- CULLED THE RIGHT WAY ROUND -----------------------------------
       The road walks FAR to NEAR, so y grows as we come forward and each
       nearer slice should paint over the last. My first cull tested
       `y2 < groundMin`, which on that walk is true only for the FIRST slice
       — every nearer one would have been skipped and the road would have
       vanished behind the horizon fill.

       What actually needs skipping is a slice hidden BEHIND a crest: one
       whose y has gone back UP relative to the nearest ground painted. So
       the test is `y2 > groundMax`, and groundMax only ever advances toward
       the camera. */
    if(y2 > groundMax){
      ctx.fillRect(0, y2, W, H - y2);
      groundMax = y2;
      roadY[n] = y1;
      emitBucket(n);
      /* ---- AND THE ONE BEHIND IT --------------------------------------
         A car sits at a z that rounds to one segment, but which segment
         "covers" it shifts by one as `pos` advances — so a car near a
         boundary was landing alternately on a painted slice and a culled
         one, twice a second. Emitting the bucket one further out along with
         this slice removes the oscillation: if THIS slice is visible, the
         one immediately behind it is too, because nothing can hide between
         two adjacent slices. */
      if(!emitted[n+1]) emitBucket(n+1);
    }
    /* if the slice WAS behind a crest, its bucket stays unemitted — that is
       the occlusion, and the only case where a sprite is legitimately lost */

    /* every eighth segment carries a lamp, alternating sides, throwing an
       ellipse of sodium light across the near lanes */
    /* ---- street lighting -------------------------------------------------
       The POLE is always there. Lamp posts do not vanish at sunrise — only the
       light does. Previously the whole thing was gated on `lamp`, so at noon
       the roadside was bare, and any residual glow read as lamps burning in
       daylight. Now the column and head draw at every hour and only the bulb
       and its bloom are switched.
       ---------------------------------------------------------------------- */
    if(idx % 8 === 0 && !overBrow(z1, p1.y)){
      const side = ((idx/8)|0) % 2 ? 1 : -1;
      const lx = p1.x + side * p1.scale * ROAD * W * 1.15;
      const sc = p1.scale * ROAD * W;
      const poleH = Math.max(4, sc * 1.05);
      const poleW = Math.max(1, sc * 0.045);
      const armL  = Math.max(2, sc * 0.30) * -side;
      const topY  = y1 - poleH;

      /* ---- SOLID -------------------------------------------------------
         `globalAlpha = fade` made the whole post see-through for most of its
         life, since `fade` is the distance ramp and only reaches 1 right in
         front of you. A steel column is not translucent at any distance. The
         ramp is now only used to fade a post IN at the far edge of the draw
         distance, where it would otherwise pop. */
      ctx.save();
      ctx.globalAlpha = Math.min(1, fade * 4);
      ctx.fillStyle = '#2b3038';
      ctx.fillRect(lx - poleW/2, topY, poleW, poleH);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(lx - poleW/2, topY, Math.max(0.6, poleW*0.35), poleH);
      /* the arm out over the carriageway, and the head on the end of it */
      ctx.strokeStyle = '#2b3038';
      ctx.lineWidth = Math.max(1, poleW*0.85);
      ctx.beginPath();
      ctx.moveTo(lx, topY + poleW*0.5);
      ctx.quadraticCurveTo(lx + armL*0.6, topY - poleH*0.06, lx + armL, topY + poleH*0.03);
      ctx.stroke();
      const hx = lx + armL, hy = topY + poleH*0.03;
      const hw = Math.max(1.6, sc*0.13), hh = Math.max(1, sc*0.05);
      ctx.fillStyle = '#3a4048';
      ctx.beginPath();
      ctx.moveTo(hx - hw, hy); ctx.lineTo(hx + hw, hy);
      ctx.lineTo(hx + hw*0.7, hy + hh); ctx.lineTo(hx - hw*0.7, hy + hh);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      /* the emissive bulb and the pool it throws — night only, whitish blue */
      if(lamp > 0.01){
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        /* the bulb itself, on the underside of the head */
        const bg = ctx.createRadialGradient(hx, hy+hh*0.6, 0, hx, hy+hh*0.6, Math.max(2, sc*0.22));
        bg.addColorStop(0,   'rgba(236,246,255,' + (0.85*lamp*fade) + ')');
        bg.addColorStop(0.4, 'rgba(176,214,255,' + (0.40*lamp*fade) + ')');
        bg.addColorStop(1,   'rgba(140,190,255,0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(hx, hy+hh*0.6, Math.max(2, sc*0.22), 0, 6.2832);
        ctx.fill();
        /* ---- THE INTERMITTENT HAZE ---------------------------------------
           The pool's HEIGHT was `(y1 - y2) * 5.5` — 5.5 times the thickness of
           the road slice it sits on. Slice thickness changes with distance and
           with every hill, so the pool grew and shrank frame to frame and
           bloomed into a wash across the screen: the intermittent haze.

           A pool of light on tarmac is an ellipse whose size follows the LAMP,
           not the geometry it happens to be drawn on. Both axes come from `sc`
           now, so it is the same shape at every distance and simply gets
           smaller as it recedes.
           ---------------------------------------------------------------- */
        /* ---- STILL WRONG, AND WORSE ---------------------------------------
           `sc` is `scale * ROAD * W`, which is HUGE near the camera — so
           `sc * 0.55` made the pool taller than the slice-based version it
           replaced, not shorter. The haze got stronger.

           A pool of light on tarmac is a FLAT ellipse: wide across the road,
           shallow up it, because you are looking at the ground almost edge on.
           And it must be capped, or the nearest lamp on a crest paints half
           the screen.
           ---------------------------------------------------------------- */
        const rw = Math.min(W * 0.55, Math.max(6, sc * 2.2));
        const rh = Math.min(H * 0.06, Math.max(2, sc * 0.17));
        const g2 = ctx.createRadialGradient(hx, y1, 0, hx, y1, rw);
        g2.addColorStop(0,   'rgba(226,240,255,' + (0.13 * lamp * fade) + ')');
        g2.addColorStop(0.5, 'rgba(168,204,255,' + (0.045 * lamp * fade) + ')');
        g2.addColorStop(1,   'rgba(140,185,255,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.ellipse(hx, y1, rw, rh, 0, 0, 6.2832);
        ctx.fill();
        ctx.restore();
      }
    }

    // rumble strip
    const r1 = p1.w*1.13, r2 = p2.w*1.13;
    ctx.fillStyle = dark ? '#c9c3b4' : '#8c3346';
    quad(p1.x-r1, y1, p1.x-p1.w, y1, p2.x-p2.w, y2, p2.x-r2, y2);
    quad(p1.x+p1.w, y1, p1.x+r1, y1, p2.x+r2, y2, p2.x+p2.w, y2);

    // asphalt
    ctx.fillStyle = dark ? '#232231' : '#1e1d2a';
    quad(p1.x-p1.w, y1, p1.x+p1.w, y1, p2.x+p2.w, y2, p2.x-p2.w, y2);

    // lane markers (dashed on the dark stripes only)
    if(dark){
      ctx.fillStyle = 'rgba(255,180,90,'+(0.30+0.5*fade)+')';
      for(let l=1;l<LANES;l++){
        const o = (l/LANES)*2 - 1;
        const lw1 = p1.w*0.016, lw2 = p2.w*0.016;
        quad(p1.x+o*p1.w-lw1, y1, p1.x+o*p1.w+lw1, y1,
             p2.x+o*p2.w+lw2, y2, p2.x+o*p2.w-lw2, y2);
      }
    }
    // solid edge lines
    ctx.fillStyle = 'rgba(240,235,220,'+(0.22+0.35*fade)+')';
    const e1=p1.w*0.022, e2=p2.w*0.022;
    quad(p1.x-p1.w*0.965-e1,y1,p1.x-p1.w*0.965+e1,y1,p2.x-p2.w*0.965+e2,y2,p2.x-p2.w*0.965-e2,y2);
    quad(p1.x+p1.w*0.965-e1,y1,p1.x+p1.w*0.965+e1,y1,p2.x+p2.w*0.965+e2,y2,p2.x+p2.w*0.965-e2,y2);

    maxy = y2;

    // street lights every 8 segments, alternating sides
    if(idx % 8 === 0 && !overBrow(z1, p1.y)){
      const side = ((idx/8)|0) % 2 ? 1 : -1;
    }
  }
}
function quad(ax,ay,bx,by,cx,cy,dx,dy){
  ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.lineTo(cx,cy); ctx.lineTo(dx,dy);
  ctx.closePath(); ctx.fill();
}
/* `drawLight` REMOVED. It was a second, older set of lamp posts drawn on top
   of the real ones — thin translucent poles with their own glow, from before
   the proper street lighting existed. Two sets of posts at slightly different
   scales read as ghosts beside the solid ones. */


/* ---- WHAT THE SPRITE PASS ACTUALLY DID, PER FRAME ------------------------
   Occlusion here has been wrong twice, and both times it was invisible to
   every gate: the road still drove, the console stayed clean, and the only
   symptom was that things stopped being on it. A count of drawn against culled
   is the difference between "cars are missing" and "cars are hidden", and no
   screenshot answers that reliably.

   Reset by `drawRoad`, read through `API.spriteStats()`.
   -------------------------------------------------------------------------- */
let spriteStats = { drawn:0, culled:0, clipped:0 };

function drawSprite(img, worldX, worldZ, worldW, alpha, flip){
  if(worldZ - pos < 430) return null;
  const p = proj(worldX*ROAD, worldZ);
  if(!p.ok) return null;
  const w = p.scale*worldW*ROAD*W/2*2;
  if(w < 1.2 || w > W*3.4) return null;
  const h = w * img.height/img.width;
  if(p.y - h > H || p.y < horizon - h) return null;
  /* ---- NO OCCLUSION TEST HERE ANY MORE -------------------------------
     `hiddenBehindHill` asked whether `roadY[idx]` had been filled — but
     sprites are emitted DURING the road pass now, so for any car the slices
     NEARER than it have not been painted yet and its lookup landed on an
     undefined entry. Every car reported itself hidden and the road went
     empty: 23 cars in range, 0 drawn.

     The bucket order already IS the occlusion. A car only draws when its
     slice is painted, and a painted slice is by definition visible. The
     leftover test could only ever take away things that were correct.
     ------------------------------------------------------------------ */

  /* ---- PARTIAL, NOT ALL-OR-NOTHING ------------------------------------
     A car straddling a crest used to be gone the moment any of it was
     covered, which reads as a rendering fault. A car cut off at the waist
     reads as a hill - and it is information, because how much of it you can
     see tells you how far over the brow it is.

     Three cases: entirely under the silhouette, entirely above it, or across
     it. Only the last one costs a clip.
     ------------------------------------------------------------------- */
  const brow = crestY(worldZ);
  /* even the roof is under the crest - genuinely out of sight */
  if(brow !== null && p.y - h > brow + H*0.004){ spriteStats.culled++; return null; }
  if(brow !== null && p.y > brow){
    ctx.save();
    /* keep what is ABOVE the crest line; the ground in front covers the rest */
    ctx.beginPath(); ctx.rect(0, 0, W, brow); ctx.clip();
    if(alpha!==undefined){ ctx.globalAlpha=alpha; }
    if(flip){
    /* a left-hand corner is a right-hand one seen from the other side — one
       sprite serves both, mirrored */
    ctx.save();
    ctx.translate(p.x*2, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, p.x - w/2, p.y - h, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(img, p.x - w/2, p.y - h, w, h);
  }
    ctx.globalAlpha=1;
    ctx.restore();
    spriteStats.clipped++;
    return {x:p.x, y:p.y, w, h};
  }
  if(alpha!==undefined){ ctx.globalAlpha=alpha; }
  ctx.drawImage(img, p.x - w/2, p.y - h, w, h);
  ctx.globalAlpha=1;
  spriteStats.drawn++;
  return {x:p.x, y:p.y, w, h};
}

/* Reverse lamps. A car that is backing toward you should say so — without
   them a cruiser closing the box just slides at you for no visible reason. */
function drawReverse(box){
  if(!box) return;
  const w = box.w, h = box.h, x = box.x, y = box.y;
  const lw = w*0.13, lh = h*0.09;
  const ly = y + h*0.70;
  for(const side of [0,1]){
    const lx = x + (side ? w*0.60 : w*0.27);
    const gl = ctx.createRadialGradient(lx+lw/2, ly+lh/2, 0, lx+lw/2, ly+lh/2, lw*2.2);
    gl.addColorStop(0,'rgba(255,255,255,.85)');
    gl.addColorStop(0.4,'rgba(230,245,255,.35)');
    gl.addColorStop(1,'rgba(200,230,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(lx - lw, ly - lh, lw*3, lh*3);
    ctx.fillStyle = '#f6fbff';
    ctx.fillRect(lx, ly, lw, lh);
  }
}

function drawCopLights(box, phase){
  if(!box || box.w < 8) return;
  const lw = box.w*0.19, lh = Math.max(2, box.h*0.055);
  const y = box.y - box.h*0.955;
  const on = Math.sin(phase) > 0;
  const pairs = [[-0.105, on?'#ff2b4a':'#4a121f', 'rgba(255,43,74,'],
                 [ 0.105, on?'#16233d':'#5b98ff', 'rgba(77,140,255,']];
  for(const [ox,col,glow] of pairs){
    const cxp = box.x + box.w*ox;
    if((ox<0)===on){
      const g = ctx.createRadialGradient(cxp, y+lh/2, 0, cxp, y+lh/2, lw*3.4);
      g.addColorStop(0, glow+'.6)'); g.addColorStop(1, glow+'0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(cxp, y+lh/2, lw*3.4, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = col;
    rr(ctx, cxp - lw/2, y, lw, lh, Math.min(2, lh/2)); ctx.fill();
  }
}

function drawWorld(){
  drawRubber();

  const items = [];
  for(const c of traffic) items.push({z:c.z, kind:'t', o:c});
  for(const k of cops)    items.push({z:k.z, kind:'k', o:k});
  for(const b of blocks)  items.push({z:b.z, kind:'b', o:b});
  for(const sg of signs)  items.push({z:sg.z, kind:'s', o:sg});
  for(const cp of cpGantries) items.push({z:cp.z, kind:'c', o:cp});
  for(const r of racers)  items.push({z:r.z, kind:'g', o:r});
  for(const c of crates)  if(!c.got) items.push({z:c.z, kind:'r', o:c});
  items.sort((a,b)=>b.z-a.z);
  /* ---- SPRITES ARE EMITTED INSIDE THE ROAD LOOP ------------------------
     They used to be drawn in this pass, AFTER the whole road, which is why
     nothing behind a hill could ever be hidden: by the time any test ran the
     road was already finished and the sprite painted over it regardless.

     Now each one is bucketed by the road segment it stands on, and the road
     emits a bucket immediately after painting that slice — so a nearer slice
     paints over anything further away exactly as it paints over itself. Four
     different per-sprite conditions could not do this; the draw ORDER is the
     answer, not a test.
     -------------------------------------------------------------------- */
  const base = Math.floor(pos/SEG);
  spriteBuckets = {};
  for(const it of items){
    const n = Math.floor(it.z/SEG) - base;
    if(n < 0 || n > DRAW+1) continue;
    (spriteBuckets[n] || (spriteBuckets[n] = [])).push(it);
  }
}
/* draw everything standing on one segment */
function emitBucket(n){
  const list = spriteBuckets[n];
  if(!list || emitted[n]) return;
  emitted[n] = 1;
  for(const it of list){
    if(it.kind==='c'){
      drawGantry(it.o);
    } else if(it.kind==='s'){
      drawSign(it.o);
    } else if(it.kind==='g'){
      /* a rival: your car, in its own paint, with its number on the boot */
      const r = it.o;
      /* ---- REAR ONLY, AND THAT IS THE DESIGN -------------------------
         Everyone on a circuit is going the same way, so every car you can see
         is showing you its back. A flank only becomes necessary if the road
         turns far enough to put a rival side-on — and the corner cap below
         means it never does.

         Interstate made into a circuit racer. That was the whole idea, and the
         angled views were solving a problem the design did not have to have.
         ------------------------------------------------------------- */
      const box = drawSprite(RIVAL_SP[(r.body||'MATADOR')+'|'+r.paint] || SP.player,
                             r.x, r.z, r.w, r.wreck>0?0.85:1);
      if(box){
        /* 26px of car is a long way up the road — the place vanished exactly
           when you most wanted it, on the cars you are chasing. 14 shows it
           for anything you can actually make out. */
        if(box.w > 14){
          /* ---- ABOVE THE CAR, AND LEGIBLE ------------------------------
             It sat ON the boot in flat white, so it fought the tail lights
             and the paint and vanished against a pale car. It goes ABOVE the
             roof, in white with a dark stroke around it — the same trick a
             race caption uses, readable over anything behind it.

             And it is the LIVE place now, not the grid number. No "P" — a
             number above a car in a race is a position; saying so is noise. */
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          const fs = Math.max(11, Math.round(box.w*0.34));
          ctx.font = '800 ' + fs + 'px ' +
                     getComputedStyle(document.body).getPropertyValue('--disp');
          const tx = box.x + box.w/2, ty = box.y - box.h - fs*0.35;
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(3, fs*0.34);
          ctx.strokeStyle = 'rgba(6,4,10,.92)';
          ctx.strokeText(String(r.place || r.num), tx, ty);
          ctx.fillStyle = '#fff6e6';
          ctx.fillText(String(r.place || r.num), tx, ty);
          ctx.restore();
        }
      }
    } else if(it.kind==='t'){
      const set = TRAFFIC_SP[it.o.type];
      const img = set ? set[(it.o.paintN|0) % set.length] : SP[it.o.type];
      const box = drawSprite(img, it.o.x, it.o.z, it.o.w);
      /* Tail lights on the same schedule the street lamps use, and BRIGHT the
         moment a car is actually shedding speed. Same rule for everything on
         the road, seen from in front or behind. */
      tailLights(box, it.o.braking);
    } else if(it.kind==='k'){
      /* a SUPER CRUISER is a MATADOR in force colours — same two paints the
         driveable cruiser gets, so the fleet reads as one force */
      const spr = it.o.superc ? (SP.superCop || SP.cop) : SP.cop;
      const box = drawSprite(spr, it.o.x, it.o.z, it.o.w, it.o.wreck>0?0.85:1);
      drawCopLights(box, sirenPhase + it.o.phase);
      /* backing up: white reverse lamps, low and inboard on the tail */
      if(it.o.spd < -60 && it.o.wreck <= 0) drawReverse(box);
    } else if(it.kind==='r'){
      drawSprite(SP.repair, it.o.x, it.o.z, 0.22);
    } else {
      for(const p of it.o.parts){
        if(p.cop){
          const box = drawSprite(SP.cop, p.x + p.off, it.o.z - 300, 0.27);
          drawCopLights(box, sirenPhase);
        } else {
          drawSprite(SP.barrier, p.x, it.o.z, p.w);
        }
      }
    }
  }
}

/* ---- your own brake lights -----------------------------------------------
   Off by day and dim by night when you are coasting; BRIGHT the moment you
   touch the brake, either way. The player had none at all — every other car
   on the road had them.
   -------------------------------------------------------------------------- */
function playerBrakes(box){
  if(!box || box.w < 10) return;
  const lit = lampsOn();
  /* the pedal, the same as the glow above it */
  const on = braking ? 1 : (lit > 0.01 ? 0.34 * lit : 0);
  if(on <= 0.01) return;
  const left = box.x - box.w/2;
  const lw = box.w*0.265, lh = box.h*0.11;
  const ly = box.y - box.h*0.34;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(const lx of [left + box.w*0.135, left + box.w*0.60]){
    ctx.fillStyle = 'rgba(255,' + (braking?52:26) + ',' + (braking?64:38) + ',' + on + ')';
    ctx.fillRect(lx, ly, lw, lh);
    if(box.w > 40){
      const gl = ctx.createRadialGradient(lx+lw/2, ly+lh/2, 0, lx+lw/2, ly+lh/2, lw*1.5);
      gl.addColorStop(0, 'rgba(255,40,60,' + (on*0.55) + ')');
      gl.addColorStop(1, 'rgba(255,30,50,0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(lx+lw/2, ly+lh/2, lw*1.5, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}

function drawPlayer(){
  /* THE CAR HAD A MIND OF ITS OWN. `proj()` adds the road's screen-space sweep
     at that z — but the player IS the camera reference, and PLAYER_Z sits a
     little ahead of `pos`, so the car was being slid sideways by the bend on
     top of whatever you steered. It stays where its lane position puts it and
     the road moves around it, which is how Out Run works. */
  const p = proj(playerX*ROAD, pos + PLAYER_Z);
  p.x -= bendPx(pos + PLAYER_Z);
  p.y -= hillPx(pos + PLAYER_Z);
  if(!p.ok) return;
  const w = p.scale*0.265*ROAD*W/2*2;
  const h = w*SP.player.height/SP.player.width;
  const lean = clamp((playerX-camX)*3.4, -0.28, 0.28);
  const bump = Math.abs(playerX)>1 ? Math.sin(pos*0.02)*w*0.02 : 0;
  /* NOTE: the car's own save/translate/rotate now lives BELOW, after the
     smoke. Leaving it here left the particles inside the car's transform —
     they were drawn at doubled coordinates and took the car off screen with
     them, so the player vanished entirely. */
  /* ---- damage: smoke and fire from under the bonnet ----------------------
     Drawn BEFORE the car and clipped to above its roofline, so it billows out
     from the front and the body occludes the source — you never see where it
     is coming from, which is right, because it is coming from an engine bay
     you are sitting behind.

     Smoke from 75% health down (dmg 25 up); flames from 25% health down
     (dmg 75 up).
     -------------------------------------------------------------------------- */
  if(dmg > 25){
    const q  = clamp((dmg - 25) / 50, 0, 1);        /* 0 at 25 dmg, 1 at 75 */
    const now = performance.now();
    ctx.save();
    /* ---- SMOKE RISES. IT DOES NOT LEAN. ---------------------------------
       The plume is emitted in screen space and must stay that way whatever the
       body is doing. Two things make that true rather than accidental:

         - the transform is reset to the plain device scale here, so no ambient
           rotation from anywhere up the call chain can shear the column
         - the ORIGIN follows the leaning nose, because rotating the sprite
           moves where the bonnet actually is; the source tracks the car while
           the column itself stays vertical

       Which is what you see on a real one: the bonnet swings, the smoke keeps
       going straight up. */
    const _dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
    /* where the nose has swung to, given the body roll */
    const noseX = p.x + Math.sin(lean*0.12) * h * 0.42;
    const noseY = p.y + bump - Math.abs(Math.sin(lean*0.12)) * h * 0.05;
    /* everything below the bonnet line is hidden by the car itself */
    ctx.beginPath();
    ctx.rect(0, 0, W, noseY - h*0.62);
    ctx.clip();

    /* ---- IT HAS TO READ AS DAMAGE WITHOUT BECOMING THE VIEW ---------------
       Density was pushed up until the column held together as one shape, and it
       went past that: at high damage the plume filled the middle of the frame
       and hid the traffic you were about to hit. A game that punishes damage by
       taking the road away is a game that turns one mistake into all of them.

       So the plume is shorter, narrower and thinner. It still reads instantly
       as a wrecked car, because what says that is the SOURCE and the colour,
       not the acreage. */
    const n = Math.round(8 + q*26);
    for(let i=0;i<n;i++){
      /* the golden-angle offset keeps them from banding into visible rings
         the way a uniform i*0.31 does at high counts */
      const life = ((now*0.00040) + i*0.2361) % 1;
      const rise = life * h * (0.85 + q*0.65);   /* was 1.4 + 1.2 - it climbed past the horizon */
      const sway = Math.sin(life*3.4 + i*2.1) * w * (0.05 + life*0.18);
      const rad  = w * (0.07 + life*0.24) * (0.55 + q*0.55);
      /* each puff is thinner now, because there are far more of them stacking
         — otherwise sixty at the old alpha is a solid grey wall */
      const a    = (1 - life*0.86) * (0.10 + q*0.17);
      const sx   = noseX + sway + ((i%3)-1) * w*0.10;
      const sy   = noseY - h*0.58 - rise;
      /* grey to dirty charcoal: true black is invisible on a night road */
      const tone = Math.round(180 - q*100);
      const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rad));
      gr.addColorStop(0, 'rgba('+tone+','+tone+','+(tone+5)+','+a+')');
      gr.addColorStop(1, 'rgba('+tone+','+tone+','+(tone+5)+',0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, rad), 0, 6.2832); ctx.fill();
    }

    /* flames only once it is genuinely going: 25% health and below */
    if(dmg > 75){
      const f = clamp((dmg - 75) / 25, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      const licks = Math.round(10 + f*16);
      for(let i=0;i<licks;i++){
        const life = ((now*0.0011) + i*0.2361) % 1;
        const rise = life * h * (0.38 + f*0.32);
        const sway = Math.sin(life*7 + i*1.7) * w * 0.07 * life;
        const rad  = w * (0.07 + (1-life)*0.08) * (0.7 + f*0.45);
        const a    = (1 - life) * (0.17 + f*0.20);
        const fx   = noseX + sway + ((i%5)-2) * w*0.045;
        const fy   = noseY - h*0.60 - rise;
        const gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, Math.max(1, rad));
        gr.addColorStop(0,   'rgba(255,244,205,'+a+')');
        gr.addColorStop(0.35,'rgba(255,168,54,'+(a*0.85)+')');
        gr.addColorStop(1,   'rgba(210,58,14,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(fx, fy, Math.max(1, rad), 0, 6.2832); ctx.fill();
      }
      /* embers: small, fast, and they carry further than the flame does —
         they are what sells it as burning rather than glowing */
      const embers = Math.round(8 + f*14);
      for(let i=0;i<embers;i++){
        const life = ((now*0.0016) + i*0.2361) % 1;
        const rise = life * h * (0.75 + f*0.6);
        const sway = Math.sin(life*9 + i*3.3) * w * 0.16 * life;
        const a    = (1 - life) * (0.55 + f*0.4);
        const ex   = p.x + sway + ((i%7)-3) * w*0.035;
        const ey   = p.y + bump - h*0.60 - rise;
        const er   = w * 0.012 * (1 - life*0.5);
        ctx.fillStyle = 'rgba(255,' + Math.round(200 - life*120) + ',90,' + a + ')';
        ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.6, er), 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ---- wind and blur ------------------------------------------------------
     Two effects on one scale. `rush` starts at 88% of the normal top speed and
     is full at the limiter; nitrous pushes past that into `warp`, which is
     where the frame actually smears. Below 88% neither exists, so ordinary
     driving is untouched.
     -------------------------------------------------------------------------- */
  const rush = clamp((spd - MAX_SPD*0.88) / (MAX_SPD*0.12), 0, 1);
  const warp = clamp((spd - MAX_SPD) / (MAX_SPD * 0.30), 0, 1);
  if(rush > 0.01){
    const now2 = performance.now();
    ctx.save();
    /* streaks tearing past, radiating from the vanishing point */
    const n = Math.round(10 + rush*26 + warp*30);
    ctx.lineCap = 'round';
    for(let i=0;i<n;i++){
      const life = ((now2*0.0018 * (0.6 + rush*0.9)) + i*0.2361) % 1;
      const ang  = (i*2.39996) % 6.2832;
      const near = 0.10 + life*1.25;
      const cx = W/2, cy = horizon;
      const dx = Math.cos(ang), dy = Math.sin(ang)*0.55;
      const r0 = near * H * 0.95, r1 = r0 + H*(0.05 + rush*0.10 + warp*0.22);
      const a  = (1 - Math.abs(life-0.55)*1.6) * (0.05 + rush*0.13 + warp*0.20);
      if(a <= 0) continue;
      ctx.strokeStyle = 'rgba(215,228,255,' + Math.max(0,a) + ')';
      ctx.lineWidth = 1 + warp*1.4;
      ctx.beginPath();
      ctx.moveTo(cx + dx*r0, cy + dy*r0);
      ctx.lineTo(cx + dx*r1, cy + dy*r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* the car goes on top of its own smoke */
  ctx.save();
  ctx.translate(p.x, p.y + bump);
  ctx.rotate(lean*0.12);
  ctx.scale(1 - Math.abs(lean)*0.10, 1);
  ctx.drawImage(SP.player, -w/2, -h, w, h);
  ctx.restore();

  /* ---- YOUR OWN LIGHT BAR ---------------------------------------------
     Two heads alternating on the same phase the pursuit sirens use, and a wash
     thrown forward onto the road — the same treatment an NPC cruiser gets, so
     it reads as the same machine. */
  /* ---- ANY FORCE CAR ---------------------------------------------------
     Hardcoded to CRUISER, so the SUPER CRUISER had lights drawn on its sprite
     and nothing lit them. `force` on the BODY record is the single truth. */
  if(barOn && inCruiser()){
    const blue = Math.sin(sirenPhase) > 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(const side of [-1, 1]){
      /* ---- MEASURED, NOT ESTIMATED --------------------------------------
         `h*0.90` was one number for every force car, which put the heads on
         the cruiser's bar and a third of a car-height above the super
         cruiser's. The two sprites simply do not carry their bars in the same
         place.

         Sampled from the built sprites — the rows where the strong blue and
         strong red pixels actually are:

             CRUISER        rows 18-22 of 164   mid 0.122
             SUPERCRUISER   rows 49-53 of 168   mid 0.304

         `barY` is that fraction, stored on the BODY record, and the sprite is
         drawn from `p.y - h` to `p.y`, so the head goes at
         `p.y - h*(1 - barY)`. Any future force car declares its own. */
      /* ---- THE X AXIS, MEASURED TOO -------------------------------------
         Sampling the bar row of both sprites for blue and red pixels:

             blue head    centre 0.370 of sprite width
             red head     centre 0.625
             each head    0.235 wide

         Both cars agree to three decimals, because both bars are drawn from
         the same 0.24-0.76 span. Against the car's CENTRE that is -0.130 and
         +0.125 — not the ±0.20 the glow was using, which put each head about
         seventy thousandths of a car-width outboard of the lens it was meant
         to be lighting. The heads were also 0.17 wide against a real 0.235.
         ------------------------------------------------------------------ */
      const barY = (BODY[optBody] && BODY[optBody].barY) || 0.122;
      const bx = p.x + (side < 0 ? -0.130 : 0.125) * w;
      const by = p.y - h*(1 - barY) - h*0.015;
      const lit = (side < 0) === blue;
      const col = side < 0 ? '90,140,255' : '255,70,80';
      /* the unlit head still reads as a LAMP: 0.22 was indistinguishable from
         nothing being there */
      ctx.fillStyle = 'rgba(' + col + ',' + (lit ? 0.95 : 0.45) + ')';
      ctx.fillRect(bx - w*0.1175, by, w*0.235, h*0.045);
      if(lit){
        const gl = ctx.createRadialGradient(bx, by, 0, bx, by, w*0.55);
        gl.addColorStop(0, 'rgba(' + col + ',.45)');
        gl.addColorStop(1, 'rgba(' + col + ',0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(bx, by, w*0.55, 0, 6.2832); ctx.fill();
      }
    }
    /* the wash it throws up the road ahead */
    const wash = ctx.createLinearGradient(0, p.y - h*1.2, 0, horizon);
    wash.addColorStop(0, blue ? 'rgba(90,140,255,.10)' : 'rgba(255,70,80,.10)');
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, horizon, W, p.y - horizon);
    ctx.restore();
  }

  /* ---- the lamps mean something now ----------------------------------
     This glowed harder the FASTER you went, which is backwards: a tail lamp
     does not brighten with speed, it brightens when you brake. Off by day
     while coasting, dim by night, and bright the instant the pedal goes down
     — the same rule every other car on the road follows. */
  /* ---- THE PEDAL, NOTHING ELSE ----------------------------------------
     This used to read `brakeLamp`, which is set by DECELERATION above 900 — so
     lifting off at speed lit them and a gentle brake did not. That is wrong in
     both directions, and it is not how a car works: a brake light is a switch
     on the pedal. Press it and they are on, at a standstill or at 200.

     The NPCs keep the deceleration model, because for them it is an inference
     about a car we do not have a pedal for. For YOU we have the pedal.
     ------------------------------------------------------------------- */
  const litNow = lampsOn();
  const hard = braking;
  const glow = hard ? 0.90 : (litNow > 0.30 ? 0.28 * litNow : 0);
  if(glow > 0.01){
  ctx.globalCompositeOperation='lighter';
  for(const ox of [-0.24,0.24]){
    const g = ctx.createRadialGradient(p.x+ox*w, p.y-h*0.34, 0, p.x+ox*w, p.y-h*0.34, w*0.30);
    g.addColorStop(0,'rgba(255,'+(hard?70:40)+',85,'+glow+')');
    g.addColorStop(1,'rgba(255,60,80,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(p.x+ox*w, p.y-h*0.34, w*0.30, 0, 6.2832); ctx.fill();
  }
  }
  if(nosOn){
    for(const ox of [-0.13,0.13]){
      const g = ctx.createRadialGradient(p.x+ox*w, p.y-h*0.12, 0, p.x+ox*w, p.y-h*0.12, w*0.36);
      g.addColorStop(0,'rgba(150,240,255,.8)');
      g.addColorStop(0.5,'rgba(80,180,255,.35)');
      g.addColorStop(1,'rgba(80,180,255,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(p.x+ox*w, p.y-h*0.12, w*0.36, 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalCompositeOperation='source-over';
}

/* ---- YOU HAVE TO SEE IT ------------------------------------------------
   A grip change nobody can see is a bug report. Rain streaks the glass, the
   scene darkens, and the road picks up a sheen that brightens with the wet.
   ------------------------------------------------------------------------ */
let rainDrops = null;
function drawRain(){
  if(wet < 0.02) return;
  if(!rainDrops || rainDrops.length !== 90){
    rainDrops = [];
    for(let i = 0; i < 90; i++)
      rainDrops.push({ x:Math.random(), y:Math.random(), v:0.5+Math.random(), l:0.5+Math.random() });
  }
  /* the road goes dark and reflective */
  ctx.save();
  ctx.fillStyle = snowy > 0.5 ? 'rgba(210,225,245,' + (wet*0.16 + settle*0.22) + ')'
                              : 'rgba(12,18,30,' + (wet*0.26) + ')';
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createLinearGradient(0, horizon, 0, H);
  sheen.addColorStop(0, 'rgba(150,180,220,' + (wet*0.10) + ')');
  sheen.addColorStop(1, 'rgba(150,180,220,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.restore();

  ctx.save();
  if(snowy > 0.5){
    /* ---- SNOW FALLS, IT DOES NOT STREAK -------------------------------
       Rain is a line; snow is a flake that drifts. Slower, rounder, and it
       wanders sideways instead of leaning with the speed. */
    ctx.fillStyle = 'rgba(250,252,255,' + (0.28 + wet*0.45) + ')';
    for(const d of rainDrops){
      d.y += (0.0030 + d.v*0.0045) * (1 + spd/MAX_SPD*1.1);
      if(d.y > 1){ d.y = -0.05; d.x = Math.random(); }
      const drift = Math.sin((d.y*7 + d.v*6)) * W*0.02;
      const r = Math.max(1, W*0.004*d.l);
      ctx.beginPath();
      ctx.arc(d.x*W + drift, d.y*H, r, 0, 6.2832);
      ctx.fill();
    }
  } else {
    /* the streaks on the glass, leaning with the speed */
    ctx.strokeStyle = 'rgba(190,215,255,' + (0.10 + wet*0.22) + ')';
    ctx.lineWidth = Math.max(1, W*0.0028);
    const lean = 0.10 + (spd/MAX_SPD)*0.42;
    for(const d of rainDrops){
      d.y += (0.010 + d.v*0.016) * (1 + spd/MAX_SPD*2.2);
      if(d.y > 1){ d.y = -0.05; d.x = Math.random(); }
      const x = d.x*W, y = d.y*H, len = H*0.035*d.l*(1 + spd/MAX_SPD);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - len*lean, y + len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSpeedLines(){
  const v = clamp((spd - MAX_SPD*0.55)/(MAX_SPD*1.20 - MAX_SPD*0.55), 0, 1);
  if(v <= 0.02 || reduceMotion) return;
  const n = 36;
  /* the tow shows in the air itself — the wake streaks harder when you are in
     it, which is the only cue you get without taking your eyes off the road */
  const towBoost = 1 + (slipT || 0) * 1.6;
  ctx.strokeStyle = 'rgba(255,220,190,'+((0.03+0.13*v)*towBoost)+')';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  /* ---- THE SHEEN --------------------------------------------------------
     `n` grew with speed, so lines were being ADDED and REMOVED as you
     accelerated — and because each one's position comes from `i`, adding a
     line reshuffles every line after it. The whole field jumped each time the
     count changed, which is the intermittent sheen: not a light, a stripe
     pattern re-seeding itself.

     A fixed 36 now, faded in by `v` instead. The field is the same field at
     every speed; only its opacity and length change.
     ---------------------------------------------------------------------- */
  for(let i=0;i<n;i++){
    const a = (i*97.13 + pos*0.0011) % 1;
    const side = i%2 ? 1 : -1;
    const t = a;
    const x = W/2 + side*(0.12 + t*0.95)*W;
    const y = horizon + t*t*(H-horizon);
    const len = 12 + t*70*v;
    ctx.moveTo(x, y); ctx.lineTo(x + side*len*0.35, y + len);
  }
  ctx.stroke();
}

function drawPursuitWash(){
  // nearest cop that is still behind the camera: light spills over the scene
  let closest = 1e9;
  for(const k of cops){
    if(k.wreck>0) continue;
    const dz = pos + PLAYER_Z - k.z;
    if(dz > 0) closest = Math.min(closest, dz);
  }
  if(closest > 6000) return;
  const inten = clamp(1 - closest/6000, 0, 1) * 0.55;
  const red = Math.sin(sirenPhase) > 0;
  const g = ctx.createLinearGradient(0, H, 0, horizon);
  const c = red ? '255,40,70' : '70,130,255';
  g.addColorStop(0, 'rgba('+c+','+(inten*0.55)+')');
  g.addColorStop(0.45, 'rgba('+c+','+(inten*0.14)+')');
  g.addColorStop(1, 'rgba('+c+',0)');
  ctx.globalCompositeOperation='lighter';
  ctx.fillStyle=g; ctx.fillRect(0,horizon,W,H-horizon);
  ctx.globalCompositeOperation='source-over';
}

function drawFx(){
  ctx.textAlign='center';
  for(const f of fx){
    const a = 1 - f.age/f.life;
    if(f.txt){
      ctx.globalAlpha = a;
      ctx.font = '800 20px "Saira Condensed", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.shadowColor='rgba(255,138,61,.9)'; ctx.shadowBlur=12;
      ctx.fillText(f.txt, f.x, f.y);
      ctx.shadowBlur=0;
    } else {
      ctx.globalAlpha = a*a;
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r*a, 0, 6.2832); ctx.fill();
    }
  }
  ctx.globalAlpha=1;
}

function draw(){
  ctx.save();
  if(shake>0.01){
    const s = shake*shake*11;
    ctx.translate(rnd(-s,s), rnd(-s,s));
  }
  drawSky();
  /* ---- THE GROUND UNDER EVERYTHING ------------------------------------
     This was '#241a30', a dark purple-blue — the same family as the sky. It
     is the base the world is painted on, so anywhere the road or the verge
     does not reach, that colour shows: which is exactly what you see through
     the ground when the road crests above the skyline.

     It is GROUND, so it is the colour of ground. Same values the verge uses,
     a shade darker, so a gap in the geometry reads as more grass rather than
     as a hole into the sky.
     ------------------------------------------------------------------- */
  /* ---- THE BASE MUST MATCH THE VERGE ---------------------------------
     Fixed green. So a DESERT showed a green band under its sand, a TUNDRA a
     green band under its slate, and snow settled on the verge while the
     ground beneath it stayed summer green — which is the clipping you can see
     wherever the road crests above the skyline.

     It is the same colour the verge uses, darkened a shade, so a gap in the
     geometry reads as more ground rather than as a different place.
     ------------------------------------------------------------------- */
  /* ---- THE BASE IS THE FAR VERGE, NOT THE NEAR ONE ---------------------
     Screenshot-confirmed: a bright saturated band under the skyline with the
     pale hazed verge below it. `groundBase()` was the verge's colour AT YOUR
     FEET, painted across the whole lower screen — and the road geometry does
     not reach the horizon, so that near-colour showed in the gap.

     Distance washes the verge toward the haze. The base has to be the FAR end
     of that wash, which is what the gap is showing.
     ------------------------------------------------------------------- */
  /* ---- A GRADIENT, NOT A FILL -----------------------------------------
     A flat colour can never match a gradient: whatever value it takes, there
     is a seam where the drawn verge begins. The base ramps from the haze at
     the horizon to the verge's own near colour further down, so the drawn
     slices land ON it rather than against it.
     ------------------------------------------------------------------- */
  /* The gradient was worse: it made the gap OBVIOUS rather than hiding it,
     which at least proved what the gap is. The road is drawn for DRAW
     segments and simply stops before the horizon — the base is not the bug,
     the missing road is. Until the geometry reaches the horizon this is the
     verge's own colour, lightly hazed, which is the least visible option. */
  ctx.fillStyle = groundBase(0.30);
  ctx.fillRect(0, horizon, W, H-horizon);
  /* ---- HAZE IS ATMOSPHERE BEHIND THE ROAD, NOT A FILM OVER IT ----------
     `drawHaze()` ran AFTER `drawRoad()`, so wherever the band and the verge
     overlapped it painted a lighter film across the grass. That is the seam
     under the skyline — not a wrong colour and not a gap, a translucent strip
     drawn on top of geometry that was already correct.

     Lowering its alpha only made a fainter film. Moving it BEFORE the road
     removes it: the haze now sits on the sky and the distant ground, and the
     road and verge are drawn over it, exactly as they would be in life.
     ------------------------------------------------------------------- */
  drawHaze();
  drawWorld();          /* buckets the sprites */
  drawRoad();           /* paints the road AND emits them, far to near */
  drawPursuitWash();
  drawPlayer();
  drawRain();
  drawSpeedLines();
  drawFx();
  if(CFG.afterDraw) CFG.afterDraw(ctx);
  ctx.restore();

  if(hitFlash>0){
    ctx.fillStyle='rgba(255,70,60,'+(hitFlash*0.26)+')';
    ctx.fillRect(0,0,W,H);
  }
  if(dmg>60){
    const v = (dmg-60)/40;
    const g = ctx.createRadialGradient(W/2,H/2,H*0.22,W/2,H/2,H*0.72);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(1,'rgba(150,10,20,'+(0.20+0.4*v)+')');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  const vg = ctx.createRadialGradient(W/2,H*0.55,H*0.30,W/2,H*0.55,H*0.85);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,0,.55)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
}

/* ---------- HUD ---------- */
const $=id=>document.getElementById(id);
/* ---- rear-view mirror ----------------------------------------------------
   A strip across the top showing what is behind you: traffic closing, and any
   cruiser on your tail. It is a schematic rather than a second render — a
   proper reverse camera would cost a whole extra projection pass, and what you
   actually need to know is "how close, which lane".
   -------------------------------------------------------------------------- */
/* the finish banner: a gantry across the road with chequered boards */
function drawFinish(){
  if(mode !== 'race') return;
  const gap = finishZ - pos;
  if(gap < -600 || gap > 16000) return;
  const p1 = proj(0, finishZ);
  if(!p1.ok) return;
  const wRoad = p1.scale * ROAD * W;
  const y = p1.y;
  const h = Math.max(4, wRoad * 0.10);
  const postW = Math.max(2, wRoad*0.022);
  ctx.save();
  /* uprights */
  ctx.fillStyle = '#2b3038';
  ctx.fillRect(p1.x - wRoad/2 - postW, y - h*2.6, postW, h*2.6);
  ctx.fillRect(p1.x + wRoad/2,          y - h*2.6, postW, h*2.6);
  /* the board */
  const by = y - h*2.6, bh = h*1.15;
  const cells = 16, cw = wRoad/cells;
  for(let i=0;i<cells;i++){
    for(let r2=0;r2<2;r2++){
      ctx.fillStyle = ((i + r2) % 2) ? '#f2f4f8' : '#14171d';
      ctx.fillRect(p1.x - wRoad/2 + i*cw, by + r2*bh/2, cw+0.5, bh/2);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(p1.x - wRoad/2, by + bh - 2, wRoad, 2);
  /* the line on the tarmac */
  const cells2 = 20, cw2 = wRoad/cells2;
  for(let i=0;i<cells2;i++){
    ctx.fillStyle = (i % 2) ? '#f2f4f8' : '#14171d';
    ctx.fillRect(p1.x - wRoad/2 + i*cw2, y, cw2+0.5, Math.max(1.5, h*0.30));
  }
  ctx.restore();
}

/* ---- full-render mirror -------------------------------------------------
   A second projection pass looking backward: the road receding behind you,
   with real perspective, and every sprite placed by the same maths as the
   forward view. Costs a full extra pass — see MIRROR notes in DESIGN.md.
   -------------------------------------------------------------------------- */
function drawMirrorFull(mx, my, mw, mh){
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 5); ctx.clip();

  /* ---- a reverse view that uses the REAL projection -----------------------
     The old one invented its own perspective: an ad-hoc `1/(1+d/900)` scale
     with the road opening downward, which is not how any of the rest of the
     game works — so the lanes splayed, the cars sat at the wrong sizes, and
     nothing lined up with what you could see out of the front.

     This mirrors the actual `proj()` maths with the z axis reversed. The
     vanishing point is at the TOP of the glass and the road widens toward the
     bottom, exactly as it does out of the back window, and a car 20,000 units
     behind is the same size in here as one 20,000 ahead is out there.
     -------------------------------------------------------------------------- */
  const vpy = my + mh*0.16;            /* the horizon, near the top */
  const H_M = mh - (vpy - my);         /* usable depth below it */
  /* ---- THE MIRROR SITS HIGHER THAN THE ROAD ---------------------------
     It used the forward view's `CAM_H` unchanged, which puts the eye at the
     driver's height in a car whose camera is already low — in a small pane
     that reads as a lens lying on the tarmac, with everything behind you
     stretched flat along the bottom edge.

     A real mirror is mounted above your eyeline and looks slightly DOWN. 1.55x
     lifts it enough to see over what is following you rather than up at it.
     -------------------------------------------------------------------- */
  /* ---- ONE MIRROR, THE SAME IN EVERY CAR -------------------------------
     A mirror is glass on a bracket, not a property of the chassis. Sitting it
     at a per-car height meant a formula car's mirror looked along the tarmac
     while a lorry's looked down from a cab — and in a pane this small the low
     ones showed nothing but the road surface with a lorry filling it.

     Fixed at 2.15x the driving eye for every vehicle, which is high enough to
     see OVER whatever is following you rather than at its bumper.
     ------------------------------------------------------------------- */
  const CAM_H_M = CAM_H * 2.15;
  /* the same camera constants as the forward view, remapped to this glass */
  function rproj(worldX, worldZ){
    const dz = pos - worldZ;           /* BEHIND is positive here */
    if(dz <= 200) return null;
    const scale = CAM_D/dz;
    return {
      scale,
      x: mx + mw/2 + scale*(worldX - camX*ROAD)*mw/2,
      y: vpy + scale*CAM_H_M*H_M/2,
      w: scale*ROAD*mw/2
    };
  }

  /* sky above the horizon, tarmac below */
  const sky = ctx.createLinearGradient(mx, my, mx, vpy);
  sky.addColorStop(0,'#0d1220'); sky.addColorStop(1,'#28324a');
  ctx.fillStyle = sky; ctx.fillRect(mx, my, mw, vpy - my);
  ctx.fillStyle = '#141821'; ctx.fillRect(mx, vpy, mw, mh - (vpy - my));

  /* the road, drawn far-to-near in real z steps so it converges properly */
  const SEG = 900;
  let prev = null;
  for(let d2 = 34000; d2 > 200; d2 -= SEG){
    const a = rproj(0, pos - d2), b2 = rproj(0, pos - d2 + SEG);
    if(!a || !b2) continue;
    const idx = Math.floor((pos - d2)/SEG);
    ctx.fillStyle = (idx % 2) ? '#1e232c' : '#191d25';
    ctx.beginPath();
    ctx.moveTo(a.x - a.w, a.y); ctx.lineTo(a.x + a.w, a.y);
    ctx.lineTo(b2.x + b2.w, b2.y); ctx.lineTo(b2.x - b2.w, b2.y);
    ctx.closePath(); ctx.fill();
    /* lane markings, dashed on the same cycle as the road ahead */
    if(idx % 2){
      ctx.strokeStyle = 'rgba(226,214,168,.55)';
      for(let L=1;L<LANES;L++){
        const f = L/LANES - 0.5;
        ctx.lineWidth = Math.max(0.6, a.w*0.035);
        ctx.beginPath();
        ctx.moveTo(a.x + f*a.w*2, a.y);
        ctx.lineTo(b2.x + f*b2.w*2, b2.y);
        ctx.stroke();
      }
    }
    /* the hard shoulder either side */
    ctx.strokeStyle = 'rgba(232,232,236,.5)';
    ctx.lineWidth = Math.max(0.5, a.w*0.03);
    ctx.beginPath(); ctx.moveTo(a.x-a.w, a.y); ctx.lineTo(b2.x-b2.w, b2.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x+a.w, a.y); ctx.lineTo(b2.x+b2.w, b2.y); ctx.stroke();
    prev = b2;
  }

  /* ---- what you see is the FRONT of the car ------------------------------
     The sprites are rear views — that is what you look at all game. Drawing
     them in the mirror showed you every car's tail lights while it was coming
     at you head-on. These are drawn front-on instead: windscreen, headlights,
     grille. Headlights burn on the same schedule as the street lamps, so the
     road behind lights up at dusk with everything else.
     -------------------------------------------------------------------------- */
  const lampNow = lampsOn();
  const back = [];
  for(const c of traffic) if(c.z < pos)
    back.push({ o:c, w:c.w, tint:(c.type==='truck'?'#8b8f96':c.type==='coupe'?'#7a3b46':'#3c4a63'), cop:false });
  for(const k of cops){ if(k.wreck>0||k.z>=pos) continue;
    back.push({ o:k, w:k.w||0.27, tint:'#dfe4ec', cop:true }); }
  for(const r of racers) if(r.z < pos)
    back.push({ o:r, w:r.w, tint:(PAINT[r.paint]||PAINT.WHITE).body, cop:false });
  back.sort((a,b) => a.o.z - b.o.z);

  for(const it of back){
    const p1 = rproj(it.o.x*ROAD, it.o.z);
    if(!p1) continue;
    const sw = p1.scale * it.w * ROAD * mw;
    if(sw < 1.4) continue;
    const sh = sw * 0.60;
    const x0 = p1.x - sw/2, y0 = p1.y - sh;

    /* ---- THE REAL NOSE, once it is big enough to read -------------------
       Below about 26px wide the sprite is mush and the drawn block is
       cleaner, so the simplified version stays for distant cars. Close up
       you get the actual front — which is the whole reason the painters
       exist.

       ---- AND IT USED TO POP -------------------------------------------
       That was a hard switch at exactly 26px: one frame a car was a drawn
       block, the next it was a painted sprite, and the two do not look alike.
       Every car crossed that line at the same screen width, so the change was
       not just visible - it was visible in the same place every time, which is
       what made it read as a fault rather than as detail arriving.

       Both renderings are right; the reasoning above still holds at both ends.
       What was missing was the middle. The sprite now fades IN across a band
       rather than appearing, drawn over the block instead of instead of it, so
       the detail arrives gradually and there is no frame where the car changes
       identity. A blend costs one extra draw on a handful of cars in a strip
       of screen the size of a mirror.
       ------------------------------------------------------------------- */
    const fs = (!it.cop && it.o.type && FRONT_SP[it.o.type])
      ? FRONT_SP[it.o.type][(it.o.paintN|0) % FRONT_SP[it.o.type].length] : null;
    /* fully the block below FADE_LO, fully the sprite above FADE_HI */
    const FADE_LO = 20, FADE_HI = 34;
    const spriteMix = fs ? clamp((sw - FADE_LO) / (FADE_HI - FADE_LO), 0, 1) : 0;
    if(spriteMix >= 1){
      const fh = sw * fs.height / fs.width;
      ctx.drawImage(fs, x0, p1.y - fh, sw, fh);
      continue;
    }

    /* body */
    ctx.fillStyle = it.tint;
    ctx.beginPath(); ctx.roundRect(x0, y0, sw, sh, Math.max(0.5, sw*0.10)); ctx.fill();
    /* windscreen: dark glass across the upper half, raked in */
    ctx.fillStyle = 'rgba(14,20,30,.86)';
    ctx.beginPath();
    ctx.roundRect(x0 + sw*0.14, y0 + sh*0.10, sw*0.72, sh*0.38, Math.max(0.4, sw*0.05));
    ctx.fill();
    /* grille */
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x0 + sw*0.24, y0 + sh*0.70, sw*0.52, sh*0.16);

    if(sw > 3){
      /* headlights, lit on the street-lamp schedule */
      const hw = sw*0.20, hh = sh*0.17, hy = y0 + sh*0.54;
      /* A headlight is not on at noon. `lampNow` is the same ramp the street
         lamps use, so anything above a real dusk threshold means dark enough
         to need them — 0.01 let a sliver of daylight count. */
      const on = lampNow > 0.30;
      for(const hx of [x0 + sw*0.06, x0 + sw - sw*0.06 - hw]){
        ctx.fillStyle = on ? 'rgba(255,248,222,.98)' : 'rgba(190,198,210,.75)';
        ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, hh*0.4); ctx.fill();
        if(on){
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const gl = ctx.createRadialGradient(hx+hw/2, hy+hh/2, 0, hx+hw/2, hy+hh/2, hw*2.4);
          gl.addColorStop(0,'rgba(255,250,225,'+(0.55*lampNow)+')');
          gl.addColorStop(1,'rgba(255,240,200,0)');
          ctx.fillStyle = gl;
          ctx.beginPath(); ctx.arc(hx+hw/2, hy+hh/2, hw*2.4, 0, 6.2832); ctx.fill();
          ctx.restore();
        }
      }
      /* AMBER markers, not red. Brake lights face rearward — you cannot see
         them from in front of a car, and putting red lamps on a grille made
         every car in the mirror look like it was reversing at you. */
      if(lampNow > 0.30){
        ctx.fillStyle = 'rgba(255,176,72,'+(0.50*lampNow)+')';
        ctx.fillRect(x0 + sw*0.02, y0 + sh*0.34, sw*0.05, sh*0.13);
        ctx.fillRect(x0 + sw*0.93, y0 + sh*0.34, sw*0.05, sh*0.13);
      }
    }
    if(it.cop){
      const on2 = Math.floor(sirenPhase*1.4) % 2;
      ctx.fillStyle = on2 ? '#3b6bff' : '#ff2b4a';
      ctx.fillRect(x0, y0 - Math.max(1, sh*0.12), sw, Math.max(1, sh*0.12));
    }

    /* the detail arriving, over the block that is already there */
    if(spriteMix > 0){
      const fh = sw * fs.height / fs.width;
      ctx.save();
      ctx.globalAlpha = spriteMix;
      ctx.drawImage(fs, x0, p1.y - fh, sw, fh);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ---- the starting line ---------------------------------------------------
   The standing start I added has a cliff in it: the road is motionless, the
   car is motionless, and nothing at all happens until you find the pedal — so
   the game reads as HUNG rather than as waiting for you. It needs to say so.
   Shows only before you have first moved, and never comes back.
   -------------------------------------------------------------------------- */
let hasMoved = false;
function drawStartPrompt(){
  if(hasMoved) return;
  if(spd > MAX_SPD*0.02){ hasMoved = true; return; }
  const t = performance.now()/1000;
  const pulse = 0.55 + Math.abs(Math.sin(t*2.2))*0.45;
  ctx.save();
  ctx.textAlign = 'center';
  /* a starting-grid strip across the road */
  const y = H*0.66, bw = W*0.62, bh = H*0.052;
  ctx.fillStyle = 'rgba(8,8,12,.72)';
  ctx.fillRect(W/2 - bw/2, y - bh/2, bw, bh);
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
  ctx.strokeRect(W/2 - bw/2, y - bh/2, bw, bh);
  ctx.font = '700 ' + Math.round(H*0.026) + 'px ' +
             getComputedStyle(document.body).getPropertyValue('--disp');
  ctx.fillStyle = 'rgba(255,236,190,' + pulse + ')';
  const touch = !!(AR && AR.touch);
  ctx.fillText(touch ? 'HOLD THE RIGHT PEDAL' : 'HOLD UP ARROW', W/2, y + H*0.009);
  ctx.font = '400 ' + Math.round(H*0.014) + 'px monospace';
  ctx.fillStyle = 'rgba(200,208,224,.72)';
  ctx.fillText('STANDING START \u00B7 1ST GEAR', W/2, y + bh*0.62);
  ctx.restore();
}

function drawMirror(){
  const mw = Math.min(W*0.62, 250), mh = 44;
  const mx = (W - mw)/2 + viewShift, my = 6;
  ctx.save();
  /* the housing */
  ctx.fillStyle = '#0a0c11';
  ctx.beginPath(); ctx.roundRect(mx-3, my-3, mw+6, mh+6, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(150,160,180,.35)'; ctx.lineWidth = 1.4;
  ctx.stroke();
  /* the glass, darker at the edges like a real convex mirror */
  const gl = ctx.createLinearGradient(mx, my, mx, my+mh);
  gl.addColorStop(0,'#141a24'); gl.addColorStop(0.5,'#0e131b'); gl.addColorStop(1,'#0a0e15');
  ctx.fillStyle = gl;
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 5); ctx.fill();
  if(optMirror === 'FULL'){
    drawMirrorFull(mx, my, mw, mh);
    /* the housing sheen still goes on top */
    const sh2 = ctx.createLinearGradient(mx, my, mx+mw*0.5, my+mh);
    sh2.addColorStop(0,'rgba(255,255,255,.07)');
    sh2.addColorStop(0.5,'rgba(255,255,255,0)');
    ctx.fillStyle = sh2;
    ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 5); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 5); ctx.clip();

  /* the road receding AWAY from you, so it narrows downward */
  ctx.strokeStyle = 'rgba(150,170,200,.14)'; ctx.lineWidth = 1;
  for(let i=0;i<=LANES;i++){
    const f = i/LANES;
    ctx.beginPath();
    ctx.moveTo(mx + mw*(0.10 + f*0.80), my + mh);
    ctx.lineTo(mx + mw*(0.36 + f*0.28), my + 4);
    ctx.stroke();
  }

  /* anything behind the player, nearest drawn largest and lowest */
  const back = [];
  for(const c of traffic){ const d = pos - c.z; if(d > 0 && d < 5200) back.push({d, x:c.x, cop:false}); }
  for(const k of cops){ if(k.wreck>0) continue; const d = pos - k.z; if(d > 0 && d < 5200) back.push({d, x:k.x, cop:true}); }
  back.sort((a,b)=>b.d-a.d);
  for(const o of back){
    const f = 1 - o.d/5200;                     /* 1 = right behind you */
    const sw = mw * (0.045 + f*0.075);
    const sh = sw * 0.62;
    const px = mx + mw*0.5 + (o.x/1.18) * mw * (0.16 + f*0.30);
    const py = my + 6 + f*(mh - sh - 10);
    if(o.cop){
      ctx.fillStyle = 'rgba(210,220,235,.9)';
      ctx.fillRect(px-sw/2, py, sw, sh);
      /* the bar, alternating */
      const on = Math.floor(sirenPhase*1.4) % 2;
      ctx.fillStyle = on ? '#3b6bff' : '#ff2b4a';
      ctx.fillRect(px-sw/2, py-2.5, sw, 2.5);
    } else {
      ctx.fillStyle = 'rgba(120,132,150,' + (0.35 + f*0.5) + ')';
      ctx.fillRect(px-sw/2, py, sw, sh);
      /* headlights, which is what you actually notice in a mirror */
      ctx.fillStyle = 'rgba(255,246,214,' + (0.35 + f*0.6) + ')';
      ctx.fillRect(px-sw/2+1, py+sh*0.28, sw*0.22, sh*0.26);
      ctx.fillRect(px+sw/2-1-sw*0.22, py+sh*0.28, sw*0.22, sh*0.26);
    }
  }
  ctx.restore();
  /* a hint of curvature across the glass */
  const sheen = ctx.createLinearGradient(mx, my, mx+mw*0.5, my+mh);
  sheen.addColorStop(0,'rgba(255,255,255,.07)');
  sheen.addColorStop(0.5,'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 5); ctx.fill();
  ctx.restore();
}

/* ---- the dials ----------------------------------------------------------
   Drawn once per frame into their own small canvas, at device resolution so
   the needles stay crisp. Sweep runs from 7 o'clock round to 5 o'clock, which
   is the arc every car instrument has used since they stopped being vertical.
   -------------------------------------------------------------------------- */
let dialDpr = 0;
function drawDials(){
  if(!dialCx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if(dpr !== dialDpr){
    dialDpr = dpr;
    dialCv.width = 115*dpr; dialCv.height = 59*dpr;
  }
  const g = dialCx;
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,115,59);

  const rpm = engineRpm();
  face(g, 30, 30, 26, rpm / redline(), (rpm/1000).toFixed(1), 'x1000',
       0.86, '#5ff0d8', '#ff3b5c', undefined, gearLabel());
  /* ---- THE DIAL HAS TO REACH ------------------------------------------
     The needle was `spd / MAX_SPD`, so 200mph was full deflection and
     anything faster simply pegged — which is the other half of why nothing
     ever appeared to go above 200. The face reads to 260 now, so FORMULA's
     218 sits where it belongs and a bottle takes it past that.
     ------------------------------------------------------------------- */
  const DIAL_TOP = 260;
  const mph = clamp((spd / MAX_SPD * 200) / DIAL_TOP, 0, 1);
  face(g, 85, 30, 26, mph, Math.round(spd/MAX_SPD*200), 'MPH',
       200/DIAL_TOP, '#ffd98a', '#ff3b5c', dist);
}
function gearLabel(){
  /* Just the number. The D prefix was noise — you know which box you chose,
     and the only thing worth reading at a glance is which gear you are in. */
  return (gear >= 1 && gear <= gearTable().length) ? String(gear) : 'N';
}
function dialCurve(f){ return clamp(f, 0, 1.02); }
function face(g, cx, cy, r, frac, big, label, redAt, tint, red, odo, gearTag){
  const A0 = Math.PI*0.75, A1 = Math.PI*2.25;      /* 7 o'clock to 5 o'clock */
  frac = dialCurve(frac);
  /* needed by the numerals AND the needle, and the needle is now drawn last,
     so it has to be computed up here rather than beside the pointer */
  const hot = frac >= redAt;
  /* the bezel */
  g.beginPath(); g.arc(cx,cy,r,0,6.2832);
  g.fillStyle='rgba(10,12,16,.92)'; g.fill();
  g.strokeStyle='rgba(150,160,180,.30)'; g.lineWidth=1.2; g.stroke();
  /* the red zone, painted into the dial face */
  g.beginPath();
  g.arc(cx,cy,r-4, A0+(A1-A0)*dialCurve(redAt), A1);
  g.strokeStyle='rgba(255,59,92,.30)'; g.lineWidth=3.4; g.stroke();
  /* ticks */
  for(let i=0;i<=10;i++){
    const a = A0 + (A1-A0)*dialCurve(i/10);
    const inr = (i%5===0) ? r-7 : r-4.5;
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*inr, cy+Math.sin(a)*inr);
    g.lineTo(cx+Math.cos(a)*(r-2), cy+Math.sin(a)*(r-2));
    g.strokeStyle = (i/10 >= redAt) ? 'rgba(255,120,140,.75)' : 'rgba(190,200,220,.55)';
    g.lineWidth = (i%5===0) ? 1.5 : 0.9;
    g.stroke();
  }
  /* the reading */
  g.textAlign='center';
  /* Both of these were overflowing the bezel: 9px numerals plus a label at
     0.84r on a 26px face put the unit outside the glass. Pulled in and
     shrunk so everything sits INSIDE the dial. */
  g.font='700 7.5px ' + getComputedStyle(document.body).getPropertyValue('--disp');
  g.fillStyle = hot ? red : '#e6ecf6';
  g.fillText(big, cx, cy+r*0.40);
  g.font='400 3.2px ' + getComputedStyle(document.body).getPropertyValue('--px');
  g.fillStyle='rgba(150,160,180,.72)';
  g.fillText(label, cx, cy+r*0.62);

  /* ---- the odometer -----------------------------------------------------
     A mechanical drum inside the speedometer face, where a car keeps it,
     rather than a separate DISTANCE readout at the top of the screen. The
     last digit SCROLLS continuously the way a real trip meter does, which is
     also the only motion on the dial when you are holding a steady speed.
     ---------------------------------------------------------------------- */
  if(odo !== undefined){
    const dw = 4.8, dh = 6.2, n = 5;
    const bx = cx - (n*dw)/2, by = cy - r*0.56;
    g.save();
    g.fillStyle = 'rgba(6,8,12,.95)';
    g.fillRect(bx-1, by-1, n*dw+2, dh+2);
    g.strokeStyle = 'rgba(150,160,180,.28)'; g.lineWidth = 0.7;
    g.strokeRect(bx-1, by-1, n*dw+2, dh+2);
    /* ---- a real drum stack -----------------------------------------------
       Every drum is geared to the one on its right, so when a digit passes 9
       the one beside it starts turning too — 1 2 8 9 9 rolling to 1 2 9 0 0
       moves FOUR drums at once, not one. Only the last one was animating,
       which read as a digital counter with a gimmick on the end rather than
       as a mechanical odometer.

       Each drum rolls only through the last tenth of its own revolution,
       which is the carry; the tenths drum is geared directly and turns
       continuously.
       ---------------------------------------------------------------------- */
    const tenths = odo * 10;
    for(let i=0;i<n;i++){
      const place = Math.pow(10, n-1-i);
      const v = tenths / place;
      const digit = Math.floor(v) % 10;
      const f = v - Math.floor(v);
      const last = (i === n-1);
      /* Continuous on the tenths drum; a TIGHT carry on the rest. A 10%
         window meant every drum was mid-roll at once and 1289.9 already read
         1290 — the reading was running ahead of the distance. The carry now
         happens in the last 3% of a revolution, so a digit shows its true
         value almost all the time and snaps through the change. */
      const roll = last ? f : (f > 0.97 ? (f - 0.97) / 0.03 : 0);
      g.save();
      g.beginPath(); g.rect(bx + i*dw, by, dw, dh); g.clip();
      g.textAlign='center';
      g.font = '700 5.2px ' + getComputedStyle(document.body).getPropertyValue('--disp');
      g.fillStyle = last ? '#ffd98a' : '#dfe6f2';
      const cxd = bx + i*dw + dw/2, base = by + dh - 1.4;
      if(roll > 0){
        g.fillText(digit,        cxd, base - roll*dh);
        g.fillText((digit+1)%10, cxd, base + (1-roll)*dh);
      } else {
        g.fillText(digit, cxd, base);
      }
      g.restore();
      if(i < n-1){
        g.strokeStyle='rgba(255,255,255,.10)'; g.lineWidth=0.5;
        g.beginPath(); g.moveTo(bx+(i+1)*dw, by); g.lineTo(bx+(i+1)*dw, by+dh); g.stroke();
      }
    }
    g.restore();
  }

  /* the selected gear, at twelve o'clock inside the bezel — the one number
     you glance at without taking your eyes far from the needle */
  if(gearTag !== undefined){
    g.save();
    g.textAlign = 'center';
    g.fillStyle = 'rgba(6,8,12,.9)';
    g.beginPath(); g.arc(cx, cy - r*0.46, 6.2, 0, 6.2832); g.fill();
    g.strokeStyle = 'rgba(150,160,180,.34)'; g.lineWidth = 0.7; g.stroke();
    g.font = '700 7px ' + getComputedStyle(document.body).getPropertyValue('--disp');
    g.fillStyle = optManual ? '#5ff0d8' : 'rgba(200,210,228,.85)';
    g.fillText(gearTag, cx, cy - r*0.46 + 2.5);
    g.restore();
  }

  /* ---- the needle, LAST ---------------------------------------------------
     It has to sweep over everything else on the face. The drum, the ticks and
     the numerals are printed on the dial; the needle is a physical pointer
     above the glass, so it passes across the odometer rather than under it.
     Drawn here, after all the face furniture, for exactly that reason.
     -------------------------------------------------------------------------- */
  /* the needle */
  const a = A0 + (A1-A0)*frac;
  g.save();
  g.strokeStyle = hot ? red : tint;
  g.shadowColor = hot ? red : tint; g.shadowBlur = 6;
  g.lineWidth = 1.9; g.lineCap='round';
  g.beginPath();
  g.moveTo(cx-Math.cos(a)*4, cy-Math.sin(a)*4);
  g.lineTo(cx+Math.cos(a)*(r-6), cy+Math.sin(a)*(r-6));
  g.stroke();
  g.restore();
  g.beginPath(); g.arc(cx,cy,2.4,0,6.2832);
  g.fillStyle = hot ? red : tint; g.fill();
}

function drawBust(){
  if(bustT <= 0) return;
  const q = Math.min(1, bustT/3);
  /* red wash closing in from the edges as they box you */
  const gr = ctx.createRadialGradient(W/2,H*0.55,H*0.10, W/2,H*0.55,H*0.85);
  gr.addColorStop(0,'rgba(255,40,60,0)');
  gr.addColorStop(1,'rgba(255,30,50,'+(q*0.42)+')');
  ctx.fillStyle = gr; ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.textAlign='center';
  ctx.font = '700 ' + Math.round(H*0.030) + 'px ' + getComputedStyle(document.body).getPropertyValue('--disp');
  ctx.fillStyle = 'rgba(255,225,225,' + (0.5 + Math.abs(Math.sin(bustT*7))*0.5) + ')';
  ctx.fillText('PULL AWAY', W/2, H*0.34);
  ctx.font = '600 ' + Math.round(H*0.016) + 'px monospace';
  ctx.fillStyle = 'rgba(255,180,180,.85)';
  ctx.fillText(Math.max(0, 3 - bustT).toFixed(1) + ' SECONDS', W/2, H*0.34 + H*0.028);
  /* the bar draining */
  const bw = W*0.42;
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(W/2-bw/2, H*0.38, bw, 5);
  ctx.fillStyle='#ff3b5c'; ctx.fillRect(W/2-bw/2, H*0.38, bw*(1-q), 5);
  ctx.restore();
}

function hud(){


  /* the score slot now carries the one number that matters */
  $('score').textContent = CFG.hudScore ? CFG.hudScore(dist)
                                        : (dist.toFixed(1) + ' MI');

  const cw = $('clockWrap');
  if(cw){
    const on = clockRuns();
    cw.hidden = !on;
    if(on){
      $('clock').textContent = Math.ceil(clock);
      cw.classList.toggle('low', clock <= 5);
    }
  }
  /* the bottle empties as you burn it */
  nitroBtn.style.setProperty('--nos', nos + '%');
  /* ---- THESE ARE RACE PANELS -------------------------------------------
     They were shown in a race and never HIDDEN again, so a race followed by a
     TEST DRIVE still read "3.4 MI TO GO" and "P7/12". A panel that appears
     conditionally has to disappear on the same condition.

     The distance also has to come from the round you are actually in — a
     tournament leg is 10, 12, 16 or 24 miles, not always RACE_MILES. */
  const racing = (mode === 'race');
  $('placeWrap').hidden = !racing;
  $('distWrap').hidden  = !racing;
  if(racing){
    $('place').textContent = place + '/12';
    const legMi = tourOn ? TOUR_MILES[tourRound] : RACE_MILES;
    $('dist').innerHTML = Math.max(0, legMi - dist).toFixed(1) + '<i>MI</i>';
  }
  drawDials();
  drawWheel();

  const active = cops.some(k=>k.wreck<=0 && k.onPlayer !== false);
  $('pursuit').className = active ? 'on' : '';
  $('pursuit').textContent = 'PURSUIT \u00D7'+cops.filter(k=>k.wreck<=0 && k.onPlayer !== false).length+'  \u00B7  HEAT '+heat +
    (combo>1 ? '  \u00B7  \u00D7'+combo : '');
  nitroBtn.disabled = nos<=8;
  brakeBtn.disabled = state!=='driving';
  nitroBtn.classList.toggle('hot', nosOn);
}

/* ---------- loop ---------- */
const FIXED=1/120;
function frameLoop(now){
  if(last===undefined) last=now;
  let dt = Math.min(0.05,(now-last)/1000); last=now;
  dayClock += dt;
  if(state==='driving'){
    acc += dt;
    let g=0;
    while(acc>=FIXED && state==='driving' && g++<8){ step(FIXED); acc-=FIXED; }
  } else if(state==='title' || state==='garage'){
    /* Nothing. The veil is opaque, so advancing the world behind it was work
       thrown away sixty times a second — and on the garage screen it was
       competing with the car you are trying to look at. */
  } else {
    pos += Math.max(0, spd*=0.985)*dt;   /* wrecked: rolling to a stop */
    for(const f of fx){ f.age+=dt; f.x+=(f.vx||0)*dt; f.y+=(f.vy||0)*dt; if(f.vx!==undefined) f.vy+=700*dt; }
    fx = fx.filter(f=>f.age<f.life);
    shake=Math.max(0,shake-dt*2.2);
    sirenPhase += dt*7;
  }
  if(state !== 'title' && state !== 'garage') draw();
  /* NO frame-stamp blur here. Drawing the canvas back onto itself under a
     setTransform tiled the frame into quadrants: the backing store is in
     DEVICE pixels (W*dpr) while the draw was in CSS units, and reading a
     canvas while writing to it is fragile besides. The speed read comes from
     the wind streaks in drawPlayer instead, which cost nothing and cannot
     corrupt the frame. If a real smear is wanted it needs a second offscreen
     canvas, not a self-copy. */
  drawFinish();
  if(optMirror !== 'OFF') drawMirror();
  drawBust(); hud();
  /* ---- CFG.overlay(ctx) — the LAST thing on the frame -------------------
     `afterDraw` runs inside the world transform, before the mirror, the bust
     card and the HUD, which is right for a minimap but wrong for anything
     that has to REPLACE the view: Motorsport's pit box painted a full-screen
     garage and the rear-view mirror still floated over it, a strip of road
     hanging in mid-air indoors. This hook fires after everything, in plain
     CSS pixels, for a fork that owns the whole screen for a moment. */
  if(CFG.overlay) CFG.overlay(ctx);
  requestAnimationFrame(frameLoop);
}

/* ---------- overlays ---------- */
/* `go` may be a single callback (one .go button) or a map of data-act names. */
function openVeil(html, go){
  veilBody.innerHTML = html;
  veil.classList.remove('hidden');
  if(typeof go === 'function'){
    const b = veilBody.querySelector('.go');
    if(b) b.addEventListener('click', ()=>{ veil.classList.add('hidden'); if(go) go(); });
    return;
  }
  /* a swatch carries its colour in the action name */
  veilBody.querySelectorAll('[data-act^="paint:"]').forEach(b =>
    b.addEventListener('click', () => {
      optPaint = b.dataset.act.slice(6);
      /* only an UNRESTRICTED car's choice becomes the remembered one — picking
         black for the cruiser must not turn every other car black */
      if(paintChoices().length >= BASE_PAINT_KEYS.length){
        freePaint = optPaint;
        if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { paint:optPaint });
      }
      buildSprites();
      showGarage();
    }));
  veilBody.querySelectorAll('[data-act]').forEach(b => {
    /* SWATCHES ARE NOT ACTIONS. This hid the veil for EVERY [data-act] button
       whether or not there was a handler for it — so tapping a colour, which
       has no entry in `go`, tore the menu down and left the game rendering a
       state it had never entered: a black screen with the HUD on top.
       Only a button with a real action closes the menu now. */
    if(b.dataset.act.indexOf('paint:') === 0) return;
    b.addEventListener('click', () => {
      const fn = go && go[b.dataset.act];
      if(!fn) return;                 /* no action, no dismissal */
      veil.classList.add('hidden');
      fn();
    });
  });
}

/* ===========================================================================
   THE GARAGE

   Between PLAY and the first mile. Car, paint and gearbox are choices about
   how the run will FEEL, so they belong together and in front of you — not
   buried three taps deep in a pause menu you open mid-corner.

   The car is drawn live from its own sprite, so what you pick is what you get,
   and the numbers are read straight off the BODY table rather than being
   written out by hand — they cannot drift from the physics.
   =========================================================================== */
function garageCard(){
  const B = BODY[optBody];
  const top = Math.round(200 * B.vmax);
  /* pull is a torque multiplier; shown as a 5-bar rating so it can be
     compared at a glance rather than being an unexplained decimal */
  const bars = (v, lo, hi) => {
    const n = Math.max(1, Math.min(5, Math.round(1 + (v-lo)/(hi-lo)*4)));
    return '<u class="bar">' + '<i class="on"></i>'.repeat(n) +
           '<i></i>'.repeat(5-n) + '</u>';
  };
  return '<div class="gwrap">' +
    '<canvas id="gcar" width="300" height="180"></canvas>' +
    '<div class="gname">' + optBody + '</div>' +
    '<div class="gnote">' + B.note + '</div>' +
    '<div class="gstat"><span>TOP SPEED</span><b>' + top + ' MPH</b></div>' +
    '<div class="gstat"><span>0\u201360 MPH</span><b>' + zeroSixty(optBody).toFixed(1) + 's</b></div>' +
    /* TOP END was `vmax` drawn as bars, and TOP SPEED is `vmax` written as a
       number — the same fact twice. Gone. */
  '</div>';
}
/* ---- WHAT COLOURS THIS CAR COMES IN --------------------------------------
   A patrol car is white or black. Not because the painter cannot manage lime,
   but because a lime police car is a different joke than the one this game is
   telling. Everything else takes the full dozen.
   ------------------------------------------------------------------------- */
function paintChoices(){
  /* the two force cars share one palette — the super cruiser is one of theirs */
  if(optBody === 'CRUISER' || optBody === 'SUPERCRUISER') return ['WHITE','BLACK'];
  if(optBody === 'CAB')     return ['GOLD'];        /* a cab is yellow */
  /* the iridescent set only appears once the sports ladder has been won */
  return unlocked('iridescent') ? PAINT_KEYS : BASE_PAINT_KEYS;
}

/* ---- A RESTRICTED CAR MUST NOT EAT YOUR COLOUR --------------------------
   Selecting the cruiser forced `optPaint` to WHITE, and that is the SAME
   variable every other car reads — so picking it once repainted the whole
   garage. The colour you chose for ordinary cars is remembered separately and
   put back the moment you leave a restricted one.
   ------------------------------------------------------------------------ */
let freePaint = 'WHITE';
function syncPaintForBody(){
  const allowed = paintChoices();
  if(allowed.length >= BASE_PAINT_KEYS.length) optPaint = freePaint;
  else if(allowed.indexOf(optPaint) < 0)   optPaint = allowed[0];
}
function paintSwatches(){
  return '<div class="swatches">' + paintChoices().map(k =>
    '<button class="sw' + (k === optPaint ? ' on' : '') + '" data-act="paint:' + k +
    '" style="background:' + PAINT[k].body + '" aria-label="' + k + '"></button>'
  ).join('') + '</div>';
}
function drawGarageCar(){
  const cv = document.getElementById('gcar');
  if(!cv) return;
  const g2 = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio||1);
  cv.width = 300*dpr; cv.height = 180*dpr;
  cv.style.width='300px'; cv.style.height='180px';
  g2.setTransform(dpr,0,0,dpr,0,0);
  g2.clearRect(0,0,300,180);
  const img = SP.player;
  if(!img) return;
  const bw = 240, bh = bw*img.height/img.width;
  g2.drawImage(img, (300-bw)/2, 176-bh, bw, bh);
}
function showGarage(){
  document.body.classList.remove('titling');
  /* the garage is reachable from the end card, so it has to tear down too —
     but it keeps the menu music rather than restarting it */
  if(state !== 'garage'){ endRun(true); state = 'garage'; menuMusic(); }
  state = 'garage';
  openVeil(
    '<div class="eyebrow">CHOOSE YOUR CAR</div>' +
    garageCard() +
    '<style>.swatches{--sw:' + paintChoices().length + '}</style>' +
    paintSwatches() +
    '<div class="gbox">' +
      '<button class="go ghost" data-act="prev">\u2039</button>' +
      '<button class="go ghost" data-act="box">GEARBOX \u00B7 <b>' +
        (optManual ? 'MANUAL' : 'AUTO') + '</b></button>' +
      '<button class="go ghost" data-act="next">\u203A</button>' +
    '</div>' +
    /* the run's SHAPE belongs with the car, not on the title card: both are
       choices about the drive you are about to take */
    '<div class="gstack">' +
      /* a formula car has a livery, not stripes — and on that narrow engine
         cover they were lost between the tyres anyway */
      (stripesAllowed()
        ? '<button class="go ghost" data-act="stripes">STRIPES \u00B7 <b>' +
            (optStripes ? 'ON' : 'OFF') + '</b></button>'
        : '') +
      '<button class="go ghost" data-act="mode">MODE \u00B7 <b>' +
        (mode === 'race' ? (tourOn ? 'TOURNAMENT' : 'SINGLE RACE') : 'TEST DRIVE') +
        '</b></button>' +
      (mode === 'race' && tourOn
        ? '<div class="gnote">ROUND ' + (tourRound+1) + ' OF 4 \u00B7 ' +
          TOUR_MILES[tourRound] + ' MI' +
          (tourRound ? ' \u00B7 ' + tourPts + ' PTS, P' + tourStanding() : '') +
          '</div>' : '') +
      /* practice has a clock only if you ask for one */
      (mode === 'race' ? '' :
        '<button class="go ghost" data-act="timed">TIMED \u00B7 <b>' +
          (timedRun ? 'ON' : 'OFF') + '</b></button>') +
      '<button class="go ghost" data-act="chase">HOT PURSUIT \u00B7 <b>' +
        (optEasy ? 'OFF' : 'ON') + '</b></button>' +
      /* a fork can put its own buttons here — Motorsport adds QUALIFY */
      (CFG.garageButtons ? CFG.garageButtons() : '') +
      '<button class="go" data-act="drive">DRIVE</button>' +
      '<button class="go ghost" data-act="back">BACK</button>' +
    '</div>',
    Object.assign({}, (CFG.garageActions ? CFG.garageActions(start) : {}), {
      prev: () => cycleBody(-1),
      next: () => cycleBody(1),
      box:  () => { optManual = !optManual; syncBoxClass();
                    if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { manual:optManual });
                    showGarage(); },
      /* three states in one control: TEST DRIVE, SINGLE RACE, TOURNAMENT */
      stripes: () => { if(stripesAllowed()) optStripes = !optStripes;
                       buildSprites();
                       if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { stripes:optStripes });
                       showGarage(); },
      mode:  () => {
        if(mode !== 'race'){ mode = 'race'; tourOn = false; }
        else if(!tourOn){ tourOn = true; tourReset(); }
        else { mode = 'endless'; tourOn = false; }
        showGarage();
      },
      timed: () => { timedRun = !timedRun;
                     if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { timed:timedRun });
                     showGarage(); },
      chase: () => { optEasy = !optEasy;
                     if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { easy:optEasy });
                     showGarage(); },
      drive: start,
      back: showTitle
    }));
  drawGarageCar();
}
function cycleBody(d){
  /* FORMULA is not in the list until it has been won */
  /* ---- SIX CARS FROM THE START -----------------------------------------
     Both classes are yours immediately: three SPORTS and three SUPER. The
     tournament is a choice of ladder now rather than a slow drip of cars.

       gold in SUPER  → FORMULA, a novelty you were never meant to be given
       gold in SPORTS → the iridescent paints
     ------------------------------------------------------------------- */
  /* SUPERCRUISER is an NPC vehicle, not a garage car — listing it here made
     the garage try to build a body that does not exist in BODY and the whole
     screen threw on a non-finite gradient */
  const LOCK = { 'FORMULA':'formula', 'CRUISER':'cruiser',
                 'COUPE':'traffic','SALOON':'traffic','CAB':'traffic',
                 'PICKUP':'traffic','VAN':'traffic','LORRY':'traffic' };
  /* ---- DEBUG OVERRIDES ---------------------------------------------------
     These open a car in the garage WITHOUT writing the unlock flag, so the
     reward screens can still be earned properly afterwards. That is the whole
     point of them: testing the cars must not consume the moment of winning
     them. `unlocked()` is untouched — only this gate is widened.
     ---------------------------------------------------------------------- */
  const openBy = k => {
    const need = LOCK[k];
    if(!need) return true;
    if(unlocked(need)) return true;
    if(need === 'traffic') return !!dbgTraffic;
    return !!dbgRacers;
  };
  /* an NPC body has stats and a sprite but is not a car you can pick */
  const ks = Object.keys(BODY).filter(k => !BODY[k].npc).filter(openBy);
  const i = (ks.indexOf(optBody) + d + ks.length) % ks.length;
  optBody = ks[i];
  syncPaintForBody();
  syncPaintForBody();
  buildSprites();
  syncBoxClass();
  if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { body:optBody });
  showGarage();
}

/* ---- a menu means the run is OVER ----------------------------------------
   Reaching the title through the garage left `state` on 'wrecked' with the
   whole scene still loaded, so QUIT flashed a frame of road on the way out.
   Any menu that is not the pause menu ends the run properly first.
   -------------------------------------------------------------------------- */
/* ---- LEAVING A RUN, WITHOUT TOUCHING THE MUSIC -------------------------
   `endRun()` stops the music and clears `menuBedOn`, so any menu that calls it
   is guaranteed to restart the bed a moment later — which is the hiccup, and
   why fixing `showTitle`/`showGarage` alone did not help: they were not the
   ones stopping it.

   `endRun(keepMusic)` leaves the bed alone when we are only moving from one
   MENU to another. The run still tears down; the music simply does not care.
   ---------------------------------------------------------------------- */
function endRun(keepMusic){
  state = 'title';
  spd = 0; fx.length = 0; shake = 0;
  traffic.length = 0; cops.length = 0; blocks.length = 0;
  racers.length = 0; crates.length = 0; skids.length = 0;
  if(typeof cpGantries !== 'undefined') cpGantries.length = 0;
  /* the MUSIC was stopped and the CAR was not — the engine, wind and tyre
     loops are held voices and they keep sounding until something tells them
     to stop. Leaving a run has to silence both. */
  snd.quiet();
  if(!keepMusic){
    if(AR && AR.music) AR.music.stop();
    menuBedOn = false;
  }
}


/* ===========================================================================
   THE TITLE CARD

   Not a menu over a paused game: a made picture. Sun on the horizon, the city
   in silhouette, the road running out to meet it, your own car on it, and the
   name drawn rather than typed.

   The LOGO is the point. A font — any font — says "UI". Letters built as
   paths, raked forward, cut across the middle by a horizon line, chrome above
   and hot amber below, is what an arcade cabinet's marquee looks like.
   =========================================================================== */
let titleCv = null, titleT = 0;

/* the alphabet and the shell treatment are shared — see Arcade.wordmark */
function drawLogo(g, cx, cy, size){
  /* ---- THE WORDMARK IS THE GAME'S OWN ---------------------------------
     'HIGHWAY' was hardcoded, so Motorsport drew a circuit under Interstate's name.
     The title comes from CFG, and a fork can bring its own palette — warm
     chrome for a sunset road, cold green for a floodlit circuit.

     ---- AND IT IS A LOCKUP, NOT A SENTENCE -----------------------------
     Set as one line, 'REDLINE INTERSTATE' filled the frame edge to edge and
     read as a single long name. It is not one: REDLINE is the marque both
     driving games share - one engine, one garage, six cars - and INTERSTATE is
     which of the two you are about to drive. A lockup says that. A line of
     eighteen characters says the opposite, and shrinks the half that actually
     names the game to fit the half that does not.

     So: the marque small and letterspaced above, the discipline large beneath.
     A single-word title falls through to the old behaviour untouched, which is
     what a fork bringing its own name gets. */
  const full = (GAME_TITLE || 'Interstate').toUpperCase();
  const cool = (CFG.logoCool || ['#f6f8ff','#9fb2d8','#e9eefc']);
  const hot  = (CFG.logoHot  || ['#ffd27a','#ff8a2b','#c93c1f']);
  const cut  = full.indexOf(' ');

  if(cut < 0){
    AR.wordmark(g, full, cx, cy, size, { maxW: titleCv.clientWidth * 0.88, cool, hot });
    return;
  }

  const marque = full.slice(0, cut), disc = full.slice(cut + 1);
  /* the marque is small enough to read as a parent rather than a first word,
     and dimmed to the cool ramp only - the hot pass is the game's own name */
  AR.wordmark(g, marque, cx, cy - size * 0.70, size * 0.30, {
    maxW: titleCv.clientWidth * 0.44, gap: 0.62,
    cool, hot: cool
  });
  /* the discipline gets the room the pair used to share, so it is BIGGER than
     the one-line version was rather than smaller */
  AR.wordmark(g, disc, cx, cy + size * 0.26, size * 1.10, {
    maxW: titleCv.clientWidth * 0.84, cool, hot
  });
}

function drawTitleArt(){
  if(!titleCv) titleCv = document.getElementById('titleArt');
  if(!titleCv) return;
  if(!titleT) titleT = performance.now();
  const T = (performance.now() - titleT) / 1000;
  const g = titleCv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = titleCv.clientWidth, h = titleCv.clientHeight;
  if(titleCv.width !== w*dpr){ titleCv.width = w*dpr; titleCv.height = h*dpr; }
  g.setTransform(dpr,0,0,dpr,0,0);
  const hz = h * 0.52;
  /* ---- A FORK CAN PAINT ITS OWN ---------------------------------------
     Motorsport was showing Interstate's sunset because the title art was hardcoded.
     `CFG.titleArt` gets the context and the geometry and returns true if it
     drew everything; anything it does not draw falls through to the highway
     scene below, so a fork can replace the whole picture or none of it. */
  if(CFG.titleArt && CFG.titleArt(g, w, h, T)){
    drawLogo(g, w*0.5, h*0.235, Math.min(w*0.155, 74));
    if(document.body.classList.contains('titling'))
      requestAnimationFrame(drawTitleArt);
    return;
  }

  /* ---- sky ---------------------------------------------------------------
     Six stops, not four: the band right above the horizon is where all the
     colour is, so it gets the resolution. */
  const sky = g.createLinearGradient(0,0,0,hz);
  sky.addColorStop(0,   '#120820');
  sky.addColorStop(0.32,'#2e0f3e');
  sky.addColorStop(0.58,'#63204c');
  sky.addColorStop(0.78,'#a83550');
  sky.addColorStop(0.92,'#dd5a41');
  sky.addColorStop(1,   '#f5934a');
  g.fillStyle = sky; g.fillRect(0,0,w,hz);

  /* stars, fading out as they near the light, twinkling on their own clocks */
  for(let i=0;i<90;i++){
    const sx = (i*97.7) % w, sy = (i*47.3) % (hz*0.78);
    const tw = 0.55 + 0.45*Math.sin(T*1.6 + i);
    g.fillStyle = 'rgba(255,240,255,' + (0.55*(1 - sy/(hz*0.9))*tw) + ')';
    g.fillRect(sx, sy, 1.4, 1.4);
  }

  /* thin clouds drifting across the light, lit from beneath */
  for(let i=0;i<5;i++){
    const cy = hz*0.42 + i*hz*0.10;
    const cx = ((T*(6 + i*3) + i*160) % (w + 260)) - 130;
    const cw = 90 + i*34, ch = 5 + i;
    const cg = g.createLinearGradient(0, cy-ch, 0, cy+ch);
    cg.addColorStop(0,'rgba(255,150,120,.05)');
    cg.addColorStop(0.6,'rgba(255,130,110,.16)');
    cg.addColorStop(1,'rgba(120,40,80,.10)');
    g.fillStyle = cg;
    g.beginPath(); g.ellipse(cx, cy, cw, ch, 0, 0, 6.2832); g.fill();
  }

  /* ---- the sun ----------------------------------------------------------- */
  const sr = w * 0.27, sxc = w*0.5, syc = hz - sr*0.14;
  const sun = g.createLinearGradient(0, syc-sr, 0, syc+sr);
  sun.addColorStop(0,'#fff2a8'); sun.addColorStop(0.42,'#ffb047');
  sun.addColorStop(0.75,'#ff5f52'); sun.addColorStop(1,'#ff2f70');
  g.save();
  g.beginPath(); g.arc(sxc, syc, sr, 0, 6.2832); g.clip();
  g.fillStyle = sun; g.fillRect(sxc-sr, syc-sr, sr*2, sr*2);
  /* the bands CREEP downward, which is what makes it feel like it is setting */
  g.fillStyle = 'rgba(18,6,26,.88)';
  for(let i=0;i<10;i++){
    const yy = syc + sr*0.06 + i*(sr*0.108) + ((T*7) % (sr*0.108));
    g.fillRect(sxc-sr, yy, sr*2, sr*0.018 + i*sr*0.010);
  }
  g.restore();
  /* its own haze */
  g.save();
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(sxc,syc,sr*0.5,sxc,syc,sr*2.1);
  halo.addColorStop(0,'rgba(255,140,90,.22)'); halo.addColorStop(1,'rgba(255,110,80,0)');
  g.fillStyle = halo; g.fillRect(0,0,w,hz+40);
  g.restore();

  /* ---- the city, two ranks deep ------------------------------------------ */
  for(const rank of [{d:0.55, c:'#2a1330', y:0}, {d:1, c:'#140a1c', y:0}]){
    let bx = -20, bi = rank.d*7;
    g.fillStyle = rank.c;
    while(bx < w+20){
      const bw = (12 + ((bi*29) % 26)) * (0.7 + rank.d*0.5);
      const centre = 1 - Math.abs((bx+bw/2)/w - 0.5)*2;
      const bh = (14 + ((bi*47) % 52)) * (0.45 + centre*0.9) * (0.6 + rank.d*0.6);
      g.fillRect(bx, hz-bh, bw, bh);
      if(rank.d === 1){
        for(let wy = hz-bh+4; wy < hz-3; wy += 6)
          for(let wx = bx+3; wx < bx+bw-3; wx += 5)
            if(((wx*7 + wy*11 + bi*17) % 100)/100 < 0.20 + centre*0.30){
              g.fillStyle = 'rgba(255,206,140,.7)';
              g.fillRect(wx, wy, 2, 3);
              g.fillStyle = rank.c;
            }
      }
      bx += bw + 4 + ((bi*13) % 8); bi++;
    }
  }

  /* ---- the grid, RUNNING toward you --------------------------------------- */
  g.fillStyle = '#0b0512'; g.fillRect(0, hz, w, h-hz);
  g.strokeStyle = 'rgba(255,90,190,.40)'; g.lineWidth = 1;
  const scroll = (T*0.30) % 1;
  for(let i=0;i<18;i++){
    const t = ((i/18) + scroll) % 1;
    const yy = hz + (h-hz) * t*t;
    g.globalAlpha = Math.min(1, t*3);
    g.beginPath(); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke();
  }
  g.globalAlpha = 1;
  for(let i=-10;i<=10;i++){
    g.beginPath();
    g.moveTo(w/2 + i*(w*0.028), hz);
    g.lineTo(w/2 + i*(w*0.58), h);
    g.stroke();
  }

  /* ---- the road ----------------------------------------------------------- */
  g.fillStyle = '#171225';
  g.beginPath();
  g.moveTo(w*0.5 - w*0.042, hz); g.lineTo(w*0.5 + w*0.042, hz);
  g.lineTo(w*0.5 + w*0.66, h);   g.lineTo(w*0.5 - w*0.66, h);
  g.closePath(); g.fill();
  /* rumble strips down both edges */
  for(const side of [-1, 1]){
    g.strokeStyle = 'rgba(226,226,232,.5)'; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(w*0.5 + side*w*0.040, hz);
    g.lineTo(w*0.5 + side*w*0.63, h);
    g.stroke();
  }
  /* the centre line, dashes rushing at you and thickening as they arrive */
  g.strokeStyle = 'rgba(255,206,120,.85)';
  for(let i=0;i<9;i++){
    const t0 = (((i/9) + scroll*1.6) % 1), t1 = t0 + 0.05;
    if(t1 > 1) continue;
    const y0 = hz + (h-hz)*t0*t0, y1 = hz + (h-hz)*t1*t1;
    g.lineWidth = 1 + t0*8;
    g.globalAlpha = Math.min(1, t0*4);
    g.beginPath(); g.moveTo(w*0.5, y0); g.lineTo(w*0.5, y1); g.stroke();
  }
  g.globalAlpha = 1;

  /* ---- the car ------------------------------------------------------------ */
  const img = SP.player;
  if(img){
    /* ---- IT SWAYS, IT DOES NOT BOB --------------------------------------
       Up and down reads as a car bouncing on its springs while parked. Side to
       side reads as a car being driven — small corrections at speed. Two
       frequencies so it never looks like a metronome, and a touch of roll into
       the direction it is leaning. */
    const sway = Math.sin(T*0.9)*7.5 + Math.sin(T*1.7)*3.0;
    const roll = Math.sin(T*0.9)*0.022;
    const bob  = Math.sin(T*2.4)*0.5;
    /* ---- FURTHER UP THE ROAD ------------------------------------------
       70% still crowded the top button. It sits at 60% now and is smaller with
       it — 0.19 rather than 0.26 — because a car further away is a car that
       LOOKS further away. Moving it up without shrinking it would just read as
       a car floating above the road. */
    const cw = w*0.19, ch = cw * img.height/img.width;
    const cxp = w*0.5 + sway, cyp = h*0.60 + bob;
    /* what it is standing on */
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.ellipse(cxp, cyp-2, cw*0.42, ch*0.07, 0, 0, 6.2832); g.fill();
    g.save();
    g.translate(cxp, cyp - ch*0.5);
    g.rotate(roll);
    g.drawImage(img, -cw/2, -ch*0.5, cw, ch);
    g.restore();
    /* ---- THE LAMPS THEMSELVES ARE LIT -------------------------------------
       There was a halo but nothing under it, so the car had a red smudge
       floating behind a dark tail. The lamps are painted ON the sprite's own
       lamp positions first, then the halo sits over them. */
    const pulse = 0.55 + 0.25*Math.sin(T*2.0);
    const lampW = cw*0.265, lampH = ch*0.10, lampY = cyp - ch*0.335;
    for(const lx of [cxp - cw/2 + cw*0.135, cxp - cw/2 + cw*0.60]){
      g.fillStyle = 'rgba(255,64,74,' + (0.75 + pulse*0.25) + ')';
      g.fillRect(lx, lampY, lampW, lampH);
      g.fillStyle = 'rgba(255,190,190,.55)';
      g.fillRect(lx, lampY, lampW, Math.max(1, lampH*0.28));
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    for(const ox of [-0.082, 0.082]){
      const gl = g.createRadialGradient(cxp+ox*w, cyp-ch*0.34, 0,
                                        cxp+ox*w, cyp-ch*0.34, cw*0.26);
      gl.addColorStop(0,'rgba(255,58,84,'+pulse+')');
      gl.addColorStop(1,'rgba(255,58,84,0)');
      g.fillStyle = gl;
      g.beginPath(); g.arc(cxp+ox*w, cyp-ch*0.34, cw*0.26, 0, 6.2832); g.fill();
    }
    g.restore();
  }

  /* ---- air over the lot --------------------------------------------------- */
  const wash = g.createRadialGradient(sxc, hz, 0, sxc, hz, w*0.85);
  wash.addColorStop(0,'rgba(255,130,80,.20)'); wash.addColorStop(1,'rgba(255,130,80,0)');
  g.fillStyle = wash; g.fillRect(0,0,w,h);
  g.fillStyle = 'rgba(0,0,0,.16)';
  for(let y=0;y<h;y+=3) g.fillRect(0,y,w,1);

  drawLogo(g, w*0.5, h*0.235, Math.min(w*0.155, 74));

  if(document.body.classList.contains('titling'))
    requestAnimationFrame(drawTitleArt);
}

/* ---- THE FIRST TAP HAS TO START IT ---------------------------------------
   A browser will not create an audio context without a gesture, so on a cold
   load the title is silent until you touch something. If that touch is PLAY
   you are in the garage before the bed ever plays, and the title appears to
   have no music at all.

   This arms a one-shot listener: the first pointer or key event anywhere
   starts the menu bed, provided we are still on a menu. It costs nothing and
   it removes the only case where the title is genuinely silent.
   -------------------------------------------------------------------------- */
let audioArmed = false;
/* ---- DO NOT RESTART A TRACK THAT IS ALREADY PLAYING ---------------------
   `showTitle` and `showGarage` each called `music.start()` unconditionally, so
   stepping between them stopped the bed mid-bar and began it again from step
   zero — the hiccup. Moving between two MENUS is not a change of music.

   `menuMusic()` is the only way in: it starts the bed if something else is
   playing or nothing is, and does nothing at all if the bed is already
   running.
   ------------------------------------------------------------------------ */
let menuBedOn = false;
function menuMusic(){
  if(!AR || !AR.music) return;
  if(menuBedOn) return;
  AR.music.stop();
  AR.music.start(140, 16, snd.menuBed);
  menuBedOn = true;
}
function raceMusic(){
  if(!AR || !AR.music) return;
  AR.music.stop();
  AR.music.start(152, 4, snd.bed);
  menuBedOn = false;
}

function armMenuAudio(){
  if(audioArmed) return;
  audioArmed = true;
  const go = () => {
    if(state !== 'title') return;
    menuMusic();
  };
  addEventListener('pointerdown', go, { once:true });
  addEventListener('keydown',     go, { once:true });
}

function showTitle(){
  endRun(true);
  armMenuAudio();
  document.body.classList.add('titling');
  titleT = 0;
  requestAnimationFrame(drawTitleArt);
  menuMusic();
  openVeil(
    '<h1>' + GAME_TITLE + '</h1>' +
    '<div class="tmenu">' +
      '<button class="go" data-act="play">PLAY</button>' +
      /* MODE and HOT PURSUIT moved to the garage: they are choices about the
         drive you are about to take, so they belong beside the car. */
      '<button class="go ghost" data-act="opts">OPTIONS</button>' +
      '<button class="go ghost" data-act="quit">QUIT</button>' +
    '</div>' +
    '<div class="legal">\u00A9 2026 EFFIGY MEDIA</div>',
    {
      play: showGarage,

      chase: () => { optEasy = !optEasy; showTitle(); },
      opts: () => showOptions(),
      quit: () => { if(AR && AR.home) AR.home(); }
    });
}

/* ---- THE DEBUG MENU -------------------------------------------------------
   Two switches that widen the garage gate WITHOUT writing an unlock flag. A car
   opened here is driveable immediately and still locked as far as the save is
   concerned, so the reward screens can be earned properly afterwards \u2014 testing
   a car must not consume the moment of winning it.

   They are deliberately not saved. A debug switch that survives a reload is a
   debug switch you forget you left on.
   -------------------------------------------------------------------------- */
function showDebug(){
  document.body.classList.add('titling');
  const state = k => k ? 'ON' : 'OFF';
  openVeil(
    '<div class="eyebrow">' + GAME_TITLE.toUpperCase() + '</div><h1>Debug</h1>' +
    '<div class="tip">OPENS CARS FOR TESTING WITHOUT MARKING THEM UNLOCKED</div>' +
    '<div class="tmenu">' +
      '<button class="go ghost" data-act="dr">UNLOCK ALL RACERS \u00b7 <b>' +
        state(dbgRacers) + '</b></button>' +
      '<button class="go ghost" data-act="dt">UNLOCK ALL TRAFFIC \u00b7 <b>' +
        state(dbgTraffic) + '</b></button>' +
      '<button class="go" data-act="back">BACK</button>' +
    '</div>',
    { dr:   () => { dbgRacers  = !dbgRacers;  showDebug(); },
      dt:   () => { dbgTraffic = !dbgTraffic; showDebug(); },
      back: () => showOptions() });
}

/* ---- ERASING THIS CAR'S CAREER --------------------------------------------
   One press arms, the second does it. There is no dialog, because a dialog is
   a second veil over a veil on a phone and this menu is already the veil.

   It is deliberately NOT a shell control. `Arcade.save.clear` is shared and
   does the work, but the button is drawn by the game in the game's own idiom -
   the shell does not know what a `.go ghost` looks like, and it should not.

   The label reads the store rather than assuming: with nothing saved there is
   nothing to erase, and a button that says ERASE and does nothing is worse
   than one that says so. */
let eraseArmed = false;

function eraseLabel(){
  if(!(AR && AR.save && AR.save.has && AR.save.has(GAME_ID))) return 'NO SAVED DATA';
  return eraseArmed ? 'ERASE SAVE · <b>SURE?</b>' : 'ERASE SAVE';
}

function eraseStep(){
  if(!(AR && AR.save && AR.save.has && AR.save.has(GAME_ID))) return;
  if(!eraseArmed){ eraseArmed = true; showOptions(); return; }
  AR.save.clear(GAME_ID);
  eraseArmed = false;
  /* A RELOAD, AND NOT A REDRAW. Everything this game read at boot - the
     unlocked cars, the options, the best distance - is already in variables by
     now. Clearing the store without reloading leaves the run holding the state
     it just deleted, and the next save writes it all back. */
  location.reload();
}

function showOptions(){
  /* ---- THE SAME ROWS AS THE PAUSE MENU -----------------------------------
     This used to be a signpost saying the settings were somewhere else, which
     is the worst kind of menu. `.ark-opts` is the shell's own container: it
     paints the identical controls here, backed by the same storage and the
     same callback, so there is one set of settings reachable from two places
     rather than two sets that can disagree.
     ---------------------------------------------------------------------- */
  document.body.classList.add('titling');
  openVeil(
    '<div class="eyebrow">' + GAME_TITLE.toUpperCase() + '</div><h1>Options</h1>' +
    '<div class="ark-opts"></div>' +
    '<div class="tmenu">' +
      '<button class="go ghost" data-act="debug">DEBUG</button>' +
      '<button class="go ghost" data-act="erase">' + eraseLabel() + '</button>' +
      '<button class="go" data-act="back">BACK</button>' +
    '</div>',
    { debug: () => showDebug(),
      erase: () => eraseStep(),
      back: () => { eraseArmed = false; showTitle(); } });
  if(AR && AR.options && AR.options.paint) AR.options.paint();
}

/* The controls screen is gone - see the note in Quietus. These are touch games
   ([[RLG-002]]), and a page listing gestures is a page describing what the
   screen already shows. */
/* ---- between rounds ------------------------------------------------------
   The standings are the whole reason to keep driving, so they are the screen.
   -------------------------------------------------------------------------- */
function showRound(place){
  const rows = tourField.slice().sort((a,b)=>b.pts-a.pts).slice(0,4);
  openVeil(
    '<div class="eyebrow">ROUND ' + tourRound + ' COMPLETE</div>' +
    '<h1>' + place + '<u>' + ordinal(place) + ' PLACE</u></h1>' +
    '<div class="grid2">' +
      '<div class="gc"><span>YOUR POINTS</span><b>' + tourPts + '</b></div>' +
      '<div class="gc"><span>STANDING</span><b>P' + tourStanding() + '</b></div>' +
      '<div class="gc"><span>NEXT ROUND</span><b>' + (tourRound+1) + ' OF 4</b></div>' +
      '<div class="gc"><span>DISTANCE</span><b>' + TOUR_MILES[tourRound] + ' MI</b></div>' +
    '</div>' +
    '<div class="gstack">' +
      '<button class="go" data-act="next">NEXT RACE</button>' +
      '<button class="go ghost" data-act="garage">CHANGE CAR</button>' +
      '<button class="go ghost" data-act="quit">RETIRE</button>' +
    '</div>',
    { next: start, garage: showGarage,
      quit: () => { tourOn = false; showTitle(); } });
}

/* ---- the end of the tournament -------------------------------------------
   The payoff screen gets the same treatment as a title card: a drawn SCENE
   behind the panel, not a cup icon in a box. Your car on the top step under a
   spotlight, the trophy beside it, confetti in the beam, and the standings
   underneath so the four races add up to something.
   -------------------------------------------------------------------------- */
let trophyCv = null, trophyT = 0, trophyPlace = 1;

function drawTrophyArt(){
  if(!trophyCv) trophyCv = document.getElementById('titleArt');
  if(!trophyCv) return;
  const T = (performance.now() - trophyT) / 1000;
  const g = trophyCv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = trophyCv.clientWidth, h = trophyCv.clientHeight;
  if(trophyCv.width !== w*dpr){ trophyCv.width = w*dpr; trophyCv.height = h*dpr; }
  g.setTransform(dpr,0,0,dpr,0,0);

  const M = trophyPlace === 1 ? ['#fff3b0','#e8b23a','#7d5a10']
          : trophyPlace === 2 ? ['#f4f8fb','#b9c4cf','#616973']
          : trophyPlace === 3 ? ['#ffdcb4','#c8813f','#6e4118']
          :                     ['#c8ccd4','#8d949e','#4b5058'];

  /* the hall */
  const bg = g.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,'#0b0710'); bg.addColorStop(0.55,'#160f1c'); bg.addColorStop(1,'#070509');
  g.fillStyle = bg; g.fillRect(0,0,w,h);

  const PY = h*0.60;                       /* the podium's top surface */

  /* the spotlight, wide above and tight on the step */
  g.save(); g.globalCompositeOperation='lighter';
  const beam = g.createLinearGradient(0,0,0,PY);
  beam.addColorStop(0,'rgba(255,236,190,.16)');
  beam.addColorStop(1,'rgba(255,226,170,.02)');
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(w*0.30,0); g.lineTo(w*0.70,0);
  g.lineTo(w*0.62,PY); g.lineTo(w*0.38,PY);
  g.closePath(); g.fill();
  const pool = g.createRadialGradient(w*0.5,PY,0,w*0.5,PY,w*0.42);
  pool.addColorStop(0,'rgba(255,240,200,.22)'); pool.addColorStop(1,'rgba(255,230,180,0)');
  g.fillStyle = pool; g.fillRect(0,PY-h*0.14,w,h*0.28);
  g.restore();

  /* the podium: three steps, yours lit */
  const stepW = w*0.20;
  [[-1, 0.62, '2'], [0, 1.00, '1'], [1, 0.44, '3']].forEach(function(st){
    const sx = w*0.5 + st[0]*stepW*1.02;
    const sh = h*0.10 * st[1] + h*0.03;
    const lit = (st[2] === String(trophyPlace));
    g.fillStyle = lit ? '#3b3348' : '#241f2e';
    g.fillRect(sx - stepW/2, PY - sh, stepW, sh + h*0.10);
    g.fillStyle = lit ? 'rgba(255,238,200,.20)' : 'rgba(255,255,255,.05)';
    g.fillRect(sx - stepW/2, PY - sh, stepW, Math.max(2, h*0.006));
    g.save();
    g.textAlign='center'; g.textBaseline='middle';
    g.font = '700 ' + Math.round(w*0.045) + 'px ' +
             getComputedStyle(document.body).getPropertyValue('--disp');
    g.fillStyle = lit ? M[0] : 'rgba(200,200,215,.28)';
    g.fillText(st[2], sx, PY - sh + h*0.045);
    g.restore();
  });

  /* your car, on your step */
  const img = SP.player;
  if(img){
    const off = trophyPlace === 1 ? 0 : trophyPlace === 2 ? -1 : 1;
    const stH = h*0.10 * (off === 0 ? 1 : off < 0 ? 0.62 : 0.44) + h*0.03;
    const cw = w*0.30, ch = cw*img.height/img.width;
    g.drawImage(img, w*0.5 + off*stepW*1.02 - cw/2, PY - stH - ch + 2, cw, ch);
  }

  /* the trophy, standing beside the podium */
  const tx = w*0.80, ty = PY - h*0.02, ts = Math.min(w*0.16, 76);
  g.save();
  g.translate(tx, ty);
  const mg = g.createLinearGradient(-ts*0.5,-ts,ts*0.5,ts*0.3);
  mg.addColorStop(0,M[0]); mg.addColorStop(0.5,M[1]); mg.addColorStop(1,M[2]);
  g.fillStyle = mg;
  /* bowl */
  g.beginPath();
  g.moveTo(-ts*0.42,-ts*0.92); g.lineTo(ts*0.42,-ts*0.92);
  g.lineTo(ts*0.42,-ts*0.62); g.quadraticCurveTo(ts*0.42,-ts*0.12, 0,-ts*0.12);
  g.quadraticCurveTo(-ts*0.42,-ts*0.12,-ts*0.42,-ts*0.62);
  g.closePath(); g.fill();
  /* handles */
  g.lineWidth = ts*0.075; g.strokeStyle = mg;
  g.beginPath(); g.arc(-ts*0.52,-ts*0.62, ts*0.19, -1.2, 1.9); g.stroke();
  g.beginPath(); g.arc( ts*0.52,-ts*0.62, ts*0.19, 1.24, 4.3); g.stroke();
  /* stem and base */
  g.fillStyle = mg;
  g.fillRect(-ts*0.07,-ts*0.14, ts*0.14, ts*0.20);
  g.fillRect(-ts*0.24, ts*0.06, ts*0.48, ts*0.07);
  g.fillStyle = '#2a2230';
  g.fillRect(-ts*0.34, ts*0.13, ts*0.68, ts*0.16);
  /* a shine that travels across it */
  g.save();
  g.globalCompositeOperation='lighter';
  const sh2 = ((T*0.5) % 1) * ts*1.4 - ts*0.7;
  const shg = g.createLinearGradient(sh2-ts*0.16, 0, sh2+ts*0.16, 0);
  shg.addColorStop(0,'rgba(255,255,255,0)');
  shg.addColorStop(0.5,'rgba(255,255,255,.30)');
  shg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = shg;
  g.fillRect(-ts*0.45,-ts*0.95, ts*0.9, ts*0.85);
  g.restore();
  g.restore();

  /* confetti, only for a win, falling and tumbling through the beam */
  if(trophyPlace === 1){
    for(let i=0;i<54;i++){
      const sp = 0.35 + (i%7)*0.06;
      const life = ((T*sp + i*0.137) % 1);
      const cx2 = ((i*89) % w) + Math.sin(T*1.2 + i)*w*0.05;
      const cy2 = life * (PY + h*0.12);
      const rot = T*3 + i;
      g.save();
      g.translate(cx2, cy2); g.rotate(rot);
      g.globalAlpha = Math.min(1, (1-life)*2.4);
      g.fillStyle = ['#e8b23a','#ff5a7a','#5bd6c8','#c3ff4a','#f4f4f8'][i%5];
      g.fillRect(-3, -1.6, 6, 3.2);
      g.restore();
    }
  }

  /* dust hanging in the light */
  for(let i=0;i<28;i++){
    const dy = ((i*i*11 + T*7) % h);
    const dx = w*0.34 + ((i*53) % Math.round(w*0.32));
    g.fillStyle = 'rgba(255,240,205,.10)';
    g.fillRect(dx, dy, 1.4, 1.4);
  }

  if(document.body.classList.contains('trophying'))
    requestAnimationFrame(drawTrophyArt);
}

/* ---- WHAT YOU WON --------------------------------------------------------
   A trophy tells you how you did; this tells you what you GOT. The car itself,
   large, in your own paint, with the numbers that make it worth driving.
   -------------------------------------------------------------------------- */
function showUnlock(key){
  const was = optBody;
  optBody = key; buildSprites();
  const B = BODY[key];
  document.body.classList.remove('trophying');
  openVeil(
    '<div class="eyebrow">UNLOCKED</div>' +
    '<canvas id="gcar" width="300" height="180"></canvas>' +
    '<div class="gname">' + key + '</div>' +
    '<div class="gnote">' + B.note + '</div>' +
    '<div class="grid2">' +
      '<div class="gc"><span>TOP SPEED</span><b>' + Math.round(B.vmax*200) + ' MPH</b></div>' +
      '<div class="gc"><span>GEARBOX</span><b>' + (B.gears || 6) + '-SPEED</b></div>' +
      '<div class="gc"><span>REDLINE</span><b>' + ((B.redline||12000)/1000) + 'K</b></div>' +
      '<div class="gc"><span>0\u201360 MPH</span><b>' + zeroSixty(key).toFixed(1) + 's</b></div>' +
    '</div>' +
    (key === 'CRUISER'
      ? '<div class="gnote">20 MILES \u00B7 ON THE CLOCK \u00B7 UNDER PURSUIT</div>'
      : '') +
    '<div class="gstack">' +
      '<button class="go" data-act="drive">DRIVE IT</button>' +
      '<button class="go ghost" data-act="keep">KEEP MY CAR</button>' +
    '</div>',
    { drive: () => { tourOn = false; showGarage(); },
      keep:  () => { optBody = was; buildSprites(); tourOn = false; showGarage(); } });
  drawGarageCar();
}

function showTrophy(st){
  trophyPlace = st; trophyT = performance.now();
  document.body.classList.remove('titling');
  document.body.classList.add('trophying');
  requestAnimationFrame(drawTrophyArt);
  const NAME = st === 1 ? 'GOLD' : st === 2 ? 'SILVER' : st === 3 ? 'BRONZE' : 'P' + st;
  /* the four races, and where the points came from */
  const rows = tourField.slice().sort((a,b)=>b.pts-a.pts).slice(0,3);
  openVeil(
    '<div class="eyebrow">TOURNAMENT COMPLETE</div>' +
    '<h1>' + NAME + '<u>' + (st === 1 ? 'CHAMPION' : 'FINAL STANDING') + '</u></h1>' +
    '<div class="grid2">' +
      '<div class="gc"><span>POINTS</span><b>' + tourPts + '</b></div>' +
      '<div class="gc"><span>PLACE</span><b>P' + st + '</b></div>' +
    '</div>' +
    (st === 1
      ? '<div class="gnote">FORMULA UNLOCKED \u00b7 FORMULA \u00b7 NO COMPROMISE</div>'
      : '<div class="tip">A GOLD UNLOCKS THE FOURTH CAR</div>') +
    '<div class="gstack">' +
      (st <= 3 ? '<button class="go" data-act="unlock">SEE YOUR NEW CAR</button>' : '') +
      '<button class="go' + (st <= 3 ? ' ghost' : '') + '" data-act="again">NEW TOURNAMENT</button>' +
      '<button class="go ghost" data-act="menu">MAIN MENU</button>' +
    '</div>',
    { again: () => { document.body.classList.remove('trophying');
                     tourReset(); showGarage(); },
      unlock: () => showUnlock(st === 1 ? 'FORMULA' : st === 2 ? 'TUNER' : 'MUSCLE'),
      menu:  () => { document.body.classList.remove('trophying');
                     tourOn = false; showTitle(); } });
}

function showEnd(reason){
  openVeil(
    '<div class="eyebrow">'+reason+'</div>'+
    '<h1>'+dist.toFixed(1)+'<u>MILES DRIVEN</u></h1>'+
    /* TOP SPEED appeared twice — once as the no-cops substitute for HEAT and
       again in its own cell. Checkpoints reached is the number this game is
       actually about, so it takes the free slot. */
    '<div class="grid2">'+
      '<div class="gc"><span>DISTANCE</span><b>'+dist.toFixed(1)+' MI</b></div>'+
      '<div class="gc"><span>TOP SPEED</span><b>'+Math.round(runTopMph)+' MPH</b></div>'+
      '<div class="gc"><span>CHECKPOINTS</span><b>'+Math.max(0, nextCP-2)+'</b></div>'+
      (optEasy ? '<div class="gc"><span>BEST RUN</span><b>'+bestDist.toFixed(1)+' MI</b></div>'
               : '<div class="gc"><span>HEAT</span><b>LV '+heat+'</b></div>')+
    '</div>'+
    /* a way OUT, not just a way round again */
    '<div class="gstack">'+
      '<button class="go" data-act="again">RUN IT AGAIN</button>'+
      '<button class="go ghost" data-act="garage">CHANGE CAR</button>'+
      '<button class="go ghost" data-act="menu">MAIN MENU</button>'+
    '</div>'+
    '<div class="tip">ATTEMPT '+(runs+1)+'</div>',
    { again: start, garage: showGarage, menu: showTitle });
}

/* ---------- boot ---------- */
buildSprites();
resize();
window.addEventListener('load', resize);
reset();
/* Options live in the pause menu, rendered and remembered by the shell. */
/* the menu shows the LAST USED setting, not the default: `optManual` and the
   rest are already loaded from `<id>-opts` by the time this runs, so the
   defaults are read off the live state rather than hardcoded. Without this the
   pause menu always opened on AUTO however you had left it. */
if (AR && AR.options) AR.options.define([
  { key:'side',  label:'CONTROLS', type:'cycle', of:['RIGHT','LEFT'],                    def:'RIGHT' },
  { key:'manual', label:'GEARBOX',    type:'cycle', of:['AUTO','MANUAL'],  def: optManual ? 'MANUAL' : 'AUTO' },
  { key:'mirror', label:'MIRROR',      type:'cycle', of:['FULL','CHEAP','OFF'], def: optMirror || 'FULL' },
  { key:'touchui',label:'TOUCH CONTROLS', type:'cycle', of:['AUTO','ON','OFF'], def: optTouchUI || 'AUTO' }
], function(key, val){
  if(key === 'side')  document.body.classList.toggle('pedals-left', val === 'LEFT');
  /* the toggle now names what it ADDS, so off is the quiet road */
  if(key === 'manual'){
    /* kept in the pause menu as well as the garage: changing your mind about
       the box mid-run is reasonable, changing your CAR is not */
    optManual = (val === 'MANUAL');
    syncBoxClass();
    if(AR && AR.save) AR.save.merge((GAME_ID + '-opts'), { manual:optManual });
    if(optManual){ knobRail = 0; knobY = TOP_Y; placeKnob(); }
    else autoGear();
  }
  if(key === 'mirror') optMirror = val;
  if(key === 'touchui'){ optTouchUI = val; applyTouchUI(); }
  if(key === 'body' && val !== optBody){ optBody = val; buildSprites(); }
  /* ---- TWO HANDLERS, AND THE SECOND ONE WON ------------------------------
     There were two `key === 'manual'` blocks. The first read the option
     correctly; the second then ran `optManual = !!val` — and `val` is the
     STRING 'AUTO' or 'MANUAL', so `!!val` is true either way. Selecting AUTO
     mid-run set manual back on, which is why switching did nothing.

     One handler, comparing the string. The shifter and the gear reset live
     here too, where they belong. */
  if(key === 'paint' && val !== optPaint){
    optPaint = val;
    buildSprites();          /* repaint the coupe */
  }
});

/* Apply the saved gearbox setting once at startup. The options callback only
   fires on CHANGE, so without this the class never matched the saved value. */
/* the garage choices are saved separately from the in-run options, since they
   no longer live in that menu */
(function(){
  const g0 = AR && AR.save ? AR.save.get((GAME_ID + '-opts')) : null;
  if(g0){
    if(g0.body && BODY[g0.body]) optBody = g0.body;
    if(g0.paint && PAINT[g0.paint]){ optPaint = g0.paint; freePaint = g0.paint; }
    if(typeof g0.manual === 'boolean') optManual = g0.manual;
    if(typeof g0.timed === 'boolean') timedRun = g0.timed;
    if(typeof g0.stripes === 'boolean') optStripes = g0.stripes;
  }
  buildSprites();
})();
syncBoxClass();
applyTouchUI();

/* a desktop has no thumbs to put buttons under */
if (AR && !AR.touch) document.body.classList.add('no-touch');

showTitle();
requestAnimationFrame(frameLoop);


  /* ---- WHAT A FORK CAN REACH ------------------------------------------
     A seam is only useful if the callback can see the state it needs. This is
     the whole surface: read `pos` and `spd`, reach the racers, borrow the
     drawing helpers. Deliberately small — anything wider and a fork starts
     depending on the engine's internals rather than on its interface. */
  Object.defineProperties(API, {
    pos:      { get: function(){ return pos; } },
    spd:      { get: function(){ return spd; } },
    /* WHERE across the road, in lanes, and how bent. Read-only: the harness
       in tools/drive-test.py needs to know whether it is on the track and
       whether it is wrecking, and a test that cannot see those two numbers
       cannot tell a clean lap from thirty seconds of scraping a wall. */
    playerX:  { get: function(){ return playerX; } },
    dmg:      { get: function(){ return dmg; } },
    /* the cars in front. Read-only, and here for the same reason as the two
       above: a test driver that cannot see traffic drives into it, and a
       Interstate run that spends thirty seconds wrecked proves nothing about
       the engine. */
    traffic:  { get: function(){ return traffic; } },
    state:    { get: function(){ return state; } },
    clock:    { get: function(){ return clock; } },
    racers:   { get: function(){ return racers; } },
    finished: { get: function(){ return finished; },
                set: function(v){ finished = v; } }
  });
  API.PLAYER_Z = PLAYER_Z; API.MAX_SPD = MAX_SPD; API.BODY = BODY;
  API.segAt = segAt; API.rr = rr; API.rnd = rnd; API.rint = rint;
  API.flashWarn = flashWarn; API.snd = snd;
  API.horizon = function(){ return horizon; };
  API.wet = function(){ return +wet.toFixed(3); };
  API.snowy = function(){ return snowy; };
  API.settle = function(){ return +settle.toFixed(3); };
  API.biome = function(){ return biome; };
  API.throttle = function(){ return (gas||nosOn) ? 1 : 0; };
  API.revs = function(){ return engineRpm(); };
  API.redline = function(){ return redline(); };
  API.setWet = function(v){ wet = wetTarget = v; };
  API.hp = function(){ return bodyHp(); };
  API.setBody = function(k){ optBody = k; buildSprites(); syncBoxClass(); };
  API.launchKick = function(){ return launchKick; };
  API.cops = function(){ return cops; };
  API.heat = function(v){ if(v!==undefined) heat=v; return heat; };
  API.setSpd = function(v){ spd = v; };
  API.coasting = function(){ return coasting; };
  API.superSprite = function(){ return !!SP.superCop; };
  API.mass = function(){ return bodyMass(); };
  API.ptw = function(){ return powerToWeight(); };
  API.zeroSixty = function(k){ return zeroSixty(k); };
  API.inCruiser = function(){ return inCruiser(); };
  API.paintChoices = function(){ return paintChoices(); };
  API.setBar = function(v){ barOn = v; };
  API.blockedAhead = function(){ return blockedAhead; };
  API.mergesMade = function(){ return mergesMade; };
  API.trafficCount = function(){ return traffic.length; };
  API.tightestAhead = function(){ return +tightestAhead.toFixed(3); };
  API.spriteStats = function(){ return { drawn:spriteStats.drawn, culled:spriteStats.culled, clipped:spriteStats.clipped }; };
  API.spriteWidthAt = function(dz){
    const pp = proj(0, pos + dz);
    if(!pp.ok) return null;
    const w2 = pp.scale*0.265*ROAD*W;
    return (w2 < 1.2 || w2 > W*3.4) ? null : w2;
  };
  API.rivalSprite = function(k){ return RIVAL_SP[k]; };
  API.yawTo = function(z){ return yawTo(z); };
  API.billboard = function(z){ return billboard(z); };
  API.jumpTo = function(z){ pos = z - PLAYER_Z; rebuildBend(); };
  API.setMode = function(m){ mode = m; };
  API.playerSprite = function(){ return SP.player; };
  API.hasNos = function(){ return hasNos(); };
  API.roundRim = function(){
    const MK = (BODY[optBody]||{}).rear || "GENERIC";
    return (MK==="TUNER"||MK==="MUSCLE"||MK==="CRUISER"||MK==="GENERIC"||MK==="ROADSTER")
        && optBody !== "SUPERCRUISER"; };
  API.fleetSheet = function(){
    /* one render of every vehicle: rear, front and wheel */
    const CARS=["FORMULA","STALLION","CREST","MATADOR","CRUISER","SUPERCRUISER","MUSCLE",
                "TUNER","ROADSTER","COUPE","SALOON","PICKUP","CAB","VAN","LORRY"];
    const CW=152, PER=7, rows=Math.ceil(CARS.length/PER);
    const REAR=190, FRONT=190, WH=176;
    const c=document.createElement("canvas");
    c.width=CW*PER; c.height=(REAR+FRONT)*rows+WH*rows+70;
    const g=c.getContext("2d"); g.fillStyle="#15121a"; g.fillRect(0,0,c.width,c.height);
    const lab=(t,x,y)=>{g.font="11px monospace";g.fillStyle="#ffb37a";g.textAlign="center";g.fillText(t,x,y);};
    const hd=(t,y)=>{g.font="bold 12px monospace";g.fillStyle="#8fa6c8";g.textAlign="left";g.fillText(t,12,y);};
    const CABP={body:"#f2b32c",hi:"#ffd45e",lo:"#8f6408"};
    const TRL={body:"#8a8477",hi:"#a8a293",lo:"#4e4a41"};
    const sizeFor=r=>r==="muscle"?[210,158]:r==="cop"?[200,164]:r==="van"?[200,196]
                    :r==="pickup"?[206,176]:r==="truck"?[230,250]:[206,150];
    const keep=optBody, keepP=optPaint, keepS=optStripes;
    optStripes=false;
    let y=24;
    hd("REAR",y-6);
    CARS.forEach(function(bt,i){
      const rw=Math.floor(i/PER), cl=i%PER, B=BODY[bt];
      const base = bt==="CAB"?CABP : bt==="LORRY"?TRL : PAINT.WHITE;
      const pa=Object.assign({lamp:"#d61b3c",lamp2:"#ff7a86",player:true,marque:B.rear},base);
      let im;
      if(B.rig){const sz=sizeFor(B.rig); im=sprite(sz[0],sz[1],paintRig(B.rig,pa));}
      else {optBody=bt;optPaint="WHITE";buildSprites();im=SP.player;}
      const yy=y+rw*REAR,bw=CW-28,bh=bw*im.height/im.width;
      g.drawImage(im,cl*CW+14,yy+140-bh,bw,bh); lab(bt,cl*CW+CW/2,yy+160);
    });
    y+=REAR*rows+20;
    hd("FRONT",y-6);
    CARS.forEach(function(bt,i){
      const rw=Math.floor(i/PER), cl=i%PER, B=BODY[bt];
      const base = bt==="CAB"?CABP : PAINT.WHITE;
      const pa=Object.assign({lamp:"#d61b3c",lamp2:"#ff7a86",player:true,marque:B.rear},base);
      let im;
      if(B.rig){const sz=sizeFor(B.rig); im=sprite(sz[0],sz[1],paintRigFront(B.rig,pa));}
      else im=sprite(230,215,paintFront(Object.assign({bodyType:bt},pa)));
      const yy=y+rw*FRONT,bw=CW-28,bh=bw*im.height/im.width;
      g.drawImage(im,cl*CW+14,yy+140-bh,bw,bh); lab(bt,cl*CW+CW/2,yy+160);
    });
    y+=FRONT*rows+20;
    hd("STEERING WHEELS",y-6);
    CARS.forEach(function(bt,i){
      const rw=Math.floor(i/PER), cl=i%PER;
      optBody=bt; buildSprites(); steerTurn=0; drawWheel();
      const yy=y+rw*WH, sz=CW-46;
      g.drawImage(wheelCv,cl*CW+23,yy+4,sz,sz); lab(bt,cl*CW+CW/2,yy+sz+22);
    });
    optBody=keep; optPaint=keepP; optStripes=keepS; buildSprites();
    return c.toDataURL("image/png");
  };
  /* ---- THE ENGINE, REACHABLE FROM OUTSIDE ------------------------------
     Both cabinets call `ROAD(CFG)` and throw the return value away, so
     everything the engine knows about itself was unreachable to a harness -
     which is why occlusion could be wrong twice without any gate noticing.
     One page runs one engine, so a single well-known handle is enough.
     -------------------------------------------------------------------- */
  window.__road = API;
  return API;

};
