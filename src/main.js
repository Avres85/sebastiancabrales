import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import {
  WORDMARK,
  createBaseSwarmPositions,
  createSeeds,
  createSebastianTargets,
  createSebastianWordmarkSvg,
} from './wordmark.js';
import { traceWordmarkFromPng } from './wordmark-trace.js';

const BASE_MAX_CUBES = 4400;
const CHROME_EXTRA_CUBES = 200;
const CANVAS_CUBES = 1600;
const ACTIVE_SCROLL_VH = 160;
const HOLD_SCROLL_VH = 20;
const INTRO_HEIGHT_VH = 260;
const LOCK_COUNT_FREEZE_PROGRESS = 0.72;
const CONTENT_REVEAL_RAW_PROGRESS = 0.999;
const DEBUG_TARGETS = false;
const CAROUSEL_PIXELS_PER_SECOND = 12.5;
const MIN_CAROUSEL_DURATION_SECONDS = 18;
const BASE_MIN_INTERIOR_COUNT = 3100;
const BASE_MIN_EDGE_COUNT = 1300;
const CHROME_EXTRA_EDGE_COUNT = 200;

const QUALITY_TIERS = {
  low: {
    name: 'low',
    count: BASE_MAX_CUBES,
    dpr: 2.0,
    drift: 0.72,
    noise: 0.3,
    sweep: 1.0,
  },
  medium: {
    name: 'medium',
    count: BASE_MAX_CUBES,
    dpr: 2.0,
    drift: 0.72,
    noise: 0.3,
    sweep: 1.0,
  },
  high: {
    name: 'high',
    count: BASE_MAX_CUBES,
    dpr: 2.0,
    drift: 0.72,
    noise: 0.3,
    sweep: 1.0,
  },
};

const TIER_ORDER = ['low', 'medium', 'high'];

function isChromeClient() {
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';
  const isGoogleChrome = /Chrome|CriOS/.test(ua) && /Google Inc/i.test(vendor);
  const isExcludedChromium = /Edg|OPR|Brave|SamsungBrowser/.test(ua);
  return isGoogleChrome && !isExcludedChromium;
}

const elements = {
  intro: document.getElementById('intro'),
  glCanvas: document.getElementById('gl-canvas'),
  fallbackCanvas: document.getElementById('fallback-canvas'),
  staticFallback: document.getElementById('static-fallback'),
  posterWordmarkSvg: document.getElementById('poster-wordmark-svg'),
  staticWordmarkSvg: document.getElementById('static-wordmark-svg'),
};

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const app = {
  renderMode: 'poster',
  rendererType: null,
  prefersReducedMotion: reducedMotionQuery.matches,
  reducedProgress: 0,
  reducedTarget: 0,
  reducedFrom: 0,
  reducedTransitionStart: 0,
  reducedTransitionDurationMs: 200,
  activeRangePx: window.innerHeight * (ACTIVE_SCROLL_VH / 100),
  holdRangePx: window.innerHeight * (HOLD_SCROLL_VH / 100),
  progress: 0,
  rawProgress: 0,
  actualRawProgress: 0,
  lastRawProgress: 0,
  lockHoldUntil: 0,
  tierName: 'high',
  activeTierCountName: null,
  pendingTierCountName: null,
  fpsLowStart: 0,
  fpsHighStart: 0,
  tierCooldownUntil: 0,
  fpsEma: 60,
  benchStart: 0,
  benchFrames: 0,
  benchChecked: false,
  pointerX: 0,
  pointerY: 0,
  pointerXTarget: 0,
  pointerYTarget: 0,
  paused: false,
  stopLoop: false,
  lastFrameTime: 0,
  carouselTrack: null,
  carouselResizeRafId: 0,
  carouselReady: false,
  carouselBuildInProgress: false,
  carouselRebuildQueued: false,
  carouselBuildSeq: 0,
  carouselLastGoodLoopWidth: 0,
  carouselLastGoodDurationSeconds: 0,
  forceMaxProfile: isChromeClient(),
  maxCubes: BASE_MAX_CUBES,
  minInteriorCount: BASE_MIN_INTERIOR_COUNT,
  minEdgeCount: BASE_MIN_EDGE_COUNT,
  // WebGL runtime
  renderer: null,
  scene: null,
  camera: null,
  mesh: null,
  material: null,
  uniforms: null,
  tierAttributeSets: null,
  // Canvas fallback runtime
  canvasCtx: null,
  canvasWidth: 0,
  canvasHeight: 0,
  canvasBase: null,
  canvasTarget: null,
  canvasTargetScale: null,
  canvasSeed: null,
  // Wordmark source data
  wordmarkSvgData: null,
  wordmarkTargetsHigh: null,
  wordmarkTargetScaleHigh: null,
  wordmarkTargetsCanvas: null,
  wordmarkTargetScaleCanvas: null,
  staticWordmarkInjected: false,
};

