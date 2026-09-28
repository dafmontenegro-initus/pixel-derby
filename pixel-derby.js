/* =========================================================
   🏇 CABALLOS 8-BIT  —  p5.js (estilo NES / Excitebike)

   Reglas:
   - Meta a 100 pasos.
   - Cada caballo nace con un paso mínimo lo ∈ [0,1) y uno
     máximo hi ∈ [1,2). En cada turno avanza rnd(lo, hi).
   - Cada caballo tiene 4 cajas "?" propias: posiciones
     distintas y 4 tipos distintos (de 6), ocultos hasta que
     las pisa. Al pisarla salta y se revela la suerte.

   Controles: ESPACIO velocidad x1/x3 · M sonido
              En resultados: ENTER/R revancha · C configurar

   Nota para el editor de p5: todos los bucles llevan llaves
   {} y no hay do/while, porque la protección de bucles del
   editor falla con esas formas.
   ========================================================= */

// ─── Reglas ────────────────────────────────────────────────
const META = 100;
const N_OBS = 4;
const MAX_LANES = 9;
const TICK_MS = 260;
const TICK_FAST_MS = 90;

// Carrera reñida (rebufo): los de atrás aceleran según qué tan lejos van
// del puntero y el puntero corta el viento. Se puede apagar en la config.
const DRAFT_PER_STEP = 0.2;   // +20% de paso por cada paso de distancia al líder
const DRAFT_MAX = 1.5;        // hasta +150%
const LEADER_FACTOR = 0.7;    // el que va adelante avanza al 70%

// ─── Escena (resolución interna estilo NES) ───────────────
const W = 320, H = 200;
const UNIT = 12;                 // píxeles por paso
const LANE_H = 12;
const TRACK_TOP = 46;
const TRACK_BOTTOM = TRACK_TOP + MAX_LANES * LANE_H;
const SHEAR = 4;                 // perspectiva diagonal 2.5D
const START_X = 64;
const FINISH_X = START_X + META * UNIT;
const WORLD_W = FINISH_X + MAX_LANES * SHEAR + W;
const JUMP_MS = 420;
const COUNTDOWN_MS = 2400;

const PAL = {
  grass: '#80d010', grassDark: '#58a800',
  bush: '#ac7c00', bushLight: '#fce0a8', bushDark: '#503000',
  dirt: '#fc9838', dirtDark: '#e45c10', dirtLight: '#fcb868', line: '#fce0a8',
  weed: '#005800', weedMid: '#00a800', weedLight: '#58d854',
  black: '#000000', white: '#fcfcfc', yellow: '#f8b800', red: '#f83800',
  blue: '#0058f8', skin: '#fcbcb0', dim: '#7c7c7c', mud: '#503000', mudLight: '#881400',
  gold: '#f8b800', silver: '#bcbcbc', bronze: '#c84c0c', cloud: '#505050', rain: '#3cbcfc'
};

const SILKS = [
  { shirt: '#f83800', cap: '#fcfcfc' }, { shirt: '#0058f8', cap: '#f8b800' },
  { shirt: '#00a800', cap: '#fcfcfc' }, { shirt: '#6844fc', cap: '#f878f8' },
  { shirt: '#f8b800', cap: '#f83800' }, { shirt: '#3cbcfc', cap: '#0058f8' },
  { shirt: '#f878f8', cap: '#6844fc' }, { shirt: '#fcfcfc', cap: '#00a800' },
  { shirt: '#fc7460', cap: '#3cbcfc' }
];
const COATS = [
  ['#a05000', '#402000'], ['#bcbcbc', '#fcfcfc'], ['#6b3a10', '#1a0a00'],
  ['#fce0a8', '#fcfcfc'], ['#505050', '#101010'], ['#c84c0c', '#581000'],
  ['#ac7c00', '#503000'], ['#881400', '#301000'], ['#e8d0b0', '#7c5030']
];

const HORSE_NAMES = ['Daniel F.', 'Juan D.', 'Elkin', 'Christian', 'Julio',
  'Camilo', 'Vlad', 'Marcelo', 'Angel', 'Maria P.'];

// Fotos por nombre (carpeta horses/). La clave es el nombre en minúsculas,
// sin tildes, espacios ni puntos: "Juan D." → juand, "Maria P." → mariap.
// Rutas escritas completas para que el editor de p5 las encuentre.
// Para agregar la foto de Daniel F.: sube horses/danielf.png y añade
//   danielf: 'horses/danielf.png',
const HORSE_PHOTOS = {
  juand: 'horses/juand.png', elkin: 'horses/elkin.png', christian: 'horses/christian.jpg',
  julio: 'horses/julio.png', camilo: 'horses/camilo.png', vlad: 'horses/vlad.png',
  marcelo: 'horses/marcelo.png', angel: 'horses/angel.png', mariap: 'horses/maria.png'
};

function photoKey(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Cajas de la suerte (cada caballo recibe 4 tipos distintos)
const EFFECTS = {
  turbo:    { icon: '>>', name: 'TURBO',    col: '#f878f8' },
  estrella: { icon: '*',  name: 'ESTRELLA', col: '#f8b800' },
  barro:    { icon: '~',  name: 'BARRO',    col: '#c84c0c' },
  tropiezo: { icon: '!',  name: 'TROPIEZO', col: '#f83800' },
  viento:   { icon: '<<', name: 'VIENTO',   col: '#3cbcfc' },
  dado:     { icon: '@',  name: 'DADO',     col: '#fcfcfc' }
};

// ─── Estado global ─────────────────────────────────────────
let cnv, ctx;
let race = null;
let worldCanvas = null, attractWorld = null;
let phase = 'setup';          // setup · countdown · racing · finishing · results
let camX = 0;
let readyAt = 0;
let goAt = 0, lastTick = 0, raceStart = 0, raceEnd = 0, lastNow = 0, resultsAt = 0;
let fast = false, muted = false;
let uiButtons = [];
let confetti = [], rainDrops = [];
let laneNames = [];
let laneCount = 7;
let lastNPref = 2;
let closeRace = true;
const customPhotos = [];      // fotos subidas por carril
const photoCache = {};

// =========================================================
//                     CICLO DE p5
// =========================================================
function setup() {
  cnv = createCanvas(W, H);
  pixelDensity(1);
  noSmooth();
  ctx = drawingContext;
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.overflow = 'hidden';
  loadSettings();
  buildSetupUI();
  setupPointer();
  document.addEventListener('fullscreenchange', () => setTimeout(fitCanvas, 50));
  fitCanvas();
}

function windowResized() {
  fitCanvas();
}

// El canvas siempre cabe completo en la ventana (o en la vista previa)
function fitCanvas() {
  const st = cnv.elt.style;
  st.position = 'fixed';
  st.left = '50%';
  st.top = '50%';
  st.transform = 'translate(-50%, -50%)';
  st.width = 'min(100vw, calc(100vh * ' + (W / H) + '))';
  st.height = 'auto';
  st.aspectRatio = W + ' / ' + H;
  st.display = 'block';
  st.imageRendering = 'pixelated';
}

function draw() {
  const now = millis();
  const dt = Math.min(100, now - (lastNow || now));
  lastNow = now;
  ctx = drawingContext;
  ctx.imageSmoothingEnabled = false;
  uiButtons = [];

  if (phase === 'setup' || !race) {
    drawAttract(now);
  } else if (phase === 'results') {
    drawResults(now);
  } else {
    updateRace(now, dt);
    drawRace(now);
  }
}

// =========================================================
//                  UTILIDADES DE DIBUJO
// =========================================================
function R(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hexCol, f) {
  const n = parseInt(hexCol.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return 'rgb(' + ch(n >> 16) + ',' + ch((n >> 8) & 255) + ',' + ch(n & 255) + ')';
}

// Fuente bitmap 3x5
const GLYPHS = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2], 8: [2, 5, 2, 5, 2], 9: [2, 5, 3, 1, 6],
  ':': [0, 2, 0, 2, 0], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0], '!': [2, 2, 2, 0, 2],
  '?': [6, 1, 2, 0, 2], '/': [1, 1, 2, 4, 4], '+': [0, 2, 7, 2, 0], '(': [1, 2, 2, 2, 1],
  ')': [4, 2, 2, 2, 4], ',': [0, 0, 0, 2, 4], "'": [2, 2, 0, 0, 0], '<': [1, 2, 4, 2, 1],
  '>': [4, 2, 1, 2, 4], '#': [5, 7, 5, 7, 5], '*': [5, 2, 7, 2, 5], '~': [0, 3, 6, 0, 0], '@': [5, 0, 2, 0, 5],
  ' ': [0, 0, 0, 0, 0]
};

