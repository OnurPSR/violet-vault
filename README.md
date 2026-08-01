# Violet Vault

Violet Vault is a **local Electron desktop application** for operating AI agents against an Obsidian vault. It is not hosted, deployed, or served publicly. The React interface runs inside the desktop window; vault access, chat persistence, and CLI execution happen on your computer.

## Implemented workflow

- Native folder picker for an Obsidian vault.
- Recursive local Markdown note browser and selected-note preview.
- Drag-and-drop and native-picker image attachments.
- Codex CLI and Claude CLI adapters with model and effort selection.
- Display-only Local LLM option reserved for a later adapter.
- Four prompt contracts under `agents/`: Retriever, Scoped Editor, Note Author, and Supervisor.
- Local conversation history, new conversations, question editing, and process cancellation.
- Automatic refresh of the note index after an agent run.

## Safety model

- The renderer has no direct Node.js or filesystem access. A narrow Electron preload bridge exposes only the operations used by the interface.
- CLI arguments are passed directly to a child process with `shell: false`.
- Retriever invokes Codex with `--sandbox read-only` and Claude with `--permission-mode plan`.
- Editor, Author, and Supervisor invoke Codex with vault-scoped `workspace-write`; Claude uses `acceptEdits` and the selected vault as its working directory.
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
npm run dev
```

`npm run dev` opens a native Electron window with Vite hot reload. It binds the development renderer only to `127.0.0.1`; nothing is deployed.

To build the renderer and start the normal desktop runtime:

```bash
npm start
```

## Build an installable Linux application

```bash
npm run dist:linux
```

The AppImage and Debian package are written to `release/`.

## Tests

```bash
npm test
```

This validates role-specific CLI arguments and performs the TypeScript and production renderer builds.

## Local data

Electron stores `violet-vault-state.json` in its per-user application-data directory. The file contains chat history, model controls, and the last selected vault path. No project database or cloud service is required.

## Project structure

```text
agents/              Agent contracts
electron/main.mjs    Native window, filesystem, persistence, and CLI processes
electron/preload.cjs Narrow renderer bridge
electron/runner.mjs  Validated Codex and Claude invocation construction
src/App.tsx          Desktop UI and state orchestration
src/styles.css       Purple-black interface
tests/               CLI contract tests
```

## Current limitation

The Local LLM option is intentionally disabled. Add an adapter in `electron/runner.mjs` when you decide whether to use Ollama, LM Studio, or another local inference server.
