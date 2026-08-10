# Obsidian Rendering

## Probe the official CLI

Run `obsidian help` first on every validation. Do not assume commands from another installed version. Confirm support for `open`, `command`, `commands`, `dev:errors`, `dev:console`, `dev:dom`, `dev:mobile`, `dev:screenshot`, and `eval`.

Run the render script in probe mode when diagnosing access:

```bash
node scripts/obsidian_render_check.mjs --probe
```

The script tries an explicit `--cli` path, `OBSIDIAN_CLI`, `obsidian` on `PATH`, `/opt/Obsidian/obsidian`, and the standard per-user local binary. It reports `BLOCKED` when no candidate can reach the official CLI.

If a direct `obsidian help` succeeds but the script reports `EPERM` or a sandbox error, rerun the script with the environment's required permission for invoking the desktop CLI. Treat that as an access boundary, not proof that Obsidian is unavailable.

If the CLI exists but is disconnected:

1. run `obsidian version`, `obsidian vault`, and `obsidian vaults verbose`;
2. confirm that the intended vault is registered and connected;
3. open or register the vault through the desktop application or a supported Obsidian URI;
4. rerun `obsidian help` and the probe;
5. never claim target-vault access from a different connected vault.

## Render the note

The script performs this sequence:

1. discover commands from `obsidian help`;
2. verify the selected registered vault;
3. clear captured errors and console messages;
4. open the exact vault-relative note path;
5. inspect the active DOM and toggle `markdown:toggle-preview` only when Reading view is absent;
6. query broken images, Mermaid errors, clipping, overflow, visual dimensions, and small text;
7. capture a full screenshot;
8. enable CLI mobile emulation, capture a narrow screenshot, and restore normal mode;
9. collect `dev:errors` and error-level `dev:console` output;
10. repeat screenshot/error capture for explicitly listed Excalidraw files.

## Inspect the evidence

Open every screenshot at full resolution. Check formulas, matrices, labels, arrows, clipping, blur, hierarchy, callout weight, theme contrast, embed prominence, and narrow-layout usability. Compare reconstruction screenshots directly with the ordered source pages.

Treat DOM measurements as pointers to likely defects, not replacements for inspection. A wide element may be intentional; a technically in-bounds formula may still be unreadable.

## Report blocked verification

When the renderer cannot be controlled, retain the static JSON and scope report, mark every Reading-view item `BLOCKED`, and name the exact note and visual assets still needing inspection. Do not describe generic preview output as Obsidian verification.
