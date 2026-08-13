import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Clock3,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Eye,
  Library,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { CSSProperties, DragEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import CodexTerminal from "./CodexTerminal";
import CodexTranscript from "./CodexTranscript";
import RichMessage from "./RichMessage";
import TokenUsageSummary from "./TokenUsageSummary";
import type { AgentId, AppState, Attachment, CliStatus, Conversation, Effort, Message, Note, ProviderId, RunRequest, TerminalExitEvent, TokenUsage } from "./types";
import { buildEditContext } from "./edit-context";

type ModelOption = { label: string; value: string };
type Provider = { label: string; models: ModelOption[] };
type FolderEntry = { name: string; path: string; noteCount: number };
type SelectedFigure = { path: string; alt: string; dataUrl: string };

const AGENTS = [
  { id: "retriever" as AgentId, name: "Note Retriever", mode: "Read only", text: "Find concepts, answer questions and surface related notes or figures.", icon: Search, color: "#8b7cff" },
  { id: "author-editor" as AgentId, name: "Note Author–Editor", mode: "Author + edit", text: "Append, reconstruct, insert, or make scoped edits in a selected vault note.", icon: SquarePen, color: "#b06cff" },
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
  "author-editor": ["Append these pages to the selected note", "Clarify the selected derivation", "Insert an explanation after the selected section"],
};

const MAX_TERMINAL_TRANSCRIPT_CHARS = 2 * 1024 * 1024;
const TERMINAL_TRUNCATION_NOTICE = "\r\n[Earlier terminal output omitted to keep local chat history within its storage limit.]\r\n";
const STREAM_RENDER_INTERVAL_MS = 50;
const TERMINAL_PERSIST_INTERVAL_MS = 5_000;
const LEFT_PANEL_MIN_WIDTH = 220;
const LEFT_PANEL_MAX_WIDTH = 420;
const RIGHT_PANEL_MIN_WIDTH = 260;
const RIGHT_PANEL_MAX_WIDTH = 480;
const MIN_CHAT_WIDTH = 420;

type TerminalTranscriptBuffer = {
  chunks: string[];
  head: number;
  headOffset: number;
  length: number;
  truncated: boolean;
};

function createTerminalTranscriptBuffer(): TerminalTranscriptBuffer {
  return { chunks: [], head: 0, headOffset: 0, length: 0, truncated: false };
}

function appendTerminalTranscript(buffer: TerminalTranscriptBuffer, data: string) {
  if (!data) return;
  buffer.chunks.push(data);
  buffer.length += data.length;
  const payloadLimit = MAX_TERMINAL_TRANSCRIPT_CHARS - TERMINAL_TRUNCATION_NOTICE.length;

  while (buffer.length > payloadLimit && buffer.head < buffer.chunks.length) {
    const chunk = buffer.chunks[buffer.head];
    const available = chunk.length - buffer.headOffset;
    const removed = Math.min(buffer.length - payloadLimit, available);
    buffer.headOffset += removed;
    buffer.length -= removed;
    buffer.truncated = true;
    if (buffer.headOffset === chunk.length) {
      buffer.head += 1;
      buffer.headOffset = 0;
    }
  }

  if (buffer.head > 1_024 && buffer.head * 2 > buffer.chunks.length) {
    buffer.chunks = buffer.chunks.slice(buffer.head);
    buffer.head = 0;
  }
}

function terminalTranscriptText(buffer: TerminalTranscriptBuffer) {
  const chunks = buffer.chunks.slice(buffer.head);
  if (chunks.length > 0 && buffer.headOffset > 0) chunks[0] = chunks[0].slice(buffer.headOffset);
  return `${buffer.truncated ? TERMINAL_TRUNCATION_NOTICE : ""}${chunks.join("")}`;
}

const uid = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const age = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  return minutes < 60 ? `${minutes}m` : minutes < 1_440 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1_440)}d`;
};

function validModel(provider: ProviderId, model: string) {
  return PROVIDERS[provider].models.some((item) => item.value === model) ? model : PROVIDERS[provider].models[0].value;
}

type SelectMenuProps = {
  label: string;
  value: string;
  options: ModelOption[];
  className: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

function SelectMenu({ label, value, options, className, disabled = false, onChange }: SelectMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function dismiss(event: globalThis.PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus());
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".select-option") ?? []);
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
    items[next].focus();
  }

  function choose(value: string) {
    onChange(value);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className={`select-control ${className} ${open ? "open" : ""}`} ref={root} onKeyDown={moveFocus}>
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        aria-label={label === "Reasoning" ? "Reasoning effort" : label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="select-copy"><small>{label}</small><strong>{selected?.label}</strong></span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="select-menu" role="listbox" aria-label={`${label} options`}>
          {options.map((option) => (
            <button
              type="button"
              className="select-option"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                choose(option.value);
              }}
            >
              <span>{option.label}</span>
              <Check size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [noteInChat, setNoteInChat] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedFigure, setSelectedFigure] = useState<SelectedFigure | null>(null);
  const [noteRevision, setNoteRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderHistory, setFolderHistory] = useState<string[]>([""]);
  const [folderHistoryIndex, setFolderHistoryIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [terminalRequest, setTerminalRequest] = useState<RunRequest | null>(null);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [terminalReplay, setTerminalReplay] = useState<string | null>(null);
  const [terminalTokenUsage, setTerminalTokenUsage] = useState<TokenUsage | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(292);
  const [rightPanelWidth, setRightPanelWidth] = useState(328);
  const [selectedContextOpen, setSelectedContextOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const terminalTranscript = useRef<TerminalTranscriptBuffer>(createTerminalTranscriptBuffer());
  const terminalChatId = useRef<string | null>(null);
  const terminalSaveTimer = useRef<number | null>(null);
  const agent = AGENTS.find((item) => item.id === agentId) ?? AGENTS[0];
  const AgentIcon = agent.icon;
  const searchResults = useMemo(
    () => notes.filter((item) => item.path.toLowerCase().includes(query.toLowerCase())).slice(0, 500),
    [notes, query],
  );
  const folderView = useMemo(() => {
    const prefix = folderPath ? `${folderPath}/` : "";
    const folders = new Map<string, FolderEntry>();
    const directNotes: Note[] = [];

    for (const item of notes) {
      if (!item.path.startsWith(prefix)) continue;
      const remainder = item.path.slice(prefix.length);
      const separator = remainder.indexOf("/");
      if (separator === -1) {
        directNotes.push(item);
        continue;
      }
      const name = remainder.slice(0, separator);
      const path = prefix ? `${folderPath}/${name}` : name;
      const existing = folders.get(path);
      folders.set(path, { name, path, noteCount: (existing?.noteCount ?? 0) + 1 });
    }

    return {
      folders: [...folders.values()].sort((a, b) => a.name.localeCompare(b.name)),
      notes: directNotes.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [folderPath, notes]);
  const folderCrumbs = useMemo(() => {
    const segments = folderPath.split("/").filter(Boolean);
    return segments.map((name, index) => ({ name, path: segments.slice(0, index + 1).join("/") }));
  }, [folderPath]);

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
    if (!stickToBottom.current) return;
    scrollArea.current?.scrollTo({ top: scrollArea.current.scrollHeight, behavior: "auto" });
  }, [messages, running]);

  useEffect(() => {
    const area = scrollArea.current;
    const content = area?.firstElementChild;
    if (!area || !content) return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (!stickToBottom.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (stickToBottom.current) area.scrollTo({ top: area.scrollHeight, behavior: "auto" });
      });
    });
    observer.observe(content);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [chatId, messages.length === 0, terminalRequest, terminalReplay]);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void fresh();
      }
      if (modifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setRightPanelOpen(true);
        requestAnimationFrame(() => searchInput.current?.focus());
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  function upsertConversation(next: Message[], title: string, id: string, extra: Partial<Pick<Conversation, "terminalTranscript" | "terminalTokenUsage">> = {}) {
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

  function persistTerminalTranscript(markUpdated = false, usage = terminalTokenUsage) {
    if (terminalSaveTimer.current !== null) {
      window.clearTimeout(terminalSaveTimer.current);
      terminalSaveTimer.current = null;
    }
    const id = terminalChatId.current;
    if (!id) return;
    const transcript = terminalTranscriptText(terminalTranscript.current);
    setChats((all) => all.map((chat) => chat.id === id
      ? { ...chat, terminalTranscript: transcript, terminalTokenUsage: usage, updatedAt: markUpdated ? Date.now() : chat.updatedAt }
      : chat));
  }

  function captureTerminalData(data: string) {
    appendTerminalTranscript(terminalTranscript.current, data);
    if (terminalSaveTimer.current === null) {
      terminalSaveTimer.current = window.setTimeout(() => persistTerminalTranscript(), TERMINAL_PERSIST_INTERVAL_MS);
    }
  }

  async function refreshVaultContent() {
    if (!vaultPath) return;
    const refreshed = await window.violet.restoreVault(vaultPath);
    if (!refreshed) return;
    setNotes(refreshed.notes);
    if (note && refreshed.notes.some((item) => item.path === note.path)) {
      const result = await window.violet.readNote(vaultPath, note.path);
      setNote((current) => current?.path === note.path ? { ...current, content: result.content } : current);
      setNoteRevision((revision) => revision + 1);
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
    setTerminalTokenUsage(null);
    terminalTranscript.current = createTerminalTranscriptBuffer();
    terminalChatId.current = null;
    setPrompt("");
    setImages([]);
    setNoteInChat(false);
    setSelectedText("");
    setSelectedFigure(null);
    setEditing(null);
    setError(null);
    setAgentId(nextAgent);
    setMenu(false);
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
    setTerminalTokenUsage(chat.terminalTokenUsage ?? null);
    setEditing(null);
    setError(null);
    setMenu(false);
  }

  async function deleteChat(chat: Conversation) {
    if (!window.confirm(`Delete “${chat.title}”? This cannot be undone.`)) return;
    if (chat.id === chatId) await fresh();
    setChats((all) => all.filter((item) => item.id !== chat.id));
  }

  function chooseProvider(next: ProviderId) {
    setProvider(next);
    setModel(PROVIDERS[next].models[0].value);
    setError(null);
  }

  function resetFolderNavigation() {
    setFolderPath("");
    setFolderHistory([""]);
    setFolderHistoryIndex(0);
    setQuery("");
  }

  function navigateFolder(nextPath: string) {
    if (nextPath === folderPath) {
      setQuery("");
      return;
    }
    const nextHistory = [...folderHistory.slice(0, folderHistoryIndex + 1), nextPath];
    setFolderHistory(nextHistory);
    setFolderHistoryIndex(nextHistory.length - 1);
    setFolderPath(nextPath);
    setQuery("");
  }

  function moveFolderHistory(offset: -1 | 1) {
    const nextIndex = folderHistoryIndex + offset;
    if (nextIndex < 0 || nextIndex >= folderHistory.length) return;
    setFolderHistoryIndex(nextIndex);
    setFolderPath(folderHistory[nextIndex]);
    setQuery("");
  }

  async function send() {
    const text = prompt.trim();
    const promptlessReconstruction = agentId === "author-editor" && images.length > 0 && Boolean(note);
    if ((!text && !promptlessReconstruction) || running) return;
    stickToBottom.current = true;
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
    if (agentId === "author-editor" && images.length > 0 && !note) {
      return setError("Select the target note before sending handwritten pages.");
    }

    const editContext = agentId === "author-editor"
      ? buildEditContext(note?.content, selectedText, selectedFigure)
      : undefined;

    if (provider === "codex" && agentId !== "retriever") {
      const runChatId = chatId ?? uid();
      const userMessage: Message = { id: uid(), role: "user", content: text || "Reconstruct attached handwritten pages", createdAt: Date.now() };
      const staged = [...messages, userMessage];
      terminalChatId.current = runChatId;
      terminalTranscript.current = createTerminalTranscriptBuffer();
      setTerminalTokenUsage(null);
      setTerminalReplay(null);
      setMessages(staged);
      upsertConversation(staged, messages.find((message) => message.role === "user")?.content ?? text, runChatId, { terminalTranscript: "", terminalTokenUsage: null });
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
        editContext,
      });
      setTerminalSessionId(null);
      setPrompt("");
      setImages([]);
      setSelectedText("");
      setSelectedFigure(null);
      setRunning(true);
      setError(null);
      return;
    }

    const runChatId = chatId ?? uid();
    const userMessage: Message = { id: uid(), role: "user", content: text || "Reconstruct attached handwritten pages", createdAt: Date.now() };
    const assistantMessage: Message = { id: uid(), role: "assistant", content: "", createdAt: Date.now() };
    const staged = [...messages, userMessage, assistantMessage];
    const priorMessages = messages;
    const currentImages = images;
    setMessages(staged);
    upsertConversation(staged, messages.find((message) => message.role === "user")?.content ?? text, runChatId);
    setPrompt("");
    setRunning(true);
    setError(null);

    let activeStreamItem: string | null = null;
    let renderedStreamContent = "";
    let replacementStreamContent: string | null = null;
    let pendingStreamDeltas: string[] = [];
    let streamRenderTimer: number | null = null;
    let streamClosed = false;

    const renderPendingStream = () => {
      streamRenderTimer = null;
      if (replacementStreamContent !== null) {
        renderedStreamContent = replacementStreamContent;
        replacementStreamContent = null;
        pendingStreamDeltas = [];
      } else if (pendingStreamDeltas.length > 0) {
        renderedStreamContent += pendingStreamDeltas.join("");
        pendingStreamDeltas = [];
      } else {
        return;
      }
      const content = renderedStreamContent;
      setMessages((current) => current.map((message) => message.id === assistantMessage.id ? { ...message, content } : message));
    };

    const scheduleStreamRender = () => {
      if (streamRenderTimer === null) streamRenderTimer = window.setTimeout(renderPendingStream, STREAM_RENDER_INTERVAL_MS);
    };

    const removeStream = window.violet.onAgentStream((event) => {
      if (event.content !== undefined) {
        activeStreamItem = event.itemId;
        replacementStreamContent = event.content;
        pendingStreamDeltas = [];
        scheduleStreamRender();
        return;
      }
      if (event.delta === undefined) return;
      if (activeStreamItem !== event.itemId) {
        activeStreamItem = event.itemId;
        renderedStreamContent = "";
        replacementStreamContent = null;
        pendingStreamDeltas = [];
      }
      pendingStreamDeltas.push(event.delta);
      scheduleStreamRender();
    });

    const closeStream = () => {
      if (streamClosed) return;
      streamClosed = true;
      removeStream();
      if (streamRenderTimer !== null) {
        window.clearTimeout(streamRenderTimer);
        streamRenderTimer = null;
      }
    };

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
        editContext,
      });
      closeStream();
      const completed = staged.map((message) => message.id === assistantMessage.id
        ? { ...message, content: result.output, tokenUsage: result.tokenUsage ?? null }
        : message);
      setMessages(completed);
      upsertConversation(completed, staged.find((message) => message.role === "user")?.content ?? text, runChatId);
      setImages([]);
      setSelectedText("");
      setSelectedFigure(null);
      await refreshVaultContent();
    } catch (cause) {
      closeStream();
      const failed = staged.filter((message) => message.id !== assistantMessage.id);
      setMessages(failed);
      upsertConversation(failed, failed.find((message) => message.role === "user")?.content ?? text, runChatId);
      setError(cause instanceof Error ? cause.message : "The agent run failed.");
    } finally {
      closeStream();
      setRunning(false);
    }
  }

  async function stop() {
    await window.violet.stopAgent();
    setRunning(false);
  }

  function terminalExited(event: TerminalExitEvent) {
    const usage = event.tokenUsage ?? null;
    setTerminalTokenUsage(usage);
    persistTerminalTranscript(true, usage);
    setTerminalReplay(terminalTranscriptText(terminalTranscript.current) || null);
    setTerminalRequest(null);
    setTerminalSessionId(null);
    setRunning(false);
    void refreshVaultContent().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to refresh the edited note."));
  }

  function terminalFailed(cause: Error) {
    persistTerminalTranscript(true);
    setRunning(false);
    setError(cause.message);
  }

  function closeTerminalView() {
    persistTerminalTranscript(true);
    setTerminalReplay(terminalTranscriptText(terminalTranscript.current) || null);
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
    try {
      const selected = await window.violet.chooseVault();
      if (!selected) return;
      setVaultPath(selected.vaultPath);
      setVaultName(selected.vaultName);
      setNotes(selected.notes);
      setNote(null);
      setNoteInChat(false);
      setSelectedText("");
      setSelectedFigure(null);
      resetFolderNavigation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open this vault.");
    }
  }

  async function openNote(selected: Note) {
    if (!vaultPath) return;
    try {
      const result = await window.violet.readNote(vaultPath, selected.path);
      setNote({ ...selected, content: result.content });
      setSelectedContextOpen(true);
      setNoteInChat(false);
      setSelectedText("");
      setSelectedFigure(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to read the selected note.");
    }
  }

  function toggleNoteView() {
    setNoteInChat((open) => !open);
  }

  function startPanelResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    document.body.classList.add("panel-resizing");
    let frame: number | null = null;
    let pendingWidth = side === "left" ? leftPanelWidth : rightPanelWidth;

    const commit = () => {
      frame = null;
      if (side === "left") setLeftPanelWidth(pendingWidth);
      else setRightPanelWidth(pendingWidth);
    };
    const move = (moveEvent: globalThis.PointerEvent) => {
      const oppositeWidth = side === "left"
        ? (rightPanelOpen ? rightPanelWidth : 0)
        : (leftPanelOpen ? leftPanelWidth : 0);
      const maximumFromViewport = Math.max(
        side === "left" ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH,
        window.innerWidth - oppositeWidth - MIN_CHAT_WIDTH - 10,
      );
      const requested = side === "left" ? moveEvent.clientX : window.innerWidth - moveEvent.clientX;
      const minimum = side === "left" ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH;
      const maximum = Math.min(side === "left" ? LEFT_PANEL_MAX_WIDTH : RIGHT_PANEL_MAX_WIDTH, maximumFromViewport);
      pendingWidth = Math.min(maximum, Math.max(minimum, requested));
      if (frame === null) frame = requestAnimationFrame(commit);
    };
    const stop = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        commit();
      }
      document.body.classList.remove("panel-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizePanelFromKeyboard(side: "left" | "right", event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (side === "left") {
      setLeftPanelWidth((width) => Math.min(LEFT_PANEL_MAX_WIDTH, Math.max(LEFT_PANEL_MIN_WIDTH, width + direction * 12)));
    } else {
      setRightPanelWidth((width) => Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, width - direction * 12)));
    }
  }

  const activeCli = provider === "local" ? null : cliStatus?.[provider];
  const canSend = Boolean(
    (prompt.trim() || (agentId === "author-editor" && images.length > 0 && note))
    && vaultPath
    && provider !== "local"
    && activeCli?.installed,
  );
  const sessionLocked = running || Boolean(terminalRequest) || Boolean(terminalReplay);
  const layoutStyle = {
    "--left-panel-width": leftPanelOpen ? `${leftPanelWidth}px` : "0px",
    "--left-resizer-width": leftPanelOpen ? "5px" : "0px",
    "--right-panel-width": rightPanelOpen ? `${rightPanelWidth}px` : "0px",
    "--right-resizer-width": rightPanelOpen ? "5px" : "0px",
  } as CSSProperties;

  return (
    <main className={`app-shell ${leftPanelOpen ? "" : "left-panel-hidden"} ${rightPanelOpen ? "" : "right-panel-hidden"}`} style={layoutStyle}>
      <aside className={`agent-sidebar ${menu ? "mobile-open" : ""}`}>
        <div className="sidebar-heading">
          <div><h1>Violet Vault</h1></div>
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
            {chats.slice(0, 12).map((chat) => (
              <div key={chat.id} className={`recent-chat ${chatId === chat.id ? "active" : ""}`}>
                <button className="recent-chat-open" onClick={() => openChat(chat)}>
                  <span>{chat.title}</span><small>{age(chat.updatedAt)}</small>
                </button>
                <button className="recent-chat-delete" aria-label={`Delete ${chat.title}`} title="Delete conversation" onClick={() => void deleteChat(chat)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <div
        className="panel-resizer left-resizer"
        role="separator"
        aria-label="Resize primary sidebar"
        aria-orientation="vertical"
        aria-valuemin={LEFT_PANEL_MIN_WIDTH}
        aria-valuemax={LEFT_PANEL_MAX_WIDTH}
        aria-valuenow={leftPanelWidth}
        tabIndex={leftPanelOpen ? 0 : -1}
        onPointerDown={(event) => startPanelResize("left", event)}
        onKeyDown={(event) => resizePanelFromKeyboard("left", event)}
        onDoubleClick={() => setLeftPanelWidth(292)}
      />

      <section className="chat-workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenu(true)}><Menu size={19} /></button>
          <button className="icon-button panel-toggle left-panel-toggle" onClick={() => setLeftPanelOpen((open) => !open)} title={`${leftPanelOpen ? "Hide" : "Show"} primary sidebar`} aria-label={`${leftPanelOpen ? "Hide" : "Show"} primary sidebar`}>
            {leftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <div className="model-controls" aria-label="Model settings">
            <SelectMenu label="Provider" className="provider-select" value={provider} disabled={sessionLocked} options={Object.entries(PROVIDERS).map(([value, item]) => ({ value, label: item.label }))} onChange={(value) => chooseProvider(value as ProviderId)} />
            <SelectMenu label="Model" className="model-select" value={model} disabled={sessionLocked || provider === "local"} options={PROVIDERS[provider].models} onChange={setModel} />
            <SelectMenu label="Reasoning" className="effort-select" value={effort} disabled={sessionLocked || provider === "local"} options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} onChange={(value) => setEffort(value as Effort)} />
          </div>
          <button className="icon-button panel-toggle right-panel-toggle" onClick={() => setRightPanelOpen((open) => !open)} title={`${rightPanelOpen ? "Hide" : "Show"} context sidebar`} aria-label={`${rightPanelOpen ? "Hide" : "Show"} context sidebar`}>
            {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </header>

        <div
          className={`chat-scroll ${terminalRequest || terminalReplay ? "terminal-mode" : ""}`}
          ref={scrollArea}
          onScroll={(event) => {
            const area = event.currentTarget;
            stickToBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 120;
          }}
        >
          {terminalRequest ? (
            <div className="terminal-workspace">
              {error && <div className="error-banner terminal-error"><span>{error}</span><button onClick={() => setError(null)}><X size={13} /></button></div>}
              <div className="terminal-session-pane">
                <CodexTerminal
                  request={terminalRequest}
                  onStarted={(id) => { setTerminalSessionId(id); setRunning(true); }}
                  onData={captureTerminalData}
                  onExit={terminalExited}
                  onError={terminalFailed}
                  onClose={closeTerminalView}
                />
              </div>
            </div>
          ) : terminalReplay ? (
            <div className="terminal-workspace"><CodexTranscript transcript={terminalReplay} tokenUsage={terminalTokenUsage} /></div>
          ) : messages.length === 0 && !noteInChat ? (
            <div className="empty-state">
              <div className="empty-orb"><Sparkles size={24} /></div>
              <p className="micro-label">{agent.mode}</p>
              <h2>What are we working on?</h2>
              <p>{agent.text} Select a vault note, attach handwritten pages, or start with a question.</p>
              <div className="suggestion-grid">{SUGGESTIONS[agentId].map((suggestion) => <button key={suggestion} onClick={() => setPrompt(suggestion)}><AgentIcon size={15} />{suggestion}</button>)}</div>
            </div>
          ) : (
            <div className="message-list">
              {noteInChat && note && (
                <article className="note-in-chat">
                  <header>
                    <div><FileText size={16} /><span><strong>{note.name}</strong><small>{note.path}</small></span></div>
                    <button onClick={() => setNoteInChat(false)} title="Close note view" aria-label="Close note view"><X size={15} /></button>
                  </header>
                  <div className="note-rendered">
                    <RichMessage
                      content={note.content ?? ""}
                      vaultPath={vaultPath}
                      selectable={agentId === "author-editor"}
                      selectedFigure={selectedFigure?.path}
                      assetRevision={noteRevision}
                      onTextSelect={agentId === "author-editor" ? setSelectedText : undefined}
                      onFigureSelect={agentId === "author-editor" ? (figure) => setSelectedFigure((current) => current?.path === figure.path ? null : figure) : undefined}
                    />
                  </div>
                  {agentId === "author-editor" && <footer>Select text or click a figure to scope the next edit.</footer>}
                </article>
              )}
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">{message.role === "user" ? "O" : <Sparkles size={15} />}</div>
                  <div className="message-content">
                    <div className="message-meta"><strong>{message.role === "user" ? "You" : agent.name}</strong><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                    {message.role === "assistant"
                      ? <><RichMessage content={message.content} vaultPath={vaultPath} selectedFigure={selectedFigure?.path} onFigureSelect={agentId === "author-editor" ? (figure) => setSelectedFigure((current) => current?.path === figure.path ? null : figure) : undefined} /><TokenUsageSummary usage={message.tokenUsage} unavailable={message.tokenUsage === null} /></>
                      : <p>{message.content}</p>}
                  </div>
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
              {agentId === "author-editor" && note && (
                <div className="edit-target-tray">
                  <div className="edit-target-heading"><Pencil size={13} /><strong>Edit target</strong>{(selectedText || selectedFigure) && <span>Scoped selection</span>}</div>
                  <div className="edit-target-items">
                    <span className="edit-target-note"><FileText size={14} /><span><strong>{note.name}</strong><small>Selected note</small></span></span>
                    {selectedText && <span className="edit-target-text"><span>“{selectedText.replace(/\s+/g, " ").slice(0, 100)}{selectedText.length > 100 ? "…" : ""}”</span><button onClick={() => setSelectedText("")} aria-label="Remove selected text"><X size={12} /></button></span>}
                    {selectedFigure && <span className="edit-target-figure"><img src={selectedFigure.dataUrl} alt="" /><span><strong>{selectedFigure.alt}</strong><small>Selected figure</small></span><button onClick={() => setSelectedFigure(null)} aria-label="Remove selected figure"><X size={12} /></button></span>}
                  </div>
                </div>
              )}
              {images.length > 0 && <div className="attachment-row">{images.map((image, index) => <div className="attachment-chip" key={image.path}><span><ImageIcon size={15} /></span><div><strong>{image.name}</strong><small>{Math.ceil(image.size / 1024)} KB</small></div><button onClick={() => setImages((all) => all.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></div>)}</div>}
              {dragging && <div className="drop-overlay"><ImageIcon size={24} /><strong>Drop handwritten pages here</strong></div>}
              <textarea value={prompt} disabled={running} onChange={(event) => setPrompt(event.target.value)} onKeyDown={key} placeholder={`Message ${agent.name}…`} rows={3} />
              <div className="composer-tools">
                <div><button className="composer-button" onClick={() => void attachImages()} disabled={running} title="Attach images"><Paperclip size={17} /></button>{note && <span className="context-pill"><FileText size={13} />{note.name}<button onClick={() => { setNote(null); setNoteInChat(false); setSelectedText(""); setSelectedFigure(null); }}><X size={12} /></button></span>}</div>
                <div className="send-area">{running ? <button className="send-button stop" onClick={() => void stop()} title="Stop agent"><CircleStop size={17} /></button> : <button className="send-button" onClick={() => void send()} disabled={editing ? !prompt.trim() : !canSend} title={canSend || editing ? "Send" : "Select a vault and install the selected CLI"}><Send size={17} /></button>}</div>
              </div>
            </div>
            <p className="composer-hint">{agentId === "retriever" ? "Retriever starts in read-only mode." : "Writes start vault-scoped; Codex will surface any approval it needs inside the terminal."}</p>
          </div>
        )}
      </section>

      <div
        className="panel-resizer right-resizer"
        role="separator"
        aria-label="Resize context sidebar"
        aria-orientation="vertical"
        aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
        aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
        aria-valuenow={rightPanelWidth}
        tabIndex={rightPanelOpen ? 0 : -1}
        onPointerDown={(event) => startPanelResize("right", event)}
        onKeyDown={(event) => resizePanelFromKeyboard("right", event)}
        onDoubleClick={() => setRightPanelWidth(328)}
      />

      <aside className="context-panel">
        <div className="context-heading"><div><span className="micro-label">CONTEXT</span><h2>Obsidian Vault</h2></div></div>
        <button className="vault-picker" disabled={sessionLocked} onClick={() => void selectVault()}><span className="vault-icon"><Library size={19} /></span><span><small>ACTIVE VAULT</small><strong>{vaultName}</strong></span><FolderOpen size={17} /></button>
        <div className="note-search"><Search size={15} /><input ref={searchInput} disabled={sessionLocked} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /><span>Ctrl K</span></div>
        <nav className="folder-navigation" aria-label="Folder navigation">
          <div className="folder-history-controls">
            <button disabled={folderHistoryIndex === 0 || sessionLocked} onClick={() => moveFolderHistory(-1)} title="Previous folder" aria-label="Previous folder"><ChevronLeft size={15} /></button>
            <button disabled={folderHistoryIndex >= folderHistory.length - 1 || sessionLocked} onClick={() => moveFolderHistory(1)} title="Next folder" aria-label="Next folder"><ChevronRight size={15} /></button>
          </div>
          <div className="folder-breadcrumb" aria-label="Current folder">
            <button className={folderPath === "" ? "active" : ""} disabled={sessionLocked} onClick={() => navigateFolder("")}><Library size={12} />Root</button>
            {folderCrumbs.map((crumb) => <span key={crumb.path}><ChevronRight size={11} /><button className={crumb.path === folderPath ? "active" : ""} disabled={sessionLocked} onClick={() => navigateFolder(crumb.path)}>{crumb.name}</button></span>)}
          </div>
        </nav>
        <div className="file-browser">
          {notes.length === 0 ? (
            <div className="vault-empty"><Folder size={30} /><strong>Choose your vault</strong><p>Open a local folder to browse Markdown notes and pass one as agent context.</p><button onClick={() => void selectVault()}>Select folder</button></div>
          ) : query.trim() ? (
            <><div className="browser-summary"><span>{searchResults.length} of {notes.length} notes</span><span>Search results</span></div><div className="note-list">{searchResults.map((item) => <button key={item.path} disabled={sessionLocked} className={note?.path === item.path ? "active" : ""} onClick={() => void openNote(item)}><FileText size={15} /><span><strong>{item.name}</strong><small>{item.path.split("/").slice(0, -1).join(" / ") || "Vault root"}</small></span></button>)}</div>{searchResults.length === 0 && <div className="folder-empty"><Search size={24} /><strong>No matching notes</strong><p>Try another name or path.</p></div>}</>
          ) : (
            <><div className="browser-summary"><span>{folderView.folders.length} folders</span><span>{folderView.notes.length} notes</span></div><div className="note-list">{folderView.folders.map((folder) => <button key={folder.path} className="folder-row" disabled={sessionLocked} onClick={() => navigateFolder(folder.path)}><Folder size={16} /><span><strong>{folder.name}</strong><small>{folder.noteCount} {folder.noteCount === 1 ? "note" : "notes"}</small></span><ChevronRight size={14} /></button>)}{folderView.notes.map((item) => <button key={item.path} disabled={sessionLocked} className={note?.path === item.path ? "active" : ""} onClick={() => void openNote(item)}><FileText size={15} /><span><strong>{item.name}</strong><small>Markdown note</small></span></button>)}</div>{folderView.folders.length === 0 && folderView.notes.length === 0 && <div className="folder-empty"><Folder size={24} /><strong>Empty folder</strong><p>No Markdown notes are available here.</p></div>}</>
          )}
        </div>
        <div className={`selected-context ${selectedContextOpen ? "" : "collapsed"}`}>
          <button className="section-label selected-context-toggle" onClick={() => setSelectedContextOpen((open) => !open)} aria-expanded={selectedContextOpen} aria-controls="selected-note-content">
            <span>SELECTED NOTE</span><ChevronDown size={14} />
          </button>
          {selectedContextOpen && <div id="selected-note-content">{note ? <div className="note-preview"><div><FileText size={17} /><span><strong>{note.name}</strong><small>{note.path}</small></span></div>{agentId === "author-editor" && !terminalRequest && !terminalReplay && <button className="view-note-button" onClick={toggleNoteView}><Eye size={14} />{noteInChat ? "Close note" : "View note in chat"}</button>}</div> : <p className="no-context">No note selected. Choose a Markdown file from the vault browser.</p>}</div>}
        </div>
      </aside>
    </main>
  );
}
