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

function key(x, y) {
  return `${x},${y}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = (error) => reject(error || new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

function alphaMaskFromImage(image, options) {
  const maxTraceWidth = options.maxTraceWidth ?? 760;
  const maxTraceHeight = options.maxTraceHeight ?? 300;
  const alphaThreshold = options.alphaThreshold ?? 20;

  const scale = Math.min(1, maxTraceWidth / image.width, maxTraceHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not create 2D context for wordmark tracing');
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  const mask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < alphaThreshold) {
        continue;
      }
      const i = y * width + x;
      mask[i] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('No opaque pixels found in wordmark PNG');
  }

  const trimPad = options.trimPadding ?? 2;
  const left = clamp(minX - trimPad, 0, width - 1);
  const right = clamp(maxX + trimPad, 0, width - 1);
  const top = clamp(minY - trimPad, 0, height - 1);
  const bottom = clamp(maxY + trimPad, 0, height - 1);

  const trimmedWidth = right - left + 1;
  const trimmedHeight = bottom - top + 1;
  const trimmedMask = new Uint8Array(trimmedWidth * trimmedHeight);

  for (let y = 0; y < trimmedHeight; y += 1) {
    for (let x = 0; x < trimmedWidth; x += 1) {
      const srcIndex = (y + top) * width + (x + left);
      const dstIndex = y * trimmedWidth + x;
      trimmedMask[dstIndex] = mask[srcIndex];
    }
  }

  return {
    mask: trimmedMask,
    width: trimmedWidth,
    height: trimmedHeight,
  };
}

function removeSmallComponents(mask, width, height, minArea) {
  const visited = new Uint8Array(width * height);
  const out = new Uint8Array(width * height);
  const queueX = [];
  const queueY = [];
  const component = [];

  function enqueue(x, y) {
    queueX.push(x);
    queueY.push(y);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (mask[startIndex] !== 1 || visited[startIndex] === 1) {
        continue;
      }

      queueX.length = 0;
      queueY.length = 0;
      component.length = 0;

      visited[startIndex] = 1;
      enqueue(x, y);

      while (queueX.length) {
        const cx = queueX.pop();
        const cy = queueY.pop();
        const ci = cy * width + cx;
        component.push(ci);

        // 4-neighbor flood fill is enough for alpha-mask component cleanup.
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const ni = ny * width + nx;
          if (visited[ni] === 1 || mask[ni] !== 1) {
            continue;
          }
          visited[ni] = 1;
          enqueue(nx, ny);
        }
      }

      if (component.length < minArea) {
        continue;
      }

      for (const index of component) {
        out[index] = 1;
      }
    }
  }

  return out;
}

function isFilled(mask, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return false;
  }
  return mask[y * width + x] === 1;
}

function traceContours(mask, width, height) {
  const edges = [];
  const outgoing = new Map();

  function addEdge(x1, y1, x2, y2) {
    const edgeIndex = edges.length;
    edges.push({ x1, y1, x2, y2, used: false });
    const mapKey = key(x1, y1);
    const list = outgoing.get(mapKey) ?? [];
    list.push(edgeIndex);
    outgoing.set(mapKey, list);
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilled(mask, width, height, x, y)) {
        continue;
      }

      if (!isFilled(mask, width, height, x, y - 1)) {
        addEdge(x, y, x + 1, y);
      }
      if (!isFilled(mask, width, height, x + 1, y)) {
        addEdge(x + 1, y, x + 1, y + 1);
      }
      if (!isFilled(mask, width, height, x, y + 1)) {
        addEdge(x + 1, y + 1, x, y + 1);
      }
      if (!isFilled(mask, width, height, x - 1, y)) {
        addEdge(x, y + 1, x, y);
      }
    }
  }

  function removeCollinear(points) {
    if (points.length <= 3) {
      return points;
    }

    let current = points;
    let changed = true;
    let guard = 0;

    while (changed && guard < 8) {
      guard += 1;
      changed = false;
      const next = [];

      for (let i = 0; i < current.length; i += 1) {
        const prev = current[(i - 1 + current.length) % current.length];
        const point = current[i];
        const after = current[(i + 1) % current.length];

        const dx1 = point.x - prev.x;
        const dy1 = point.y - prev.y;
        const dx2 = after.x - point.x;
        const dy2 = after.y - point.y;
        const cross = dx1 * dy2 - dy1 * dx2;

        if (Math.abs(cross) <= 1e-8) {
          changed = true;
          continue;
        }

        next.push(point);
      }

      current = next;
      if (current.length <= 3) {
        break;
      }
    }

    return current;
  }

  const contours = [];

  for (let i = 0; i < edges.length; i += 1) {
    if (edges[i].used) {
      continue;
    }

    const loop = [];
    let edgeIndex = i;
    let safety = 0;

    while (safety < edges.length + 4) {
      safety += 1;
      const edge = edges[edgeIndex];
      if (edge.used) {
        break;
      }
      edge.used = true;

      if (loop.length === 0) {
        loop.push({ x: edge.x1, y: edge.y1 });
      }
      loop.push({ x: edge.x2, y: edge.y2 });

      const start = loop[0];
      if (edge.x2 === start.x && edge.y2 === start.y) {
        break;
      }

      const nextEdges = outgoing.get(key(edge.x2, edge.y2)) ?? [];
      let nextEdgeIndex = -1;
      for (const candidate of nextEdges) {
        if (!edges[candidate].used) {
          nextEdgeIndex = candidate;
          break;
        }
      }

      if (nextEdgeIndex < 0) {
        break;
      }

      edgeIndex = nextEdgeIndex;
    }

    if (loop.length < 4) {
      continue;
    }

    if (loop[loop.length - 1].x === loop[0].x && loop[loop.length - 1].y === loop[0].y) {
      loop.pop();
    }

    const simplified = removeCollinear(loop);
    if (simplified.length >= 3) {
      contours.push(simplified);
    }
  }

  return contours;
}

function contoursToPath(contours, width, height, padding) {
  const pad = padding ?? 2;
  const widthWithPad = width + pad * 2;
  const heightWithPad = height + pad * 2;
  const parts = [];

  for (const contour of contours) {
    if (!contour.length) {
      continue;
    }

    const first = contour[0];
    let d = `M ${(first.x + pad).toFixed(3)} ${(first.y + pad).toFixed(3)}`;
    for (let i = 1; i < contour.length; i += 1) {
      const p = contour[i];
      d += ` L ${(p.x + pad).toFixed(3)} ${(p.y + pad).toFixed(3)}`;
    }
    d += ' Z';
    parts.push(d);
  }

  return {
    d: parts.join(' '),
    viewBox: `0 0 ${widthWithPad.toFixed(3)} ${heightWithPad.toFixed(3)}`,
    width: widthWithPad,
    height: heightWithPad,
  };
}

function shuffleInPlace(values, rng) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = values[i];
    values[i] = values[j];
    values[j] = tmp;
  }
}

function sampleCandidatesWithSpacing(candidates, minSpacing, maxCount = Infinity) {
  const minSpacingSq = minSpacing * minSpacing;
  const bucketSize = minSpacing;
  const buckets = new Map();
  const out = [];
  const limit = Number.isFinite(maxCount) ? maxCount : Number.MAX_SAFE_INTEGER;

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

  function addPoint(x, y) {
    const ix = Math.floor(x / bucketSize);
    const iy = Math.floor(y / bucketSize);
    const mapKey = bucketKey(ix, iy);
    const bucket = buckets.get(mapKey) ?? [];
    const point = { x, y };
    bucket.push(point);
    buckets.set(mapKey, bucket);
    out.push(point);
  }

  for (const candidate of candidates) {
    if (out.length >= limit) {
      break;
    }
    if (!canPlace(candidate.x, candidate.y)) {
      continue;
    }
    addPoint(candidate.x, candidate.y);
  }

  return out;
}

function buildFilledCandidates(mask, width, height, sampleStep) {
  const out = [];
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const roundedX = Math.floor(x);
      const roundedY = Math.floor(y);
      if (mask[roundedY * width + roundedX] !== 1) {
        continue;
      }
      out.push({ x: roundedX, y: roundedY });
    }
  }
  return out;
}

function buildContourCandidates(mask, width, height, sampleStep) {
  const out = [];
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const roundedX = Math.floor(x);
      const roundedY = Math.floor(y);
      if (mask[roundedY * width + roundedX] !== 1) {
        continue;
      }

      const left = roundedX > 0 ? mask[roundedY * width + (roundedX - 1)] : 0;
      const right = roundedX < width - 1 ? mask[roundedY * width + (roundedX + 1)] : 0;
      const up = roundedY > 0 ? mask[(roundedY - 1) * width + roundedX] : 0;
      const down = roundedY < height - 1 ? mask[(roundedY + 1) * width + roundedX] : 0;
      if (left === 1 && right === 1 && up === 1 && down === 1) {
        continue;
      }

      out.push({ x: roundedX, y: roundedY });
    }
  }
  return out;
}

function sampleMaskPoints(mask, width, height, options = {}) {
  const sampleStep = Math.max(1, options.sampleStep ?? 1);
  const minSpacing = Math.max(1, options.minSpacing ?? 1.18);
  const seed = options.seed ?? 7;
  const maxCount = options.maxCount ?? Infinity;
  const candidates = buildFilledCandidates(mask, width, height, sampleStep);
  const rng = createRng(seed);
  shuffleInPlace(candidates, rng);
  return sampleCandidatesWithSpacing(candidates, minSpacing, maxCount);
}

function sampleContourPoints(mask, width, height, options = {}) {
  const sampleStep = Math.max(1, options.sampleStep ?? 1);
  const minSpacing = Math.max(1, options.minSpacing ?? 1.1);
  const seed = options.seed ?? 17;
  const maxCount = options.maxCount ?? Infinity;
  const candidates = buildContourCandidates(mask, width, height, sampleStep);
  const rng = createRng(seed);
  shuffleInPlace(candidates, rng);
  return sampleCandidatesWithSpacing(candidates, minSpacing, maxCount);
}

function sampleBaselineAnchors(mask, width, height, options = {}) {
  const bins = Math.max(24, Math.floor(options.bins ?? Math.round(width / 8)));
  const minSpacing = Math.max(1, options.minSpacing ?? 1.0);
  const seed = options.seed ?? 31;
  const maxCount = options.maxCount ?? Infinity;
  const candidates = [];

  for (let i = 0; i < bins; i += 1) {
    const x0 = Math.floor((i / bins) * width);
    const x1 = Math.max(x0, Math.min(width - 1, Math.floor(((i + 1) / bins) * width) - 1));
    let best = null;

    for (let y = height - 1; y >= 0 && !best; y -= 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (mask[y * width + x] === 1) {
          best = { x, y };
          break;
        }
      }
    }

    if (best) {
      candidates.push(best);
    }
  }

  const rng = createRng(seed);
  shuffleInPlace(candidates, rng);
  return sampleCandidatesWithSpacing(candidates, minSpacing, maxCount);
}

function normalizePoint(point, width, height) {
  return {
    x: (point.x + 0.5 - width * 0.5) / height,
    y: (height * 0.5 - (point.y + 0.5)) / height,
  };
}

function takeFromPool(pool, type, count, selected, used) {
  if (count <= 0 || !pool.length) {
    return;
  }

  for (let i = 0; i < pool.length && count > 0; i += 1) {
    const point = pool[i];
    const k = key(point.x, point.y);
    if (used.has(k)) {
      continue;
    }
    used.add(k);
    selected.push({ point, type });
    count -= 1;
  }
}

function createTargetFactory(traceData) {
  const denseInteriorPoints = sampleMaskPoints(traceData.mask, traceData.width, traceData.height, {
    sampleStep: 1,
    minSpacing: 1.0,
    seed: 101,
  });
  const denseContourPoints = sampleContourPoints(traceData.mask, traceData.width, traceData.height, {
    sampleStep: 1,
    minSpacing: 1.0,
    seed: 211,
  });
  const denseBaselinePoints = sampleBaselineAnchors(traceData.mask, traceData.width, traceData.height, {
    minSpacing: 1.0,
    bins: Math.max(64, Math.round(traceData.width / 8)),
    seed: 307,
  });

  return function createTargets(options = {}) {
    const {
      targetCount = 900,
      height = 1.3,
      depthJitter = 0.06,
      seed = 7,
      sampleStep = 1,
      minSpacing = 1.16,
      baselineRatio = 0.2,
      contourRatio = 0.25,
    } = options;

    const interiorPool = sampleMaskPoints(traceData.mask, traceData.width, traceData.height, {
      sampleStep,
      minSpacing,
      seed: seed + 11,
    });
    const contourPool = sampleContourPoints(traceData.mask, traceData.width, traceData.height, {
      sampleStep,
      minSpacing: Math.max(1, minSpacing * 0.95),
      seed: seed + 23,
    });
    const baselinePool = sampleBaselineAnchors(traceData.mask, traceData.width, traceData.height, {
      minSpacing: Math.max(1, minSpacing * 0.9),
      bins: Math.max(64, Math.round(traceData.width / (sampleStep * 8))),
      seed: seed + 37,
    });

    const interiorSource = interiorPool.length ? interiorPool : denseInteriorPoints;
    const contourSource = contourPool.length ? contourPool : denseContourPoints;
    const baselineSource = baselinePool.length ? baselinePool : denseBaselinePoints;

    const anyPoints = interiorSource.length || contourSource.length || baselineSource.length;
    if (!anyPoints) {
      return new Float32Array(targetCount * 3);
    }

    const selected = [];
    const used = new Set();
    const baselineTarget = Math.min(
      baselineSource.length,
      Math.max(1, Math.round(targetCount * baselineRatio))
    );
    const contourTarget = Math.min(
      contourSource.length,
      Math.max(0, Math.round(targetCount * contourRatio))
    );

    takeFromPool(baselineSource, 'baseline', baselineTarget, selected, used);
    takeFromPool(contourSource, 'contour', contourTarget, selected, used);
    takeFromPool(interiorSource, 'interior', targetCount - selected.length, selected, used);
    takeFromPool(contourSource, 'contour', targetCount - selected.length, selected, used);
    takeFromPool(baselineSource, 'baseline', targetCount - selected.length, selected, used);

    if (!selected.length) {
      return new Float32Array(targetCount * 3);
    }

    const refillPool = selected.slice();
    for (let i = 0; selected.length < targetCount; i += 1) {
      selected.push(refillPool[i % refillPool.length]);
    }

    const rng = createRng(seed);
    const out = new Float32Array(targetCount * 3);

    for (let i = 0; i < targetCount; i += 1) {
      const entry = selected[i];
      const normalized = normalizePoint(entry.point, traceData.width, traceData.height);

      let jitterX = 0.0020;
      let jitterY = 0.0020;
      if (entry.type === 'baseline') {
        jitterX = 0.0006;
        jitterY = 0.0;
      } else if (entry.type === 'contour') {
        jitterX = 0.0009;
        jitterY = 0.0005;
      }

      out[i * 3] = (normalized.x + (rng() - 0.5) * jitterX) * height;
      out[i * 3 + 1] = (normalized.y + (rng() - 0.5) * jitterY) * height;
      out[i * 3 + 2] = (rng() - 0.5) * depthJitter;
    }

    return out;
  };
}

export async function traceWordmarkFromPng(imageUrl, options = {}) {
  const image = await loadImage(imageUrl);
  const traceData = alphaMaskFromImage(image, options);
  const minComponentArea = options.minComponentArea ?? Math.max(18, Math.floor(traceData.width * traceData.height * 0.00012));
  const cleanedMask = removeSmallComponents(traceData.mask, traceData.width, traceData.height, minComponentArea);
  const cleanedData = {
    ...traceData,
    mask: cleanedMask,
  };

  const contours = traceContours(cleanedData.mask, cleanedData.width, cleanedData.height);

  if (!contours.length) {
    throw new Error('Failed to trace contours from wordmark image');
  }

  const svg = contoursToPath(contours, cleanedData.width, cleanedData.height, options.svgPadding ?? 2);
  const aspect = cleanedData.width / cleanedData.height;
  const createTargets = createTargetFactory(cleanedData);

  return {
    svg,
    contours,
    width: cleanedData.width,
    height: cleanedData.height,
    aspect,
    createTargets,
  };
}
