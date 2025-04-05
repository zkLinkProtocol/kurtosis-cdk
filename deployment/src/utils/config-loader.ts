import { DeploymentConfig } from '../types/config';
import { DeploymentStages } from '../types/stages';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';

// 默认部署阶段配置
const DEFAULT_STAGES = {
  deploy_l1: true,
  deploy_zkevm_contracts_on_l1: true,
  deploy_databases: true,
  deploy_cdk_central_environment: true,
  deploy_cdk_bridge_infra: true,
  deploy_cdk_bridge_ui: true,
  deploy_agglayer: true,
  deploy_cdk_erigon_node: true,
  deploy_optimism_rollup: false,
  deploy_op_succinct: false,
  deploy_l2_contracts: false
} as const;

// 默认配置
const DEFAULT_CONFIG: Partial<DeploymentConfig> = {
  deployment_suffix: '-001',
  verbosity: 'info',
  global_log_level: 'info',
  deployment_stages: DEFAULT_STAGES,
  sequencer_type: 'zkevm',
  consensus_contract_type: 'rollup',
  additional_services: [],
  l1_chain_id: 1337,
  l1_engine: 'geth',
  chain_name: 'zklink-test',
  zkevm_rollup_chain_id: 1001,
  images: {} as DeploymentConfig['images'],
  ports: {} as DeploymentConfig['ports'],
  accounts: {} as DeploymentConfig['accounts']
};

