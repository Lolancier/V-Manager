import { useEffect, useRef, useState } from "react";
import {
  activeModel, EXPRESSION_PARAMS, FaceParams,
  IDLE_PROP_ACTIONS, IDLE_ACTION_INTERVAL,
  MOOD_LABEL_MAP, MoodParamPreset, ParamOscillation, ParamTarget, PetMood,
  pickMoodCombo,
} from "./live2dConfig";

type Live2DPreviewProps = {
  mood: PetMood;
  scale: number;
  activeExpressionSet: Set<string>;
  faceParams: FaceParams | null;
};

// ---- ParameterAnimator ----
// NOTE: The animator returns computed values as a Map<string, number> instead of
// calling setParameterValueById directly, because Cubism 5's CubismModel expects
// CubismIdHandle objects, not plain strings (getParameterIndex uses != comparison
// which fails when comparing string vs CubismId). All values are applied via
// LAppModel.setParamOverrides() which does proper CubismIdHandle conversion.

const INTERPOLATE_SPEED = 4.0;

class ParameterAnimator {
  private currentValues: Map<string, number> = new Map();
  private targets: ParamTarget[] = [];
  private oscillations: ParamOscillation[] = [];
  private expressionName: string | null = null;
  private lastExpression: string | null = null;
  private lastTimestamp = 0;
  private elapsed = 0;

  applyPreset(preset: MoodParamPreset) {
    this.targets = preset.targets ?? [];
    this.oscillations = preset.oscillations ?? [];
    this.expressionName = preset.expression ?? null;
    this.elapsed = 0;
    this.lastTimestamp = 0;
  }

  getPendingExpression(): string | null {
    if (this.expressionName !== this.lastExpression) {
      const e = this.expressionName;
      this.lastExpression = e;
      return e;
    }
    return null;
  }

  /** Compute animated values for this frame. Returns the merged parameter map. */
  update(timestampMs: number): Map<string, number> {
    const dt = this.lastTimestamp > 0 ? Math.min((timestampMs - this.lastTimestamp) / 1000, 0.1) : 0.016;
    this.lastTimestamp = timestampMs;
    this.elapsed += dt;

    const result = new Map<string, number>();

    for (const t of this.targets) {
      const weight = (t.weight ?? 1) * Math.min(INTERPOLATE_SPEED * dt, 1);
      // Simple exponential ease toward target
      const prev = this.currentValues.get(t.id) ?? 0;
      const next = prev + (t.value - prev) * weight;
      this.currentValues.set(t.id, next);
      result.set(t.id, next);
    }
    for (const o of this.oscillations) {
      const v = o.center + o.amplitude * Math.sin(this.elapsed * 1000 * 2 * Math.PI / o.periodMs);
      this.currentValues.set(o.id, v);
      result.set(o.id, v);
    }

    return result;
  }

  reset() {
    this.currentValues.clear();
    this.targets = []; this.oscillations = [];
    this.expressionName = null; this.lastExpression = null;
    this.lastTimestamp = 0; this.elapsed = 0;
  }
}

// ---- Component ----

function ensureScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const el = document.querySelector(`script[data-src="${src}"]`) as HTMLScriptElement | null;
    if (el) {
      if (window.Live2DCubismCore) resolve();
      else { el.addEventListener("load", () => resolve(), { once: true }); el.addEventListener("error", () => reject(new Error(`加载失败：${src}`)), { once: true }); }
      return;
    }
    const s = document.createElement("script"); s.src = src; s.async = true; s.dataset.src = src;
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`加载失败：${src}`));
    document.head.appendChild(s);
  });
}

const moodLabelMap: Record<PetMood, string> = MOOD_LABEL_MAP;

