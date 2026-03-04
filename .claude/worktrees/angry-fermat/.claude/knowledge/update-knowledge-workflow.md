---
description: how to update the knowledge base
---

# Update Knowledge Base Workflow

Use this workflow when you've made significant structural changes to the project and need to update the knowledge base.

## Steps

1. **Identify What Changed**
   - Note which directories were added/removed/reorganized
   - Identify new major features or modules
   - List deprecated functionality

2. **Update PROJECT_STRUCTURE.md**
   - Edit `PROJECT_STRUCTURE.md` in the root directory
   - Update the relevant sections (directory trees, feature tables, etc.)
   - Update the "Version History" table at the bottom
   - Set the "Last Updated" date to today

3. **Sync to Knowledge Base**
   ```powershell
   Copy-Item "PROJECT_STRUCTURE.md" ".agent\knowledge\PROJECT_STRUCTURE.md" -Force
   ```

4. **Update Knowledge README** 
   - Edit `.agent\knowledge\README.md`
   - Update the "Last Updated" date for PROJECT_STRUCTURE.md
   - Add any new knowledge items if created

5. **Commit Changes**
   ```powershell
   git add PROJECT_STRUCTURE.md .agent/knowledge/
   git commit -m "docs: update project structure knowledge base"
   ```

## When to Run This Workflow

- After adding a new major feature module
- After reorganizing directory structure
- After deprecating/archiving significant code
- Quarterly maintenance review (or when requested)

## Tips

- Keep both copies in sync (root and `.agent/knowledge/`)
- The root `PROJECT_STRUCTURE.md` is the source of truth
- The knowledge copy is for quick AI agent reference
