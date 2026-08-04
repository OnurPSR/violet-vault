import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, session } from "electron";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pty from "node-pty";
import { sanitizeVaultSvg } from "./assets.mjs";
import { loadAgentInstructions } from "./instructions.mjs";
import { buildInteractiveInvocation, buildInvocation } from "./runner.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic"]);
const VAULT_FIGURE_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ".svg"]);
const activeRuns = new Map();
const terminalSessions = new Map();
const MAX_NOTES = 10_000;
const MAX_NOTE_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_TERMINAL_TRANSCRIPT_CHARS = 8 * 1024 * 1024;

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
  const conversations = Array.isArray(value.conversations)
    ? value.conversations.slice(0, 500).filter((conversation) => conversation && typeof conversation === "object").map((conversation) => ({
      ...conversation,
      agent: ["retriever", "editor", "author"].includes(conversation.agent) ? conversation.agent : "retriever",
      terminalTranscript: typeof conversation.terminalTranscript === "string"
        ? conversation.terminalTranscript.slice(0, MAX_TERMINAL_TRANSCRIPT_CHARS)
        : undefined,
    }))
    : [];
  return {
    conversations,
    vaultPath: typeof value.vaultPath === "string" ? value.vaultPath : null,
    agentId: ["retriever", "editor", "author"].includes(value.agentId) ? value.agentId : "retriever",
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

async function readVaultAsset(vaultPath, assetPath) {
  if (typeof vaultPath !== "string" || typeof assetPath !== "string" || !assetPath.trim()) {
    throw new Error("Invalid figure path.");
  }
  const cleanPath = assetPath.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  let target = path.resolve(vaultPath, cleanPath);
  if (!relativeIsSafe(vaultPath, target)) throw new Error("The figure is outside the selected vault.");
  try {
    await access(target, fsConstants.R_OK);
  } catch (error) {
    if (cleanPath.includes("/") || cleanPath.includes("\\")) throw error;
    const matches = [];
    const queue = [vaultPath];
    while (queue.length && matches.length < 2) {
      const directory = queue.pop();
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(absolute);
        else if (entry.isFile() && entry.name.toLowerCase() === cleanPath.toLowerCase()) matches.push(absolute);
      }
    }
    if (matches.length !== 1) throw new Error(matches.length ? "The figure name is ambiguous in this vault." : "The figure was not found in this vault.");
    target = matches[0];
  }
  const extension = path.extname(target).toLowerCase();
  if (!VAULT_FIGURE_EXTENSIONS.has(extension)) throw new Error("The requested vault asset is not a supported image.");
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > MAX_IMAGE_BYTES) throw new Error("The figure is unavailable or exceeds the 40 MB limit.");
  const buffer = await readFile(target);
  if (extension === ".svg") {
    const sanitized = sanitizeVaultSvg(buffer.toString("utf8"));
    return { dataUrl: `data:image/svg+xml;base64,${Buffer.from(sanitized).toString("base64")}` };
  }
  const decoded = nativeImage.createFromBuffer(buffer);
  const size = decoded.getSize();
  const width = size.width || 1200;
  const height = size.height || 800;
  const raster = decoded.isEmpty() ? buffer : decoded.toPNG();
  const mime = decoded.isEmpty() ? mimeFromExtension(target) : "image/png";
  const embedded = `data:${mime};base64,${raster.toString("base64")}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${embedded}" preserveAspectRatio="xMidYMid meet"/></svg>`;
  return { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

function validateSelectedNote(request, vault) {
  if (!request.notePath) return request;
  if (!vault.notes.some((note) => note.path === request.notePath)) {
    throw new Error("The selected note is no longer available in this vault.");
  }
  return request;
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
  try {
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
    if (staged.length === 0) await rm(targetDirectory, { recursive: true, force: true });
    return { paths: staged, directories: staged.length ? [targetDirectory] : [] };
  } catch (error) {
    await rm(targetDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function cleanupStagedImages(directories) {
  await Promise.all((directories ?? []).map((directory) => rm(directory, { recursive: true, force: true })));
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

function runCodexAppServer(binary, invocation, cwd, sender) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, invocation.args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeRuns.set(sender.id, child);
    let stdoutBuffer = "";
    let stderr = "";
    let activeItemId = null;
    let finalText = "";
    let settled = false;

    const finish = (error, output = "") => {
      if (settled) return;
      settled = true;
      activeRuns.delete(sender.id);
      if (!child.killed) child.kill("SIGTERM");
      if (error) reject(error);
      else resolve(output);
    };
    const write = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const stream = (event) => {
      if (!sender.isDestroyed()) sender.send("agent:stream", event);
    };

    const handleMessage = (message) => {
      if (message.id === 1) {
        if (message.error) return finish(new Error(message.error.message || "Unable to initialize Codex streaming."));
        write({ method: "initialized" });
        write({ method: "thread/start", id: 2, params: invocation.threadStart });
        return;
      }
      if (message.id === 2) {
        if (message.error) return finish(new Error(message.error.message || "Unable to start the Codex thread."));
        const threadId = message.result?.thread?.id;
        if (!threadId) return finish(new Error("Codex did not return a thread identifier."));
        write({ method: "turn/start", id: 3, params: { threadId, ...invocation.turnStart } });
        return;
      }
      if (message.id === 3 && message.error) {
        finish(new Error(message.error.message || "Unable to start the Codex turn."));
        return;
      }
      if (message.method === "item/agentMessage/delta") {
        const itemId = message.params?.itemId;
        const delta = message.params?.delta;
        if (typeof itemId !== "string" || typeof delta !== "string") return;
        if (activeItemId !== itemId) {
          activeItemId = itemId;
          finalText = delta;
        } else {
          finalText += delta;
        }
        stream({ itemId, delta });
        return;
      }
      if (message.method === "item/completed" && message.params?.item?.type === "agentMessage") {
        const itemId = message.params.item.id;
        const content = message.params.item.text;
        if (typeof itemId === "string" && typeof content === "string") {
          activeItemId = itemId;
          finalText = content;
          stream({ itemId, content });
        }
        return;
      }
      if (message.method === "turn/completed") {
        const turn = message.params?.turn;
        if (turn?.status === "failed") return finish(new Error(turn.error?.message || "The Codex turn failed."));
        const completedText = [...(turn?.items ?? [])].reverse().find((item) => item?.type === "agentMessage")?.text;
        const output = typeof completedText === "string" ? completedText : finalText;
        if (!output.trim()) return finish(new Error("Codex completed without an assistant response."));
        finish(null, output);
        return;
      }
      if (message.method === "error") finish(new Error(message.params?.error?.message || message.params?.message || "Codex streaming failed."));
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      if (stdoutBuffer.length > 8 * 1024 * 1024) return finish(new Error("Codex streaming output exceeded the 8 MB limit."));
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try { handleMessage(JSON.parse(line)); } catch { /* Ignore non-protocol stdout noise. */ }
      }
    });
    child.stderr.on("data", (chunk) => { if (stderr.length < 64_000) stderr += chunk.toString(); });
    child.on("error", (error) => finish(new Error(`Unable to start Codex streaming: ${error.message}`)));
    child.on("close", (code, signal) => {
      activeRuns.delete(sender.id);
      if (settled) return;
      if (signal === "SIGTERM" || signal === "SIGKILL") return finish(new Error("The run was stopped."));
      finish(new Error((stderr || `Codex app-server exited with code ${code}.`).trim().slice(-4_000)));
    });

    write({
      method: "initialize",
      id: 1,
      params: { clientInfo: { name: "violet_vault", title: "Violet Vault", version: app.getVersion() } },
    });
  });
}

