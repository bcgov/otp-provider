SHELL := /usr/bin/env bash

.PHONY: local_test_db
local_test_db:
	pushd .bin && bash ./db-setup.sh otp_test && popd
	yarn build && DB_NAME=otp_test node build/migrate.js
	psql -U postgres -d otp_test -f e2e/seed.sql