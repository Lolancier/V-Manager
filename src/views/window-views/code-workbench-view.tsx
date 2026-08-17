import type {
  Dispatch,
  FormEventHandler,
  KeyboardEventHandler,
  RefObject,
  SetStateAction
} from "react";
import type { ChatMessage, CodeAgentModeOption, RuntimeReplyMeta } from "../runtime-types";

export function CodeWorkbenchView(props: {
  codeWorkspaceRoot: string;
  codeAgentModes: CodeAgentModeOption[];
  codeAgentMode: CodeAgentMode;
  changeCodeAgentMode: (mode: CodeAgentMode) => void;
  lastReplyMeta: RuntimeReplyMeta | null;
  sending: boolean;
  refreshCodeWorkspace: () => Promise<void>;
  selectCodeWorkspace: () => Promise<void>;
  openChatWindow: () => Promise<boolean> | undefined;
  codeFilter: string;
  setCodeFilter: Dispatch<SetStateAction<string>>;
  visibleEntries: CodeWorkspaceEntry[];
  collapsedCodeDirs: Set<string>;
  activeCodePath: string;
  toggleCodeDirectory: (path: string) => void;
  openCodeFile: (path: string) => Promise<void>;
  codeSaveMessage: string;
  codeFileLoading: boolean;
  codeEditing: boolean;
  setCodeDraftContent: Dispatch<SetStateAction<string>>;
  setCodeEditing: Dispatch<SetStateAction<boolean>>;
  setCodeSaveMessage: Dispatch<SetStateAction<string>>;
  activeCodeContent: string;
  codeDraftContent: string;
  codeSaving: boolean;
  saveActiveCodeFile: () => Promise<void>;
  codeWorkspaceError: string;
  codeLines: string[];
  personaName: string;
  messages: ChatMessage[];
  historyListRef: RefObject<HTMLDivElement | null>;
  setInput: Dispatch<SetStateAction<string>>;
  input: string;
  handleSend: FormEventHandler<HTMLFormElement>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
}) {
  const {
    codeWorkspaceRoot,
    codeAgentModes,
    codeAgentMode,
    changeCodeAgentMode,
    lastReplyMeta,
    sending,
    refreshCodeWorkspace,
    selectCodeWorkspace,
    openChatWindow,
    codeFilter,
    setCodeFilter,
    visibleEntries,
    collapsedCodeDirs,
    activeCodePath,
    toggleCodeDirectory,
    openCodeFile,
    codeSaveMessage,
    codeFileLoading,
    codeEditing,
    setCodeDraftContent,
    setCodeEditing,
    setCodeSaveMessage,
    activeCodeContent,
    codeDraftContent,
    codeSaving,
    saveActiveCodeFile,
    codeWorkspaceError,
    codeLines,
    personaName,
    messages,
    historyListRef,
    setInput,
    input,
    handleSend,
    composerRef,
    handleComposerKeyDown
  } = props;

  return (
    <div className="code-workbench-shell">
      <header className="code-workbench-header">
        <div className="code-brand">
          <strong>Vivi Code</strong>
          <span>{codeWorkspaceRoot}</span>
        </div>
        <div className="code-header-actions">
          <label className="code-mode-picker" title={codeAgentModes.find((mode) => mode.id === codeAgentMode)?.hint}>
            <span>工作模式</span>
            <select value={codeAgentMode} onChange={(event) => changeCodeAgentMode(event.target.value as CodeAgentMode)}>
              {codeAgentModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.label}</option>)}
            </select>
          </label>
          <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`} title="最近一次运行状态，不是按钮">
            {sending ? "状态：Vivi 正在处理" : `状态：${lastReplyMeta?.sourceLabel ?? "代码会话就绪"}`}
          </span>
          <button className="code-icon-button" type="button" aria-label="关闭代码工作台" title="关闭" onClick={() => window.close()}>
            ×
          </button>
        </div>
      </header>

      <main className="code-workbench-grid">
        <aside className="code-explorer">
          <div className="code-pane-title">
            <strong>资源管理器</strong>
            <button className="code-refresh-button" type="button" title="刷新文件树" aria-label="刷新文件树" onClick={() => void refreshCodeWorkspace()}>
              ↻
            </button>
          </div>
          <div className="code-workspace-actions">
            <button type="button" onClick={() => void selectCodeWorkspace()}>打开文件夹</button>
            <button type="button" onClick={() => void openChatWindow()}>日常对话</button>
          </div>
          <input
            className="code-file-filter"
            value={codeFilter}
            onChange={(event) => setCodeFilter(event.target.value)}
            placeholder="筛选文件"
            aria-label="筛选工作区文件"
          />
          <div className="code-file-tree">
            {visibleEntries.map((entry) => (
              entry.type === "directory" ? (
                <button
                  className={`code-tree-directory ${collapsedCodeDirs.has(entry.path) ? "is-collapsed" : ""}`}
                  style={{ paddingLeft: 10 + entry.depth * 14 }}
                  key={`directory-${entry.path}`}
                  title={entry.path}
                  type="button"
                  onClick={() => toggleCodeDirectory(entry.path)}
                >
                  <span>{collapsedCodeDirs.has(entry.path) ? "›" : "⌄"}</span>{entry.name}
                </button>
              ) : (
                <button
                  className={`code-tree-file ${activeCodePath === entry.path ? "is-active" : ""}`}
                  style={{ paddingLeft: 24 + entry.depth * 14 }}
                  type="button"
                  key={`file-${entry.path}`}
                  title={entry.path}
                  onClick={() => void openCodeFile(entry.path)}
                >
                  {entry.name}
                </button>
              )
            ))}
          </div>
        </aside>

        <section className="code-editor-pane">
          <div className="code-editor-tabbar">
            <span className={activeCodePath ? "is-open" : ""}>{activeCodePath || "选择一个文件"}</span>
            <div className="code-editor-actions">
              {codeSaveMessage ? <small>{codeSaveMessage}</small> : null}
              {activeCodePath && !codeFileLoading ? (
                codeEditing ? (
                  <>
                    <button type="button" onClick={() => { setCodeDraftContent(activeCodeContent); setCodeEditing(false); setCodeSaveMessage(""); }}>放弃</button>
                    <button
                      className="is-primary"
                      type="button"
                      disabled={codeSaving || codeDraftContent === activeCodeContent}
                      onClick={() => void saveActiveCodeFile()}
                    >
                      {codeSaving ? "保存中" : "保存"}
                    </button>
                  </>
                ) : <button type="button" onClick={() => setCodeEditing(true)}>编辑</button>
              ) : <small>{codeFileLoading ? "读取中..." : "只读预览"}</small>}
            </div>
          </div>
          {codeWorkspaceError ? <div className="code-empty-state">{codeWorkspaceError}</div> : null}
          {!codeWorkspaceError && activeCodePath && codeEditing ? (
            <textarea
              className="code-editor-textarea"
              aria-label={`编辑 ${activeCodePath}`}
              spellCheck={false}
              value={codeDraftContent}
              onChange={(event) => setCodeDraftContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  event.preventDefault();
                  const target = event.currentTarget;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  setCodeDraftContent(`${codeDraftContent.slice(0, start)}  ${codeDraftContent.slice(end)}`);
                  window.requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
                }
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                  event.preventDefault();
                  void saveActiveCodeFile();
                }
              }}
            />
          ) : null}
          {!codeWorkspaceError && activeCodePath && !codeEditing ? (
            <pre className="code-editor-content" aria-label={activeCodePath}>
              {codeLines.map((line, index) => (
                <div className="code-line" key={`${activeCodePath}-${index}`}>
                  <span>{index + 1}</span>
                  <code>{line || " "}</code>
                </div>
              ))}
            </pre>
          ) : null}
          {!codeWorkspaceError && !activeCodePath ? (
            <div className="code-empty-state">从左侧选择文件，或直接让 Vivi 检查项目。</div>
          ) : null}
        </section>

        <aside className="code-agent-pane">
          <div className="code-pane-title code-agent-title">
            <div>
              <strong>{personaName}</strong>
              <span>{codeAgentModes.find((mode) => mode.id === codeAgentMode)?.hint}</span>
            </div>
          </div>
          <div className="code-terminal-chat" ref={historyListRef}>
            {messages.map((message, index) => (
              <article className={`code-terminal-message ${message.role}`} key={`code-${message.role}-${index}`}>
                <span>{message.role === "assistant" ? personaName.toLowerCase() : "you"} &gt;</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
          <div className="code-quick-actions">
            <button type="button" onClick={() => setInput("检查当前项目结构并告诉我最值得处理的问题")}>检查项目</button>
            <button type="button" disabled={!activeCodePath} onClick={() => setInput(`解释 ${activeCodePath} 的职责和关键逻辑`)}>
              解释当前文件
            </button>
            <button type="button" onClick={() => { changeCodeAgentMode("plan"); setInput(`为${activeCodePath ? ` ${activeCodePath}` : "当前项目"}制定修改计划，列出涉及文件和验证步骤`); }}>
              规划修改
            </button>
            <button type="button" onClick={() => { changeCodeAgentMode("review"); setInput("审查当前 Git 变更，按风险级别指出问题并给出验证建议"); }}>
              审查变更
            </button>
          </div>
          <form className="code-agent-composer" onSubmit={handleSend}>
            <textarea
              ref={composerRef}
              placeholder="和 Vivi 聊天，或让她搜索、解释、修改代码..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={5}
            />
            <div className="code-composer-footer">
              <span>Enter 发送 · Shift + Enter 换行</span>
              <button className="primary-button compact-primary" type="submit" disabled={sending || !input.trim()}>
                {sending ? "处理中..." : "发送"}
              </button>
            </div>
          </form>
        </aside>
      </main>
    </div>
  );
}