function cleanText(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¡¿]/g, '').toUpperCase();
}

function tw(s, sc) {
  const k = sc || 1;
  return s.length ? s.length * 4 * k - k : 0;
}

function drawText(s, x, y, col, sc, shadow) {
  const k = sc || 1;
  if (shadow) {
    const o = Math.min(k, 2);
    drawText(s, x + o, y + o, shadow, k);
  }
  ctx.fillStyle = col;
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r] & (4 >> c)) {
          ctx.fillRect(cx + c * k, cy + r * k, k, k);
        }
      }
    }
    cx += 4 * k;
  }
}

function drawTextC(s, cx, y, col, sc, shadow) {
  drawText(s, Math.round(cx - tw(s, sc) / 2), y, col, sc, shadow);
}

// =========================================================
//               SPRITES: CABALLO + JINETE
// =========================================================
// Frames 0-3 galope · 4 salto · 5 parado
const LEG_FRAMES = [
  { bn: -0.9, bf: -0.5, fn: 0.9, ff: 0.6, len: 7, bob: 0 },
  { bn: -0.3, bf: 0.1, fn: 0.3, ff: -0.2, len: 7, bob: -1 },
  { bn: 0.5, bf: 0.3, fn: -0.5, ff: -0.3, len: 7, bob: 0 },
  { bn: 0.1, bf: -0.3, fn: -0.1, ff: 0.3, len: 7, bob: -1 },
  { bn: -1.1, bf: -0.8, fn: 1.2, ff: 0.9, len: 5, bob: 0 },
  { bn: 0, bf: 0.15, fn: 0, ff: 0.15, len: 7, bob: 0 }
];
const SPR_W = 26, SPR_H = 27;
const SPR_NOSE_X = 23, SPR_BASE_Y = 23;

function buildSprite(coat, silk, f) {
  const c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const g = c.getContext('2d');
  const L = LEG_FRAMES[f];
  const body = coat[0], mane = coat[1];
  const far = shade(body, 0.65);
  const Rs = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(1 + x, 2 + y + L.bob, w, h);
  };
  const leg = (hx, a, col) => {
    for (let i = 0; i < L.len; i++) {
      Rs(hx + Math.round(a * i), 15 + i, 1, 1, col);
    }
  };

  leg(8, L.bf, far);
  leg(15, L.ff, far);
  Rs(2, 10, 3, 1, mane);
  Rs(1, 11, 2, 2, mane);
  if (f % 2 === 0) {
    Rs(0, 13, 2, 2, mane);
  } else {
    Rs(1, 13, 1, 3, mane);
  }
  Rs(4, 10, 1, 4, body);
  Rs(5, 10, 12, 5, body);
  Rs(6, 15, 10, 1, body);
  Rs(6, 10, 8, 1, shade(body, 1.2));
  Rs(15, 6, 3, 5, body);
  Rs(16, 4, 3, 3, body);
  Rs(18, 4, 4, 3, body);
  Rs(21, 6, 2, 2, body);
  Rs(17, 3, 1, 1, body);
  Rs(15, 5, 1, 4, mane);
  Rs(16, 3, 1, 2, mane);
  Rs(19, 5, 1, 1, PAL.black);
  leg(6, L.bn, body);
  leg(13, L.fn, body);
  Rs(8, 11, 4, 3, PAL.white);
  Rs(8, 8, 4, 2, PAL.white);
  Rs(10, 10, 2, 2, '#202020');
  Rs(9, 5, 4, 3, silk.shirt);
  Rs(13, 6, 2, 2, silk.shirt);
  Rs(15, 7, 1, 1, PAL.skin);
  Rs(12, 2, 3, 3, PAL.skin);
  Rs(11, 1, 4, 2, silk.cap);
  Rs(15, 2, 1, 1, silk.cap);

  // contorno negro de 1px
  const img = g.getImageData(0, 0, SPR_W, SPR_H);
  const d = img.data;
  const out = new Uint8ClampedArray(d);
  const opaque = (x, y) => x >= 0 && y >= 0 && x < SPR_W && y < SPR_H && d[(y * SPR_W + x) * 4 + 3] > 0;
  for (let y = 0; y < SPR_H; y++) {
    for (let x = 0; x < SPR_W; x++) {
      const i = (y * SPR_W + x) * 4;
      if (d[i + 3] === 0 && (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1))) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 255;
      }
    }
  }
  g.putImageData(new ImageData(out, SPR_W, SPR_H), 0, 0);
  return c;
}

const spriteCache = [];
function spritesForLane(k) {
  if (!spriteCache[k]) {
    spriteCache[k] = LEG_FRAMES.map((_, f) => buildSprite(COATS[k], SILKS[k], f));
  }
  return spriteCache[k];
}

// =========================================================
//                        ESCENARIO
// =========================================================
function laneTop(k) {
  return TRACK_TOP + k * LANE_H;
}
function laneOff(k) {
  return k * SHEAR;
}

function buildWorld() {
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = H;
  const g = c.getContext('2d');
  const Rw = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const saved = ctx;
  ctx = g;   // para usar drawText sobre el mundo

  Rw(0, 0, WORLD_W, H, PAL.grass);
  for (let y = 2; y < H; y += 6) {
    if (y >= 28 && y < TRACK_BOTTOM + 12) {
      continue;
    }
    for (let x = 0; x < WORLD_W; x += 8) {
      const h = hash2(x, y);
      if (h < 0.45) {
        const ox = x + (Math.floor(h * 100) % 6);
        Rw(ox, y + 1, 1, 1, PAL.grassDark);
        Rw(ox + 1, y, 1, 1, PAL.grassDark);
        Rw(ox + 2, y + 1, 1, 1, PAL.grassDark);
      }
    }
  }

  // valla + arbustos
  Rw(0, 33, WORLD_W, 1, PAL.bushLight);
  Rw(0, 34, WORLD_W, 1, PAL.bushDark);
  for (let x = 0; x < WORLD_W; x += 16) {
    Rw(x, 30, 2, 8, PAL.bushLight);
    Rw(x + 2, 30, 1, 8, PAL.bushDark);
  }
  const BUSH = ['..bbbb..', '.bccbbb.', 'bccbbbbd', 'bcbbbbbd', 'bbbbbbdd', '.dddddd.'];
  const BUSH_COL = { b: PAL.bush, c: PAL.bushLight, d: PAL.bushDark };
  for (let x = 0; x < WORLD_W; x += 8) {
    const yb = 38 + (hash2(x, 1) < 0.5 ? 0 : 1);
    for (let ry = 0; ry < BUSH.length; ry++) {
      const row = BUSH[ry];
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '.') {
          Rw(x + rx, yb + ry, 1, 1, BUSH_COL[row[rx]]);
        }
      }
    }
  }

  // pista
  Rw(0, TRACK_TOP, WORLD_W, MAX_LANES * LANE_H, PAL.dirt);
  const speckles = Math.floor(WORLD_W * MAX_LANES * LANE_H * 0.04);
  for (let i = 0; i < speckles; i++) {
    const x = Math.floor(hash2(i, 7) * WORLD_W);
    const y = TRACK_TOP + Math.floor(hash2(i, 11) * MAX_LANES * LANE_H);
    Rw(x, y, 1, 1, hash2(i, 13) < 0.6 ? PAL.dirtDark : PAL.dirtLight);
  }
  for (let k = 1; k < MAX_LANES; k++) {
    for (let x = (laneOff(k) % 12) - 12; x < WORLD_W; x += 12) {
      Rw(x, laneTop(k), 6, 1, PAL.line);
    }
  }
  Rw(0, TRACK_TOP - 1, WORLD_W, 1, PAL.black);
  Rw(0, TRACK_TOP, WORLD_W, 1, PAL.line);
  Rw(0, TRACK_BOTTOM, WORLD_W, 1, PAL.dirtDark);
  Rw(0, TRACK_BOTTOM + 1, WORLD_W, 1, PAL.black);

  // salida, número de carril y meta en diagonal
  for (let k = 0; k < MAX_LANES; k++) {
    const top = laneTop(k);
    Rw(START_X + laneOff(k) - 1, top + 1, 2, LANE_H - 1, PAL.white);
    drawText(String(k + 1), START_X + laneOff(k) + 4, top + 4, PAL.line);
    const fx = FINISH_X + laneOff(k);
    for (let yy = 1; yy < LANE_H; yy += 2) {
      for (let xx = 0; xx < 4; xx += 2) {
        const white = ((yy >> 1) + (xx >> 1)) % 2 === 0;
        Rw(fx + xx - 2, top + yy, 2, 2, white ? PAL.white : PAL.black);
      }
    }
  }

  // letreros
  const sign = (label, cx, bg, fg) => {
    const w = tw(label);
    const x = Math.round(cx - w / 2);
    Rw(x + Math.floor(w / 2), 28, 1, 5, PAL.black);
    Rw(x - 3, 18, w + 6, 10, PAL.black);
    Rw(x - 2, 19, w + 4, 8, bg);
    drawText(label, x, 20, fg);
  };
  sign('SALIDA', START_X, PAL.white, PAL.black);
  for (let u = 25; u < META; u += 25) {
    sign(String(u), START_X + u * UNIT, PAL.bushLight, PAL.black);
  }
  sign('META', FINISH_X, PAL.red, PAL.white);

  // maleza inferior
  Rw(0, TRACK_BOTTOM + 2, WORLD_W, 10, PAL.weed);
  for (let x = 0; x < WORLD_W; x++) {
    const h = 2 + Math.floor(hash2(x, 3) * 8);
    Rw(x, TRACK_BOTTOM + 12 - h, 1, h, PAL.weedMid);
    if (hash2(x, 5) < 0.3) {
      Rw(x, TRACK_BOTTOM + 12 - h, 1, 1, PAL.weedLight);
    }
  }

  ctx = saved;
  return c;
}

