const LETTER_THICKNESS = 0.18;
const WORDMARK_TEXT = 'SEBASTIAN';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createRng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function rectContains(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function pointInTriangle(x, y, tri) {
  const [a, b, c] = tri;
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = x - a.x;
  const v2y = y - a.y;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-8);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lenSq = abx * abx + aby * aby + 1e-8;
  const t = clamp((apx * abx + apy * aby) / lenSq, 0, 1);
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

function glyphInside(letter, x, y) {
  const t = LETTER_THICKNESS;

  if (letter === 'E') {
    const bars = [
      { x: 0, y: 0, w: t, h: 1 },
      { x: 0, y: 1 - t, w: 1, h: t },
      { x: 0, y: 0.5 - t * 0.5, w: 0.78, h: t },
      { x: 0, y: 0, w: 1, h: t },
    ];
    return bars.some((bar) => rectContains(x, y, bar));
  }

  if (letter === 'S') {
    const bars = [
      { x: 0, y: 1 - t, w: 1, h: t },
      { x: 0, y: 0.5 - t * 0.5, w: 1, h: t },
      { x: 0, y: 0, w: 1, h: t },
      { x: 0, y: 0.5, w: t, h: 0.5 - t },
      { x: 1 - t, y: t, w: t, h: 0.5 - t },
    ];
    const cuts = [
      [
        { x: 0.62, y: 0.63 },
        { x: 1, y: 0.63 },
        { x: 1, y: 1 - t },
      ],
      [
        { x: 0, y: t },
        { x: 0.38, y: t },
        { x: 0, y: 0.37 },
      ],
    ];
    const base = bars.some((bar) => rectContains(x, y, bar));
    const cut = cuts.some((tri) => pointInTriangle(x, y, tri));
    return base && !cut;
  }

  if (letter === 'B') {
    const bars = [
      { x: 0, y: 0, w: t, h: 1 },
      { x: 0, y: 1 - t, w: 0.84, h: t },
      { x: 0, y: 0.5 - t * 0.5, w: 0.84, h: t },
      { x: 0, y: 0, w: 0.84, h: t },
      { x: 1 - t, y: 0.5, w: t, h: 0.5 - t },
      { x: 1 - t, y: t, w: t, h: 0.5 - t },
    ];
    const notch = [
      { x: 0.58, y: 0.56 },
      { x: 0.78, y: 0.5 },
      { x: 0.58, y: 0.44 },
    ];
    const base = bars.some((bar) => rectContains(x, y, bar));
    return base && !pointInTriangle(x, y, notch);
  }

  if (letter === 'A') {
    const bars = [
      { x: 0, y: 0, w: t, h: 1 },
      { x: 1 - t, y: 0, w: t, h: 1 },
      { x: 0, y: 1 - t, w: 1, h: t },
      { x: 0, y: 0.5 - t * 0.5, w: 1, h: t },
    ];
    const splitLeft = [
      { x: 0.22, y: 0.24 },
      { x: 0.45, y: 0.24 },
      { x: 0.34, y: 0.62 },
    ];
    const splitRight = [
      { x: 0.55, y: 0.24 },
      { x: 0.78, y: 0.24 },
      { x: 0.66, y: 0.62 },
    ];
    const base = bars.some((bar) => rectContains(x, y, bar));
    return base && !pointInTriangle(x, y, splitLeft) && !pointInTriangle(x, y, splitRight);
  }

  if (letter === 'T') {
    const bars = [
      { x: 0, y: 1 - t, w: 1, h: t },
      { x: 0.5 - t * 0.5, y: 0, w: t, h: 1 },
    ];
    return bars.some((bar) => rectContains(x, y, bar));
  }

  if (letter === 'I') {
    const bars = [
      { x: 0, y: 1 - t, w: 1, h: t },
      { x: 0.5 - t * 0.5, y: 0, w: t, h: 1 },
      { x: 0, y: 0, w: 1, h: t },
    ];
    return bars.some((bar) => rectContains(x, y, bar));
  }

  if (letter === 'N') {
    const inStems = x <= t || x >= 1 - t;
    const inDiagonal = distanceToSegment(x, y, t * 0.8, t, 1 - t * 0.8, 1 - t) <= t * 0.62;
    return inStems || inDiagonal;
  }

  return false;
}

function sampleGlyph(letter, step, widthScale = 1.15) {
  const points = [];
  for (let y = step * 0.5; y < 1; y += step) {
    for (let x = step * 0.5; x < 1; x += step) {
      if (!glyphInside(letter, x, y)) {
        continue;
      }
      points.push({ x: x * widthScale, y });
    }
  }
  return points;
}

function buildDenseWordmarkPoints(step = 0.035, letterSpacing = 0.26, widthScale = 1.15) {
  const all = [];
  let cursor = 0;

  for (const letter of WORDMARK_TEXT) {
    const glyphPoints = sampleGlyph(letter, step, widthScale);
    for (const point of glyphPoints) {
      all.push({ x: point.x + cursor, y: point.y });
    }
    cursor += widthScale + letterSpacing;
  }

  if (all.length === 0) {
    return all;
  }

  const bounds = all.reduce(
    (acc, point) => {
      acc.minX = Math.min(acc.minX, point.x);
      acc.maxX = Math.max(acc.maxX, point.x);
      acc.minY = Math.min(acc.minY, point.y);
      acc.maxY = Math.max(acc.maxY, point.y);
      return acc;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;

  return all.map((point) => ({ x: point.x - centerX, y: point.y - centerY }));
}

export function createSebastianTargets(options = {}) {
  const {
    targetCount = 900,
    sampleStep = 0.032,
    letterSpacing = 0.26,
    widthScale = 1.15,
    height = 3.4,
    depthJitter = 0.06,
    seed = 7,
  } = options;

  const dense = buildDenseWordmarkPoints(sampleStep, letterSpacing, widthScale);
  const rng = createRng(seed);

  if (dense.length === 0) {
    return new Float32Array(targetCount * 3);
  }

  const out = new Float32Array(targetCount * 3);
  const stride = dense.length / targetCount;
  const scale = height;

  for (let i = 0; i < targetCount; i += 1) {
    const idx = Math.floor(i * stride) % dense.length;
    const point = dense[idx];
    const jx = (rng() - 0.5) * 0.008;
    const jy = (rng() - 0.5) * 0.008;
    out[i * 3] = (point.x + jx) * scale;
    out[i * 3 + 1] = (point.y + jy) * scale;
    out[i * 3 + 2] = (rng() - 0.5) * depthJitter;
  }

  return out;
}

export function createBaseSwarmPositions(count, seed = 11) {
  const out = new Float32Array(count * 3);
  const rng = createRng(seed);

  for (let i = 0; i < count; i += 1) {
    const radius = 7.5 + rng() * 8.5;
    const theta = rng() * Math.PI * 2;
    const y = (rng() - 0.5) * 6.8;
    const x = Math.cos(theta) * radius + (rng() - 0.5) * 1.1;
    const z = Math.sin(theta) * radius + (rng() - 0.5) * 1.1;

    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }

  return out;
}

export function createSeeds(count, seed = 17) {
  const out = new Float32Array(count);
  const rng = createRng(seed);
  for (let i = 0; i < count; i += 1) {
    out[i] = rng() * 1000;
  }
  return out;
}

export const WORDMARK = WORDMARK_TEXT;