export default function Live2DPreview({ mood, scale, activeExpressionSet, faceParams }: Live2DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const animatorRef = useRef(new ParameterAnimator());
  const idleTimerRef = useRef<number | null>(null);
  const idleClearRef = useRef<number | null>(null);
  const prevMoodRef = useRef<PetMood>("idle");
  const activeExprRef = useRef<Set<string>>(new Set());     // manual panel
  const moodComboRef = useRef<string[]>([]);                 // mood-driven combo
  const idlePropRef = useRef<string | null>(null);           // idle random prop
  const prevExprRef = useRef<Set<string>>(new Set());
  const faceRef = useRef<FaceParams | null>(null);           // LLM face tag
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("正在启动...");

  // Sync activeExpressionSet to ref (manual panel toggles)
  useEffect(() => {
    activeExprRef.current = activeExpressionSet;
  }, [activeExpressionSet]);

  // Sync faceParams to ref
  useEffect(() => {
    faceRef.current = faceParams;
  }, [faceParams]);

  // ---- SDK bootstrap ----
  useEffect(() => {
    let disposed = false;
    async function boot() {
      try {
        setLoadState("loading"); setMsg("正在加载 Cubism Core...");
        await ensureScript("/vendor/live2d/live2dcubismcore.min.js");
        const [{ CubismFramework, LogLevel, Option }, { LAppPal }, { LAppSubdelegate }] = await Promise.all([
          import("@framework/live2dcubismframework"), import("./official/lapppal"), import("./official/lappsubdelegate")
        ]);
        if (!CubismFramework.isStarted()) { const o = new Option(); o.loggingLevel = LogLevel.LogLevel_Warning; o.logFunction = LAppPal.printMessage; CubismFramework.startUp(o); }
        if (!CubismFramework.isInitialized()) CubismFramework.initialize();
        if (disposed || !canvasRef.current) return;

        const rt = new LAppSubdelegate();
        if (!rt.initialize(canvasRef.current)) throw new Error("初始化失败");
        runtimeRef.current = { runtime: rt, pal: LAppPal, framework: CubismFramework, OptionCtor: Option, LogLevel };

        // Pointer events
        const cvs = canvasRef.current;
        const pd = (e: PointerEvent) => rt.onPointBegan(e.pageX, e.pageY);
        const pm = (e: PointerEvent) => rt.onPointMoved(e.pageX, e.pageY);
        const pu = (e: PointerEvent) => rt.onPointEnded(e.pageX, e.pageY);
        const pc = (e: PointerEvent) => rt.onTouchCancel(e.pageX, e.pageY);
        cvs.addEventListener("pointerdown", pd); window.addEventListener("pointermove", pm);
        window.addEventListener("pointerup", pu); window.addEventListener("pointercancel", pc);
        cleanupRef.current = () => { cvs.removeEventListener("pointerdown", pd); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu); window.removeEventListener("pointercancel", pc); };

        // Initial preset
        animatorRef.current.applyPreset(activeModel.moodParams.idle);

        const loop = (ts: number) => {
          if (disposed || !runtimeRef.current) return;
          runtimeRef.current.pal.updateTime();

          const mgr = rt.getLive2DManager();
          const m = mgr?._models?.[0];

          // ---- Combinable expressions: merge all layers → overrides ----
          if (m) {
            const overrides = new Map<string, number>();

            // Layer 0: animator-computed values (mood preset targets/oscillations)
            // These come FIRST so that expression combos and face params can override.
            const animValues = animatorRef.current.update(ts);
            for (const [paramId, value] of animValues) {
              overrides.set(paramId, value);
            }

            // Layer 1: mood combo expressions (override animator)
            for (const exprName of moodComboRef.current) {
              const params = EXPRESSION_PARAMS[exprName];
              if (params) {
                for (const p of params) overrides.set(p.id, p.value);
              }
            }

            // Layer 1.5: idle random prop (only when mood=idle, auto-clears on mood change)
            const idleExpr = idlePropRef.current;
            if (idleExpr) {
              const params = EXPRESSION_PARAMS[idleExpr];
              if (params) {
                for (const p of params) overrides.set(p.id, p.value);
              }
            }

            // Layer 2: manual panel expressions (override mood)
            for (const exprName of activeExprRef.current) {
              const params = EXPRESSION_PARAMS[exprName];
              if (params) {
                for (const p of params) overrides.set(p.id, p.value);
              }
            }

            // Layer 3: LLM face params (fine-tune, highest priority)
            const face = faceRef.current;
            if (face) {
              for (const [paramId, value] of Object.entries(face)) {
                overrides.set(paramId, value);
              }
            }

            m.setParamOverrides(overrides);
          }
          // ---- /Combinable expressions ----

          runtimeRef.current.runtime.update();

          // Expression (mood-driven, via expression manager — used for motion-type effects)
          const expr = animatorRef.current.getPendingExpression();
          if (expr !== null && m) { try { if (expr) m.setExpression(expr); } catch {} }

          frameRef.current = window.requestAnimationFrame(loop);
        };
        frameRef.current = window.requestAnimationFrame(loop);

        setLoadState("ready"); setMsg("芊芊已载入");
      } catch (e) {
        setLoadState("error"); setMsg(e instanceof Error ? e.message : "初始化失败");
      }
    }
    boot();
    return () => {
      disposed = true; cleanupRef.current?.(); cleanupRef.current = null;
      if (frameRef.current !== null) { window.cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      animatorRef.current.reset();
      if (runtimeRef.current) { runtimeRef.current.runtime.release(); if (runtimeRef.current.framework.isInitialized()) { runtimeRef.current.framework.dispose(); runtimeRef.current.framework.cleanUp(); } runtimeRef.current = null; }
    };
  }, []);

  // ---- Mood → preset + combo ----
  useEffect(() => {
    if (!runtimeRef.current || loadState !== "ready") return;
    if (mood === prevMoodRef.current) return;
    prevMoodRef.current = mood;

    // 1. Apply parameter targets/oscillations
    const preset = activeModel.moodParams[mood];
    if (preset) animatorRef.current.applyPreset(preset);

    // 2. Pick and apply mood combo expressions
    const combo = pickMoodCombo(mood);
    moodComboRef.current = combo;
  }, [loadState, mood]);

  // ---- Combinable expression toggle: track changes for reset (reset handled by per-frame override rebuild) ----
  useEffect(() => {
    prevExprRef.current = new Set(activeExpressionSet);
  }, [activeExpressionSet]);

  // ---- Idle prop action cycle (uses override system, auto-clears on mood change) ----
  useEffect(() => {
    if (loadState !== "ready" || mood !== "idle") {
      idlePropRef.current = null;
      return;
    }

    const schedule = () => {
      const delay = IDLE_ACTION_INTERVAL.minMs + Math.random() * (IDLE_ACTION_INTERVAL.maxMs - IDLE_ACTION_INTERVAL.minMs);
      idleTimerRef.current = window.setTimeout(() => {
        const action = IDLE_PROP_ACTIONS[Math.floor(Math.random() * IDLE_PROP_ACTIONS.length)];
        const dur = action.minMs + Math.random() * (action.maxMs - action.minMs);
        idlePropRef.current = action.expr;
        idleClearRef.current = window.setTimeout(() => {
          idlePropRef.current = null;
          schedule();
        }, dur);
      }, delay);
    };
    schedule();
    return () => {
      idlePropRef.current = null;
      if (idleTimerRef.current !== null) { window.clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      if (idleClearRef.current !== null) { window.clearTimeout(idleClearRef.current); idleClearRef.current = null; }
    };
  }, [loadState, mood]);

  // ---- Visual offsets ----
  const extraScale = Math.max(0, scale - 1);
  const padT = Math.round(18 + extraScale * 110);
  const padL = Math.round(4 + extraScale * 40);
  const padR = Math.round(4 + extraScale * 20);
  const offX = Math.round(extraScale * 48);
  const offY = Math.round(extraScale * 190);

  return (
    <div className="live2d-card official-live2d-card" style={{ paddingTop: padT, paddingLeft: padL, paddingRight: padR }}>
      <div className="live2d-model-scale" style={{ transform: `translate(${offX}px, ${offY}px) scale(${scale})` }}>
        <canvas className="live2d-stage official-live2d-stage" ref={canvasRef} />
      </div>
      <div className="live2d-footer">
        <div><p className="eyebrow">{activeModel.name}</p><strong>{moodLabelMap[mood]}</strong></div>
        <span className={`pet-mood mood-${mood}`}>{moodLabelMap[mood]}</span>
      </div>
      <p className={`live2d-message ${loadState}`}>{msg}</p>
    </div>
  );
}