// =========================================================
//                     MOTOR DE CARRERA
// =========================================================
function pickSpots() {
  for (let tries = 0; tries < 500; tries++) {
    const s = [];
    for (let k = 0; k < N_OBS; k++) {
      s.push(8 + Math.floor(Math.random() * 86));
    }
    s.sort((a, b) => a - b);
    let ok = true;
    for (let k = 1; k < s.length; k++) {
      if (s[k] - s[k - 1] < 8) {
        ok = false;
      }
    }
    if (ok) {
      return s;
    }
  }
  return [20, 40, 60, 80];
}

function rollVal(t) {
  if (t === 'turbo') { return 2 + Math.floor(Math.random() * 3); }     // 2-4 turnos x2
  if (t === 'estrella') { return 3 + Math.floor(Math.random() * 5); }  // +3..+7
  if (t === 'barro') { return 1 + Math.floor(Math.random() * 3); }     // pierde 1-3 turnos
  if (t === 'tropiezo') { return 2 + Math.floor(Math.random() * 5); }  // -2..-6
  if (t === 'viento') { return 2 + Math.floor(Math.random() * 3); }    // 2-4 turnos x0.5
  return 0;                                                             // dado: al pisarlo
}

function newRace(rawNames, lastN) {
  const used = new Set(rawNames.filter((s) => s && s.trim()).map((s) => s.trim().toLowerCase()));
  const pool = shuffleArr(HORSE_NAMES.filter((n) => !used.has(n.toLowerCase())));

  const horses = rawNames.map((raw, k) => {
    const name = raw && raw.trim() ? raw.trim() : (pool.shift() || 'Caballo ' + (k + 1));
    const types = shuffleArr(Object.keys(EFFECTS)).slice(0, N_OBS);
    const spots = pickSpots();
    return {
      name, label: cleanText(name), lane: k,
      lo: Math.random(), hi: 1 + Math.random(),
      silk: SILKS[k], sprites: spritesForLane(k),
      pos: 0, prev: 0, vis: 0, raw: 0, tie: 0,
      stun: 0, boost: 0, boostMul: 1,
      done: false, rank: 0, finishTurn: 0, moving: false,
      jumpAt: -1e9, popups: [],
      boxes: spots.map((at, i) => ({ at, type: types[i], val: rollVal(types[i]), hit: false, hitAt: 0 }))
    };
  });
  return { horses, lastN, closeRace, turn: 0, nextRank: 1, events: [], eventAt: 0 };
}

function pushEvent(msg, now) {
  race.events.unshift(cleanText(msg));
  race.events.length = Math.min(race.events.length, 3);
  race.eventAt = now;
}

function popup(h, txt, col, now) {
  h.popups.push({ txt: cleanText(txt), col, at: now });
}

function tickRace(now) {
  race.turn++;
  const finishers = [];
  sfx(100 + Math.random() * 40, 0.03, 'triangle', 0.03);

  let lead = 0;
  for (const h of race.horses) {
    if (!h.done && h.pos > lead) {
      lead = h.pos;
    }
  }

  for (const h of race.horses) {
    h.prev = h.pos;
    if (h.done) {
      continue;
    }
    if (h.stun > 0) {
      h.stun--;
      continue;
    }
    let adv = rnd(h.lo, h.hi);           // paso base: siempre dentro de [lo, hi]
    if (race.closeRace) {
      const gap = lead - h.pos;
      adv *= gap < 0.001 ? LEADER_FACTOR : 1 + Math.min(DRAFT_MAX, gap * DRAFT_PER_STEP);
    }
    if (h.boost > 0) {
      adv *= h.boostMul;
      h.boost--;
      if (h.boost === 0) {
        h.boostMul = 1;
      }
    }
    let np = h.pos + adv;
    for (const b of h.boxes) {
      if (!b.hit && h.pos < b.at && np >= b.at) {
        np = hitBox(h, b, now);
        break;
      }
    }
    h.pos = Math.max(0, np);
    if (h.pos >= META) {
      h.raw = h.pos;
      h.done = true;
      h.finishTurn = race.turn;
      h.tie = Math.random();
      finishers.push(h);
    }
  }

  // Varios en el mismo turno: gana el que más se pasó de la meta
  finishers.sort((a, b) => b.raw - a.raw || a.tie - b.tie);
  for (const h of finishers) {
    h.rank = race.nextRank++;
    if (h.rank === 1) {
      pushEvent(h.name + ' gana la carrera!', now);
      melody([523, 659, 784, 1047], 0.1);
    } else {
      pushEvent(h.name + ' cruza la meta en el puesto ' + h.rank, now);
      sfx(600 + h.rank * 20, 0.1);
    }
  }
}

function hitBox(h, b, now) {
  b.hit = true;
  b.hitAt = now;
  h.jumpAt = now;
  const e = EFFECTS[b.type];
  let p = b.at, good = true, popTxt = '', msg = '';

  if (b.type === 'turbo') {
    h.boost = b.val; h.boostMul = 2;
    popTxt = 'TURBO X2';
    msg = h.name + ' activa TURBO: paso x2 por ' + b.val + ' turnos';
  } else if (b.type === 'estrella') {
    p += b.val;
    popTxt = '+' + b.val;
    msg = h.name + ' agarra una ESTRELLA: +' + b.val + ' pasos';
  } else if (b.type === 'barro') {
    h.stun = b.val; good = false;
    popTxt = 'BARRO';
    msg = h.name + ' cae en el BARRO: pierde ' + b.val + (b.val > 1 ? ' turnos' : ' turno');
  } else if (b.type === 'tropiezo') {
    p -= b.val; good = false;
    popTxt = '-' + b.val;
    msg = h.name + ' se TROPIEZA: -' + b.val + ' pasos';
  } else if (b.type === 'viento') {
    h.boost = b.val; h.boostMul = 0.5; good = false;
    popTxt = 'VIENTO';
    msg = h.name + ' tiene VIENTO en contra: paso x0.5 por ' + b.val + ' turnos';
  } else {
    b.val = Math.floor(Math.random() * 13) - 6;
    p += b.val; good = b.val >= 0;
    popTxt = 'DADO ' + (b.val >= 0 ? '+' : '') + b.val;
    msg = h.name + ' tira el DADO: ' + (b.val >= 0 ? '+' : '') + b.val + ' pasos';
  }

  popup(h, popTxt, e.col, now);
  pushEvent(msg, now);
  if (good) {
    melody([660, 880], 0.07);
  } else {
    melody([300, 200], 0.09);
  }
  return p;
}

function startRace(rawNames, lastN) {
  race = newRace(rawNames, lastN);
  if (!worldCanvas) {
    worldCanvas = buildWorld();
  }
  camX = 0;
  lastTick = 0;
  phase = 'ready';            // espera ESPACIO / ENTER para arrancar
  readyAt = millis();
  hideSetup();
  pushEvent('Revisa las estadisticas y presiona ESPACIO o ENTER', millis());
  sfx(440, 0.15);
}

function beginCountdown() {
  if (phase !== 'ready' || millis() - readyAt < 400) {
    return;
  }
  goAt = millis() + COUNTDOWN_MS;
  phase = 'countdown';
  pushEvent('Los caballos estan en la salida', millis());
  sfx(440, 0.15);
}

