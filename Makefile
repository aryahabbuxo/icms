MYSQL=docker compose exec -T mysql mysql -uroot -proot

demo-reset:
	@for f in db/01_schema.sql db/02_triggers.sql db/03_procedures.sql db/04_views.sql db/05_events_indexes.sql db/06_roles_grants.sql; do \
		echo "Running $$f"; $(MYSQL) < $$f || exit 1; done
	docker compose exec -T mongo mongosh icms_docs --quiet --eval "db.dropDatabase()"
	python db/seed/seed.py
	@echo "demo-reset done"
