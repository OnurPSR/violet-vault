"""Shared vault path-security helpers for the handwritten-note-author skill.

Authoritative rules live in ``references/validation.md`` (section "Path
security"). This module is the executable form of those rules so that both
validators enforce them identically.

Invariants enforced here:

* a target reference MUST be vault-relative (absolute paths are rejected);
* no path component may be ``..``;
* symbolic links are resolved before the containment check, so a symlink that
  escapes the vault is rejected rather than followed;
* the fully resolved path MUST remain inside the resolved vault root;
* note targets MAY be restricted to supported Markdown extensions.

Python standard library only.
"""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath

MARKDOWN_EXTENSIONS = frozenset({".md", ".markdown"})
SVG_EXTENSIONS = frozenset({".svg"})


class PathSecurityError(Exception):
    """Raised when a path would leave the vault or is otherwise unsafe."""


def resolve_vault_root(raw: str | os.PathLike[str]) -> Path:
    """Resolve the vault root. It must exist and be a directory."""
    root = Path(raw).expanduser().resolve()
    if not root.is_dir():
        raise PathSecurityError(f"vault root is not an existing directory: {root}")
    return root


def is_within(root: Path, candidate: Path) -> bool:
    """True when ``candidate`` is ``root`` itself or lives underneath it."""
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def resolve_in_vault(
    vault_root: Path,
    candidate: str | os.PathLike[str],
    *,
    require_markdown: bool = False,
    must_exist: bool = False,
) -> Path:
    """Resolve ``candidate`` against ``vault_root`` under the rules above.

    Returns the canonical absolute path. Raises :class:`PathSecurityError`
    instead of returning a path that could escape the vault.
    """
    text = os.fspath(candidate)
    if not text or not text.strip():
        raise PathSecurityError("empty target path")
    if "\x00" in text:
        raise PathSecurityError("target path contains a NUL byte")

    pure = PurePosixPath(text.replace("\\", "/"))
    if pure.is_absolute() or text.startswith("~"):
        raise PathSecurityError(
            f"absolute or home-relative path rejected; use a vault-relative path: {text}"
        )
    if any(part == ".." for part in pure.parts):
        raise PathSecurityError(f"parent-directory traversal rejected: {text}")

    joined = vault_root.joinpath(*[p for p in pure.parts if p not in ("", ".")])
    resolved = joined.resolve()

    if not is_within(vault_root, resolved):
        raise PathSecurityError(
            f"resolved path escapes the vault root: {text} -> {resolved}"
        )
    # A symlink whose target stays inside the vault is still a symlink; report
    # it so callers can decide, but never follow one that escaped (handled above).
    if joined.is_symlink() and not is_within(vault_root, joined.resolve()):
        raise PathSecurityError(f"symbolic link escapes the vault root: {text}")

    if require_markdown and resolved.suffix.lower() not in MARKDOWN_EXTENSIONS:
        raise PathSecurityError(
            "note targets must use a supported Markdown extension "
            f"({', '.join(sorted(MARKDOWN_EXTENSIONS))}): {text}"
        )
    if must_exist and not resolved.exists():
        raise PathSecurityError(f"target does not exist: {text}")
    return resolved


def vault_relative(vault_root: Path, resolved: Path) -> str:
    """POSIX-style vault-relative form, for stable reporting."""
    return resolved.relative_to(vault_root).as_posix()
