# Violet Vault agents

Each specialist loads `shared/AGENTS.md` (optional) and then its own role file:

- `retriever/AGENTS.md` — read-only vault search and evidence retrieval.
- `author-editor/AGENTS.md` — reconstruction, insertion, and scoped editing in a
  designated target note.

A role file is a durable contract: role, task-mode routing, authorization and
immutability boundaries, path security, and validation entry points. Long
task-specific procedure belongs in a skill beside the contract:

```text
agents/<role>/
  AGENTS.md
  .agents/skills/<skill-name>/
    SKILL.md          workflow and pointers
    references/       detail loaded on demand
    scripts/          executable validators
    assets/           templates used in output
```

`electron/instructions.mjs` concatenates the shared file, the role file, and a
`# Available agent skills` list of absolute `SKILL.md` paths. The absolute paths
matter: agent processes run with the vault as their working directory, so a
relative reference from a contract to its skill would not resolve.

The Electron desktop interface passes the selected role, model configuration,
vault path, note, prompt, conversation context, and staged images to the local
Codex or Claude CLI bridge. Packaged builds unpack `agents/` from the application
archive so those external CLIs can read every advertised absolute skill path.
Local LLM support is display-only for now.

## Validators

The Author–Editor validation skill ships Node.js validators. For example:

```bash
node /absolute/path/to/agents/author-editor/.agents/skills/note-validation/scripts/validate_note.mjs \
  --vault /path/to/vault --note Notes/example.md
```

Run only the validator required by the selected workflow. Reports should be
written outside the vault.
