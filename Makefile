.DEFAULT_GOAL := build

V_SOURCES := $(shell find backend -name '*.v' -print)
V_REV := 9621aa02fd7d7788700846e93242d08bd70a8aea
LOCAL_V := .tools/v/v
PNPM ?= $(if $(shell command -v pnpm),pnpm,corepack pnpm)
V ?= $(or $(shell command -v v 2>/dev/null),$(LOCAL_V))

.PHONY: build run test
build: keeper-vault

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

export PROFILE FIXTURE BROWSER
run: build
	./keeper-vault $${PROFILE:+"$$PROFILE"}

test: build
	node tests/integration.ts ./keeper-vault "$$FIXTURE"

node_modules/.keeper-deps: package.json pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile
	touch $@

dist/vault.html dist/window.js &: desktop/window.ts $(wildcard frontend/*) tsconfig.json node_modules/.keeper-deps
	$(PNPM) run build:ui

.PHONY: test-ui
test-ui: dist/vault.html
	node tests/buttons.ts

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
