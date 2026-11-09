PYTHON ?= .venv/bin/python
NPM ?= npm

.PHONY: setup test-python python-typecheck typecheck lint format-check audit-dependencies test-web build test-e2e test-e2e-fullstack verify verify-ci delivery-ready delivery-pr-check

setup:
	python3 -m venv .venv
	$(PYTHON) -m pip install --require-hashes -r requirements-dev.lock
	$(PYTHON) -m pip install --no-deps -e .
	$(NPM) --prefix web ci

test-python:
	$(PYTHON) -m pytest

python-typecheck:
	$(PYTHON) -m pyright --pythonpath $(PYTHON)

typecheck: python-typecheck
	$(NPM) --prefix web run typecheck

lint:
	$(NPM) --prefix web run lint

format-check:
	$(NPM) --prefix web run format:check

audit-dependencies:
	$(PYTHON) tools/verify_node_audit.py

test-web:
	$(NPM) --prefix web test

build:
	MEMENTO_SERVING_MODE=disabled MEMENTO_DEMO_BUNDLE=0 $(NPM) --prefix web run build

test-e2e:
	$(NPM) --prefix web run test:e2e

test-e2e-fullstack:
	$(NPM) --prefix web run test:e2e:fullstack

test-e2e-core:
	$(NPM) --prefix web run test:core

verify: verify-ci

verify-ci: security-source test-python typecheck lint format-check audit-dependencies test-web build test-e2e test-e2e-fullstack test-e2e-core test-e2e-security

.PHONY: test-e2e-core test-e2e-security

delivery-ready:
	$(PYTHON) tools/delivery.py ready --base "$(or $(BASE),origin/main)" --verification "$(or $(VERIFICATION),no-db)"

delivery-pr-check:
	$(PYTHON) tools/delivery.py pr-check

.PHONY: security-source test-e2e-security
security-source:
	$(PYTHON) -m tools.check_security

test-e2e-security:
	$(PYTHON) -m tools.verify_security
