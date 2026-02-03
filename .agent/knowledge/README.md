# Agent Knowledge Base

This directory contains curated knowledge items that help AI agents understand the project without extensive exploration.

## Knowledge Items

### 1. PROJECT_STRUCTURE.md
**Purpose**: Canonical reference for the entire codebase structure  
**When to Use**: 
- Understanding where code should be placed
- Locating existing features
- Planning new feature integration
- Identifying refactoring opportunities

**Last Updated**: 2025-12-28  
**Maintenance**: Update when significant structural changes occur

### 2. docs/
**Purpose**: Collection of all platform documentation, including guides, SOPs, and technical specifications.
**When to Use**:
- Deep diving into specific features (e.g., QMS, WhatsApp Bot, Analytics)
- Following established SOPs for maintenance and integration
- Referencing historical architectural decisions
- Troubleshooting specific modules using implementation status reports

**Last Updated**: 2026-01-22
**Maintenance**: Sync from the root `docs/` folder when documentation is updated.

---

## Usage Guidelines

AI agents should reference these knowledge items to:
1. Understand the project organization quickly
2. Follow established conventions and patterns
3. Make informed decisions about code placement
4. Avoid redundant codebase exploration

When adding new knowledge items:
1. Create a descriptive markdown file
2. Update this README with the new item
3. Include "Purpose" and "When to Use" sections
4. Set a "Last Updated" date for maintenance tracking
