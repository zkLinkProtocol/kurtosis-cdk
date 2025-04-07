import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types';
import { ComposeGenerator } from '../compose/generator';
import { existsSync, mkdirSync, readFileSync, writeFileSync, accessSync, unlinkSync } from 'fs';
import { constants } from 'fs';
import * as TOML from '@iarna/toml';
import { GoTemplateParser, detectFileFormat, FileFormat } from '../utils/template-parser';

// 路径管理类
export class PathManager {
  private readonly projectRoot: string;
  private readonly deploymentDir: string;
  private readonly buildDir: string;
  private readonly dataDir: string;
  private readonly templatesDir: string;

  constructor() {
    // deployment 目录
    this.deploymentDir = process.cwd();
    // 项目根目录
    this.projectRoot = path.dirname(this.deploymentDir);
    // build 目录
    this.buildDir = path.join(this.deploymentDir, 'build');
    // data 目录
    this.dataDir = path.join(this.deploymentDir, 'data');
    // templates 目录
    this.templatesDir = path.join(this.projectRoot, 'templates');

    // 确保必要的目录存在
    this.ensureDirectoryExists(this.buildDir);
    this.ensureDirectoryExists(this.dataDir);
  }

  // 获取构建目录路径
  public getBuildDir(): string {
    return this.buildDir;
  }

  // 获取数据目录路径
  public getDataDir(): string {
    return this.dataDir;
  }

  // 获取模板目录路径
  public getTemplatesDir(): string {
    return this.templatesDir;
  }

  // 获取部署目录路径
  public getDeploymentDir(): string {
    return this.deploymentDir;
  }

  // 获取项目根目录路径
  public getProjectRoot(): string {
    return this.projectRoot;
  }

  // 获取构建文件路径
  public getBuildPath(filename: string): string {
    return path.join(this.buildDir, filename);
  }

  // 获取模板文件路径
  public getTemplatePath(templatePath: string): string {
    return path.join(this.templatesDir, templatePath);
  }

