import { execSync } from 'child_process';
import { DeploymentConfig } from './types/config';
import { DeploymentStages } from './types/stages';
import { Logger } from './utils/logger';
import { ContractDeployer } from './services/contract-deployer';
import { DatabaseDeployer } from './services/database-deployer';
import { CentralEnvironmentDeployer } from './services/central-environment-deployer';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

export class CDKDeployer {
  private readonly config: DeploymentConfig;
  private readonly stages: DeploymentStages;
  private readonly logger: Logger;
  private readonly contractDeployer: ContractDeployer;
  private readonly databaseDeployer: DatabaseDeployer;
  private contractAddresses: any = {};
  private readonly workDir: string;

  constructor(config: DeploymentConfig, stages: DeploymentStages) {
    this.config = config;
    this.stages = stages;
    this.logger = new Logger(config.verbosity);
    this.contractDeployer = new ContractDeployer(config, this.logger);
    this.databaseDeployer = new DatabaseDeployer(config, this.logger);
    this.workDir = process.cwd();
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署 CDK 堆栈...');
      
      // 1. 部署 L1 链(可选)
      if (this.stages.deploy_l1) {
        await this.deployL1Chain();
      } else {
        this.logger.info('跳过本地 L1 链部署');
      }

      // 2. 在 L1 上部署 zkEVM 合约
      if (this.stages.deploy_zkevm_contracts_on_l1) {
        await this.deployZkEVMContracts();
        // 获取合约地址
        this.contractAddresses = await this.getContractAddresses();
      } else {
        this.logger.info('跳过 zkEVM 合约部署');
      }

      // 3. 部署数据库
      if (this.stages.deploy_databases) {
        await this.deployDatabases();
      } else {
        this.logger.info('跳过数据库部署');
      }

      // 4. 部署 CDK 中心环境
      if (this.stages.deploy_cdk_central_environment) {
        await this.deployCDKCentralEnvironment();
      } else {
        this.logger.info('跳过 CDK 中心环境部署');
      }

      // 5. 部署桥接基础设施
      if (this.stages.deploy_cdk_bridge_infra) {
        await this.deployBridgeInfrastructure();
      } else {
        this.logger.info('跳过桥接基础设施部署');
      }

      // 6. 部署 AggLayer
      if (this.stages.deploy_agglayer) {
        await this.deployAggLayer();
      } else {
        this.logger.info('跳过 AggLayer 部署');
      }

      // 7. 部署额外服务
      await this.deployAdditionalServices();

      this.logger.info('CDK 堆栈部署完成!');
    } catch (error) {
      this.logger.error('部署过程中发生错误:', error);
      throw error;
    }
  }

  private async deployL1Chain(): Promise<void> {
    this.logger.info('部署本地 L1 链...');
    // TODO: 实现 L1 链部署逻辑
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

  private async deployBridgeInfrastructure(): Promise<void> {
    this.logger.info('部署桥接基础设施...');

    try {
      // 1. 创建桥接服务配置
      const bridgeConfig = {
        log: {
          level: this.config.global_log_level,
          environment: 'production',
          outputs: ['stderr']
        },
        syncDB: {
          database: 'postgres',
          pgStorage: {
            user: this.config.bridge_db.user,
            name: this.config.bridge_db.name,
            password: this.config.bridge_db.password,
            host: this.config.bridge_db.hostname,
            port: this.config.bridge_db.port,
            maxConns: 20
          }
        },
        etherman: {
          l1URL: this.config.l1_rpc_url,
          l2URLs: [`http://${this.config.l2_rpc_name}:${this.config.ports.zkevm_rpc_http_port}`]
        },
        synchronizer: {
          syncInterval: '5s',
          syncChunkSize: 100,
          forceL2SyncChunk: true
        },
        bridgeController: {
          height: 32
        },
        bridgeServer: {
          grpcPort: this.config.ports.zkevm_bridge_grpc_port,
          httpPort: this.config.ports.zkevm_bridge_rpc_port,
          defaultPageLimit: 25,
          maxPageLimit: 1000,
          db: {
            database: 'postgres',
            pgStorage: {
              user: this.config.bridge_db.user,
              name: this.config.bridge_db.name,
              password: this.config.bridge_db.password,
              host: this.config.bridge_db.hostname,
              port: this.config.bridge_db.port,
              maxConns: 20
            }
          }
        },
        networkConfig: {
          genBlockNumber: this.config.zkevm_rollup_manager_block_number,
          polygonBridgeAddress: this.config.zkevm_bridge_address,
          polygonZkEVMGlobalExitRootAddress: this.config.zkevm_global_exit_root_address,
          polygonRollupManagerAddress: this.config.zkevm_rollup_manager_address,
          polygonZkEVMAddress: this.config.zkevm_rollup_address,
          l2PolygonBridgeAddresses: [this.config.zkevm_bridge_l2_address],
          requireSovereignChainSmcs: [false],
          l2PolygonZkEVMGlobalExitRootAddresses: [this.config.zkevm_global_exit_root_l2_address]
        },
        claimTxManager: {
          enabled: true,
          frequencyToMonitorTxs: '5s',
          privateKey: {
            path: '/etc/zkevm/claimtxmanager.keystore',
            password: this.config.zkevm_l2_keystore_password
          },
          retryInterval: '1s',
          retryNumber: 10
        },
        metrics: {
          enabled: true,
          host: '0.0.0.0',
          port: this.config.ports.zkevm_bridge_metrics_port
        }
      };

      // 2. 创建桥接UI配置
      const bridgeUIConfig = {
        l1ExplorerUrl: this.config.l1_explorer_url,
        zkevmExplorerUrl: this.config.polygon_zkevm_explorer,
        zkevmBridgeAddress: this.config.zkevm_bridge_address,
        zkevmGlobalExitRootAddress: this.config.zkevm_global_exit_root_address,
        zkevmRollupManagerAddress: this.config.zkevm_rollup_manager_address,
        zkevmRollupAddress: this.config.zkevm_rollup_address
      };

      // 3. 部署桥接服务
      await this.deployService({
        name: 'zkevm-bridge-service',
        image: this.config.images.zkevm_bridge_service_image,
        config: bridgeConfig,
        ports: {
          rpc: this.config.ports.zkevm_bridge_rpc_port,
          grpc: this.config.ports.zkevm_bridge_grpc_port,
          metrics: this.config.ports.zkevm_bridge_metrics_port
        },
        volumes: {
          '/etc/zkevm/claimtxmanager.keystore': {
            type: 'file',
            content: await this.getClaimTxManagerKeystore()
          }
        }
      });

      // 4. 部署桥接UI
      await this.deployService({
        name: 'zkevm-bridge-ui',
        image: this.config.images.zkevm_bridge_ui_image,
        config: bridgeUIConfig,
        ports: {
          'web-ui': this.config.ports.zkevm_bridge_ui_port
        },
        command: ['set -a; source /etc/zkevm/.env; set +a; sh /app/scripts/deploy.sh run']
      });

      this.logger.info('桥接基础设施部署完成');
    } catch (error) {
      this.logger.error('桥接基础设施部署失败:', error);
      throw error;
    }
  }

  private async deployAggLayer(): Promise<void> {
    this.logger.info('部署 AggLayer...');
    // TODO: 实现 AggLayer 部署逻辑
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

  private async getClaimTxManagerKeystore(): Promise<string> {
    const contractsService = `contracts${this.config.deployment_suffix}`;
    const sourcePath = '/opt/zkevm/claimtxmanager.keystore';
    const targetPath = path.join(this.workDir, 'build', 'claimtxmanager.keystore');
    
    execSync(`docker cp ${contractsService}:${sourcePath} ${targetPath}`);
    return readFileSync(targetPath, 'utf8');
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
    const configPath = path.join(this.workDir, 'build', `${name}-config.json`);
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
        const volumePath = path.join(this.workDir, 'build', `${name}-${path.basename(mountPath)}`);
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
} 