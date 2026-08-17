import type { MouseEventHandler, PointerEventHandler, ReactNode, RefObject } from "react";
import type { RuntimeReplyMeta } from "../runtime-types";

type ExpressionItem = {
  name: string;
  label: string;
  cat: string;
};

const EXPRESSION_ITEMS: ExpressionItem[] = [
  { name: "expression0", label: "豆豆眼", cat: "情绪" },
  { name: "expression1", label: "星星眼", cat: "情绪" },
  { name: "expression2", label: "脸红", cat: "情绪" },
  { name: "expression3", label: "脸红2", cat: "情绪" },
  { name: "expression4", label: "黑脸", cat: "情绪" },
  { name: "expression5", label: "眼泪", cat: "情绪" },
  { name: "expression6", label: "眼珠", cat: "情绪" },
  { name: "expression7", label: "问号", cat: "情绪" },
  { name: "expression8", label: "问号2", cat: "情绪" },
  { name: "expression9", label: "流汗", cat: "情绪" },
  { name: "expression10", label: "无语", cat: "情绪" },
  { name: "expression11", label: "钱眼", cat: "情绪" },
  { name: "expression12", label: "爱心眼", cat: "情绪" },
  { name: "expression13", label: "轮回眼", cat: "情绪" },
  { name: "expression14", label: "空白眼", cat: "情绪" },
  { name: "expression15", label: "吐舌", cat: "情绪" },
  { name: "expression16", label: "嘟嘴", cat: "情绪" },
  { name: "expression17", label: "鼓嘴", cat: "情绪" },
  { name: "expression18", label: "星星", cat: "情绪" },
  { name: "expression19", label: "生气", cat: "情绪" },
  { name: "expression20", label: "长发", cat: "形态" },
  { name: "expression21", label: "双马尾", cat: "形态" },
  { name: "expression22", label: "垂耳", cat: "形态" },
  { name: "expression23", label: "照镜子", cat: "动作" },
  { name: "expression24", label: "狐狸", cat: "形态" },
  { name: "expression25", label: "笔记本R", cat: "动作" },
  { name: "expression26", label: "笔记本L", cat: "动作" },
  { name: "expression27", label: "打游戏", cat: "动作" },
  { name: "expression28", label: "抱狐狸", cat: "动作" },
  { name: "expression29", label: "扇子", cat: "动作" },
  { name: "expression30", label: "话筒", cat: "动作" },
  { name: "expression31", label: "比心", cat: "动作" }
];

const EXPRESSION_CATEGORIES = ["情绪", "形态", "动作"];

