export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

// 部署阶段配置
export interface DeploymentStages {
  deploy_l1: boolean;
  deploy_zkevm_contracts_on_l1: boolean;
  deploy_databases: boolean;
  deploy_cdk_central_environment: boolean;
  deploy_cdk_bridge_infra: boolean;
  deploy_cdk_bridge_ui: boolean;
  deploy_agglayer: boolean;
  deploy_cdk_erigon_node: boolean;
  deploy_optimism_rollup: boolean;
  deploy_op_succinct: boolean;
  deploy_l2_contracts: boolean;
  deploy_prover: boolean;
}

// 数据库配置
export interface DatabaseConfig {
  use_remote: boolean;
  postgres_host: string;
  postgres_port: number;
  postgres_master_db: string;
  postgres_master_user: string;
  postgres_master_password: string;
  postgres_image: string;
  postgres_service_name: string;

  // 中心环境数据库
  central_env_dbs: {
    aggregator_db: {
      name: string;
      user: string;
      password: string;
    };
    aggregator_syncer_db: {
      name: string;
      user: string;
      password: string;
    };
    bridge_db: {
      name: string;
      user: string;
      password: string;
    };
    dac_db: {
      name: string;
      user: string;
      password: string;
    };
    sovereign_bridge_db: {
      name: string;
      user: string;
      password: string;
    };
  };

  // Prover数据库
  prover_db: {
    name: string;
    user: string;
    password: string;
    init: string;
  };

  // zkEVM节点数据库
  zkevm_node_dbs: {
    event_db: {
      name: string;
      user: string;
      password: string;
      init: string;
    };
    pool_db: {
      name: string;
      user: string;
      password: string;
    };
    state_db: {
      name: string;
      user: string;
      password: string;
    };
  };

  // CDK Erigon数据库
  cdk_erigon_dbs: {
    pool_manager_db: {
      name: string;
      user: string;
      password: string;
    };
  };
}

export interface DatabaseDeploymentConfig {
  hostname: string;
  port: number;
  name: string;
  user: string;
  password: string;
  init?: string;
}

// Prover配置
export interface ProverConfig {
  deploy_prover: boolean;
}

// 镜像配置
export interface Images {
  aggkit_image: string;
  agglayer_image: string;
  cdk_erigon_node_image: string;
  cdk_node_image: string;
  cdk_validium_node_image: string;
  zkevm_bridge_proxy_image: string;
  zkevm_bridge_service_image: string;
  zkevm_bridge_ui_image: string;
  zkevm_da_image: string;
  zkevm_contracts_image: string;
  zkevm_node_image: string;
  zkevm_pool_manager_image: string;
  zkevm_prover_image: string;
  zkevm_sequence_sender_image: string;
  anvil_image: string;
  mitm_image: string;
  op_succinct_contract_deployer_image: string;
  op_succinct_server_image: string;
  op_succinct_proposer_image: string;
}

// 端口配置
export interface Ports {
  agglayer_grpc_port: number;
  agglayer_readrpc_port: number;
  agglayer_prover_port: number;
  agglayer_admin_port: number;
  agglayer_metrics_port: number;
  agglayer_prover_metrics_port: number;
  prometheus_port: number;
  zkevm_aggregator_port: number;
  zkevm_bridge_grpc_port: number;
  zkevm_bridge_rpc_port: number;
  zkevm_bridge_ui_port: number;
  zkevm_bridge_metrics_port: number;
  zkevm_dac_port: number;
  zkevm_data_streamer_port: number;
  zkevm_executor_port: number;
  zkevm_hash_db_port: number;
  zkevm_pool_manager_port: number;
  zkevm_pprof_port: number;
  zkevm_rpc_http_port: number;
  zkevm_rpc_ws_port: number;
  zkevm_cdk_node_port: number;
  blockscout_frontend_port: number;
  anvil_port: number;
  mitm_port: number;
  op_succinct_server_port: number;
  op_succinct_proposer_port: number;
}

