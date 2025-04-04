version: '3.8'

services:
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

networks:
  default:
    name: zklink-network
    external: true 