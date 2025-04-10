import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentArgs, DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { existsSync, mkdirSync } from 'fs';
import { Service, ContractSetupAddresses } from '../utils/service';
import { ConfigGenerator } from '../utils/config-generator';
import { getDbConfigs } from '../utils/config-loader';
import { AgglayerComposeGenerator } from '../compose/agglayer-compose-generator';
import yaml from 'js-yaml';


export class AgglayerDeployer extends BaseDeployer {
  private readonly service: Service;
  private readonly contractSetupAddresses: ContractSetupAddresses;

  constructor(
    config: DeploymentConfig,
    logger: Logger,
    service: Service
  ) {
    super(config, logger);
    this.service = service;
    this.contractSetupAddresses = this.service.getContractSetupAddresses();
  }

  public async deploy(): Promise<void> {
    this.logger.info('开始部署 Agglayer...');

    // 1. 部署 Agglayer Prover
    // 1.1 准备 Agglayer Prover 配置
    await this.prepareAgglayerProverConfig();
    // 1.2 准备 Agglayer 配置
    await this.prepareAgglayerConfig();
    // 1.3 生成 Agglayer Compose
    await this.generateAgglayerCompose();
    // 1.4 启动 Agglayer 服务
    await this.startAgglayer();
    
    this.logger.info('Agglayer 部署完成');
  }

  private async prepareAgglayerProverConfig(): Promise<void> {
    let is_cpu_prover_enabled = true;
    let is_network_prover_enabled = false;
    if (this.config.deployment_args.agglayer_prover_sp1_key) {
      is_cpu_prover_enabled = false;
      is_network_prover_enabled = true;
    }

    await this.configGenerator.renderTemplate('bridge-infra/agglayer-prover-config.toml', {
      deployment_suffix: this.config.deployment_args.deployment_suffix,
      global_log_level: this.config.deployment_args.global_log_level,
      zkevm_rollup_fork_id: this.config.deployment_args.zkevm_rollup_fork_id,
      agglayer_prover_port: this.config.deployment_args.agglayer_prover_port,
      prometheus_port: this.config.deployment_args.agglayer_prover_metrics_port,
      is_cpu_prover_enabled: is_cpu_prover_enabled,
      is_network_prover_enabled: is_network_prover_enabled,
      primary_prover: this.config.deployment_args.agglayer_prover_primary_prover,
    }, 'agglayer-prover-config.toml');
  }

  private async prepareAgglayerConfig(): Promise<void> {
    // 获取agglayer_prover的ip地址和端口
    const agglayer_prover_url = `http://localhost:${this.config.deployment_args.agglayer_prover_port}`;
    const db_configs = getDbConfigs(this.config);
    await this.configGenerator.renderTemplate('bridge-infra/agglayer-config.toml', {
      deployment_suffix: this.config.deployment_args.deployment_suffix,
      global_log_level: this.config.deployment_args.global_log_level,
      l1_chain_id: this.config.deployment_args.l1_chain_id,
      l1_rpc_url: this.config.deployment_args.l1_rpc_url,
      l1_ws_url: this.config.deployment_args.l1_ws_url,
      zkevm_rollup_fork_id: this.config.deployment_args.zkevm_rollup_fork_id,
      zkevm_l2_keystore_password: this.config.deployment_args.zkevm_l2_keystore_password,
      zkevm_l2_proofsigner_address: this.config.deployment_args.zkevm_l2_proofsigner_address,
      zkevm_l2_sequencer_address: this.config.deployment_args.zkevm_l2_sequencer_address,
      zkevm_rpc_http_port: this.config.deployment_args.zkevm_rpc_http_port,
      agglayer_version: this.agglayer_version(this.config.deployment_args),
      agglayer_grpc_port: this.config.deployment_args.agglayer_grpc_port,
      agglayer_readrpc_port: this.config.deployment_args.agglayer_readrpc_port,
      agglayer_admin_port: this.config.deployment_args.agglayer_admin_port,
      agglayer_prover_entrypoint: agglayer_prover_url,
      prometheus_port: this.config.deployment_args.agglayer_metrics_port,
      l2_rpc_name: this.config.deployment_args.l2_rpc_name,
      mock_verifier: this.config.deployment_args.agglayer_prover_primary_prover == "mock-prover",
      deploy_optimism_rollup: this.config.deployment_stages.deploy_optimism_rollup,
      op_el_rpc_url: this.config.deployment_args.op_el_rpc_url,
      zkevm_l2_sovereignadmin_address: this.config.deployment_args.zkevm_l2_sovereignadmin_address,
      ...db_configs,
      ...this.contractSetupAddresses
    }, 'agglayer-config.toml');
  }
  
  private agglayer_version(args: any): string {
    if (args.agglayer_version) {
      return args.agglayer_version;
    } else if (args.agglayer_image && typeof args.agglayer_image === 'string' && args.agglayer_image.includes(":")) {
      return args.agglayer_image.split(":")[1];
    } else {
      return "latest";
    }
  }

  private async generateAgglayerCompose(): Promise<void> {
    this.logger.info('生成 Agglayer Docker Compose 配置...');
    
    // 创建 Agglayer Compose 生成器
    const composeGenerator = new AgglayerComposeGenerator(
      this.config, 
      this.logger,
      { name: 'zklink-network' }
    );

    // 准备配置路径和密钥库路径
    const proverConfigPath = path.join(this.pathManager.getBuildDir(), 'agglayer-prover-config.toml');
    const agglayerConfigPath = path.join(this.pathManager.getBuildDir(), 'agglayer-config.toml');
    const keystorePath = path.join(this.pathManager.getBuildDir(), 'agglayer.keystore');
    //
    execSync(`docker cp contracts${this.config.deployment_args.deployment_suffix}:/opt/zkevm/agglayer.keystore ${keystorePath}`);

    // 生成 Compose 配置
    const composeConfig = await composeGenerator.generate({
      proverConfigPath,
      agglayerConfigPath,
      keystorePath
    });

    // 写入配置文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'agglayer-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));
  }

  private async startAgglayer(): Promise<void> {
    this.logger.info('启动 Agglayer 服务...');
    
    // 使用 Docker Compose 启动 Agglayer 服务
    execSync(`docker compose -f ${this.pathManager.getBuildDir()}/agglayer-docker-compose.yml up -d`, { stdio: 'inherit' });
    
    // 等待服务启动
    await this.waitForServiceStartup('agglayer-prover', this.config.deployment_args.agglayer_prover_port);
    await this.waitForServiceStartup('agglayer', this.config.deployment_args.agglayer_readrpc_port);
  }

  private async waitForServiceStartup(serviceName: string, port: number): Promise<void> {
    this.logger.info(`等待 ${serviceName} 服务启动...`);
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 尝试连接服务
        execSync(`curl -s http://localhost:${port}/health > /dev/null`, { stdio: 'pipe' });
        this.logger.info(`${serviceName} 服务已成功启动！`);
        return;
      } catch (error) {
        // 忽略错误，继续重试
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`${serviceName} 服务正在启动中... (${retries}/${maxRetries})`);
    }
    
    throw new Error(`${serviceName} 服务启动超时`);
  }
} 