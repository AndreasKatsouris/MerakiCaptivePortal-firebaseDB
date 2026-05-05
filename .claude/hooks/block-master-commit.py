#!/usr/bin/env python3
"""
PreToolUse hook: blocks `git commit` (including --amend) when the *target*
branch — i.e. the branch the commit will land on — is `master`. Enforces
the Standard Task Workflow documented in CLAUDE.md.

The "target" branch is *not* always the parent project's current branch.
Reflect-cycle commits are made inside `.worktrees/<name>/` from a Bash
command like `cd .worktrees/post-merge-pr44 && git commit ...`. The
worktree is on its own branch (e.g. `chore/post-merge-pr44`), so the
commit is safe — but a naive `git branch --show-current` from the hook's
own cwd reads the parent project's branch (likely `master` after a
post-merge sync) and blocks the commit.

This hook now:
  1. Looks for `cd <path>` in the bash command and resolves the branch
     from THAT path (handles quoted paths and chained `&&` commands).
  2. Looks for `git -C <path> commit ...` and uses that path.
  3. Falls back to the hook process's own cwd if neither is found.

Fail-open on any subprocess / parsing error so a hook bug never wedges
the workflow.

Exit codes:
  0 = allow tool call
  2 = block tool call, stderr shown to the agent
"""
import json
import os
import re
import shlex
import subprocess
import sys


def _resolve_target_dir(cmd: str) -> str | None:
    """Inspect the bash command for `cd <dir>` or `git -C <dir>` and return
    the directory the commit will run against. None means "use hook cwd"."""

    # `git -C <path> commit` wins if present — git itself uses this path.
    m = re.search(r"\bgit\s+(?:--[\w-]+(?:=\S+)?\s+)*-C\s+(\S+|\"[^\"]+\"|'[^']+')", cmd)
    if m:
        return _strip_quotes(m.group(1))

    # Otherwise, find the LAST `cd <dir>` token before the `git commit`. Use
    # the last to handle chained `cd a && cd b && git commit ...` reliably.
    last_cd = None
    # Tokenise the part of the command BEFORE `git commit` so we don't pick
    # up a `cd` that's wrapped inside the commit message.
    pre_commit = cmd.split("git commit", 1)[0]
    try:
        tokens = shlex.split(pre_commit, posix=True)
    except ValueError:
        # Unbalanced quotes etc. — skip parsing, fall through to hook cwd.
        return None

    i = 0
    while i < len(tokens):
        if tokens[i] == "cd" and i + 1 < len(tokens):
            last_cd = tokens[i + 1]
            i += 2
        else:
            i += 1
    return last_cd


def _strip_quotes(s: str) -> str:
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1]
    return s


def _branch_for(cwd: str | None) -> str | None:
    """Return the current git branch for the given cwd, or None on failure."""
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=cwd if cwd else None,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except Exception:
        # Malformed hook payload — don't block on hook failure.
        return 0

    tool_input = data.get("tool_input", {}) or {}
    cmd = tool_input.get("command", "") or ""

    # Only intercept `git commit`. Match as a token so "git commit-tree" etc. don't trip it.
    if not re.search(r"\bgit\s+commit\b", cmd):
        return 0

    # Find the directory the commit will actually run from. Resolve relative
    # paths against $CLAUDE_PROJECT_DIR if available — that's the operator's
    # repo root, which is the same anchor every chained `cd` is relative to.
    target_rel = _resolve_target_dir(cmd)
    target_abs: str | None = None
    if target_rel:
        anchor = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
        candidate = target_rel if os.path.isabs(target_rel) else os.path.join(anchor, target_rel)
        if os.path.isdir(candidate):
            target_abs = candidate
        # If the path doesn't exist yet (e.g. typo), fall through to hook cwd
        # so we still block reasonably instead of silently allowing.

    branch = _branch_for(target_abs)
    if branch is None:
        # Couldn't read the branch (detached HEAD, non-git cwd, etc.) — don't block.
        return 0

    if branch != "master":
        return 0

    where = f" (resolved from `cd {target_rel}`)" if target_rel else ""
    print(
        f"BLOCKED: direct commits to `master` are forbidden on this project{where}.\n"
        "See CLAUDE.md -> Git Workflow (REQUIRED) + Standard Task Workflow.\n"
        "\n"
        "Create a feature branch or worktree first:\n"
        "  git worktree add .worktrees/<name> -b feature/<name>\n"
        "  # or for a tiny fix:\n"
        "  git checkout -b fix/<slug>\n"
        "\n"
        "If the user has EXPLICITLY authorized a direct master commit in the\n"
        "current request, ask them to disable this hook for the session or\n"
        "rename the branch temporarily. Authorization does not persist.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