export class ConfigLoader {
  /**
   * 加载配置文件并与默认配置合并
   * @param configPath 配置文件路径
   * @returns 合并后的配置
   */
  public static load(configPath: string): DeploymentConfig {
    try {
      const configFile = readFileSync(configPath, 'utf8');
      const loadedConfig = yaml.load(configFile) as any;
      
      // 合并默认配置和 args 中的配置
      const config = {
        ...DEFAULT_CONFIG,
        ...(loadedConfig.args || {}),  // 展开 args 中的所有配置
        deployment_stages: {
          ...DEFAULT_STAGES,
          ...(loadedConfig.deployment_stages || {}),
          // 强制设置 L2 相关的部署阶段为 false
          deploy_l2_contracts: false,
          deploy_zkevm_contracts_on_l1: false
        },
        database: loadedConfig.database,
        prover: loadedConfig.prover,
        optimism_package: loadedConfig.optimism_package,
        static_ports: loadedConfig.static_ports,
        // 确保 ports 字段被正确初始化
        ports: {
          ...(loadedConfig.args?.ports || {})
        },
        // 确保 images 字段被正确初始化
        images: {
          ...(loadedConfig.args?.images || {})
        }
      } as DeploymentConfig;

      // 单独处理账户配置
      config.accounts = {
        zkevm_l2_sequencer_address: loadedConfig.args?.zkevm_l2_sequencer_address || '',
        zkevm_l2_sequencer_private_key: loadedConfig.args?.zkevm_l2_sequencer_private_key || '',
        zkevm_l2_aggregator_address: loadedConfig.args?.zkevm_l2_aggregator_address || '',
        zkevm_l2_aggregator_private_key: loadedConfig.args?.zkevm_l2_aggregator_private_key || '',
        zkevm_l2_admin_address: loadedConfig.args?.zkevm_l2_admin_address || '',
        zkevm_l2_admin_private_key: loadedConfig.args?.zkevm_l2_admin_private_key || '',
        zkevm_l2_claimtxmanager_address: loadedConfig.args?.zkevm_l2_claimtxmanager_address || '',
        zkevm_l2_claimtxmanager_private_key: loadedConfig.args?.zkevm_l2_claimtxmanager_private_key || '',
        zkevm_l2_timelock_address: loadedConfig.args?.zkevm_l2_timelock_address || '',
        zkevm_l2_timelock_private_key: loadedConfig.args?.zkevm_l2_timelock_private_key || '',
        zkevm_l2_loadtest_address: loadedConfig.args?.zkevm_l2_loadtest_address || '',
        zkevm_l2_loadtest_private_key: loadedConfig.args?.zkevm_l2_loadtest_private_key || '',
        zkevm_l2_agglayer_address: loadedConfig.args?.zkevm_l2_agglayer_address || '',
        zkevm_l2_agglayer_private_key: loadedConfig.args?.zkevm_l2_agglayer_private_key || '',
        zkevm_l2_dac_address: loadedConfig.args?.zkevm_l2_dac_address || '',
        zkevm_l2_dac_private_key: loadedConfig.args?.zkevm_l2_dac_private_key || '',
        zkevm_l2_proofsigner_address: loadedConfig.args?.zkevm_l2_proofsigner_address || '',
        zkevm_l2_proofsigner_private_key: loadedConfig.args?.zkevm_l2_proofsigner_private_key || '',
        zkevm_l2_l1testing_address: loadedConfig.args?.zkevm_l2_l1testing_address || '',
        zkevm_l2_l1testing_private_key: loadedConfig.args?.zkevm_l2_l1testing_private_key || '',
        zkevm_l2_claimsponsor_address: loadedConfig.args?.zkevm_l2_claimsponsor_address || '',
        zkevm_l2_claimsponsor_private_key: loadedConfig.args?.zkevm_l2_claimsponsor_private_key || '',
        zkevm_l2_aggoracle_address: loadedConfig.args?.zkevm_l2_aggoracle_address || '',
        zkevm_l2_aggoracle_private_key: loadedConfig.args?.zkevm_l2_aggoracle_private_key || '',
        zkevm_l2_sovereignadmin_address: loadedConfig.args?.zkevm_l2_sovereignadmin_address || '',
        zkevm_l2_sovereignadmin_private_key: loadedConfig.args?.zkevm_l2_sovereignadmin_private_key || '',
        zkevm_l2_claimtx_address: loadedConfig.args?.zkevm_l2_claimtx_address || '',
        zkevm_l2_claimtx_private_key: loadedConfig.args?.zkevm_l2_claimtx_private_key || ''
      };

      // 验证配置
      this.validateConfig(config);
      
      return config;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`加载配置文件失败: ${error.message}`);
      }
      throw new Error('加载配置文件时发生未知错误');
    }
  }

  private static validateConfig(config: DeploymentConfig): void {
    // 验证必需的配置项
    this.validateRequiredFields(config);
    
    // 验证端口配置
    this.validatePorts(config);
    
    // 验证镜像配置
    this.validateImages(config);
    
    // 验证部署阶段配置
    this.validateDeploymentStages(config);

    // 验证账户配置
    this.validateAccounts(config);
  }

  private static validateRequiredFields(config: DeploymentConfig): void {
    const requiredFields = [
      'deployment_suffix',
      'verbosity',
      'global_log_level',
      'sequencer_type',
      'consensus_contract_type',
      'l1_chain_id',
      'l1_engine',
      'chain_name',
      'zkevm_rollup_chain_id'
    ] as const;

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必需的配置项: ${field}`);
      }
    }

    // 验证枚举值
    if (!['erigon', 'zkevm'].includes(config.sequencer_type)) {
      throw new Error(`不支持的 sequencer 类型: ${config.sequencer_type}`);
    }

    if (!['rollup', 'cdk-validium', 'pessimistic'].includes(config.consensus_contract_type)) {
      throw new Error(`不支持的共识合约类型: ${config.consensus_contract_type}`);
    }

    if (!['geth', 'anvil'].includes(config.l1_engine)) {
      throw new Error(`不支持的 L1 引擎类型: ${config.l1_engine}`);
    }
  }

  private static validatePorts(config: DeploymentConfig): void {
    const { ports, static_ports } = config;

    // 验证动态端口
    if (ports) {
      Object.entries(ports).forEach(([key, value]) => {
        if (typeof value !== 'number' || value < 1024 || value > 65535) {
          throw new Error(`无效的端口配置: ${key} = ${value}`);
        }
      });
    }

    // 验证静态端口
    if (static_ports) {
      Object.entries(static_ports).forEach(([key, value]) => {
        if (typeof value !== 'number' || value < 1024 || value > 65535) {
          throw new Error(`无效的静态端口配置: ${key} = ${value}`);
        }
      });
    }
  }

  private static validateImages(config: DeploymentConfig): void {
    if (!config.images) {
      throw new Error('缺少镜像配置');
    }

    Object.entries(config.images).forEach(([key, value]) => {
      if (!value || typeof value !== 'string') {
        throw new Error(`无效的镜像配置: ${key}`);
      }
    });
  }

  private static validateDeploymentStages(config: DeploymentConfig): void {
    if (!config.deployment_stages) {
      throw new Error('缺少部署阶段配置');
    }

    const requiredStages = [
      'deploy_l1',
      'deploy_zkevm_contracts_on_l1',
      'deploy_databases',
      'deploy_cdk_central_environment',
      'deploy_cdk_bridge_infra',
      'deploy_cdk_bridge_ui',
      'deploy_agglayer',
      'deploy_cdk_erigon_node',
      'deploy_optimism_rollup',
      'deploy_op_succinct',
      'deploy_l2_contracts'
    ] as const;

    for (const stage of requiredStages) {
      if (typeof config.deployment_stages[stage] !== 'boolean') {
        throw new Error(`无效的部署阶段配置: ${stage}`);
      }
    }
  }

  private static validateAccounts(config: DeploymentConfig): void {
    if (!config.accounts) {
      config.accounts = {} as DeploymentConfig['accounts'];
    }

    // 只在需要部署 L2 相关内容时才验证账户
    if (config.deployment_stages.deploy_l2_contracts || 
        config.deployment_stages.deploy_zkevm_contracts_on_l1) {
      const requiredAccounts = [
        'zkevm_l2_sequencer_address',
        'zkevm_l2_sequencer_private_key',
        'zkevm_l2_aggregator_address',
        'zkevm_l2_aggregator_private_key',
        'zkevm_l2_admin_address',
        'zkevm_l2_admin_private_key'
      ] as const;

      for (const account of requiredAccounts) {
        if (!config.accounts[account]) {
          throw new Error(`缺少必需的账户配置: ${account}`);
        }
      }
    }
  }
} 