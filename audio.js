/* =====================================================================
   EFFIGY ARCADE — audio.js

   Every sound in this arcade is generated at runtime. No samples, no
   files, nothing to download. One shared engine so the mute settings
   follow you from the launcher into a game and back.

     <script src="../audio.js"></script>     (before arcade.js)

   Buses:  sfx  · music  · ui        each mutable independently
   Prefs persist in localStorage under 'effigyarcade.audio.v1'.

   Browsers will not make a sound until the user has touched something,
   so call Arcade.audio.init() from a real gesture handler.

   © 2026 Effigy Media. All rights reserved.
   ===================================================================== */
(function(){
"use strict";

var KEY = 'effigyarcade.audio.v1';
var A = window.Arcade = window.Arcade || {};

var ctx = null, master = null, sfxBus = null, musBus = null, uiBus = null;
var verb = null, noiseBuf = null, hushed = false;
/* Leaving the page has to silence us. A backgrounded tab still runs its
   scheduler, throttled to about a tick a second, so the bed keeps playing —
   late, dragging and out of time — long after you think you have closed it.
   The game shell pauses itself, but the launcher has no shell, so this lives
   down here where every page gets it. */
var bgHidden = false;
function quiet(){ return hushed || bgHidden; }
var listeners = [], resetSubs = [];
var gestured = false;      // a context built before a real gesture starts
var pending = null;        // suspended and never recovers cleanly on iOS

/* sfx/music are the mute switches; the three levels are continuous 0..1.
   All five live in the same persisted record, so everything the player sets in
   the launcher is already in force inside a cabinet. */
var pref = { sfx:true, music:true, vMaster:1, vMusic:1, vSfx:1 };
var musicTrim = 1.00;
try {
  var raw = localStorage.getItem(KEY);
  if (raw){
    var o = JSON.parse(raw);
    pref.sfx   = o.sfx   !== false;
    pref.music = o.music !== false;
    /* the levels have to be read back too, or they are written in the launcher
       and silently discarded on the way into a cabinet */
    ['vMaster','vMusic','vSfx'].forEach(function(k){
      if (typeof o[k] === 'number' && isFinite(o[k]))
        pref[k] = Math.max(0, Math.min(1, o[k]));
    });
  }
} catch(e){}

function save(){ try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch(e){} }
function fire(){ for (var i=0;i<listeners.length;i++) try { listeners[i](pref); } catch(e){} }

/* a stored level, clamped, defaulting to full if it was never set */
function lvl(key){
  var v = pref[key];
  return (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(1, v)) : 1;
}

function applyGains(t){
  if (!ctx || !sfxBus) return;
  var now = ctx.currentTime, k = Math.max(0.004, (t === undefined ? 0.09 : t) / 3);
  sfxBus.gain.setTargetAtTime((pref.sfx   && !quiet()) ? 0.62 * lvl('vSfx') : 0, now, k);
  /* musicTrim lets a page sit its bed under the interface without touching the
     player's MUSIC toggle. Setting musBus.gain directly does not work — this
     runs on every change and puts it straight back. */
  musBus.gain.setTargetAtTime((pref.music && !quiet()) ? musicTrim * lvl('vMusic') : 0, now, k);
  uiBus.gain.setTargetAtTime(pref.sfx ? 0.55 * lvl('vSfx') : 0, now, 0.01);
  /* master rides everything, including the UI bus */
  if (master) master.gain.setTargetAtTime(lvl('vMaster'), now, k);
}

/* iOS will hand back a context that claims to be running but stays mute
   until something has actually been played inside the gesture itself. */
function unlockTap(){
  try {
    var b = ctx.createBuffer(1, 1, 22050);
    var src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.start(0);
  } catch(e){}
}

/* called whenever the context might have come alive */
function flush(){
  if (!ctx || ctx.state !== 'running') return;
  A.audio.ready = true;
  applyGains(0.05);
  if (pending && !M.timer && M.on) runMusic(pending);
}

function buildVerb(){
  var len = Math.floor(ctx.sampleRate * 1.9);
  var buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (var c=0;c<2;c++){
    var d = buf.getChannelData(c);
    for (var i=0;i<len;i++){
      var x = i/len;
      d[i] = (Math.random()*2-1) * Math.pow(1-x, 3.1) * (1 - x*0.25);
    }
  }
  var cv = ctx.createConvolver(); cv.buffer = buf;
  return cv;
}

/* ------------------------------------------------------------------ */
A.audio = {
  ready:false,
  ctx:null,

  init: function(){
    /* Returns "there is an engine to talk to", NOT "it is making sound yet".
       iOS builds the context inside the gesture but resumes it a moment
       later, so demanding 'running' here made every caller bail out before
       queueing its music, and nothing ever queued it again. */
    if (ctx){
      if (ctx.state !== 'running' && gestured) ctx.resume().then(flush, function(){});
      return true;
    }
    /* ---- TRY ANYWAY -------------------------------------------------------
       This returned early without a gesture, so on a fresh page load the
       context was never even ATTEMPTED — and a game opened from the launcher is
       always a fresh page load, because the launcher navigates rather than
       swapping views. Music could not start until you touched something, and
       if that touch was PLAY you never heard the title at all.

       There is no way to force audio without permission, but there IS a case
       the old code threw away: a browser that has already granted autoplay for
       this origin — desktop, an installed PWA, or one with enough media
       engagement — will happily build a RUNNING context on load.

       So: build it optimistically. If it comes up running, the music starts by
       itself. If it comes up suspended, nothing is lost — `gestured` still
       gates the resume and the first tap flushes the queue exactly as before.
       ---------------------------------------------------------------------- */
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    try { ctx = new C(); } catch(e){ return false; }

    master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musBus = ctx.createGain(); musBus.connect(master);
    uiBus  = ctx.createGain(); uiBus.connect(master);

    verb = buildVerb();
    var vg = ctx.createGain(); vg.gain.value = 0.85;
    verb.connect(vg); vg.connect(master);

    var n = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i=0;i<n;i++) d[i] = Math.random()*2-1;

    A.audio.ctx = ctx; A.audio.ready = true;
    applyGains(0);
    ctx.onstatechange = flush;
    unlockTap();
    /* a context that comes up running on its own means autoplay was allowed:
       treat that as the gesture, so queued music flushes immediately */
    if (ctx.state === 'running'){ gestured = true; flush(); }
    else ctx.resume().then(function(){ gestured = true; flush(); }, function(){});
    startWatchdog();
    return true;
  },

  get: function(k){ return pref[k]; },
  set: function(k, v){ pref[k] = !!v; save(); applyGains(); flush(); fire(); },

  /* Continuous levels, 0..1, kept in the same persisted record as the mutes —
     so anything the player sets in the launcher is already in force inside a
     cabinet without either side knowing about the other.
        vMaster  rides everything, including the interface
        vMusic   the bed only
        vSfx     effects and the interface                                    */
  level: function(k){ return lvl(k); },
  setLevel: function(k, v){
    if (k !== 'vMaster' && k !== 'vMusic' && k !== 'vSfx') return;
    pref[k] = Math.max(0, Math.min(1, +v || 0));
    save(); applyGains(0.05); fire();
    return pref[k];
  },
  toggle: function(k){ A.audio.set(k, !pref[k]); },
  allOn:  function(){ pref.sfx = true;  pref.music = true;  save(); applyGains(); flush(); fire(); },
  allOff: function(){ pref.sfx = false; pref.music = false; save(); applyGains(); fire(); },
  anyOn:  function(){ return pref.sfx || pref.music; },
  onChange: function(fn){ listeners.push(fn); },

  /* If the OS throws the context away entirely — a long spell in the
     background — held voices like engines and drones die with it. Games
     register here to rebuild them. */
  onReset: function(fn){ resetSubs.push(fn); },

  /* silence everything without touching the user's preferences */
  hush: function(v){
    hushed = !!v;
    applyGains(0.16);
    if (hushed) A.music.pause(); else A.music.resume();
  },

  bus: function(which){
    return which === 'music' ? musBus : which === 'ui' ? uiBus : sfxBus;
  },
  now: function(){ return ctx ? ctx.currentTime : 0; }
};

/* ------------------------------------------------------------------
   voices
   ------------------------------------------------------------------ */
function env(g, t0, peak, attack, dur, hold){
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  if (hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

A.sfx = {
  /* a pitched blip, optionally sliding */
  tone: function(o){
    if (!ctx) return null;
    o = o || {};
    if (!ctx) return;
    var t0 = o.t || ctx.currentTime;
    var dur = o.dur || 0.18;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    var f0 = o.freq || 440, f1 = o.to || f0;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;

    var g = ctx.createGain();
    env(g, t0, o.gain === undefined ? 0.22 : o.gain, o.attack === undefined ? 0.006 : o.attack, dur, o.hold);

    var tail = osc;
    if (o.cutoff){
      var f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.cutoff, t0);
      if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.cutoffTo), t0 + dur);
      if (o.q) f.Q.value = o.q;
      tail.connect(f); tail = f;
    }
    tail.connect(g);
    g.connect(A.audio.bus(o.bus || 'sfx'));
    if (o.verb){ var vs = ctx.createGain(); vs.gain.value = o.verb; g.connect(vs); vs.connect(verb); }
    osc.start(t0); osc.stop(t0 + dur + 0.06);
    return osc;
  },

  /* filtered noise: impacts, wind, hats, splashes */
  noise: function(o){
    if (!ctx) return null;
    o = o || {};
    if (!ctx) return;
    var t0 = o.t || ctx.currentTime;
    var dur = o.dur || 0.2;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;

    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
    f.Q.value = o.q === undefined ? 1 : o.q;

    var g = ctx.createGain();
    env(g, t0, o.gain === undefined ? 0.2 : o.gain, o.attack === undefined ? 0.004 : o.attack, dur, o.hold);

    src.connect(f); f.connect(g);
    g.connect(A.audio.bus(o.bus || 'sfx'));
    if (o.verb){ var vs = ctx.createGain(); vs.gain.value = o.verb; g.connect(vs); vs.connect(verb); }
    src.start(t0); src.stop(t0 + dur + 0.06);
    return src;
  },

  /* several tones at once */
  chord: function(freqs, o){
    o = o || {};
    for (var i=0;i<freqs.length;i++){
      var c = {}; for (var k in o) c[k] = o[k];
      c.freq = freqs[i];
      c.t = (o.t || (ctx ? ctx.currentTime : 0)) + (o.spread || 0) * i;
      A.sfx.tone(c);
    }
  },

  drum: function(kind, t, gain, bus){
    if (!ctx) return;
    if (!ctx) return;
    t = t || ctx.currentTime;
    gain = gain === undefined ? 0.5 : gain;
    bus = bus || 'music';
    if (kind === 'kick'){
      A.sfx.tone({ t:t, freq:150, to:44, dur:0.19, type:'sine', gain:gain, attack:0.004, bus:bus });
      A.sfx.noise({ t:t, freq:90, dur:0.04, gain:gain*0.35, filter:'lowpass', bus:bus });
    } else if (kind === 'snare'){
      A.sfx.noise({ t:t, freq:1800, to:900, dur:0.15, gain:gain*0.55, filter:'bandpass', q:0.8, bus:bus });
      A.sfx.tone({ t:t, freq:210, to:150, dur:0.1, type:'triangle', gain:gain*0.28, bus:bus });
    } else if (kind === 'hat'){
      A.sfx.noise({ t:t, freq:8200, dur:0.038, gain:gain*0.22, filter:'highpass', q:0.6, bus:bus });
    } else if (kind === 'open'){
      A.sfx.noise({ t:t, freq:7200, dur:0.20, gain:gain*0.16, filter:'highpass', q:0.6, bus:bus });
    } else if (kind === 'tom'){
      A.sfx.tone({ t:t, freq:190, to:90, dur:0.22, type:'sine', gain:gain*0.5, bus:bus });
    } else if (kind === 'clap'){
      for (var i=0;i<3;i++)
        A.sfx.noise({ t:t+i*0.012, freq:1500, dur:0.09, gain:gain*0.3, filter:'bandpass', q:1.4, bus:bus });
    }
  },

  /* a held voice you drive yourself — engines, sirens, drones */
  hold: function(o){
    if (!ctx) return null;
    o = o || {};
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sawtooth';
    osc.frequency.value = o.freq || 110;
    if (o.detune) osc.detune.value = o.detune;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.value = o.cutoff || 900;
    f.Q.value = o.q === undefined ? 0.8 : o.q;
    var g = ctx.createGain(); g.gain.value = 0;
    /* Optional stereo placement. Anything that exists at a POSITION in the
       world — another car passing, a siren going by — needs to move across
       the ears, not just get louder. */
    var pan = null;
    if (o.pan !== undefined && ctx.createStereoPanner){
      pan = ctx.createStereoPanner();
      pan.pan.value = o.pan;
      osc.connect(f); f.connect(g); g.connect(pan);
      pan.connect(A.audio.bus(o.bus || 'sfx'));
    } else {
      osc.connect(f); f.connect(g); g.connect(A.audio.bus(o.bus || 'sfx'));
    }
    if (o.verb){ var vs = ctx.createGain(); vs.gain.value = o.verb; g.connect(vs); vs.connect(verb); }
    osc.start();
    return {
      osc:osc, filter:f, gain:g,
      set: function(freq, level, cutoff, glide){
        if (!ctx) return;
        var n = ctx.currentTime, k = glide || 0.05;
        if (freq !== undefined)   osc.frequency.setTargetAtTime(Math.max(8, freq), n, k);
        if (level !== undefined)  g.gain.setTargetAtTime(level, n, k);
        if (cutoff !== undefined) f.frequency.setTargetAtTime(Math.max(40, cutoff), n, k);
      },
      /* -1 hard left, 0 centre, +1 hard right */
      place: function(x, glide){
        if (!ctx || !pan) return;
        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, x)),
                                ctx.currentTime, glide || 0.06);
      },
      stop: function(){ if (!ctx) return; try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); osc.stop(ctx.currentTime + 0.4); } catch(e){} }
    };
  },

  /* same idea but noise-based — wind, tyre roar, water */
  holdNoise: function(o){
    if (!ctx) return null;
    o = o || {};
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.value = o.freq || 800;
    f.Q.value = o.q === undefined ? 0.7 : o.q;
    var g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(A.audio.bus(o.bus || 'sfx'));
    src.start();
    return {
      gain:g, filter:f,
      set: function(freq, level, glide){
        if (!ctx) return;
        var n = ctx.currentTime, k = glide || 0.08;
        if (freq !== undefined)  f.frequency.setTargetAtTime(Math.max(40, freq), n, k);
        if (level !== undefined) g.gain.setTargetAtTime(level, n, k);
      },
      stop: function(){ if (!ctx) return; try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); src.stop(ctx.currentTime + 0.4); } catch(e){} }
    };
  }
};