// 账户配置
export interface Accounts {
  zkevm_l2_sequencer_address: string;
  zkevm_l2_sequencer_private_key: string;
  zkevm_l2_aggregator_address: string;
  zkevm_l2_aggregator_private_key: string;
  zkevm_l2_claimtxmanager_address: string;
  zkevm_l2_claimtxmanager_private_key: string;
  zkevm_l2_timelock_address: string;
  zkevm_l2_timelock_private_key: string;
  zkevm_l2_admin_address: string;
  zkevm_l2_admin_private_key: string;
  zkevm_l2_loadtest_address: string;
  zkevm_l2_loadtest_private_key: string;
  zkevm_l2_agglayer_address: string;
  zkevm_l2_agglayer_private_key: string;
  zkevm_l2_dac_address: string;
  zkevm_l2_dac_private_key: string;
  zkevm_l2_proofsigner_address: string;
  zkevm_l2_proofsigner_private_key: string;
  zkevm_l2_l1testing_address: string;
  zkevm_l2_l1testing_private_key: string;
  zkevm_l2_claimsponsor_address: string;
  zkevm_l2_claimsponsor_private_key: string;
  zkevm_l2_aggoracle_address: string;
  zkevm_l2_aggoracle_private_key: string;
  zkevm_l2_sovereignadmin_address: string;
  zkevm_l2_sovereignadmin_private_key: string;
  zkevm_l2_claimtx_address: string;
  zkevm_l2_claimtx_private_key: string;
}

// L1配置
export interface L1Args {
  l1_engine: 'geth' | 'anvil';
  l1_chain_id: number;
  l1_preallocated_mnemonic: string;
  l1_rpc_url: string;
  l1_ws_url: string;
  l1_beacon_url: string;
  l1_additional_services: string[];
  l1_preset: string;
  l1_seconds_per_slot: number;
  pectra_enabled: boolean;
  l1_funding_amount: string;
  l1_participants_count: number;
  l1_deploy_lxly_bridge_and_call: boolean;
  l1_anvil_block_time: number;
  l1_anvil_slots_in_epoch: number;
  use_previously_deployed_contracts: boolean;
  erigon_datadir_archive: string | null;
  anvil_state_file: string | null;
}

// L2配置
export interface L2Args {
  l2_accounts_to_fund: number;
  l2_funding_amount: string;
  l2_deploy_deterministic_deployment_proxy: boolean;
  l2_deploy_lxly_bridge_and_call: boolean;
  chain_name: string;
  sovereign_chain_name: string;
}

// Rollup配置
export interface RollupArgs {
  zkevm_l2_keystore_password: string;
  zkevm_rollup_chain_id: number;
  zkevm_rollup_id: number;
  zkevm_use_real_verifier: boolean;
  verifier_program_vkey: string;
  erigon_strict_mode: boolean;
  gas_token_enabled: boolean;
  gas_token_address: string;
  use_dynamic_ports: boolean;
  enable_normalcy: boolean;
  agglayer_prover_sp1_key: string | null;
  agglayer_prover_network_url: string;
  agglayer_prover_primary_prover: string;
  agglayer_grpc_url: string;
  agglayer_readrpc_url: string;
  zkevm_path_rw_data: string;
  op_el_rpc_url: string;
  op_cl_rpc_url: string;
  op_succinct_mock: boolean;
}

// 无状态节点配置
export interface PlessZkevmNodeArgs {
  trusted_sequencer_node_uri: string;
  zkevm_aggregator_host: string;
  genesis_file: string;
  sovereign_genesis_file: string;
}

// 附加服务配置
export interface AdditionalServicesArgs {
  blockscout_params: {
    blockscout_public_port: number;
  };
}

