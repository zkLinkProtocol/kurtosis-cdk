version: '3.8'

services:
  # Agglayer Prover
  agglayer-prover:
    image: ${AGGLAYER_IMAGE}
    ports:
      - "${AGGLAYER_PROVER_PORT}:4445"
      - "${AGGLAYER_PROVER_METRICS_PORT}:9093"
    volumes:
      - ./build/agglayer-prover-config.toml:/etc/zkevm/agglayer-prover-config.toml
    environment:
      - RUST_BACKTRACE=1
      - NETWORK_PRIVATE_KEY=${AGGLAYER_PROVER_SP1_KEY:-}
      - SP1_PRIVATE_KEY=${AGGLAYER_PROVER_SP1_KEY:-}
      - NETWORK_RPC_URL=${AGGLAYER_PROVER_NETWORK_URL:-}
    entrypoint: ["/usr/local/bin/agglayer"]
    command: ["prover", "--cfg", "/etc/zkevm/agglayer-prover-config.toml"]
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=:4445"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Agglayer Service
  agglayer:
    image: ${AGGLAYER_IMAGE}
    depends_on:
      agglayer-prover:
        condition: service_healthy
      postgres:
        condition: service_healthy
    ports:
      - "${AGGLAYER_READRPC_PORT}:4444"
      - "${AGGLAYER_GRPC_PORT}:4443"
      - "${AGGLAYER_ADMIN_PORT}:4446"
      - "${AGGLAYER_METRICS_PORT}:9092"
    volumes:
      - ./build/agglayer-config.toml:/etc/zkevm/agglayer-config.toml
      - ./build/agglayer.keystore:/etc/zkevm/agglayer.keystore
    entrypoint: ["/usr/local/bin/agglayer"]
    command: ["run", "--cfg", "/etc/zkevm/agglayer-config.toml"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4444/health"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:
  default:
    name: zklink-network
    external: true 