version: '3.8'

services:
  # Database Services
  postgres:
    image: postgres:16.2
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER} 
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - ./build/init.sql:/docker-entrypoint-initdb.d/init.sql
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "${POSTGRES_PORT}:5432"
    command: ["-N", "1000"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

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

  # CDK Erigon Sequencer
  zkevm-stateless-executor:
    image: ${ZKEVM_PROVER_IMAGE}
    ports:
      - "${ZKEVM_EXECUTOR_PORT}:50071"
      - "${ZKEVM_HASH_DB_PORT}:50061"
    volumes:
      - ./build/executor-config.toml:/app/config.toml
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=:50071"]
      interval: 10s
      timeout: 5s
      retries: 5

  cdk-erigon-sequencer:
    image: ${CDK_ERIGON_NODE_IMAGE}
    depends_on:
      zkevm-stateless-executor:
        condition: service_healthy
    ports:
      - "${ZKEVM_DATA_STREAMER_PORT}:6900"
      - "${ZKEVM_PPROF_PORT}:6060"
      - "${ZKEVM_RPC_HTTP_PORT}:8123"
      - "${ZKEVM_RPC_WS_PORT}:8133"
    volumes:
      - ./build/sequencer-config.toml:/app/config.toml
      - ./build/chainspec.json:/app/chainspec.json
      - ./data/sequencer:/data
      - ./build/sequencer.keystore:/app/sequencer.keystore
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8123"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Pool Manager
  zkevm-pool-manager:
    image: ${ZKEVM_POOL_MANAGER_IMAGE}
    depends_on:
      postgres:
        condition: service_healthy
      cdk-erigon-sequencer:
        condition: service_healthy
    ports:
      - "${ZKEVM_POOL_MANAGER_PORT}:8545"
    volumes:
      - ./build/pool-manager-config.toml:/etc/pool-manager/pool-manager-config.toml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8545"]
      interval: 10s
      timeout: 5s
      retries: 5

  # CDK Erigon Node
  cdk-erigon-rpc:
    image: ${CDK_ERIGON_NODE_IMAGE}
    depends_on:
      cdk-erigon-sequencer:
        condition: service_healthy
      zkevm-pool-manager:
        condition: service_healthy
    ports:
      - "${ZKEVM_PPROF_PORT}:6060"
      - "${ZKEVM_RPC_HTTP_PORT}:8123"
      - "${ZKEVM_RPC_WS_PORT}:8133"
    volumes:
      - ./build/node-config.toml:/app/config.toml
      - ./build/chainspec.json:/app/chainspec.json
      - ./data/node:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8123"]
      interval: 10s
      timeout: 5s
      retries: 5

  # CDK Central Environment
  zkevm-prover:
    image: ${ZKEVM_PROVER_IMAGE}
    ports:
      - "${ZKEVM_EXECUTOR_PORT}:50071"
      - "${ZKEVM_HASH_DB_PORT}:50061"
    volumes:
      - ./build/prover-config.toml:/app/config.toml
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=:50071"]
      interval: 10s
      timeout: 5s
      retries: 5

  zkevm-dac:
    image: ${ZKEVM_DA_IMAGE}
    ports:
      - "${ZKEVM_DAC_PORT}:8484"
    volumes:
      - ./build/dac-config.toml:/app/config.toml
      - ./build/dac.keystore:/app/dac.keystore
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8484/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  cdk-node:
    image: ${CDK_NODE_IMAGE}
    depends_on:
      zkevm-prover:
        condition: service_healthy
      zkevm-dac:
        condition: service_healthy
    ports:
      - "${ZKEVM_CDK_NODE_PORT}:5576"
      - "${ZKEVM_AGGREGATOR_PORT}:50081"
    volumes:
      - ./build/node-config.toml:/app/config.toml
      - ./build/genesis.json:/app/genesis.json
      - ./build/aggregator.keystore:/app/aggregator.keystore
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5576/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Bridge Infrastructure
  zkevm-bridge-service:
    image: ${ZKEVM_BRIDGE_SERVICE_IMAGE}
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "${ZKEVM_BRIDGE_GRPC_PORT}:9090"
      - "${ZKEVM_BRIDGE_METRICS_PORT}:8090"
      - "${ZKEVM_BRIDGE_RPC_PORT}:8080"
    volumes:
      - ./build/bridge-config.toml:/etc/zkevm/bridge-config.toml
      - ./build/claimtxmanager.keystore:/etc/zkevm/claimtxmanager.keystore
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  zkevm-bridge-ui:
    image: ${ZKEVM_BRIDGE_UI_IMAGE}
    depends_on:
      zkevm-bridge-service:
        condition: service_healthy
    ports:
      - "${ZKEVM_BRIDGE_UI_PORT}:80"
    volumes:
      - ./build/bridge-ui-config.env:/etc/zkevm/.env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:80"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Monitoring Infrastructure
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
  postgres-data:
  bs-postgres-data:
  grafana-data:
  prometheus-data:

networks:
  default:
    name: zklink-network
    external: true 