export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface DeploymentConfig {
  // 部署阶段配置
  deployment_stages: {
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
  };

  // 基础配置
  deployment_suffix: string;
  verbosity: string;
  global_log_level: LogLevel;
  sequencer_type: 'erigon' | 'zkevm';
  consensus_contract_type: 'rollup' | 'cdk-validium' | 'pessimistic';
  additional_services: string[];
  polygon_zkevm_explorer: string;
  l1_explorer_url: string;

  // 镜像配置
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
    op_succinct_contract_deployer_image: string;
    op_succinct_server_image: string;
    op_succinct_proposer_image: string;
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
    op_succinct_server_port: number;
    op_succinct_proposer_port: number;
  };

  // 静态端口配置
  static_ports?: {
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
  };

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

  // L2 配置
  l2_accounts_to_fund: number;
  l2_funding_amount: string;
  l2_deploy_deterministic_deployment_proxy: boolean;
  l2_deploy_lxly_bridge_and_call: boolean;
  chain_name: string;
  sovereign_chain_name: string;

  // Rollup 配置
  zkevm_rollup_chain_id: number;
  zkevm_rollup_id: number;
  zkevm_rollup_fork_id: number;
  zkevm_use_real_verifier: boolean;
  verifier_program_vkey: string;
  erigon_strict_mode: boolean;
  gas_token_enabled: boolean;
  gas_token_address: string;
  use_dynamic_ports: boolean;
  enable_normalcy: boolean;

  // 密钥配置
  zkevm_l2_keystore_password: string;
  zkevm_l2_proofsigner_address: string;

  // Agglayer 配置
  agglayer_prover_sp1_key?: string;
  agglayer_prover_network_url: string;
  agglayer_prover_primary_prover: string;
  agglayer_grpc_url: string;
  agglayer_readrpc_url: string;

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
    zkevm_l2_aggoracle_address: string;
    zkevm_l2_aggoracle_private_key: string;
    zkevm_l2_sovereignadmin_address: string;
    zkevm_l2_sovereignadmin_private_key: string;
    zkevm_l2_claimtx_address: string;
    zkevm_l2_claimtx_private_key: string;
  };

  // Optimism 包配置
  optimism_package?: {
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
  };

  // MITM 代理配置
  mitm_proxied_components?: {
    agglayer: boolean;
    aggkit: boolean;
    bridge: boolean;
    dac: boolean;
    'erigon-sequencer': boolean;
    'erigon-rpc': boolean;
    'cdk-node': boolean;
  };

  // 无状态节点配置
  trusted_sequencer_node_uri: string;
  zkevm_aggregator_host: string;
  genesis_file: string;
  sovereign_genesis_file: string;

  l2_rpc_name: string;
  
  // Blockscout配置
  blockscout_params: {
    port: number;
    api_port: number;
    database: {
      name: string;
      user: string;
      password: string;
      host: string;
      port: number;
    };
    backend_port: number;
  };

  // 数据库配置
  database?: {
    master_db: string;
    master_user: string;
    master_password: string;
    port: number;
    use_remote?: boolean;
    host?: string;
  };

  // Prover配置
  prover?: {
    prover_config?: {
      executor_port: number;
      hash_db_port: number;
    };
    deploy_prover?: boolean;
  };

  // Genesis配置
  genesis_artifact?: string;
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
}

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

export interface Config {
  deployment_stages: DeploymentStages;
  args: DeploymentConfig;
  optimism_package?: OptimismPackage;
  static_ports?: StaticPorts;
} 