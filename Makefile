.PHONY: dev api app test lint sync compute

api:            ## run the backend API with reload
	cd backend && uv run health serve --reload

app:            ## start the Expo dev server
	cd app && npx expo start

test:           ## backend + app tests
	cd backend && uv run pytest -q
	cd app && npx jest --ci

lint:           ## backend + app lint/typecheck
	cd backend && uv run ruff check health tests && uv run ruff format --check health tests
	cd app && npx tsc --noEmit && npx eslint .

sync:           ## pull the last 30 days from COROS and recompute scores
	cd backend && uv run health coros sync --days 30

compute:        ## recompute scores only
	cd backend && uv run health compute --days 60