const VERTEX_SHADER = `
attribute vec3 aBase;
attribute vec3 aTarget;
attribute float aSeed;
attribute float aScale;

uniform float uTime;
uniform float uProgress;
uniform float uDrift;
uniform float uNoise;
uniform float uSweep;
uniform float uReduced;
uniform vec2 uPointer;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vLock;

float sstep(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec3 hash3(float n) {
  return vec3(hash(n + 0.12), hash(n + 4.73), hash(n + 15.91));
}

mat3 rotX(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 rotY(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 rotZ(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float build = sstep(0.20, 0.45, p);
  float converge = sstep(0.45, 0.80, p);
  float lock = sstep(0.80, 1.00, p);
  float lockEarly = sstep(0.62, 0.90, p);
  float lockTighten = sstep(0.72, 1.00, p);
  float reduced = step(0.5, uReduced);

  vec3 rand = hash3(aSeed);
  float tt = uTime * 0.36 + aSeed * 0.018;

  float driftAmp = uDrift * mix(1.0, 0.08, lock) * (1.0 - reduced);
  float noiseAmp = uNoise * (1.0 - reduced);

  vec3 drift = vec3(
    sin(tt + rand.x * 6.2831) * 0.82 + sin(tt * 0.72 + rand.y * 7.11) * 0.45,
    cos(tt * 0.88 + rand.y * 6.2831) * 0.68 + sin(tt * 0.54 + rand.z * 8.45) * 0.33,
    sin(tt * 1.08 + rand.z * 6.2831) * 0.86 + cos(tt * 0.61 + rand.x * 9.34) * 0.44
  ) * driftAmp;

  vec3 swirl = vec3(
    sin((aBase.y + tt) * 0.55),
    cos((aBase.z + tt) * 0.49),
    sin((aBase.x - tt) * 0.57)
  ) * noiseAmp;

  vec3 directionalBias = normalize(aTarget + vec3(0.0001));
  vec3 guided = aBase + drift + swirl + directionalBias * (build * 1.95);

  vec3 dir = normalize(aTarget - aBase + vec3(0.0001));
  float overshootFade = 1.0 - lockEarly;
  float wobble = sin((uTime * 3.1 + aSeed) * 0.72) * overshootFade;
  vec3 overshoot = dir * wobble * (0.18 + rand.z * 0.1);

  vec3 assembled = aTarget + overshoot;
  vec3 finalPos = mix(guided, assembled, converge);
  finalPos = mix(finalPos, aTarget, lockEarly);
  finalPos = mix(finalPos, aTarget, lock);

  float pointerFade = 1.0 - lockEarly;
  finalPos.x += uPointer.x * pointerFade * 0.22;
  finalPos.y += uPointer.y * pointerFade * 0.12;

  float spin = (uTime * 0.23 + aSeed * 0.014) * (1.0 - lock * 0.82) * (1.0 - reduced);
  mat3 rot = rotY(spin) * rotX(spin * 0.58 + rand.x) * rotZ(spin * 0.39 + rand.y);

  float convergenceScale = mix(1.0, 0.42, lockTighten);
  vec3 local = position * (0.15 * aScale * convergenceScale);
  vec3 transformed = rot * local + finalPos;

  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * rot * normal);
  vLock = lock;

  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform float uProgress;
uniform float uSweep;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying float vLock;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(cameraPosition - vWorldPos);

  float facing = max(dot(n, v), 0.0);
  float fresnel = pow(1.0 - facing, 2.45);
  vec3 reflected = reflect(-v, n);

  float specHard = pow(max(dot(reflected, normalize(vec3(0.24, 0.75, 0.6))), 0.0), 34.0);
  float specSoft = pow(max(dot(reflected, normalize(vec3(-0.5, 0.36, 0.9))), 0.0), 10.0);

  vec3 steel0 = vec3(0.095, 0.112, 0.138);
  vec3 steel1 = vec3(0.33, 0.37, 0.43);
  vec3 steel2 = vec3(0.86, 0.9, 0.95);
  vec3 steelCool = vec3(0.58, 0.69, 0.8);

  float verticalGrad = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 chrome = mix(steel0, steel1, verticalGrad);
  float brushed = sin(vWorldPos.y * 48.0 + vWorldPos.x * 9.0 + uTime * 0.2) * 0.5 + 0.5;
  float brushedMask = brushed * 0.065;
  chrome += vec3(brushedMask);
  chrome = mix(chrome, steelCool, fresnel * 0.22);
  chrome = mix(chrome, steel2, specSoft * 0.88 + specHard * 0.6);

  float lock = smoothstep(0.80, 1.0, uProgress);
  float preFlash = smoothstep(0.74, 0.90, uProgress) * (1.0 - smoothstep(0.90, 0.99, uProgress));
  float sweepPos = mix(-28.0, 28.0, smoothstep(0.80, 1.0, uProgress));
  float sweepBand = exp(-pow((vWorldPos.x - sweepPos) * 0.52, 2.0));
  float sweep = sweepBand * lock * uSweep;

  float lockAura = lock * (0.18 + fresnel * 0.62);
  float flashBand = exp(-pow((vWorldPos.x - sweepPos * 0.72) * 0.33, 2.0));
  float flash = preFlash * flashBand * (0.75 + fresnel * 0.45) * uSweep;
  float polish = mix(0.0, 0.22, lock);
  vec3 cyan = vec3(0.15, 0.68, 0.9) * (fresnel * 0.38 + sweep * 1.15 + lockAura + flash * 1.45);
  vec3 color = chrome + cyan + vec3(specHard * (0.34 + polish) + sweep * 0.54 + lock * 0.14 + fresnel * 0.08);

  gl_FragColor = vec4(color, 0.98);
}
`;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createDistributedIndices(totalCount, pickCount) {
  if (pickCount >= totalCount) {
    const indices = new Uint32Array(totalCount);
    for (let i = 0; i < totalCount; i += 1) {
      indices[i] = i;
    }
    return indices;
  }

  const indices = new Uint32Array(pickCount);
  const stride = totalCount / pickCount;

  for (let i = 0; i < pickCount; i += 1) {
    indices[i] = Math.floor(i * stride);
  }

  return indices;
}

