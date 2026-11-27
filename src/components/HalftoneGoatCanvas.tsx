import React, { useEffect, useRef } from 'react';
import {
  buildDotFieldFromPlate,
  buildSectionMorphTargets,
  DEFAULT_PHYSICS_PARAMS,
  DEFAULT_VISUAL_PARAMS,
  DeScreenedPlate,
  extractDeScreenedPlate,
  GoatTransform,
  HalftoneDotField,
  HalftonePhysicsParams,
  HalftoneVisualParams,
  MorphBuffers,
  stepHalftonePhysics,
} from '../utils/halftoneDots';

export type MorphSection = 'profile' | 'works' | null;

const HALFTONE_SOURCE_URL = '/assets/aistudio/cloudgoat-halftone_b0873604.jpg';
const PHOTO_SOURCE_URL = '/assets/aistudio/image_4aebe5de.png';

const VERTEX_SHADER_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_base;   // x, y, r, shade in plate coords
layout(location = 2) in vec3 a_dyn;    // offsetX, offsetY, scale
layout(location = 3) in vec4 a_target; // screenX, screenY, r, shade
layout(location = 4) in vec4 a_burst;  // burstX, burstY, delay, seed
layout(location = 5) in vec4 a_from;   // screenX, screenY, r, shade (for section-to-section morph)

uniform vec2 u_resolution;
uniform vec2 u_drawOrigin;
uniform vec2 u_scale;
uniform float u_dotScale;
uniform float u_morph;
uniform float u_particleAlpha;
uniform float u_useFrom;

out vec2 v_local;
out float v_radius;
out float v_shade;
out float v_alphaMul;

void main() {
  vec2 goatPos = u_drawOrigin + (a_base.xy + a_dyn.xy) * u_scale;
  float goatR = a_base.z * u_dotScale * a_dyn.z;
  float goatShade = a_base.w;

  vec2 startPos = u_useFrom > 0.5 ? a_from.xy : goatPos;
  float startR = u_useFrom > 0.5 ? a_from.z : goatR;
  float startShade = u_useFrom > 0.5 ? a_from.w : goatShade;

  vec2 centerPx = startPos;
  float radius = startR;
  float shade = startShade;
  float alphaMul = u_particleAlpha;

  if (u_morph > 0.0001) {
    float delay = a_burst.z * 0.20;
    float t = clamp((u_morph - delay) / 0.80, 0.0, 1.0);
    float ease = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    float arcT = pow(t, 0.62);
    float burstEnv = pow(max(0.0, sin(3.14159265 * arcT)), 1.35);

    centerPx = mix(startPos, a_target.xy, ease) + a_burst.xy * burstEnv;

    float targetR = a_target.z;
    float flightR = max(startR, 1.15);
    float baseMixR = mix(startR, targetR, ease);
    radius = mix(baseMixR, flightR, burstEnv * 0.65);

    shade = clamp(mix(startShade, a_target.w, ease) + burstEnv * 0.25, 0.0, 1.0);

    if (targetR <= 0.01) {
      alphaMul *= (1.0 - smoothstep(0.52, 0.94, t));
    }
  }

  float padRadius = radius + 1.0;
  vec2 posPx = centerPx + a_corner * padRadius;

  vec2 ndc = (posPx / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);

  v_local = a_corner * padRadius;
  v_radius = radius;
  v_shade = shade;
  v_alphaMul = alphaMul;
}
`;

const FRAGMENT_SHADER_SRC = `#version 300 es
precision highp float;

in vec2 v_local;
in float v_radius;
in float v_shade;
in float v_alphaMul;

out vec4 outColor;

