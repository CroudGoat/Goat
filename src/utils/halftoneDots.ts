export interface HalftoneVisualParams {
  pitch: number;
  blackPoint: number;
  whitePoint: number;
  sCurve: number;
  gamma: number;
  maxDotFactor: number;
  shadeMix: number;
  shadeBlack: number;
  shadeWhite: number;
  shadeGamma: number;
}

export interface HalftonePhysicsParams {
  hoverRadius: number;
  repelStrength: number;
  scaleBoost: number;
}

export const DEFAULT_VISUAL_PARAMS: HalftoneVisualParams = {
  pitch: 5,
  blackPoint: 0,
  whitePoint: 0.91,
  sCurve: 1,
  gamma: 0.85,
  maxDotFactor: 0.63,
  shadeMix: 0.85,
  shadeBlack: 0,
  shadeWhite: 0.82,
  shadeGamma: 2.5,
};

export const DEFAULT_PHYSICS_PARAMS: HalftonePhysicsParams = {
  hoverRadius: 135,
  repelStrength: 4.5,
  scaleBoost: 0.3,
};

export interface DeScreenedPlate {
  cropW: number;
  cropH: number;
  minX: number;
  minY: number;
  startX: number;
  startY: number;
  cols: number;
  rows: number;
  densityGrid: Float32Array;
  coverageGrid: Float32Array;
  photoLuma: Uint8Array | null;
  photoW: number;
  photoH: number;
}

export interface HalftoneDotField {
  count: number;
  cropW: number;
  cropH: number;
  pitch: number;
  /** Interleaved static per-dot attributes: [baseX, baseY, baseR, baseShade, ...] */
  staticData: Float32Array;
  /** Interleaved dynamic per-dot attributes for WebGL2 bufferSubData: [offsetX, offsetY, scale, ...] */
  dynData: Float32Array;
  /** Row spatial index for O(1) vertical band culling */
  rowCount: number;
  rowY: Float32Array;
  rowStart: Int32Array;
  /** Per-dot velocity */
  velX: Float32Array;
  velY: Float32Array;
  /** Sparse-set of currently active dot indices */
  activeIndices: Int32Array;
  inActive: Uint8Array;
  activeCount: number;
}

export interface DotInteractionParams extends HalftonePhysicsParams {
  pointerX: number;
  pointerY: number;
  pointerActive: boolean;
  springStiffness: number;
  damping: number;
  rippleX: number;
  rippleY: number;
  rippleAge: number;
}

const SOURCE_PITCH = 10;

// Verified affine mapping from cloudgoat-halftone_b0873604.jpg (1297x1294)
// to horizontally-flipped image_4aebe5de.png (1280x1024)
const PHOTO_ALIGN_SCALE = 0.79;
const PHOTO_ALIGN_OX = 80;
const PHOTO_ALIGN_OY = -80;

function detectGridPhase(
  lumaArr: Uint8Array,
  w: number,
  h: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): { phaseX: number; phaseY: number } {
  const sampleX0 = Math.ceil((minX + (maxX - minX) * 0.25) / SOURCE_PITCH) * SOURCE_PITCH;
  const sampleX1 = Math.floor((minX + (maxX - minX) * 0.75) / SOURCE_PITCH) * SOURCE_PITCH;
  const sampleY0 = Math.ceil((minY + (maxY - minY) * 0.25) / SOURCE_PITCH) * SOURCE_PITCH;
  const sampleY1 = Math.floor((minY + (maxY - minY) * 0.75) / SOURCE_PITCH) * SOURCE_PITCH;

  let bestScore = -Infinity;
  let bestPx = 5;
  let bestPy = 5;

  for (let py = 0; py < SOURCE_PITCH; py++) {
    for (let px = 0; px < SOURCE_PITCH; px++) {
      let score = 0;
      for (let y = sampleY0 + py; y < sampleY1 - SOURCE_PITCH; y += SOURCE_PITCH * 2) {
        const gyMid = y + 5;
        for (let x = sampleX0 + px; x < sampleX1 - SOURCE_PITCH; x += SOURCE_PITCH * 2) {
          const gxMid = x + 5;
          const c = lumaArr[y * w + x];
          const gap = lumaArr[gyMid * w + gxMid];
          score += Math.abs(c - gap);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestPx = px;
        bestPy = py;
      }
    }
  }

  return { phaseX: bestPx + 0.5, phaseY: bestPy + 0.5 };
}

function sampleBilinear(
  grid: Float32Array,
  cols: number,
  rows: number,
  gx: number,
  gy: number,
): number {
  const x0 = Math.max(0, Math.min(cols - 1, Math.floor(gx)));
  const y0 = Math.max(0, Math.min(rows - 1, Math.floor(gy)));
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, gx - x0));
  const fy = Math.max(0, Math.min(1, gy - y0));

  const v00 = grid[y0 * cols + x0];
  const v10 = grid[y0 * cols + x1];
  const v01 = grid[y1 * cols + x0];
  const v11 = grid[y1 * cols + x1];

  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