function subsetFloat32Vector3(source, indices) {
  const out = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i += 1) {
    const src = indices[i] * 3;
    const dst = i * 3;
    out[dst] = source[src];
    out[dst + 1] = source[src + 1];
    out[dst + 2] = source[src + 2];
  }
  return out;
}

function subsetFloat32Scalar(source, indices) {
  const out = new Float32Array(indices.length);
  for (let i = 0; i < indices.length; i += 1) {
    out[i] = source[indices[i]];
  }
  return out;
}

function createTierAttributeSets(basePositions, targetPositions, seeds, scales, totalCount) {
  const sets = {};
  const names = Object.keys(QUALITY_TIERS);

  for (const name of names) {
    const count = QUALITY_TIERS[name].count;
    const indices = createDistributedIndices(totalCount, count);
    const aBase = subsetFloat32Vector3(basePositions, indices);
    const aTarget = subsetFloat32Vector3(targetPositions, indices);
    const aSeed = subsetFloat32Scalar(seeds, indices);
    const aScale = subsetFloat32Scalar(scales, indices);

    sets[name] = {
      count,
      attributes: {
        aBase: new THREE.InstancedBufferAttribute(aBase, 3),
        aTarget: new THREE.InstancedBufferAttribute(aTarget, 3),
        aSeed: new THREE.InstancedBufferAttribute(aSeed, 1),
        aScale: new THREE.InstancedBufferAttribute(aScale, 1),
      },
    };
  }

  return sets;
}

function isMobileProfile() {
  return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
}

function vhToPx(vh) {
  return window.innerHeight * (vh / 100);
}

function setRenderMode(mode) {
  app.renderMode = mode;
  document.body.dataset.renderMode = mode;
}

function getTier() {
  return QUALITY_TIERS[app.tierName];
}

function setTier(name) {
  if (!QUALITY_TIERS[name] || app.tierName === name) {
    return;
  }
  app.tierName = name;
  applyTierToRenderer();
}

function shouldFreezeTierCountSwitch() {
  return app.progress >= LOCK_COUNT_FREEZE_PROGRESS && app.actualRawProgress < CONTENT_REVEAL_RAW_PROGRESS;
}

function updateContentRevealState() {
  const introComplete = app.actualRawProgress >= CONTENT_REVEAL_RAW_PROGRESS;
  document.body.classList.toggle('intro-complete', introComplete);
}

function demoteTier() {
  const idx = TIER_ORDER.indexOf(app.tierName);
  if (idx > 0) {
    setTier(TIER_ORDER[idx - 1]);
  }
}

function promoteTier() {
  const idx = TIER_ORDER.indexOf(app.tierName);
  if (idx < TIER_ORDER.length - 1) {
    setTier(TIER_ORDER[idx + 1]);
  }
}

function computeRawProgress() {
  const rect = elements.intro.getBoundingClientRect();
  const traveled = clamp(-rect.top, 0, app.activeRangePx);
  return traveled / app.activeRangePx;
}

function updateRanges() {
  app.activeRangePx = vhToPx(ACTIVE_SCROLL_VH);
  app.holdRangePx = vhToPx(HOLD_SCROLL_VH);
  document.body.style.setProperty('--intro-height', `${INTRO_HEIGHT_VH}vh`);
  document.body.style.setProperty('--active-scroll', `${ACTIVE_SCROLL_VH}vh`);
  document.body.style.setProperty('--hold-scroll', `${HOLD_SCROLL_VH}vh`);
}

function updateIntroLightProgress() {
  const fadeProgress = smoothstep(0.8, 1, app.progress);
  document.documentElement.style.setProperty('--intro-light-progress', fadeProgress.toFixed(4));
}

function debugLogTargetBand(label, targets) {
  if (!DEBUG_TARGETS || !targets || targets.length < 3) {
    return;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < targets.length; i += 3) {
    const y = targets[i];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const span = Math.max(1e-6, maxY - minY);
  const bottomBandMax = minY + span * 0.05;
  let bottomBandCount = 0;
  for (let i = 1; i < targets.length; i += 3) {
    if (targets[i] <= bottomBandMax) {
      bottomBandCount += 1;
    }
  }

  console.info(
    `[targets:${label}] minY=${minY.toFixed(4)} maxY=${maxY.toFixed(4)} bottom5pct=${bottomBandCount}/${Math.floor(targets.length / 3)}`
  );
}

function getCarouselOriginalItems(track) {
  return Array.from(track.querySelectorAll(':scope > .figure-item:not([data-carousel-clone="true"])'));
}

function clearCarouselClones(track) {
  const clones = track.querySelectorAll(':scope > .figure-item[data-carousel-clone="true"]');
  for (const clone of clones) {
    clone.remove();
  }
}

function createCarouselClone(item) {
  const clone = item.cloneNode(true);
  clone.setAttribute('data-carousel-clone', 'true');
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('tabindex', '-1');

  const images = clone.querySelectorAll('img');
  for (const image of images) {
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
  }

  return clone;
}

function restartCarouselAnimation(track) {
  track.style.animation = 'none';
  void track.offsetWidth;
  track.style.animation = '';
}

function applyCarouselLoopMetrics(track, loopWidth) {
  const durationSeconds = Math.max(MIN_CAROUSEL_DURATION_SECONDS, loopWidth / CAROUSEL_PIXELS_PER_SECOND);
  track.style.setProperty('--carousel-loop-width', `${loopWidth.toFixed(3)}px`);
  track.style.setProperty('--carousel-duration', `${durationSeconds.toFixed(3)}s`);
  app.carouselLastGoodLoopWidth = loopWidth;
  app.carouselLastGoodDurationSeconds = durationSeconds;
}

function restoreLastGoodCarouselMetrics(track) {
  if (app.carouselLastGoodLoopWidth <= 0 || app.carouselLastGoodDurationSeconds <= 0) {
    return false;
  }
  track.style.setProperty('--carousel-loop-width', `${app.carouselLastGoodLoopWidth.toFixed(3)}px`);
  track.style.setProperty('--carousel-duration', `${app.carouselLastGoodDurationSeconds.toFixed(3)}s`);
  return true;
}

function ensureImageReady(image) {
  if (image.complete) {
    if (typeof image.decode === 'function') {
      return image.decode().catch(() => {});
    }
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      if (typeof image.decode === 'function') {
        image.decode().catch(() => {}).finally(resolve);
        return;
      }
      resolve();
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
  });
}

