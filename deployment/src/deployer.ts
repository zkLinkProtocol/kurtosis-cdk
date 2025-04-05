import { execSync } from 'child_process';
import { DeploymentConfig, DeploymentStages } from './types';
import { Logger } from './utils/logger';
import { ContractDeployer } from './services/contract-deployer';
import { DatabaseDeployer } from './services/database-deployer';
import { CentralEnvironmentDeployer } from './services/central-environment-deployer';
import { L2ContractDeployer } from './services/l2-contract-deployer';
import { AgglayerDeployer } from './services/agglayer-deployer';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import fs from 'fs';
import { DeploymentConfig as Config } from './types/config';
import { BaseDeployer, PathManager } from './services/base-deployer';

export class CDKDeployer {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly contractDeployer: ContractDeployer;
  private readonly databaseDeployer: DatabaseDeployer;
  private contractAddresses: any = {};
  private readonly pathManager: PathManager;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.contractDeployer = new ContractDeployer(this.config, this.logger);
    this.databaseDeployer = new DatabaseDeployer(this.config, this.logger);
    this.pathManager = new PathManager();
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署 CDK 环境...');

      // 部署 L1 环境
      if (this.config.deployment_stages.deploy_l1) {
        await this.deployL1Environment();
      }

      // 部署 L1 合约
      if (this.config.deployment_stages.deploy_zkevm_contracts_on_l1) {
        await this.deployZkEVMContracts();
        // 获取合约地址
        this.contractAddresses = await this.getContractAddresses();
      }

      // 部署数据库
      if (this.config.deployment_stages.deploy_databases) {
        await this.deployDatabases();
      }

      // 部署中心环境
      if (this.config.deployment_stages.deploy_cdk_central_environment) {
        await this.deployCDKCentralEnvironment();

        // 部署 L2 合约
        if (this.config.deployment_stages.deploy_l2_contracts) {
          const l2ContractDeployer = new L2ContractDeployer(this.config, this.logger);
          await l2ContractDeployer.deploy(true);
        }
      }

      // 部署 Agglayer
      if (this.config.deployment_stages.deploy_agglayer) {
        await this.deployAggLayer();
      }

      // 部署额外服务
      await this.deployAdditionalServices();

