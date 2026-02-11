# Environment Configuration Strategy

This document explains the environment file strategy used in the Juddges App.

## File Structure

The project uses a **simple two-file strategy** for environment configuration:

### 1. `.env.example` (COMMITTED)
- **Purpose**: Template showing all available environment variables
- **Tracked**: YES - committed to git
- **Contains**: Variable names with NO actual values (or example values)
- **Usage**: Reference for developers to create their own `.env` file

### 2. `.env` (GITIGNORED)
- **Purpose**: Contains all actual configuration values
- **Tracked**: NO - gitignored (never commit this file)
- **Contains**: All actual values including secrets, API keys, and configuration
- **Usage**: Your working configuration file used by Docker Compose and the application

## Getting Started

### For New Developers

1. **Copy the template**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** with your actual values:
   - Add your Supabase URL and keys
   - Add your OpenAI API key
   - Add database URLs
   - Set port numbers (or keep defaults)
   - Add any other required configuration

3. **Start services**:
   ```bash
   # Development
   docker compose -f docker-compose.dev.yml up -d

   # Production
   docker compose up -d
   ```

### For Production Deployment

1. Copy `.env.example` to `.env` on your production server
2. Fill in production credentials in `.env`
3. Ensure `.env` has appropriate file permissions (e.g., `chmod 600 .env`)
4. Start services with `docker compose up -d`

## What Goes Where?

### `.env.example` (Committed - Template)
Contains variable names and example/documentation values:
- `SUPABASE_URL=your_supabase_url_here`
- `OPENAI_API_KEY=sk-...`
- `PORT=3007`
- `ENABLE_CHAT=true`

**Important**: Never put real secrets in `.env.example`!

### `.env` (Gitignored - Actual Values)
Contains your real configuration:
- Supabase URL and keys (actual values)
- OpenAI API key (actual value)
- Database passwords (actual values)
- Port numbers (your preferences)
- Feature flags (your settings)
- All other configuration

## Docker Compose Integration

Both `docker-compose.yml` and `docker-compose.dev.yml` load `.env`:

```yaml
services:
  frontend:
    env_file:
      - .env
```

If `.env` doesn't exist, Docker Compose will fail with an error. You must create it from `.env.example`.

## Best Practices

### DO
- ✓ Always copy from `.env.example` to `.env` when starting
- ✓ Keep `.env.example` up to date with new variables (but no real values)
- ✓ Document what each variable does in `.env.example` using comments
- ✓ Set appropriate file permissions on `.env` (e.g., `chmod 600 .env`)
- ✓ Use strong, unique values for secrets in `.env`

### DON'T
- ✗ **NEVER commit `.env` to git** (it's in .gitignore for a reason)
- ✗ Don't put real secrets or passwords in `.env.example`
- ✗ Don't share your `.env` file with others (they should create their own)
- ✗ Don't use `.env.example` directly (copy it to `.env` first)
- ✗ Don't commit any file with "env" in the name except `.env.example`

## Updating Configuration

### Adding a New Variable

When you add a new environment variable:

1. Add it to your `.env` with the actual value
2. Add it to `.env.example` with a placeholder/example value
3. Commit the `.env.example` changes (but never `.env`)
4. Document the variable in this file if it's complex

### Changing Existing Variables

Just edit your `.env` file directly. Changes take effect after restarting the services:

```bash
# Restart all services
docker compose down
docker compose up -d

# Or restart specific service
docker compose restart backend
```

## Troubleshooting

### "Environment variable not set"
- Check if the variable exists in your `.env` file
- Verify the variable name matches what the application expects
- Ensure there are no typos or extra spaces

### "Service can't connect" or "Authentication failed"
- Verify secrets in `.env` are correct (API keys, passwords, URLs)
- Check that URLs don't have trailing slashes unless required
- Ensure Supabase keys match your project

### "File not found: .env"
- You need to create `.env` from `.env.example`:
  ```bash
  cp .env.example .env
  ```
- Then edit `.env` with your actual values

### Checking Final Configuration

View the final merged configuration (useful for debugging):
```bash
docker compose config
```

## Migration from Three-File Strategy

If you previously used `.env.defaults`, `.env.local`, and `.env.secrets`:

1. **Merge all values** into a single `.env` file:
   ```bash
   # Start with defaults
   cp .env.defaults .env

   # Append local overrides (if they exist)
   cat .env.local >> .env 2>/dev/null || true

   # Append secrets (if they exist)
   cat .env.secrets >> .env 2>/dev/null || true
   ```

2. **Remove duplicate lines** from `.env` (keep the last occurrence of each variable)

3. **Clean up old files**:
   ```bash
   rm .env.defaults .env.local .env.secrets
   ```

4. **Update `.env.example`** with all variable names but no real values

5. **Test your configuration**:
   ```bash
   docker compose -f docker-compose.dev.yml config
   ```

## Security Best Practices

### File Permissions
```bash
# Lock down .env to only your user
chmod 600 .env

# Ensure .env is in .gitignore
grep -q "^\.env$" .gitignore || echo ".env" >> .gitignore
```

### Secrets Management
- Never commit `.env` to version control
- Use different `.env` files for different environments (dev, staging, prod)
- Rotate secrets regularly
- Use strong, random values for passwords and tokens
- Consider using a secrets manager (AWS Secrets Manager, HashiCorp Vault) for production

## See Also

- `.env.example` - Complete reference of all configuration options
- `docker-compose.yml` - Production service configuration
- `docker-compose.dev.yml` - Development service configuration
- `CLAUDE.md` - Project overview and development commands
