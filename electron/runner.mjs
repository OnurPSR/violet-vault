const AGENT_IDS = new Set(["retriever", "editor", "author"]);
const EFFORTS = new Set(["low", "medium", "high"]);
const MODEL_IDS = {
  codex: new Set(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]),
  claude: new Set(["claude-opus-5", "claude-opus-4-8", "claude-sonnet-5"]),
};

function assertRequest(request) {
  if (!request || !AGENT_IDS.has(request.agentId)) throw new Error("Unknown agent selection.");
  if (!(request.provider in MODEL_IDS)) throw new Error("Local LLM support is display-only for now.");
  if (!MODEL_IDS[request.provider].has(request.model)) throw new Error("Unsupported model selection.");
  if (!EFFORTS.has(request.effort)) throw new Error("Unsupported reasoning level.");
  if (typeof request.prompt !== "string" || !request.prompt.trim()) throw new Error("The prompt is empty.");
}

export function buildUserPrompt(request) {
  assertRequest(request);
  if (!request.notePath) return request.prompt.trim();

  return `${request.prompt.trim()}\n\n${request.notePath}`;
}

export function buildTaskPrompt(request) {
  assertRequest(request);
  const transcript = (request.messages ?? [])
    .slice(-20)
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");
  const imageList = (request.images ?? []).map((item) => `- ${item}`).join("\n") || "- None";

  return `# Runtime context\n\nVault root: ${request.vaultPath}\nSelected note: ${request.notePath || "None selected"}\nAttached source images:\n${imageList}\n\n# Conversation context\n\n${transcript || "No earlier messages in this conversation."}\n\n# Current user request\n\n${buildUserPrompt(request)}`;
}

export function buildInteractiveInstructions(request, agentInstructions) {
  assertRequest(request);
  const transcript = (request.messages ?? [])
    .slice(-20)
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");

  return `${agentInstructions}\n\n# Violet Vault runtime context\n\nVault root: ${request.vaultPath}\nSelected note: ${request.notePath || "None selected"}\nEarlier Violet Vault conversation:\n${transcript || "No earlier messages in this conversation."}`;
}

export function buildInteractiveInvocation(request, agentInstructions) {
  assertRequest(request);
  if (request.provider !== "codex") throw new Error("Interactive terminal sessions are only available for Codex.");

  const developerInstructions = buildInteractiveInstructions(request, agentInstructions);
  const args = [
    "--cd",
    request.vaultPath,
    "--sandbox",
    request.agentId === "retriever" ? "read-only" : "workspace-write",
    "--ask-for-approval",
    "on-request",
    "--model",
    request.model,
    "--config",
    `model_reasoning_effort=${JSON.stringify(request.effort)}`,
    "--config",
    `developer_instructions=${JSON.stringify(developerInstructions)}`,
  ];
  for (const image of request.images ?? []) args.push("--image", image);
  args.push(buildUserPrompt(request));
  return { binary: "codex", args, developerInstructions };
}

export function buildInvocation(request, agentInstructions) {
  assertRequest(request);
  if (request.provider !== "claude") throw new Error("Codex must run through the interactive terminal.");
  const prompt = buildTaskPrompt(request);

  const args = [
    "-p",
    "--no-session-persistence",
    "--model",
    request.model,
    "--effort",
    request.effort,
    "--permission-mode",
    request.agentId === "retriever" ? "plan" : "acceptEdits",
    "--append-system-prompt",
    agentInstructions,
  ];
  for (const directory of request.imageDirectories ?? []) args.push("--add-dir", directory);
  args.push(prompt);
  return { binary: "claude", args, prompt };
}

export const supportedModels = MODEL_IDS;
