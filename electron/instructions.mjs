import { access, readFile, readdir } from "node:fs/promises";
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

/**
 * Agent processes run with the vault as their working directory, so a relative
 * reference from a contract to its bundled skill cannot resolve. Discover the
 * skills that ship beside the contract and hand the agent their absolute paths.
 * Returns [] when the agent has no skills directory, which keeps the previous
 * output byte-identical for agents that ship none.
 */
async function listAgentSkills(projectRoot, agentId) {
  const skillsRoot = path.join(projectRoot, "agents", agentId, "skills");
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return [];
    throw error;
  }

  const skills = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifest = path.join(skillsRoot, entry.name, "SKILL.md");
    try {
      await access(manifest);
    } catch {
      continue;
    }
    skills.push({ name: entry.name, manifest });
  }
  return skills;
}

function formatSkillSection(skills) {
  if (skills.length === 0) return "";
  const lines = skills.map((skill) => `- ${skill.name}: ${skill.manifest}`);
  return [
    "# Available agent skills",
    "",
    "Read-only reference material bundled with this contract. Open a SKILL.md when",
    "its description matches the current task; it lists any further files to load.",
    "",
    ...lines,
  ].join("\n");
}

export async function loadAgentInstructions(projectRoot, agentId) {
  if (!AGENT_IDS.has(agentId)) throw new Error("Unknown agent selection.");

  const shared = await readOptional(path.join(projectRoot, "agents", "shared", "AGENTS.md"));
  const specialist = await readFile(path.join(projectRoot, "agents", agentId, "AGENTS.md"), "utf8");
  const specialistWithoutSharedDirective = specialist.replace(/^.*Read and follow.*$/m, "").trim();
  const skills = formatSkillSection(await listAgentSkills(projectRoot, agentId));

  return [shared.trim(), specialistWithoutSharedDirective, skills].filter(Boolean).join("\n\n");
}
