export type AgentId = "retriever" | "editor" | "author" | "supervisor";
export type ProviderId = "codex" | "claude" | "local";
export type Effort = "low" | "medium" | "high";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  agent: AgentId;
  provider: ProviderId;
  model: string;
  effort: Effort;
  messages: Message[];
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
};

export type VioletBridge = {
  appInfo(): Promise<{ version: string; platform: string }>;
  getState(): Promise<AppState>;
  saveState(state: AppState): Promise<void>;
  chooseVault(): Promise<{ vaultPath: string; vaultName: string; notes: Note[] } | null>;
  restoreVault(vaultPath: string): Promise<{ vaultPath: string; vaultName: string; notes: Note[] } | null>;
  readNote(vaultPath: string, notePath: string): Promise<{ content: string }>;
  chooseImages(): Promise<Attachment[]>;
  pathForFile(file: File): string;
  checkCli(): Promise<CliStatus>;
  runAgent(request: RunRequest): Promise<{ output: string; provider: Exclude<ProviderId, "local"> }>;
  stopAgent(): Promise<{ stopped: boolean }>;
};

declare global {
  interface Window {
    violet: VioletBridge;
  }
}
