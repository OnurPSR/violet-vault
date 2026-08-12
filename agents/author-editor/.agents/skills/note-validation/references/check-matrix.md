# Validation Check Matrix

| Check | Evidence |
| --- | --- |
| Markdown and GFM structure | Remark syntax tree |
| YAML frontmatter | Remark frontmatter node and YAML parser |
| Internal links and embeds | Parsed Markdown nodes and Obsidian-wikilink scanner |
| Heading and block references | Parsed target-note syntax trees |
| LaTeX syntax and supported commands | Remark Math nodes and KaTeX parser |
| Matrix structure | KaTeX array parse nodes |
| Heading hierarchy | Remark heading nodes |
| Callout density and nesting | Remark blockquote tree |
| Risky HTML | Remark HTML nodes |

Warnings require review but do not fail the validator. Errors produce a failing exit code.

Figure content, fidelity, layout, legibility, clipping, and renderer behavior are
excluded from static validation. Validate them only through the rendered
comparison defined in `visual-verification.md`.
