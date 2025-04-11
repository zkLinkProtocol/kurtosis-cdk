import { Logger } from './logger';
import { DeploymentConfig, DeploymentArgs } from '../types/config';
import { DATA_AVAILABILITY_MODES, CONSENSUS_CONTRACTS } from '../types/constants';
import { execSync } from 'child_process';

// 检查是否为CDK Validium模式
export function isCdkValidium(args: DeploymentArgs): boolean {
  return args.consensus_contract_type === DATA_AVAILABILITY_MODES.cdk_validium;
}

// 获取节点镜像
export function getNodeImage(args: { consensus_contract_type: DATA_AVAILABILITY_MODES; zkevm_node_image: string; cdk_validium_node_image: string }): string {
  // 将数据可用性模式映射到节点镜像
  const nodeImages: Record<DATA_AVAILABILITY_MODES, string> = {
    [DATA_AVAILABILITY_MODES.rollup]: args.zkevm_node_image,
    [DATA_AVAILABILITY_MODES.cdk_validium]: args.cdk_validium_node_image,
    [DATA_AVAILABILITY_MODES.pessimistic]: args.zkevm_node_image, // 默认使用zkevm_node_image
  };
  return nodeImages[args.consensus_contract_type] || '';
}

// 获取共识合约
export function getConsensusContract(args: { consensus_contract_type: DATA_AVAILABILITY_MODES }): string {
  return CONSENSUS_CONTRACTS[args.consensus_contract_type] || '';
}

export interface ContractSetupAddresses {
  zkevm_bridge_address: string;
  zkevm_bridge_l2_address: string;
  zkevm_rollup_address?: string;
  zkevm_rollup_manager_address: string;
  zkevm_rollup_manager_block_number: string;
  zkevm_global_exit_root_address: string;
  zkevm_global_exit_root_l2_address: string;
  pol_token_address: string;
  zkevm_admin_address: string;
  polygon_data_committee_address?: string;
}

export interface SovereignContractSetupAddresses {
  sovereign_ger_proxy_addr: string;
  sovereign_bridge_proxy_addr: string;
  sovereign_rollup_addr: string;
  zkevm_rollup_chain_id: string;
}

export interface OpSuccinctEnvVars {
  submission_interval: string;
  mock_verifier_address: string;
  l2oo_address: string;
  op_succinct_mock: string;
  op_succinct_agglayer: string;
  l1_preallocated_mnemonic: string;
  sp1_verifier_gateway_address: string;
  sp1_verifier_address: string;
}

export class Service {
    private logger: Logger;
    private config: DeploymentConfig;

    constructor(logger: Logger, config: DeploymentConfig) {
        this.logger = logger;
        this.config = config;
    }

    // 获取合约设置地址
    public getContractSetupAddresses(): ContractSetupAddresses {
        let serviceName = `contracts${this.config.deployment_args.deployment_suffix}`;
    
        const combinedJsonResult = execSync(`docker exec ${serviceName} /bin/sh -c "cat /opt/zkevm/combined.json"`).toString();
        const combinedJson = JSON.parse(combinedJsonResult);
        
        if (this.config.deployment_stages.deploy_agglayer) {
        this.logger.info('Changing querying service name to helper');
        if ('zkevm_rollup_manager_address' in this.config.deployment_args) {
            serviceName = 'helper';
        }
        }
        
        this.logger.info(`Getting contract setup addresses from ${serviceName} service`);
        
        let contractSetupAddresses: ContractSetupAddresses = {
            zkevm_bridge_address: combinedJson.polygonZkEVMBridgeAddress,
            zkevm_bridge_l2_address: combinedJson.polygonZkEVML2BridgeAddress,
            zkevm_rollup_manager_address: combinedJson.polygonRollupManagerAddress,
            zkevm_rollup_manager_block_number: combinedJson.deploymentRollupManagerBlockNumber,
            zkevm_global_exit_root_address: combinedJson.polygonZkEVMGlobalExitRootAddress,
            zkevm_global_exit_root_l2_address: combinedJson.polygonZkEVMGlobalExitRootL2Address,
            pol_token_address: combinedJson.polTokenAddress,
            zkevm_admin_address: combinedJson.admin,
        };

        if (this.config.deployment_stages.deploy_optimism_rollup) {
            contractSetupAddresses.zkevm_rollup_address = combinedJson.rollupAddress;
        }

        if (isCdkValidium(this.config.deployment_args)) {
            contractSetupAddresses.polygon_data_committee_address = combinedJson.polygonDataCommitteeAddress;
        }

        return contractSetupAddresses;
    }
  
