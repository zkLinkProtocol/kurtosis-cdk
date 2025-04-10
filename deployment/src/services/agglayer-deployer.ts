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
    this.logger.info('部署 Agglayer Prover...');
    // 1.1 准备 Agglayer Prover 配置
    await this.prepareAgglayerProverConfig();
    // 1.2 生成 Agglayer Compose
    await this.generateAgglayerCompose();
    // 1.3 启动 Agglayer Prover
    await this.startAgglayerProver();

    // 2. 部署 Agglayer
    this.logger.info('部署 Agglayer...');
    // 2.1 准备 Agglayer 配置
    await this.prepareAgglayerConfig();
    // 2.2 生成 Agglayer Compose
    await this.generateAgglayerCompose();
    // 2.3 启动 Agglayer
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

    this.configGenerator.renderTemplate('bridge-infra/agglayer-prover-config.toml', {
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
    // TODO: 获取agglayer_prover的ip地址和端口
    const agglayer_prover_url = `http://localhost:${this.config.deployment_args.agglayer_prover_port}`;
    const db_configs = getDbConfigs(this.config);
    this.configGenerator.renderTemplate('bridge-infra/agglayer-config.toml', {
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

  private async copyKeystoreFile(): Promise<void> {
    const keystorePath = this.pathManager.getBuildPath('keystore');
    const keystoreFile = this.pathManager.getBuildPath('keystore/keystore.json');
    const keystorePassword = this.pathManager.getBuildPath('keystore/password.txt');

    // 创建 keystore 目录
    if (!existsSync(keystorePath)) {
      mkdirSync(keystorePath, { recursive: true });
    }

    // 写入 keystore 文件
    writeFileSync(keystoreFile, JSON.stringify({
      address: this.config.deployment_args.zkevm_l2_agglayer_address,
      privateKey: this.config.deployment_args.zkevm_l2_agglayer_private_key,
    }));

    // 写入密码文件
    writeFileSync(keystorePassword, 'password');
  }
} 