function updateRace(now, dt) {
  if (phase === 'countdown') {
    const n = Math.ceil((goAt - now) / (COUNTDOWN_MS / 3));
    if (race.lastBeep !== n && n >= 1) {
      race.lastBeep = n;
      if (n < 3) {
        sfx(440, 0.15);
      }
    }
    if (now >= goAt) {
      phase = 'racing';
      raceStart = now;
      lastTick = now;
      sfx(880, 0.35);
      pushEvent('Arranca la carrera!', now);
    }
  }

  const tickMs = fast ? TICK_FAST_MS : TICK_MS;
  if (phase === 'racing' && now - lastTick >= tickMs) {
    tickRace(now);
    lastTick = now - lastTick > tickMs * 2 ? now : lastTick + tickMs;
    if (race.horses.every((h) => h.done)) {
      phase = 'finishing';
      raceEnd = now;
    }
  }

  const t = phase === 'racing' ? Math.min(1, (now - lastTick) / tickMs) : 1;
  for (const h of race.horses) {
    const lerped = h.prev + (h.pos - h.prev) * t;
    if (h.done) {
      const target = Math.max(lerped, META + 4);
      h.vis = Math.min(target, Math.max(h.vis, lerped) + dt * 0.004);
      h.moving = h.vis < target - 0.01;
    } else {
      h.vis = lerped;
      h.moving = phase === 'racing' && h.stun === 0;
    }
  }

  // cámara: sigue a los que aún corren (la pelea por el último lugar)
  const running = race.horses.filter((h) => !h.done);
  let target;
  if (phase === 'countdown' || phase === 'ready') {
    target = 0;
  } else if (running.length) {
    const xs = running.map((h) => START_X + h.vis * UNIT + laneOff(h.lane));
    target = Math.max(Math.max(...xs) - 280, Math.min(...xs) - 40);
  } else {
    target = FINISH_X + 4 * UNIT - 200;
  }
  target = Math.max(0, Math.min(WORLD_W - W, target));
  camX += (target - camX) * Math.min(1, dt * 0.004);

  if (phase === 'finishing' && now - raceEnd > 1800) {
    phase = 'results';
    resultsAt = now;
    initCelebration();
    melody([392, 523, 659, 784, 659, 784, 1047], 0.13);
    setTimeout(() => melody([311, 294, 277, 247], 0.3), 1300);
  }
}

// =========================================================
//                      DIBUJO DE CARRERA
// =========================================================
function drawBox(b, k, cx, now) {
  const x = START_X + Math.round(b.at * UNIT) + laneOff(k) - 4 - cx;
  if (x < -12 || x > W + 2) {
    return;
  }
  const y = laneTop(k) + 2;
  if (!b.hit) {
    const bob = Math.floor(now / 300 + b.at) % 2 ? 0 : -1;
    R(x + 1, y + 2, 9, 8, PAL.dirtDark);
    R(x, y + bob, 9, 8, PAL.black);
    R(x + 1, y + 1 + bob, 7, 6, PAL.yellow);
    R(x + 1, y + 1 + bob, 7, 1, PAL.bushLight);
    drawText('?', x + 3, y + 2 + bob, PAL.black);
  } else {
    const e = EFFECTS[b.type];
    R(x, y, 9, 8, PAL.black);
    R(x + 1, y + 1, 7, 6, PAL.mud);
    drawText(e.icon, x + Math.round((9 - tw(e.icon)) / 2), y + 2, e.col);
    const age = now - b.hitAt;
    if (age < 350) {
      const g = Math.floor(age / 35);
      ctx.strokeStyle = e.col;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - g + 0.5, y - g + 0.5, 9 + 2 * g - 1, 8 + 2 * g - 1);
    }
  }
}

function drawRace(now) {
  const cx = Math.round(camX);
  ctx.drawImage(worldCanvas, cx, 0, W, H, 0, 0, W, H);

  for (const h of race.horses) {
    for (const b of h.boxes) {
      drawBox(b, h.lane, cx, now);
    }
  }

  for (const h of race.horses) {
    const k = h.lane;
    const top = laneTop(k);
    const base = top + 10;
    const noseX = Math.round(START_X + h.vis * UNIT + laneOff(k) - cx);
    const dj = now - h.jumpAt;
    const jumpY = dj < JUMP_MS ? -Math.round(Math.sin((Math.PI * dj) / JUMP_MS) * 7) : 0;
    let frame = 5;
    if (jumpY < 0) {
      frame = 4;
    } else if (h.moving) {
      frame = Math.floor(now / (fast ? 50 : 85) + k * 1.3) % 4;
    }
    let sx = noseX - SPR_NOSE_X;
    if (h.stun > 0 && phase === 'racing') {
      sx += Math.floor(now / 60) % 2 ? 1 : -1;
    }

    if (noseX < 2) {
      const tag = '<' + h.label.slice(0, 8);
      R(0, top + 2, tw(tag) + 4, 8, h.silk.shirt);
      drawText(tag, 2, top + 3, PAL.black);
      continue;
    }
    if (sx > W) {
      const tag = h.rank ? '#' + h.rank + '>' : '>';
      const w = tw(tag) + 4;
      R(W - w, top + 2, w, 8, h.silk.shirt);
      drawText(tag, W - w + 2, top + 3, PAL.black);
      continue;
    }

    R(sx + 4, base + 1, 16, 1, PAL.dirtDark);

    // efectos activos
    if (h.boost > 0 && h.boostMul > 1 && phase === 'racing') {
      for (let i = 0; i < 3; i++) {
        R(sx - 6 - ((Math.floor(now / 20) + i * 7) % 14), base - 12 + i * 4, 6, 1, EFFECTS.turbo.col);
      }
    }
    if (h.boost > 0 && h.boostMul < 1 && phase === 'racing') {
      for (let i = 0; i < 3; i++) {
        R(noseX + 6 + ((Math.floor(now / 30) + i * 5) % 12), base - 14 + i * 4, 5, 1, EFFECTS.viento.col);
      }
    }
    if (h.stun > 0 && phase === 'racing') {
      R(sx + 5, base - 1, 5, 2, PAL.mud);
      R(sx + 13, base - 1, 6, 2, PAL.mud);
      drawText('Z', sx + 22, top - 8 - (Math.floor(now / 200) % 3), PAL.white, 1, PAL.black);
    }

    ctx.drawImage(h.sprites[frame], sx, base - SPR_BASE_Y + jumpY);
    drawText(h.label, sx - tw(h.label) - 1, top + 4, PAL.white, 1, PAL.black);
    if (phase === 'countdown' || phase === 'ready') {
      const st = h.lo.toFixed(2) + '-' + h.hi.toFixed(2);
      R(noseX + 11, top + 2, tw(st) + 4, 9, PAL.black);
      drawText(st, noseX + 13, top + 4, PAL.yellow);
    }
    if (h.rank) {
      drawText(String(h.rank), noseX + 3, top + 3, PAL.yellow, 1, PAL.black);
    }

    // textos flotantes
    h.popups = h.popups.filter((p) => now - p.at < 1200);
    h.popups.forEach((p, i) => {
      const age = now - p.at;
      const col = Math.floor(age / 100) % 2 ? p.col : PAL.white;
      const stack = (h.popups.length - 1 - i) * 7;
      drawTextC(p.txt, noseX - 10, top - 10 - stack - Math.floor(age / 150), col, 1, PAL.black);
    });
  }

  drawHud(now);
}

