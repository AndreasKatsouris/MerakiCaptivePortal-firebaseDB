# CLAUDE.md Rewrite — Design Spec

**Date:** 2026-04-08
**Status:** Approved

## Problem

The current CLAUDE.md restricts Claude to a read-only project assistant / backlog manager role, preventing code modifications. This is misaligned with the project's needs — Claude is the primary development agent. The file also embeds a verbose XML project specification (~120 lines) without referencing the comprehensive Knowledge Base that already exists.

## Design

Rewrite CLAUDE.md as a lean bootstrap file (~110 lines) with:

1. **Project identity** — one-paragraph overview
2. **Role** — full read/write coding authority (replaces read-only restriction)
3. **Tech stack** — condensed to key facts
4. **Coding conventions** — essential patterns only, points to KB for details
5. **Key paths** — critical file locations
6. **KB routing table** — maps work areas to specific docs in `KNOWLEDGE BASE/` and `public/kb/`
7. **Agent team structure** — trimmed role definitions and spawn pattern from the multi-agent init script

## Approach: A+C Hybrid (Pointer-based with routing table)

- CLAUDE.md stays concise, defines conventions and key paths
- Routing table tells agents which KB doc to read for each work area
- Agents load only what's relevant to their task (context window efficient)
- Full init script stays separate; CLAUDE.md includes trimmed role definitions

## Knowledge Base Locations

| Location | Purpose |
|----------|---------|
| `KNOWLEDGE BASE/` (root) | Canonical, comprehensive docs (60+ files) |
| `public/kb/` | Curated subset for admin dashboard UI (26 files) |
| `.claude/knowledge/` | Claude-specific project structure (4 files) |
| `.claude/agents/` | 8 project-specific agent definitions |

## What's Removed

- Read-only restriction and "project assistant" role definition
- Verbose XML `<project_specification>` block
- References to MCP feature management tools (`feature_create`, etc.)
- "What You CAN/CANNOT Do" sections
- "Creating Features" tutorial section

## What's Added

- Full coding authority
- KB routing table (20 entries)
- Agent team roles and spawn pattern
- Key file paths for navigation
- Coding conventions referencing existing KB docs
