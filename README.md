<div align="center">
  <img src="build/logo-horse-refined.png" alt="Violet Vault logo" width="180" />
  <h1>Violet Vault</h1>
  <p><strong>A local desktop workspace for AI agents that operate inside your Obsidian vault.</strong></p>
</div>

Handwriting is one of the most effective ways to make ideas stick. Digital note-taking, on the other hand, gives us structure, searchability, and easy organization but when our notes are reduced to copying and pasting, we often retain very little of what we save. What if we could keep the cognitive benefits of writing by hand without giving up the organization of a digital knowledge base?

Violet Vault brings these two approaches together. Its context-aware OCR pipeline transforms handwritten pages into structured Obsidian notes while preserving their meaning, formulas, diagrams, and relationships. The result is a more memorable way to capture ideas and a more organized way to store, retrieve, and develop them over time.

Violet Vault is a local Electron application for searching, explaining, and editing those notes. The React interface, filesystem access, conversation history, and Codex or Claude CLI processes all run on your computer; no hosted service or project database is required.



## Features

- Open an Obsidian vault through the native folder picker and browse its Markdown notes by directory.
- Preview the selected note with GFM, LaTeX/KaTeX, Mermaid, and vault-local images.
- Select text or a figure in a note and pass it directly to an agent as bounded context.
- Run Codex CLI or Claude CLI with selectable models and reasoning effort.
- Import handwritten pages through drag and drop or the native file picker and reconstruct them into a target note.
- Produce Obsidian-compatible content containing code, equations, tables, diagrams, and figures.
- Run write tasks in an interactive terminal where approvals, questions, numbered choices, slash commands, and interrupts remain accessible.
- Store conversations, terminal transcripts, and provider-reported token usage locally.
- Watch the vault for changes and refresh the note index automatically after an agent run.

## Agents

| Agent | UI name | Permission | Best for |
| --- | --- | --- | --- |
| Retriever | Librarian | Read only | Searching notes, explaining a selected passage, and separating note evidence from general knowledge |
| Author–Editor | Scribe | Target-scoped writes | Handwritten reconstruction, content insertion, and edits to a note or selected region |

The Author–Editor infers the appropriate workflow from the request and interface context, so the user does not need to select a mode manually. Its workflows include:

- appending reconstructed handwritten pages to a target note;
- inserting new content at a specific location;
- editing an existing note;
- editing selected text, equations, tables, code, or figures.

Agent contracts and task-specific skills live in [`agents/`](agents/). See [`agents/README.md`](agents/README.md) for details.

## Security model

Violet Vault does not rely solely on model instructions for safety. It enforces boundaries across process execution, filesystem access, and selection context:

- The Electron renderer has no direct Node.js or filesystem access. It communicates through a narrow preload bridge.
- CLI processes are launched with argument arrays and without a shell.
- The Codex Retriever runs in a `read-only` sandbox; the Author–Editor runs in a vault-scoped `workspace-write` sandbox.
- Codex write sessions use the `on-request` approval policy. With Claude, the Retriever uses `plan` mode and the interactive Author–Editor uses `auto` permission mode.
- The default write scope contains only the selected target note, its `attachments/{note_name}/` directory, and an explicitly selected figure.
- Text selections carry a note revision fingerprint, raw Markdown range, and surrounding anchors. Stale or mismatched selections are rejected before a CLI starts.
- Pages uploaded to the Author–Editor are copied into the target note's attachment directory. Uploads not used by the completed run are removed.
- Vault manifests captured before and after a run are compared, and changes outside the authorized scope are reported to the user.
- Vault scanning excludes hidden directories, `.obsidian`, `node_modules`, and symbolic links. Path traversal attempts are rejected.
- Notes, figures, and instruction-like content found in the vault are treated as untrusted data, never as agent instructions.

## Requirements