function drawHud(now) {
  const horses = race.horses;
  let title = 'PREPARADOS';
  if (phase === 'ready') { title = 'PRESENTACION'; }
  if (phase === 'racing') { title = 'EN CARRERA'; }
  if (phase === 'finishing') { title = 'CARRERA TERMINADA'; }
  if (phase !== 'racing' || Math.floor(now / 500) % 2 === 0) {
    drawText(title, 4, 3, PAL.white, 1, PAL.black);
  }
  drawText('TURNO ' + String(race.turn).padStart(3, '0'), 4, 11, PAL.yellow, 1, PAL.black);
  const done = horses.filter((h) => h.done).length;
  drawText('META ' + done + '/' + horses.length, 72, 11, PAL.white, 1, PAL.black);
  if (fast) {
    drawText('X3', 72, 3, PAL.red, 1, PAL.black);
  }

  const byPos = [...horses].sort((a, b) => (a.rank || 99) - (b.rank || 99) || b.pos - a.pos);
  const lt = 'LIDER ' + byPos[0].label;
  const ut = 'ULTIMO ' + byPos[byPos.length - 1].label;
  if (phase !== 'ready' && phase !== 'countdown') {
    drawText(lt, W - 4 - tw(lt), 3, PAL.white, 1, PAL.black);
    drawText(ut, W - 4 - tw(ut), 11, PAL.red, 1, PAL.black);
  }

  // panel inferior: evento + minimapa
  R(3, 168, W - 6, 30, PAL.black);
  R(3, 168, W - 6, 1, PAL.white);
  R(3, 197, W - 6, 1, PAL.white);
  R(3, 168, 1, 30, PAL.white);
  R(W - 4, 168, 1, 30, PAL.white);
  const ev = race.events[0] || '';
  drawText(ev.slice(0, 76), 7, 171, now - race.eventAt < 600 ? PAL.yellow : PAL.white);

  const mx = 8, mw = W - 16, my = 179;
  for (const h of horses) {
    const y = my + h.lane * 2;
    R(mx, y, mw, 1, '#402000');
    for (const b of h.boxes) {
      if (!b.hit) {
        R(mx + Math.round((b.at / META) * (mw - 4)) + 1, y, 1, 1, PAL.yellow);
      }
    }
    const px = mx + Math.round((Math.min(h.vis, META) / META) * (mw - 4));
    R(px, y, 4, 2, h.silk.shirt);
  }
  R(mx + mw - 1, my, 1, horses.length * 2, PAL.white);

  if (phase === 'ready') {
    drawStatsPanel(now);
  } else if (phase === 'countdown') {
    const n = Math.max(1, Math.ceil((goAt - now) / (COUNTDOWN_MS / 3)));
    drawTextC(String(n), W / 2, 80, PAL.white, 5, PAL.black);
  } else if (phase === 'racing' && now - raceStart < 700) {
    drawTextC('YA!', W / 2, 80, PAL.yellow, 5, PAL.black);
  }
}

// Tabla con las estadísticas con las que nació cada caballo
function drawStatsPanel(now) {
  const hs = race.horses;
  const n = hs.length;
  const x0 = 8, y0 = 30, pw = W - 16, ph = 134;
  ctx.fillStyle = 'rgba(0,0,0,0.95)';
  ctx.fillRect(x0, y0, pw, ph);
  R(x0, y0, pw, 1, PAL.white);
  R(x0, y0 + ph - 1, pw, 1, PAL.white);
  R(x0, y0, 1, ph, PAL.white);
  R(x0 + pw - 1, y0, 1, ph, PAL.white);

  drawTextC('ESTADISTICAS DE NACIMIENTO', W / 2, y0 + 4, PAL.yellow);

  const cName = x0 + 6, cMin = 96, cMax = 118, cAvg = 140, cEst = 164, bx = 190, bw = 116;
  const hy = y0 + 14;
  drawText('CARRIL', cName, hy, PAL.dim);
  drawText('MIN', cMin, hy, PAL.dim);
  drawText('MAX', cMax, hy, PAL.dim);
  drawText('PROM', cAvg, hy, PAL.dim);
  drawText('TURN', cEst, hy, PAL.dim);
  drawText('0', bx - 1, hy, PAL.dim);
  drawText('1', bx + bw / 2 - 1, hy, PAL.dim);
  drawText('2', bx + bw - 3, hy, PAL.dim);

  let fav = hs[0];
  for (const h of hs) {
    if (h.lo + h.hi > fav.lo + fav.hi) {
      fav = h;
    }
  }

  const rowH = Math.min(11, Math.floor(92 / n));
  hs.forEach((h, i) => {
    const y = y0 + 23 + i * rowH;
    const avg = (h.lo + h.hi) / 2;
    R(cName, y + 1, 3, 3, h.silk.shirt);
    drawText(String(h.lane + 1), cName + 5, y, PAL.dim);
    drawText(h.label.slice(0, 12), cName + 11, y, h === fav ? PAL.gold : PAL.white);
    if (h === fav) {
      drawText('*', cName + 11 + tw(h.label.slice(0, 12)) + 3, y, PAL.gold);
    }
    drawText(h.lo.toFixed(2), cMin, y, PAL.white);
    drawText(h.hi.toFixed(2), cMax, y, PAL.white);
    drawText(avg.toFixed(2), cAvg, y, PAL.yellow);
    drawText('~' + Math.round(META / avg), cEst, y, PAL.white);

    // barra: rango del paso entre 0 y 2
    R(bx, y + 2, bw, 1, '#303030');
    R(bx + bw / 2, y, 1, 5, '#303030');
    const a = bx + Math.round((h.lo / 2) * bw);
    const b = bx + Math.round((h.hi / 2) * bw);
    R(a, y + 1, Math.max(1, b - a), 3, h.silk.shirt);
    R(bx + Math.round((avg / 2) * bw), y, 1, 5, PAL.white);
  });

  drawText(race.closeRace ? '* FAVORITO   TURN: ESTIMADO SIN CAJAS NI REBUFO' : '* FAVORITO   TURN: TURNOS ESTIMADOS SIN CONTAR LAS CAJAS', x0 + 6, y0 + ph - 20, PAL.dim);
  if (Math.floor(now / 450) % 2 === 0) {
    drawTextC('ESPACIO / ENTER / CLIC PARA EMPEZAR', W / 2, y0 + ph - 10, PAL.white);
  }
}

function drawAttract(now) {
  if (!attractWorld) {
    attractWorld = buildWorld();
  }
  const scroll = Math.floor(now / 30) % (FINISH_X - START_X);
  ctx.drawImage(attractWorld, scroll, 0, W, H, 0, 0, W, H);
  for (let k = 0; k < laneCount; k++) {
    const bob = Math.round(Math.sin(now / 400 + k) * 10);
    const frame = Math.floor(now / 85 + k * 1.3) % 4;
    ctx.drawImage(spritesForLane(k)[frame], 150 + bob + laneOff(k) - SPR_NOSE_X, laneTop(k) + 10 - SPR_BASE_Y);
  }
  if (Math.floor(now / 500) % 2 === 0) {
    drawText('PRESS START', 4, 3, PAL.white, 1, PAL.black);
  }
}

// =========================================================
//               RESULTADOS: PODIO + FOSA DE BARRO
// =========================================================
const CROWN = ['Y.Y.Y', 'YYYYY', 'YRYRY', 'YYYYY'];

function initCelebration() {
  confetti = [];
  for (let i = 0; i < 60; i++) {
    confetti.push(newConfetti(true));
  }
  rainDrops = [];
  for (let i = 0; i < 40; i++) {
    rainDrops.push({ x: rnd(168, 312), y: rnd(48, 170), v: rnd(1.6, 2.4) });
  }
}

function newConfetti(anyY) {
  const cols = SILKS.map((s) => s.shirt).concat([PAL.white, PAL.gold]);
  return {
    x: rnd(4, 154), y: anyY ? rnd(-150, 0) : rnd(-20, -2),
    vy: rnd(0.4, 0.9), ph: rnd(0, 6.28),
    c: cols[Math.floor(Math.random() * cols.length)]
  };
}

function getPhoto(h) {
  const custom = customPhotos[h.lane];
  const cacheKey = custom ? 'lane' + h.lane + ':' + custom.length : photoKey(h.name);
  const src = custom || HORSE_PHOTOS[photoKey(h.name)];
  if (!src) {
    return null;
  }
  if (!photoCache[cacheKey]) {
    const img = new Image();
    img.onerror = () => { img.failed = true; };
    img.src = src;
    photoCache[cacheKey] = img;
  }
  const img = photoCache[cacheKey];
  return (img.complete && img.naturalWidth > 0 && !img.failed) ? img : null;
}

// Foto recortada en cuadrado; si no hay foto, el caballo del carril
function drawPortrait(h, x, y, s, border) {
  R(x - 1, y - 1, s + 2, s + 2, border || PAL.white);
  const img = getPhoto(h);
  if (img) {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const ox = (img.naturalWidth - side) / 2;
    const oy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, ox, oy, side, side, x, y, s, s);
  } else {
    R(x, y, s, s, shade(h.silk.shirt, 0.35));
    if (s >= SPR_W) {
      ctx.drawImage(h.sprites[5], x + Math.floor((s - SPR_W) / 2), y + Math.floor((s - SPR_H) / 2) + 1);
    } else {
      ctx.drawImage(h.sprites[5], 5, 1, 21, 21, x, y, s, s);
    }
  }
}

// ── Botones dibujados en el canvas ──
// Se usa la posición real del puntero sobre el canvas escalado,
// así funcionan igual en p5 1.x y 2.x.
const ptr = { x: -1, y: -1 };

