version: '3.8'

services:
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

networks:
  default:
    name: zklink-network
    external: true 