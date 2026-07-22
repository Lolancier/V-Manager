import { useEffect, useRef, useState } from "react";
import {
  activeModel, EXPRESSION_PARAMS, FaceParams, LIVE2D_MODEL_PRESETS,
  IDLE_PROP_ACTIONS, IDLE_ACTION_INTERVAL,
  MOOD_LABEL_MAP, MoodParamPreset, ParamOscillation, ParamTarget, PetMood,
  pickMoodCombo,
} from "./live2dConfig";
import { resolvePublicAssetUrl } from "./publicAssetUrl";
import { Live2DParameterMixer } from "./Live2DParameterMixer";
import { getMoodPresetForModel, Live2DModelAdapter } from "./Live2DModelAdapter";

type Live2DPreviewProps = {
  mood: PetMood;
  modelId: string;
  modelName?: string;
  modelDirectory?: string;
  modelFileName?: string;
  activeExpressionSet: Set<string>;
  faceParams: FaceParams | null;
  speaking: boolean;
  mouseFollow?: boolean;
  onInteractionChange?: (interactive: boolean) => void;
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

export default function Live2DPreview({ mood, modelId, modelName, modelDirectory, modelFileName, activeExpressionSet, faceParams, speaking, mouseFollow = true, onInteractionChange }: Live2DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const animatorRef = useRef(new ParameterAnimator());
  const parameterMixerRef = useRef(new Live2DParameterMixer());
  const modelAdapterRef = useRef(new Live2DModelAdapter());
  const adapterSignatureRef = useRef("");
  const lastAdapterProbeRef = useRef(0);
  const lastNativeExpressionRef = useRef("");
  const idleTimerRef = useRef<number | null>(null);
  const idleClearRef = useRef<number | null>(null);
  const prevMoodRef = useRef<PetMood>("idle");
  const currentMoodRef = useRef<PetMood>(mood);
  const activeExprRef = useRef<Set<string>>(new Set());     // manual panel
  const moodComboRef = useRef<string[]>([]);                 // mood-driven combo
  const idlePropRef = useRef<string | null>(null);           // idle random prop
  const prevExprRef = useRef<Set<string>>(new Set());
  const faceRef = useRef<FaceParams | null>(null);           // LLM face tag
  const speakingRef = useRef(false);
  const interactionChangeRef = useRef(onInteractionChange);
  const currentModelIdRef = useRef(modelId);
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

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    interactionChangeRef.current = onInteractionChange;
  }, [onInteractionChange]);

  useEffect(() => {
    const bridge = window.agentDesktop;
    if (!bridge) return;

    if (!mouseFollow) runtimeRef.current?.runtime.resetGlobalPointer?.();
    return bridge.onCursorScreenPosition((position) => {
      if (!mouseFollow) return;
      runtimeRef.current?.runtime.onGlobalPointerMoved?.(position.clientX, position.clientY);
    });
  }, [mouseFollow]);

  // ---- SDK bootstrap ----
  useEffect(() => {
    let disposed = false;
    async function boot() {
      try {
        setLoadState("loading"); setMsg("正在加载 Cubism Core...");
        await ensureScript(resolvePublicAssetUrl("vendor/live2d/live2dcubismcore.min.js"));
        const [{ CubismFramework, LogLevel, Option }, { LAppPal }, { LAppSubdelegate }, LAppDefine] = await Promise.all([
          import("@framework/live2dcubismframework"), import("./official/lapppal"), import("./official/lappsubdelegate"), import("./official/lappdefine")
        ]);
        if (!CubismFramework.isStarted()) { const o = new Option(); o.loggingLevel = LogLevel.LogLevel_Warning; o.logFunction = LAppPal.printMessage; CubismFramework.startUp(o); }
        if (!CubismFramework.isInitialized()) CubismFramework.initialize();
        if (disposed || !canvasRef.current) return;

        if (modelDirectory && modelFileName) LAppDefine.setActiveModelResource({ id: modelId, directory: modelDirectory, fileName: modelFileName });
        else LAppDefine.setActiveModelId(modelId);
        currentModelIdRef.current = modelId;
        const rt = new LAppSubdelegate();
        if (!rt.initialize(canvasRef.current)) throw new Error("初始化失败");
        runtimeRef.current = { runtime: rt, pal: LAppPal, framework: CubismFramework, OptionCtor: Option, LogLevel };

        // Pointer events
        const cvs = canvasRef.current;
        const pd = (e: PointerEvent) => rt.onPointBegan(e.pageX, e.pageY);
        const pm = (e: PointerEvent) => rt.onPointMoved(e.pageX, e.pageY);
        const pu = (e: PointerEvent) => rt.onPointEnded(e.pageX, e.pageY);
        const pc = (e: PointerEvent) => rt.onTouchCancel(e.pageX, e.pageY);
        let lastProbeAt = 0;
        let lastInteractive = true;
        const probe = (e: MouseEvent) => {
          const now = performance.now();
          if (now - lastProbeAt < 34) return;
          lastProbeAt = now;

          const rect = cvs.getBoundingClientRect();
          let interactive = false;
          if (
            rect.width > 0 && rect.height > 0 &&
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom
          ) {
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            const inEllipse = (cx: number, cy: number, rx: number, ry: number) => {
              const dx = (x - cx) / rx;
              const dy = (y - cy) / ry;
              return dx * dx + dy * dy <= 1;
            };

            // A forgiving silhouette keeps the model draggable while letting its
            // transparent corners and outer edges pass clicks to the desktop.
            interactive =
              inEllipse(0.5, 0.22, 0.31, 0.22) ||
              inEllipse(0.5, 0.48, 0.29, 0.31) ||
              inEllipse(0.5, 0.77, 0.23, 0.31);
          }

          if (interactive !== lastInteractive) {
            lastInteractive = interactive;
            interactionChangeRef.current?.(interactive);
          }
        };
        cvs.addEventListener("pointerdown", pd); window.addEventListener("pointermove", pm);
        window.addEventListener("pointerup", pu); window.addEventListener("pointercancel", pc);
        window.addEventListener("mousemove", probe);
        cleanupRef.current = () => {
          cvs.removeEventListener("pointerdown", pd);
          window.removeEventListener("pointermove", pm);
          window.removeEventListener("pointerup", pu);
          window.removeEventListener("pointercancel", pc);
          window.removeEventListener("mousemove", probe);
          interactionChangeRef.current?.(true);
        };

        // Initial preset
        animatorRef.current.applyPreset(getMoodPresetForModel(modelId, "idle"));

        const loop = (ts: number) => {
          if (disposed || !runtimeRef.current) return;
          runtimeRef.current.pal.updateTime();

          const mgr = rt.getLive2DManager();
          const m = mgr?._models?.[0];

          // ---- Combinable expressions: merge all layers → overrides ----
          if (m) {
            if (!adapterSignatureRef.current || ts - lastAdapterProbeRef.current >= 400) {
              lastAdapterProbeRef.current = ts;
              const parameterIds = m.getAvailableParameterIds?.() ?? [];
              const expressionNames = m.getAvailableExpressionNames?.() ?? [];
              const adapterSignature = `${currentModelIdRef.current}:${parameterIds.join("|")}:${expressionNames.join("|")}`;
              if (parameterIds.length > 0 && adapterSignature !== adapterSignatureRef.current) {
                adapterSignatureRef.current = adapterSignature;
                modelAdapterRef.current = new Live2DModelAdapter(parameterIds, expressionNames);
                const nativeExpression = modelAdapterRef.current.resolveNativeExpression(currentMoodRef.current);
                if (nativeExpression && nativeExpression !== lastNativeExpressionRef.current) {
                  try { m.setExpression(nativeExpression); lastNativeExpressionRef.current = nativeExpression; } catch {}
                }
              }
            }

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

            if (speakingRef.current) {
              const t = ts / 1000;
              const syllableWave = Math.max(0, Math.sin(t * 18.5));
              const accentWave = Math.max(0, Math.sin(t * 31 + 0.8));
              const mouthOpen = Math.min(0.72, 0.06 + syllableWave * 0.36 + accentWave * 0.18);
              const baseMouthOpen = overrides.get("ParamMouthOpenY") ?? 0;
              const baseMouthForm = overrides.get("ParamMouthForm") ?? 0;
              overrides.set("ParamMouthOpenY", Math.max(baseMouthOpen * 0.55, mouthOpen));
              overrides.set("ParamMouthForm", Math.max(baseMouthForm, 0.08));
            }

            const adaptedOverrides = modelAdapterRef.current.adapt(overrides);
            m.setParamOverrides(parameterMixerRef.current.smooth(adaptedOverrides, ts));
          }
          // ---- /Combinable expressions ----

          runtimeRef.current.runtime.update();

          // Expression (mood-driven, via expression manager — used for motion-type effects)
          const expr = animatorRef.current.getPendingExpression();
          if (expr !== null && m) { try { if (expr) m.setExpression(expr); } catch {} }

          frameRef.current = window.requestAnimationFrame(loop);
        };
        frameRef.current = window.requestAnimationFrame(loop);

        const displayName = modelName ?? LIVE2D_MODEL_PRESETS.find((model) => model.id === modelId)?.name ?? activeModel.name;
        setLoadState("ready"); setMsg(`${displayName}已载入`);
      } catch (e) {
        setLoadState("error"); setMsg(e instanceof Error ? e.message : "初始化失败");
      }
    }
    boot();
    return () => {
      disposed = true; cleanupRef.current?.(); cleanupRef.current = null;
      if (frameRef.current !== null) { window.cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      animatorRef.current.reset();
      parameterMixerRef.current.reset();
      modelAdapterRef.current = new Live2DModelAdapter();
      adapterSignatureRef.current = "";
      lastAdapterProbeRef.current = 0;
      lastNativeExpressionRef.current = "";
      if (runtimeRef.current) { runtimeRef.current.runtime.release(); runtimeRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (loadState !== "ready" || !runtimeRef.current || currentModelIdRef.current === modelId) return;
    currentModelIdRef.current = modelId;
    activeExprRef.current = new Set(activeExpressionSet);
    moodComboRef.current = pickMoodCombo(mood);
    idlePropRef.current = null;
    parameterMixerRef.current.reset();
    modelAdapterRef.current = new Live2DModelAdapter();
    adapterSignatureRef.current = "";
    lastAdapterProbeRef.current = 0;
    lastNativeExpressionRef.current = "";
    animatorRef.current.reset();
    animatorRef.current.applyPreset(getMoodPresetForModel(modelId, mood));
    runtimeRef.current.runtime.getLive2DManager().loadModel(modelId, modelDirectory, modelFileName);
    const displayName = modelName ?? LIVE2D_MODEL_PRESETS.find((model) => model.id === modelId)?.name ?? activeModel.name;
    setMsg(`${displayName}已载入`);
  }, [activeExpressionSet, loadState, modelDirectory, modelFileName, modelId, modelName, mood]);

  // ---- Mood → preset + combo ----
  useEffect(() => {
    currentMoodRef.current = mood;
    if (!runtimeRef.current || loadState !== "ready") return;
    if (mood === prevMoodRef.current) return;
    prevMoodRef.current = mood;

    // 1. Apply parameter targets/oscillations
    const preset = getMoodPresetForModel(modelId, mood);
    if (preset) animatorRef.current.applyPreset(preset);

    // 2. Pick and apply mood combo expressions
    const combo = pickMoodCombo(mood);
    moodComboRef.current = combo;

    const model = runtimeRef.current.runtime.getLive2DManager()?._models?.[0];
    const nativeExpression = modelAdapterRef.current.resolveNativeExpression(mood);
    if (nativeExpression && nativeExpression !== lastNativeExpressionRef.current && model) {
      try { model.setExpression(nativeExpression); lastNativeExpressionRef.current = nativeExpression; } catch {}
    }
  }, [loadState, modelId, mood]);

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

  return (
    <div className="live2d-card official-live2d-card">
      <div className="live2d-model-scale">
        <canvas className="live2d-stage official-live2d-stage" ref={canvasRef} />
      </div>
      <div className="live2d-footer">
        <div><p className="eyebrow">{modelName ?? LIVE2D_MODEL_PRESETS.find((model) => model.id === modelId)?.name ?? activeModel.name}</p><strong>{moodLabelMap[mood]}</strong></div>
        <span className={`pet-mood mood-${mood}`}>{moodLabelMap[mood]}</span>
      </div>
      <p className={`live2d-message ${loadState}`}>{msg}</p>
    </div>
  );
}
