# See https://grafana.com/docs/k6/latest/results-output/real-time/timescaledb/. Need a custom build to support timescalDB.
FROM golang:1.25 AS builder

# Install xk6
RUN go install go.k6.io/xk6/cmd/xk6@latest

# Build custom k6 with the TimescaleDB output
RUN xk6 build --with github.com/grafana/xk6-output-timescaledb

# ---------- Stage 2: Runtime image ----------
FROM debian:bookworm-slim

# Install minimal dependencies (CA certificates for HTTPS, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy k6 binary from builder
COPY --from=builder /go/k6 /usr/bin/k6

COPY load-test.js /scripts/load-test.js

ENTRYPOINT ["k6"]
CMD ["run", "/scripts/load-test.js"]
