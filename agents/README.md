# Violet Vault agents

Each specialist loads `shared/AGENTS.md` and then its own role file:

- `retriever/AGENTS.md` — read-only vault search and evidence retrieval.
- `editor/AGENTS.md` — minimal scoped patches to existing notes.
- `author/AGENTS.md` — new notes, append-only additions, and owned revisions.
- `supervisor/AGENTS.md` — routing, preflight checks, and independent audit.

The Electron desktop interface passes the selected role, model configuration,
vault path, note, prompt, conversation context, and staged images to the local
Codex or Claude CLI bridge. Local LLM support is display-only for now.
