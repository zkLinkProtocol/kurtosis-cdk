export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface DeploymentConfig {
  // 基本配置
  deployment_suffix: string;
  verbosity: LogLevel;
  global_log_level: LogLevel;
  
  // L1 配置
  l1_chain_id: number;
  l1_engine: 'geth' | 'anvil';
  l1_preallocated_mnemonic: string;
  l1_funding_amount: string;
  l1_rpc_url: string;
  l1_ws_url: string;
  l1_beacon_url: string;
  l1_preset: 'mainnet' | 'minimal';
  l1_seconds_per_slot: number;
  l1_participants_count: number;
  l1_additional_services: string[];
  l1_deploy_lxly_bridge_and_call: boolean;
  l1_explorer_url: string;
  
  // L2 配置
  l2_accounts_to_fund: number;
  l2_funding_amount: string;
  l2_deploy_deterministic_deployment_proxy: boolean;
  l2_deploy_lxly_bridge_and_call: boolean;
  chain_name: string;
  sovereign_chain_name: string;
  l2_rpc_name: string;
  polygon_zkevm_explorer: string;

  // Rollup 配置
  zkevm_rollup_chain_id: number;
  zkevm_rollup_id: number;
  zkevm_use_real_verifier: boolean;
  verifier_program_vkey: string;
  erigon_strict_mode: boolean;
  gas_token_enabled: boolean;
  gas_token_address: string;
  use_dynamic_ports: boolean;
  enable_normalcy: boolean;
  use_local_l1: boolean;

  // 服务配置
  sequencer_type: 'erigon' | 'zkevm';
  consensus_contract_type: 'rollup' | 'cdk-validium' | 'pessimistic';
  additional_services: string[];

  // 镜像版本
  images: {
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
  };

  // 端口配置
  ports: {
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
  };

  // 账户配置
  accounts: {
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
  };

  // 数据库配置
  bridge_db: {
    user: string;
    name: string;
    password: string;
    hostname: string;
    port: number;
  };

  // 合约地址配置
  zkevm_bridge_address: string;
  zkevm_bridge_l2_address: string;
  zkevm_global_exit_root_address: string;
  zkevm_global_exit_root_l2_address: string;
  zkevm_rollup_manager_address: string;
  zkevm_rollup_address: string;
  zkevm_rollup_manager_block_number: number;
  zkevm_l2_keystore_password: string;

  // Blockscout 配置
  blockscout_params?: {
    blockscout_public_port?: number;
    [key: string]: any;
  };

  // 数据库配置(可选)
  database?: DatabaseConnectionConfig;

  // Prover 配置
  prover?: ProverDeployConfig;
}

// 数据库配置
export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  master_db: string;
  master_user: string;
  master_password: string;
  use_remote: boolean;
}

// Prover 部署配置
export interface ProverDeployConfig {
  // 是否在当前机器部署 Prover
  deploy_prover: boolean;
  // Prover 连接配置
  prover_config?: {
    // 远程数据库连接信息
    database: {
      prover_db_host: string;
      prover_db_port: number;
      prover_db_name: string;
      prover_db_user: string;
      prover_db_password: string;
    };
    // 其他 Prover 需要的配置
    executor_port: number;
    hash_db_port: number;
    metrics_port: number;
    // 如果需要连接其他服务的地址
    aggregator_host?: string;
    aggregator_port?: number;
  };
} 