export * from './config';
export * from './stages';

export interface ContractSetupAddresses {
  zkevm_rollup_fork_id: number;
  zkevm_l2_keystore_password: string;
  zkevm_l2_proofsigner_address: string;
  zkevm_l2_sequencer_address: string;
  zkevm_rpc_http_port: number;
  agglayer_grpc_port: number;
  agglayer_readrpc_port: number;
  agglayer_admin_port: number;
  agglayer_prover_port: number;
  agglayer_metrics_port: number;
} 