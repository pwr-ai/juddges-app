"""The Next.js service must not inherit backend/host credentials from .env."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

pytestmark = pytest.mark.unit
COMPOSE_FILE = Path(__file__).resolve().parents[3] / "docker-compose.yml"
BACKEND_ONLY_KEYS = {
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "REDIS_AUTH",
    "REDIS_URL",
    "CELERY_BROKER_URL",
    "LANGFUSE_SECRET_KEY",
    "MEILI_MASTER_KEY",
    "DOCKER_TOKEN",
    "HUGGINGFACE_TOKEN",
    "SMTP_PASSWORD",
    "TEST_USER_PASSWORD",
    "SENTRY_AUTH_TOKEN",
    "UNRELATED_FUTURE_SECRET",
}


def _frontend():
    return yaml.safe_load(COMPOSE_FILE.read_text())["services"]["frontend"]


def test_frontend_has_no_bulk_environment_import():
    frontend = _frontend()
    assert "env_file" not in frontend, "env_file imports every backend/host secret"
    assert isinstance(frontend["environment"], dict)
    assert not BACKEND_ONLY_KEYS.intersection(frontend["environment"])


def _render(tmp_path, *, aliases=False, backend_key="frontend-bff-test"):
    docker = shutil.which("docker")
    if not docker:
        pytest.skip("Docker Compose CLI required for environment interpolation tests")
    frontend = _frontend()
    # Isolate this service so the test never reads the production .env files
    # referenced by other services, and never needs a running Docker daemon.
    model = {
        "services": {
            "frontend": {
                "image": frontend["image"],
                "environment": frontend["environment"],
            }
        }
    }
    compose = tmp_path / "compose.yml"
    compose.write_text(yaml.safe_dump(model))
    values = {
        "DOCKER_USERNAME": "example",
        "BACKEND_API_KEY": backend_key,
        "NODE_ENV": "development",
        "API_BASE_URL": "http://wrong-development-backend:8004",
        "RESEND_API_KEY": "frontend-contact-test",
        "CONTACT_FROM_EMAIL": "contact@example.test",
        "CONTACT_INTERNAL_EMAIL": "team@example.test",
        "CONTACT_RATE_LIMIT_MAX": "7",
        "AUTH_REDIRECT_ALLOWED_HOSTS": "juddges.example.test",
        "TRUSTED_PROXY": "true",
        "SENTRY_DSN": "https://public@example.test/1",
        **dict.fromkeys(BACKEND_ONLY_KEYS, "backend-only-sentinel"),
    }
    prefix = "" if aliases else "NEXT_PUBLIC_"
    values[f"{prefix}SUPABASE_URL"] = "https://project.supabase.co"
    values[f"{prefix}SUPABASE_ANON_KEY"] = "public-anon-test"
    env_file = tmp_path / "inputs.env"
    env_file.write_text("\n".join(f"{key}={value}" for key, value in values.items()))
    # Fixed CLI, synthetic environment, and paths created by this test only.
    return subprocess.run(  # noqa: S603
        [
            docker,
            "compose",
            "--env-file",
            str(env_file),
            "-f",
            str(compose),
            "config",
            "--format",
            "json",
        ],
        # Host/shell secrets must not override the synthetic test input.
        env={key: os.environ[key] for key in ("PATH", "HOME") if key in os.environ},
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


@pytest.mark.parametrize("aliases", [False, True])
def test_rendered_frontend_keeps_its_credentials_and_excludes_backend_secrets(
    tmp_path, aliases
):
    result = _render(tmp_path, aliases=aliases)
    assert result.returncode == 0, result.stderr
    environment = json.loads(result.stdout)["services"]["frontend"]["environment"]
    assert not BACKEND_ONLY_KEYS.intersection(environment)
    assert environment["NODE_ENV"] == "production"
    assert environment["API_BASE_URL"] == "http://juddges-backend:8002"
    assert environment["BACKEND_API_KEY"] == "frontend-bff-test"
    assert environment["NEXT_PUBLIC_SUPABASE_URL"] == "https://project.supabase.co"
    assert environment["NEXT_PUBLIC_SUPABASE_ANON_KEY"] == "public-anon-test"
    assert environment["RESEND_API_KEY"] == "frontend-contact-test"
    assert environment["CONTACT_FROM_EMAIL"] == "contact@example.test"
    assert environment["CONTACT_INTERNAL_EMAIL"] == "team@example.test"
    assert environment["CONTACT_RATE_LIMIT_MAX"] == "7"
    assert environment["AUTH_REDIRECT_ALLOWED_HOSTS"] == "juddges.example.test"
    assert environment["TRUSTED_PROXY"] == "true"
    assert environment["SENTRY_DSN"] == "https://public@example.test/1"


def test_missing_backend_key_cannot_boot_with_a_dummy_credential(tmp_path):
    result = _render(tmp_path, backend_key="")
    assert result.returncode != 0
    assert "BACKEND_API_KEY" in result.stderr


@pytest.mark.parametrize(
    "missing", ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
)
def test_missing_supabase_credentials_stop_the_entrypoint(missing):
    environment = {
        "NEXT_PUBLIC_SUPABASE_URL": "https://project.supabase.co",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY": "public-anon-test",
        "BACKEND_API_KEY": "frontend-bff-test",
    }
    del environment[missing]
    entrypoint = COMPOSE_FILE.parent / "frontend" / "docker-entrypoint.sh"
    result = subprocess.run(  # noqa: S603
        ["/bin/sh", str(entrypoint), "/bin/true"],
        env=environment,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    assert result.returncode != 0
    assert missing in result.stderr
