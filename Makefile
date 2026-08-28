.PHONY: backend ui clean-db clean-all reset help

backend:
	cargo run -p splice-api

ui:
	cd splice-web && bun dev

clean-db:
	@echo "Removing SQLite database files..."
	@rm -f splice.db splice.db-wal splice.db-shm *.db *.db-wal *.db-shm
	@echo "Database removed successfully."

clean-all: clean-db
	@echo "Removing media store and thumbnail cache..."
	@rm -rf .media_store .thumbnail_cache
	@echo "All database and cache storage cleaned successfully."
