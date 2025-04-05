import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types';
import { ComposeGenerator } from '../compose/generator';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

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
  protected readonly config: DeploymentConfig;
  protected readonly logger: Logger;
  protected readonly pathManager: PathManager;
  protected readonly composeGenerator: ComposeGenerator;

  constructor(config: DeploymentConfig, logger: Logger) {
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
    writeFileSync(this.pathManager.getBuildPath(filename), content);
  }

  /**
   * 渲染模板
   */
  protected renderTemplate(template: string, data: any): string {
    // 支持 ${key} 格式
    let result = template.replace(/\${(\w+)}/g, (match, key) => {
      return data[key] !== undefined ? data[key].toString() : match;
    });

    // 支持 {{key}} 格式
    result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });

    return result;
  }
} 