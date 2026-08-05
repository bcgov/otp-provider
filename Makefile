SHELL := /usr/bin/env bash

.PHONY: test_db
test_db:
	pg_ctl start
	createdb -U postgres runner || true
	@cd .bin; chmod +x ./db-setup.sh
	psql -U postgres -c 'drop database if exists otp_test';
	@cd .bin; ./db-setup.sh otp_test

.PHONY: unit_test
unit_test:
	yarn test
