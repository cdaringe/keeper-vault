.DEFAULT_GOAL := build

# GNU Make treats the word after -- as another goal.
ifneq ($(filter version,$(MAKECMDGOALS)),)
ifneq ($(words $(MAKECMDGOALS)),2)
$(error Usage: make version -- patch|minor|major)
endif
ifneq ($(words $(filter patch minor major,$(MAKECMDGOALS))),1)
$(error Usage: make version -- patch|minor|major)
endif
.PHONY: patch minor major
patch minor major:
	@:
endif

.PHONY: version test-version
version:
	node development/version.ts $(filter patch minor major,$(MAKECMDGOALS))

test-version:
	node development/sandbox.ts tests/version.ts

V_SOURCES := $(shell find backend -name '*.v' -print)
V_REV := 9621aa02fd7d7788700846e93242d08bd70a8aea
LOCAL_V := .tools/v/v
PNPM ?= $(if $(shell command -v pnpm),pnpm,corepack pnpm)
V ?= $(or $(shell command -v v 2>/dev/null),$(LOCAL_V))

.PHONY: build clean run test
build: keeper-vault

clean:
	$(RM) keeper-vault keeper-vault.new
	$(RM) -r dist

keeper-vault: $(V_SOURCES) backend/v.mod dist/vault.html dist/window.js Makefile $(if $(filter $(LOCAL_V),$(V)),$(LOCAL_V))
	"$(V)" -o keeper-vault.new backend
	mv -f keeper-vault.new $@

$(LOCAL_V):
	mkdir -p .tools/v
	git -C .tools/v init -q
	git -C .tools/v fetch --depth=1 https://github.com/vlang/v.git $(V_REV)
	git -C .tools/v checkout --detach FETCH_HEAD
	$(MAKE) -C .tools/v
	test -x $@

BROWSER ?= $(shell for browser in chromium google-chrome brave-browser chromium-browser; do command -v $$browser && break; done)

export PROFILE FIXTURE BROWSER CHECKPOINT
run: build
	./keeper-vault $${PROFILE:+"$$PROFILE"}

test: build
	node development/sandbox.ts tests/integration.ts ./keeper-vault "$$FIXTURE"

.PHONY: preview test-recovery
preview: build
	node development/sandbox.ts development/preview.ts ./keeper-vault "$$FIXTURE"

test-recovery: build
	node development/sandbox.ts tests/recovery.ts ./keeper-vault "$$CHECKPOINT"

node_modules/.keeper-deps: package.json pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile
	touch $@

dist/vault.html dist/window.js &: desktop/window.ts $(wildcard frontend/*) tsconfig.json node_modules/.keeper-deps
	$(PNPM) run build:ui

.PHONY: test-ui
test-ui: build
	node development/sandbox.ts tests/buttons.ts
	node development/sandbox.ts tests/refresh.ts ./keeper-vault

V_TOOL := $(if $(filter $(LOCAL_V),$(V)),$(LOCAL_V))
.PHONY: fmt fmt-check check
fmt: node_modules/.keeper-deps $(V_TOOL)
	"$(V)" fmt -w $(V_SOURCES)
	node_modules/.bin/biome format --write .

fmt-check: node_modules/.keeper-deps $(V_TOOL)
	"$(V)" fmt -verify $(V_SOURCES)
	node_modules/.bin/biome format .

check: fmt-check build
	"$(V)" -W -check backend
	node_modules/.bin/tsc --noEmit
	$(MAKE) test
	$(MAKE) test-ui
	$(MAKE) test-version
