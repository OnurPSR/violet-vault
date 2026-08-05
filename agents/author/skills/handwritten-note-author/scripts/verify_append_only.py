#!/usr/bin/env python3
"""Transactional append-only writer and verifier for Obsidian notes.

The append-only guarantee in ``AGENTS.md`` is only credible if it is
mechanically checkable. This tool implements the nine-step protocol described
in ``references/validation.md`` -> "Transactional append protocol":

  1. resolve and validate the canonical target path (vault-relative, no ``..``,
     symlinks resolved, still inside the vault, Markdown extension);
  2. record the original byte size and SHA-256;
  3. build the new content in a temporary file, never in place;
  4. re-hash the target immediately before the write;
  5. abort on concurrent modification;
  6. replace atomically via ``os.replace`` inside the same directory;
  7. verify the original byte sequence is still an unchanged prefix;
  8. verify the agent-block boundaries;
  9. on any invariant failure, report and stop -- never attempt a destructive
     "repair".

Commands
--------
``new-id``
    Print a fresh agent-block identifier.

``plan --vault ROOT --target NOTE``
    Step 1-2. Prints the canonical path, size, and SHA-256 of the target
    (``exists: false`` with a zero hash when the note does not exist yet).

``append --vault ROOT --target NOTE --payload FILE|- [--expect-sha SHA]``
    Steps 3-9. Wraps the payload in agent-block markers and appends it. The
    markers are generated here, so a block can never be written unterminated.
    ``--expect-sha`` is the hash returned by ``plan``; pass ``--expect-absent``
    when the note must not exist yet. Use ``--dry-run`` to run every check and
    the temporary-file build without replacing the target.

``verify --vault ROOT --target NOTE (--original-file F | --original-sha S --original-size N)``
    Steps 7-8 alone, for after-the-fact auditing. ``--mode prefix`` (default)
    checks that the original bytes are an unchanged prefix. ``--mode
    outside-block --block-id ID`` checks that every byte outside that block is
    unchanged, which is the invariant for the ``revise-runtime-block`` mode.

Exit codes
----------
0   every requested invariant holds
1   an invariant failed (the note was not modified, or the failure is reported
    without recovery)
2   usage, path-security, or capability problem -- the operation is *blocked*,
    not *failed*

Add ``--json`` to any command for machine-readable output.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from vaultpath import (  # noqa: E402  (local module, path set above)
    PathSecurityError,
    resolve_in_vault,
    resolve_vault_root,
    vault_relative,
)

EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()

BLOCK_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
START_MARKER = "<!-- agent-block:start id={id} -->"
END_MARKER = "<!-- agent-block:end id={id} -->"
ANY_START = re.compile(r"^[ \t]*<!--[ \t]*agent-block:start[ \t]+id=([^\s>]+)[ \t]*-->[ \t]*$", re.M)
ANY_END = re.compile(r"^[ \t]*<!--[ \t]*agent-block:end[ \t]+id=([^\s>]+)[ \t]*-->[ \t]*$", re.M)


class Blocked(Exception):
    """Usage, capability, or path-security problem (exit code 2)."""


class InvariantFailure(Exception):
    """A checked guarantee does not hold (exit code 1)."""


# --------------------------------------------------------------------------- #
# identifiers
# --------------------------------------------------------------------------- #

def new_block_id() -> str:
    """``<UTC compact timestamp>-<6 hex chars>``, e.g. ``20260805T141200Z-9f3ac1``.

    The timestamp makes blocks sortable and human-auditable; the random suffix
    makes a collision within the same second effectively impossible, so two
    blocks written in one run can never share an identifier.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{secrets.token_hex(3)}"


def check_block_id(block_id: str) -> str:
    if not BLOCK_ID_PATTERN.match(block_id):
        raise Blocked(
            "block id must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}: " + repr(block_id)
        )
    return block_id


# --------------------------------------------------------------------------- #
# hashing / block inspection
# --------------------------------------------------------------------------- #

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bytes(path: Path) -> bytes:
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return b""