export function ExpressionsWindowView(props: {
  activeExpressionSet: Set<string>;
  clearExpressions: () => Promise<boolean> | undefined;
  triggerExpression: (name: string) => Promise<boolean> | undefined;
}) {
  const { activeExpressionSet, clearExpressions, triggerExpression } = props;

  return (
    <div className="expression-window-shell">
      <header className="expression-window-header">
        <p className="eyebrow">表情与动作</p>
        <h1>芊芊</h1>
        <p className="settings-subtitle">点击开关，可多选组合</p>
      </header>
      <div className="expression-reset-bar">
        <button className="expression-reset-button" onClick={() => void clearExpressions()}>
          全部清除
        </button>
      </div>
      {EXPRESSION_CATEGORIES.map((cat) => (
        <section key={cat} className="panel-block" style={{ marginBottom: "12px", padding: "14px" }}>
          <p className="eyebrow">{cat}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {EXPRESSION_ITEMS.filter((item) => item.cat === cat).map((item) => (
              <button
                key={item.name}
                className={`ghost-button compact ${activeExpressionSet.has(item.name) ? "is-active" : ""}`}
                style={{ padding: "8px 6px", fontSize: "12px", textAlign: "center" }}
                onClick={() => void triggerExpression(item.name)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BubbleWindowView(props: {
  bubblePlacement: "left" | "right";
  bubbleVisible: boolean;
  bubbleCardRef: RefObject<HTMLElement | null>;
  bubbleFading: boolean;
  personaName: string;
  lastReplyMeta: RuntimeReplyMeta | null;
  interestRuntimeState: InterestRuntimeState;
  closeBubble: () => void;
  handleInterruptInterestActivity: () => Promise<void>;
  bubbleSegmentReady: boolean;
  bubbleSegmentText: string;
}) {
  const {
    bubblePlacement,
    bubbleVisible,
    bubbleCardRef,
    bubbleFading,
    personaName,
    lastReplyMeta,
    interestRuntimeState,
    closeBubble,
    handleInterruptInterestActivity,
    bubbleSegmentReady,
    bubbleSegmentText
  } = props;
  const showingInterestActivity = interestRuntimeState.status === "working";

  return (
    <div className={`bubble-window-shell placement-${bubblePlacement}`}>
      {bubbleVisible ? (
        <article ref={bubbleCardRef} className={`speech-bubble assistant-bubble bubble-window-card ${bubbleFading ? "is-fading" : ""}`}>
          <div className="bubble-card-header">
            <span className="message-role">{personaName}</span>
            <button className="bubble-close-button" type="button" aria-label="关闭气泡" onClick={closeBubble}>
              ×
            </button>
          </div>
          {!showingInterestActivity && lastReplyMeta ? (
            <div className="bubble-runtime-status">
              <span className={`runtime-badge ${lastReplyMeta.responseMode}`}>{lastReplyMeta.sourceLabel}</span>
              <span className="runtime-inline-text">
                {lastReplyMeta.usedKnowledge ? `本地检索 ${lastReplyMeta.knowledgeCount}` : "未用本地检索"}
              </span>
            </div>
          ) : null}
          {showingInterestActivity ? (
            <div className="bubble-interest-activity">
              <span>兴趣沙盒 · 进行中</span>
              <p>{interestRuntimeState.label || "正在进行自己的活动…"}</p>
              <small>{interestRuntimeState.type === "mini_game"
                ? `${interestRuntimeState.progress?.actions != null ? `已操作 ${interestRuntimeState.progress.actions} 次` : "正在准备操作"}${interestRuntimeState.progress?.highestScore != null ? ` · 当前最高 ${interestRuntimeState.progress.highestScore} 分` : ""} · 不需要视觉识别`
                : "作品只会写入人物自己的沙盒目录。"}</small>
              {interestRuntimeState.logs?.length ? <div className="bubble-interest-log">{interestRuntimeState.logs.slice(-3).map((entry, index) => <span key={`${entry.at}-${index}`}>{entry.label}</span>)}</div> : null}
              <div className="bubble-interest-actions">
                <button type="button" disabled={interestRuntimeState.phase === "stopping"} onClick={() => void handleInterruptInterestActivity()}>
                  {interestRuntimeState.phase === "stopping" ? "正在停止…" : "先停下"}
                </button>
                <button type="button" onClick={closeBubble}>等你完成</button>
              </div>
            </div>
          ) : <p>{bubbleSegmentReady ? (bubbleSegmentText || "...") : "正在准备语音…"}</p>}
        </article>
      ) : null}
    </div>
  );
}

export function PetWindowView(props: {
  petHoverHidden: boolean;
  handleContextMenu: MouseEventHandler<HTMLDivElement>;
  dragging: boolean;
  handleInteractionPointerDown: PointerEventHandler<HTMLDivElement>;
  handleInteractionPointerMove: PointerEventHandler<HTMLDivElement>;
  handleInteractionPointerEnd: PointerEventHandler<HTMLDivElement>;
  live2dStage: ReactNode;
}) {
  const {
    petHoverHidden,
    handleContextMenu,
    dragging,
    handleInteractionPointerDown,
    handleInteractionPointerMove,
    handleInteractionPointerEnd,
    live2dStage
  } = props;

  return (
    <div className={`pet-window-shell ${petHoverHidden ? "is-hover-hidden" : ""}`} onContextMenu={handleContextMenu}>
      <div className="pet-window-frame">
        <div className="pet-stage no-drag">
          <div
            className={`pet-interaction-zone ${dragging ? "is-dragging" : ""}`}
            onContextMenu={handleContextMenu}
            onPointerDown={handleInteractionPointerDown}
            onPointerMove={handleInteractionPointerMove}
            onPointerUp={handleInteractionPointerEnd}
            onPointerCancel={handleInteractionPointerEnd}
          >
            {live2dStage}
          </div>
        </div>
      </div>
    </div>
  );
}
