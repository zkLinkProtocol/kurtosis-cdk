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
    this.projectRoot = this.deploymentDir;
    // build 目录
    this.buildDir = path.join(this.deploymentDir, 'build');
    // data 目录
    this.dataDir = path.join(this.deploymentDir, 'data');
    // templates 目录
    this.templatesDir = path.join(this.deploymentDir, 'templates');

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
        l1RpcUrl: config.deployment_args.l1_rpc_url || '',
        l1WsUrl: config.deployment_args.l1_ws_url || '',
        l1ExplorerUrl: config.deployment_args.l1_explorer_url || '',
        l1ChainId: config.deployment_args.l1_chain_id || 1337,
        
        // ZKEVM配置
        zkevmRollupChainId: config.deployment_args.zkevm_rollup_chain_id || 1001,
        zkevmRollupId: config.deployment_args.zkevm_rollup_id || 1,
        
        // 账户配置
        zkevmL2AdminAddress: config.deployment_args.zkevm_l2_admin_address || '',
        zkevmL2AdminPrivateKey: config.deployment_args.zkevm_l2_admin_private_key || '',
        zkevmL2SequencerAddress: config.deployment_args.zkevm_l2_sequencer_address || '',
        zkevmL2SequencerPrivateKey: config.deployment_args.zkevm_l2_sequencer_private_key || '',
        zkevmL2AggregatorAddress: config.deployment_args.zkevm_l2_aggregator_address || '',
        zkevmL2AggregatorPrivateKey: config.deployment_args.zkevm_l2_aggregator_private_key || '',
        
        // 数据库配置
        postgresDb: config.database.postgres_master_db || 'zkevm_db',
        postgresUser: config.database.postgres_master_user || 'postgres',
        postgresPassword: config.database.postgres_master_password || 'postgres',
        postgresPort: config.database.postgres_port || 5432,
        
        // Blockscout配置
        bsPostgresDb: 'blockscout',
        bsPostgresUser: 'postgres',
        bsPostgresPassword: 'postgres',
        bsPostgresPort: 5433,
        bsBackendPort: 4004,
        
        // Grafana配置
        grafanaAdminUser: 'admin',
        grafanaAdminPassword: 'admin',
        grafanaPort: 3000,
        
        // Prometheus配置
        prometheusPort: 9090,
        
        // 服务端口配置
        zkevmExecutorPort: 50071,
        zkevmHashDbPort: 50061,
        zkevmDataStreamerPort: 6900,
        zkevmPprofPort: 6060,
        zkevmRpcHttpPort: config.deployment_args.zkevm_rpc_http_port || 8545,
        zkevmRpcWsPort: config.deployment_args.zkevm_rpc_ws_port || 8546,
        zkevmPoolManagerPort: 8545,
        zkevmCdkNodePort: 5576,
        zkevmAggregatorPort: 50081,
        zkevmDacPort: 8484,
        zkevmBridgeGrpcPort: 9090,
        zkevmBridgeMetricsPort: 8090,
        zkevmBridgeRpcPort: 8080,
        zkevmBridgeUiPort: 80,
        
        // Agglayer配置
        agglayerImage: '',
        agglayerProverPort: 50082,
        agglayerProverMetricsPort: 8091,
        agglayerReadrpcPort: 8124,
        agglayerGrpcPort: 9091,
        agglayerAdminPort: 8546,
        agglayerMetricsPort: 8092,
        agglayerKeystore: '',
        agglayerProverPrimaryProver: 'mock-prover',
        
        // 镜像配置
        zkevmContractsImage: '',
        zkevmProverImage: '',
        cdkErigonNodeImage: '',
        zkevmPoolManagerImage: '',
        cdkNodeImage: '',
        zkevmDaImage: '',
        zkevmBridgeServiceImage: '',
        zkevmBridgeUiImage: ''
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