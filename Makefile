# ==============================================================================
# Juddges App — Makefile
# Gitflow Docker Workflow convenience commands
# ==============================================================================

.DEFAULT_GOAL := help

# Current version from VERSION file
VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m

# ==============================================================================
# Development
# ==============================================================================

.PHONY: dev
dev: ## Start development environment (Docker)
	docker compose -f docker-compose.dev.yml up --build

.PHONY: dev-d
dev-d: ## Start development environment (Docker, detached)
	docker compose -f docker-compose.dev.yml up --build -d

.PHONY: dev-down
dev-down: ## Stop development environment
	docker compose -f docker-compose.dev.yml down

.PHONY: dev-logs
dev-logs: ## Tail development logs
	docker compose -f docker-compose.dev.yml logs -f

.PHONY: dev-backend
dev-backend: ## Start backend dev server (no Docker)
	cd backend && poetry run uvicorn app.server:app --reload --port 8004

.PHONY: dev-frontend
dev-frontend: ## Start frontend dev server (no Docker)
	cd frontend && npm run dev

# ==============================================================================
# Production (local build)
# ==============================================================================

.PHONY: prod
prod: ## Start production environment (Docker)
	docker compose up -d --build

.PHONY: prod-down
prod-down: ## Stop production environment
	docker compose down

.PHONY: prod-logs
prod-logs: ## Tail production logs
	docker compose logs -f

.PHONY: prod-status
prod-status: ## Show production container status
	docker compose ps

# ==============================================================================
# Testing
# ==============================================================================

.PHONY: test
test: test-backend test-frontend ## Run all tests

.PHONY: test-local
test-local: test-local-backend test-local-frontend ## Run the fast local monorepo test profile

.PHONY: test-local-integration
test-local-integration: test-local-backend-integration test-local-frontend ## Run local profile with backend integration suites enabled

.PHONY: test-local-ai
test-local-ai: test-local-backend-ai test-local-frontend ## Run local profile with backend AI suites enabled

.PHONY: test-local-legacy
test-local-legacy: test-local-backend-legacy test-local-frontend ## Run local profile with backend legacy schema suites enabled

.PHONY: test-backend
test-backend: ## Run backend unit tests
	cd backend && poetry run pytest -v -m unit

.PHONY: test-local-backend
test-local-backend: ## Run backend local profile (no integration/AI/legacy suites)
	cd backend && poetry run poe test-local

.PHONY: test-local-backend-integration
test-local-backend-integration: ## Run backend local profile with integration suites
	cd backend && poetry run poe test-local-integration

.PHONY: test-local-backend-ai
test-local-backend-ai: ## Run backend local profile with AI suites
	cd backend && poetry run poe test-local-ai

.PHONY: test-local-backend-legacy
test-local-backend-legacy: ## Run backend local profile with legacy schema suites
	cd backend && poetry run poe test-local-legacy

.PHONY: test-frontend
test-frontend: ## Run frontend unit tests
	cd frontend && npm run test

.PHONY: test-local-frontend
test-local-frontend: ## Run frontend local Jest profile
	cd frontend && npm run test:local

.PHONY: test-e2e
test-e2e: ## Run E2E tests (Playwright)
	cd frontend && npm run test:e2e

.PHONY: test-integration
test-integration: ## Run backend integration tests
	cd backend && poetry run pytest -v -m integration

# ==============================================================================
# Code Quality
# ==============================================================================

.PHONY: lint
lint: lint-backend lint-frontend ## Run all linters

.PHONY: lint-backend
lint-backend: ## Lint backend (Ruff)
	cd backend && poetry run ruff check . && poetry run ruff format --check .

.PHONY: lint-frontend
lint-frontend: ## Lint frontend (ESLint)
	cd frontend && npm run lint

.PHONY: format
format: ## Auto-format backend code
	cd backend && poetry run ruff format . && poetry run ruff check . --fix

# ==============================================================================
# Release & Deploy (Gitflow)
# ==============================================================================

.PHONY: release-patch
release-patch: ## Release: bump patch version (0.1.0 → 0.1.1)
	./scripts/build_and_push_prod.sh patch

.PHONY: release-minor
release-minor: ## Release: bump minor version (0.1.0 → 0.2.0)
	./scripts/build_and_push_prod.sh minor

.PHONY: release-major
release-major: ## Release: bump major version (0.1.0 → 1.0.0)
	./scripts/build_and_push_prod.sh major

.PHONY: deploy
deploy: ## Deploy latest to production host
	./scripts/deploy_prod.sh

.PHONY: deploy-status
deploy-status: ## Show production deployment status
	./scripts/deploy_prod.sh --status

.PHONY: deploy-rollback
deploy-rollback: ## Rollback production to previous version
	./scripts/deploy_prod.sh --rollback

# ==============================================================================
# Gitflow Branch Helpers
# ==============================================================================

.PHONY: feature
feature: ## Create feature branch: make feature name=add-auth
	@if [ -z "$(name)" ]; then echo "Usage: make feature name=<description>"; exit 1; fi
	git checkout develop && git pull origin develop
	git checkout -b feature/$(name)
	@echo "$(GREEN)Created feature/$(name) from develop$(NC)"

.PHONY: fix
fix: ## Create fix branch: make fix name=login-crash
	@if [ -z "$(name)" ]; then echo "Usage: make fix name=<description>"; exit 1; fi
	git checkout develop && git pull origin develop
	git checkout -b fix/$(name)
	@echo "$(GREEN)Created fix/$(name) from develop$(NC)"

.PHONY: hotfix
hotfix: ## Create hotfix branch: make hotfix name=critical-bug
	@if [ -z "$(name)" ]; then echo "Usage: make hotfix name=<description>"; exit 1; fi
	git checkout main && git pull origin main
	git checkout -b hotfix/$(name)
	@echo "$(GREEN)Created hotfix/$(name) from main$(NC)"

# ==============================================================================
# Version Info
# ==============================================================================

.PHONY: version
version: ## Show current version and recent tags
	@echo "$(BLUE)VERSION file:$(NC) $(VERSION)"
	@echo ""
	@echo "$(BLUE)Production tags:$(NC)"
	@git tag -l "prod-v*" --sort=-version:refname | head -5 || echo "  (none)"
	@echo ""
	@echo "$(BLUE)Dev tags:$(NC)"
	@git tag -l "dev-v*" --sort=-version:refname | head -5 || echo "  (none)"
	@echo ""
	@echo "$(BLUE)Legacy tags:$(NC)"
	@git tag -l "v*" --sort=-version:refname | head -5 || echo "  (none)"

.PHONY: changelog
changelog: ## Show changes since last production release
	@LAST_TAG=$$(git tag -l "prod-v*" --sort=-version:refname | head -1); \
	if [ -z "$$LAST_TAG" ]; then \
		LAST_TAG=$$(git tag -l "v*" --sort=-version:refname | head -1); \
	fi; \
	if [ -z "$$LAST_TAG" ]; then \
		echo "No tags found. Showing last 20 commits:"; \
		git log --oneline -20; \
	else \
		echo "$(BLUE)Changes since $$LAST_TAG:$(NC)"; \
		git log $$LAST_TAG..HEAD --oneline; \
	fi

# ==============================================================================
# Help
# ==============================================================================

.PHONY: help
help: ## Show this help
	@echo "$(BLUE)Juddges App — Gitflow Docker Workflow$(NC)"
	@echo "$(BLUE)Version: $(VERSION)$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