// 基础配置参数
export interface DefaultArgs {
  deployment_suffix: string;
  verbosity: string;
  global_log_level: LogLevel;
  sequencer_type: 'erigon' | 'zkevm';
  consensus_contract_type: 'rollup' | 'cdk-validium' | 'pessimistic';
  additional_services: string[];
  polygon_zkevm_explorer: string;
  l1_explorer_url: string;
}

// 静态端口配置
export interface StaticPorts {
  l1_el_start_port: number;
  l1_cl_start_port: number;
  l1_vc_start_port: number;
  l1_additional_services_start_port: number;
  agglayer_start_port: number;
  agglayer_prover_start_port: number;
  cdk_node_start_port: number;
  zkevm_bridge_service_start_port: number;
  zkevm_bridge_ui_start_port: number;
  reverse_proxy_start_port: number;
  database_start_port: number;
  pless_database_start_port: number;
  zkevm_pool_manager_start_port: number;
  zkevm_dac_start_port: number;
  zkevm_prover_start_port: number;
  zkevm_executor_start_port: number;
  zkevm_stateless_executor_start_port: number;
  cdk_erigon_sequencer_start_port: number;
  cdk_erigon_rpc_start_port: number;
  arpeggio_start_port: number;
  blutgang_start_port: number;
  erpc_start_port: number;
  panoptichain_start_port: number;
}

// Optimism包配置
export interface OptimismPackage {
  source: string;
  predeployed_contracts: boolean;
  chains: Array<{
    participants: Array<{
      el_type: string;
      el_image: string;
      cl_type: string;
      cl_image: string;
      count: number;
    }>;
    network_params: {
      name: string;
      network_id: string;
      seconds_per_slot: number;
    };
  }>;
}

// 支持的分叉ID
export type SupportedForkId = 9 | 11 | 12 | 13;

// 主配置接口
export interface DefaultConfig {
  deployment_stages: DeploymentStages;
  database: DatabaseConfig;
  default_prover: ProverConfig;
  default_images: Images;
  default_ports: Ports;
  default_accounts: Accounts;
  default_l1_args: L1Args;
  default_l2_args: L2Args;
  default_rollup_args: RollupArgs;
  default_pless_zkevm_node_args: PlessZkevmNodeArgs;
  default_additional_services_args: AdditionalServicesArgs;
  default_args: DefaultArgs;
  default_static_ports: StaticPorts;
  default_supported_fork_ids: SupportedForkId[];
  optimism_package: OptimismPackage;
}

// 部署参数配置
export interface DeploymentArgs extends 
  DefaultArgs,
  Accounts,
  Ports,
  Images,
  L1Args,
  L2Args,
  RollupArgs,
  PlessZkevmNodeArgs,
  AdditionalServicesArgs,
  ProverConfig {
  l2_rpc_name: string;
  sequencer_name: string;
  zkevm_rollup_fork_id: string;
  zkevm_rollup_fork_name: string;
  deploy_agglayer: boolean;
}

// OpStack外部L1网络参数
export interface ExternalL1NetworkParams {
  network_id: string;
  rpc_kind: 'standard';
  el_rpc_url: string;
  el_ws_url: string;
  cl_rpc_url: string;
  priv_key: string;
}

// OpStack参数配置
export interface OpStackArgs {
  // 源代码路径
  source: string;
  // 是否预部署合约
  predeployed_contracts: boolean;
  // Optimism包配置
  optimism_package: OptimismPackage;
  // 外部L1网络参数
  external_l1_network_params: ExternalL1NetworkParams;
}

export interface DeploymentConfig {
  deployment_stages: DeploymentStages;
  deployment_args: DeploymentArgs;
  database: DatabaseConfig;
  op_stack_args: OpStackArgs;
  static_ports: StaticPorts;
  default_supported_fork_ids: SupportedForkId[];
}

export interface CustomConfig extends
  DeploymentStages,
  DeploymentArgs,
  DatabaseConfig,
  ProverConfig {

}