function rebuildCollectionCarousel() {
  const track = app.carouselTrack;
  if (!track) {
    return false;
  }

  const originals = getCarouselOriginalItems(track);
  if (originals.length < 2) {
    track.style.animation = 'none';
    return false;
  }

  const previousClones = Array.from(track.querySelectorAll(':scope > .figure-item[data-carousel-clone="true"]'));
  const buildId = String(++app.carouselBuildSeq);
  const fragment = document.createDocumentFragment();
  for (const item of originals) {
    const clone = createCarouselClone(item);
    clone.setAttribute('data-carousel-build', buildId);
    fragment.appendChild(clone);
  }
  track.appendChild(fragment);

  const firstOriginal = originals[0];
  const firstClone = track.querySelector(
    `:scope > .figure-item[data-carousel-clone="true"][data-carousel-build="${buildId}"]`
  );
  if (!firstOriginal || !firstClone) {
    const newClones = track.querySelectorAll(`:scope > .figure-item[data-carousel-build="${buildId}"]`);
    for (const clone of newClones) {
      clone.remove();
    }
    restoreLastGoodCarouselMetrics(track);
    return false;
  }

  const loopWidth = firstClone.offsetLeft - firstOriginal.offsetLeft;
  if (!Number.isFinite(loopWidth) || loopWidth <= 0) {
    const newClones = track.querySelectorAll(`:scope > .figure-item[data-carousel-build="${buildId}"]`);
    for (const clone of newClones) {
      clone.remove();
    }
    restoreLastGoodCarouselMetrics(track);
    return false;
  }

  for (const clone of previousClones) {
    clone.remove();
  }
  const committedClones = track.querySelectorAll(`:scope > .figure-item[data-carousel-build="${buildId}"]`);
  for (const clone of committedClones) {
    clone.removeAttribute('data-carousel-build');
  }

  applyCarouselLoopMetrics(track, loopWidth);

  if (app.prefersReducedMotion) {
    track.style.animation = 'none';
    return true;
  }

  restartCarouselAnimation(track);
  return true;
}

function scheduleCarouselRebuild() {
  if (!app.carouselTrack || !app.carouselReady) {
    return;
  }

  if (app.carouselBuildInProgress) {
    app.carouselRebuildQueued = true;
    return;
  }

  if (app.carouselResizeRafId) {
    cancelAnimationFrame(app.carouselResizeRafId);
  }

  app.carouselResizeRafId = requestAnimationFrame(() => {
    app.carouselResizeRafId = 0;
    app.carouselBuildInProgress = true;
    try {
      rebuildCollectionCarousel();
    } finally {
      app.carouselBuildInProgress = false;
      if (app.carouselRebuildQueued) {
        app.carouselRebuildQueued = false;
        scheduleCarouselRebuild();
      }
    }
  });
}

function setupCollectionCarousel() {
  const track = document.querySelector('.carousel-shell .carousel-track');
  app.carouselTrack = track;
  if (!track) {
    return;
  }

  track.style.animation = 'none';

  const originalImages = Array.from(track.querySelectorAll(':scope > .figure-item img'));
  for (const image of originalImages) {
    image.loading = 'eager';
    image.decoding = 'async';
  }

  void Promise.all(originalImages.map((image) => ensureImageReady(image))).then(() => {
    app.carouselReady = true;
    scheduleCarouselRebuild();
  });
}

function updateProgress(nowMs) {
  const raw = computeRawProgress();
  const downwards = raw >= app.lastRawProgress;
  app.actualRawProgress = raw;

  if (raw >= 0.999 && app.lastRawProgress < 0.999 && downwards) {
    app.lockHoldUntil = nowMs + 300;
  }

  let heldRaw = raw;
  if (downwards && raw >= 0.95 && nowMs < app.lockHoldUntil) {
    heldRaw = 1;
  }

  app.rawProgress = heldRaw;
  app.lastRawProgress = raw;

  if (app.prefersReducedMotion) {
    const nextTarget = heldRaw >= 0.6 ? 1 : 0;

    if (nextTarget !== app.reducedTarget) {
      app.reducedTarget = nextTarget;
      app.reducedFrom = app.reducedProgress;
      app.reducedTransitionStart = nowMs;
    }

    const elapsed = nowMs - app.reducedTransitionStart;
    const t = clamp(elapsed / app.reducedTransitionDurationMs, 0, 1);
    const eased = smoothstep(0, 1, t);
    app.reducedProgress = lerp(app.reducedFrom, app.reducedTarget, eased);
    app.progress = app.reducedProgress;
    updateIntroLightProgress();
    updateContentRevealState();
    flushPendingTierCountChange();
    return;
  }

  app.progress = smoothstep(0, 1, heldRaw);
  updateIntroLightProgress();
  updateContentRevealState();
  flushPendingTierCountChange();
}

