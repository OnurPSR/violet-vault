import {
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Library,
  Menu,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { CSSProperties, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import CodexTerminal from "./CodexTerminal";
import CodexTranscript from "./CodexTranscript";
import type { AgentId, AppState, Attachment, CliStatus, Conversation, Effort, Message, Note, ProviderId, RunRequest } from "./types";

type ModelOption = { label: string; value: string };
type Provider = { label: string; models: ModelOption[] };

const AGENTS = [
  { id: "retriever" as AgentId, name: "Note Retriever", mode: "Read only", text: "Find concepts, answer questions and surface related notes or figures.", icon: Search, color: "#8b7cff" },
  { id: "editor" as AgentId, name: "Scoped Editor", mode: "Patch mode", text: "Refine selected content while preserving unrelated vault material.", icon: SquarePen, color: "#b06cff" },
  { id: "author" as AgentId, name: "Note Author", mode: "Create + append", text: "Create notes, append source-grounded sections and revise additions.", icon: BookOpen, color: "#6d9cff" },
];

const PROVIDERS: Record<ProviderId, Provider> = {
  codex: {
    label: "Codex CLI",
    models: [
      { label: "GPT-5.6 Sol", value: "gpt-5.6-sol" },
      { label: "GPT-5.6 Terra", value: "gpt-5.6-terra" },
      { label: "GPT-5.6 Luna", value: "gpt-5.6-luna" },
      { label: "GPT-5.5", value: "gpt-5.5" },
    ],
  },
  claude: {
    label: "Claude CLI",
    models: [
      { label: "Claude Opus 5", value: "claude-opus-5" },
      { label: "Claude Opus 4.8", value: "claude-opus-4-8" },
      { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
    ],
  },
  local: { label: "Local LLM", models: [{ label: "Coming later", value: "coming-later" }] },
};

const SUGGESTIONS: Record<AgentId, string[]> = {
  retriever: ["Find my explanation of embedding space", "Which note contains this figure?", "Connect attention to matrix multiplication"],
  editor: ["Clarify this derivation without changing its structure", "Fix the selected note’s broken embeds", "Improve the explanation of this equation"],
  author: ["Append these pages to the selected note", "Create a note from these handwritten images", "Revise only the section added in this conversation"],
};

const MAX_TERMINAL_TRANSCRIPT_CHARS = 8 * 1024 * 1024;
const uid = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const age = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}m` : minutes < 1_440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1_440)}d`;
};

function validModel(provider: ProviderId, model: string) {
  return PROVIDERS[provider].models.some((item) => item.value === model) ? model : PROVIDERS[provider].models[0].value;
}

export default function App() {
  const [agentId, setAgentId] = useState<AgentId>("retriever");
  const [provider, setProvider] = useState<ProviderId>("codex");
  const [model, setModel] = useState("gpt-5.6-sol");
  const [effort, setEffort] = useState<Effort>("high");
  const [chats, setChats] = useState<Conversation[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<Attachment[]>([]);
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("No vault selected");
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [terminalRequest, setTerminalRequest] = useState<RunRequest | null>(null);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalReplay, setTerminalReplay] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vaultMenuOpen, setVaultMenuOpen] = useState(false);
  const [cliRefreshing, setCliRefreshing] = useState(false);
  const [ready, setReady] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const terminalTranscript = useRef("");
  const terminalChatId = useRef<string | null>(null);
  const terminalSaveTimer = useRef<number | null>(null);
  const agent = AGENTS.find((item) => item.id === agentId) ?? AGENTS[0];
  const AgentIcon = agent.icon;
  const filtered = useMemo(
    () => notes.filter((item) => item.path.toLowerCase().includes(query.toLowerCase())).slice(0, 500),
    [notes, query],
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const [state, status] = await Promise.all([window.violet.getState(), window.violet.checkCli()]);
        if (cancelled) return;
        setChats(state.conversations ?? []);
        setAgentId(state.agentId);
        setProvider(state.provider);
        setModel(validModel(state.provider, state.model));
        setEffort(state.effort);
        setCliStatus(status);
        if (state.vaultPath) {
          const restored = await window.violet.restoreVault(state.vaultPath);
          if (!cancelled && restored) {
            setVaultPath(restored.vaultPath);
            setVaultName(restored.vaultName);
            setNotes(restored.notes);
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load local application state.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const state: AppState = { conversations: chats, vaultPath, agentId, provider, model, effort };
    const timer = setTimeout(() => {
      window.violet.saveState(state).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to save chat history."));
    }, 180);
    return () => clearTimeout(timer);
  }, [agentId, chats, effort, model, provider, ready, vaultPath]);

  useEffect(() => () => {
    if (terminalSaveTimer.current !== null) window.clearTimeout(terminalSaveTimer.current);
  }, []);

  useEffect(() => {
    scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "smooth" });
  }, [messages, running]);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void fresh();
      }
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  function upsertConversation(next: Message[], title: string, id: string, extra: Partial<Pick<Conversation, "terminalTranscript">> = {}) {
    setChatId(id);
    setChats((all) => {
      const previous = all.find((chat) => chat.id === id);
      const item: Conversation = {
        ...previous,
        id,
        title: title.trim().replace(/\s+/g, " ").slice(0, 52) || "Untitled conversation",
        agent: agentId,
        provider,
        model,
        effort,
        messages: next,
        updatedAt: Date.now(),
        ...extra,
      };
      return [item, ...all.filter((chat) => chat.id !== id)];
    });
  }

  function persistTerminalTranscript(markUpdated = false) {
    if (terminalSaveTimer.current !== null) {
      window.clearTimeout(terminalSaveTimer.current);
      terminalSaveTimer.current = null;
    }
    const id = terminalChatId.current;
    if (!id) return;
    const transcript = terminalTranscript.current;
    setChats((all) => all.map((chat) => chat.id === id
      ? { ...chat, terminalTranscript: transcript, updatedAt: markUpdated ? Date.now() : chat.updatedAt }
      : chat));
  }

  function captureTerminalData(data: string) {
    const remaining = MAX_TERMINAL_TRANSCRIPT_CHARS - terminalTranscript.current.length;
    if (remaining > 0) terminalTranscript.current += data.slice(0, remaining);
    if (terminalSaveTimer.current === null) {
      terminalSaveTimer.current = window.setTimeout(() => persistTerminalTranscript(), 300);
    }
  }

  async function fresh(nextAgent = agentId) {
    if (terminalRequest) {
      persistTerminalTranscript(true);
      if (terminalSessionId) await window.violet.closeTerminal(terminalSessionId);
      setTerminalRequest(null);
      setTerminalSessionId(null);
    } else if (running) {
      await window.violet.stopAgent();
    }
    setRunning(false);
    setChatId(null);
    setMessages([]);
    setTerminalReplay(null);
    terminalTranscript.current = "";
    terminalChatId.current = null;
    setPrompt("");
    setImages([]);
    setEditing(null);
    setError(null);
    setAgentId(nextAgent);
    setMenu(false);
    setSettingsOpen(false);
    setVaultMenuOpen(false);
  }

  function openChat(chat: Conversation) {
    if (running || terminalRequest) return;
    setChatId(chat.id);
    setAgentId(chat.agent);
    setProvider(chat.provider);
    setModel(validModel(chat.provider, chat.model));
    setEffort(chat.effort);
    setMessages(chat.messages);
    setTerminalReplay(chat.provider === "codex" && chat.terminalTranscript ? chat.terminalTranscript : null);
    setEditing(null);
    setError(null);
    setMenu(false);
  }

  function chooseProvider(next: ProviderId) {
    setProvider(next);
    setModel(PROVIDERS[next].models[0].value);
    setError(null);
  }

  async function send() {
    const text = prompt.trim();
    if (!text || running) return;
    if (editing) {
      const next = messages.map((message) => message.id === editing ? { ...message, content: text } : message);
      setMessages(next);
      upsertConversation(next, next.find((message) => message.role === "user")?.content ?? text, chatId ?? uid());
      setEditing(null);
      setPrompt("");
      return;
    }
    if (!vaultPath) return setError("Select an Obsidian vault before running an agent.");
    if (provider === "local") return setError("Local LLM support is display-only for now.");
    if (!cliStatus?.[provider].installed) return setError(`${PROVIDERS[provider].label} is not installed or is not available on PATH.`);

    if (provider === "codex") {
      const runChatId = chatId ?? uid();
      const userMessage: Message = { id: uid(), role: "user", content: text, createdAt: Date.now() };
      const staged = [...messages, userMessage];
      terminalChatId.current = runChatId;
      terminalTranscript.current = "";
      setTerminalReplay(null);
      setMessages(staged);
      upsertConversation(staged, messages.find((message) => message.role === "user")?.content ?? text, runChatId, { terminalTranscript: "" });
      setTerminalRequest({
        agentId,
        provider,
        model,
        effort,
        vaultPath,
        notePath: note?.path ?? null,
        messages,
        prompt: text,
        images,
      });
      setTerminalSessionId(null);
      setPrompt("");
      setImages([]);
      setRunning(true);
      setError(null);
      return;
    }

    const runChatId = chatId ?? uid();
    const userMessage: Message = { id: uid(), role: "user", content: text, createdAt: Date.now() };
    const staged = [...messages, userMessage];
    const priorMessages = messages;
    const currentImages = images;
    setMessages(staged);
    upsertConversation(staged, messages.find((message) => message.role === "user")?.content ?? text, runChatId);
    setPrompt("");
    setRunning(true);
    setError(null);

    try {
      const result = await window.violet.runAgent({
        agentId,
        provider,
        model,
        effort,
        vaultPath,
        notePath: note?.path ?? null,
        messages: priorMessages,
        prompt: text,
        images: currentImages,
      });
      const assistantMessage: Message = { id: uid(), role: "assistant", content: result.output, createdAt: Date.now() };
      const completed = [...staged, assistantMessage];
      setMessages(completed);
      upsertConversation(completed, staged.find((message) => message.role === "user")?.content ?? text, runChatId);
      setImages([]);
      if (vaultPath) {
        const refreshed = await window.violet.restoreVault(vaultPath);
        if (refreshed) setNotes(refreshed.notes);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent run failed.");
    } finally {
      setRunning(false);
    }
  }

  async function stop() {
    await window.violet.stopAgent();
    setRunning(false);
  }

  function terminalExited() {
    persistTerminalTranscript(true);
    setRunning(false);
    if (vaultPath) {
      void window.violet.restoreVault(vaultPath).then((refreshed) => {
        if (refreshed) setNotes(refreshed.notes);
      });
    }
  }

  function terminalFailed(cause: Error) {
    persistTerminalTranscript(true);
    setRunning(false);
    setError(cause.message);
  }

  function closeTerminalView() {
    persistTerminalTranscript(true);
    setTerminalReplay(terminalTranscript.current || null);
    setTerminalRequest(null);
    setTerminalSessionId(null);
    setRunning(false);
  }

  function addImages(next: Attachment[]) {
    setImages((all) => {
      const seen = new Set(all.map((item) => item.path));
      return [...all, ...next.filter((item) => item.type.startsWith("image/") && !seen.has(item.path))].slice(0, 12);
    });
  }

  async function attachImages() {
    addImages(await window.violet.chooseImages());
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer.files).flatMap((file) => {
      const filePath = window.violet.pathForFile(file);
      return filePath && file.type.startsWith("image/")
        ? [{ name: file.name, path: filePath, size: file.size, type: file.type }]
        : [];
    });
    addImages(dropped);
  }

  function key(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function selectVault() {
    setError(null);
    setSettingsOpen(false);
    setVaultMenuOpen(false);
    try {
      const selected = await window.violet.chooseVault();
      if (!selected) return;
      setVaultPath(selected.vaultPath);
      setVaultName(selected.vaultName);
      setNotes(selected.notes);
      setNote(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open this vault.");
    }
  }

  async function openNote(selected: Note) {
    if (!vaultPath) return;
    try {
      const result = await window.violet.readNote(vaultPath, selected.path);
      setNote({ ...selected, content: result.content });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read the selected note.");
    }
  }

  async function refreshCliStatus() {
    setCliRefreshing(true);
    setError(null);
    try {
      setCliStatus(await window.violet.checkCli());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh CLI status.");
    } finally {
      setCliRefreshing(false);
    }
  }

  async function refreshVault() {
    if (!vaultPath) return;
    setError(null);
    setVaultMenuOpen(false);
    try {
      const refreshed = await window.violet.restoreVault(vaultPath);
      if (!refreshed) throw new Error("The selected vault is no longer available.");
      setVaultName(refreshed.vaultName);
      setNotes(refreshed.notes);
      if (note) {
        const selected = refreshed.notes.find((item) => item.path === note.path);
        if (selected) await openNote(selected);
        else setNote(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh the vault.");
    }
  }

  const activeCli = provider === "local" ? null : cliStatus?.[provider];
  const bridgeText = provider === "local"
    ? "Display only"
    : activeCli?.installed
      ? activeCli.version ?? `${PROVIDERS[provider].label} ready`
      : `${PROVIDERS[provider].label} not found`;
  const canSend = Boolean(prompt.trim() && vaultPath && provider !== "local" && activeCli?.installed);
  const sessionLocked = running || Boolean(terminalRequest) || Boolean(terminalReplay);

  return (
    <main className="app-shell">
      <aside className={`agent-sidebar ${menu ? "mobile-open" : ""}`}>
        <div className="sidebar-heading">
          <div><span className="micro-label">LOCAL WORKSPACE</span><h1>Violet Vault</h1></div>
          <button className="icon-button mobile-close" onClick={() => setMenu(false)}><X size={18} /></button>
        </div>
        <button className="new-chat-button" onClick={() => void fresh()}><Plus size={17} />New conversation<span>Ctrl N</span></button>
        <section className="sidebar-section">
          <div className="section-label"><span>AGENTS</span></div>
          <div className="agent-list">
            {AGENTS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`agent-item ${agentId === item.id ? "active" : ""}`} onClick={() => chatId || terminalRequest ? void fresh(item.id) : setAgentId(item.id)}>
                  <span className="agent-icon" style={{ "--agent-color": item.color } as CSSProperties}><Icon size={17} /></span>
                  <span><strong>{item.name}</strong><small>{item.mode}</small></span>
                  <ChevronRight size={15} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="sidebar-section recent-section">
          <div className="section-label"><span>CHAT HISTORY</span><Clock3 size={14} /></div>
          <div className="recent-list">
            {chats.length === 0 && <p className="history-empty">New conversations will stay on this computer.</p>}
            {chats.slice(0, 12).map((chat) => <button key={chat.id} className={chatId === chat.id ? "active" : ""} onClick={() => openChat(chat)}><span>{chat.title}</span><small>{age(chat.updatedAt)}</small></button>)}
          </div>
        </section>
        {settingsOpen && (
          <div className="settings-popover" role="dialog" aria-label="Local workspace settings">
            <div className="popover-heading"><div><span className="micro-label">SETTINGS</span><strong>Local connections</strong></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={15} /></button></div>
            <div className="connection-list">
              <div><span className={`status-dot ${cliStatus?.codex.installed ? "connected" : ""}`} /><span><strong>Codex CLI</strong><small>{cliStatus?.codex.version ?? "Not found"}</small></span></div>
              <div><span className={`status-dot ${cliStatus?.claude.installed ? "connected" : ""}`} /><span><strong>Claude CLI</strong><small>{cliStatus?.claude.version ?? "Not found"}</small></span></div>
            </div>
            <button className="popover-action" disabled={cliRefreshing} onClick={() => void refreshCliStatus()}><RefreshCw size={14} className={cliRefreshing ? "spin" : ""} />{cliRefreshing ? "Checking…" : "Refresh CLI status"}</button>
            <button className="popover-action" disabled={sessionLocked} onClick={() => void selectVault()}><FolderOpen size={14} />Change vault</button>
          </div>
        )}
        <div className="sidebar-footer">
          <span className={`status-dot ${running ? "running" : activeCli?.installed ? "connected" : ""}`} />
          <div><strong>{running ? "Agent running" : "Local bridge"}</strong><small>{running ? `${agent.name} · ${PROVIDERS[provider].label}` : bridgeText}</small></div>
          <button className={`icon-button ${settingsOpen ? "active" : ""}`} onClick={() => setSettingsOpen((open) => !open)} title="Settings" aria-label="Open settings" aria-expanded={settingsOpen}><Settings2 size={16} /></button>
        </div>
      </aside>

      <section className="chat-workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenu(true)}><Menu size={19} /></button>
          <div className="agent-title"><span className="title-icon"><AgentIcon size={18} /></span><div><strong>{agent.name}</strong><small>{agent.text}</small></div></div>
          <div className="model-controls" aria-label="Model settings">
            <label className="select-control provider-select">
              <Bot size={17} />
              <span className="select-copy"><small>Provider</small><select aria-label="Provider" value={provider} disabled={sessionLocked} onChange={(event) => chooseProvider(event.target.value as ProviderId)}>{Object.entries(PROVIDERS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></span>
              <ChevronDown size={14} />
            </label>
            <label className="select-control model-select">
              <span className="select-copy"><small>Model</small><select aria-label="Model" value={model} disabled={sessionLocked || provider === "local"} onChange={(event) => setModel(event.target.value)}>{PROVIDERS[provider].models.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></span>
              <ChevronDown size={14} />
            </label>
            <label className="select-control effort-select">
              <BrainCircuit size={17} />
              <span className="select-copy"><small>Reasoning</small><select aria-label="Reasoning effort" value={effort} disabled={sessionLocked || provider === "local"} onChange={(event) => setEffort(event.target.value as Effort)}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></span>
              <ChevronDown size={14} />
            </label>
          </div>
        </header>

        <div className={`chat-scroll ${terminalRequest || terminalReplay ? "terminal-mode" : ""}`} ref={scrollArea}>
          {terminalRequest ? (
            <div className="terminal-workspace">
              {error && <div className="error-banner terminal-error"><span>{error}</span><button onClick={() => setError(null)}><X size={13} /></button></div>}
              <CodexTerminal
                request={terminalRequest}
                onStarted={(id) => { setTerminalSessionId(id); setRunning(true); }}
                onData={captureTerminalData}
                onExit={() => terminalExited()}
                onError={terminalFailed}
                onClose={closeTerminalView}
              />
            </div>
          ) : terminalReplay ? (
            <div className="terminal-workspace"><CodexTranscript transcript={terminalReplay} /></div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-orb"><Sparkles size={24} /></div>
              <p className="micro-label">{agent.mode}</p>
              <h2>What are we working on?</h2>
              <p>{agent.text} Select a vault note, attach handwritten pages, or start with a question.</p>
              <div className="suggestion-grid">{SUGGESTIONS[agentId].map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)}><AgentIcon size={15} />{suggestion}</button>)}</div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">{message.role === "user" ? "O" : <Sparkles size={15} />}</div>
                  <div className="message-content"><div className="message-meta"><strong>{message.role === "user" ? "You" : agent.name}</strong><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div><p>{message.content}</p></div>
                  {message.role === "user" && <button className="message-edit" disabled={running} onClick={() => { setEditing(message.id); setPrompt(message.content); }} title="Edit question"><Pencil size={14} /></button>}
                </article>
              ))}
              {running && <div className="thinking"><i /><i /><i />Running {PROVIDERS[provider].label}</div>}
            </div>
          )}
        </div>

        {!terminalRequest && !terminalReplay && (
          <div className="composer-region">
            {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}><X size={13} /></button></div>}
            <div className={`composer ${dragging ? "dragging" : ""} ${editing ? "editing" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}>
              {editing && <div className="editing-banner"><Pencil size={13} />Editing stored question<button onClick={() => { setEditing(null); setPrompt(""); }}><X size={13} /></button></div>}
              {images.length > 0 && <div className="attachment-row">{images.map((image, index) => <div className="attachment-chip" key={image.path}><span><ImageIcon size={15} /></span><div><strong>{image.name}</strong><small>{Math.ceil(image.size / 1024)} KB</small></div><button onClick={() => setImages((all) => all.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></div>)}</div>}
              {dragging && <div className="drop-overlay"><ImageIcon size={24} /><strong>Drop handwritten pages here</strong></div>}
              <textarea value={prompt} disabled={running} onChange={(event) => setPrompt(event.target.value)} onKeyDown={key} placeholder={`Message ${agent.name}…`} rows={3} />
              <div className="composer-tools">
                <div><button className="composer-button" onClick={() => void attachImages()} disabled={running} title="Attach images"><Paperclip size={17} /></button>{note && <span className="context-pill"><FileText size={13} />{note.name}<button onClick={() => setNote(null)}><X size={12} /></button></span>}</div>
                <div className="send-area"><span>↵ Send · ⇧↵ New line</span>{running ? <button className="send-button stop" onClick={() => void stop()} title="Stop agent"><CircleStop size={17} /></button> : <button className="send-button" onClick={() => void send()} disabled={editing ? !prompt.trim() : !canSend} title={canSend || editing ? "Send" : "Select a vault and install the selected CLI"}><Send size={17} /></button>}</div>
              </div>
            </div>
            <p className="composer-hint">{agentId === "retriever" ? "Retriever starts in read-only mode." : "Writes start vault-scoped; Codex will surface any approval it needs inside the terminal."}</p>
          </div>
        )}
      </section>

      <aside className="context-panel">
        <div className="context-heading"><div><span className="micro-label">CONTEXT</span><h2>Obsidian Vault</h2></div><div className="vault-actions"><button className={`icon-button ${vaultMenuOpen ? "active" : ""}`} title="Vault actions" aria-label="Open vault actions" aria-expanded={vaultMenuOpen} onClick={() => setVaultMenuOpen((open) => !open)}><MoreHorizontal size={17} /></button>{vaultMenuOpen && <div className="vault-menu"><button disabled={!vaultPath || sessionLocked} onClick={() => void refreshVault()}><RefreshCw size={14} />Refresh notes</button><button disabled={sessionLocked} onClick={() => void selectVault()}><FolderOpen size={14} />Change vault</button><button disabled={!note || sessionLocked} onClick={() => { setNote(null); setVaultMenuOpen(false); }}><X size={14} />Clear selected note</button></div>}</div></div>
        <button className="vault-picker" disabled={sessionLocked} onClick={() => void selectVault()}><span className="vault-icon"><Library size={19} /></span><span><small>ACTIVE VAULT</small><strong>{vaultName}</strong></span><FolderOpen size={17} /></button>
        <div className="note-search"><Search size={15} /><input ref={searchInput} disabled={sessionLocked} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /><span>Ctrl K</span></div>
        <div className="file-browser">
          {notes.length === 0 ? (
            <div className="vault-empty"><Folder size={30} /><strong>Choose your vault</strong><p>Open a local folder to browse Markdown notes and pass one as agent context.</p><button onClick={() => void selectVault()}>Select folder</button></div>
          ) : (
            <><div className="browser-summary"><span>{filtered.length}{filtered.length < notes.length ? ` of ${notes.length}` : ""} notes</span><span>Markdown</span></div><div className="note-list">{filtered.map((item) => <button key={item.path} disabled={sessionLocked} className={note?.path === item.path ? "active" : ""} onClick={() => void openNote(item)}><FileText size={15} /><span><strong>{item.name}</strong><small>{item.path.split("/").slice(0, -1).join(" / ") || "Vault root"}</small></span></button>)}</div></>
          )}
        </div>
        <div className="selected-context">
          <div className="section-label"><span>SELECTED NOTE</span><ChevronDown size={14} /></div>
          {note ? <div className="note-preview"><div><FileText size={17} /><span><strong>{note.name}</strong><small>{note.path}</small></span></div><p>{note.content?.slice(0, 220).replace(/[#*`>-]/g, " ") || "Note selected as model context."}</p></div> : <p className="no-context">No note selected. Choose a Markdown file from the vault browser.</p>}
        </div>
      </aside>
    </main>
  );
}
