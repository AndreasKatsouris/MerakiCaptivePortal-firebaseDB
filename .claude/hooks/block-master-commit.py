#!/usr/bin/env python3
"""
PreToolUse hook: blocks `git commit` (including --amend) when the current branch
is `master`. Enforces the Standard Task Workflow documented in CLAUDE.md.

Exit codes:
  0 = allow tool call
  2 = block tool call, stderr shown to the agent
"""
import json
import re
import subprocess
import sys


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

    # Resolve current branch. If we can't read it (detached HEAD, non-git cwd), don't block.
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return 0

    branch = result.stdout.strip()
    if branch != "master":
        return 0

    print(
        "BLOCKED: direct commits to `master` are forbidden on this project.\n"
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