      this.logger.info('CDK 环境部署完成');
    } catch (error) {
      this.logger.error('部署失败:', error);
      throw error;
    }
  }

  private async deployL1Environment(): Promise<void> {
    this.logger.info('部署 L1 环境...');
    // TODO: 实现 L1 环境部署逻辑
  }

  private async deployZkEVMContracts(): Promise<void> {
    this.logger.info('开始部署 zkEVM 合约...');
    
    try {
      await this.contractDeployer.deploy();
      this.logger.info('zkEVM 合约部署完成');
    } catch (error) {
      this.logger.error('zkEVM 合约部署失败:', error);
      throw error;
    }
  }

  private async getContractAddresses(): Promise<any> {
    // 从合约部署服务中获取地址
    const contractsService = `contracts${this.config.deployment_suffix}`;
    const combinedJsonPath = '/opt/zkevm/combined.json';
    
    try {
      const result = execSync(`docker exec ${contractsService} cat ${combinedJsonPath}`);
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error('获取合约地址失败:', error);
      throw error;
    }
  }

  private async deployDatabases(): Promise<void> {
    this.logger.info('开始部署数据库服务...');
    
    try {
      await this.databaseDeployer.deploy();
      this.logger.info('数据库服务部署完成');
    } catch (error) {
      this.logger.error('数据库部署失败:', error);
      throw error;
    }
  }

  private async deployCDKCentralEnvironment(): Promise<void> {
    this.logger.info('开始部署 CDK 中心环境...');
    
    try {
      const centralEnvDeployer = new CentralEnvironmentDeployer(
        this.config,
        this.logger,
        this.contractAddresses
      );
      await centralEnvDeployer.deploy();
      this.logger.info('CDK 中心环境部署完成');
    } catch (error) {
      this.logger.error('CDK 中心环境部署失败:', error);
      throw error;
    }
  }

  private async deployAggLayer(): Promise<void> {
    this.logger.info('部署 AggLayer...');
    const agglayerDeployer = new AgglayerDeployer(
      this.config,
      this.logger,
      this.contractAddresses
    );
    await agglayerDeployer.deploy();
  }

  private async deployAdditionalServices(): Promise<void> {
    this.logger.info('部署额外服务...');

    try {
      const additionalServices = this.config.additional_services || [];

      // 部署 Blockscout
      if (additionalServices.includes('blockscout')) {
        await this.deployBlockscout();
      }

      // 部署 Prometheus
      if (additionalServices.includes('prometheus_grafana')) {
        await this.deployPrometheus();
      }

      this.logger.info('额外服务部署完成');
    } catch (error) {
      this.logger.error('额外服务部署失败:', error);
      throw error;
    }
  }

  private async deployBlockscout(): Promise<void> {
    this.logger.info('部署 Blockscout...');

    // 获取 L2 RPC URL
    const l2RpcUrl = {
      http: `http://${this.config.l2_rpc_name}${this.config.deployment_suffix}:${this.config.ports.zkevm_rpc_http_port}`,
      ws: `ws://${this.config.l2_rpc_name}${this.config.deployment_suffix}:${this.config.ports.zkevm_rpc_ws_port}`
    };

    // 创建 Blockscout 配置
    const blockscoutConfig = {
      rpc_url: l2RpcUrl.http,
      trace_url: l2RpcUrl.http,
      ws_url: l2RpcUrl.ws,
      chain_id: this.config.zkevm_rollup_chain_id.toString(),
      deployment_suffix: this.config.deployment_suffix,
      ...this.config.blockscout_params
    };

    // 部署 Blockscout 服务
    await this.deployService({
      name: 'blockscout',
      image: 'blockscout/blockscout-zkevm:6.8.1',
      config: blockscoutConfig,
      ports: {
        'frontend': this.config.ports.blockscout_frontend_port
      }
    });

    this.logger.info('Blockscout 部署完成');
  }

  private async deployPrometheus(): Promise<void> {
    this.logger.info('部署 Prometheus...');

    // 获取所有带有 prometheus 端口的服务的指标配置
    const metricsJobs = await this.getMetricsJobs();

    // 创建 Prometheus 配置
    const prometheusConfig = {
      global: {
        scrape_interval: '15s',
        evaluation_interval: '15s'
      },
      scrape_configs: metricsJobs.map(job => ({
        job_name: job.Name,
        static_configs: [{
          targets: [`${job.Endpoint}`]
        }],
        metrics_path: job.MetricsPath || '/metrics'
      }))
    };

    // 部署 Prometheus 服务
    await this.deployService({
      name: 'prometheus',
      image: 'prom/prometheus:v3.0.1',
      config: prometheusConfig,
      ports: {
        'http': this.config.ports.prometheus_port
      },
      command: [
        '--config.file=/etc/zkevm/config.json',
        '--storage.tsdb.retention.time=1d',
        '--storage.tsdb.retention.size=512MB'
      ]
    });

    this.logger.info('Prometheus 部署完成');
  }

  private async getMetricsJobs(): Promise<Array<{
    Name: string;
    Endpoint: string;
    MetricsPath?: string;
  }>> {
    // 获取所有运行的服务
    const services = execSync('docker ps --format "{{.Names}}"')
      .toString()
      .split('\n')
      .filter(Boolean);

    const metricsJobs = [];

    for (const serviceName of services) {
      // 检查服务是否有 prometheus 端口
      try {
        const portInfo = execSync(`docker port ${serviceName}`).toString();
        if (portInfo.includes('prometheus')) {
          const prometheusPort = portInfo
            .split('\n')
            .find(line => line.includes('prometheus'))
            ?.split(':')
            .pop();

          if (prometheusPort) {
            let metricsPath = '/metrics';
            // CDK-Erigon 服务使用不同的指标路径
            if (serviceName.startsWith('cdk-erigon')) {
              metricsPath = '/debug/metrics/prometheus';
            }

            metricsJobs.push({
              Name: serviceName,
              Endpoint: `${serviceName}:${prometheusPort}`,
              MetricsPath: metricsPath
            });
          }
        }
      } catch (error) {
        this.logger.warn(`无法获取服务 ${serviceName} 的端口信息`);
      }
    }

    return metricsJobs;
  }

  private async deployService(options: {
    name: string;
    image: string;
    config: any;
    ports: Record<string, number>;
    volumes?: Record<string, { type: string; content: string }>;
    command?: string[];
  }): Promise<void> {
    const { name, image, config, ports, volumes, command } = options;
    const serviceName = `${name}${this.config.deployment_suffix}`;

    // 1. 创建配置文件
    const configPath = this.pathManager.getBuildPath(`${name}-config.json`);
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    // 2. 构建 docker run 命令
    let cmd = `docker run -d --name ${serviceName}`;

    // 添加端口映射
    for (const [key, port] of Object.entries(ports)) {
      cmd += ` -p ${port}:${port}`;
    }

    // 添加配置文件挂载
    cmd += ` -v ${configPath}:/etc/zkevm/config.json`;

    // 添加额外的卷挂载
    if (volumes) {
      for (const [mountPath, volume] of Object.entries(volumes)) {
        const volumePath = this.pathManager.getBuildPath(`${name}-${path.basename(mountPath)}`);
        writeFileSync(volumePath, volume.content);
        cmd += ` -v ${volumePath}:${mountPath}`;
      }
    }

    // 添加镜像
    cmd += ` ${image}`;

    // 添加命令(如果有)
    if (command) {
      cmd += ` ${command.join(' ')}`;
    }

    // 3. 执行命令
    execSync(cmd);
    this.logger.info(`服务 ${serviceName} 已启动`);
  }

  private async prepareDeploymentDirectory(): Promise<void> {
    this.logger.info('准备部署目录...');
    // 使用 PathManager 创建目录
    const buildDir = this.pathManager.getBuildDir();
    try {
      await fs.promises.mkdir(buildDir, { recursive: true });
    } catch (error) {
      this.logger.error('创建部署目录失败:', error);
      throw error;
    }
  }
} 