async function executeAgent(request, sender) {
  if (!request || typeof request.vaultPath !== "string") throw new Error("Select an Obsidian vault first.");
  const vault = await scanVault(request.vaultPath);
  const requestWithNote = validateSelectedNote(request, vault);
  const instructions = await loadAgentInstructions(projectRoot, request.agentId);
  const staged = await stageImages(request.images);
  try {
    const invocation = buildInvocation({
      ...requestWithNote,
      images: staged.paths,
      imageDirectories: staged.directories,
    }, instructions);
    const binary = await findExecutable(invocation.binary);
    if (!binary) throw new Error(`${invocation.binary === "codex" ? "Codex" : "Claude"} CLI was not found. Install it and restart Violet Vault.`);
    const output = request.provider === "codex"
      ? await runCodexAppServer(binary, invocation, request.vaultPath, sender)
      : await runChild(binary, invocation.args, request.vaultPath, sender.id);
    return { output, provider: request.provider };
  } finally {
    await cleanupStagedImages(staged.directories);
  }
}

function terminalSize(value, fallback, minimum, maximum) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

async function startTerminalSession(request, sender, dimensions = {}) {
  if (!request || request.provider !== "codex" || typeof request.vaultPath !== "string") {
    throw new Error("Select an Obsidian vault and Codex before starting a terminal session.");
  }
  if (terminalSessions.has(sender.id)) throw new Error("A Codex terminal session is already running.");

  const vault = await scanVault(request.vaultPath);
  const requestWithNote = validateSelectedNote(request, vault);

  const instructions = await loadAgentInstructions(projectRoot, request.agentId);
  const staged = await stageImages(request.images);
  try {
    const invocation = buildInteractiveInvocation({ ...requestWithNote, images: staged.paths }, instructions);
    const binary = await findExecutable(invocation.binary);
    if (!binary) throw new Error("Codex CLI was not found. Install it and restart Violet Vault.");

    const sessionId = randomUUID();
    const terminal = pty.spawn(binary, invocation.args, {
      name: "xterm-256color",
      cols: terminalSize(dimensions.cols, 100, 20, 400),
      rows: terminalSize(dimensions.rows, 30, 5, 200),
      cwd: request.vaultPath,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });
    const session = { id: sessionId, terminal, stagedDirectories: staged.directories, vaultPath: request.vaultPath };
    terminalSessions.set(sender.id, session);

    terminal.onData((data) => {
      if (!sender.isDestroyed()) sender.send("agent:terminal-data", { sessionId, data });
    });
    terminal.onExit(({ exitCode, signal }) => {
      if (terminalSessions.get(sender.id)?.id === sessionId) terminalSessions.delete(sender.id);
      if (!sender.isDestroyed()) sender.send("agent:terminal-exit", { sessionId, exitCode, signal });
      void cleanupStagedImages(staged.directories);
    });

    return { sessionId };
  } catch (error) {
    await cleanupStagedImages(staged.directories);
    throw error;
  }
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
  ipcMain.handle("vault:read-asset", (_, value) => readVaultAsset(value?.vaultPath, value?.assetPath));
  ipcMain.handle("images:choose", async () => {
    const result = await dialog.showOpenDialog({
      title: "Attach handwritten pages",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: [...IMAGE_EXTENSIONS].map((item) => item.slice(1)) }],
    });
    return result.canceled ? [] : describeImages(result.filePaths);
  });
  ipcMain.handle("cli:status", () => cliStatus());
  ipcMain.handle("agent:run", (event, request) => executeAgent(request, event.sender));
  ipcMain.handle("agent:terminal-start", (event, value) => startTerminalSession(value?.request, event.sender, value?.dimensions));
  ipcMain.on("agent:terminal-input", (event, value) => {
    const session = terminalSessions.get(event.sender.id);
    if (!session || session.id !== value?.sessionId || typeof value?.data !== "string" || value.data.length > 65_536) return;
    session.terminal.write(value.data);
  });
  ipcMain.on("agent:terminal-resize", (event, value) => {
    const session = terminalSessions.get(event.sender.id);
    if (!session || session.id !== value?.sessionId) return;
    session.terminal.resize(
      terminalSize(value?.cols, 100, 20, 400),
      terminalSize(value?.rows, 30, 5, 200),
    );
  });
  ipcMain.handle("agent:terminal-interrupt", (event, sessionId) => {
    const session = terminalSessions.get(event.sender.id);
    if (!session || session.id !== sessionId) return { interrupted: false };
    session.terminal.write("\u0003");
    return { interrupted: true };
  });
  ipcMain.handle("agent:terminal-close", (event, sessionId) => {
    const session = terminalSessions.get(event.sender.id);
    if (!session || session.id !== sessionId) return { closed: false };
    session.terminal.kill("SIGTERM");
    return { closed: true };
  });
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
    autoHideMenuBar: true,
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

  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  const senderId = window.webContents.id;
  window.on("closed", () => {
    const child = activeRuns.get(senderId);
    if (child) child.kill("SIGTERM");
    const session = terminalSessions.get(senderId);
    if (session) session.terminal.kill("SIGTERM");
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl?.startsWith("http://127.0.0.1:5173")) window.loadURL(developmentUrl);
  else window.loadFile(path.join(projectRoot, "dist", "index.html"));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerHandlers();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => {
  for (const child of activeRuns.values()) child.kill("SIGTERM");
  for (const session of terminalSessions.values()) session.terminal.kill("SIGTERM");
  if (process.platform !== "darwin") app.quit();
});
