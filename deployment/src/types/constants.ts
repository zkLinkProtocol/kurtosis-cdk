// =============================================
// From lib/constants.star
// =============================================

export enum LOG_LEVEL {
    ERROR = 'error',
    WARN = 'warn',
    INFO = 'info',
    DEBUG = 'debug',
    TRACE = 'trace'
}

export enum SEQUENCER_TYPE {
    CDK_ERIGON = 'erigon',
    ZKEVM = 'zkevm'
}

export const TOOLBOX_IMAGE = 'leovct/toolbox:0.0.8' as const;

export enum L1_ENGINES {
    geth = 'geth',
    anvil = 'anvil'
}

// =============================================
// From lib/data_availability.star
// =============================================

export enum DATA_AVAILABILITY_MODES {
    // In rollup mode, transaction data is stored on-chain on L1
    rollup = 'rollup',
    // In cdk-validium mode, transaction data is stored off-chain using the CDK DA layer and a DAC
    cdk_validium = 'cdk-validium',
    // In pessimistic mode, the contracts don't require full execution proofs
    pessimistic = 'pessimistic'
}

// Map data availability modes to consensus contracts
export const CONSENSUS_CONTRACTS: Record<DATA_AVAILABILITY_MODES, string> = {
    [DATA_AVAILABILITY_MODES.rollup]: 'PolygonZkEVMEtrog',
    [DATA_AVAILABILITY_MODES.cdk_validium]: 'PolygonValidiumEtrog',
    [DATA_AVAILABILITY_MODES.pessimistic]: 'PolygonPessimisticConsensus'
} as const;

// =============================================
// From lib/zkevm_prover.star
// =============================================

export enum PROVER_TYPE {
    prover = 'prover',
    executor = 'executor',
    stateless_executor = 'stateless-executor'
}

// =============================================
// From lib/cdk_erigon.star
// =============================================

export enum CDK_ERIGON_TYPE {
    sequencer = 'sequencer',
    rpc = 'rpc'
}

// =============================================
// From deploy_zkevm_contracts.star
// =============================================

// Contract deployment artifacts
export const DEPLOYMENT_ARTIFACTS = [
    {
        name: 'deploy_parameters.json',
        file: './templates/contract-deploy/deploy_parameters.json',
    },
    {
        name: 'create_rollup_parameters.json',
        file: './templates/contract-deploy/create_rollup_parameters.json',
    },
    {
        name: 'run-contract-setup.sh',
        file: './templates/contract-deploy/run-contract-setup.sh',
    },
    {
        name: 'create-keystores.sh',
        file: './templates/contract-deploy/create-keystores.sh',
    },
    {
        name: 'update-ger.sh',
        file: './templates/contract-deploy/update-ger.sh',
    },
    {
        name: 'run-l2-contract-setup.sh',
        file: './templates/contract-deploy/run-l2-contract-setup.sh',
    },
    {
        name: 'run-sovereign-setup.sh',
        file: './templates/sovereign-rollup/run-sovereign-setup.sh',
    },
    {
        name: 'run-sovereign-setup-predeployed.sh',
        file: './templates/sovereign-rollup/run-sovereign-setup-predeployed.sh',
    },
    {
        name: 'create_new_rollup.json',
        file: './templates/sovereign-rollup/create_new_rollup.json',
    },
    {
        name: 'add_rollup_type.json',
        file: './templates/sovereign-rollup/add_rollup_type.json',
    },
    {
        name: 'sovereign-genesis.json',
        file: './templates/sovereign-rollup/genesis.json',
    },
    {
        name: 'create-genesis-sovereign-params.json',
        file: './templates/sovereign-rollup/create-genesis-sovereign-params.json',
    },
    {
        name: 'create-predeployed-sovereign-genesis.sh',
        file: './templates/sovereign-rollup/create-predeployed-sovereign-genesis.sh',
    },
    {
        name: 'op-original-genesis.json',
        file: './templates/sovereign-rollup/op-original-genesis.json',
    },
] as const;

// =============================================
// From input_parser.star
// =============================================

// A list of fork identifiers currently supported by Kurtosis CDK
export const SUPPORTED_FORK_IDS = [9, 11, 12, 13] as const;
export type SupportedForkId = typeof SUPPORTED_FORK_IDS[number];

// =============================================
// From ethereum.star
// =============================================

export const GETH_IMAGE = 'ethereum/client-go:v1.14.12' as const;
export const LIGHTHOUSE_IMAGE = 'ethpandaops/lighthouse:unstable' as const;