  // 返回L2 RPC服务的HTTP和WS URL
  public getL2RpcUrl(): { http: string; ws: string } {
    const http = `http://cdk-erigon-rpc${this.config.deployment_args.deployment_suffix}:${this.config.static_ports.cdk_erigon_rpc_start_port}`;
    const ws = `ws://cdk-erigon-rpc${this.config.deployment_args.deployment_suffix}:${this.config.static_ports.cdk_erigon_rpc_start_port+1}`;
    
    return { http, ws };
  }
  
  // 获取主权合约设置地址
  public getSovereignContractSetupAddresses(): SovereignContractSetupAddresses {
    const serviceName = "contracts" + this.config.deployment_args.deployment_suffix;
    const result = execSync(`docker exec ${serviceName} /bin/sh -c "cat /opt/zkevm-contracts/sovereign-rollup-out.json"`).toString();
    const sovereignRollupOut = JSON.parse(result);
    const sovereignContractSetupAddresses: SovereignContractSetupAddresses = {
      sovereign_ger_proxy_addr: sovereignRollupOut.ger_proxy_addr,
      sovereign_bridge_proxy_addr: sovereignRollupOut.bridge_proxy_addr,
      sovereign_rollup_addr: sovereignRollupOut.sovereignRollupContract,
      zkevm_rollup_chain_id: sovereignRollupOut.rollupChainID,
    };
    return sovereignContractSetupAddresses;
  }
  
  // 获取op-succinct环境变量
  public getOpSuccinctEnvVars(): OpSuccinctEnvVars {
    const serviceName = "op-succinct-contract-deployer" + this.config.deployment_args.deployment_suffix;
    const result = execSync(`docker exec ${serviceName} /bin/sh -c "cat /opt/op-succinct/op-succinct-env-vars.json"`).toString();
    const opSuccinctEnv = JSON.parse(result);
    const opSuccinctEnvVars: OpSuccinctEnvVars = {
      submission_interval: opSuccinctEnv.SUBMISSION_INTERVAL,
      mock_verifier_address: opSuccinctEnv.VERIFIER_ADDRESS,
      l2oo_address: opSuccinctEnv.L2OO_ADDRESS,
      op_succinct_mock: opSuccinctEnv.OP_SUCCINCT_MOCK,
      op_succinct_agglayer: opSuccinctEnv.OP_SUCCINCT_AGGLAYER,
      l1_preallocated_mnemonic: opSuccinctEnv.PRIVATE_KEY,
      sp1_verifier_gateway_address: opSuccinctEnv.SP1VERIFIERGATEWAY,
      sp1_verifier_address: opSuccinctEnv.SP1VERIFIER,
    };
    return opSuccinctEnvVars;
  }
  
  // 获取L1 OP合约地址
  public getL1OpContractAddresses(): Record<string, string> {
    const proposerAddress = this.readL1OpContractAddress('proposer');
    const batcherAddress = this.readL1OpContractAddress('batcher');
    const sequencerAddress = this.readL1OpContractAddress('sequencer');
    const challengerAddress = this.readL1OpContractAddress('challenger');
    const proxyAdminAddress = this.readL1OpContractAddress('l1ProxyAdmin');
    
    return {
      op_proposer_address: proposerAddress,
      op_batcher_address: batcherAddress,
      op_sequencer_address: sequencerAddress,
      op_challenger_address: challengerAddress,
      op_proxy_admin_address: proxyAdminAddress,
    };
  }
  // 读取L1 OP合约地址
  private readL1OpContractAddress(key: string): string {
    const serviceName = "contracts" + this.config.deployment_args.deployment_suffix;
    const result = execSync(`docker exec ${serviceName} /bin/sh -c "cat /opt/config/${key}-${this.config.deployment_args.zkevm_rollup_chain_id}.json"`).toString();
    const resultJson = JSON.parse(result);
    return resultJson.address;
  }
}
    

    