/* small interface clicks, on their own bus so a paused game stays audible */
A.ui = {
  tick: function(){ A.sfx.tone({ freq:900, to:1300, dur:0.05, type:'square', gain:0.10, bus:'ui' }); },
  ok:   function(){ A.sfx.tone({ freq:660, to:990, dur:0.10, type:'square', gain:0.11, bus:'ui' }); },
  off:  function(){ A.sfx.tone({ freq:520, to:300, dur:0.10, type:'square', gain:0.11, bus:'ui' }); }
};

/* ------------------------------------------------------------------
   music: a lookahead step sequencer. A game hands over a tick(step, t)
   and schedules whatever it likes at the times it is given.
   ------------------------------------------------------------------ */
var M = { bpm:120, div:4, step:0, next:0, tickFn:null, timer:null, on:false, paused:false };

function runMusic(spec){
  if (M.timer){ clearInterval(M.timer); M.timer = null; }
  if (!ctx) return;
  M.bpm = spec.bpm; M.div = spec.div; M.tickFn = spec.tickFn;
  M.step = 0; M.next = ctx.currentTime + 0.05; M.on = true; M.paused = false;
  M.timer = setInterval(function(){
    if (!M.on || M.paused || !ctx || ctx.state !== 'running') return;
    var spb = 60 / M.bpm / M.div;
    /* if the clock jumped — tab restored, context resumed — do not try to
       replay the gap, just pick up from now */
    if (M.next < ctx.currentTime - 0.3) M.next = ctx.currentTime + 0.05;
    var horizon = ctx.currentTime + 0.14, guard = 0;
    while (M.next < horizon && guard++ < 32){
      try { M.tickFn(M.step, M.next); } catch(e){}
      M.step++; M.next += spb;
    }
  }, 25);
}

