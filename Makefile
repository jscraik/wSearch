# Harness Development Makefile
# Run `make help` to see available commands

.PHONY: help install dev build test lint fmt check clean hooks hooks-pre-commit hooks-pre-push hooks-commit-msg setup

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# === Setup ===

install: ## Install dependencies
	npm install

setup: install hooks ## Full setup: install deps and configure git hooks

hooks: ## Setup git hooks
	node scripts/setup-git-hooks.js

hooks-pre-commit: ## Run local pre-commit gates before creating a commit
	npm run lint:types

hooks-pre-push: ## Run local pre-push governance gates before pushing
	npm test

hooks-commit-msg: ## Validate commit message policy (use HOOK_COMMIT_MSG, HOOK_COMMIT_MSG_FILE, or MSG_FILE)
	@tmp_file="$$(mktemp)"; \
	trap 'rm -f "$$tmp_file"' EXIT; \
	if [ -n "$${HOOK_COMMIT_MSG:-}" ]; then \
		printf '%s\n' "$${HOOK_COMMIT_MSG}" > "$$tmp_file"; \
	elif [ -n "$${HOOK_COMMIT_MSG_FILE:-}" ]; then \
		cat "$${HOOK_COMMIT_MSG_FILE}" > "$$tmp_file"; \
	elif [ -n "$${MSG_FILE:-}" ]; then \
		cat "$${MSG_FILE}" > "$$tmp_file"; \
	else \
		echo "Usage: HOOK_COMMIT_MSG=\"feat: test\" make hooks-commit-msg or make hooks-commit-msg HOOK_COMMIT_MSG_FILE=/path/to/commit-msg" >&2; \
		exit 2; \
	fi; \
	node scripts/validate-commit-msg.js "$$tmp_file"

# === Development ===

dev: ## Start development server
	npm run dev

build: ## Build for production
	npm run build

# === Quality ===

lint: ## Run linter
	npm run lint:types

fmt: ## Format code
	npm fmt

typecheck: ## Run TypeScript type checking
	npm run lint:types

test: ## Run tests
	npm test

check: lint typecheck test ## Run all checks (lint, typecheck, test)

# === Security ===

audit: ## Run security audit
	npm audit

secrets: ## Scan for secrets with gitleaks
	@gitleaks detect --source . --verbose || (echo "Install gitleaks: brew install gitleaks" && exit 1)

security: audit secrets ## Run all security checks

# === Maintenance ===

clean: ## Clean build artifacts and caches
	rm -rf dist coverage artifacts .test-traces* .traces
	rm -rf node_modules/.cache

reset: clean ## Full reset: clean and reinstall
	npm install

# === CI ===

ci: check audit ## Run CI checks (check + audit)

# === Diagrams ===

diagrams: ## Generate architecture diagrams
	npm exec diagram all . --output-dir AI/diagrams

# === Environment ===

env-check: ## Check environment with ralph-gold
	@./scripts/check-environment.sh