void main() {
  if (v_radius <= 0.01 || v_alphaMul <= 0.004) discard;
  float dist = length(v_local);
  float aa = max(0.25, fwidth(dist));
  float alpha = (1.0 - smoothstep(v_radius - aa * 0.5, v_radius + aa * 0.5, dist)) * v_alphaMul;
  if (alpha <= 0.004) discard;
  outColor = vec4(vec3(v_shade), alpha);
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    return null;
  }
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function smoothstep01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function snapshotCurrentParticles(
  field: HalftoneDotField,
  transform: GoatTransform,
  progress: number,
  useFrom: boolean,
  fromData: Float32Array | null,
  buffers: MorphBuffers,
): Float32Array {
  const count = field.count;
  const out = new Float32Array(count * 4);
  const { staticData, dynData } = field;
  const { scaleX, scaleY, dotScale, drawX, drawY } = transform;
  const { targetData, burstData } = buffers;

  for (let i = 0; i < count; i++) {
    const sp = i * 4;
    const dp = i * 3;
    const sx = useFrom && fromData
      ? fromData[sp]
      : drawX + (staticData[sp] + dynData[dp]) * scaleX;
    const sy = useFrom && fromData
      ? fromData[sp + 1]
      : drawY + (staticData[sp + 1] + dynData[dp + 1]) * scaleY;
    const sr = useFrom && fromData
      ? fromData[sp + 2]
      : staticData[sp + 2] * dotScale * dynData[dp + 2];
    const ss = useFrom && fromData ? fromData[sp + 3] : staticData[sp + 3];

    if (progress <= 0.0001) {
      out[sp] = sx;
      out[sp + 1] = sy;
      out[sp + 2] = sr;
      out[sp + 3] = ss;
      continue;
    }

    const delay = burstData[sp + 2] * 0.2;
    const t = Math.max(0, Math.min(1, (progress - delay) / 0.8));
    const ease = t * t * t * (t * (t * 6 - 15) + 10);
    const arcT = Math.pow(t, 0.62);
    const burstEnv = Math.pow(Math.max(0, Math.sin(Math.PI * arcT)), 1.35);

    const tx = targetData[sp];
    const ty = targetData[sp + 1];
    const tr = targetData[sp + 2];
    const ts = targetData[sp + 3];

    out[sp] = sx + (tx - sx) * ease + burstData[sp] * burstEnv;
    out[sp + 1] = sy + (ty - sy) * ease + burstData[sp + 1] * burstEnv;
    const flightR = Math.max(sr, 1.15);
    const baseMixR = sr + (tr - sr) * ease;
    out[sp + 2] = baseMixR + (flightR - baseMixR) * burstEnv * 0.65;
    out[sp + 3] = Math.max(0, Math.min(1, ss + (ts - ss) * ease + burstEnv * 0.25));
  }

  return out;
}

interface HalftoneGoatCanvasProps {
  morphSection?: MorphSection;
  sectionPanelRef?: React.RefObject<HTMLDivElement | null>;
  onReverseMorphComplete?: () => void;
  visualParams?: HalftoneVisualParams;
  physicsParams?: HalftonePhysicsParams;
  onDotCountChange?: (count: number) => void;
}

