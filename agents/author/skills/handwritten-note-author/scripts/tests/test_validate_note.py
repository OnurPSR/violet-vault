"""Tests for the static note validator.

Run from the skill root:

    python3 -m unittest discover -s scripts/tests -v

Every fixture is created in a temporary directory. No real Obsidian note,
attachment, or diagram is read or written by these tests.
"""

from __future__ import annotations

import io
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import validate_note as tool  # noqa: E402

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="4" height="4"/></svg>\n'


class ValidatorFixture(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="hna-validate-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        (self.root / "Attachments").mkdir()
        (self.root / "Diagrams").mkdir()

    def write_note(self, body: str, name: str = "Note.md") -> str:
        (self.root / name).write_text(body, encoding="utf-8")
        return name

    def check(self, name: str, *extra: str) -> tuple[int, str]:
        buffer_out, buffer_err = io.StringIO(), io.StringIO()
        with redirect_stdout(buffer_out), redirect_stderr(buffer_err):
            code = tool.main(["--vault", str(self.root), "--target", name, "--json", *extra])
        return code, buffer_out.getvalue() + buffer_err.getvalue()


class TestMath(ValidatorFixture):
    def test_balanced_math_passes(self) -> None:
        name = self.write_note(
            "# Note\n\nInline $x = 1$ and display:\n\n$$\n\\mathbf{W} \\in \\mathbb{R}^{n \\times d}\n$$\n"
        )
        code, output = self.check(name, "--check", "math-delimiters", "latex-structure")
        self.assertEqual(code, 0, output)

    def test_unbalanced_display_math_fails(self) -> None:
        name = self.write_note("# Note\n\n$$\nx = 1\n\nand then prose.\n")
        code, output = self.check(name, "--check", "math-delimiters")
        self.assertEqual(code, 1)
        self.assertIn("unbalanced", output)

    def test_escaped_dollar_is_not_a_delimiter(self) -> None:
        name = self.write_note("A price of \\$5 and another \\$7, no math here.\n")
        code, output = self.check(name, "--check", "math-delimiters")
        self.assertEqual(code, 0, output)

    def test_dollar_inside_a_code_fence_is_ignored(self) -> None:
        name = self.write_note("```bash\necho \"$HOME costs $5\"\n```\n")
        code, output = self.check(name, "--check", "math-delimiters", "code-fences")
        self.assertEqual(code, 0, output)

    def test_unbalanced_latex_braces_fail(self) -> None:
        name = self.write_note("$$\n\\frac{a}{b\n$$\n")
        code, output = self.check(name, "--check", "latex-structure")
        self.assertEqual(code, 1)
        self.assertIn("unclosed", output)

    def test_unmatched_environment_fails(self) -> None:
        name = self.write_note("$$\n\\begin{bmatrix} 1 & 2 \\end{pmatrix}\n$$\n")
        code, output = self.check(name, "--check", "latex-structure")
        self.assertEqual(code, 1)
        self.assertIn("mismatch", output.lower())


class TestFences(ValidatorFixture):
    def test_unclosed_fence_fails(self) -> None:
        name = self.write_note("```python\nprint(1)\n")
        code, output = self.check(name, "--check", "code-fences")
        self.assertEqual(code, 1)
        self.assertIn("unclosed code fence", output)

    def test_nested_longer_fence_passes(self) -> None:
        name = self.write_note("````markdown\n```python\nprint(1)\n```\n````\n")
        code, output = self.check(name, "--check", "code-fences")
        self.assertEqual(code, 0, output)


class TestEmbeds(ValidatorFixture):
    def test_missing_embed_fails(self) -> None:
        name = self.write_note("![[Diagrams/absent-figure.svg]]\n")
        code, output = self.check(name, "--check", "embeds")
        self.assertEqual(code, 1)
        self.assertIn("unresolved embed", output)

    def test_present_embed_passes(self) -> None:
        (self.root / "Diagrams" / "figure.svg").write_text(SVG, encoding="utf-8")
        name = self.write_note("![[Diagrams/figure.svg]]\n")
        code, output = self.check(name, "--check", "embeds", "svg-validity", "empty-assets")
        self.assertEqual(code, 0, output)

    def test_bare_name_embed_resolves_by_filename(self) -> None:
        (self.root / "Attachments" / "page-01.jpg").write_bytes(b"\xff\xd8\xff")
        name = self.write_note("![[page-01.jpg]]\n")
        code, output = self.check(name, "--check", "embeds")
        self.assertEqual(code, 0, output)

    def test_external_image_is_not_treated_as_a_local_path(self) -> None:
        name = self.write_note("![alt](https://example.com/x.png)\n")
        code, output = self.check(name, "--check", "embeds")
        self.assertEqual(code, 0, output)

    def test_embed_escaping_the_vault_fails(self) -> None:
        name = self.write_note("![[../outside/secret.svg]]\n")
        code, output = self.check(name, "--check", "embeds", "path-containment")
        self.assertEqual(code, 1)
        self.assertIn("path-security", output)

    def test_example_embed_inside_a_code_fence_is_not_reported(self) -> None:
        name = self.write_note(
            "Show the syntax:\n\n```markdown\n![[Diagrams/does-not-exist.svg]]\n```\n"
        )
        code, output = self.check(name, "--check", "embeds", "placeholders")
        self.assertEqual(code, 0, output)

    def test_placeholder_embed_fails(self) -> None:
        name = self.write_note("![[missing-file.excalidraw]]\n")
        code, output = self.check(name, "--check", "placeholders")
        self.assertEqual(code, 1)
        self.assertIn("placeholder", output)


class TestAssets(ValidatorFixture):
    def test_empty_svg_fails(self) -> None:
        (self.root / "Diagrams" / "empty.svg").write_text("", encoding="utf-8")
        name = self.write_note("![[Diagrams/empty.svg]]\n")
        code, output = self.check(name, "--check", "empty-assets")
        self.assertEqual(code, 1)
        self.assertIn("empty", output)

    def test_malformed_svg_fails(self) -> None:
        (self.root / "Diagrams" / "broken.svg").write_text("<svg><rect></svg>\n", encoding="utf-8")
        name = self.write_note("![[Diagrams/broken.svg]]\n")
        code, output = self.check(name, "--check", "svg-validity")
        self.assertEqual(code, 1)

    def test_svg_check_is_not_applicable_without_svg_embeds(self) -> None:
        name = self.write_note("# Note\n\nProse only.\n")
        code, output = self.check(name, "--check", "svg-validity")
        self.assertEqual(code, 0)
        self.assertIn("not applicable", output)


class TestAgentBlocks(ValidatorFixture):
    def test_matched_markers_pass(self) -> None:
        name = self.write_note(
            "old\n\n<!-- agent-block:start id=20260805T120000Z-abc123 -->\nnew\n"
            "<!-- agent-block:end id=20260805T120000Z-abc123 -->\n"
        )
        code, output = self.check(name, "--check", "agent-blocks")
        self.assertEqual(code, 0, output)

    def test_mismatched_markers_fail(self) -> None:
        name = self.write_note(
            "<!-- agent-block:start id=alpha -->\nnew\n<!-- agent-block:end id=beta -->\n"
        )
        code, output = self.check(name, "--check", "agent-blocks")
        self.assertEqual(code, 1)
        self.assertIn("marker", output)

    def test_duplicate_start_markers_fail(self) -> None:
        name = self.write_note(
            "<!-- agent-block:start id=alpha -->\na\n<!-- agent-block:start id=alpha -->\nb\n"
            "<!-- agent-block:end id=alpha -->\n"
        )
        code, output = self.check(name, "--check", "agent-blocks")
        self.assertEqual(code, 1)

    def test_list_blocks_reports_ids(self) -> None:
        name = self.write_note(
            "<!-- agent-block:start id=alpha -->\nx\n<!-- agent-block:end id=alpha -->\n"
        )
        code, output = self.check(name, "--list-blocks")
        self.assertEqual(code, 0)
        self.assertIn("alpha", output)


class TestTargetSecurity(ValidatorFixture):
    def test_traversal_target_is_blocked(self) -> None:
        code, output = self.check("../outside.md")
        self.assertEqual(code, 2)
        self.assertIn("traversal", output)

    def test_absolute_target_is_blocked(self) -> None:
        self.write_note("# Note\n")
        code, output = self.check(str(self.root / "Note.md"))
        self.assertEqual(code, 2)

    def test_non_markdown_target_is_blocked(self) -> None:
        (self.root / "data.csv").write_text("a,b\n", encoding="utf-8")
        code, output = self.check("data.csv")
        self.assertEqual(code, 2)


class TestArithmeticDiscrepancyPolicy(ValidatorFixture):
    """The source result stays; the audit is a separate, clearly marked annotation.

    This is the regression test for the resolved arithmetic contradiction: a
    detected discrepancy is *reported*, never silently corrected in the
    transcription.
    """

    NOTE = (
        "# Attention scores\n\n"
        "<!-- agent-block:start id=20260805T120000Z-aud1 -->\n"
        "Transcribed from page 2 exactly as written:\n\n"
        "$$\n3 \\times 7 = 22\n$$\n\n"
        "> [!warning]- Technical check (not part of the source)\n"
        "> Transcription fidelity: transcribed verbatim, high confidence.\n"
        "> Source-level audit: recomputed $3 \\times 7 = 21$; the page states 22.\n"
        "> The source expression is preserved above and was not altered.\n"
        "<!-- agent-block:end id=20260805T120000Z-aud1 -->\n"
    )

    def test_note_with_reported_discrepancy_is_structurally_valid(self) -> None:
        name = self.write_note(self.NOTE)
        code, output = self.check(name)
        self.assertEqual(code, 0, output)

    def test_source_expression_is_preserved_verbatim(self) -> None:
        name = self.write_note(self.NOTE)
        text = (self.root / name).read_text(encoding="utf-8")
        self.assertIn("3 \\times 7 = 22", text, "the source result must survive validation")
        self.assertIn("Technical check", text, "the audit must be a separate annotation")
        self.assertLess(
            text.index("3 \\times 7 = 22"),
            text.index("Technical check"),
            "the faithful transcription must precede the audit annotation",
        )

    def test_validator_does_not_recompute_arithmetic(self) -> None:
        name = self.write_note(self.NOTE)
        _, output = self.check(name)
        self.assertNotIn("arithmetic", output.lower())
        self.assertIn("do not establish", output)


if __name__ == "__main__":
    unittest.main()
