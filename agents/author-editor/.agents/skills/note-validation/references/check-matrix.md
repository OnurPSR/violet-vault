# Validation Check Matrix

| Check | Evidence |
| --- | --- |
| Markdown and GFM structure | Remark syntax tree |
| YAML frontmatter | Remark frontmatter node and YAML parser |
| Internal links and embeds | Parsed Markdown nodes and Obsidian-wikilink scanner |
| Heading and block references | Parsed target-note syntax trees |
| LaTeX syntax and supported commands | Remark Math nodes and KaTeX parser |
| Matrix structure | KaTeX array parse nodes |
| Mermaid block presence and basic directive structure | Parsed fenced-code nodes and static Mermaid checks |
| Heading hierarchy | Remark heading nodes |
| Callout density and nesting | Remark blockquote tree |
| Risky HTML | Remark HTML nodes |
| Image dimensions and upscaling | Parsed embeds and file metadata |
| Excalidraw validity | Decoded scene, elements, IDs, geometry, bindings, text, files, and bounds |

Warnings require review but do not fail the validator. Errors produce a failing exit code.