export const HalftoneGoatCanvas: React.FC<HalftoneGoatCanvasProps> = ({
  morphSection = null,
  sectionPanelRef,
  onReverseMorphComplete,
  visualParams = DEFAULT_VISUAL_PARAMS,
  physicsParams = DEFAULT_PHYSICS_PARAMS,
  onDotCountChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const plateRef = useRef<DeScreenedPlate | null>(null);
  const fieldRef = useRef<HalftoneDotField | null>(null);
  const morphBuffersRef = useRef<MorphBuffers | null>(null);
  const fromDataRef = useRef<Float32Array | null>(null);

  const rebuildFnRef = useRef<(() => void) | null>(null);
  const triggerMorphFnRef = useRef<((section: MorphSection) => void) | null>(null);

  const visualParamsRef = useRef<HalftoneVisualParams>(visualParams);
  const physicsParamsRef = useRef<HalftonePhysicsParams>(physicsParams);
  const onDotCountChangeRef = useRef<((count: number) => void) | undefined>(onDotCountChange);
  const sectionPanelRefStore = useRef<React.RefObject<HTMLDivElement | null> | undefined>(
    sectionPanelRef,
  );
  const onReverseMorphCompleteRef = useRef<(() => void) | undefined>(onReverseMorphComplete);

  const morphStateRef = useRef<{
    targetSection: MorphSection;
    progress: number;
    particleAlpha: number;
    useFrom: boolean;
    lastTime: number;
    needsTargetBuild: boolean;
  }>({
    targetSection: morphSection,
    progress: 0,
    particleAlpha: 1,
    useFrom: false,
    lastTime: 0,
    needsTargetBuild: false,
  });

  const pointerRef = useRef<{
    screenX: number;
    screenY: number;
    active: boolean;
  }>({
    screenX: -9999,
    screenY: -9999,
    active: false,
  });
  const rippleRef = useRef<{
    plateX: number;
    plateY: number;
    startTime: number;
  }>({
    plateX: 0,
    plateY: 0,
    startTime: -1,
  });
  const rafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef<boolean>(false);

  useEffect(() => {
    physicsParamsRef.current = physicsParams;
  }, [physicsParams]);

  useEffect(() => {
    onDotCountChangeRef.current = onDotCountChange;
  }, [onDotCountChange]);

  useEffect(() => {
    sectionPanelRefStore.current = sectionPanelRef;
  }, [sectionPanelRef]);

  useEffect(() => {
    onReverseMorphCompleteRef.current = onReverseMorphComplete;
  }, [onReverseMorphComplete]);

  useEffect(() => {
    visualParamsRef.current = visualParams;
    rebuildFnRef.current?.();
  }, [visualParams]);

  useEffect(() => {
    triggerMorphFnRef.current?.(morphSection);
  }, [morphSection]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onMqChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener('change', onMqChange);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    let program: WebGLProgram | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    let quadBuf: WebGLBuffer | null = null;
    let staticBuf: WebGLBuffer | null = null;
    let dynBuf: WebGLBuffer | null = null;
    let targetBuf: WebGLBuffer | null = null;
    let burstBuf: WebGLBuffer | null = null;
    let fromBuf: WebGLBuffer | null = null;

    let uResolutionLoc: WebGLUniformLocation | null = null;
    let uDrawOriginLoc: WebGLUniformLocation | null = null;
    let uScaleLoc: WebGLUniformLocation | null = null;
    let uDotScaleLoc: WebGLUniformLocation | null = null;
    let uMorphLoc: WebGLUniformLocation | null = null;
    let uParticleAlphaLoc: WebGLUniformLocation | null = null;
    let uUseFromLoc: WebGLUniformLocation | null = null;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const initGlResources = () => {
      program = createProgram(gl);
      if (!program) return false;

      uResolutionLoc = gl.getUniformLocation(program, 'u_resolution');
      uDrawOriginLoc = gl.getUniformLocation(program, 'u_drawOrigin');
      uScaleLoc = gl.getUniformLocation(program, 'u_scale');
      uDotScaleLoc = gl.getUniformLocation(program, 'u_dotScale');
      uMorphLoc = gl.getUniformLocation(program, 'u_morph');
      uParticleAlphaLoc = gl.getUniformLocation(program, 'u_particleAlpha');
      uUseFromLoc = gl.getUniformLocation(program, 'u_useFrom');

      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);

      quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      staticBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf);
      if (fieldRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fieldRef.current.staticData, gl.STATIC_DRAW);
      }
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);

      dynBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      if (fieldRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fieldRef.current.dynData, gl.DYNAMIC_DRAW);
      }
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(2, 1);

      targetBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, targetBuf);
      if (morphBuffersRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, morphBuffersRef.current.targetData, gl.DYNAMIC_DRAW);
      } else if (fieldRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fieldRef.current.count * 16, gl.DYNAMIC_DRAW);
      }
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(3, 1);

      burstBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, burstBuf);
      if (morphBuffersRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, morphBuffersRef.current.burstData, gl.DYNAMIC_DRAW);
      } else if (fieldRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fieldRef.current.count * 16, gl.DYNAMIC_DRAW);
      }
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(4, 1);

      fromBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, fromBuf);
      if (fromDataRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fromDataRef.current, gl.DYNAMIC_DRAW);
      } else if (fieldRef.current) {
        gl.bufferData(gl.ARRAY_BUFFER, fieldRef.current.count * 16, gl.DYNAMIC_DRAW);
      }
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(5, 1);

      gl.bindVertexArray(null);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(20 / 255, 20 / 255, 20 / 255, 1.0);

      return true;
    };

    const uploadFieldToGpu = (field: HalftoneDotField) => {
      if (!staticBuf || !dynBuf || !targetBuf || !burstBuf || !fromBuf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf);
      gl.bufferData(gl.ARRAY_BUFFER, field.staticData, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
      gl.bufferData(gl.ARRAY_BUFFER, field.dynData, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, targetBuf);
      gl.bufferData(gl.ARRAY_BUFFER, field.count * 16, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, burstBuf);
      gl.bufferData(gl.ARRAY_BUFFER, field.count * 16, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, fromBuf);
      gl.bufferData(gl.ARRAY_BUFFER, field.count * 16, gl.DYNAMIC_DRAW);
      morphBuffersRef.current = null;
      fromDataRef.current = null;
    };

    const uploadMorphToGpu = (buffers: MorphBuffers) => {
      if (!targetBuf || !burstBuf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, targetBuf);
      gl.bufferData(gl.ARRAY_BUFFER, buffers.targetData, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, burstBuf);
      gl.bufferData(gl.ARRAY_BUFFER, buffers.burstData, gl.DYNAMIC_DRAW);
    };

    const uploadFromToGpu = (fromData: Float32Array) => {
      if (!fromBuf) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, fromBuf);
      gl.bufferData(gl.ARRAY_BUFFER, fromData, gl.DYNAMIC_DRAW);
    };

    const getTransform = (field: HalftoneDotField): GoatTransform => {
      const isMobile = width < 768;
      if (isMobile) {
        const scale = Math.max((width * 0.96) / field.cropW, (height * 0.56) / field.cropH);
        const drawW = field.cropW * scale;
        const drawH = field.cropH * scale;
        return {
          scaleX: scale,
          scaleY: scale,
          dotScale: scale,
          drawX: width - drawW,
          drawY: height - drawH,
        };
      }

      const scaleByHeight = height / field.cropH;
      const maxAllowedW = width * 0.67;
      const candidateW = field.cropW * scaleByHeight;
      const drawW = Math.min(candidateW, maxAllowedW);
      const scaleX = drawW / field.cropW;
      const scaleY = scaleByHeight;

      return {
        scaleX,
        scaleY,
        dotScale: Math.min(scaleX, scaleY),
        drawX: width - drawW,
        drawY: 0,
      };
    };

    const prepareSectionTargets = (): boolean => {
      const field = fieldRef.current;
      const panelEl = sectionPanelRefStore.current?.current;
      if (!field || !panelEl) return false;
      const buffers = buildSectionMorphTargets(
        field,
        getTransform(field),
        panelEl,
        width || window.innerWidth,
        height || window.innerHeight,
      );
      morphBuffersRef.current = buffers;
      uploadMorphToGpu(buffers);
      return true;
    };

    const renderGl = (uploadDyn: boolean) => {
      if (width <= 0 || height <= 0 || canvas.width <= 0 || canvas.height <= 0) return;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const field = fieldRef.current;
      if (!field || !program || !vao || field.count === 0) return;

      if (uploadDyn && dynBuf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, dynBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.dynData);
      }

      const { scaleX, scaleY, dotScale, drawX, drawY } = getTransform(field);
      const ms = morphStateRef.current;

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(uResolutionLoc, width, height);
      gl.uniform2f(uDrawOriginLoc, drawX, drawY);
      gl.uniform2f(uScaleLoc, scaleX, scaleY);
      gl.uniform1f(uDotScaleLoc, dotScale);
      gl.uniform1f(uMorphLoc, ms.progress);
      gl.uniform1f(uParticleAlphaLoc, ms.particleAlpha);
      gl.uniform1f(uUseFromLoc, ms.useFrom ? 1.0 : 0.0);

      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, field.count);
      gl.bindVertexArray(null);
    };

    const rebuildDotsFromPlate = () => {
      const plate = plateRef.current;
      if (!plate) return;
      const field = buildDotFieldFromPlate(plate, visualParamsRef.current);
      fieldRef.current = field;
      onDotCountChangeRef.current?.(field.count);
      uploadFieldToGpu(field);
      if (morphStateRef.current.targetSection !== null) {
        prepareSectionTargets();
      }
      renderGl(false);
    };

    rebuildFnRef.current = rebuildDotsFromPlate;

    const resize = () => {
      const nextW = window.innerWidth || document.documentElement.clientWidth || 0;
      const nextH = window.innerHeight || document.documentElement.clientHeight || 0;
      if (nextW <= 0 || nextH <= 0) return;

      width = nextW;
      height = nextH;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      if (morphStateRef.current.targetSection !== null && morphStateRef.current.progress >= 0.95) {
        prepareSectionTargets();
      }
      renderGl(false);
    };

    const syncDomOpacity = (progress: number, isOpening: boolean) => {
      const panelEl = sectionPanelRefStore.current?.current;
      if (!panelEl) return;

      if (isOpening) {
        const fade = progress <= 0.78 ? 0 : smoothstep01((progress - 0.78) / 0.22);
        panelEl.style.opacity = String(fade);
        panelEl.style.pointerEvents = fade > 0.5 ? 'auto' : 'none';
        morphStateRef.current.particleAlpha = 1 - fade;
      } else {
        const fade = progress <= 0.8 ? 0 : smoothstep01((progress - 0.8) / 0.2);
        panelEl.style.opacity = String(fade);
        panelEl.style.pointerEvents = 'none';
        morphStateRef.current.particleAlpha = 1 - fade * 0.85;
      }
    };

    const tick = (now: number) => {
      const field = fieldRef.current;
      if (!field) {
        rafRef.current = null;
        return;
      }

      const ms = morphStateRef.current;
      const dt = ms.lastTime > 0 ? Math.min(0.05, (now - ms.lastTime) / 1000) : 1 / 60;
      ms.lastTime = now;

      let morphRunning = false;

      if (ms.targetSection !== null) {
        if (ms.needsTargetBuild) {
          if (prepareSectionTargets()) {
            ms.needsTargetBuild = false;
          }
        }
        if (ms.progress < 1) {
          ms.progress = Math.min(1, ms.progress + dt / 1.05);
          syncDomOpacity(ms.progress, true);
          morphRunning = ms.progress < 1;
        } else {
          syncDomOpacity(1, true);
        }
      } else if (ms.progress > 0) {
        ms.progress = Math.max(0, ms.progress - dt / 0.9);
        syncDomOpacity(ms.progress, false);
        if (ms.progress > 0) {
          morphRunning = true;
        } else {
          ms.useFrom = false;
          ms.particleAlpha = 1;
          onReverseMorphCompleteRef.current?.();
        }
      }

      let physicsRunning = false;
      if (ms.progress === 0 && ms.targetSection === null) {
        const { scaleX, scaleY, drawX, drawY } = getTransform(field);
        const ptr = pointerRef.current;
        const platePtrX = (ptr.screenX - drawX) / scaleX;
        const platePtrY = (ptr.screenY - drawY) / scaleY;
        const phys = physicsParamsRef.current;
        const pad = Math.max(90, phys.hoverRadius);

        const pointerInsideGoat =
          ptr.active &&
          !reducedMotionRef.current &&
          platePtrX >= -pad &&
          platePtrX <= field.cropW + pad &&
          platePtrY >= -pad &&
          platePtrY <= field.cropH + pad;

        const rippleAge =
          rippleRef.current.startTime >= 0 ? (now - rippleRef.current.startTime) / 1000 : -1;

        physicsRunning = stepHalftonePhysics(field, {
          pointerX: platePtrX,
          pointerY: platePtrY,
          pointerActive: pointerInsideGoat,
          hoverRadius: phys.hoverRadius,
          repelStrength: phys.repelStrength,
          scaleBoost: phys.scaleBoost,
          springStiffness: 0.15,
          damping: 0.78,
          rippleX: rippleRef.current.plateX,
          rippleY: rippleRef.current.plateY,
          rippleAge,
        });
      }

      renderGl(physicsRunning);

      if (morphRunning || physicsRunning) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rippleRef.current.startTime = -1;
        ms.lastTime = 0;
        rafRef.current = null;
      }
    };

    const startLoop = () => {
      if (rafRef.current === null) {
        morphStateRef.current.lastTime = performance.now();
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const triggerMorph = (nextSection: MorphSection) => {
      const ms = morphStateRef.current;
      const prevSection = ms.targetSection;
      ms.targetSection = nextSection;

      if (reducedMotionRef.current) {
        ms.progress = nextSection !== null ? 1 : 0;
        ms.particleAlpha = nextSection !== null ? 0 : 1;
        ms.useFrom = false;
        ms.needsTargetBuild = false;
        const panelEl = sectionPanelRefStore.current?.current;
        if (panelEl) {
          panelEl.style.opacity = nextSection !== null ? '1' : '0';
          panelEl.style.pointerEvents = nextSection !== null ? 'auto' : 'none';
        }
        if (nextSection === null) {
          onReverseMorphCompleteRef.current?.();
        }
        renderGl(false);
        return;
      }

      if (nextSection !== null) {
        pointerRef.current.active = false;
        const panelEl = sectionPanelRefStore.current?.current;
        if (panelEl) {
          panelEl.style.opacity = '0';
          panelEl.style.pointerEvents = 'none';
        }

        const field = fieldRef.current;
        const prevBuffers = morphBuffersRef.current;
        if (prevSection !== null && prevSection !== nextSection && field && prevBuffers && ms.progress > 0.001) {
          // Section A -> Section B: snapshot current positions as starting points
          const snap = snapshotCurrentParticles(
            field,
            getTransform(field),
            ms.progress,
            ms.useFrom,
            fromDataRef.current,
            prevBuffers,
          );
          fromDataRef.current = snap;
          uploadFromToGpu(snap);
          ms.useFrom = true;
          ms.progress = 0;
          ms.particleAlpha = 1;
        } else {
          ms.useFrom = false;
          ms.particleAlpha = 1;
        }

        ms.needsTargetBuild = !prepareSectionTargets();
        startLoop();
      } else {
        ms.needsTargetBuild = false;
        const field = fieldRef.current;
        const prevBuffers = morphBuffersRef.current;
        if (ms.progress > 0) {
          if (ms.useFrom && field && prevBuffers) {
            if (ms.progress >= 0.999) {
              // At progress=1, targetPos === currentPos so switching origin back to goat is seamless
              ms.useFrom = false;
            } else {
              const snap = snapshotCurrentParticles(
                field,
                getTransform(field),
                ms.progress,
                true,
                fromDataRef.current,
                prevBuffers,
              );
              const updatedBuffers: MorphBuffers = {
                targetData: snap,
                burstData: prevBuffers.burstData,
              };
              morphBuffersRef.current = updatedBuffers;
              uploadMorphToGpu(updatedBuffers);
              ms.useFrom = false;
              ms.progress = 1;
            }
          }
          const panelEl = sectionPanelRefStore.current?.current;
          if (panelEl) {
            panelEl.style.pointerEvents = 'none';
          }
          startLoop();
        } else {
          ms.useFrom = false;
          ms.particleAlpha = 1;
          onReverseMorphCompleteRef.current?.();
          renderGl(false);
        }
      }
    };

    triggerMorphFnRef.current = triggerMorph;

    const onPointerMove = (e: PointerEvent) => {
      if (
        reducedMotionRef.current ||
        morphStateRef.current.targetSection !== null ||
        morphStateRef.current.progress > 0
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-debugger-widget]')) {
        pointerRef.current.active = false;
        return;
      }
      pointerRef.current.screenX = e.clientX;
      pointerRef.current.screenY = e.clientY;
      pointerRef.current.active = true;
      startLoop();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (
        reducedMotionRef.current ||
        morphStateRef.current.targetSection !== null ||
        morphStateRef.current.progress > 0
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target.closest('button, a, input, textarea, [role="dialog"], [data-debugger-widget]')
      ) {
        return;
      }
      const field = fieldRef.current;
      if (!field) return;
      const { scaleX, scaleY, drawX, drawY } = getTransform(field);
      rippleRef.current = {
        plateX: (e.clientX - drawX) / scaleX,
        plateY: (e.clientY - drawY) / scaleY,
        startTime: performance.now(),
      };
      startLoop();
    };

    const onPointerLeave = () => {
      pointerRef.current.active = false;
      if (morphStateRef.current.progress === 0) {
        startLoop();
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const onContextRestored = () => {
      if (initGlResources() && fieldRef.current) {
        uploadFieldToGpu(fieldRef.current);
        if (fromDataRef.current) {
          uploadFromToGpu(fromDataRef.current);
        }
        if (morphStateRef.current.targetSection !== null) {
          prepareSectionTargets();
        }
        renderGl(false);
      }
    };

    initGlResources();
    resize();

    let loadedHalftone: HTMLImageElement | null = null;
    let loadedPhoto: HTMLImageElement | null = null;

    const tryBuildPlate = () => {
      if (!loadedHalftone) return;
      const plate = extractDeScreenedPlate(loadedHalftone, loadedPhoto);
      if (plate) {
        plateRef.current = plate;
        rebuildDotsFromPlate();
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedHalftone = img;
      tryBuildPlate();
    };
    img.src = HALFTONE_SOURCE_URL;

    const photoImg = new Image();
    photoImg.crossOrigin = 'anonymous';
    photoImg.onload = () => {
      loadedPhoto = photoImg;
      if (loadedHalftone) {
        tryBuildPlate();
      }
    };
    photoImg.src = PHOTO_SOURCE_URL;

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(document.documentElement);

    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('mouseleave', onPointerLeave);

    return () => {
      rebuildFnRef.current = null;
      triggerMorphFnRef.current = null;
      mq.removeEventListener('change', onMqChange);
      ro?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mouseleave', onPointerLeave);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (quadBuf) gl.deleteBuffer(quadBuf);
      if (staticBuf) gl.deleteBuffer(staticBuf);
      if (dynBuf) gl.deleteBuffer(dynBuf);
      if (targetBuf) gl.deleteBuffer(targetBuf);
      if (burstBuf) gl.deleteBuffer(burstBuf);
      if (fromBuf) gl.deleteBuffer(fromBuf);
      if (vao) gl.deleteVertexArray(vao);
      if (program) gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none z-0"
    />
  );
};
