import { useEffect, useMemo, useRef, useState } from "react";
import {
  activeModel, EXPRESSION_PARAMS, IDLE_PROP_ACTIONS, IDLE_ACTION_INTERVAL,
  MOOD_LABEL_MAP, MoodParamPreset, ParamOscillation, ParamTarget, PetMood,
} from "./live2dConfig";

type Live2DPreviewProps = { mood: PetMood; scale: number; activeExpressionSet: Set<string> };
type CubismModelRef = { setParameterValueById: (id: string, value: number, weight?: number) => void };
type RuntimeModel = { getModel: () => CubismModelRef | null; setExpression: (id: string) => void; setParamOverrides: (overrides: Map<string, number>) => void };
type RuntimeManager = { _models: RuntimeModel[] };

// ---- ParameterAnimator ----

const INTERPOLATE_SPEED = 4.0;

class ParameterAnimator {
  private model: CubismModelRef | null = null;
  private targets: ParamTarget[] = [];
  private oscillations: ParamOscillation[] = [];
  private expressionName: string | null = null;
  private lastExpression: string | null = null;
  private lastTimestamp = 0;
  private elapsed = 0;

  setModel(m: CubismModelRef | null) { this.model = m; }

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

  update(timestampMs: number) {
    if (!this.model) return;
    const dt = this.lastTimestamp > 0 ? Math.min((timestampMs - this.lastTimestamp) / 1000, 0.1) : 0.016;
    this.lastTimestamp = timestampMs;
    this.elapsed += dt;

    for (const t of this.targets) {
      this.model.setParameterValueById(t.id, t.value, (t.weight ?? 1) * Math.min(INTERPOLATE_SPEED * dt, 1));
    }
    for (const o of this.oscillations) {
      const v = o.center + o.amplitude * Math.sin(this.elapsed * 1000 * 2 * Math.PI / o.periodMs);
      this.model.setParameterValueById(o.id, v, 0.8);
    }
  }

  reset() {
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

export default function Live2DPreview({ mood, scale, activeExpressionSet }: Live2DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<any>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const animatorRef = useRef(new ParameterAnimator());
  const idleTimerRef = useRef<number | null>(null);
  const idleClearRef = useRef<number | null>(null);
  const prevMoodRef = useRef<PetMood>("idle");
  const activeExprRef = useRef<Set<string>>(new Set());
  const prevExprRef = useRef<Set<string>>(new Set());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("正在启动...");

  // Sync activeExpressionSet to ref (for per-frame access in rAF loop)
  useEffect(() => {
    activeExprRef.current = activeExpressionSet;
  }, [activeExpressionSet]);

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

        let modelWired = false;
        const loop = (ts: number) => {
          if (disposed || !runtimeRef.current) return;
          runtimeRef.current.pal.updateTime();

          // Lazy-connect animator to model
          const mgr = rt.getLive2DManager();
          const m = mgr?._models?.[0];
          if (m && !modelWired) {
            const cm = m.getModel();
            if (cm) { animatorRef.current.setModel(cm); modelWired = true; }
          }

          // ---- Combinable expressions: compute param overrides ----
          const activeSet = activeExprRef.current;
          if (m) {
            const overrides = new Map<string, number>();
            if (activeSet.size > 0) {
              for (const exprName of activeSet) {
                const params = EXPRESSION_PARAMS[exprName];
                if (params) {
                  for (const p of params) {
                    overrides.set(p.id, p.value);
                  }
                }
              }
            }
            m.setParamOverrides(overrides);
          }
          // ---- /Combinable expressions ----

          runtimeRef.current.runtime.update();
          const anim = animatorRef.current;
          anim.update(ts);

          // Expression (mood-driven, via expression manager)
          const expr = anim.getPendingExpression();
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

  // ---- Mood → preset ----
  useEffect(() => {
    if (!runtimeRef.current || loadState !== "ready") return;
    if (mood === prevMoodRef.current) return;
    prevMoodRef.current = mood;
    const preset = activeModel.moodParams[mood];
    if (preset) animatorRef.current.applyPreset(preset);
  }, [loadState, mood]);

  // ---- Combinable expression toggle: reset removed expression params ----
  useEffect(() => {
    if (loadState !== "ready") return;
    const mgr = runtimeRef.current?.runtime.getLive2DManager();
    const model = mgr?._models?.[0];
    if (!model) return;

    const prev = prevExprRef.current;
    const next = activeExpressionSet;

    // Reset params for expressions that were removed
    for (const exprName of prev) {
      if (!next.has(exprName)) {
        const params = EXPRESSION_PARAMS[exprName];
        if (params) {
          for (const p of params) model.getModel()?.setParameterValueById(p.id, 0);
        }
      }
    }

    prevExprRef.current = new Set(next);
  }, [loadState, activeExpressionSet]);

  // ---- Idle prop action cycle ----
  useEffect(() => {
    if (loadState !== "ready" || mood !== "idle") return;

    const schedule = () => {
      const delay = IDLE_ACTION_INTERVAL.minMs + Math.random() * (IDLE_ACTION_INTERVAL.maxMs - IDLE_ACTION_INTERVAL.minMs);
      idleTimerRef.current = window.setTimeout(() => {
        const action = IDLE_PROP_ACTIONS[Math.floor(Math.random() * IDLE_PROP_ACTIONS.length)];
        const dur = action.minMs + Math.random() * (action.maxMs - action.minMs);
        const mgr = runtimeRef.current?.runtime.getLive2DManager();
        const model = mgr?._models?.[0];
        if (model) {
          try { model.setExpression(action.expr); } catch {}
          if ((action as any).moodExpr) {
            setTimeout(() => { try { model.setExpression((action as any).moodExpr); } catch {} }, 80);
          }
        }
        idleClearRef.current = window.setTimeout(() => { schedule(); }, dur);
      }, delay);
    };
    schedule();
    return () => {
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
