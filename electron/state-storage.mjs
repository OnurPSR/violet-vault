export const MAX_STATE_BYTES = 16 * 1024 * 1024;
export const MAX_TERMINAL_TRANSCRIPT_CHARS = 2 * 1024 * 1024;
const MAX_CONVERSATIONS = 500;
const MAX_MESSAGES_PER_CONVERSATION = 100;
const MAX_MESSAGE_CHARS = 512 * 1024;
const TRANSCRIPT_TRUNCATION_NOTICE = "\r\n[Earlier terminal output omitted to keep local chat history within its storage limit.]\r\n";

export const defaultState = {
  conversations: [],
  vaultPath: null,
  agentId: "retriever",
  provider: "codex",
  model: "gpt-5.6-sol",
  effort: "high",
};

function cleanAgentId(value) {
  if (value === "editor" || value === "author") return "author-editor";
  return value === "author-editor" ? value : "retriever";
}

function tailWithNotice(value, limit = MAX_TERMINAL_TRANSCRIPT_CHARS) {
  if (typeof value !== "string" || value.length <= limit) return value;
  const tailLength = Math.max(0, limit - TRANSCRIPT_TRUNCATION_NOTICE.length);
  return `${TRANSCRIPT_TRUNCATION_NOTICE}${value.slice(-tailLength)}`;
}

function cleanMessage(message) {
  if (!message || typeof message !== "object") return null;
  return {
    id: typeof message.id === "string" ? message.id : "",
    role: message.role === "assistant" ? "assistant" : "user",
    content: tailWithNotice(typeof message.content === "string" ? message.content : "", MAX_MESSAGE_CHARS),
    createdAt: Number.isFinite(message.createdAt) ? message.createdAt : Date.now(),
    ...(message.tokenUsage && typeof message.tokenUsage === "object" ? { tokenUsage: message.tokenUsage } : {}),
  };
}

function cleanConversation(conversation) {
  const messages = Array.isArray(conversation.messages)
    ? conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(cleanMessage).filter(Boolean)
    : [];
  return {
    id: typeof conversation.id === "string" ? conversation.id : "",
    title: typeof conversation.title === "string" ? conversation.title.slice(0, 200) : "Untitled conversation",
    agent: cleanAgentId(conversation.agent),
    provider: ["codex", "claude", "local"].includes(conversation.provider) ? conversation.provider : "codex",
    model: typeof conversation.model === "string" ? conversation.model.slice(0, 100) : "gpt-5.6-sol",
    effort: ["low", "medium", "high"].includes(conversation.effort) ? conversation.effort : "high",
    messages,
    ...(typeof conversation.terminalTranscript === "string"
      ? { terminalTranscript: tailWithNotice(conversation.terminalTranscript) }
      : {}),
    ...(conversation.terminalTokenUsage && typeof conversation.terminalTokenUsage === "object"
      ? { terminalTokenUsage: conversation.terminalTokenUsage }
      : {}),
    updatedAt: Number.isFinite(conversation.updatedAt) ? conversation.updatedAt : Date.now(),
  };
}

export function cleanState(value) {
  if (!value || typeof value !== "object") return { ...defaultState };
  const conversations = Array.isArray(value.conversations)
    ? value.conversations.slice(0, MAX_CONVERSATIONS).filter((conversation) => conversation && typeof conversation === "object").map(cleanConversation)
    : [];
  return {
    conversations,
    vaultPath: typeof value.vaultPath === "string" ? value.vaultPath : null,
    agentId: cleanAgentId(value.agentId),
    provider: ["codex", "claude", "local"].includes(value.provider) ? value.provider : "codex",
    model: typeof value.model === "string" ? value.model : "gpt-5.6-sol",
    effort: ["low", "medium", "high"].includes(value.effort) ? value.effort : "high",
  };
}

function encoded(state) {
  return JSON.stringify(state);
}

export function serializeStateWithinBudget(value, maxBytes = MAX_STATE_BYTES) {
  const state = cleanState(value);
  let serialized = encoded(state);

  // Terminal output is the largest and least valuable historical payload. Keep
  // the active/newest transcript, then discard older transcripts before chats.
  for (let index = state.conversations.length - 1; Buffer.byteLength(serialized) > maxBytes && index >= 1; index -= 1) {
    delete state.conversations[index].terminalTranscript;
    serialized = encoded(state);
  }

  while (Buffer.byteLength(serialized) > maxBytes && state.conversations.length > 1) {
    state.conversations.pop();
    serialized = encoded(state);
  }

  const newest = state.conversations[0];
  while (Buffer.byteLength(serialized) > maxBytes && newest?.terminalTranscript?.length > 16_384) {
    newest.terminalTranscript = tailWithNotice(newest.terminalTranscript, Math.floor(newest.terminalTranscript.length / 2));
    serialized = encoded(state);
  }

  while (Buffer.byteLength(serialized) > maxBytes && newest?.messages.length > 1) {
    newest.messages.shift();
    serialized = encoded(state);
  }

  if (Buffer.byteLength(serialized) > maxBytes && newest?.messages[0]) {
    newest.messages[0].content = tailWithNotice(newest.messages[0].content, 16_384);
    serialized = encoded(state);
  }

  return Buffer.byteLength(serialized) <= maxBytes ? serialized : encoded(defaultState);
}
