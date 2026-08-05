"""Tests for the transactional append-only writer.

Run from the skill root:

    python3 -m unittest discover -s scripts/tests -v
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import verify_append_only as tool  # noqa: E402


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class VaultFixture(unittest.TestCase):
    """A throwaway vault. No real Obsidian note is ever touched by these tests."""

    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="hna-append-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        (self.root / "AI").mkdir()
        self.note = self.root / "AI" / "Note.md"
        self.original = "# Note\n\nPre-existing user content.\n"
        self.note.write_text(self.original, encoding="utf-8")

    def payload(self, body: str = "Reconstructed content.\n") -> str:
        path = self.root / ".payload.md"
        path.write_text(body, encoding="utf-8")
        return str(path)

    def run_tool(self, argv: list[str]) -> int:
        """Run the CLI, capturing its report so test output stays readable."""
        buffer_out, buffer_err = io.StringIO(), io.StringIO()
        with redirect_stdout(buffer_out), redirect_stderr(buffer_err):
            code = tool.main(argv)
        self.last_output = buffer_out.getvalue() + buffer_err.getvalue()
        return code


class TestBlockIdentifiers(VaultFixture):
    def test_generated_ids_are_unique_and_well_formed(self) -> None:
        ids = {tool.new_block_id() for _ in range(50)}
        self.assertEqual(len(ids), 50)
        for value in ids:
            self.assertRegex(value, tool.BLOCK_ID_PATTERN)

    def test_malformed_id_is_blocked(self) -> None:
        with self.assertRaises(tool.Blocked):
            tool.check_block_id("bad id with spaces")


class TestAppend(VaultFixture):
    def test_append_preserves_the_original_prefix(self) -> None:
        before = self.note.read_bytes()
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(), "--expect-sha", sha(before), "--block-id", "test-block-1"]
        )
        self.assertEqual(code, 0)
        after = self.note.read_bytes()
        self.assertTrue(after.startswith(before), "original bytes must remain an unchanged prefix")
        text = after.decode()
        self.assertIn("<!-- agent-block:start id=test-block-1 -->", text)
        self.assertIn("<!-- agent-block:end id=test-block-1 -->", text)
        self.assertIn("Pre-existing user content.", text)

    def test_append_creates_a_missing_note(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/New.md",
             "--payload", self.payload(), "--expect-absent"]
        )
        self.assertEqual(code, 0)
        self.assertTrue((self.root / "AI" / "New.md").is_file())

    def test_stale_hash_is_detected_as_concurrent_modification(self) -> None:
        stale = sha(self.note.read_bytes())
        self.note.write_text(self.original + "\nEdited by the user in Obsidian.\n", encoding="utf-8")
        untouched = self.note.read_bytes()
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(), "--expect-sha", stale]
        )
        self.assertEqual(code, 1, "a stale hash must fail, not merely warn")
        self.assertEqual(self.note.read_bytes(), untouched, "nothing may be written on abort")

    def test_existing_note_without_expected_hash_is_blocked(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md", "--payload", self.payload()]
        )
        self.assertEqual(code, 2)

    def test_dry_run_does_not_modify_the_target(self) -> None:
        before = self.note.read_bytes()
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(), "--expect-sha", sha(before), "--dry-run"]
        )
        self.assertEqual(code, 0)
        self.assertEqual(self.note.read_bytes(), before)

    def test_payload_carrying_its_own_markers_is_blocked(self) -> None:
        body = "<!-- agent-block:start id=smuggled -->\nx\n<!-- agent-block:end id=smuggled -->\n"
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(body), "--expect-sha", sha(self.note.read_bytes())]
        )
        self.assertEqual(code, 2)

    def test_empty_payload_is_blocked(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload("   \n"), "--expect-sha", sha(self.note.read_bytes())]
        )
        self.assertEqual(code, 2)

    def test_no_temporary_files_are_left_behind(self) -> None:
        self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(), "--expect-sha", sha(self.note.read_bytes())]
        )
        leftovers = [p.name for p in (self.root / "AI").iterdir() if p.name.endswith(".agent-tmp")]
        self.assertEqual(leftovers, [])


class TestPathSecurity(VaultFixture):
    def test_traversal_is_rejected(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "../escape.md",
             "--payload", self.payload(), "--expect-absent"]
        )
        self.assertEqual(code, 2)
        self.assertFalse((self.root.parent / "escape.md").exists())

    def test_absolute_path_is_rejected(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", str(self.root / "AI" / "Note.md"),
             "--payload", self.payload(), "--allow-unplanned"]
        )
        self.assertEqual(code, 2)

    def test_non_markdown_extension_is_rejected(self) -> None:
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.txt",
             "--payload", self.payload(), "--expect-absent"]
        )
        self.assertEqual(code, 2)

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks unavailable")
    def test_symlink_escaping_the_vault_is_rejected(self) -> None:
        outside = Path(tempfile.mkdtemp(prefix="hna-outside-"))
        self.addCleanup(shutil.rmtree, outside, ignore_errors=True)
        (outside / "Secret.md").write_text("outside content\n", encoding="utf-8")
        try:
            os.symlink(outside, self.root / "Linked")
        except (OSError, NotImplementedError):  # pragma: no cover
            self.skipTest("cannot create symlinks in this environment")
        code = self.run_tool(
            ["append", "--vault", str(self.root), "--target", "Linked/Secret.md",
             "--payload", self.payload(), "--allow-unplanned"]
        )
        self.assertEqual(code, 2)
        self.assertEqual((outside / "Secret.md").read_text(encoding="utf-8"), "outside content\n")


class TestVerify(VaultFixture):
    def _append(self, block_id: str = "block-a") -> None:
        self.snapshot = self.root / ".snapshot.md"
        self.snapshot.write_bytes(self.note.read_bytes())
        self.run_tool(
            ["append", "--vault", str(self.root), "--target", "AI/Note.md",
             "--payload", self.payload(), "--expect-sha", sha(self.note.read_bytes()),
             "--block-id", block_id]
        )

    def test_verify_accepts_an_unchanged_prefix(self) -> None:
        self._append()
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md",
             "--original-file", str(self.snapshot), "--block-id", "block-a"]
        )
        self.assertEqual(code, 0)

    def test_verify_rejects_a_modified_prefix(self) -> None:
        self._append()
        text = self.note.read_text(encoding="utf-8")
        self.note.write_text(text.replace("Pre-existing user content.", "Silently rewritten."), encoding="utf-8")
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md",
             "--original-file", str(self.snapshot)]
        )
        self.assertEqual(code, 1)

    def test_verify_accepts_hash_and_size_instead_of_a_snapshot(self) -> None:
        before = self.note.read_bytes()
        self._append()
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md",
             "--original-sha", sha(before), "--original-size", str(len(before))]
        )
        self.assertEqual(code, 0)

    def test_mismatched_runtime_markers_fail(self) -> None:
        self._append()
        text = self.note.read_text(encoding="utf-8")
        self.note.write_text(text.replace("<!-- agent-block:end id=block-a -->", ""), encoding="utf-8")
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md",
             "--original-file", str(self.snapshot), "--block-id", "block-a"]
        )
        self.assertEqual(code, 1)

    def test_block_revision_allows_inside_and_rejects_outside(self) -> None:
        self._append("block-r")
        revised_source = self.root / ".revised.md"
        revised_source.write_bytes(self.note.read_bytes())

        text = self.note.read_text(encoding="utf-8")
        self.note.write_text(text.replace("Reconstructed content.", "Revised on request."), encoding="utf-8")
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md", "--mode", "outside-block",
             "--block-id", "block-r", "--original-file", str(revised_source)]
        )
        self.assertEqual(code, 0, "editing inside a runtime block is permitted")

        text = self.note.read_text(encoding="utf-8")
        self.note.write_text(text.replace("Pre-existing user content.", "Tampered."), encoding="utf-8")
        code = self.run_tool(
            ["verify", "--vault", str(self.root), "--target", "AI/Note.md", "--mode", "outside-block",
             "--block-id", "block-r", "--original-file", str(revised_source)]
        )
        self.assertEqual(code, 1, "editing outside the block must fail")


class TestPlan(VaultFixture):
    def test_plan_reports_size_and_hash(self) -> None:
        result = tool.cmd_plan(_Namespace(vault=str(self.root), target="AI/Note.md"))
        self.assertTrue(result["exists"])
        self.assertEqual(result["size"], len(self.original.encode()))
        self.assertEqual(result["sha256"], sha(self.original.encode()))

    def test_plan_handles_a_missing_note(self) -> None:
        result = tool.cmd_plan(_Namespace(vault=str(self.root), target="AI/Absent.md"))
        self.assertFalse(result["exists"])
        self.assertEqual(result["sha256"], tool.EMPTY_SHA256)


class _Namespace:
    def __init__(self, **kwargs) -> None:
        self.__dict__.update(kwargs)


if __name__ == "__main__":
    unittest.main()
