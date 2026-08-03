import { readFile } from "node:fs/promises";
import path from "node:path";

const AGENT_IDS = new Set(["retriever", "editor", "author"]);

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

export async function loadAgentInstructions(projectRoot, agentId) {
  if (!AGENT_IDS.has(agentId)) throw new Error("Unknown agent selection.");

  const shared = await readOptional(path.join(projectRoot, "agents", "shared", "AGENTS.md"));
  const specialist = await readFile(path.join(projectRoot, "agents", agentId, "AGENTS.md"), "utf8");
  const specialistWithoutSharedDirective = specialist.replace(/^.*Read and follow.*$/m, "").trim();

  return [shared.trim(), specialistWithoutSharedDirective].filter(Boolean).join("\n\n");
}
