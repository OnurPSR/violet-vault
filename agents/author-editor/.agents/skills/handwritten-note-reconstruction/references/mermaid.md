# Mermaid Reconstruction

## Select Mermaid

Use Mermaid when edge logic is primary and free-form placement is not: directed workflows, dependency graphs, hierarchies, state transitions, sequences, and discrete architectures.

Choose Excalidraw instead for geometry, coordinate space, curved spatial relationships, matrices, irregular grouping, or math-heavy labels.

## Preserve the source logic

- Match the handwritten direction: top-down, left-right, or cyclic.
- Preserve branch order, arrow direction, containment, and edge labels.
- Use subgraphs only for source containers or clearly bounded subsystems.
- Split a diagram only when the source contains separable systems.
- Keep a label inside its node or on its edge when it identifies that element.
- Keep node wording source-faithful and short enough to scan.

## Write robust Mermaid

- Give nodes stable simple IDs independent of their visible labels.
- Quote visible labels containing punctuation or syntax-sensitive characters.
- Prefer plain text and reliable Unicode for minimal notation.
- Do not put display LaTeX, custom MathJax macros, or fragile HTML in labels.
- Do not use invisible nodes, long links, or spacing characters to force geometric placement.
- Use styling sparingly and consistently; diagram structure should carry the meaning.
- If automatic layout changes the meaning during visual verification, move the figure to Excalidraw rather than adding positional hacks.
