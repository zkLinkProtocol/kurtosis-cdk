import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { 
  DeploymentConfig, 
  DeploymentStages,
  DeploymentArgs,
  OpStackArgs,
  DatabaseConfig,
  OptimismPackage
} from '../types/config';

export class ConfigLoader {
  private readonly config: DeploymentConfig;

  constructor(defaultConfigPath: string, customConfigPath?: string) {
    // 加载默认配置
    if (!fs.existsSync(defaultConfigPath)) {
      throw new Error(`Default config file not found: ${defaultConfigPath}`);
    }
    const defaultConfig = this.loadYamlFile(defaultConfigPath);
    
    // 如果存在自定义配置，则加载并合并
    let customConfig = {};
    if (customConfigPath) {
      if (!fs.existsSync(customConfigPath)) {
        throw new Error(`Custom config file not found: ${customConfigPath}`);
      }
      customConfig = this.loadYamlFile(customConfigPath);
    }

    // 合并配置
    this.config = this.mergeConfigs(defaultConfig, customConfig);
    
    // 验证配置
    this.validateConfig(this.config);
  }

  /**
   * 获取配置
   * @returns DeploymentConfig
   */
  public getConfig(): DeploymentConfig {
    return this.config;
  }

  /**
   * 加载YAML文件
   * @param filePath YAML文件路径
   * @returns 解析后的对象
   */
  private loadYamlFile(filePath: string): any {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return yaml.load(fileContent);
    } catch (err) {
      throw new Error(`Failed to load config file ${filePath}: ${(err as Error).message}`);
    }
  }

  /**
   * 深度合并对象
   * @param target 目标对象
   * @param source 源对象
   * @returns 合并后的对象
   */
  private deepMerge(target: Record<string, any>, source?: Record<string, any>): Record<string, any> {
    if (!source) {
      return target;
    }

    const merged = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = target[key];

        if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
          // 如果是对象，递归合并
          merged[key] = this.deepMerge(
            targetValue || {},
            sourceValue
          );
        } else {
          // 如果是基本类型或数组，直接替换
          merged[key] = sourceValue;
        }
      }
    }

    return merged;
  }

  /**
   * 合并配置对象
   * @param defaultConfig 默认配置
   * @param customConfig 自定义配置
   * @returns 合并后的配置
   */
  private mergeConfigs(defaultConfig: any, customConfig: any): DeploymentConfig {
    // 1. 合并deployment_stages
    const deployment_stages = this.deepMerge(
      defaultConfig.deployment_stages,
      customConfig.deployment_stages
    ) as DeploymentStages;

    // 2. 合并deployment_args
    // 首先合并所有默认配置
    const baseDeploymentArgs = {
      ...defaultConfig.default_args,
      ...defaultConfig.default_accounts,
      ...defaultConfig.default_ports,
      ...defaultConfig.default_images,
      ...defaultConfig.default_l1_args,
      ...defaultConfig.default_l2_args,
      ...defaultConfig.default_rollup_args,
      ...defaultConfig.default_pless_zkevm_node_args,
      ...defaultConfig.default_additional_services_args,
      deploy_prover: defaultConfig.default_prover?.deploy_prover ?? true,
    };

    // 然后与自定义配置合并
    const deployment_args = this.deepMerge(
      baseDeploymentArgs,
      customConfig.deployment_args
    ) as DeploymentArgs;

    // 3. 合并optimism_package和构建op_stack_args
    const optimismPackage = this.deepMerge(
      defaultConfig.optimism_package,
      customConfig.optimism_package
    ) as OptimismPackage;

    const op_stack_args: OpStackArgs = {
      source: optimismPackage.source,
      predeployed_contracts: optimismPackage.predeployed_contracts,
      optimism_package: optimismPackage,
      external_l1_network_params: {
        network_id: deployment_args.l1_chain_id.toString(),
        rpc_kind: 'standard',
        el_rpc_url: deployment_args.l1_rpc_url,
        el_ws_url: deployment_args.l1_ws_url,
        cl_rpc_url: deployment_args.l1_beacon_url,
        priv_key: '' // 这个值需要在运行时通过助记词生成
      }
    };

    // 4. 合并database配置
    const database = this.deepMerge(
      defaultConfig.database,
      customConfig.database
    ) as DatabaseConfig;

    // 返回最终的配置对象
    return {
      deployment_stages,
      deployment_args,
      database,
      op_stack_args
    };
  }

  /**
   * 验证配置是否有效
   * @param config 配置对象
   * @throws 如果配置无效
   */
  private validateConfig(config: DeploymentConfig): void {
    // 检查必需的配置部分是否存在
    if (!config.deployment_stages) {
      throw new Error('Missing required configuration: deployment_stages');
    }
    if (!config.deployment_args) {
      throw new Error('Missing required configuration: deployment_args');
    }
    if (!config.database) {
      throw new Error('Missing required configuration: database');
    }
    if (!config.op_stack_args) {
      throw new Error('Missing required configuration: op_stack_args');
    }

    // 验证deployment_stages中的必需字段
    const requiredStages: Array<keyof DeploymentStages> = [
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
      'deploy_l2_contracts',
      'deploy_prover'
    ];

    for (const stage of requiredStages) {
      if (typeof config.deployment_stages[stage] !== 'boolean') {
        throw new Error(`Invalid or missing deployment stage: ${stage}`);
      }
    }

    // 验证sequencer_type的值
    if (!['erigon', 'zkevm'].includes(config.deployment_args.sequencer_type)) {
      throw new Error('Invalid sequencer_type. Must be either "erigon" or "zkevm"');
    }

    // 验证consensus_contract_type的值
    if (!['rollup', 'cdk-validium', 'pessimistic'].includes(config.deployment_args.consensus_contract_type)) {
      throw new Error('Invalid consensus_contract_type. Must be one of "rollup", "cdk-validium", or "pessimistic"');
    }
  }
}

// Example usage:
// const configLoader = new ConfigLoader('/path/to/default-config.yml', '/path/to/custom-config.yml');
