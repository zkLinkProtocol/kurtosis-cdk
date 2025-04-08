import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { 
  DeploymentConfig, 
  DeploymentStages,
  DeploymentArgs,
  OpStackArgs,
  DatabaseConfig,
  OptimismPackage,
  StaticPorts
} from '../types/config';
import { PortConfig, PortSpec, sortPortConfigByValues } from '../types/ports';
import { LOG_LEVEL, SEQUENCER_TYPE, SUPPORTED_FORK_IDS } from '../types/constants';
import { ErigonDatabaseHelper, ZkEvmDatabaseHelper } from '../types/config';

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

    // 5. 合并static_ports配置
    const static_ports = defaultConfig.static_ports;

    // 6. 合并default_supported_fork_ids配置
    const default_supported_fork_ids = defaultConfig.default_supported_fork_ids;

    // 返回最终的配置对象
    return {
      deployment_stages,
      deployment_args,
      database,
      op_stack_args,
      static_ports,
      default_supported_fork_ids
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

  /**
   * 获取公共端口配置
   * 模仿 Starlark 代码的 get_public_ports 函数
   * @param portConfig 端口配置对象
   * @param startPortName 起始端口名称
   * @returns 公共端口配置
   */
  public get_public_ports(portConfig: PortConfig, startPortName: keyof StaticPorts): PortConfig {
    // 从配置中获取 static_ports
    const publicPortConfig = this.config.static_ports;
    if (!publicPortConfig || Object.keys(publicPortConfig).length === 0) {
      return {};
    }

    // 获取起始端口号
    const startPort = publicPortConfig[startPortName];
    if (!startPort) {
      return {};
    }

    // 创建新的公共端口配置
    const publicPorts: PortConfig = {};
    
    // 对端口配置进行排序
    const sortedPortConfig = sortPortConfigByValues(portConfig);
    
    // 为每个端口分配新的端口号
    sortedPortConfig.forEach(([key, port], index) => {
      const newPort: PortSpec = {
        number: startPort + index,
        application_protocol: port.application_protocol
        // 注意：根据原始代码的注释，我们不复制 transport_protocol
      };
      publicPorts[key] = newPort;
    });

    return publicPorts;
  }

  /**
   * 验证日志级别是否有效
   * @param name 日志级别名称
   * @param logLevel 日志级别值
   * @throws 如果日志级别无效
   */
  public validateLogLevel(name: string, logLevel: string): void {
    const validLevels = [
      LOG_LEVEL.ERROR,
      LOG_LEVEL.WARN,
      LOG_LEVEL.INFO,
      LOG_LEVEL.DEBUG,
      LOG_LEVEL.TRACE
    ];
    if (!validLevels.includes(logLevel as LOG_LEVEL)) {
      throw new Error(
        `Unsupported ${name}: '${logLevel}', please use ${validLevels.map(level => `'${level}'`).join(' or ')}`
      );
    }
  }

  /**
   * 从 zkevm 合约镜像名称中提取 fork 标识符和名称
   * @param zkevmContractsImage 合约镜像名称
   * @returns [fork_id, fork_name] 元组
   */
  public getForkId(zkevmContractsImage: string): [number, string] {
    const result = zkevmContractsImage.split("-patch.")[0].split("-fork.");
    if (result.length !== 2) {
      throw new Error(
        `The zkevm contracts image tag '${zkevmContractsImage}' does not follow the standard v<SEMVER>-rc.<RC_NUMBER>-fork.<FORK_ID>`
      );
    }

    const forkId = parseInt(result[1], 10);
    if (!SUPPORTED_FORK_IDS.includes(forkId as typeof SUPPORTED_FORK_IDS[number])) {
      throw new Error(`The fork id '${forkId}' is not supported by Kurtosis CDK`);
    }

    let forkName = "elderberry";
    if (forkId >= 12) {
      forkName = "banana";
    }
    // TODO: Add support for durian once released.

    return [forkId, forkName];
  }

  /**
   * 获取序列器名称
   * @param sequencerType 序列器类型
   * @returns 序列器名称
   */
  public getSequencerName(sequencerType: string): string {
    if (sequencerType === SEQUENCER_TYPE.CDK_ERIGON) {
      return "cdk-erigon-sequencer";
    } else if (sequencerType === SEQUENCER_TYPE.ZKEVM) {
      return "zkevm-node-sequencer";
    } else {
      throw new Error(
        `Unsupported sequencer type: '${sequencerType}', please use '${SEQUENCER_TYPE.CDK_ERIGON}' or '${SEQUENCER_TYPE.ZKEVM}'`
      );
    }
  }

  /**
   * 获取数据库配置
   * @param suffix 服务后缀
   * @param sequencerType 序列器类型
   * @returns 数据库配置对象
   */
  public getDbConfigs(suffix: string, sequencerType: string): Record<string, DatabaseConfig> {
    const { database } = this.config;
    let dbs: ErigonDatabaseHelper | ZkEvmDatabaseHelper;

    if (sequencerType === SEQUENCER_TYPE.CDK_ERIGON) {
      dbs = {
        central_env_dbs: database.central_env_dbs,
        prover_db: database.prover_db,
        cdk_erigon_dbs: database.cdk_erigon_dbs
      };
    } else if (sequencerType === SEQUENCER_TYPE.ZKEVM) {
      dbs = {
        central_env_dbs: database.central_env_dbs,
        prover_db: database.prover_db,
        zkevm_node_dbs: database.zkevm_node_dbs
      };
    } else {
      throw new Error(`未配置 ${sequencerType} 类型的数据库配置`);
    }

    // 为每个数据库配置添加主机名和端口
    const configs: Record<string, DatabaseConfig> = {};
    const flattenedDbs = {
      ...dbs.central_env_dbs,
      ...('cdk_erigon_dbs' in dbs ? dbs.cdk_erigon_dbs : {}),
      ...('zkevm_node_dbs' in dbs ? dbs.zkevm_node_dbs : {}),
      prover_db: dbs.prover_db
    };

    for (const [key, value] of Object.entries(flattenedDbs)) {
      configs[key] = {
        ...database,
        ...value,
        postgres_host: database.use_remote ? database.postgres_host : this.getServiceName(suffix)
      };
    }

    return configs;
  }

  /**
   * 获取服务名称
   * @param suffix 服务后缀
   * @returns 服务名称
   */
  private getServiceName(suffix: string): string {
    return `${this.config.deployment_args.chain_name}-${suffix}`;
  }
}

// Example usage:
// const configLoader = new ConfigLoader('/path/to/default-config.yml', '/path/to/custom-config.yml');
