# Tools Directory

Organized collection of administrative, development, and archived utilities.

## Structure

```
tools/
├── admin/          # Production admin tools (7 tools)
├── dev/            # Development & testing tools (32 tools)
└── archive/        # Migration & one-time scripts (13 tools)
```

## Directories

### `/admin` - Production Admin Tools
Production-ready administrative interfaces for daily operations.

**Access**: Requires admin authentication  
**Environment**: Production-safe

See [admin/README.md](admin/README.md) for complete list.

### `/dev` - Development Tools
Diagnostic, debugging, and testing utilities.

**Access**: Development/staging only  
**Environment**: Should NOT be accessible in production

See [dev/README.md](dev/README.md) for complete list.

### `/archive` - Archive Scripts
Historical migration scripts and one-time fix tools.

**Status**: Reference only  
**Usage**: Review before running, may be outdated

See [archive/README.md](archive/README.md) for complete list.

## Usage Guidelines

### For Administrators
1. Use tools in `/admin` for regular operations
2. Each tool has its own documentation/interface
3. Access via `/tools/admin/` URL

### For Developers
1. Use tools in `/dev` for testing and diagnostics
2. Never expose dev tools in production
3. Tools may modify test data

### For Everyone
1. `/archive` tools are historical reference
2. Do not run archive scripts without review
3. Check git history for old tools if needed

## Security

- **Admin tools**: Require authentication, production-safe
- **Dev tools**: Should be environment-restricted
- **Archive tools**: Review carefully before any use

## Moving Tools Between Directories

If a tool's status changes:

**Dev → Admin**: Tool is now production-ready
1. Move file to `/admin`
2. Add to `/admin/README.md`
3. Remove from `/dev/README.md`
4. Add authentication if needed

**Admin → Archive**: Tool is no longer needed
1. Move file to `/archive`
2. Add to `/archive/README.md` with deprecation note
3. Remove from `/admin/README.md`

**Archive → Delete**: Tool is obsolete
1. Verify no references exist
2. Confirm with team
3. Delete (remains in git history)

## Related Documentation

- [Admin Tools Inventory](../docs/development/admin-tools-inventory.md) - Complete analysis
- [Codebase Structure](../docs/codebase_structure_analysis.md) - Organization overview

---

**Last Updated**: 2025-12-15  
**Total Tools**: 52 (7 admin + 32 dev + 13 archive)