function samplePhotoLuma(plate: DeScreenedPlate, sx: number, sy: number): number {
  const { photoLuma, photoW, photoH } = plate;
  if (!photoLuma || photoW <= 0 || photoH <= 0) return 1;

  const cx = sx * PHOTO_ALIGN_SCALE + PHOTO_ALIGN_OX;
  const cy = sy * PHOTO_ALIGN_SCALE + PHOTO_ALIGN_OY;

  const readClamped = (fx: number, fy: number) => {
    const ix = Math.max(0, Math.min(photoW - 1, Math.round(fx)));
    const iy = Math.max(0, Math.min(photoH - 1, Math.round(fy)));
    return photoLuma[iy * photoW + ix];
  };

  // Smooth 5-tap sample to avoid aliasing while keeping eye/fur detail crisp
  const sum =
    readClamped(cx, cy) * 2 +
    readClamped(cx - 1.5, cy - 1.5) +
    readClamped(cx + 1.5, cy - 1.5) +
    readClamped(cx - 1.5, cy + 1.5) +
    readClamped(cx + 1.5, cy + 1.5);

  return sum / (6 * 255);
}

/**
 * Run once on image load: flood-fill background, de-screen 10px plate, and capture aligned photo luminance.
 */
export function extractDeScreenedPlate(
  img: HTMLImageElement,
  photoImg?: HTMLImageElement | null,
): DeScreenedPlate | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return null;

  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  const lumaArr = new Uint8Array(w * h);

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    const l = (srcData[p] * 77 + srcData[p + 1] * 150 + srcData[p + 2] * 29) >> 8;
    lumaArr[i] = l;
    if (l < 100) {
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX <= minX || maxY <= minY) return null;

  const ext = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const pushIfWhite = (x: number, y: number) => {
    const idx = y * w + x;
    if (ext[idx]) return;
    if (lumaArr[idx] > 215) {
      ext[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    pushIfWhite(x, 0);
    pushIfWhite(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushIfWhite(0, y);
    pushIfWhite(w - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) pushIfWhite(x - 1, y);
    if (x < w - 1) pushIfWhite(x + 1, y);
    if (y > 0) pushIfWhite(x, y - 1);
    if (y < h - 1) pushIfWhite(x, y + 1);
  }

  const { phaseX, phaseY } = detectGridPhase(lumaArr, w, h, minX, maxX, minY, maxY);
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const startY = Math.floor((minY - phaseY) / SOURCE_PITCH) * SOURCE_PITCH + phaseY;
  const startX = Math.floor((minX - phaseX) / SOURCE_PITCH) * SOURCE_PITCH + phaseX;
  const cols = Math.floor((maxX + SOURCE_PITCH * 0.5 - startX) / SOURCE_PITCH) + 1;
  const rows = Math.floor((maxY + SOURCE_PITCH * 0.5 - startY) / SOURCE_PITCH) + 1;

  const densityGrid = new Float32Array(cols * rows);
  const coverageGrid = new Float32Array(cols * rows);
  const halfCell = SOURCE_PITCH * 0.5;

  for (let gy = 0; gy < rows; gy++) {
    const cy = startY + gy * SOURCE_PITCH;
    const y0 = Math.max(minY, Math.floor(cy - halfCell));
    const y1 = Math.min(maxY, Math.floor(cy + halfCell - 0.01));
    if (y1 < y0) continue;

    for (let gx = 0; gx < cols; gx++) {
      const cx = startX + gx * SOURCE_PITCH;
      const x0 = Math.max(minX, Math.floor(cx - halfCell));
      const x1 = Math.min(maxX, Math.floor(cx + halfCell - 0.01));
      if (x1 < x0) continue;

      let whiteArea = 0;
      let interiorPixels = 0;
      const cellPixels = (y1 - y0 + 1) * (x1 - x0 + 1);

      for (let sy = y0; sy <= y1; sy++) {
        const row = sy * w;
        for (let sx = x0; sx <= x1; sx++) {
          const idx = row + sx;
          if (ext[idx]) continue;
          interiorPixels++;
          const luma = lumaArr[idx];
          if (luma > 34) {
            whiteArea += Math.min(1, (luma - 34) / 205);
          }
        }
      }

      const gi = gy * cols + gx;
      coverageGrid[gi] = interiorPixels / Math.max(1, cellPixels);
      densityGrid[gi] = interiorPixels >= 10 ? Math.min(1, whiteArea / interiorPixels) : 0;
    }
  }

  let photoLuma: Uint8Array | null = null;
  let photoW = 0;
  let photoH = 0;

  if (photoImg && photoImg.naturalWidth > 0 && photoImg.naturalHeight > 0) {
    photoW = photoImg.naturalWidth;
    photoH = photoImg.naturalHeight;
    const pCanvas = document.createElement('canvas');
    pCanvas.width = photoW;
    pCanvas.height = photoH;
    const pCtx = pCanvas.getContext('2d', { willReadFrequently: true });
    if (pCtx) {
      // Flip horizontally to match halftone plate orientation
      pCtx.translate(photoW, 0);
      pCtx.scale(-1, 1);
      pCtx.drawImage(photoImg, 0, 0);
      const pData = pCtx.getImageData(0, 0, photoW, photoH).data;
      photoLuma = new Uint8Array(photoW * photoH);
      for (let i = 0; i < photoW * photoH; i++) {
        const p = i * 4;
        photoLuma[i] = (pData[p] * 77 + pData[p + 1] * 150 + pData[p + 2] * 29) >> 8;
      }
    }
  }

  return {
    cropW,
    cropH,
    minX,
    minY,
    startX,
    startY,
    cols,
    rows,
    densityGrid,
    coverageGrid,
    photoLuma,
    photoW,
    photoH,
  };
}

/**
 * Fast (~3ms) rebuild of WebGL2 halftone dots from a cached DeScreenedPlate using live visual params.
 */
export function buildDotFieldFromPlate(
  plate: DeScreenedPlate,
  params: HalftoneVisualParams,
): HalftoneDotField {
  const { cropW, cropH, minX, minY, startX, startY, cols, rows, densityGrid, coverageGrid } = plate;
  const targetPitch = Math.max(3, params.pitch);
  const blackPoint = Math.min(0.9, Math.max(0, params.blackPoint));
  const whitePoint = Math.max(blackPoint + 0.05, Math.min(1, params.whitePoint));
  const invRange = 1 / (whitePoint - blackPoint);
  const sCurveMix = Math.max(0, Math.min(1, params.sCurve));
  const gamma = Math.max(0.3, params.gamma);

  const shadeMix = Math.max(0, Math.min(1, params.shadeMix));
  const shadeBlack = Math.min(0.9, Math.max(0, params.shadeBlack));
  const shadeWhite = Math.max(shadeBlack + 0.05, Math.min(1, params.shadeWhite));
  const invShadeRange = 1 / (shadeWhite - shadeBlack);
  const shadeGamma = Math.max(0.3, params.shadeGamma);
  const hasPhoto = plate.photoLuma !== null && shadeMix > 0.001;

  const coords: number[] = [];
  const rowYs: number[] = [];
  const rowStarts: number[] = [];

  const maxR = targetPitch * params.maxDotFactor;
  const minR = Math.max(0.35, targetPitch * 0.07);

  for (let py = targetPitch * 0.5; py < cropH; py += targetPitch) {
    const sy = minY + py;
    const gy = (sy - startY) / SOURCE_PITCH;
    const rowBegin = coords.length / 4;

    for (let px = targetPitch * 0.5; px < cropW; px += targetPitch) {
      const sx = minX + px;
      const gx = (sx - startX) / SOURCE_PITCH;

      const cov = sampleBilinear(coverageGrid, cols, rows, gx, gy);
      if (cov < 0.42) continue;

      const density = sampleBilinear(densityGrid, cols, rows, gx, gy);
      const leveled = Math.max(0, Math.min(1, (density - blackPoint) * invRange));
      if (leveled <= 0.004) continue;

      const smooth = leveled * leveled * (3 - 2 * leveled);
      const curved = leveled + (smooth - leveled) * sCurveMix;
      const contrasted = Math.pow(curved, gamma);

      const r = Math.min(maxR, Math.sqrt(contrasted) * maxR);
      if (r < minR) continue;

      let shade = 1.0;
      if (hasPhoto) {
        const rawPhoto = samplePhotoLuma(plate, sx, sy);
        const normPhoto = Math.max(0, Math.min(1, (rawPhoto - shadeBlack) * invShadeRange));
        const smoothPhoto = normPhoto * normPhoto * (3 - 2 * normPhoto);
        const curvedShade = Math.pow(smoothPhoto, shadeGamma);
        shade = 1.0 + (curvedShade - 1.0) * shadeMix;
      }

      coords.push(px, py, r, shade);
    }

    const rowEnd = coords.length / 4;
    if (rowEnd > rowBegin) {
      rowYs.push(py);
      rowStarts.push(rowBegin);
    }
  }

  const count = coords.length / 4;
  rowStarts.push(count);

  const staticData = new Float32Array(coords);
  const dynData = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    dynData[i * 3 + 2] = 1;
  }

  return {
    count,
    cropW,
    cropH,
    pitch: targetPitch,
    staticData,
    dynData,
    rowCount: rowYs.length,
    rowY: new Float32Array(rowYs),
    rowStart: new Int32Array(rowStarts),
    velX: new Float32Array(count),
    velY: new Float32Array(count),
    activeIndices: new Int32Array(count),
    inActive: new Uint8Array(count),
    activeCount: 0,
  };
}

function findRowIndex(field: HalftoneDotField, targetY: number): number {
  let lo = 0;
  let hi = field.rowCount;
  const rowY = field.rowY;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rowY[mid] < targetY) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function stepHalftonePhysics(
  field: HalftoneDotField,
  params: DotInteractionParams,
): boolean {
  const {
    staticData,
    dynData,
    rowCount,
    rowY,
    rowStart,
    velX,
    velY,
    activeIndices,
    inActive,
  } = field;

  const {
    pointerX,
    pointerY,
    pointerActive,
    hoverRadius,
    repelStrength,
    scaleBoost,
    springStiffness,
    damping,
    rippleX,
    rippleY,
    rippleAge,
  } = params;

  const activateDot = (idx: number) => {
    if (!inActive[idx]) {
      inActive[idx] = 1;
      activeIndices[field.activeCount++] = idx;
    }
  };

  if (pointerActive) {
    const minY = pointerY - hoverRadius;
    const maxY = pointerY + hoverRadius;
    const minX = pointerX - hoverRadius;
    const maxX = pointerX + hoverRadius;
    const hoverRadiusSq = hoverRadius * hoverRadius;

    for (let r = findRowIndex(field, minY); r < rowCount && rowY[r] <= maxY; r++) {
      const end = rowStart[r + 1];
      for (let i = rowStart[r]; i < end; i++) {
        if (inActive[i]) continue;
        const sp = i * 4;
        const bx = staticData[sp];
        if (bx < minX || bx > maxX) continue;
        const dx = bx - pointerX;
        const dy = staticData[sp + 1] - pointerY;
        if (dx * dx + dy * dy < hoverRadiusSq) {
          activateDot(i);
        }
      }
    }
  }

  const rippleActive = rippleAge >= 0 && rippleAge < 0.85;
  const rippleRadius = rippleAge * 480;
  const rippleBand = 65;

  if (rippleActive) {
    const outer = rippleRadius + rippleBand;
    const inner = Math.max(0, rippleRadius - rippleBand);
    const outerSq = outer * outer;
    const innerSq = inner * inner;
    const minY = rippleY - outer;
    const maxY = rippleY + outer;
    const minX = rippleX - outer;
    const maxX = rippleX + outer;

    for (let r = findRowIndex(field, minY); r < rowCount && rowY[r] <= maxY; r++) {
      const end = rowStart[r + 1];
      for (let i = rowStart[r]; i < end; i++) {
        if (inActive[i]) continue;
        const sp = i * 4;
        const bx = staticData[sp];
        if (bx < minX || bx > maxX) continue;
        const dx = bx - rippleX;
        const dy = staticData[sp + 1] - rippleY;
        const dSq = dx * dx + dy * dy;
        if (dSq <= outerSq && dSq >= innerSq) {
          activateDot(i);
        }
      }
    }
  }

  const hoverRadiusSq = hoverRadius * hoverRadius;
  let k = 0;

  while (k < field.activeCount) {
    const i = activeIndices[k];
    const sp = i * 4;
    const p = i * 3;
    const ox = dynData[p];
    const oy = dynData[p + 1];
    const sc = dynData[p + 2];

    const cx = staticData[sp] + ox;
    const cy = staticData[sp + 1] + oy;

    let fx = -ox * springStiffness;
    let fy = -oy * springStiffness;
    let targetScale = 1;

    if (pointerActive) {
      const dx = cx - pointerX;
      const dy = cy - pointerY;
      const distSq = dx * dx + dy * dy;
      if (distSq < hoverRadiusSq && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const falloff = 1 - dist / hoverRadius;
        const smooth = falloff * falloff * (3 - 2 * falloff);
        const push = smooth * repelStrength;
        fx += (dx / dist) * push;
        fy += (dy / dist) * push;
        targetScale = Math.max(targetScale, 1 + smooth * scaleBoost);
      }
    }

    if (rippleActive) {
      const rdx = cx - rippleX;
      const rdy = cy - rippleY;
      const rDist = Math.hypot(rdx, rdy);
      const bandDiff = Math.abs(rDist - rippleRadius);
      if (bandDiff < rippleBand && rDist > 0.001) {
        const wave = (1 - bandDiff / rippleBand) * (1 - rippleAge / 0.85);
        const impulse = wave * 4.0;
        fx += (rdx / rDist) * impulse;
        fy += (rdy / rDist) * impulse;
        targetScale = Math.max(targetScale, 1 + wave * 0.38);
      }
    }

    const vx = (velX[i] + fx) * damping;
    const vy = (velY[i] + fy) * damping;
    const nx = ox + vx;
    const ny = oy + vy;
    const ns = sc + (targetScale - sc) * 0.24;

    if (
      Math.abs(nx) < 0.02 &&
      Math.abs(ny) < 0.02 &&
      Math.abs(vx) < 0.02 &&
      Math.abs(vy) < 0.02 &&
      Math.abs(ns - 1) < 0.008
    ) {
      dynData[p] = 0;
      dynData[p + 1] = 0;
      dynData[p + 2] = 1;
      velX[i] = 0;
      velY[i] = 0;
      inActive[i] = 0;
      field.activeCount--;
      activeIndices[k] = activeIndices[field.activeCount];
    } else {
      dynData[p] = nx;
      dynData[p + 1] = ny;
      dynData[p + 2] = ns;
      velX[i] = vx;
      velY[i] = vy;
      k++;
    }
  }

  return field.activeCount > 0 || pointerActive || rippleActive;
}

export interface GoatTransform {
  scaleX: number;
  scaleY: number;
  dotScale: number;
  drawX: number;
  drawY: number;
}

export interface MorphBuffers {
  targetData: Float32Array;
  burstData: Float32Array;
}

function hash01(n: number, salt: number): number {
  let x = (n * 374761393 + salt * 668265263) | 0;
  x = ((x ^ (x >> 13)) * 1274126177) | 0;
  return ((x ^ (x >> 16)) >>> 0) / 4294967295;
}

/**
 * Sample rendered section layout lines, card borders, & text glyphs into GPU morph targets and burst vectors.
 */
export function buildSectionMorphTargets(
  field: HalftoneDotField,
  transform: GoatTransform,
  panelEl: HTMLElement,
  viewportW: number,
  viewportH: number,
): MorphBuffers {
  const count = field.count;
  const targetData = new Float32Array(count * 4);
  const burstData = new Float32Array(count * 4);
  if (count === 0) return { targetData, burstData };

  const panelRect = panelEl.getBoundingClientRect();
  const cw = Math.max(1, Math.ceil(panelRect.width));
  const ch = Math.max(1, Math.ceil(panelRect.height));

  const targets: Array<{ x: number; y: number; r: number; shade: number }> = [];

  if (panelRect.width > 8 && panelRect.height > 8) {
    const off = document.createElement('canvas');
    off.width = cw;
    off.height = ch;
    const ctx = off.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      // 1. Rasterize structural horizontal/vertical layout lines
      const lines = panelEl.querySelectorAll<HTMLElement>('[data-morph-line]');
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      lines.forEach((lineEl) => {
        const lr = lineEl.getBoundingClientRect();
        if (lr.width <= 0 && lr.height <= 0) return;
        const lx = lr.left - panelRect.left;
        const ly = lr.top - panelRect.top;
        if (ly > ch || ly + lr.height < 0) return;
        ctx.fillRect(lx, ly, Math.max(2, lr.width), Math.max(2, lr.height));
      });

      // 2. Rasterize card/button frame borders
      const boxes = panelEl.querySelectorAll<HTMLElement>('[data-morph-box]');
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 2;
      boxes.forEach((boxEl) => {
        const br = boxEl.getBoundingClientRect();
        if (br.width <= 2 || br.height <= 2) return;
        const bx = br.left - panelRect.left;
        const by = br.top - panelRect.top;
        if (by > ch || by + br.height < 0) return;
        ctx.strokeRect(bx + 1, by + 1, br.width - 2, br.height - 2);
      });

      // 3. Rasterize every character at its exact wrapped DOM pixel rect
      const textEls = panelEl.querySelectorAll<HTMLElement>('[data-morph-text]');
      const range = document.createRange();
      textEls.forEach((el) => {
        const cs = window.getComputedStyle(el);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.fillStyle = cs.color || '#ffffff';
        ctx.textBaseline = 'top';

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode() as Text | null;
        while (node) {
          const text = node.nodeValue || '';
          for (let c = 0; c < text.length; c++) {
            const chStr = text[c];
            if (!chStr || /\s/.test(chStr)) continue;
            range.setStart(node, c);
            range.setEnd(node, c + 1);
            const cr = range.getBoundingClientRect();
            if (
              cr.width > 0 &&
              cr.height > 0 &&
              cr.bottom >= panelRect.top &&
              cr.top <= panelRect.bottom
            ) {
              ctx.fillText(chStr, cr.left - panelRect.left, cr.top - panelRect.top);
            }
          }
          node = walker.nextNode() as Text | null;
        }
      });

      const pixels = ctx.getImageData(0, 0, cw, ch).data;
      const step = 2;
      for (let y = 0; y < ch; y += step) {
        for (let x = 0; x < cw; x += step) {
          const idx = (y * cw + x) * 4;
          const a = pixels[idx + 3];
          if (a < 45) continue;
          const luma =
            ((pixels[idx] * 77 + pixels[idx + 1] * 150 + pixels[idx + 2] * 29) >> 8) / 255;
          const alphaNorm = a / 255;
          targets.push({
            x: panelRect.left + x + 0.5,
            y: panelRect.top + y + 0.5,
            r: 0.78 + alphaNorm * 0.42,
            shade: Math.max(0.35, luma * alphaNorm),
          });
        }
      }
    }
  }

  // Fallback targets inside panel bounds if measurement yielded nothing
  if (targets.length === 0) {
    const cx = panelRect.left + cw * 0.5;
    const cy = panelRect.top + ch * 0.5;
    for (let i = 0; i < 64; i++) {
      const ang = (i / 64) * Math.PI * 2;
      targets.push({
        x: cx + Math.cos(ang) * 120,
        y: cy + Math.sin(ang) * 80,
        r: 1.0,
        shade: 0.85,
      });
    }
  }

  const { scaleX, scaleY, drawX, drawY } = transform;
  const goatCx = drawX + field.cropW * 0.5 * scaleX;
  const goatCy = drawY + field.cropH * 0.5 * scaleY;
  const maxDist = Math.max(1, Math.hypot(field.cropW * 0.5 * scaleX, field.cropH * 0.5 * scaleY));
  const scaleFactor = Math.max(0.65, viewportW / 1440);

  // Use ~55% of goat dots (at least targets.length) to form crisp lines/typography;
  // excess dots scatter and fade cleanly mid-flight.
  const keepCount = Math.min(count, Math.max(targets.length, Math.floor(count * 0.55)));
  const keepStride = count / keepCount;

  // Pick evenly distributed indices from the goat and sort spatially so streams flow cleanly
  const keptIndices = new Int32Array(keepCount);
  const isKept = new Uint8Array(count);
  for (let k = 0; k < keepCount; k++) {
    const idx = Math.min(count - 1, Math.floor(k * keepStride));
    keptIndices[k] = idx;
    isKept[idx] = 1;
  }

  keptIndices.sort((a, b) => {
    const ay = field.staticData[a * 4 + 1] * 0.75 + field.staticData[a * 4] * 0.25;
    const by = field.staticData[b * 4 + 1] * 0.75 + field.staticData[b * 4] * 0.25;
    return ay - by;
  });

  // Targets are already scanned top-to-bottom, left-to-right!
  for (let k = 0; k < keepCount; k++) {
    const i = keptIndices[k];
    const tIdx = Math.min(targets.length - 1, Math.floor((k / keepCount) * targets.length));
    const tgt = targets[tIdx];
    const tp = i * 4;
    const jx = (hash01(i, 11) - 0.5) * 0.8;
    const jy = (hash01(i, 17) - 0.5) * 0.8;
    targetData[tp] = tgt.x + jx;
    targetData[tp + 1] = tgt.y + jy;
    targetData[tp + 2] = tgt.r;
    targetData[tp + 3] = tgt.shade;
  }

  for (let i = 0; i < count; i++) {
    const sp = i * 4;
    const gx = drawX + field.staticData[sp] * scaleX;
    const gy = drawY + field.staticData[sp + 1] * scaleY;

    const dx = gx - goatCx;
    const dy = gy - goatCy;
    const dist = Math.hypot(dx, dy);
    const nx = dist > 0.001 ? dx / dist : Math.cos(i);
    const ny = dist > 0.001 ? dy / dist : Math.sin(i);

    const h1 = hash01(i, 1);
    const h2 = hash01(i, 2);
    const h3 = hash01(i, 3);

    const burstMag = (95 + h1 * 230) * scaleFactor;
    const swirl = (h2 - 0.5) * 165 * scaleFactor;

    burstData[sp] = nx * burstMag - ny * swirl;
    burstData[sp + 1] = ny * burstMag + nx * swirl;
    const radialNorm = Math.min(1, dist / maxDist);
    burstData[sp + 2] = Math.min(1, radialNorm * 0.55 + h3 * 0.45);
    burstData[sp + 3] = h3;

    if (!isKept[i]) {
      // Excess particles scatter outward slightly beyond panel and vanish mid-flight
      targetData[sp] = Math.max(0, Math.min(viewportW, gx + burstData[sp] * 1.1));
      targetData[sp + 1] = Math.max(0, Math.min(viewportH, gy + burstData[sp + 1] * 1.1));
      targetData[sp + 2] = 0;
      targetData[sp + 3] = 0.7;
    }
  }

  return { targetData, burstData };
}

