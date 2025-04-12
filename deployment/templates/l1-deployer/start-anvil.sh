#!/bin/sh
anvil \
  --block-time {{.l1_anvil_block_time}} \
  --slots-in-an-epoch {{.l1_anvil_block_time}} \
  --chain-id {{.l1_chain_id}} \
  --host 0.0.0.0 \
  --port {{.anvil_port}} \
  --dump-state /tmp/state_out.json \
  --balance 1000000000 \
  --mnemonic "{{.l1_preallocated_mnemonic}}"