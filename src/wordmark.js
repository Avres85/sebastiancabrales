const WORDMARK_TEXT = 'SEBASTIAN';
const CAP_HEIGHT = 1;
const STROKE = 0.15;
const DEFAULT_TRACKING = 0.08;

const KERNING_ADJUSTMENTS = {
  SE: -0.03,
  EB: -0.015,
  BA: -0.02,
  AS: -0.012,
  ST: -0.02,
  TI: -0.028,
  IA: -0.024,
  AN: -0.02,
};

function pt(x, y) {
  return { x, y };
}

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

function rect(x, y, w, h) {
  return [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)];
}

function bar(x, y, w, h, options = {}) {
  const cut = options.cut ?? h;

  let bl = pt(x, y);
  let br = pt(x + w, y);
  let tr = pt(x + w, y + h);
  let tl = pt(x, y + h);

  if (options.leftCut === 'up') {
    tl = pt(x + cut, y + h);
  }
  if (options.leftCut === 'down') {
    bl = pt(x + cut, y);
  }
  if (options.rightCut === 'down') {
    tr = pt(x + w - cut, y + h);
  }
  if (options.rightCut === 'up') {
    br = pt(x + w - cut, y);
  }

  return [bl, br, tr, tl];
}

function strokeSegment(a, b, thickness) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / len) * (thickness * 0.5);
  const ny = (dx / len) * (thickness * 0.5);

  return [
    pt(a.x + nx, a.y + ny),
    pt(b.x + nx, b.y + ny),
    pt(b.x - nx, b.y - ny),
    pt(a.x - nx, a.y - ny),
  ];
}

function translatePolygon(poly, dx, dy) {
  return poly.map((point) => pt(point.x + dx, point.y + dy));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-10) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function isFilled(point, outers, holes) {
  let inOuter = false;
  for (const poly of outers) {
    if (pointInPolygon(point, poly)) {
      inOuter = true;
      break;
    }
  }

  if (!inOuter) {
    return false;
  }

  for (const hole of holes) {
    if (pointInPolygon(point, hole)) {
      return false;
    }
  }

  return true;
}

