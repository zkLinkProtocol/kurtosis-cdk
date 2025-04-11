version: '3.8'

services:
  # Monitoring Infrastructure
  bs-postgres:
    image: postgres:16.2
    environment:
      - POSTGRES_DB=${BS_POSTGRES_DB}
      - POSTGRES_USER=${BS_POSTGRES_USER}
      - POSTGRES_PASSWORD=${BS_POSTGRES_PASSWORD}
    volumes:
      - ./build/init.sql:/docker-entrypoint-initdb.d/init.sql
      - bs-postgres-data:/var/lib/postgresql/data
    ports:
      - "${BS_POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${BS_POSTGRES_USER} -d ${BS_POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  bs-backend:
    image: blockscout/blockscout-zkevm:6.8.1
    depends_on:
      bs-postgres:
        condition: service_healthy
      cdk-erigon-rpc:
        condition: service_healthy
    ports:
      - "${BS_BACKEND_PORT}:4004"
    environment:
      - DATABASE_URL=postgresql://${BS_POSTGRES_USER}:${BS_POSTGRES_PASSWORD}@bs-postgres:5432/${BS_POSTGRES_DB}
      - ETHEREUM_JSONRPC_HTTP_URL=http://cdk-erigon-rpc:8123
      - ETHEREUM_JSONRPC_TRACE_URL=http://cdk-erigon-rpc:8123
      - NETWORK=zkLink
      - SUBNETWORK=Testnet
      - CHAIN_ID=${ZKEVM_ROLLUP_CHAIN_ID}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4004/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  grafana:
    image: grafana/grafana-enterprise:11.1.4
    ports:
      - "${GRAFANA_PORT}:3000"
    volumes:
      - ./grafana/dashboards:/var/lib/grafana/dashboards
      - grafana-data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_USER=${GRAFANA_ADMIN_USER}
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  prometheus:
    image: prom/prometheus:v3.0.1
    ports:
      - "${PROMETHEUS_PORT}:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  bs-postgres-data:
  grafana-data:
  prometheus-data:

networks:
  default:
    name: zklink-network
    external: true 