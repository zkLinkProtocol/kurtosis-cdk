version: '3.8'

services:
  # 部署合约和初始化数据库
  contracts:
    image: ${ZKEVM_CONTRACTS_IMAGE}
    volumes:
      - ./build:/opt/contract-deploy
      - zkevm-artifacts:/opt/zkevm
    environment:
      - L1_RPC_URL=${L1_RPC_URL}
      - L1_WS_URL=${L1_WS_URL}
      - L1_EXPLORER_URL=${L1_EXPLORER_URL}
      - L1_CHAIN_ID=${L1_CHAIN_ID}
      - ZKEVM_ROLLUP_CHAIN_ID=${ZKEVM_ROLLUP_CHAIN_ID}
      - ZKEVM_ROLLUP_ID=${ZKEVM_ROLLUP_ID}
      - ZKEVM_L2_ADMIN_ADDRESS=${ZKEVM_L2_ADMIN_ADDRESS}
      - ZKEVM_L2_ADMIN_PRIVATE_KEY=${ZKEVM_L2_ADMIN_PRIVATE_KEY}
      - ZKEVM_L2_SEQUENCER_ADDRESS=${ZKEVM_L2_SEQUENCER_ADDRESS}
      - ZKEVM_L2_SEQUENCER_PRIVATE_KEY=${ZKEVM_L2_SEQUENCER_PRIVATE_KEY}
      - ZKEVM_L2_AGGREGATOR_ADDRESS=${ZKEVM_L2_AGGREGATOR_ADDRESS}
      - ZKEVM_L2_AGGREGATOR_PRIVATE_KEY=${ZKEVM_L2_AGGREGATOR_PRIVATE_KEY}
    
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

volumes:
  zkevm-artifacts:
  postgres-data: 