function collectBounds(polys) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const poly of polys) {
    for (const point of poly) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function createGlyphS() {
  const w = 0.92;
  const t = STROKE;

  const outers = [
    bar(0.0, 1 - t, w, t, { rightCut: 'down' }),
    bar(0.14, 0.0, w * 0.86, t, { leftCut: 'up', rightCut: 'down' }),
    bar(0.22, 0.43, w * 0.58, t, { leftCut: 'up', rightCut: 'down' }),
    strokeSegment(pt(0.84, 1 - t * 0.45), pt(0.22, 0.50 + t * 0.08), t),
    strokeSegment(pt(0.24, 0.42), pt(0.86, 0.11 + t * 0.55), t),
  ];

  const holes = [
    [pt(0.58, 0.64), pt(0.78, 0.64), pt(0.68, 0.54)],
    [pt(0.24, 0.25), pt(0.44, 0.25), pt(0.32, 0.35)],
  ];

  return { width: w, outers, holes };
}

function createGlyphE() {
  const w = 0.86;
  const t = STROKE;

  return {
    width: w,
    outers: [
      rect(0, 0, t, CAP_HEIGHT),
      bar(0, 1 - t, w, t, { rightCut: 'down' }),
      bar(0, 0.5 - t * 0.5, w * 0.72, t, { rightCut: 'down' }),
      bar(0, 0, w, t, { rightCut: 'up' }),
    ],
    holes: [],
  };
}

function createGlyphB() {
  const w = 0.92;
  const t = STROKE;

  return {
    width: w,
    outers: [
      rect(0, 0, t, CAP_HEIGHT),
      bar(0, 1 - t, w * 0.86, t, { rightCut: 'down' }),
      bar(0, 0.5 - t * 0.5, w * 0.78, t, { rightCut: 'down' }),
      bar(0, 0, w, t, { rightCut: 'up' }),
      rect(w * 0.86 - t, 0.55 - t * 0.1, t, 0.45 + t * 0.1),
      rect(w - t, t, t, 0.5 - t),
    ],
    holes: [
      [
        pt(t + 0.08, 0.58),
        pt(w * 0.60, 0.58),
        pt(w * 0.70, 0.69),
        pt(w * 0.61, 1 - t - 0.045),
        pt(t + 0.08, 1 - t - 0.045),
      ],
      [
        pt(t + 0.08, t + 0.055),
        pt(w * 0.63, t + 0.055),
        pt(w * 0.73, 0.24),
        pt(w * 0.64, 0.45),
        pt(t + 0.08, 0.45),
      ],
    ],
  };
}

function createGlyphA() {
  const w = 0.98;
  const t = STROKE;

  return {
    width: w,
    outers: [
      strokeSegment(pt(0.08, 0), pt(w * 0.5, 1), t),
      strokeSegment(pt(w - 0.08, 0), pt(w * 0.5, 1), t),
      bar(0.21, 0.44, w - 0.42, t, { leftCut: 'up', rightCut: 'down' }),
    ],
    holes: [
      [pt(0.34, 0.29), pt(0.46, 0.29), pt(0.42, 0.62)],
      [pt(0.52, 0.29), pt(0.64, 0.29), pt(0.58, 0.62)],
    ],
  };
}

function createGlyphT() {
  const w = 0.9;
  const t = STROKE;

  return {
    width: w,
    outers: [
      bar(0, 1 - t, w, t, { leftCut: 'down', rightCut: 'down' }),
      rect(w * 0.5 - t * 0.5, 0, t, 1 - t),
    ],
    holes: [],
  };
}

function createGlyphI() {
  const w = 0.46;
  const t = STROKE;

  return {
    width: w,
    outers: [
      rect(w * 0.5 - t * 0.5, 0, t, 1),
      bar(0.04, 1 - t, w - 0.08, t, { leftCut: 'down', rightCut: 'down' }),
    ],
    holes: [],
  };
}

function createGlyphN() {
  const w = 0.92;
  const t = STROKE;

  return {
    width: w,
    outers: [
      rect(0, 0, t, 1),
      rect(w - t, 0, t, 1),
      strokeSegment(pt(t * 0.85, t * 0.07), pt(w - t * 0.85, 1 - t * 0.07), t),
    ],
    holes: [],
  };
}

function createGlyph(letter) {
  switch (letter) {
    case 'S':
      return createGlyphS();
    case 'E':
      return createGlyphE();
    case 'B':
      return createGlyphB();
    case 'A':
      return createGlyphA();
    case 'T':
      return createGlyphT();
    case 'I':
      return createGlyphI();
    case 'N':
      return createGlyphN();
    default:
      return null;
  }
}

function layoutWordmark(text = WORDMARK_TEXT, options = {}) {
  const tracking = options.tracking ?? DEFAULT_TRACKING;
  const outers = [];
  const holes = [];
  let cursor = 0;

  const letters = text.split('');
  for (let i = 0; i < letters.length; i += 1) {
    const glyph = createGlyph(letters[i]);
    if (!glyph) {
      continue;
    }

    for (const poly of glyph.outers) {
      outers.push(translatePolygon(poly, cursor, 0));
    }
    for (const hole of glyph.holes) {
      holes.push(translatePolygon(hole, cursor, 0));
    }

    const pair = `${letters[i]}${letters[i + 1] ?? ''}`;
    const kerning = KERNING_ADJUSTMENTS[pair] ?? 0;
    cursor += glyph.width + (i < letters.length - 1 ? tracking + kerning : 0);
  }

  const bounds = collectBounds([...outers, ...holes]);

  return {
    text,
    outers,
    holes,
    bounds,
    width: bounds.width,
    height: bounds.height,
  };
}

function centerGeometry(geometry) {
  const centerX = (geometry.bounds.minX + geometry.bounds.maxX) * 0.5;
  const centerY = (geometry.bounds.minY + geometry.bounds.maxY) * 0.5;

  return {
    ...geometry,
    outers: geometry.outers.map((poly) => translatePolygon(poly, -centerX, -centerY)),
    holes: geometry.holes.map((poly) => translatePolygon(poly, -centerX, -centerY)),
    bounds: {
      minX: geometry.bounds.minX - centerX,
      maxX: geometry.bounds.maxX - centerX,
      minY: geometry.bounds.minY - centerY,
      maxY: geometry.bounds.maxY - centerY,
      width: geometry.bounds.width,
      height: geometry.bounds.height,
    },
  };
}

function sampleGeometryPoints(geometry, options = {}) {
  const sampleStep = options.sampleStep ?? 0.032;
  const minSpacing = options.minSpacing ?? sampleStep * 0.68;
  const minSpacingSq = minSpacing * minSpacing;
  const bucketSize = minSpacing;
  const buckets = new Map();
  const points = [];

  function bucketKey(ix, iy) {
    return `${ix}|${iy}`;
  }

  function canPlace(x, y) {
    const ix = Math.floor(x / bucketSize);
    const iy = Math.floor(y / bucketSize);

    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const bucket = buckets.get(bucketKey(ix + ox, iy + oy));
        if (!bucket) {
          continue;
        }

        for (const point of bucket) {
          const dx = point.x - x;
          const dy = point.y - y;
          if (dx * dx + dy * dy < minSpacingSq) {
            return false;
          }
        }
      }
    }

    return true;
  }

  function pushPoint(x, y) {
    const ix = Math.floor(x / bucketSize);
    const iy = Math.floor(y / bucketSize);
    const key = bucketKey(ix, iy);
    const bucket = buckets.get(key) ?? [];
    bucket.push({ x, y });
    buckets.set(key, bucket);
    points.push({ x, y });
  }

  const { minX, maxX, minY, maxY } = geometry.bounds;

  for (let y = minY + sampleStep * 0.5; y < maxY; y += sampleStep) {
    for (let x = minX + sampleStep * 0.5; x < maxX; x += sampleStep) {
      const point = { x, y };
      if (!isFilled(point, geometry.outers, geometry.holes)) {
        continue;
      }
      if (!canPlace(x, y)) {
        continue;
      }
      pushPoint(x, y);
    }
  }

  return points;
}

