import type {
  Dispatch,
  FormEventHandler,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
  SetStateAction
} from "react";
import { Code2, LoaderCircle, Mic, RotateCcw, Send, Settings2, Sparkles, Square, Volume2 } from "lucide-react";
import type { ChatMessage, MessageVoiceState, RuntimeReplyMeta } from "../runtime-types";

export function ComposerWindowView(props: {
  lastReplyMeta: RuntimeReplyMeta | null;
  handleSend: FormEventHandler<HTMLFormElement>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  voiceInputMessage: string;
  recordingVoiceInput: boolean;
  transcribingVoiceInput: boolean;
  startVoiceInput: () => Promise<void>;
  openChatWindow: () => Promise<boolean> | undefined;
  sending: boolean;
}) {
  const {
    lastReplyMeta,
    handleSend,
    composerRef,
    input,
    setInput,
    handleComposerKeyDown,
    voiceInputMessage,
    recordingVoiceInput,
    transcribingVoiceInput,
    startVoiceInput,
    openChatWindow,
    sending
  } = props;

  return (
    <div className="composer-window-shell">
      <section className="composer-window-panel">
        <div className="panel-mini-header drag-region composer-window-header">
          <div>
            <p className="eyebrow">对话窗口</p>
            <strong>快速输入</strong>
          </div>
          <div className="composer-window-header-actions no-drag">
            <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
              {lastReplyMeta?.sourceLabel ?? "尚未发送对话"}
            </span>
            <button
              className="bubble-close-button"
              type="button"
              aria-label="关闭对话窗口"
              onClick={() => window.close()}
            >
              ×
            </button>
          </div>
        </div>

        <form className="composer-window-form no-drag" onSubmit={handleSend}>
          <div className="speech-bubble assistant-bubble composer-input-bubble no-drag">
            <textarea
              ref={composerRef}
              placeholder="和 Vivi 说点什么... Enter 发送，Shift + Enter 换行"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={5}
            />
          </div>
          {voiceInputMessage ? <p className="composer-voice-feedback" role="status">{voiceInputMessage}</p> : null}
          <div className="pet-history-actions no-drag">
            <button
              className={`voice-input-button ${recordingVoiceInput ? "is-recording" : ""}`}
              type="button"
              title={recordingVoiceInput ? "停止录音" : "本地语音输入"}
              aria-label={recordingVoiceInput ? "停止录音" : "本地语音输入"}
              disabled={transcribingVoiceInput}
              onClick={() => void startVoiceInput()}
            >
              {transcribingVoiceInput ? <LoaderCircle size={16} /> : recordingVoiceInput ? <Square size={14} /> : <Mic size={17} />}
              <span>{transcribingVoiceInput ? "识别中" : recordingVoiceInput ? "停止" : "语音"}</span>
            </button>
            <button className="ghost-button compact" type="button" onClick={() => setInput("")}>
              清空输入
            </button>
            <button className="ghost-button compact" type="button" onClick={() => void openChatWindow()}>
              打开聊天栏
            </button>
            <button className="primary-button" type="submit" disabled={sending}>
              {sending ? "思考中..." : "发送"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ChatWindowView(props: {
  lastReplyMeta: RuntimeReplyMeta | null;
  sending: boolean;
  statusText: string;
  openCodeWindow: () => Promise<boolean> | undefined;
  openSettingsWindow: () => Promise<boolean> | undefined;
  personaName: string;
  relationshipEmotionLabel: string;
  petMood: string;
  petSpeaking: boolean;
  live2dStage: ReactNode;
  messages: ChatMessage[];
  setInput: Dispatch<SetStateAction<string>>;
  focusComposer: () => void;
  historyListRef: RefObject<HTMLDivElement | null>;
  messageVoiceState: MessageVoiceState;
  isReplyStreaming: boolean;
  voiceEnabled: boolean;
  handleMessageVoice: (index: number, text: string) => Promise<void>;
  handleSend: FormEventHandler<HTMLFormElement>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  handleComposerKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  voiceInputMessage: string;
  recordingVoiceInput: boolean;
  transcribingVoiceInput: boolean;
  startVoiceInput: () => Promise<void>;
}) {
  const {
    lastReplyMeta,
    sending,
    statusText,
    openCodeWindow,
    openSettingsWindow,
    personaName,
    relationshipEmotionLabel,
    petMood,
    petSpeaking,
    live2dStage,
    messages,
    setInput,
    focusComposer,
    historyListRef,
    messageVoiceState,
    isReplyStreaming,
    voiceEnabled,
    handleMessageVoice,
    handleSend,
    composerRef,
    input,
    handleComposerKeyDown,
    voiceInputMessage,
    recordingVoiceInput,
    transcribingVoiceInput,
    startVoiceInput
  } = props;

  return (
    <div className="chat-window-shell">
      <header className="chat-companion-topbar drag-region">
        <div className="chat-companion-brand">
          <span className="chat-brand-mark"><Sparkles size={17} /></span>
          <div>
            <strong>Vivi Companion</strong>
            <span>你的桌面搭档</span>
          </div>
        </div>
        <div className="chat-topbar-actions no-drag">
          <span className={`runtime-badge ${lastReplyMeta?.responseMode ?? "fallback_local"}`}>
            <i />{sending ? "正在回应" : lastReplyMeta?.sourceLabel ?? statusText}
          </span>
          <button type="button" title="代码工作台" aria-label="打开代码工作台" onClick={() => void openCodeWindow()}><Code2 size={17} /></button>
          <button type="button" title="设置" aria-label="打开设置" onClick={() => void openSettingsWindow()}><Settings2 size={17} /></button>
        </div>
      </header>

      <main className="chat-companion-layout">
        <aside className="companion-stage-card">
          <div className="stage-ambient stage-ambient-one" aria-hidden="true" />
          <div className="stage-ambient stage-ambient-two" aria-hidden="true" />
          <div className="stage-stars" aria-hidden="true"><span>✦</span><span>·</span><span>✧</span><span>·</span></div>
          <div className="companion-stage-heading">
            <span className="companion-online-dot" />
            <div>
              <strong>{personaName}</strong>
              <span>{relationshipEmotionLabel} · {petMood === "thinking" ? "正在思考" : petSpeaking ? "正在说话" : "陪伴中"}</span>
            </div>
          </div>
          <div className="chat-live2d-stage no-drag">{live2dStage}</div>
        </aside>

        <section className="chat-window-panel">
          <div className="chat-conversation-heading">
            <div>
              <p className="eyebrow">COMPANION CHAT</p>
              <h1>今天想一起做什么？</h1>
            </div>
            <span>{messages.length} 条消息</span>
          </div>

          <div className="chat-quick-prompts" aria-label="快捷提问">
            {["陪我聊聊今天", "整理一下待办", "看看电脑状态"].map((prompt) => (
              <button key={prompt} type="button" onClick={() => { setInput(prompt); window.setTimeout(() => focusComposer(), 0); }}>
                {prompt}
              </button>
            ))}
          </div>

          <div className="chat-window-list" ref={historyListRef}>
            {messages.map((message, index) => {
              const voiceState = messageVoiceState?.index === index ? messageVoiceState.status : null;
              const replyStillStreaming = isReplyStreaming && index === messages.length - 1;
              return (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <div className="chat-message-header">
                    <span className="message-role">{message.role === "assistant" ? personaName : "你"}</span>
                    {message.role === "assistant" ? (
                      <button
                        className={`message-voice-button ${voiceState ? `is-${voiceState}` : ""}`}
                        type="button"
                        title={voiceState === "playing" ? "停止播放" : voiceState === "loading" ? "正在生成语音" : voiceState === "error" ? "重试语音" : "朗读这条回复"}
                        aria-label={voiceState === "playing" ? "停止播放" : "朗读这条回复"}
                        disabled={!voiceEnabled || !message.content.trim() || replyStillStreaming}
                        onClick={() => void handleMessageVoice(index, message.content)}
                      >
                        {voiceState === "loading" ? <LoaderCircle size={15} /> : voiceState === "playing" ? <Square size={13} /> : voiceState === "error" ? <RotateCcw size={15} /> : <Volume2 size={16} />}
                      </button>
                    ) : null}
                  </div>
                  <p>{message.content}</p>
                </article>
              );
            })}
          </div>

          <form className="chat-window-composer" onSubmit={handleSend}>
            <textarea
              ref={composerRef}
              placeholder={`和 ${personaName} 说点什么...`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={4}
            />
            {voiceInputMessage ? <p className="voice-input-feedback">{voiceInputMessage}</p> : null}
            <div className="chat-composer-footer">
              <span>Enter 发送 · Shift + Enter 换行</span>
              <div className="chat-composer-actions">
                <button
                  className={`voice-input-button ${recordingVoiceInput ? "is-recording" : ""}`}
                  type="button"
                  title={recordingVoiceInput ? "停止录音" : "语音输入"}
                  aria-label={recordingVoiceInput ? "停止录音" : "语音输入"}
                  disabled={transcribingVoiceInput}
                  onClick={() => void startVoiceInput()}
                >
                  {transcribingVoiceInput ? <LoaderCircle size={17} /> : recordingVoiceInput ? <Square size={15} /> : <Mic size={18} />}
                  <span>{transcribingVoiceInput ? "识别中" : recordingVoiceInput ? "停止" : "语音"}</span>
                </button>
                <button className="chat-send-button" type="submit" disabled={sending || !input.trim()}>
                  <Send size={16} />{sending ? "思考中" : "发送"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
