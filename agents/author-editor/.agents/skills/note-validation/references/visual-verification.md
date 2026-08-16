# Generated Figure Visual Verification

Apply this workflow only when visual verification is on. If the runtime setting
is absent, treat it as on.

For every figure created or regenerated during the task:

1. Run `render_check.mjs` on the note region containing the figure, passing the
   handwritten page as `--source` when the task reconstructs one.
2. Read `report.json` first and repair every reported issue in the editable
   source and its export: unresolved embeds, clipped labels, illegible text,
   column overflow, and LaTeX errors.
3. Open the comparison image only once the report is clean, then compare content,
   labels, formulas, connectors, and placement against the source.
4. Correct material errors and rerun once.

Render only through that script. Do not open the vault in Obsidian or another
application, and do not start a browser session or debugging port to obtain a
rendering. The harness renders Markdown, LaTeX, Mermaid, and figure embeds;
Obsidian callout chrome is not reproduced and is not a defect.

Do not iterate over cosmetic differences. Use `PASS` only after direct rendered
inspection, `FAIL` when a material discrepancy remains, and `INCOMPLETE` when
the source or rendering is unavailable. Static inspection is not a substitute.