  // 确保目录存在
  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export abstract class BaseDeployer {
  protected config: DeploymentConfig;
  protected logger: Logger;
  protected pathManager: PathManager;
  protected composeGenerator: ComposeGenerator;

  constructor(config: DeploymentConfig, logger: Logger) {
    // 初始化默认数据库配置
    const defaultDbConfig = {
      master_db: 'master',
      master_user: 'master_user',
      master_password: 'master_password',
      port: 5432,
      use_remote: false,
      host: '127.0.0.1',
      
      // 中心环境数据库配置
      aggregator_db: {
        name: 'aggregator_db',
        user: 'aggregator_user',
        password: 'redacted'
      },
      aggregator_syncer_db: {
        name: 'aggregator_syncer_db',
        user: 'aggregator_syncer_db_user',
        password: 'redacted'
      },
      bridge_db: {
        name: 'bridge_db',
        user: 'bridge_user',
        password: 'redacted'
      },
      dac_db: {
        name: 'dac_db',
        user: 'dac_user',
        password: 'redacted'
      },
      sovereign_bridge_db: {
        name: 'sovereign_bridge_db',
        user: 'sovereign_bridge_user',
        password: 'redacted'
      },

      // Prover数据库配置
      prover_db: {
        name: 'prover_db',
        user: 'prover_user',
        password: 'redacted'
      },

      // zkEVM节点数据库配置
      event_db: {
        name: 'event_db',
        user: 'event_user',
        password: 'redacted'
      },
      pool_db: {
        name: 'pool_db',
        user: 'pool_user',
        password: 'redacted'
      },
      state_db: {
        name: 'state_db',
        user: 'state_user',
        password: 'redacted'
      },

      // CDK Erigon数据库配置
      pool_manager_db: {
        name: 'pool_manager_db',
        user: 'pool_manager_user',
        password: 'redacted'
      }
    };

    // 合并用户配置和默认配置
    config.database = {
      ...defaultDbConfig,
      ...config.database
    };

    this.config = config;
    this.logger = logger;
    this.pathManager = new PathManager();
    this.composeGenerator = new ComposeGenerator(
      {
        // 基础配置
        buildDir: this.pathManager.getBuildDir(),
        dataDir: this.pathManager.getDataDir(),
        network: 'zklink-network',
        
        // L1配置
        l1RpcUrl: config.l1_rpc_url || '',
        l1WsUrl: config.l1_ws_url || '',
        l1ExplorerUrl: config.l1_explorer_url || '',
        l1ChainId: config.l1_chain_id || 1337,
        
        // ZKEVM配置
        zkevmRollupChainId: config.zkevm_rollup_chain_id || 1001,
        zkevmRollupId: config.zkevm_rollup_id || 1,
        
        // 账户配置
        zkevmL2AdminAddress: config.accounts?.zkevm_l2_admin_address || '',
        zkevmL2AdminPrivateKey: config.accounts?.zkevm_l2_admin_private_key || '',
        zkevmL2SequencerAddress: config.accounts?.zkevm_l2_sequencer_address || '',
        zkevmL2SequencerPrivateKey: config.accounts?.zkevm_l2_sequencer_private_key || '',
        zkevmL2AggregatorAddress: config.accounts?.zkevm_l2_aggregator_address || '',
        zkevmL2AggregatorPrivateKey: config.accounts?.zkevm_l2_aggregator_private_key || '',
        
        // 数据库配置
        postgresDb: config.database?.master_db || 'zkevm_db',
        postgresUser: config.database?.master_user || 'postgres',
        postgresPassword: config.database?.master_password || 'postgres',
        postgresPort: config.database?.port || 5432,
        
        // Blockscout配置
        bsPostgresDb: config.blockscout_params?.database?.name || 'blockscout',
        bsPostgresUser: config.blockscout_params?.database?.user || 'postgres',
        bsPostgresPassword: config.blockscout_params?.database?.password || 'postgres',
        bsPostgresPort: config.blockscout_params?.database?.port || 5433,
        bsBackendPort: config.blockscout_params?.backend_port || 4004,
        
        // Grafana配置
        grafanaAdminUser: 'admin',
        grafanaAdminPassword: 'admin',
        grafanaPort: 3000,
        
        // Prometheus配置
        prometheusPort: config.ports?.prometheus_port || 9090,
        
        // 服务端口配置
        zkevmExecutorPort: config.prover?.prover_config?.executor_port || 50071,
        zkevmHashDbPort: config.prover?.prover_config?.hash_db_port || 50061,
        zkevmDataStreamerPort: config.ports?.zkevm_data_streamer_port || 6900,
        zkevmPprofPort: config.ports?.zkevm_pprof_port || 6060,
        zkevmRpcHttpPort: config.ports?.zkevm_rpc_http_port || 8123,
        zkevmRpcWsPort: config.ports?.zkevm_rpc_ws_port || 8133,
        zkevmPoolManagerPort: config.ports?.zkevm_pool_manager_port || 8545,
        zkevmCdkNodePort: config.ports?.zkevm_cdk_node_port || 5576,
        zkevmAggregatorPort: config.ports?.zkevm_aggregator_port || 50081,
        zkevmDacPort: config.ports?.zkevm_dac_port || 8484,
        zkevmBridgeGrpcPort: config.ports?.zkevm_bridge_grpc_port || 9090,
        zkevmBridgeMetricsPort: config.ports?.zkevm_bridge_metrics_port || 8090,
        zkevmBridgeRpcPort: config.ports?.zkevm_bridge_rpc_port || 8080,
        zkevmBridgeUiPort: config.ports?.zkevm_bridge_ui_port || 80,
        
        // Agglayer配置
        agglayerImage: config.images?.agglayer_image || '',
        agglayerProverPort: config.ports?.agglayer_prover_port || 50082,
        agglayerProverMetricsPort: config.ports?.agglayer_prover_metrics_port || 8091,
        agglayerReadrpcPort: config.ports?.agglayer_readrpc_port || 8124,
        agglayerGrpcPort: config.ports?.agglayer_grpc_port || 9091,
        agglayerAdminPort: config.ports?.agglayer_admin_port || 8546,
        agglayerMetricsPort: config.ports?.agglayer_metrics_port || 8092,
        agglayerKeystore: '',
        agglayerProverPrimaryProver: 'mock-prover',
        
        // 镜像配置
        zkevmContractsImage: config.images?.zkevm_contracts_image || '',
        zkevmProverImage: config.images?.zkevm_prover_image || '',
        cdkErigonNodeImage: config.images?.cdk_erigon_node_image || '',
        zkevmPoolManagerImage: config.images?.zkevm_pool_manager_image || '',
        cdkNodeImage: config.images?.cdk_node_image || '',
        zkevmDaImage: config.images?.zkevm_da_image || '',
        zkevmBridgeServiceImage: config.images?.zkevm_bridge_service_image || '',
        zkevmBridgeUiImage: config.images?.zkevm_bridge_ui_image || ''
      },
      this.pathManager.getTemplatesDir(),
      this.pathManager.getBuildDir()
    );
  }

  /**
   * 启动指定阶段的服务
   */
  protected async startServices(stage: 'contracts' | 'db' | 'core' | 'node' | 'bridge' | 'monitoring' | 'all'): Promise<void> {
    this.logger.info(`启动${stage}阶段服务...`);
    
    // 生成compose文件
    await this.composeGenerator.generateByStage(stage);
    
    // 启动服务
    const composeFile = stage === 'all' ? 'docker-compose.yml' : `docker-compose-${stage}.yml`;
    execSync(`docker compose -f ${this.pathManager.getBuildPath(composeFile)} up -d`, {
      stdio: 'inherit'
    });
  }

  /**
   * 停止指定阶段的服务
   */
  protected async stopServices(stage: 'contracts' | 'db' | 'core' | 'node' | 'bridge' | 'monitoring' | 'all'): Promise<void> {
    this.logger.info(`停止${stage}阶段服务...`);
    
    const composeFile = stage === 'all' ? 'docker-compose.yml' : `docker-compose-${stage}.yml`;
    execSync(`docker compose -f ${this.pathManager.getBuildPath(composeFile)} down`, {
      stdio: 'inherit'
    });
  }

  /**
   * 等待服务健康检查通过
   */
  protected async waitForHealthy(stage: 'contracts' | 'db' | 'core' | 'node' | 'bridge' | 'monitoring' | 'all'): Promise<void> {
    this.logger.info(`等待${stage}阶段服务就绪...`);
    
    const composeFile = stage === 'all' ? 'docker-compose.yml' : `docker-compose-${stage}.yml`;
    let retries = 30;
    
    while (retries > 0) {
      try {
        // 获取服务列表
        const serviceListCmd = `docker compose -f ${this.pathManager.getBuildPath(composeFile)} ps -q`;
        const serviceIds = execSync(serviceListCmd, { encoding: 'utf-8' })
          .split('\n')
          .filter(Boolean);
        
        if (serviceIds.length === 0) {
          this.logger.warn(`没有找到${stage}阶段的服务`);
          return;
        }
        
        // 检查每个服务的健康状态
        let allHealthy = true;
        for (const serviceId of serviceIds) {
          const healthCmd = `docker inspect --format="{{.State.Health.Status}}" ${serviceId}`;
          try {
            const healthStatus = execSync(healthCmd, { encoding: 'utf-8' }).trim();
            
            if (healthStatus !== 'healthy') {
              allHealthy = false;
              break;
            }
          } catch (error) {
            // 如果服务没有健康检查，则跳过
            continue;
          }
        }
        
        if (allHealthy) {
          this.logger.info(`${stage}阶段服务已就绪`);
          return;
        }
      } catch (error) {
        // 忽略错误,继续重试
        this.logger.debug(`等待服务就绪时发生错误: ${error}`);
      }
      
      retries--;
      if (retries === 0) {
        this.logger.warn(`${stage}阶段服务未能在指定时间内就绪，但将继续执行后续步骤`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * 读取模板文件
   */
  protected readTemplate(templatePath: string): string {
    return readFileSync(this.pathManager.getTemplatePath(templatePath), 'utf8');
  }

  /**
   * 写入配置文件
   */
  protected writeConfig(filename: string, content: string): void {
    const filePath = this.pathManager.getBuildPath(filename);
    try {
      // 检查目录是否存在
      const dir = path.dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 检查目录权限
      try {
        accessSync(dir, constants.W_OK);
      } catch (error: any) {
        throw new Error(`目录 ${dir} 没有写入权限: ${error.message}`);
      }

      // 如果文件已存在，先删除它
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }

      // 写入文件
      writeFileSync(filePath, content);
      
      // 检查文件是否成功创建
      if (!existsSync(filePath)) {
        throw new Error(`配置文件 ${filename} 创建失败`);
      }

      // 检查文件内容
      const writtenContent = readFileSync(filePath, 'utf8');
      if (writtenContent !== content) {
        throw new Error(`配置文件 ${filename} 内容验证失败`);
      }
      
      this.logger.info(`配置文件 ${filename} 已生成: ${filePath}`);
    } catch (error: any) {
      const errorMessage = `写入配置文件 ${filename} 失败:\n` +
        `路径: ${filePath}\n` +
        `错误: ${error.message}\n` +
        `堆栈: ${error.stack}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 渲染模板
   * @param templatePath 模板文件路径
   * @param data 模板数据
   */
  protected renderTemplate(templatePath: string, data: any): string {
    this.logger.info(`开始渲染模板: ${templatePath}`);
    
    try {
      // 读取模板文件
      const template = this.readTemplate(templatePath);
      this.logger.debug(`模板内容长度: ${template.length} 字符`);
      
      // 检测文件格式
      const format = detectFileFormat(templatePath, template);
      this.logger.info(`检测到文件格式: ${format}`);
      
      if (format === FileFormat.UNKNOWN) {
        this.logger.warn('无法确定模板格式，将按普通文本处理');
      }
      
      // 记录模板数据的关键字段
      this.logger.debug('模板数据包含以下字段:', Object.keys(data));
      
      // 创建解析器并解析模板
      const parser = new GoTemplateParser(template, data, format, this.logger);
      
      try {
        const result = parser.parse();
        this.logger.info(`模板 ${templatePath} 渲染完成`);
        this.logger.debug(`渲染结果长度: ${result.length} 字符`);
        return result;
      } catch (parseError: any) {
        this.logger.error(`模板 ${templatePath} 渲染失败:`, parseError);
        this.logger.error(`错误发生在处理以下数据时:`, JSON.stringify(data, null, 2));
        throw parseError;
      }
    } catch (error: any) {
      this.logger.error(`模板 ${templatePath} 处理失败:`, error);
      throw error;
    }
  }
} 