function polygonToSvgPath(poly, bounds, pad, svgHeight) {
  if (!poly.length) {
    return '';
  }

  const startX = poly[0].x - bounds.minX + pad;
  const startY = svgHeight - (poly[0].y - bounds.minY + pad);
  let d = `M ${startX.toFixed(4)} ${startY.toFixed(4)}`;

  for (let i = 1; i < poly.length; i += 1) {
    const x = poly[i].x - bounds.minX + pad;
    const y = svgHeight - (poly[i].y - bounds.minY + pad);
    d += ` L ${x.toFixed(4)} ${y.toFixed(4)}`;
  }

  d += ' Z';
  return d;
}

export function createSebastianWordmarkSvg(options = {}) {
  const tracking = options.tracking ?? DEFAULT_TRACKING;
  const pad = options.padding ?? 0.09;
  const geometry = layoutWordmark(WORDMARK_TEXT, { tracking });

  const width = geometry.bounds.width + pad * 2;
  const height = geometry.bounds.height + pad * 2;

  const pathParts = [];
  for (const poly of geometry.outers) {
    pathParts.push(polygonToSvgPath(poly, geometry.bounds, pad, height));
  }
  for (const hole of geometry.holes) {
    pathParts.push(polygonToSvgPath(hole, geometry.bounds, pad, height));
  }

  return {
    d: pathParts.join(' '),
    viewBox: `0 0 ${width.toFixed(4)} ${height.toFixed(4)}`,
    width,
    height,
  };
}

export function createSebastianTargets(options = {}) {
  const {
    targetCount = 900,
    sampleStep = 0.032,
    minSpacing = sampleStep * 0.68,
    tracking = DEFAULT_TRACKING,
    height = 1.3,
    depthJitter = 0.06,
    seed = 7,
  } = options;

  const geometry = centerGeometry(layoutWordmark(WORDMARK_TEXT, { tracking }));
  const sampled = sampleGeometryPoints(geometry, { sampleStep, minSpacing });
  const rng = createRng(seed);

  if (!sampled.length) {
    return new Float32Array(targetCount * 3);
  }

  const out = new Float32Array(targetCount * 3);

  if (sampled.length >= targetCount) {
    const stride = sampled.length / targetCount;
    for (let i = 0; i < targetCount; i += 1) {
      const idx = Math.floor(i * stride);
      const point = sampled[idx];
      const jitter = sampleStep * 0.08;
      out[i * 3] = (point.x + (rng() - 0.5) * jitter) * height;
      out[i * 3 + 1] = (point.y + (rng() - 0.5) * jitter) * height;
      out[i * 3 + 2] = (rng() - 0.5) * depthJitter;
    }
    return out;
  }

  for (let i = 0; i < targetCount; i += 1) {
    const point = sampled[i % sampled.length];
    const jitter = sampleStep * 0.08;
    out[i * 3] = (point.x + (rng() - 0.5) * jitter) * height;
    out[i * 3 + 1] = (point.y + (rng() - 0.5) * jitter) * height;
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

export function getWordmarkMetrics(options = {}) {
  const geometry = layoutWordmark(WORDMARK_TEXT, {
    tracking: options.tracking ?? DEFAULT_TRACKING,
  });

  return {
    width: geometry.width,
    height: geometry.height,
    stroke: STROKE,
    capHeight: CAP_HEIGHT,
  };
}

export const WORDMARK = WORDMARK_TEXT;