def find_blocks(text: str) -> dict[str, dict[str, int]]:
    """Map block id -> {starts, ends, start_pos, end_pos}."""
    found: dict[str, dict[str, int]] = {}
    for match in ANY_START.finditer(text):
        entry = found.setdefault(match.group(1), {"starts": 0, "ends": 0, "start_pos": -1, "end_pos": -1})
        entry["starts"] += 1
        if entry["start_pos"] < 0:
            entry["start_pos"] = match.start()
    for match in ANY_END.finditer(text):
        entry = found.setdefault(match.group(1), {"starts": 0, "ends": 0, "start_pos": -1, "end_pos": -1})
        entry["ends"] += 1
        entry["end_pos"] = match.end()
    return found


def check_block_boundaries(text: str, block_id: str) -> list[str]:
    """Return a list of boundary problems for ``block_id`` (empty when valid)."""
    problems: list[str] = []
    blocks = find_blocks(text)
    entry = blocks.get(block_id)
    if entry is None:
        return [f"no agent-block markers found for id {block_id}"]
    if entry["starts"] != 1:
        problems.append(f"expected exactly 1 start marker for {block_id}, found {entry['starts']}")
    if entry["ends"] != 1:
        problems.append(f"expected exactly 1 end marker for {block_id}, found {entry['ends']}")
    if entry["start_pos"] >= 0 and entry["end_pos"] >= 0 and entry["start_pos"] > entry["end_pos"]:
        problems.append(f"end marker precedes start marker for {block_id}")
    return problems


def extract_block_span(text: str, block_id: str) -> tuple[int, int]:
    problems = check_block_boundaries(text, block_id)
    if problems:
        raise InvariantFailure("; ".join(problems))
    entry = find_blocks(text)[block_id]
    return entry["start_pos"], entry["end_pos"]


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #

def cmd_plan(args: argparse.Namespace) -> dict:
    root = resolve_vault_root(args.vault)
    target = resolve_in_vault(root, args.target, require_markdown=True)
    exists = target.is_file()
    data = read_bytes(target) if exists else b""
    return {
        "command": "plan",
        "status": "passed",
        "vault_root": str(root),
        "target": str(target),
        "target_relative": vault_relative(root, target),
        "exists": exists,
        "size": len(data),
        "sha256": sha256_bytes(data) if exists else EMPTY_SHA256,
        "suggested_block_id": new_block_id(),
    }


def _load_payload(source: str) -> str:
    if source == "-":
        return sys.stdin.read()
    path = Path(source)
    if not path.is_file():
        raise Blocked(f"payload file not found: {source}")
    return path.read_text(encoding="utf-8")


def _separator(original: bytes) -> bytes:
    """Bytes inserted between the original content and the new block.

    Never removes or rewrites original bytes, so prefix preservation holds by
    construction; only guarantees a blank line before the start marker.
    """
    if not original:
        return b""
    if original.endswith(b"\n\n"):
        return b""
    if original.endswith(b"\n"):
        return b"\n"
    return b"\n\n"