function buildInstancedMesh() {
  const maxCubes = app.maxCubes;
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = baseGeometry.index;
  geometry.attributes.position = baseGeometry.attributes.position;
  geometry.attributes.normal = baseGeometry.attributes.normal;

  const basePositions = createBaseSwarmPositions(maxCubes, 101);
  const targetPositions =
    app.wordmarkTargetsHigh && app.wordmarkTargetsHigh.length === maxCubes * 3
      ? app.wordmarkTargetsHigh
      : createSebastianTargets({
          targetCount: maxCubes,
          sampleStep: 0.032,
          minSpacing: 0.018,
          tracking: 0.08,
          height: 1.3,
          depthJitter: 0.03,
          seed: 73,
        });
  const seeds = createSeeds(maxCubes, 31);
  const scales = createSeeds(maxCubes, 49);
  const targetPointScales =
    app.wordmarkTargetScaleHigh && app.wordmarkTargetScaleHigh.length === maxCubes
      ? app.wordmarkTargetScaleHigh
      : null;

  for (let i = 0; i < maxCubes; i += 1) {
    // createSeeds() returns [0..1000), normalize before using as size variance
    const baseScale = 0.78 + (scales[i] / 1000) * 0.7;
    scales[i] = baseScale * (targetPointScales ? targetPointScales[i] : 1.0);
  }

  app.tierAttributeSets = createTierAttributeSets(basePositions, targetPositions, seeds, scales, maxCubes);
  const tierSet = app.tierAttributeSets[app.tierName] ?? app.tierAttributeSets.medium;
  geometry.setAttribute('aBase', tierSet.attributes.aBase);
  geometry.setAttribute('aTarget', tierSet.attributes.aTarget);
  geometry.setAttribute('aSeed', tierSet.attributes.aSeed);
  geometry.setAttribute('aScale', tierSet.attributes.aScale);
  geometry.instanceCount = tierSet.count;
  app.activeTierCountName = app.tierName;

  app.uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uDrift: { value: getTier().drift },
    uNoise: { value: getTier().noise },
    uSweep: { value: getTier().sweep },
    uReduced: { value: app.prefersReducedMotion ? 1 : 0 },
    uPointer: { value: new THREE.Vector2(0, 0) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: app.uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: true,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  baseGeometry.dispose();

  app.material = material;
  app.mesh = mesh;

  return mesh;
}

function applyTierVisualToRenderer() {
  if (app.rendererType !== 'webgl' || !app.uniforms) {
    return;
  }

  const tier = getTier();
  app.uniforms.uDrift.value = tier.drift;
  app.uniforms.uNoise.value = tier.noise;
  app.uniforms.uSweep.value = tier.sweep;
  resizeRenderer();
}

function applyTierCountToRenderer(targetTierName, options = {}) {
  if (app.rendererType !== 'webgl' || !app.mesh || !app.tierAttributeSets) {
    return;
  }

  const { force = false } = options;
  if (!force && shouldFreezeTierCountSwitch()) {
    app.pendingTierCountName = targetTierName;
    return;
  }

  const tierSet = app.tierAttributeSets[targetTierName];
  if (!tierSet) {
    return;
  }

  const geometry = app.mesh.geometry;
  geometry.setAttribute('aBase', tierSet.attributes.aBase);
  geometry.setAttribute('aTarget', tierSet.attributes.aTarget);
  geometry.setAttribute('aSeed', tierSet.attributes.aSeed);
  geometry.setAttribute('aScale', tierSet.attributes.aScale);
  geometry.instanceCount = tierSet.count;
  app.activeTierCountName = targetTierName;
}

function flushPendingTierCountChange() {
  if (!app.pendingTierCountName || shouldFreezeTierCountSwitch()) {
    return;
  }

  const pendingTier = app.pendingTierCountName;
  app.pendingTierCountName = null;
  applyTierCountToRenderer(pendingTier, { force: true });
}

function applyTierToRenderer() {
  applyTierVisualToRenderer();
  const targetTierName = getTier().name;
  if (targetTierName !== app.activeTierCountName) {
    applyTierCountToRenderer(targetTierName);
  }
}

function resizeRenderer() {
  if (!app.renderer || !app.camera) {
    return;
  }

  const tier = getTier();
  const dprCap = isMobileProfile() ? Math.min(1.5, tier.dpr) : Math.min(2.0, tier.dpr);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);

  app.renderer.setPixelRatio(pixelRatio);
  app.renderer.setSize(window.innerWidth, window.innerHeight, false);
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
}

