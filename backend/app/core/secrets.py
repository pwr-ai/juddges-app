"""
Secrets Manager for Juddges

Manages secrets from Supabase Vault with fallback to environment variables.
All API keys should be stored in Supabase Vault for security.

Usage:
    from app.core.secrets import get_openai_key

    openai.api_key = get_openai_key()
"""

from functools import lru_cache
from typing import Dict, Optional
import os

from loguru import logger

try:
    from supabase import create_client, Client
    from supabase.client import ClientOptions

    SUPABASE_AVAILABLE = True
except ImportError:
    logger.warning("supabase-py not installed. Run: pip install supabase")
    SUPABASE_AVAILABLE = False


class SecretsManager:
    """Manage secrets from Supabase Vault and environment variables."""

    def __init__(self):
        self._vault_secrets: Optional[Dict[str, str]] = None
        self._supabase: Optional[Client] = None
        self._vault_enabled = True

    def _init_supabase(self) -> bool:
        """Initialize Supabase client."""
        if not SUPABASE_AVAILABLE:
            logger.warning(
                "Supabase client not available, using environment variables only"
            )
            self._vault_enabled = False
            return False

        if self._supabase is not None:
            return True

        try:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

            if not url or not key:
                logger.warning(
                    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set. "
                    "Vault disabled, using environment variables only."
                )
                self._vault_enabled = False
                return False

            # Use ClientOptions to configure timeout instead of deprecated timeout parameter
            options = ClientOptions(
                postgrest_client_timeout=30, storage_client_timeout=30, schema="public"
            )
            self._supabase = create_client(url, key, options=options)
            return True

        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            self._vault_enabled = False
            return False

    def load_vault_secrets(self, force_reload: bool = False) -> Dict[str, str]:
        """
        Load and cache secrets from Supabase Vault.

        Args:
            force_reload: Force reload from Vault even if cached

        Returns:
            Dictionary of secret names to values
        """
        # Return cached if available and not forcing reload
        if self._vault_secrets is not None and not force_reload:
            return self._vault_secrets

        # Initialize empty dict for fallback
        self._vault_secrets = {}

        if not self._vault_enabled:
            logger.debug("Vault disabled, skipping secret load")
            return {}

        if not self._init_supabase():
            return {}

        try:
            logger.info("Loading secrets from Supabase Vault")

            # Query vault.decrypted_secrets view
            # Note: This requires the service_role to have SELECT permission
            result = self._supabase.rpc("get_vault_secrets", {}).execute()

            # If RPC function doesn't exist, try direct table access
            if not result.data:
                result = (
                    self._supabase.schema("vault")
                    .from_("decrypted_secrets")
                    .select("name,decrypted_secret")
                    .execute()
                )

            if result.data:
                self._vault_secrets = {
                    row.get("name"): row.get("decrypted_secret")
                    for row in result.data
                    if row.get("name") and row.get("decrypted_secret")
                }

                logger.success(f"Loaded {len(self._vault_secrets)} secrets from Vault")
                logger.debug(f"Available secrets: {list(self._vault_secrets.keys())}")
            else:
                logger.warning("No secrets found in Vault")

            return self._vault_secrets

        except Exception as e:
            logger.error(f"Failed to load Vault secrets: {e}")
            logger.info("Falling back to environment variables")
            return {}

    def get_secret(
        self, name: str, fallback_env: Optional[str] = None, required: bool = False
    ) -> Optional[str]:
        """
        Get secret from Vault, with optional fallback to environment variable.

        Args:
            name: Secret name in Vault
            fallback_env: Environment variable to check if Vault lookup fails
            required: If True, raise ValueError if secret not found

        Returns:
            Secret value or None

        Raises:
            ValueError: If required=True and secret not found
        """
        # Try Vault first
        if self._vault_enabled:
            vault_secrets = self.load_vault_secrets()
            if name in vault_secrets:
                logger.debug(f"Using secret '{name}' from Vault")
                return vault_secrets[name]

        # Fallback to environment variable
        if fallback_env:
            value = os.getenv(fallback_env)
            if value:
                logger.warning(
                    f"Using env var '{fallback_env}' instead of Vault secret '{name}'"
                )
                return value

        # Not found
        if required:
            raise ValueError(
                f"Secret '{name}' not found in Vault"
                + (f" or {fallback_env} env var" if fallback_env else "")
            )

        logger.warning(f"Secret '{name}' not found in Vault or environment")
        return None

    def get_openai_key(self) -> str:
        """
        Get OpenAI API key from Vault.

        Returns:
            OpenAI API key

        Raises:
            ValueError: If key not found
        """
        return self.get_secret(
            "openai_api_key", fallback_env="OPENAI_API_KEY", required=True
        )

    def refresh_secrets(self) -> Dict[str, str]:
        """
        Force reload secrets from Vault.

        Returns:
            Updated dictionary of secrets
        """
        logger.info("Refreshing secrets from Vault")
        return self.load_vault_secrets(force_reload=True)

    def list_available_secrets(self) -> list[str]:
        """
        List available secret names in Vault.

        Returns:
            List of secret names
        """
        vault_secrets = self.load_vault_secrets()
        return list(vault_secrets.keys())


@lru_cache()
def get_secrets_manager() -> SecretsManager:
    """
    Get cached secrets manager instance.

    Returns:
        Singleton SecretsManager instance
    """
    return SecretsManager()


# Convenience functions for common secrets
def get_openai_key() -> str:
    """Get OpenAI API key from Vault."""
    return get_secrets_manager().get_openai_key()


def refresh_secrets() -> Dict[str, str]:
    """Force reload secrets from Vault."""
    return get_secrets_manager().refresh_secrets()


def list_secrets() -> list[str]:
    """List available secrets in Vault."""
    return get_secrets_manager().list_available_secrets()


# Example usage and testing
if __name__ == "__main__":
    from rich.console import Console
    from rich.table import Table

    console = Console()

    console.print("\n[bold cyan]Juddges Secrets Manager Test[/bold cyan]\n")

    manager = get_secrets_manager()

    # Test Vault connection
    console.print("[yellow]Loading secrets from Vault...[/yellow]")
    secrets = manager.load_vault_secrets()

    if secrets:
        console.print(f"[green]✓ Successfully loaded {len(secrets)} secrets[/green]\n")

        # Display available secrets (without values!)
        table = Table(title="Available Secrets")
        table.add_column("Secret Name", style="cyan")
        table.add_column("Status", style="green")

        for name in secrets.keys():
            table.add_row(name, "✓ Available")

        console.print(table)

    else:
        console.print(
            "[yellow]⚠ No secrets in Vault, using environment variables[/yellow]\n"
        )

    # Test specific secret retrieval
    console.print("\n[bold cyan]Testing Secret Retrieval[/bold cyan]\n")

    try:
        openai_key = manager.get_openai_key()
        console.print(f"[green]✓ OpenAI key: {openai_key[:20]}...[/green]")
    except ValueError as e:
        console.print(f"[red]✗ OpenAI key: {e}[/red]")