def cmd_append(args: argparse.Namespace) -> dict:
    root = resolve_vault_root(args.vault)                                    # step 1
    target = resolve_in_vault(root, args.target, require_markdown=True)
    if target.exists() and not target.is_file():
        raise Blocked(f"target is not a regular file: {target}")

    block_id = check_block_id(args.block_id or new_block_id())

    original = read_bytes(target)                                            # step 2
    original_sha = sha256_bytes(original) if target.is_file() else EMPTY_SHA256
    original_size = len(original)

    if args.expect_absent and target.exists():
        raise InvariantFailure("--expect-absent was given but the target already exists")
    if args.expect_sha and args.expect_sha.lower() != original_sha:
        raise InvariantFailure(
            "concurrent modification: expected sha256 "
            f"{args.expect_sha.lower()} but the target now hashes to {original_sha}"
        )
    if not args.expect_sha and not args.expect_absent and target.is_file() and not args.allow_unplanned:
        raise Blocked(
            "existing target requires --expect-sha from `plan` (or --allow-unplanned "
            "when the caller has just hashed the file itself)"
        )

    body = _load_payload(args.payload)
    if not body.strip():
        raise Blocked("refusing to append an empty block")
    if ANY_START.search(body) or ANY_END.search(body):
        raise Blocked("payload already contains agent-block markers; pass the block body only")
    if not body.endswith("\n"):
        body += "\n"

    block = (
        START_MARKER.format(id=block_id) + "\n" + body + END_MARKER.format(id=block_id) + "\n"
    )
    new_content = original + _separator(original) + block.encode("utf-8")    # step 3

    # Pre-write verification: the checks that decide whether we write at all.
    if not new_content.startswith(original):
        raise InvariantFailure("internal error: assembled content does not preserve the original prefix")
    boundary_problems = check_block_boundaries(new_content.decode("utf-8", "replace"), block_id)
    if boundary_problems:
        raise InvariantFailure("; ".join(boundary_problems))

    result = {
        "command": "append",
        "vault_root": str(root),
        "target": str(target),
        "target_relative": vault_relative(root, target),
        "block_id": block_id,
        "created_target": not target.exists(),
        "original_size": original_size,
        "original_sha256": original_sha,
        "new_size": len(new_content),
        "new_sha256": sha256_bytes(new_content),
        "prefix_preserved": True,
        "block_boundaries": "passed",
    }

    if args.dry_run:
        result["status"] = "not requested"
        result["note"] = "--dry-run: every check ran, the target was not modified"
        return result

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path: Path | None = None
    try:
        handle = tempfile.NamedTemporaryFile(
            dir=str(target.parent), prefix=f".{target.name}.", suffix=".agent-tmp", delete=False
        )
        with handle:
            tmp_path = Path(handle.name)
            handle.write(new_content)
            handle.flush()
            os.fsync(handle.fileno())

        recheck = read_bytes(target)                                          # step 4
        recheck_sha = sha256_bytes(recheck) if target.is_file() else EMPTY_SHA256
        if recheck_sha != original_sha:                                       # step 5
            raise InvariantFailure(
                "concurrent modification detected between hashing and writing "
                f"({original_sha} -> {recheck_sha}); nothing was written"
            )
        if target.is_file():
            os.chmod(tmp_path, target.stat().st_mode & 0o7777)
        os.replace(tmp_path, target)                                          # step 6
        tmp_path = None
        dir_fd = os.open(str(target.parent), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    finally:
        if tmp_path is not None and tmp_path.exists():
            tmp_path.unlink()

    final = read_bytes(target)
    if not final.startswith(original):                                        # step 7
        raise InvariantFailure(
            "POST-WRITE INVARIANT VIOLATION: the original bytes are no longer a prefix "
            f"of {target}. No recovery was attempted. Restore from version control or backup."
        )
    post_problems = check_block_boundaries(final.decode("utf-8", "replace"), block_id)  # step 8
    if post_problems:
        raise InvariantFailure("post-write boundary check failed: " + "; ".join(post_problems))

    result["status"] = "passed"
    result["final_sha256"] = sha256_bytes(final)
    result["appended_bytes"] = len(final) - original_size
    return result


def cmd_verify(args: argparse.Namespace) -> dict:
    root = resolve_vault_root(args.vault)
    target = resolve_in_vault(root, args.target, require_markdown=True, must_exist=True)
    current = read_bytes(target)

    if args.original_file:
        original_path = Path(args.original_file)
        if not original_path.is_file():
            raise Blocked(f"original snapshot not found: {args.original_file}")
        original = original_path.read_bytes()
    elif args.original_sha and args.original_size is not None:
        original = None
    else:
        raise Blocked("provide --original-file, or both --original-sha and --original-size")

    result: dict = {
        "command": "verify",
        "mode": args.mode,
        "target": str(target),
        "target_relative": vault_relative(root, target),
        "current_size": len(current),
        "current_sha256": sha256_bytes(current),
    }

    if args.mode == "prefix":
        if original is not None:
            ok = current.startswith(original)
            result["original_size"] = len(original)
            result["original_sha256"] = sha256_bytes(original)
        else:
            size = int(args.original_size)
            if len(current) < size:
                ok = False
            else:
                ok = sha256_bytes(current[:size]) == args.original_sha.lower()
            result["original_size"] = size
            result["original_sha256"] = args.original_sha.lower()
        if not ok:
            raise InvariantFailure(
                "prefix preservation failed: the pre-existing bytes are not an unchanged "
                f"prefix of {target}"
            )
        result["prefix_preserved"] = True
    else:  # outside-block
        if original is None:
            raise Blocked("--mode outside-block requires --original-file")
        if not args.block_id:
            raise Blocked("--mode outside-block requires --block-id")
        text = current.decode("utf-8", "replace")
        start, end = extract_block_span(text, args.block_id)
        before, after = text[:start], text[end:]
        original_text = original.decode("utf-8", "replace")
        o_start, o_end = extract_block_span(original_text, args.block_id)
        if before != original_text[:o_start] or after != original_text[o_end:]:
            raise InvariantFailure(
                f"content outside agent-block {args.block_id} changed; only the block itself "
                "may be revised"
            )
        result["outside_block_unchanged"] = True

    if args.block_id:
        problems = check_block_boundaries(current.decode("utf-8", "replace"), args.block_id)
        if problems:
            raise InvariantFailure("; ".join(problems))
        result["block_boundaries"] = "passed"

    result["status"] = "passed"
    return result


def cmd_new_id(_args: argparse.Namespace) -> dict:
    return {"command": "new-id", "status": "passed", "block_id": new_block_id()}


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="verify_append_only.py",
        description="Transactional append-only writer and verifier for Obsidian notes.",
    )
    parser.add_argument("--json", action="store_true", help="emit JSON instead of a text summary")
    # --json is accepted on either side of the subcommand. SUPPRESS keeps the
    # subparser from overwriting a value that was already given before it.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--json", action="store_true", default=argparse.SUPPRESS,
        help="emit JSON instead of a text summary",
    )
    sub = parser.add_subparsers(dest="command", required=True, parser_class=argparse.ArgumentParser)

    plan = sub.add_parser("plan", parents=[common], help="resolve the target and record its size and SHA-256")
    plan.add_argument("--vault", required=True)
    plan.add_argument("--target", required=True, help="vault-relative note path")
    plan.set_defaults(func=cmd_plan)

    append = sub.add_parser("append", parents=[common], help="append a wrapped agent block transactionally")
    append.add_argument("--vault", required=True)
    append.add_argument("--target", required=True, help="vault-relative note path")
    append.add_argument("--payload", required=True, help="file containing the block body, or - for stdin")
    append.add_argument("--block-id", help="reuse a specific id (default: generate one)")
    append.add_argument("--expect-sha", help="SHA-256 reported by `plan`")
    append.add_argument("--expect-absent", action="store_true", help="the note must not exist yet")
    append.add_argument(
        "--allow-unplanned",
        action="store_true",
        help="permit appending to an existing note without --expect-sha (discouraged)",
    )
    append.add_argument("--dry-run", action="store_true", help="run all checks, write nothing")
    append.set_defaults(func=cmd_append)

    verify = sub.add_parser("verify", parents=[common], help="check prefix preservation and block boundaries")
    verify.add_argument("--vault", required=True)
    verify.add_argument("--target", required=True)
    verify.add_argument("--original-file", help="snapshot of the file before the write")
    verify.add_argument("--original-sha", help="SHA-256 of the original content")
    verify.add_argument("--original-size", type=int, help="byte size of the original content")
    verify.add_argument("--block-id", help="agent-block id whose boundaries must be valid")
    verify.add_argument("--mode", choices=("prefix", "outside-block"), default="prefix")
    verify.set_defaults(func=cmd_verify)

    new_id = sub.add_parser("new-id", parents=[common], help="print a fresh agent-block identifier")
    new_id.set_defaults(func=cmd_new_id)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = args.func(args)
    except PathSecurityError as error:
        return _emit({"status": "blocked", "reason": "path-security", "message": str(error)}, args, 2)
    except Blocked as error:
        return _emit({"status": "blocked", "reason": "usage", "message": str(error)}, args, 2)
    except InvariantFailure as error:
        return _emit({"status": "failed", "reason": "invariant", "message": str(error)}, args, 1)
    return _emit(payload, args, 0)


def _emit(payload: dict, args: argparse.Namespace, code: int) -> int:
    stream = sys.stdout if code == 0 else sys.stderr
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True), file=stream)
    else:
        for key in sorted(payload):
            print(f"{key}: {payload[key]}", file=stream)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