function initWebGLRenderer() {
  let context;

  try {
    context =
      elements.glCanvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
      }) ||
      elements.glCanvas.getContext('webgl', {
        alpha: true,
        antialias: false,
      });
  } catch (error) {
    return false;
  }

  if (!context) {
    return false;
  }

  try {
    app.renderer = new THREE.WebGLRenderer({
      canvas: elements.glCanvas,
      context,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
  } catch (error) {
    return false;
  }
  try {
    app.scene = new THREE.Scene();
    app.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
    app.camera.position.set(0, 0.25, 24);

    const mesh = buildInstancedMesh();
    app.scene.add(mesh);

    resizeRenderer();

    // Compile once before reveal to reduce visible shader hitch.
    app.renderer.compile(app.scene, app.camera);

    app.rendererType = 'webgl';
    setRenderMode('webgl');
    return true;
  } catch (error) {
    if (app.renderer) {
      app.renderer.dispose();
      app.renderer = null;
    }
    app.scene = null;
    app.camera = null;
    app.mesh = null;
    app.material = null;
    app.uniforms = null;
    return false;
  }
}

function initCanvasFallback() {
  const ctx = elements.fallbackCanvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  app.canvasCtx = ctx;
  app.canvasBase = createBaseSwarmPositions(CANVAS_CUBES, 223);
  app.canvasTarget =
    app.wordmarkTargetsCanvas && app.wordmarkTargetsCanvas.length === CANVAS_CUBES * 3
      ? app.wordmarkTargetsCanvas
      : createSebastianTargets({
          targetCount: CANVAS_CUBES,
          sampleStep: 0.039,
          minSpacing: 0.022,
          tracking: 0.08,
          height: 1.28,
          depthJitter: 0.01,
          seed: 13,
        });
  app.canvasTargetScale =
    app.wordmarkTargetScaleCanvas && app.wordmarkTargetScaleCanvas.length === CANVAS_CUBES
      ? app.wordmarkTargetScaleCanvas
      : null;
  app.canvasSeed = createSeeds(CANVAS_CUBES, 811);

  app.rendererType = 'canvas';
  setRenderMode('canvas');
  resizeCanvasFallback();
  return true;
}

function activateStaticFallback() {
  injectStaticWordmarkSvg();
  app.rendererType = 'static';
  setRenderMode('static');

  if (app.renderer) {
    app.renderer.dispose();
    app.renderer = null;
  }

  if (app.material) {
    app.material.dispose();
    app.material = null;
  }

  if (app.mesh) {
    app.mesh.geometry.dispose();
    app.mesh = null;
  }
}

function resizeCanvasFallback() {
  if (!app.canvasCtx) {
    return;
  }

  const isMobile = isMobileProfile();
  const dprCap = isMobile ? 1.25 : 1.5;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);

  app.canvasWidth = Math.floor(window.innerWidth * pixelRatio);
  app.canvasHeight = Math.floor(window.innerHeight * pixelRatio);
  elements.fallbackCanvas.width = app.canvasWidth;
  elements.fallbackCanvas.height = app.canvasHeight;
  elements.fallbackCanvas.style.width = `${window.innerWidth}px`;
  elements.fallbackCanvas.style.height = `${window.innerHeight}px`;
}

function updateAdaptiveTier(nowMs, dtMs) {
  // Locked to a fixed quality profile; keep adaptive count/quality switching disabled.
  void nowMs;
  void dtMs;
}

function updateEarlyBench(nowMs) {
  if (app.rendererType !== 'webgl' || app.benchChecked || app.forceMaxProfile) {
    return;
  }

  if (!app.benchStart) {
    app.benchStart = nowMs;
  }

  app.benchFrames += 1;
  const elapsed = nowMs - app.benchStart;
  if (elapsed < 1500) {
    return;
  }

  const avgFps = (app.benchFrames / elapsed) * 1000;
  app.benchChecked = true;

  if (avgFps < 24) {
    activateStaticFallback();
  }
}

function updatePointerSmoothing() {
  app.pointerX = lerp(app.pointerX, app.pointerXTarget, 0.08);
  app.pointerY = lerp(app.pointerY, app.pointerYTarget, 0.08);
}

function renderWebGL(nowMs) {
  if (!app.renderer || !app.camera || !app.uniforms) {
    return;
  }

  updatePointerSmoothing();

  app.uniforms.uTime.value = nowMs * 0.001;
  app.uniforms.uProgress.value = app.progress;
  app.uniforms.uReduced.value = app.prefersReducedMotion ? 1 : 0;
  app.uniforms.uPointer.value.set(app.pointerX, app.pointerY);

  app.renderer.render(app.scene, app.camera);
}

