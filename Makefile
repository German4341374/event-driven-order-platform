.PHONY: setup lint test build check up down clean smoke

setup:
	npm ci

lint:
	npm run format
	npm run lint
	npm run typecheck

test:
	npm run test:coverage

build:
	npm run build

check:
	npm run check

up:
	docker compose up --build -d

down:
	docker compose down --remove-orphans

smoke:
	node scripts/smoke.mjs

clean:
	docker compose down --volumes --remove-orphans
