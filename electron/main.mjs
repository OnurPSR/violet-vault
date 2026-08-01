import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInvocation } from "./runner.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"]);
const activeRuns = new Map();
const MAX_NOTES = 10_000;
const MAX_NOTE_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

const defaultState = {
  conversations: [],
  vaultPath: null,
  agentId: "retriever",
  provider: "codex",
  model: "gpt-5.6-sol",
  effort: "high",
};

function statePath() {
  return path.join(app.getPath("userData"), "violet-vault-state.json");
}

function cleanState(value) {
  if (!value || typeof value !== "object") return defaultState;
  const conversations = Array.isArray(value.conversations) ? value.conversations.slice(0, 500) : [];
  return {
    conversations,
    vaultPath: typeof value.vaultPath === "string" ? value.vaultPath : null,
    agentId: ["retriever", "editor", "author", "supervisor"].includes(value.agentId) ? value.agentId : "retriever",
    provider: ["codex", "claude", "local"].includes(value.provider) ? value.provider : "codex",
    model: typeof value.model === "string" ? value.model : "gpt-5.6-sol",
    effort: ["low", "medium", "high"].includes(value.effort) ? value.effort : "high",
  };
}

async function readState() {
  try {
    return cleanState(JSON.parse(await readFile(statePath(), "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Unable to read local state:", error.message);
    return defaultState;
  }
}

async function saveState(value) {
  const serialized = JSON.stringify(cleanState(value), null, 2);
  if (Buffer.byteLength(serialized) > 20 * 1024 * 1024) throw new Error("Chat history is too large to save.");
  const target = statePath();
  const temporary = `${target}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, serialized, { mode: 0o600 });
  await rename(temporary, target);
}

function relativeIsSafe(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function scanVault(vaultPath) {
  const rootStats = await stat(vaultPath);
  if (!rootStats.isDirectory()) throw new Error("The selected vault path is not a directory.");
  const notes = [];
  const queue = [{ absolute: vaultPath, relative: "" }];

  while (queue.length && notes.length < MAX_NOTES) {
    const directory = queue.pop();
    const entries = await readdir(directory.absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = path.join(directory.absolute, entry.name);
      const relative = path.posix.join(directory.relative.split(path.sep).join("/"), entry.name);
      if (entry.isDirectory()) queue.push({ absolute, relative });
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        notes.push({ name: entry.name.replace(/\.md$/i, ""), path: relative });
        if (notes.length >= MAX_NOTES) break;
      }
    }
  }

  notes.sort((a, b) => a.path.localeCompare(b.path));
  return { vaultPath, vaultName: path.basename(vaultPath), notes };
}

async function readVaultNote(vaultPath, notePath) {
  if (typeof vaultPath !== "string" || typeof notePath !== "string" || !notePath.toLowerCase().endsWith(".md")) {
    throw new Error("Invalid note path.");
  }
  const target = path.resolve(vaultPath, notePath);
  if (!relativeIsSafe(vaultPath, target)) throw new Error("The note is outside the selected vault.");
  const metadata = await stat(target);
  if (!metadata.isFile()) throw new Error("The selected note is not a file.");
  if (metadata.size > MAX_NOTE_PREVIEW_BYTES) return { content: "This note is larger than the 2 MB preview limit." };
  return { content: await readFile(target, "utf8") };
}

function mimeFromExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if ([".tif", ".tiff"].includes(extension)) return "image/tiff";
  if (extension === ".heic") return "image/heic";
  return "image/png";
}

async function describeImages(paths) {
  const result = [];
  for (const filePath of paths.slice(0, 12)) {
    const extension = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const metadata = await stat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_IMAGE_BYTES) continue;
    result.push({ name: path.basename(filePath), path: filePath, size: metadata.size, type: mimeFromExtension(filePath) });
  }
  return result;
}

async function stageImages(images) {
  if (!Array.isArray(images) || images.length === 0) return { paths: [], directories: [] };
  const targetDirectory = await mkdtemp(path.join(os.tmpdir(), "violet-vault-"));
  const staged = [];
  for (const [index, image] of images.slice(0, 12).entries()) {
    if (!image || typeof image.path !== "string") continue;
    const extension = path.extname(image.path).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    const metadata = await stat(image.path);
    if (!metadata.isFile() || metadata.size > MAX_IMAGE_BYTES) throw new Error(`${path.basename(image.path)} exceeds the 40 MB image limit.`);
    const destination = path.join(targetDirectory, `${String(index + 1).padStart(2, "0")}-${path.basename(image.path).replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    await copyFile(image.path, destination, fsConstants.COPYFILE_EXCL);
    staged.push(destination);
  }
  return { paths: staged, directories: staged.length ? [targetDirectory] : [] };
}

function executableCandidates(name) {
  const home = app.getPath("home");
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const directories = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(home, ".local", "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "share", "pnpm"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
  ].filter(Boolean);
  return [...new Set(directories.flatMap((directory) => extensions.map((extension) => path.join(directory, `${name}${extension}`))))];
}

async function findExecutable(name) {
  for (const candidate of executableCandidates(name)) {
    try {
      await access(candidate, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function captureProcess(binary, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, { ...options, shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 4_000);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? (stdout || stderr).trim() : null); });
  });
}

async function cliStatus() {
  const [codexPath, claudePath] = await Promise.all([findExecutable("codex"), findExecutable("claude")]);
  const [codexVersion, claudeVersion] = await Promise.all([
    codexPath ? captureProcess(codexPath, ["--version"]) : null,
    claudePath ? captureProcess(claudePath, ["--version"]) : null,
  ]);
  return {
    codex: { installed: Boolean(codexPath), version: codexVersion },
    claude: { installed: Boolean(claudePath), version: claudeVersion },
  };
}

async function agentInstructions(agentId) {
  if (!["retriever", "editor", "author", "supervisor"].includes(agentId)) throw new Error("Unknown agent selection.");
  const shared = await readFile(path.join(projectRoot, "agents", "shared", "AGENTS.md"), "utf8");
  const specialist = await readFile(path.join(projectRoot, "agents", agentId, "AGENTS.md"), "utf8");
  return `${shared}\n\n${specialist.replace(/^.*Read and follow.*$/m, "")}`;
}

function runChild(binary, args, cwd, senderId) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeRuns.set(senderId, child);
    let stdout = "";
    let stderr = "";
    let stopped = false;
    const limit = 8 * 1024 * 1024;
    child.stdout.on("data", (chunk) => { if (stdout.length < limit) stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { if (stderr.length < limit) stderr += chunk.toString(); });
    child.on("error", (error) => {
      activeRuns.delete(senderId);
      reject(new Error(`Unable to start the CLI: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      stopped = signal === "SIGTERM" || signal === "SIGKILL";
      activeRuns.delete(senderId);
      if (stopped) return reject(new Error("The run was stopped."));
      if (code !== 0) return reject(new Error((stderr || stdout || `CLI exited with code ${code}.`).trim().slice(-4_000)));
      const output = stdout.trim();
      if (!output) return reject(new Error("The CLI completed without a final response."));
      resolve(output);
    });
  });
}

async function executeAgent(request, senderId) {
  if (!request || typeof request.vaultPath !== "string") throw new Error("Select an Obsidian vault first.");
  const vault = await scanVault(request.vaultPath);
  if (request.notePath && !vault.notes.some((note) => note.path === request.notePath)) throw new Error("The selected note is no longer available in this vault.");
  const instructions = await agentInstructions(request.agentId);
  const staged = await stageImages(request.images);
  const invocation = buildInvocation({
    ...request,
    images: staged.paths,
    imageDirectories: staged.directories,
  }, instructions);
  const binary = await findExecutable(invocation.binary);
  if (!binary) throw new Error(`${invocation.binary === "codex" ? "Codex" : "Claude"} CLI was not found. Install it and restart Violet Vault.`);
  const output = await runChild(binary, invocation.args, request.vaultPath, senderId);
  return { output, provider: request.provider };
}

function registerHandlers() {
  ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform }));
  ipcMain.handle("state:get", () => readState());
  ipcMain.handle("state:save", (_, value) => saveState(value));
  ipcMain.handle("vault:choose", async () => {
    const result = await dialog.showOpenDialog({ title: "Choose an Obsidian vault", properties: ["openDirectory"] });
    return result.canceled ? null : scanVault(result.filePaths[0]);
  });
  ipcMain.handle("vault:restore", async (_, vaultPath) => {
    if (typeof vaultPath !== "string") return null;
    try { return await scanVault(vaultPath); } catch { return null; }
  });
  ipcMain.handle("vault:read-note", (_, value) => readVaultNote(value?.vaultPath, value?.notePath));
  ipcMain.handle("images:choose", async () => {
    const result = await dialog.showOpenDialog({
      title: "Attach handwritten pages",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: [...IMAGE_EXTENSIONS].map((item) => item.slice(1)) }],
    });
    return result.canceled ? [] : describeImages(result.filePaths);
  });
  ipcMain.handle("cli:status", () => cliStatus());
  ipcMain.handle("agent:run", (event, request) => executeAgent(request, event.sender.id));
  ipcMain.handle("agent:stop", (event) => {
    const child = activeRuns.get(event.sender.id);
    if (!child) return { stopped: false };
    child.kill("SIGTERM");
    setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 1_500);
    return { stopped: true };
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#08070b",
    show: false,
    title: "Violet Vault",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  const senderId = window.webContents.id;
  window.on("closed", () => {
    const child = activeRuns.get(senderId);
    if (child) child.kill("SIGTERM");
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl?.startsWith("http://127.0.0.1:5173")) window.loadURL(developmentUrl);
  else window.loadFile(path.join(projectRoot, "dist", "index.html"));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerHandlers();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  for (const child of activeRuns.values()) child.kill("SIGTERM");
  if (process.platform !== "darwin") app.quit();
});
