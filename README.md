# Violet Vault

Violet Vault is a **local Electron desktop application** for operating AI agents against an Obsidian vault. It is not hosted, deployed, or served publicly. The React interface runs inside the desktop window; vault access, chat persistence, and CLI execution happen on your computer.

## Implemented workflow

- Native folder picker for an Obsidian vault.
- Recursive local Markdown note browser and selected-note preview.
- Drag-and-drop and native-picker image attachments.
- A native interactive Codex CLI terminal with model and effort selection.
- Raw PTY streaming for Codex output, keyboard input, resize, interrupts, numbered choices, approvals, and slash commands.
- A Claude CLI request/response adapter.
- Display-only Local LLM option reserved for a later adapter.
- Three prompt contracts under `agents/`: Retriever, Scoped Editor, and Note Author.
- Local conversation history with replayable Codex terminal transcripts, native session controls, question editing, and process cancellation.
- Automatic refresh of the note index after an agent run.

## Safety model

- The renderer has no direct Node.js or filesystem access. A narrow Electron preload bridge exposes only the operations used by the interface.
- CLI arguments are passed directly to a child process with `shell: false`.
- Retriever starts Codex with `--sandbox read-only`; Editor and Author start with vault-scoped `workspace-write`.
- Interactive Codex sessions use `--ask-for-approval on-request`, so questions, numbered choices, and approval requests remain visible and answerable in the embedded terminal. Claude Retriever uses `plan`; Claude write roles use `acceptEdits`.
- Attached source images are copied to a temporary staging directory before a run, so agents do not receive the original attachment as a write target.
- Note reads reject traversal outside the selected vault. Hidden folders, `.obsidian`, symlinks, and `node_modules` are excluded from indexing.

The agent contracts remain the semantic safety layer for append-only and scoped edits. Review important vault changes and keep your vault under version control or regular backup.

## Prerequisites

- Node.js 22.13 or newer.
- npm.
- At least one authenticated CLI:

### Codex CLI

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex login
```

### Claude CLI

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude auth login
```

Violet Vault checks the process `PATH` plus common user install locations such as `~/.local/bin`. Restart the app after installing or authenticating a CLI.

## Run locally on Ubuntu

```bash
npm install
npm run fix:electron-sandbox
npm run dev
```

`npm run dev` opens a native Electron window with Vite hot reload. It binds the development renderer only to `127.0.0.1`; nothing is deployed.

`fix:electron-sandbox` is a one-time Ubuntu/Linux setup after each fresh
`node_modules` installation. It assigns Electron's bundled `chrome-sandbox`
helper to `root:root` with mode `4755`, as Chromium requires. It asks for your
sudo password and verifies the final owner and mode. Do not replace it with
`--no-sandbox`; that would disable Chromium's process sandbox.

To build the renderer and start the normal desktop runtime:

```bash
npm start
```

## Build an installable Linux application

```bash
npm run dist:linux
```

The AppImage and Debian package are written to `release/`.

- `Violet-Vault-1.0.1-x86_64.AppImage` runs as a portable application.
- `Violet-Vault-1.0.1-amd64.deb` can be installed with
  `sudo apt install ./release/Violet-Vault-1.0.1-amd64.deb`.

If you change the public repository or maintainer identity, update `homepage`,
`author`, and `build.linux.maintainer` in `package.json` before distributing the
`.deb` file.

## Tests

```bash
npm test
```

This validates role-specific CLI arguments, including the interactive Codex TUI contract, and performs the TypeScript and production renderer builds.

## Local data

Electron stores `violet-vault-state.json` in its per-user application-data directory. The file contains chat history, model controls, and the last selected vault path. No project database or cloud service is required.

## Project structure

```text
agents/              Agent contracts
electron/main.mjs    Native window, filesystem, persistence, and CLI processes
electron/preload.cjs Narrow renderer bridge
electron/runner.mjs  Validated interactive Codex and non-interactive Claude invocations
src/App.tsx          Desktop UI and state orchestration
src/CodexTerminal.tsx Native Codex PTY renderer and input bridge
src/CodexTranscript.tsx Read-only renderer for saved Codex terminal history
src/styles.css       Purple-black interface
tests/               CLI contract tests
```

## Current limitation

The Local LLM option is intentionally disabled. Add an adapter in `electron/runner.mjs` when you decide whether to use Ollama, LM Studio, or another local inference server.
