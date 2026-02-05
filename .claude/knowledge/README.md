# Claude Code Knowledge Base
**Meraki Captive Portal Project**

This directory contains curated knowledge about the Meraki Captive Portal project to help Claude Code agents work efficiently without extensive codebase exploration.

## Knowledge Items

### PROJECT_STRUCTURE.md
**Purpose**: Comprehensive reference for the entire codebase structure, architecture, and conventions.

**When to Use**:
- Understanding where code should be placed
- Locating existing features and modules
- Planning new feature integration
- Following established patterns and standards
- Identifying refactoring opportunities

**Last Updated**: 2026-01-22
**Maintenance**: Update when significant structural changes occur

### update-knowledge-workflow.md
**Purpose**: Instructions for keeping this knowledge base synchronized with project changes.

**When to Use**:
- After adding new major features
- After reorganizing directory structure
- During quarterly maintenance reviews

**Last Updated**: 2026-02-05

## How Claude Code Uses This Knowledge

### For All Agents
1. **Quick Context**: Read PROJECT_STRUCTURE.md to understand project layout without exploring
2. **Pattern Following**: Reference established conventions for consistency
3. **Decision Making**: Use architectural documentation to make informed choices
4. **Avoid Redundancy**: Check existing features before implementing duplicates

### For Specialized Agents
- **system-architect**: Use for understanding system design and making architectural decisions
- **module-specialist**: Reference for module integration patterns and standards
- **frontend-developer**: Check frontend architecture patterns and component organization
- **firebase-backend-dev**: Reference backend structure and Firebase integration patterns
- **quality-assurance-tester**: Use testing standards and protocols documentation

## Additional Documentation

The main project documentation is in `/docs/`. This knowledge base contains the most frequently accessed architectural references. For detailed feature documentation, testing protocols, and API specifications, agents should refer to:

- `/docs/` - Complete project documentation (50+ files)
- `/docs/features/` - Feature-specific documentation
- `/docs/architecture/` - Architecture diagrams and specifications
- `/docs/api/` - API documentation

## Maintenance Guidelines

### When to Update This Knowledge Base

1. **Structural Changes**: Added/removed major directories or modules
2. **New Features**: Implemented significant new functionality
3. **Pattern Changes**: Updated coding standards or architectural patterns
4. **Convention Updates**: Modified naming conventions or organization rules

### How to Update

Follow the workflow documented in `update-knowledge-workflow.md`:

1. Update PROJECT_STRUCTURE.md in project root (source of truth)
2. Copy to `.claude/knowledge/PROJECT_STRUCTURE.md`
3. Update this README with new knowledge items if added
4. Commit changes to git

## Integration with Global Claude Config

This project-specific knowledge base complements the global Claude Code configuration at `~/.claude/`:

- **Global (`~/.claude/`)**: Generic agents, rules, commands, and skills from [everything-claude-code](https://github.com/affaan-m/everything-claude-code)
- **Project (`.claude/`)**: Meraki-specific agents and project knowledge

Claude Code automatically loads both configurations, giving agents access to:
- General-purpose capabilities (global)
- Project-specific expertise (local)
- Detailed project knowledge (this directory)

## Quick Reference

| Knowledge Item | Use Case | Update Frequency |
|---------------|----------|------------------|
| PROJECT_STRUCTURE.md | Architecture & organization | When structure changes |
| update-knowledge-workflow.md | Maintenance procedures | Rarely |
| /docs/ (reference) | Detailed documentation | Per feature |

---

**Last Updated**: 2026-02-05
**Maintained By**: Development Team
**Next Review**: When significant project changes occur
