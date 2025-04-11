version: '3.8'

services:
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

volumes:
  zkevm-artifacts:

networks:
  default:
    name: zklink-network
    external: true 