function pointerToCanvas(e) {
  const r = cnv.elt.getBoundingClientRect();
  ptr.x = (e.clientX - r.left) * W / r.width;
  ptr.y = (e.clientY - r.top) * H / r.height;
}

function setupPointer() {
  cnv.elt.addEventListener('pointermove', pointerToCanvas);
  cnv.elt.addEventListener('pointerleave', () => { ptr.x = -1; ptr.y = -1; });
  cnv.elt.addEventListener('pointerdown', (e) => {
    pointerToCanvas(e);
    if (phase === 'ready') {
      beginCountdown();
      return;
    }
    if (phase !== 'results') {
      return;
    }
    for (const b of uiButtons) {
      if (ptr.x >= b.x && ptr.x < b.x + b.w && ptr.y >= b.y && ptr.y < b.y + b.h) {
        sfx(520, 0.06);
        b.onClick();
        return;
      }
    }
  });
}

function pxButton(label, x, y, onClick) {
  const w = tw(label) + 10, hgt = 13;
  const hover = ptr.x >= x && ptr.x < x + w && ptr.y >= y && ptr.y < y + hgt;
  R(x, y, w, hgt, PAL.white);
  R(x + 1, y + 1, w - 2, hgt - 2, hover ? PAL.yellow : PAL.black);
  drawText(label, x + 5, y + 4, hover ? PAL.black : PAL.white);
  uiButtons.push({ x, y, w, h: hgt, onClick });
}

function drawResults(now) {
  const G = 128;
  const sorted = [...race.horses].sort((a, b) => a.rank - b.rank);
  const n = sorted.length;
  const nl = Math.max(1, Math.min(race.lastN, n - 1));
  const losers = sorted.slice(n - nl).reverse();   // el último primero

  R(0, 0, W, H, PAL.black);
  drawTextC('RESULTADOS', W / 2, 4, PAL.yellow, 2, PAL.black);
  pxButton('REVANCHA', 4, 3, rematch);
  pxButton('CONFIGURAR', W - 4 - (tw('CONFIGURAR') + 10), 3, openConfig);

  // columnas
  R(160, 20, 1, 150, '#303030');
  drawTextC('GANADORES', 80, 22, PAL.gold);
  R(44, 29, 72, 1, PAL.gold);
  drawTextC('PERDEDORES', 240, 22, PAL.red);
  R(200, 29, 80, 1, PAL.red);

  // ─────── GANADORES: podio ───────
  R(0, G, 160, 46, PAL.grass);
  R(0, G, 160, 2, PAL.weedLight);

  const bw = 46;
  const podium = [
    { place: 2, x: 8,   h: 46, col: PAL.silver },
    { place: 1, x: 57,  h: 60, col: PAL.gold },
    { place: 3, x: 106, h: 36, col: PAL.bronze }
  ];
  for (const p of podium) {
    const h = sorted[p.place - 1];
    if (!h) {
      continue;
    }
    const top = G - p.h, cxp = p.x + bw / 2;
    R(p.x - 1, top - 1, bw + 2, p.h + 1, PAL.black);
    R(p.x, top, bw, p.h, p.col);
    R(p.x, top, bw, 2, shade(p.col, 1.35));
    R(p.x, G - 4, bw, 4, shade(p.col, 0.6));
    drawTextC(String(p.place), cxp, top + 7, PAL.black, 3);

    // quien está parado en el podio: su foto o su caballo
    const jump = p.place === 1 ? Math.round(Math.abs(Math.sin(now / 160)) * 4) : 0;
    let headY;
    if (getPhoto(h)) {
      const s = 26;
      drawPortrait(h, cxp - s / 2, top - s - 3 - jump, s, PAL.white);
      headY = top - s - 4 - jump;
    } else {
      const fr = p.place === 1 ? Math.floor(now / 140) % 4 : 5;
      const sy = top - SPR_BASE_Y - 2 - jump;
      ctx.drawImage(h.sprites[fr], cxp - 13, sy);
      headY = sy + 1;
    }
    if (p.place === 1) {
      for (let r = 0; r < CROWN.length; r++) {
        for (let c = 0; c < CROWN[r].length; c++) {
          const ch = CROWN[r][c];
          if (ch !== '.') {
            R(cxp - 2 + c, headY - 5 + r, 1, 1, ch === 'Y' ? PAL.gold : PAL.red);
          }
        }
      }
    }

    R(cxp - 2, G + 4, 4, 1, h.silk.shirt);
    drawTextC(h.label.slice(0, 11), cxp, G + 7, PAL.white);
    drawTextC(h.finishTurn + ' TURNOS', cxp, G + 15, PAL.weed);
  }

  for (const c of confetti) {
    c.y += c.vy;
    c.ph += 0.08;
    R(Math.round(c.x + Math.sin(c.ph) * 4), Math.round(c.y), Math.abs(Math.cos(c.ph)) > 0.5 ? 2 : 1, 2, c.c);
    if (c.y > G - 2) {
      Object.assign(c, newConfetti(false));
    }
  }

  // ─────── PERDEDORES: tarjetas bajo la lluvia ───────
  R(178, 36, 124, 8, PAL.cloud);
  R(190, 31, 40, 6, PAL.cloud);
  R(244, 30, 44, 7, PAL.cloud);
  R(172, 42, 136, 5, shade(PAL.cloud, 0.8));
  for (const d of rainDrops) {
    d.y += d.v;
    if (d.y > 170) {
      d.y = rnd(48, 54);
      d.x = rnd(168, 312);
    }
    R(Math.round(d.x), Math.round(d.y), 1, 3, PAL.rain);
  }

  const cw = 46, gap = 4;
  const total = nl * cw + (nl - 1) * gap;
  const x0 = Math.round(240 - total / 2);
  losers.forEach((h, k) => {
    const x = x0 + k * (cw + gap), y = 58;
    const worst = k === 0;
    R(x - 1, y - 1, cw + 2, 86, worst ? PAL.red : PAL.dim);
    R(x, y, cw, 84, '#101018');

    R(x, y, cw, 10, worst ? PAL.red : '#303030');
    const head = worst ? 'ULTIMO' : 'PUESTO ' + h.rank;
    drawTextC(head, x + cw / 2, y + 3, worst && Math.floor(now / 300) % 2 ? PAL.yellow : PAL.white);

    drawPortrait(h, x + 7, y + 14, 32, worst ? PAL.red : PAL.white);
    const tear = Math.floor(now / 90 + k * 7) % 12;
    R(x + 30, y + 26 + tear, 1, 2, PAL.rain);

    drawTextC(String(h.rank), x + cw / 2, y + 50, worst ? PAL.red : PAL.white, 2);
    drawTextC(h.label.slice(0, 11), x + cw / 2, y + 64, PAL.white);
    drawTextC(h.finishTurn + ' TURNOS', x + cw / 2, y + 73, PAL.dim);
  });

  // ─────── TABLA COMPLETA ───────
  R(0, 176, W, 24, '#101018');
  R(0, 176, W, 1, PAL.white);
  sorted.forEach((h, i) => {
    const x = 5 + (i % 5) * 63;
    const y = 180 + Math.floor(i / 5) * 9;
    let col = PAL.white;
    if (i < 3) { col = PAL.gold; }
    if (i >= n - nl) { col = PAL.red; }
    R(x, y + 1, 3, 3, h.silk.shirt);
    drawText(String(i + 1), x + 5, y, col);
    drawText(h.label.slice(0, 10), x + 11, y, col);
  });
}

function rematch() {
  startRace(race.horses.map((h) => h.name), race.lastN);
}

function openConfig() {
  phase = 'setup';
  showSetup();
}

// =========================================================
//                        ENTRADA
// =========================================================
function keyPressed() {
  if (phase === 'setup') {
    return;
  }
  if (phase === 'ready') {
    if (key === ' ' || key === 'Enter') {
      beginCountdown();
      return false;
    }
  }
  if (key === 'f' || key === 'F') {
    toggleFullscreen();
    return;
  }
  if (phase === 'results') {
    if (key === 'Enter' || key === 'r' || key === 'R') {
      rematch();
    }
    if (key === 'c' || key === 'C') {
      openConfig();
    }
    return;
  }
  if (key === ' ') {
    fast = !fast;
    return false;
  }
  if (key === 'm' || key === 'M') {
    muted = !muted;
  }
}

// =========================================================
//                  SONIDO CHIPTUNE (WebAudio)
// =========================================================
let actx = null;
function sfx(freq, dur, type, vol) {
  if (muted) {
    return;
  }
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const t = actx.currentTime;
    const d = dur || 0.1;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + d);
  } catch (e) {
    // sin audio disponible
  }
}

