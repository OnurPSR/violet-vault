export type AgentId = "retriever" | "author-editor";
export type ProviderId = "codex" | "claude" | "local";
export type Effort = "low" | "medium" | "high";

export type TokenUsage = {
  provider: "codex" | "claude";
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  modelContextWindow: number | null;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  tokenUsage?: TokenUsage | null;
};

export type Conversation = {
  id: string;
  title: string;
  agent: AgentId;
  provider: ProviderId;
  model: string;
  effort: Effort;
  messages: Message[];
  terminalTranscript?: string;
  terminalTokenUsage?: TokenUsage | null;
  updatedAt: number;
};

export type Note = {
  name: string;
  path: string;
  content?: string;
};

export type Attachment = {
  name: string;
  path: string;
  size: number;
  type: string;
};

export type SourcePosition = {
  offset: number;
  line: number;
  character: number;
};

export type EditContext = {
  selectedText: string | null;
  figurePath: string | null;
  figureAlt: string | null;
  noteRevision: string | null;
  selectionMatch: "exact" | "ambiguous" | "rendered-only" | null;
  selectionOccurrenceCount: number | null;
  selectionStart: SourcePosition | null;
  selectionEnd: SourcePosition | null;
  selectionPrefix: string | null;
  selectionSuffix: string | null;
};

export type CliStatus = {
  codex: { installed: boolean; version: string | null };
  claude: { installed: boolean; version: string | null };
};

export type AppState = {
  conversations: Conversation[];
  vaultPath: string | null;
  agentId: AgentId;
  provider: ProviderId;
  model: string;
  effort: Effort;
};

export type RunRequest = {
  agentId: AgentId;
  provider: ProviderId;
  model: string;
  effort: Effort;
  vaultPath: string;
  notePath: string | null;
  messages: Message[];
  prompt: string;
  images: Attachment[];
  editContext?: EditContext;
};

export type TerminalDimensions = {
  cols: number;
  rows: number;
};

export type TerminalDataEvent = {
  clientSessionId: string;
  sessionId: string;
  data: string;
};

export type TerminalExitEvent = {
  clientSessionId: string;
  sessionId: string;
  exitCode: number;
  signal?: number;
  tokenUsage?: TokenUsage | null;
};

export type AgentStreamEvent = {
  itemId: string;
  delta?: string;
  content?: string;
};

export type VioletBridge = {
  appInfo(): Promise<{ version: string; platform: string }>;
  getState(): Promise<AppState>;
  saveState(state: AppState): Promise<void>;
  chooseVault(): Promise<{ vaultPath: string; vaultName: string; notes: Note[] } | null>;
  restoreVault(vaultPath: string): Promise<{ vaultPath: string; vaultName: string; notes: Note[] } | null>;
  readNote(vaultPath: string, notePath: string): Promise<{ content: string }>;
  readVaultAsset(vaultPath: string, assetPath: string): Promise<{ dataUrl: string }>;
  chooseImages(): Promise<Attachment[]>;
  pathForFile(file: File): string;
  checkCli(): Promise<CliStatus>;
  runAgent(request: RunRequest): Promise<{ output: string; provider: Exclude<ProviderId, "local">; tokenUsage: TokenUsage | null }>;
  stopAgent(): Promise<{ stopped: boolean }>;
  onAgentStream(callback: (event: AgentStreamEvent) => void): () => void;
  startCodexTerminal(request: RunRequest, dimensions: TerminalDimensions, clientSessionId: string): Promise<{ sessionId: string }>;
  sendTerminalInput(sessionId: string, data: string): void;
  resizeTerminal(sessionId: string, cols: number, rows: number): void;
  interruptTerminal(sessionId: string): Promise<{ interrupted: boolean }>;
  closeTerminal(sessionId: string): Promise<{ closed: boolean }>;
  onTerminalData(callback: (event: TerminalDataEvent) => void): () => void;
  onTerminalExit(callback: (event: TerminalExitEvent) => void): () => void;
};

declare global {
  interface Window {
    violet: VioletBridge;
  }
}