A.music = {
  /* 0..1, how loud this page's bed sits under its interface. Applied through
     applyGains, because setting musBus.gain directly does not survive — that
     function runs on every change and puts it straight back. */
  trim: function(v){
    musicTrim = Math.max(0, Math.min(1, v));
    applyGains(0.15);
    return musicTrim;
  },
  start: function(bpm, div, tickFn){
    pending = { bpm:bpm, div:div, tickFn:tickFn };
    M.on = true;
    /* Run it now even if the context is still waking. The tick loop skips
       scheduling while the clock is dead and resyncs the moment it starts,
       so the bed comes in within one 25ms tick instead of waiting for a
       watchdog sweep or a state-change event that may never fire. */
    if (ctx) runMusic(pending);
  },
  stop: function(){
    M.on = false; M.tickFn = null; pending = null;
    if (M.timer){ clearInterval(M.timer); M.timer = null; }
  },
  pause:  function(){ M.paused = true; },
  resume: function(){
    if (!M.on || !ctx) return;
    if (M.paused && ctx){ M.next = ctx.currentTime + 0.06; M.paused = false; }
  },
  playing: function(){ return M.on; },
  bpm: function(){ return M.bpm; }
};

/* a handful of note names so game code reads musically */
var NAMES = {C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
A.note = function(name, oct){
  var n = NAMES[name];
  if (n === undefined) return 440;
  return 440 * Math.pow(2, (n - 9) / 12 + ((oct === undefined ? 4 : oct) - 4));
};

/* Everything above assumes the browser behaves. This is the net underneath:
   twice a second, check that what should be audible actually is, and repair
   it. It fixes a stalled start without the player having to touch the mute
   toggle, which is the manual version of exactly this. */
var wdTimer = null, wdFast = 0;
function startWatchdog(){
  if (wdTimer){ wdFast = Date.now() + 6000; return; }
  wdFast = Date.now() + 6000;
  wdTimer = setInterval(function(){
    if (!ctx) return;
    if (bgHidden) return;          /* deliberately asleep; leave it alone */
    /* after the opening scramble, back off so we are not polling forever */
    if (Date.now() > wdFast && ctx.state === 'running' && M.timer && !pending) return;
    if (ctx.state === 'closed'){
      ctx = null; master = sfxBus = musBus = uiBus = verb = noiseBuf = null;
      A.audio.ctx = null; A.audio.ready = false;
      if (M.timer){ clearInterval(M.timer); M.timer = null; }
      if (gestured && A.audio.init()){
        for (var i=0;i<resetSubs.length;i++) try { resetSubs[i](); } catch(e){}
      }
      return;
    }
    if (ctx.state !== 'running'){
      if (gestured) ctx.resume().then(flush, function(){});
      return;
    }
    /* music was asked for but never actually got going */
    if (pending && M.on && !M.paused && !M.timer) runMusic(pending);
    /* a bus that should be open but is sitting at zero */
    var wantMus = (pref.music && !quiet()) ? 1.00 : 0;
    var wantSfx = (pref.sfx   && !quiet()) ? 0.62 : 0;
    if (Math.abs(musBus.gain.value - wantMus) > 0.4 ||
        Math.abs(sfxBus.gain.value - wantSfx) > 0.4) applyGains(0.05);
  }, 120);
}

/* Any real gesture is our cue: build the context if we have not yet, resume
   it if the browser parked it, and release any music that was queued while
   we were not allowed to make a sound. Stays subscribed, because a tab can
   be suspended again at any time. */
function wake(){
  gestured = true;
  /* If a page loads while the browser thinks it is hidden — which iOS does
     when a home-screen app is launched from cold — the background silencer
     can latch on and never let go. A real gesture on a visible page is proof
     enough that we are back. */
  if (bgHidden && !document.hidden) background(false);
  if (killTimer){ clearTimeout(killTimer); killTimer = null; }
  A.audio.init();
  if (!ctx) return;
  unlockTap();
  if (ctx.state !== 'running') ctx.resume().then(flush, function(){});
  else flush();
  /* re-assert every time: if a bus is sitting at zero when the player has
     not asked for silence, open it now rather than waiting on the watchdog */
  if (!hushed){
    if (pref.music && musBus.gain.value < 0.05) applyGains(0);
    if (pref.sfx   && sfxBus.gain.value < 0.05) applyGains(0);
  }
  if (pending && M.on && !M.timer && ctx.state === 'running') runMusic(pending);
  startWatchdog();
}
/* ---- TRY ONCE ON LOAD, BEFORE ANY GESTURE --------------------------------
   Nothing called `init()` until the first tap, so on a fresh page load the
   engine did not exist and the music had nowhere to go. A game opened from the
   launcher is ALWAYS a fresh page load, because the launcher navigates rather
   than swapping views — which is why games started silent.

   Attempting it costs one suspended context if permission is refused, and
   wins outright wherever autoplay is already allowed for the origin: desktop,
   an installed PWA, or a site the browser has enough engagement with. The
   gesture path below is untouched and still catches every other case.
   -------------------------------------------------------------------------- */
try { A.audio.init(); } catch(e){}

/* capture phase: a game's own pointerdown handler on its canvas would
   otherwise run first and find the engine still asleep */
document.addEventListener('pointerdown', wake, { capture:true, passive:true });
document.addEventListener('touchstart',  wake, { capture:true, passive:true });
document.addEventListener('keydown',     wake, { capture:true, passive:true });
document.addEventListener('click',       wake, { capture:true, passive:true });
/* Tear the engine down completely. suspend() only parks the audio session —
   iOS can and does resume a parked session after the app is gone, which is
   how a backgrounded page carried on blipping through a force-quit. close()
   releases the hardware for good; the next real gesture builds a fresh
   context and the games rebuild their held voices through onReset. */
var killTimer = null;
function teardown(){
  if (killTimer){ clearTimeout(killTimer); killTimer = null; }
  if (M.timer){ clearInterval(M.timer); M.timer = null; }
  M.paused = true;
  if (wdTimer){ clearInterval(wdTimer); wdTimer = null; }
  if (!ctx) return;
  try { if (master) master.disconnect(); } catch(e){}
  var dying = ctx;
  ctx = null; master = sfxBus = musBus = uiBus = verb = noiseBuf = null;
  A.audio.ctx = null; A.audio.ready = false;
  try { if (dying.state !== 'closed') dying.close(); } catch(e){}
}

function background(on){
  if (bgHidden === on) return;
  bgHidden = on;
  if (on){
    M.paused = true;
    applyGains(0.03);
    if (ctx && ctx.state === 'running') ctx.suspend().catch(function(){});
    /* If we are still hidden a few seconds later the app is not coming back
       soon — stop being a live audio session at all. Covers the case where
       pagehide never fires, which is how it escaped a force-quit. */
    if (killTimer) clearTimeout(killTimer);
    killTimer = setTimeout(teardown, 4000);
  } else {
    if (killTimer){ clearTimeout(killTimer); killTimer = null; }
    if (!hushed) M.paused = false;
    if (ctx && gestured) ctx.resume().then(flush, function(){});
    applyGains(0.05);
  }
}

document.addEventListener('visibilitychange', function(){
  background(document.hidden);
  if (!document.hidden && gestured) wake();
});
/* pagehide fires where visibilitychange sometimes does not — closing a tab,
   swiping a home-screen app away, the back/forward cache */
/* closing, swiping the app away, or being frozen: destroy it outright */
window.addEventListener('pagehide', teardown);
window.addEventListener('freeze',   teardown);
window.addEventListener('beforeunload', teardown);
window.addEventListener('blur',     function(){ if (document.hidden) background(true); });
window.addEventListener('pageshow', function(){ if (!document.hidden) background(false); });
})();
