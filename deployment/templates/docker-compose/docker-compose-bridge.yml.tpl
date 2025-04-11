version: '3.8'

services:
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

networks:
  default:
    name: zklink-network
    external: true 