- Node.js `22.13.0` or newer
- npm
- At least one installed and authenticated provider CLI:
  - [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
  - [Claude Code](https://code.claude.com/docs/en/overview)

Restart Violet Vault after installing or authenticating a CLI. The application checks the process `PATH` as well as common user installation directories such as `~/.local/bin`.

## Installation and development

Clone the repository and install its dependencies:

```bash
git clone https://github.com/onurdursun/HandwrittenNote2Obsidian.git
cd HandwrittenNote2Obsidian
npm install
```

On Ubuntu/Linux, prepare Electron's Chromium sandbox helper once after each clean `node_modules` installation:

```bash
npm run fix:electron-sandbox
```

This command configures Electron's bundled `chrome-sandbox` helper with owner `root:root` and mode `4755`. It asks for your sudo password and verifies the result. Do not replace it with `--no-sandbox`, which would disable Chromium's process sandbox.

Start the Vite development server and Electron window:

```bash
npm run dev
```

The Vite development server binds only to `127.0.0.1:5173`. To create the production renderer build and launch the regular Electron runtime:

```bash
npm start
```

## Usage

1. Select the root of your Obsidian vault with **Open vault**.
2. Open a note from the left panel.
3. Choose **Librarian** to ask questions without modifying the vault, or **Scribe** to make changes.
4. Select the provider, model, and reasoning effort.
5. If needed, select text or a figure in the preview, or attach handwritten pages.
6. Send your request. For write tasks, answer any questions or approval prompts shown in the terminal.
7. When the run completes, review the target note, scope warnings, validation result, and token summary.

If handwritten pages and a target note are selected, you can start reconstruction by sending the files to Scribe without an additional prompt; the prompt is optional for this workflow.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Open the Electron development environment with Vite hot reload |
| `npm run build` | Run the TypeScript check and production renderer build |
| `npm start` | Build and launch the application in the regular Electron runtime |
| `npm test` | Run the Node test suite, TypeScript check, and production build |
| `npm run dist:linux` | Build AppImage and Debian packages for Linux |
| `npm run dist:dir` | Build an unpacked application directory |
| `npm run fix:electron-sandbox` | Configure the Linux Chromium sandbox helper with safe permissions |

## Build Linux packages

```bash
npm run dist:linux
```

The generated AppImage and `.deb` files are written to `release/`. Install the Debian package using its generated filename:

```bash
sudo apt install ./release/Violet-Vault-*-amd64.deb
```

Before distribution, verify the `version`, `homepage`, `author`, and `build.linux.maintainer` fields in `package.json`. Automated packaging currently targets Linux AppImage and Debian only.

## Tests

```bash
npm test
```

The test suite covers the following boundaries and behaviors:

- provider and model validation, including role-specific CLI arguments;
- separation between read-only and writable sandboxes;
- selected-text revisions and raw Markdown locations;
- manifest-based write-scope auditing;
- safe staging and cleanup of uploaded pages;
- bounded persistence of conversation state;
- token usage normalization;
- Markdown, LaTeX, Mermaid, Obsidian embed, and visual rendering checks;
- SVG sanitization and external-resource blocking.

## Local data and privacy

Application state is stored in `violet-vault-state.json` inside Electron's platform-specific user-data directory. The file contains the last selected vault path, interface preferences, conversations, and saved terminal transcripts. State is written atomically with `0600` permissions, and large histories are compacted automatically.

Violet Vault does not send data to a cloud service of its own. The Codex or Claude CLI you select remains subject to its provider's authentication and data-handling terms.

## Project structure

```text
agents/                         Agent contracts, skills, and validators
electron/main.mjs               Window, vault access, IPC, and CLI process management
electron/preload.cjs            Narrow renderer bridge
electron/runner.mjs             Request validation and Codex/Claude invocations
electron/vault-scope.mjs        Authorized write scope and manifest auditing
electron/page-staging.mjs       Uploaded-page staging and cleanup
src/App.tsx                     Main React interface and application state
src/RichMessage.tsx             Markdown, math, Mermaid, and figure renderer
src/CodexTerminal.tsx           Interactive PTY terminal
src/CodexTranscript.tsx         Saved terminal transcript view
tests/                          Node test suite
build/                          Application icons and brand assets
```

## Known limitations

- The Local LLM option does not yet have a runtime adapter. Supporting Ollama, LM Studio, or another local inference server requires a new adapter in `electron/runner.mjs`.
- Automated distribution targets are currently limited to Linux.
- The scope manifest is a detective final check, not a preventive control; it does not revert out-of-scope changes automatically.