function renderCanvasFallback(nowMs) {
  if (!app.canvasCtx || !app.canvasBase || !app.canvasTarget) {
    return;
  }

  const ctx = app.canvasCtx;
  const width = app.canvasWidth;
  const height = app.canvasHeight;

  ctx.clearRect(0, 0, width, height);

  const scale = Math.min(width, height) * 0.027;
  const lockPhase = smoothstep(0.8, 1, app.progress);
  const sweepPos = lerp(-0.7, 0.7, lockPhase);

  for (let i = 0; i < app.canvasSeed.length; i += 1) {
    const idx3 = i * 3;
    const seed = app.canvasSeed[i];

    const bx = app.canvasBase[idx3];
    const by = app.canvasBase[idx3 + 1];
    const bz = app.canvasBase[idx3 + 2];

    const tx = app.canvasTarget[idx3];
    const ty = app.canvasTarget[idx3 + 1];
    const tz = app.canvasTarget[idx3 + 2];

    const drift = app.prefersReducedMotion
      ? 0
      : (Math.sin(nowMs * 0.00052 + seed * 0.02) + Math.cos(nowMs * 0.00037 + seed)) * 0.35;

    const x = lerp(bx + drift, tx, app.progress);
    const y = lerp(by + drift * 0.4, ty, app.progress);
    const z = lerp(bz, tz, app.progress);

    const perspective = 22 / (22 + z + 14);
    const screenX = width * 0.5 + x * scale * perspective;
    const screenY = height * 0.5 - y * scale * perspective;
    const pointScale = app.canvasTargetScale ? app.canvasTargetScale[i] : 1.0;
    const size = (1.4 + (seed % 1.2)) * perspective * lerp(1, 0.6, lockPhase) * pointScale;

    const sweep = Math.exp(-Math.pow((screenX / width) * 2 - 1 - sweepPos, 2) * 36) * lockPhase;
    const cyan = 120 + sweep * 125 + lockPhase * 20;

    ctx.fillStyle = `rgba(${180 + sweep * 60 + lockPhase * 12}, ${200 + sweep * 58 + lockPhase * 14}, ${cyan}, ${0.78 + lockPhase * 0.16})`;
    ctx.fillRect(screenX - size * 0.5, screenY - size * 0.5, size, size);
  }
}

function loop(nowMs) {
  if (app.stopLoop) {
    return;
  }

  requestAnimationFrame(loop);

  if (app.paused) {
    return;
  }

  if (!app.lastFrameTime) {
    app.lastFrameTime = nowMs;
  }

  const dtMs = clamp(nowMs - app.lastFrameTime, 1, 64);
  app.lastFrameTime = nowMs;

  updateProgress(nowMs);

  if (app.rendererType === 'webgl') {
    updateAdaptiveTier(nowMs, dtMs);
    updateEarlyBench(nowMs);
    renderWebGL(nowMs);
    return;
  }

  if (app.rendererType === 'canvas') {
    renderCanvasFallback(nowMs);
    return;
  }
}

function setupPointerInfluence() {
  window.addEventListener(
    'pointermove',
    (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      app.pointerXTarget = clamp(x, -1, 1);
      app.pointerYTarget = clamp(-y, -1, 1);
    },
    { passive: true }
  );
}

function setupVisibilityHandling() {
  document.addEventListener('visibilitychange', () => {
    app.paused = document.hidden;
    if (!document.hidden) {
      app.lastFrameTime = performance.now();
    }
  });
}

function handleReducedMotionChange(event) {
  app.prefersReducedMotion = event.matches;
  app.uniforms?.uReduced && (app.uniforms.uReduced.value = event.matches ? 1 : 0);
  scheduleCarouselRebuild();
}

function setupReducedMotionListener() {
  if (typeof reducedMotionQuery.addEventListener === 'function') {
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    return;
  }

  if (typeof reducedMotionQuery.addListener === 'function') {
    reducedMotionQuery.addListener(handleReducedMotionChange);
  }
}

function setupResizeHandling() {
  window.addEventListener(
    'resize',
    () => {
      updateRanges();
      resizeRenderer();
      resizeCanvasFallback();
      scheduleCarouselRebuild();
    },
    { passive: true }
  );
}

function buildWordmarkSvgMarkup(pathD, idPrefix) {
  const steelId = `${idPrefix}-steel`;
  const cyanId = `${idPrefix}-cyan`;
  const glowId = `${idPrefix}-glow`;

  return `
    <defs>
      <linearGradient id="${steelId}" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f7fbff" />
        <stop offset="33%" stop-color="#c0c9d5" />
        <stop offset="58%" stop-color="#d9e3ef" />
        <stop offset="100%" stop-color="#8c96a7" />
      </linearGradient>
      <linearGradient id="${cyanId}" x1="0%" y1="35%" x2="100%" y2="65%">
        <stop offset="0%" stop-color="#58c7ff" stop-opacity="0.0" />
        <stop offset="45%" stop-color="#70d9ff" stop-opacity="0.18" />
        <stop offset="100%" stop-color="#58c7ff" stop-opacity="0.0" />
      </linearGradient>
      <filter id="${glowId}" x="-35%" y="-70%" width="170%" height="240%">
        <feGaussianBlur stdDeviation="1.7" result="blur" />
        <feColorMatrix
          in="blur"
          type="matrix"
          values="0 0 0 0 0.26
                  0 0 0 0 0.66
                  0 0 0 0 0.89
                  0 0 0 0.24 0"
        />
      </filter>
    </defs>
    <g>
      <path class="wordmark-metal" d="${pathD}" fill="url(#${steelId})" fill-rule="evenodd" />
      <path d="${pathD}" fill="url(#${cyanId})" fill-rule="evenodd" />
      <path d="${pathD}" fill="none" stroke="#dbe8f4" stroke-opacity="0.08" stroke-width="0.015" fill-rule="evenodd" />
      <path d="${pathD}" fill="#5fd4ff" opacity="0.18" filter="url(#${glowId})" fill-rule="evenodd" />
    </g>
  `;
}

function injectStaticWordmarkSvg() {
  if (app.staticWordmarkInjected) {
    return;
  }

  const svgData = app.wordmarkSvgData ?? createSebastianWordmarkSvg({ tracking: 0.08, padding: 0.09 });
  const svg = elements.staticWordmarkSvg;
  if (svg) {
    svg.setAttribute('viewBox', svgData.viewBox);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.innerHTML = buildWordmarkSvgMarkup(svgData.d, 'static-wordmark');
  }
  app.staticWordmarkInjected = true;
}

