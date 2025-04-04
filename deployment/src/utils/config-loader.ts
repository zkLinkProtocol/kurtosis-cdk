import { DeploymentConfig } from '../types/config';
import { DeploymentStages } from '../types/stages';
import { readFileSync } from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';

// 默认配置(从 input_parser.star)
const DEFAULT_CONFIG: DeploymentConfig = {
  deployment_suffix: '-001',
  verbosity: 'info',
  global_log_level: 'info',
  // ... 其他默认配置项
};

const DEFAULT_STAGES: DeploymentStages = {
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
};

export class ConfigLoader {
  /**
   * 加载配置文件并与默认配置合并
   * @param configPath 配置文件路径
   * @returns 合并后的配置
   */
  public static load(configPath?: string): { config: DeploymentConfig; stages: DeploymentStages } {
    let customConfig: Partial<DeploymentConfig> = {};
    let customStages: Partial<DeploymentStages> = {};

    if (configPath) {
      try {
        const configFile = readFileSync(configPath, 'utf8');
        const parsed = yaml.load(configFile) as any;

        if (parsed.deployment_stages) {
          customStages = parsed.deployment_stages;
        }

        if (parsed.args) {
          customConfig = parsed.args;
        }
      } catch (error) {
        throw new Error(`加载配置文件失败: ${error.message}`);
      }
    }

    // 合并配置
    const config = this.mergeConfigs(DEFAULT_CONFIG, customConfig);
    const stages = { ...DEFAULT_STAGES, ...customStages };

    // 验证配置
    this.validateConfig(config);

    return { config, stages };
  }

  /**
   * 合并默认配置和自定义配置
   */
  private static mergeConfigs(defaultConfig: DeploymentConfig, customConfig: Partial<DeploymentConfig>): DeploymentConfig {
    const merged = { ...defaultConfig };

    // 递归合并对象
    for (const [key, value] of Object.entries(customConfig)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = this.mergeConfigs(merged[key] || {}, value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  /**
   * 验证配置是否有效
   */
  private static validateConfig(config: DeploymentConfig): void {
    // 验证必需的配置项
    const requiredFields = [
      'deployment_suffix',
      'verbosity',
      'global_log_level',
      'sequencer_type'
    ];

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`缺少必需的配置项: ${field}`);
      }
    }

    // 验证数据库配置(如果存在)
    if (config.database) {
      const { database } = config;
      if (database.use_remote) {
        if (!database.host || !database.port || !database.master_db || 
            !database.master_user || !database.master_password) {
          throw new Error('远程数据库配置不完整');
        }
      }
    }

    // 验证 sequencer 类型
    if (!['erigon', 'zkevm'].includes(config.sequencer_type)) {
      throw new Error(`不支持的 sequencer 类型: ${config.sequencer_type}`);
    }
  }
} 