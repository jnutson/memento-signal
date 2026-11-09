PYTHON ?= .venv/bin/python
NPM ?= npm
DATA_ROOT ?= data/demo
SIGNAL_SET_ID ?=
DEMO_ID_ARG = $(if $(SIGNAL_SET_ID),--signal-set-id "$(SIGNAL_SET_ID)",)

.PHONY: setup test-python python-typecheck typecheck lint test-web build test-e2e test-e2e-fullstack verify verify-ci delivery-ready delivery-pr-check

setup:
	if test -x .venv/bin/python; then .venv/bin/python -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"'; elif command -v uv >/dev/null 2>&1; then uv venv --python 3.11 --seed .venv; else python3 -c 'import sys; assert sys.version_info >= (3,11), "Python 3.11+ required"' && python3 -m venv .venv; fi
	$(PYTHON) -m ensurepip --upgrade
	$(PYTHON) -m pip install --require-hashes -r requirements.lock
	$(PYTHON) -m pip install --no-deps -e .
	$(NPM) --prefix web ci
	$(NPM) --prefix web exec -- playwright install chromium

test-python:
	$(PYTHON) -m pytest

python-typecheck:
	$(PYTHON) -m pyright --pythonpath $(PYTHON)

typecheck: python-typecheck
	$(NPM) --prefix web run typecheck

lint:
	$(NPM) --prefix web run lint

test-web:
	$(NPM) --prefix web test

build:
	MEMENTO_DEMO_BUNDLE=0 MEMENTO_SERVING_MODE=disabled $(NPM) --prefix web run build

test-e2e:
	$(NPM) --prefix web run test:e2e

test-e2e-fullstack:
	$(NPM) --prefix web run test:e2e:fullstack

verify: verify-ci

verify-ci: security-source test-python typecheck lint test-web build test-e2e test-e2e-fullstack test-e2e-security test-e2e-hosted

.PHONY: security-source
security-source:
	$(PYTHON) -m tools.check_security

.PHONY: test-e2e-security
test-e2e-security:
	$(PYTHON) -m tools.verify_security

delivery-ready:
	$(PYTHON) tools/delivery.py ready --base "$(or $(BASE),origin/main)" --verification "$(or $(VERIFICATION),no-db)"

delivery-pr-check:
	$(PYTHON) tools/delivery.py pr-check

.PHONY: demo-prepare demo-preflight demo

demo-prepare:
	$(PYTHON) -m tools.demo prepare --fixture --data-root "$(DATA_ROOT)"

demo-preflight:
	$(PYTHON) -m tools.demo preflight --data-root "$(DATA_ROOT)" $(DEMO_ID_ARG)

demo:
	$(PYTHON) -m tools.run_demo --data-root "$(DATA_ROOT)" $(DEMO_ID_ARG)

.PHONY: demo-export test-e2e-hosted

demo-export: demo-preflight
	$(PYTHON) -m tools.export_demo --data-root "$(DATA_ROOT)"

test-e2e-hosted:
	$(PYTHON) -m tools.verify_hosted