async function prepareWordmarkData() {
  const maxCubes = app.maxCubes;
  try {
    const traced = await traceWordmarkFromPng('./fontimages/fixedname.png', {
      alphaThreshold: 18,
      maxTraceWidth: 760,
      maxTraceHeight: 300,
      trimPadding: 2,
      svgPadding: 2,
      minComponentArea: 42,
    });

    const desiredWorldWidth = 10.8;
    const tracedHeight = clamp(desiredWorldWidth / traced.aspect, 1.18, 2.45);

    app.wordmarkSvgData = traced.svg;
    const tracedHighTargets = traced.createTargets({
      targetCount: maxCubes,
      sampleStep: 1,
      minSpacing: 0.98,
      baselineRatio: 0.0,
      contourRatio: 0.34,
      cornerRatio: 0.12,
      minInteriorCount: app.minInteriorCount,
      minEdgeCount: app.minEdgeCount,
      typeScaleInterior: 1.1,
      typeScaleBaseline: 1.0,
      typeScaleContour: 0.8,
      typeScaleCorner: 0.64,
      height: tracedHeight,
      depthJitter: 0.028,
      seed: 73,
    });
    app.wordmarkTargetsHigh = tracedHighTargets;
    app.wordmarkTargetScaleHigh =
      tracedHighTargets.pointScales && tracedHighTargets.pointScales.length === maxCubes
        ? tracedHighTargets.pointScales
        : null;

    const tracedCanvasTargets = traced.createTargets({
      targetCount: CANVAS_CUBES,
      sampleStep: 1.2,
      minSpacing: 1.12,
      baselineRatio: 0.0,
      contourRatio: 0.33,
      cornerRatio: 0.11,
      minInteriorCount: 1150,
      minEdgeCount: 450,
      typeScaleInterior: 1.1,
      typeScaleBaseline: 1.0,
      typeScaleContour: 0.8,
      typeScaleCorner: 0.64,
      height: tracedHeight * 0.985,
      depthJitter: 0.01,
      seed: 13,
    });
    app.wordmarkTargetsCanvas = tracedCanvasTargets;
    app.wordmarkTargetScaleCanvas =
      tracedCanvasTargets.pointScales && tracedCanvasTargets.pointScales.length === CANVAS_CUBES
        ? tracedCanvasTargets.pointScales
        : null;
    debugLogTargetBand('trace-high', app.wordmarkTargetsHigh);
    debugLogTargetBand('trace-canvas', app.wordmarkTargetsCanvas);
    return;
  } catch (error) {
    console.warn('PNG wordmark tracing failed; using geometric fallback.', error);
  }

  app.wordmarkSvgData = createSebastianWordmarkSvg({ tracking: 0.08, padding: 0.09 });
  app.wordmarkTargetsHigh = createSebastianTargets({
    targetCount: maxCubes,
    sampleStep: 0.032,
    minSpacing: 0.018,
    tracking: 0.08,
    height: 1.3,
    depthJitter: 0.03,
    seed: 73,
  });
  app.wordmarkTargetsCanvas = createSebastianTargets({
    targetCount: CANVAS_CUBES,
    sampleStep: 0.039,
    minSpacing: 0.022,
    tracking: 0.08,
    height: 1.28,
    depthJitter: 0.01,
    seed: 13,
  });
  app.wordmarkTargetScaleHigh = null;
  app.wordmarkTargetScaleCanvas = null;
  debugLogTargetBand('geom-high', app.wordmarkTargetsHigh);
  debugLogTargetBand('geom-canvas', app.wordmarkTargetsCanvas);
}

async function preloadWordmarkFont() {
  if (!document.fonts || !document.fonts.load) {
    return;
  }

  try {
    await document.fonts.load('700 64px IndustrialWordmark', WORDMARK);
  } catch (error) {
    // Keep running if font preload fails.
  }
}

async function init() {
  document.body.classList.add('intro-managed');
  updateRanges();
  setupCollectionCarousel();
  if (app.forceMaxProfile) {
    app.maxCubes = BASE_MAX_CUBES + CHROME_EXTRA_CUBES;
    app.minEdgeCount = BASE_MIN_EDGE_COUNT + CHROME_EXTRA_EDGE_COUNT;
  }
  if (app.maxCubes < app.minInteriorCount + app.minEdgeCount) {
    app.minInteriorCount = Math.max(0, app.maxCubes - app.minEdgeCount);
  }
  for (const tierName of Object.keys(QUALITY_TIERS)) {
    QUALITY_TIERS[tierName].count = app.maxCubes;
  }
  if (app.forceMaxProfile) {
    app.tierName = 'high';
    app.benchChecked = true;
  }
  await prepareWordmarkData();
  setupPointerInfluence();
  setupVisibilityHandling();
  setupReducedMotionListener();
  setupResizeHandling();

  await preloadWordmarkFont();

  const webglOk = initWebGLRenderer();
  if (!webglOk) {
    const canvasOk = initCanvasFallback();
    if (!canvasOk) {
      activateStaticFallback();
    }
  }

  requestAnimationFrame(loop);
}

init().catch((error) => {
  console.error('Intro initialization failed; showing fallback content.', error);
  document.body.classList.remove('intro-managed');
  document.body.classList.add('intro-complete');
  document.body.removeAttribute('data-render-mode');
  document.documentElement.style.setProperty('--intro-light-progress', '1');
});