function melody(notes, stepSec) {
  notes.forEach((f, i) => {
    setTimeout(() => sfx(f, stepSec * 0.9), i * stepSec * 1000);
  });
}

// =========================================================
//              PANTALLA DE CONFIGURACIÓN (DOM)
// =========================================================
const STORE_KEY = 'caballos-8bit-p5';

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (Array.isArray(s.names)) { laneNames = s.names; }
    if (s.count >= 2 && s.count <= MAX_LANES) { laneCount = s.count; }
    if (s.lastN === 3) { lastNPref = 3; }
    if (s.closeRace === false) { closeRace = false; }
  } catch (e) {
    // sin almacenamiento
  }
}

function storeSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ names: laneNames, count: laneCount, lastN: lastNPref, closeRace }));
  } catch (e) {
    // sin almacenamiento
  }
}

const SETUP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
#cb-setup { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.6); padding: 16px; box-sizing: border-box; z-index: 10;
  font-family: "Press Start 2P", ui-monospace, monospace; color: #fcfcfc; }
#cb-setup.hidden { display: none; }
#cb-setup * { box-sizing: border-box; }
#cb-setup .box { background: #000; border: 4px solid #fcfcfc; box-shadow: 0 0 0 4px #000, 0 0 0 8px #0058f8;
  padding: 20px; width: 100%; max-width: 640px; max-height: calc(100vh - 48px); overflow: auto;
  font-size: 10px; line-height: 1.8; }
#cb-setup h1 { font-size: 16px; color: #f8b800; text-align: center; margin: 0 0 12px; font-weight: normal; }
#cb-setup .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
#cb-setup .lanes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 12px 0; }
@media (max-width: 560px) { #cb-setup .lanes { grid-template-columns: 1fr; } }
#cb-setup .lane { display: flex; align-items: center; gap: 8px; }
#cb-setup .lane img { width: 44px; height: 44px; image-rendering: pixelated; flex: none; cursor: pointer;
  border: 2px dashed #7c7c7c; object-fit: cover; background: #202020; }
#cb-setup .lane img.photo { border: 2px solid #f8b800; }
#cb-setup .lane span { color: #7c7c7c; flex: none; width: 24px; }
#cb-setup input[type=text], #cb-setup select { font: inherit; color: #fcfcfc; background: #000;
  border: 2px solid #fcfcfc; padding: 6px 8px; width: 100%; min-width: 0; text-transform: uppercase; border-radius: 0; }
#cb-setup select { width: auto; }
#cb-setup input[type=text]::placeholder { color: #7c7c7c; }
#cb-setup input:focus, #cb-setup select:focus, #cb-setup button:focus-visible { outline: 2px solid #f8b800; outline-offset: 2px; }
#cb-setup label.radio { cursor: pointer; margin-left: 12px; }
#cb-setup input[type=radio] { accent-color: #f83800; }
#cb-setup .btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
#cb-setup button { font: inherit; color: #fcfcfc; background: #000; border: 3px solid #fcfcfc;
  padding: 10px 14px; cursor: pointer; border-radius: 0; }
#cb-setup button:hover { background: #fcfcfc; color: #000; }
#cb-setup button.primary { background: #f83800; }
#cb-setup button.primary:hover { background: #f8b800; color: #000; }
#cb-setup .hint { color: #7c7c7c; text-align: center; margin: 12px 0 0; font-size: 8px; }
#cb-help { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.75); padding: 16px; box-sizing: border-box; z-index: 20;
  font-family: "Press Start 2P", ui-monospace, monospace; color: #fcfcfc; }
#cb-help.hidden { display: none; }
#cb-help * { box-sizing: border-box; }
#cb-help .box { background: #000; border: 4px solid #fcfcfc; box-shadow: 0 0 0 4px #000, 0 0 0 8px #f8b800;
  padding: 20px; width: 100%; max-width: 700px; max-height: calc(100vh - 48px); overflow: auto;
  font-size: 9px; line-height: 1.9; }
#cb-help h2 { font-size: 14px; color: #f8b800; text-align: center; margin: 0 0 14px; font-weight: normal; }
#cb-help h3 { font-size: 10px; color: #3cbcfc; margin: 18px 0 8px; font-weight: normal; }
#cb-help p { margin: 6px 0; }
#cb-help .y { color: #f8b800; } #cb-help .r { color: #f83800; } #cb-help .d { color: #7c7c7c; }
#cb-help .boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin: 8px 0; }
@media (max-width: 560px) { #cb-help .boxes { grid-template-columns: 1fr; } }
#cb-help .bx { display: flex; gap: 10px; align-items: center; border: 2px solid #303030; padding: 8px; }
#cb-help .bx img { width: 45px; height: 40px; image-rendering: pixelated; flex: none; }
#cb-help .bx b { display: block; font-weight: normal; margin-bottom: 4px; }
#cb-help .tag { font-size: 7px; padding: 2px 5px; margin-left: 6px; }
#cb-help .good { background: #00a800; } #cb-help .bad { background: #f83800; } #cb-help .luck { background: #6844fc; }
#cb-help ul { margin: 4px 0; padding-left: 18px; } #cb-help li { margin: 4px 0; }
#cb-help .btns { display: flex; justify-content: center; margin-top: 16px; }
#cb-help button { font: inherit; font-size: 10px; color: #fcfcfc; background: #f83800; border: 3px solid #fcfcfc;
  padding: 10px 14px; cursor: pointer; border-radius: 0; }
