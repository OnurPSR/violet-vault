# Violet Vault agents

Each specialist loads `shared/AGENTS.md` (optional) and then its own role file:

- `retriever/AGENTS.md` — read-only vault search and evidence retrieval.
- `editor/AGENTS.md` — minimal scoped patches to existing notes.
- `author/AGENTS.md` — new notes, append-only additions, and owned revisions.

A role file is a durable contract: role, task-mode routing, authorization and
immutability boundaries, path security, and validation entry points. Long
task-specific procedure belongs in a skill beside the contract:

```text
agents/<role>/
  AGENTS.md
  skills/<skill-name>/
    SKILL.md          workflow and pointers
    references/       detail loaded on demand
    scripts/          executable validators plus their tests
    assets/           templates used in output
```

`electron/instructions.mjs` concatenates the shared file, the role file, and a
`# Available agent skills` list of absolute `SKILL.md` paths. The absolute paths
matter: agent processes run with the vault as their working directory, so a
relative reference from a contract to its skill would not resolve.

The Electron desktop interface passes the selected role, model configuration,
vault path, note, prompt, conversation context, and staged images to the local
Codex or Claude CLI bridge. Local LLM support is display-only for now.

## Validators

The author skill ships two standard-library Python validators with their own
tests:

```bash
cd agents/author/skills/handwritten-note-author
python3 -m unittest discover -s scripts/tests -t scripts/tests
```

They operate on temporary fixtures. Never point them at a real vault note while
testing.
