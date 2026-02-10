# Migration Documentation

Documentation for the AI-Tax → Juddges App transition and database migrations.

## 🔄 AI-Tax → Juddges Migration

This project is a fork of the AI-Tax platform, specialized for judicial decisions. These documents track the transition progress.

### [Branding Checklist](branding-checklist.md)
Track branding updates from AI-Tax to Juddges:
- Completed updates (repository structure, documentation, etc.)
- Remaining updates needed (frontend components, logos, etc.)
- Configuration changes
- Asset replacements

**Use when**: Tracking or implementing branding changes.

### [Database Migration](database-migration.md)
Enhanced filtering implementation checklist:
- Pre-migration steps (backup, verification)
- Migration steps (applying SQL migrations)
- Post-migration verification
- Rollback procedures
- Performance testing

**Use when**: Applying the enhanced filtering database migration.

### [Apply Migration](apply-migration.md)
Specific instructions for applying urgent migrations:
- Step-by-step migration guide
- Verification steps
- Troubleshooting common issues

**Use when**: Applying a specific database migration right now.

## 🗄️ Database Migrations

### Migration Files Location
All database migrations are stored in:
```
supabase/migrations/
├── 20260209000001_create_judgments_table.sql
├── 20260209000002_extend_judgments_filtering.sql
└── ... (additional migrations)
```

### Applying Migrations

**Using Supabase CLI** (recommended):
```bash
cd supabase
npx supabase db push
```

**Using Supabase Dashboard**:
1. Go to SQL Editor
2. Copy migration SQL
3. Execute query

**Using Supabase MCP** (via Claude Code):
```javascript
mcp__supabase__apply_migration({
  name: "migration_name",
  sql: "SQL content here"
})
```

### Migration Best Practices

1. **Always backup first**:
   ```bash
   npx supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Test on staging** before production

3. **Verify migration** after applying:
   ```sql
   -- Check tables
   SELECT * FROM information_schema.tables WHERE table_schema = 'public';

   -- Check indexes
   \di public.*

   -- Check data
   SELECT COUNT(*) FROM judgments;
   ```

4. **Keep migrations atomic** - one logical change per migration

5. **Use transactions** - migrations should be reversible

## 🎯 Migration Status

### Completed ✅
- [x] Repository structure from AI-Tax
- [x] Core documentation
- [x] Basic judgment schema
- [x] Vector search migration (Weaviate → pgvector)
- [x] Enhanced filtering system

### In Progress 🚧
- [ ] Complete branding updates
- [ ] Logo and asset replacement
- [ ] Environment variable migration
- [ ] Test coverage updates

### Planned 📋
- [ ] Performance optimization
- [ ] Additional jurisdictions
- [ ] Advanced analytics features
- [ ] Complete AI-Tax code cleanup

## 🔧 Key Differences: AI-Tax vs Juddges

| Aspect | AI-Tax | Juddges |
|--------|---------|---------|
| **Domain** | Tax law | Judicial decisions |
| **Data** | Tax documents | Court judgments |
| **Jurisdictions** | Generic | Poland + UK |
| **Vector DB** | Weaviate | Supabase pgvector |
| **Schema** | Generic documents | Specialized judgments table |
| **Language** | English | Polish + English |

## 🆘 Troubleshooting Migrations

**Migration fails**:
- Check SQL syntax
- Verify permissions
- Check for conflicting objects
- Review error messages

**Data loss concerns**:
- Always backup before migrations
- Test on staging first
- Use transactions
- Keep rollback scripts ready

**Performance degradation**:
- Check query plans after migration
- Verify indexes are created
- Run ANALYZE on tables
- Monitor query performance

## 🔗 Related Documentation

- [Getting Started](../getting-started/) - Initial setup
- [Architecture](../architecture/) - System design
- [Guides](../guides/) - How-to guides