#cb-help button:hover { background: #f8b800; color: #000; }
`;

let setupEl = null;

function buildSetupUI() {
  const style = document.createElement('style');
  style.textContent = SETUP_CSS;
  document.head.appendChild(style);

  setupEl = document.createElement('div');
  setupEl.id = 'cb-setup';
  setupEl.innerHTML = `
    <div class="box" role="dialog" aria-labelledby="cb-title">
      <h1 id="cb-title">CABALLOS 8-BIT</h1>
      <div class="row">
        <label for="cb-count">PARTICIPANTES</label>
        <select id="cb-count"></select>
      </div>
      <div id="cb-lanes" class="lanes"></div>
      <div class="row">
        <span>PERDEDORES A MOSTRAR</span>
        <span>
          <label class="radio"><input type="radio" name="cb-lastn" value="2"> 2</label>
          <label class="radio"><input type="radio" name="cb-lastn" value="3"> 3</label>
        </span>
      </div>
      <div class="row">
        <span>CARRERA REÑIDA (REBUFO)</span>
        <span>
          <label class="radio"><input type="radio" name="cb-close" value="1"> SI</label>
          <label class="radio"><input type="radio" name="cb-close" value="0"> NO</label>
        </span>
      </div>
      <div class="btns">
        <button id="cb-helpbtn" type="button">? CÓMO FUNCIONA</button>
        <button id="cb-fs" type="button">&#9974; PANTALLA COMPLETA</button>
        <button id="cb-rand" type="button">NOMBRES AL AZAR</button>
        <button id="cb-start" type="button" class="primary">&#9654; START</button>
      </div>
      <p class="hint">Carril vacío = nombre al azar · Clic en el caballo para ponerle foto<br>
        ESPACIO: velocidad x3 · M: sonido · F: pantalla completa</p>
      <p id="cb-fsmsg" class="hint" style="color:#f83800;display:none"></p>
      <input id="cb-file" type="file" accept="image/*" hidden>
    </div>`;
  document.body.appendChild(setupEl);

  const countSel = document.getElementById('cb-count');
  for (let v = 2; v <= MAX_LANES; v++) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = String(v);
    countSel.appendChild(o);
  }
  countSel.value = String(laneCount);
  countSel.addEventListener('change', () => {
    laneCount = Number(countSel.value);
    renderLanes();
    storeSettings();
  });

  document.querySelectorAll('input[name=cb-lastn]').forEach((r) => {
    r.checked = Number(r.value) === lastNPref;
    r.addEventListener('change', () => {
      lastNPref = Number(r.value);
      storeSettings();
    });
  });

  document.querySelectorAll('input[name=cb-close]').forEach((r) => {
    r.checked = (r.value === '1') === closeRace;
    r.addEventListener('change', () => {
      closeRace = r.value === '1';
      storeSettings();
    });
  });
  document.getElementById('cb-fs').addEventListener('click', toggleFullscreen);
  document.getElementById('cb-helpbtn').addEventListener('click', showHelp);
  buildHelpUI();

  document.getElementById('cb-rand').addEventListener('click', () => {
    laneNames = shuffleArr([...HORSE_NAMES]).slice(0, laneCount);
    renderLanes();
    storeSettings();
  });
  document.getElementById('cb-start').addEventListener('click', beginFromSetup);
  setupEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      beginFromSetup();
    }
  });

  let fileLane = -1;
  const fileInp = document.getElementById('cb-file');
  fileInp.addEventListener('change', () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f || fileLane < 0) {
      return;
    }
    const reader = new FileReader();
    const lane = fileLane;
    reader.onload = () => {
      customPhotos[lane] = reader.result;
      renderLanes();
    };
    reader.readAsDataURL(f);
    fileInp.value = '';
  });
  setupEl.pickPhoto = (k) => {
    fileLane = k;
    fileInp.click();
  };

  renderLanes();
}

// ── Pantalla "Cómo funciona" ──
// Dibuja una caja igual a la del juego y la devuelve como imagen
function boxIconURL(type) {
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const saved = ctx;
  ctx = c.getContext('2d');
  if (type === '?') {
    R(0, 0, 9, 8, PAL.black);
    R(1, 1, 7, 6, PAL.yellow);
    R(1, 1, 7, 1, PAL.bushLight);
    drawText('?', 3, 2, PAL.black);
  } else {
    const e = EFFECTS[type];
    R(0, 0, 9, 8, PAL.black);
    R(1, 1, 7, 6, PAL.mud);
    drawText(e.icon, Math.round((9 - tw(e.icon)) / 2), 2, e.col);
  }
  ctx = saved;
  return c.toDataURL();
}

const HELP_BOXES = [
  { t: 'turbo', kind: 'good', txt: 'Paso <span class="y">x2</span> durante <span class="y">2 a 4</span> turnos.' },
  { t: 'estrella', kind: 'good', txt: 'Avanza de una <span class="y">+3 a +7</span> pasos.' },
  { t: 'barro', kind: 'bad', txt: 'Se queda quieto <span class="r">1 a 3</span> turnos.' },
  { t: 'tropiezo', kind: 'bad', txt: 'Retrocede <span class="r">2 a 6</span> pasos.' },
  { t: 'viento', kind: 'bad', txt: 'Paso <span class="r">x0.5</span> durante <span class="r">2 a 4</span> turnos.' },
  { t: 'dado', kind: 'luck', txt: 'Se tira al pisarlo: de <span class="r">-6</span> a <span class="y">+6</span> pasos.' }
];
const KIND_LABEL = { good: 'BUENA', bad: 'MALA', luck: 'SUERTE' };

let helpEl = null;

function buildHelpUI() {
  helpEl = document.createElement('div');
  helpEl.id = 'cb-help';
  helpEl.className = 'hidden';
  const boxesHtml = HELP_BOXES.map((b) =>
    '<div class="bx"><img alt="" src="' + boxIconURL(b.t) + '"><div><b>' + EFFECTS[b.t].name +
    '<span class="tag ' + b.kind + '">' + KIND_LABEL[b.kind] + '</span></b>' + b.txt + '</div></div>').join('');
  helpEl.innerHTML = `
    <div class="box" role="dialog" aria-labelledby="cb-help-title">
      <h2 id="cb-help-title">CÓMO FUNCIONA</h2>

      <h3>1. LOS CABALLOS</h3>
      <p>Gana el primero en llegar a <span class="y">100 pasos</span>.</p>
      <p>Cada caballo nace con un <span class="y">paso mínimo</span> (0 a 1) y un
        <span class="y">paso máximo</span> (1 a 2). En cada turno avanza un número al azar entre esos dos.
        Antes de arrancar se muestran en la tabla de estadísticas.</p>

      <h3>2. LAS CAJAS SORPRESA</h3>
      <p>Cada caballo tiene <span class="y">4 cajas</span> en su propio carril:</p>
      <ul>
        <li>En posiciones distintas a las de los demás (entre el paso 8 y el 93).</li>
        <li>Con <span class="y">4 tipos diferentes</span> entre sí, sorteados de estos 6.</li>
        <li>Ocultas hasta que las pisa: <img alt="caja ?" src="${boxIconURL('?')}"
          style="width:27px;height:24px;image-rendering:pixelated;vertical-align:middle"> nadie sabe qué tienen.</li>
      </ul>
      <div class="boxes">${boxesHtml}</div>

      <h3>3. REGLAS DE LAS CAJAS</h3>
      <ul>
        <li>Al pisar una caja el caballo <span class="y">salta</span>, se detiene en ella y se revela.</li>
        <li>Solo se activa <span class="y">una caja por turno</span>.</li>
        <li>Si una estrella o el dado lo lanzan más allá de otra caja, <span class="r">esa caja se pierde</span>.</li>
        <li>Turbo y viento <span class="y">no se suman</span>: el último reemplaza al anterior.</li>
        <li>Si retrocede, <span class="y">no vuelve a activar</span> cajas ya usadas.</li>
      </ul>

      <h3>4. CARRERA REÑIDA (REBUFO)</h3>
      <p>Si está activada: los de atrás van <span class="y">+20%</span> por cada paso que estén detrás del líder
        (hasta +150%), y el que va adelante corta el viento y avanza al <span class="r">70%</span>.
        Se puede apagar en la configuración.</p>

      <h3>5. CONTROLES</h3>
      <p><span class="y">ESPACIO / ENTER</span> arrancar después de ver las estadísticas ·
        <span class="y">ESPACIO</span> velocidad x3 · <span class="y">M</span> sonido ·
        <span class="y">F</span> pantalla completa · En resultados: <span class="y">R</span> revancha,
        <span class="y">C</span> configurar.</p>

      <div class="btns"><button id="cb-help-ok" type="button">ENTENDIDO</button></div>
    </div>`;
  document.body.appendChild(helpEl);
  document.getElementById('cb-help-ok').addEventListener('click', hideHelp);
  helpEl.addEventListener('click', (e) => {
    if (e.target === helpEl) {
      hideHelp();
    }
  });
  helpEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.stopPropagation();
      hideHelp();
    }
  });
}

function showHelp() {
  helpEl.classList.remove('hidden');
  document.getElementById('cb-help-ok').focus();
}

function hideHelp() {
  helpEl.classList.add('hidden');
  document.getElementById('cb-helpbtn').focus();
}

function renderLanes() {
  const lanesEl = document.getElementById('cb-lanes');
  lanesEl.innerHTML = '';
  for (let k = 0; k < laneCount; k++) {
    const row = document.createElement('div');
    row.className = 'lane';
    const img = document.createElement('img');
    if (customPhotos[k]) {
      img.src = customPhotos[k];
      img.className = 'photo';
    } else {
      img.src = spritesForLane(k)[5].toDataURL();
    }
    img.alt = 'Foto carril ' + (k + 1);
    img.title = 'Clic para poner una foto';
    img.addEventListener('click', () => setupEl.pickPhoto(k));
    const lbl = document.createElement('span');
    lbl.textContent = 'C' + (k + 1);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 12;
    inp.placeholder = 'AL AZAR';
    inp.value = laneNames[k] || '';
    inp.setAttribute('aria-label', 'Nombre carril ' + (k + 1));
    inp.addEventListener('input', () => {
      laneNames[k] = inp.value;
      storeSettings();
    });
    row.append(img, lbl, inp);
    lanesEl.appendChild(row);
  }
}

// Pantalla completa: el navegador solo la permite tras un clic o tecla,
// por eso se activa al presionar START (o con la tecla F).
function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    return;
  }
  const blocked = () => {
    const m = document.getElementById('cb-fsmsg');
    if (m) {
      m.style.display = 'block';
      m.textContent = 'Este navegador (o la vista previa del editor de p5) no permite pantalla completa. ' +
        'Abre el juego en su propia pestaña: en el editor usa Archivo > Compartir > Pantalla completa, o corre el zip.';
    }
  };
  if (!req || document.fullscreenEnabled === false) {
    blocked();
    return;
  }
  try {
    const p = req.call(el);
    if (p && p.catch) {
      p.catch(blocked);
    }
  } catch (e) {
    blocked();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      exit.call(document);
    }
  } else {
    goFullscreen();
  }
}

function beginFromSetup() {
  goFullscreen();
  storeSettings();
  const names = [];
  for (let k = 0; k < laneCount; k++) {
    names.push(laneNames[k] || '');
  }
  startRace(names, lastNPref);
}

function hideSetup() {
  setupEl.classList.add('hidden');
}

function showSetup() {
  renderLanes();
  setupEl.classList.remove('hidden');
}