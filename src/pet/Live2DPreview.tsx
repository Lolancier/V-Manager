import { useEffect, useMemo, useRef, useState } from "react";
import { hiyoriModel, PetMood } from "./live2dConfig";

type Live2DPreviewProps = {
  mood: PetMood;
  scale: number;
};

type RuntimeModel = {
  startRandomMotion: (group: string, priority: number) => void;
  setRandomExpression: () => void;
};

type RuntimeManager = {
  _models: RuntimeModel[];
};

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

const moodLabelMap: Record<PetMood, string> = {
  idle: "待机",
  thinking: "思考中",
  talking: "说话中",
  happy: "开心反馈"
};

function ensureScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existed = document.querySelector(`script[data-src="${src}"]`) as HTMLScriptElement | null;

    if (existed) {
      if (window.Live2DCubismCore) {
        resolve();
      } else {
        existed.addEventListener("load", () => resolve(), { once: true });
        existed.addEventListener("error", () => reject(new Error(`脚本加载失败：${src}`)), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`脚本加载失败：${src}`));
    document.head.appendChild(script);
  });
}

export default function Live2DPreview({ mood, scale }: Live2DPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<{
    runtime: {
      initialize: (canvas: HTMLCanvasElement) => boolean;
      update: () => void;
      release: () => void;
      onPointBegan: (pageX: number, pageY: number) => void;
      onPointMoved: (pageX: number, pageY: number) => void;
      onPointEnded: (pageX: number, pageY: number) => void;
      onTouchCancel: (pageX: number, pageY: number) => void;
      getLive2DManager: () => RuntimeManager;
    };
    pal: {
      updateTime: () => void;
      printMessage: (message: string) => void;
    };
    framework: {
      isStarted: () => boolean;
      isInitialized: () => boolean;
      startUp: (option?: unknown) => boolean;
      initialize: () => void;
      dispose: () => void;
      cleanUp: () => void;
    };
    OptionCtor: new () => { loggingLevel: number; logFunction: (message: string) => void };
    LogLevel: { LogLevel_Warning: number };
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("正在启动官方 Cubism SDK...");

  const moodMotion = useMemo(() => {
    return hiyoriModel.motions[mood];
  }, [mood]);

  const extraScale = useMemo(() => {
    return Math.max(0, scale - 1);
  }, [scale]);

  const visualPaddingTop = useMemo(() => {
    return Math.round(18 + extraScale * 110);
  }, [extraScale]);

  const visualPaddingX = useMemo(() => {
    return Math.round(10 + extraScale * 70);
  }, [extraScale]);

  const visualOffsetX = useMemo(() => {
    return Math.round(extraScale * 42);
  }, [extraScale]);

  const visualOffsetY = useMemo(() => {
    return Math.round(extraScale * 190);
  }, [extraScale]);

  useEffect(() => {
    let disposed = false;

    function bindPointerEvents(canvas: HTMLCanvasElement, runtime: {
      onPointBegan: (pageX: number, pageY: number) => void;
      onPointMoved: (pageX: number, pageY: number) => void;
      onPointEnded: (pageX: number, pageY: number) => void;
      onTouchCancel: (pageX: number, pageY: number) => void;
    }) {
      const onPointerDown = (event: PointerEvent) => runtime.onPointBegan(event.pageX, event.pageY);
      const onPointerMove = (event: PointerEvent) => runtime.onPointMoved(event.pageX, event.pageY);
      const onPointerUp = (event: PointerEvent) => runtime.onPointEnded(event.pageX, event.pageY);
      const onPointerCancel = (event: PointerEvent) => runtime.onTouchCancel(event.pageX, event.pageY);

      canvas.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);

      cleanupListenersRef.current = () => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      };
    }

    async function bootstrap() {
      try {
        setLoadState("loading");
        setMessage("正在加载 Cubism Core...");
        await ensureScript("/vendor/live2d/live2dcubismcore.min.js");

        const [{ CubismFramework, LogLevel, Option }, { LAppPal }, { LAppSubdelegate }] = await Promise.all([
          import("@framework/live2dcubismframework"),
          import("./official/lapppal"),
          import("./official/lappsubdelegate")
        ]);

        if (!CubismFramework.isStarted()) {
          const option = new Option();
          option.loggingLevel = LogLevel.LogLevel_Warning;
          option.logFunction = LAppPal.printMessage;
          CubismFramework.startUp(option);
        }

        if (!CubismFramework.isInitialized()) {
          CubismFramework.initialize();
        }

        if (disposed || !canvasRef.current) {
          return;
        }

        const runtime = new LAppSubdelegate();
        const initialized = runtime.initialize(canvasRef.current);
        if (!initialized) {
          throw new Error("官方 Cubism 预览初始化失败。");
        }

        runtimeRef.current = {
          runtime,
          pal: LAppPal,
          framework: CubismFramework,
          OptionCtor: Option,
          LogLevel
        };
        bindPointerEvents(canvasRef.current, runtime);

        const loop = () => {
          if (disposed || !runtimeRef.current) {
            return;
          }

          runtimeRef.current.pal.updateTime();
          runtimeRef.current.runtime.update();
          frameRef.current = window.requestAnimationFrame(loop);
        };

        loop();
        setLoadState("ready");
        setMessage("官方 SDK 已载入，模型正在卡片中渲染。");
      } catch (error) {
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : "官方 Cubism 初始化失败。");
      }
    }

    bootstrap();

    return () => {
      disposed = true;
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      runtimeRef.current?.runtime.release();

      if (runtimeRef.current?.framework.isInitialized()) {
        runtimeRef.current.framework.dispose();
        runtimeRef.current.framework.cleanUp();
      }

      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtimeContext = runtimeRef.current;
    if (!runtimeContext || loadState !== "ready") {
      return;
    }

    const manager = runtimeContext.runtime.getLive2DManager() as RuntimeManager;
    const model = manager?._models?.[0];
    if (!model) {
      return;
    }

    if (mood === "idle") {
      return;
    }

    try {
      model.startRandomMotion(moodMotion, 2);
      if (mood === "happy") {
        model.setRandomExpression?.();
      }
    } catch {
      // 模型动作不存在时保持当前状态。
    }
  }, [loadState, mood, moodMotion]);

  return (
    <div
      className="live2d-card official-live2d-card"
      style={{
        paddingTop: `${visualPaddingTop}px`,
        paddingLeft: `${visualPaddingX}px`,
        paddingRight: `${visualPaddingX}px`
      }}
    >
      <div
        className="live2d-model-scale"
        style={{ transform: `translate(${visualOffsetX}px, ${visualOffsetY}px) scale(${scale})` }}
      >
        <canvas className="live2d-stage official-live2d-stage" ref={canvasRef} />
      </div>
      <div className="live2d-footer">
        <div>
          <p className="eyebrow">Live2D 官方预览</p>
          <strong>{hiyoriModel.name}</strong>
        </div>
        <span className={`pet-mood mood-${mood}`}>{moodLabelMap[mood]}</span>
      </div>
      <p className={`live2d-message ${loadState}`}>{message}</p>
    </div>
  );
}
