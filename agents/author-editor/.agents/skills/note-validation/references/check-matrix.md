# Validation Check Matrix

Use the listed evidence source; do not convert a proxy into a stronger claim.

| Required check | Primary evidence |
| --- | --- |
| Every legible source region represented | Full-resolution source-to-Reading-view comparison |
| No invented technical content | Source comparison and provenance review |
| Symbols, indices, dimensions, approximations, arrows match | Source comparison; static LaTeX report assists |
| Figure text remains attached | Reading-view and figure screenshot |
| Cross-page continuation correct | Source sequence comparison |
| Uncertainty disclosed | Source comparison plus static marker search |
| Reading order follows arrows, containment, placement | Source-to-render comparison |
| Relative prominence and embed width preserved | Full and narrow screenshots plus DOM geometry report |
| Large matrices/tensors use figures | Static large-matrix warning plus Reading view |
| Free-form geometry uses Excalidraw | Representation review |
| Logical flow uses Mermaid when appropriate | Representation review and Mermaid render |
| Internal links and attachment paths resolve | `validate_note.mjs`; optional CLI unresolved-link check |
| Excalidraw valid and non-empty | Static asset parse plus plugin render screenshot |
| Mermaid renders without errors | Obsidian errors/console and Reading view |
| No unnecessary theme-dependent HTML | Static risky-HTML report |
| Pre-existing bytes preserved | `validate_change_scope.mjs` against pre-write snapshot |
| Repairs stay within runtime authorization | Snapshot ranges and repair-boundary review |
| `$`, `$$`, braces, and environments balance | `validate_note.mjs` |
| No unsupported package or custom macro | Static macro report; Obsidian MathJax render |
| Arithmetic recomputed | Static simple-arithmetic result; explicit calculation for remaining arithmetic |
| Matrix rows and dimensions coherent | Static row-width check plus semantic dimension review |
| Every formula renders correctly | Full-resolution Reading-view inspection |
| Excalidraw LaTeX visible and unclipped | Excalidraw/plugin screenshot and DOM geometry |
| Clear title and hierarchy | Static heading report plus Reading view |
| Callouts sparse and meaningful | Static density metric plus semantic review |
| Diagrams readable in active theme | Theme report and screenshot |
| Text sufficiently large | DOM font/geometry report and screenshot |
| Figures sharp, complete, and not excessive | Image metadata, DOM geometry, and screenshot |
| Narrow viewport remains usable | Narrow screenshot and overflow report |

`validate_note.mjs` lists source-semantic and visual judgments under `manualRequired`. Complete those items explicitly; an empty static error list does not satisfy them.
