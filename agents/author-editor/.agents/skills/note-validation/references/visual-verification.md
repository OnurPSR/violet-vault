# Generated Figure Visual Verification

Apply this workflow only when visual verification is on. If the runtime setting
is absent, treat it as on.

For every figure created or regenerated during the task:

1. Compare one rendering in its final note format with the source.
2. Correct material errors in content, labels, formulas, connectors, placement,
   clipping, or legibility.
3. Render and compare once more.

Do not iterate over cosmetic differences. Use `PASS` only after direct rendered
inspection, `FAIL` when a material discrepancy remains, and `INCOMPLETE` when
the source or rendering is unavailable. Static inspection is not a substitute.
