import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, Sparkles } from "lucide-react";

export function StartupView({ startupStatus }: { startupStatus: StartupStatus }) {
  return (
    <main className="startup-shell drag-region">
      <div className="startup-glow startup-glow-one" aria-hidden="true" />
      <div className="startup-glow startup-glow-two" aria-hidden="true" />
      <section className="startup-card">
        <div className="startup-brand-row">
          <span className="startup-mark"><Sparkles size={24} /></span>
          <div>
            <p>V-MANAGER</p>
            <h1>Vivi 正在醒来</h1>
          </div>
        </div>
        <div className="startup-status-copy">
          <strong>{startupStatus.title}</strong>
          <span>{startupStatus.detail}</span>
        </div>
        <div className="startup-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={startupStatus.progress}>
          <span style={{ width: `${Math.max(4, Math.min(100, startupStatus.progress))}%` }} />
        </div>
        <div className="startup-footer-row">
          <span>{Math.round(startupStatus.progress)}%</span>
          <span>{startupStatus.phase === "voice" ? "本地语音模型可能需要几十秒" : "所有数据都保存在本机"}</span>
        </div>
        {startupStatus.warning ? <p className="startup-warning no-drag"><AlertCircle size={15} />{startupStatus.warning}</p> : null}
      </section>
    </main>
  );
}

export function ScaleWindowView(props: {
  draftPetScale: number;
  petScale: number;
  setDraftPetScale: Dispatch<SetStateAction<number>>;
  applyScale: (scale: number) => Promise<void>;
  clampPetScale: (scale: number) => number;
}) {
  const { draftPetScale, petScale, setDraftPetScale, applyScale, clampPetScale } = props;
  return (
    <div className="scale-window-shell">
      <div className="window-drag-strip drag-region" aria-hidden="true" />
      <div className="scale-window-card">
        <div className="panel-mini-header drag-region scale-window-header">
          <div>
            <p className="eyebrow">模型大小</p>
            <strong>显示比例 80% - 150%</strong>
          </div>
          <span className="scale-value">{Math.round(draftPetScale * 100)}%</span>
        </div>

        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.01}
          value={draftPetScale}
          onChange={(event) => setDraftPetScale(clampPetScale(Number(event.target.value)))}
        />

        <div className="scale-presets" aria-label="常用模型比例">
          {[0.8, 1, 1.25, 1.5].map((preset) => (
            <button
              className={Math.abs(draftPetScale - preset) < 0.005 ? "is-active" : ""}
              type="button"
              key={preset}
              onClick={() => setDraftPetScale(preset)}
            >
              {Math.round(preset * 100)}%
            </button>
          ))}
        </div>

        <p className="scale-hint">为避免桌宠主窗闪烁，当前改成单独窗口调节，点击应用后再更新模型。</p>

        <div className="scale-window-actions">
          <button className="ghost-button compact" type="button" onClick={() => setDraftPetScale(petScale)}>
            还原当前
          </button>
          <button className="ghost-button compact" type="button" onClick={() => void applyScale(1)}>
            重置
          </button>
          <button className="primary-button compact-primary" type="button" onClick={() => void applyScale(draftPetScale)}>
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
