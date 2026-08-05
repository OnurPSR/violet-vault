#!/usr/bin/env python3
"""Static structural validation for a reconstructed Obsidian note.

Scope and honesty
-----------------
Every check here is a *static* check: it inspects bytes, not meaning. Passing
this script establishes that the note is syntactically well formed and that its
links resolve inside the vault. It does **not** establish that the transcription
is faithful, that the mathematics is correct, or that the note renders as
intended in Obsidian. Those are separate statuses; see
``references/validation.md`` -> "Capability-aware validation matrix".

Checks
------
``code-fences``        balanced ``` and ~~~ fences, longest-fence nesting aware
``math-delimiters``    balanced ``$`` / ``$$``, escaped ``\\$`` ignored, code spans excluded
``latex-structure``    balanced braces and matching \\begin{...}/\\end{...} inside math
``agent-blocks``       exactly one start and one end marker per id, start before end
``embeds``             every ![[...]] / ![](...) target resolves inside the vault
``links``              every [[...]] target resolves inside the vault
``path-containment``   no resolved target escapes the vault root
``empty-assets``       no embedded diagram or SVG file is empty or whitespace-only
``svg-validity``       every embedded .svg parses as XML with an <svg> root
``placeholders``       no forbidden placeholder embed (missing-file, path/to/, TODO, ...)

Usage
-----
    python3 validate_note.py --vault /path/to/Vault --target "AI/Note.md"
    python3 validate_note.py --vault . --target Note.md --json
    python3 validate_note.py --vault . --target Note.md --check math-delimiters embeds
    python3 validate_note.py --vault . --target Note.md --list-blocks

Exit codes
----------
0   no check failed (checks may be "passed" or "not applicable")
1   at least one check failed
2   blocked: usage error, path-security rejection, or unreadable target
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ElementTree
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vaultpath import (  # noqa: E402  (local module, path set above)
    PathSecurityError,
    is_within,
    resolve_in_vault,
    resolve_vault_root,
    vault_relative,
)
from verify_append_only import find_blocks  # noqa: E402

ALL_CHECKS = (
    "code-fences",
    "math-delimiters",
    "latex-structure",
    "agent-blocks",
    "embeds",
    "links",
    "path-containment",
    "empty-assets",
    "svg-validity",
    "placeholders",
)

SKIP_DIRECTORIES = {".obsidian", ".git", ".trash", "node_modules"}
DIAGRAM_SUFFIXES = {".svg", ".excalidraw"}
PLACEHOLDER_PATTERNS = (
    re.compile(r"(^|/)missing[-_.]", re.I),
    re.compile(r"(^|/)placeholder", re.I),
    re.compile(r"^(todo|tbd|xxx|untitled)\b", re.I),
    re.compile(r"^path/to/", re.I),
    re.compile(r"^(example|your)[-_.]", re.I),
)

FENCE_RE = re.compile(r"^(?P<indent>[ \t]{0,3})(?P<fence>`{3,}|~{3,})(?P<info>.*)$")
EMBED_WIKI_RE = re.compile(r"!\[\[([^\]\n]*?)\]\]")
LINK_WIKI_RE = re.compile(r"(?<!!)\[\[([^\]\n]*?)\]\]")
MD_IMAGE_RE = re.compile(r"!\[[^\]\n]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
EXTERNAL_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


class Blocked(Exception):
    """Usage, capability, or path-security problem (exit code 2)."""


# --------------------------------------------------------------------------- #
# masking helpers
# --------------------------------------------------------------------------- #

def mask_code(text: str) -> tuple[str, list[str]]:
    """Replace fenced blocks and inline code spans with spaces.

    Offsets and line numbers are preserved so later checks can still report a
    useful location. Returns the masked text plus any fence problems found.
    """
    problems: list[str] = []
    lines = text.split("\n")
    masked_lines: list[str] = []
    open_fence: str | None = None
    open_line = 0

    for number, line in enumerate(lines, start=1):
        match = FENCE_RE.match(line)
        if match:
            fence = match.group("fence")
            if open_fence is None:
                open_fence = fence
                open_line = number
                masked_lines.append(" " * len(line))
                continue
            # A closing fence must use the same character and be at least as long,
            # and must not carry an info string.
            same_char = fence[0] == open_fence[0]
            if same_char and len(fence) >= len(open_fence) and not match.group("info").strip():
                open_fence = None
                masked_lines.append(" " * len(line))
                continue
        masked_lines.append(" " * len(line) if open_fence is not None else line)

    if open_fence is not None:
        problems.append(f"unclosed code fence opened on line {open_line} with {open_fence!r}")

    masked = "\n".join(masked_lines)
    masked = re.sub(r"`+[^`\n]*`+", lambda m: " " * len(m.group(0)), masked)
    return masked, problems


def is_escaped(text: str, index: int) -> bool:
    backslashes = 0
    cursor = index - 1
    while cursor >= 0 and text[cursor] == "\\":
        backslashes += 1
        cursor -= 1
    return backslashes % 2 == 1


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def math_spans(masked: str) -> tuple[list[tuple[str, int, int]], list[str]]:
    """Return (kind, start, end) for each math span plus delimiter problems."""
    spans: list[tuple[str, int, int]] = []
    problems: list[str] = []
    index = 0
    length = len(masked)
    while index < length:
        char = masked[index]
        if char != "$" or is_escaped(masked, index):
            index += 1
            continue
        display = masked.startswith("$$", index)
        opener = index
        delimiter = "$$" if display else "$"
        cursor = index + len(delimiter)
        closer = -1
        while cursor < length:
            if masked[cursor] == "$" and not is_escaped(masked, cursor):
                if display:
                    if masked.startswith("$$", cursor):
                        closer = cursor
                        break
                    cursor += 1
                    continue
                closer = cursor
                break
            if not display and masked[cursor] == "\n" and masked.startswith("\n\n", cursor):
                break  # inline math never spans a blank line
            cursor += 1
        if closer < 0:
            problems.append(
                f"unbalanced {'display' if display else 'inline'} math delimiter "
                f"{delimiter!r} opened on line {line_of(masked, opener)}"
            )
            break
        spans.append(("display" if display else "inline", opener + len(delimiter), closer))
        index = closer + len(delimiter)
    return spans, problems


# --------------------------------------------------------------------------- #
# vault index
# --------------------------------------------------------------------------- #

def index_vault(root: Path) -> dict[str, list[Path]]:
    index: dict[str, list[Path]] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRECTORIES and not d.startswith(".")]
        for name in filenames:
            path = Path(dirpath) / name
            index.setdefault(name.lower(), []).append(path)
            index.setdefault(Path(name).stem.lower(), []).append(path)
    return index


def normalise_target(raw: str) -> str:
    target = unicodedata.normalize("NFC", raw.strip())
    target = target.split("|", 1)[0].strip()
    target = re.split(r"[#^]", target, maxsplit=1)[0].strip()
    return target


def resolve_reference(root: Path, index: dict[str, list[Path]], raw: str) -> tuple[Path | None, str]:
    """Resolve an Obsidian reference. Returns (path or None, reason)."""
    target = normalise_target(raw)
    if not target:
        return None, "empty reference"
    if EXTERNAL_RE.match(target) and not target.lower().startswith("file:"):
        return None, "external"
    target = urllib.parse.unquote(target)

    candidates = [target]
    if not Path(target).suffix:
        candidates.append(target + ".md")

    if "/" in target:
        for candidate in candidates:
            try:
                resolved = resolve_in_vault(root, candidate)
            except PathSecurityError as error:
                return None, f"path-security: {error}"
            if resolved.is_file():
                return resolved, "resolved"
        return None, "not found"

    for candidate in candidates:
        matches = index.get(candidate.lower(), [])
        matches = [m for m in matches if is_within(root, m.resolve())]
        if matches:
            return matches[0], "resolved"
    return None, "not found"


# --------------------------------------------------------------------------- #
# checks
# --------------------------------------------------------------------------- #

def collect_references(text: str) -> tuple[list[str], list[str]]:
    embeds = [m.group(1) for m in EMBED_WIKI_RE.finditer(text)]
    embeds += [m.group(1) for m in MD_IMAGE_RE.finditer(text)]
    links = [m.group(1) for m in LINK_WIKI_RE.finditer(text)]
    return embeds, links


def check_svg(path: Path) -> str | None:
    try:
        tree = ElementTree.parse(path)
    except ElementTree.ParseError as error:
        return f"{path.name}: not well-formed XML ({error})"
    tag = tree.getroot().tag
    local = tag.split("}", 1)[-1]
    if local.lower() != "svg":
        return f"{path.name}: root element is <{local}>, expected <svg>"
    return None


def run_checks(root: Path, target: Path, text: str, selected: set[str]) -> list[dict]:
    masked, fence_problems = mask_code(text)
    index = index_vault(root)
    # References are collected from the masked text: Obsidian does not resolve a
    # link inside a code fence or an inline code span, so an illustrative example
    # in a fenced block must not be reported as a dead embed. Agent-block markers
    # are read from the raw text instead, to match the writer exactly.
    embeds, links = collect_references(masked)
    results: list[dict] = []

    def record(name: str, status: str, details: list[str] | None = None, **extra) -> None:
        if name not in selected:
            return
        entry = {"check": name, "status": status}
        if details:
            entry["details"] = details
        entry.update(extra)
        results.append(entry)

    record("code-fences", "failed" if fence_problems else "passed", fence_problems)

    spans, math_problems = math_spans(masked)
    record(
        "math-delimiters",
        "failed" if math_problems else ("passed" if spans else "not applicable"),
        math_problems,
        span_count=len(spans),
    )

    latex_problems: list[str] = []
    for kind, start, end in spans:
        body = masked[start:end]
        depth = 0
        for position, char in enumerate(body):
            if is_escaped(body, position):
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth < 0:
                    latex_problems.append(
                        f"unmatched '}}' in {kind} math on line {line_of(masked, start + position)}"
                    )
                    break
        if depth > 0:
            latex_problems.append(
                f"{depth} unclosed '{{' in {kind} math starting on line {line_of(masked, start)}"
            )
        stack: list[str] = []
        for match in re.finditer(r"\\(begin|end)\s*\{([^}]*)\}", body):
            if match.group(1) == "begin":
                stack.append(match.group(2))
            elif not stack:
                latex_problems.append(
                    f"\\end{{{match.group(2)}}} without \\begin on line {line_of(masked, start + match.start())}"
                )
            elif stack.pop() != match.group(2):
                latex_problems.append(
                    f"mismatched environment near line {line_of(masked, start + match.start())}"
                )
        for unclosed in stack:
            latex_problems.append(
                f"\\begin{{{unclosed}}} without \\end in math starting on line {line_of(masked, start)}"
            )
    record(
        "latex-structure",
        "failed" if latex_problems else ("passed" if spans else "not applicable"),
        latex_problems,
    )

    blocks = find_blocks(text)
    block_problems: list[str] = []
    for block_id, entry in sorted(blocks.items()):
        if entry["starts"] != 1 or entry["ends"] != 1:
            block_problems.append(
                f"agent-block {block_id}: {entry['starts']} start marker(s), {entry['ends']} end marker(s)"
            )
        elif entry["start_pos"] > entry["end_pos"]:
            block_problems.append(f"agent-block {block_id}: end marker precedes start marker")
    record(
        "agent-blocks",
        "failed" if block_problems else ("passed" if blocks else "not applicable"),
        block_problems,
        block_ids=sorted(blocks),
    )

    resolved_assets: list[Path] = []
    embed_problems: list[str] = []
    escape_problems: list[str] = []
    for reference in embeds:
        path, reason = resolve_reference(root, index, reference)
        if reason == "external":
            continue
        if path is None:
            if reason.startswith("path-security"):
                escape_problems.append(f"{reference}: {reason}")
            embed_problems.append(f"unresolved embed: {reference} ({reason})")
        else:
            resolved_assets.append(path)
            if not is_within(root, path.resolve()):
                escape_problems.append(f"{reference}: resolves outside the vault")
    record(
        "embeds",
        "failed" if embed_problems else ("passed" if embeds else "not applicable"),
        embed_problems,
        embed_count=len(embeds),
    )

    link_problems: list[str] = []
    for reference in links:
        path, reason = resolve_reference(root, index, reference)
        if reason == "external":
            continue
        if path is None:
            link_problems.append(f"unresolved link: {reference} ({reason})")
        elif not is_within(root, path.resolve()):
            escape_problems.append(f"{reference}: resolves outside the vault")
    record(
        "links",
        "failed" if link_problems else ("passed" if links else "not applicable"),
        link_problems,
        link_count=len(links),
    )

    record(
        "path-containment",
        "failed" if escape_problems else "passed",
        escape_problems,
    )

    diagram_assets = [
        path for path in resolved_assets
        if path.suffix.lower() in DIAGRAM_SUFFIXES or path.name.lower().endswith(".excalidraw.md")
    ]
    empty_problems = [
        f"empty or whitespace-only asset: {path.name}"
        for path in diagram_assets
        if path.stat().st_size == 0 or not path.read_bytes().strip()
    ]
    record(
        "empty-assets",
        "failed" if empty_problems else ("passed" if diagram_assets else "not applicable"),
        empty_problems,
    )

    svg_assets = [path for path in diagram_assets if path.suffix.lower() == ".svg" and path.stat().st_size]
    svg_problems = [problem for problem in (check_svg(path) for path in svg_assets) if problem]
    record(
        "svg-validity",
        "failed" if svg_problems else ("passed" if svg_assets else "not applicable"),
        svg_problems,
    )

    placeholder_problems = [
        f"forbidden placeholder reference: {reference}"
        for reference in embeds + links
        for pattern in PLACEHOLDER_PATTERNS
        if pattern.search(normalise_target(reference))
    ]
    record(
        "placeholders",
        "failed" if placeholder_problems else "passed",
        sorted(set(placeholder_problems)),
    )

    return results


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="validate_note.py",
        description="Static structural validation for a reconstructed Obsidian note.",
    )
    parser.add_argument("--vault", required=True, help="vault root directory")
    parser.add_argument("--target", required=True, help="vault-relative note path")
    parser.add_argument("--check", nargs="+", choices=ALL_CHECKS, help="run only these checks")
    parser.add_argument("--list-blocks", action="store_true", help="list agent-block ids and exit")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a text summary")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        root = resolve_vault_root(args.vault)
        target = resolve_in_vault(root, args.target, require_markdown=True, must_exist=True)
        text = target.read_text(encoding="utf-8", errors="replace")
    except (PathSecurityError, Blocked) as error:
        return _emit(
            {"status": "blocked", "reason": "path-security", "message": str(error)}, args, 2
        )
    except OSError as error:
        return _emit({"status": "blocked", "reason": "io", "message": str(error)}, args, 2)

    if args.list_blocks:
        blocks = find_blocks(text)
        return _emit(
            {"status": "passed", "target": vault_relative(root, target), "block_ids": sorted(blocks)},
            args,
            0,
        )

    selected = set(args.check) if args.check else set(ALL_CHECKS)
    results = run_checks(root, target, text, selected)
    failed = [entry for entry in results if entry["status"] == "failed"]
    payload = {
        "target": vault_relative(root, target),
        "status": "failed" if failed else "passed",
        "checks": results,
        "failed_checks": [entry["check"] for entry in failed],
        "disclaimer": (
            "Static checks only. They do not establish transcription fidelity, "
            "mathematical correctness, or Obsidian rendering."
        ),
    }
    return _emit(payload, args, 1 if failed else 0)


def _emit(payload: dict, args: argparse.Namespace, code: int) -> int:
    stream = sys.stdout if code == 0 else sys.stderr
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True), file=stream)
    else:
        print(f"target: {payload.get('target', '-')}", file=stream)
        print(f"status: {payload['status']}", file=stream)
        for entry in payload.get("checks", []):
            print(f"  [{entry['status']:>14}] {entry['check']}", file=stream)
            for detail in entry.get("details", []):
                print(f"       - {detail}", file=stream)
        if "message" in payload:
            print(f"message: {payload['message']}", file=stream)
        if "block_ids" in payload:
            print(f"block_ids: {payload['block_ids']}", file=stream)
        if "disclaimer" in payload:
            print(f"note: {payload['disclaimer']}", file=stream)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
