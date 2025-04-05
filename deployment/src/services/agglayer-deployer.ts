import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { ContractSetupAddresses } from '../types';
import { existsSync, mkdirSync } from 'fs';

export class AgglayerDeployer extends BaseDeployer {
  constructor(
    config: DeploymentConfig,
    logger: Logger,
    private readonly contractAddresses: ContractSetupAddresses
  ) {
    super(config, logger);
  }

  public async deploy(): Promise<void> {
    this.logger.info('开始部署 Agglayer...');

    // 准备配置文件
    await this.prepareAgglayerProverConfig();
    await this.prepareAgglayerConfig();
    await this.copyKeystoreFile();

    // 启动服务
    await this.startServices('core');

    // 等待服务就绪
    await this.waitForHealthy('core');

    this.logger.info('Agglayer 部署完成');
  }

  protected async getContractSetupAddresses(): Promise<ContractSetupAddresses> {
    return {
      zkevm_rollup_fork_id: this.config.zkevm_rollup_fork_id,
      zkevm_l2_keystore_password: this.config.zkevm_l2_keystore_password,
      zkevm_l2_proofsigner_address: this.config.zkevm_l2_proofsigner_address,
      zkevm_l2_sequencer_address: this.config.accounts?.zkevm_l2_sequencer_address,
      zkevm_rpc_http_port: this.config.ports.zkevm_rpc_http_port,
      agglayer_grpc_port: this.config.ports.agglayer_grpc_port,
      agglayer_readrpc_port: this.config.ports.agglayer_readrpc_port,
      agglayer_admin_port: this.config.ports.agglayer_admin_port,
      agglayer_prover_port: this.config.ports.agglayer_prover_port,
      agglayer_metrics_port: this.config.ports.agglayer_metrics_port
    };
  }

  private async prepareAgglayerProverConfig(): Promise<void> {
    const template = this.readTemplate('agglayer-prover-config.toml');
    const config = this.renderTemplate(template, {
      PROVER_PRIVATE_KEY: this.config.accounts.zkevm_l2_proofsigner_private_key,
      PROVER_OPERATOR: this.config.accounts.zkevm_l2_proofsigner_address,
      PROVER_OPERATOR_COMMIT_DELAY: this.config.prover?.prover_config?.executor_port || 0,
      PROVER_OPERATOR_PROOF_DELAY: this.config.prover?.prover_config?.hash_db_port || 0,
      PROVER_OPERATOR_COMMIT_SLOT_SIZE: 1,
      PROVER_OPERATOR_PROOF_SLOT_SIZE: 1,
      PROVER_OPERATOR_COMMIT_PROOF_RATIO: 1,
    });
    this.writeConfig('agglayer-prover-config.toml', config);
  }

  private async prepareAgglayerConfig(): Promise<void> {
    const template = this.readTemplate('agglayer-config.toml');
    const config = this.renderTemplate(template, {
      AGGLAYER_PRIVATE_KEY: this.config.accounts.zkevm_l2_agglayer_private_key,
      AGGLAYER_OPERATOR: this.config.accounts.zkevm_l2_agglayer_address,
      AGGLAYER_OPERATOR_COMMIT_DELAY: this.config.prover?.prover_config?.executor_port || 0,
      AGGLAYER_OPERATOR_PROOF_DELAY: this.config.prover?.prover_config?.hash_db_port || 0,
      AGGLAYER_OPERATOR_COMMIT_SLOT_SIZE: 1,
      AGGLAYER_OPERATOR_PROOF_SLOT_SIZE: 1,
      AGGLAYER_OPERATOR_COMMIT_PROOF_RATIO: 1,
    });
    this.writeConfig('agglayer-config.toml', config);
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
      address: this.config.accounts.zkevm_l2_agglayer_address,
      privateKey: this.config.accounts.zkevm_l2_agglayer_private_key,
    }));

    // 写入密码文件
    writeFileSync(keystorePassword, 'password');
  }

  /**
   * 读取模板文件
   */
  protected readTemplate(templateName: string): string {
    const templatePath = this.pathManager.getTemplatePath(templateName);
    return readFileSync(templatePath, 'utf8');
  }

  /**
   * 渲染模板
   */
  protected renderTemplate(template: string, data: any): string {
    return template.replace(/\${(\w+)}/g, (match, key) => {
      return data[key] !== undefined ? data[key].toString() : match;
    });
  }
} 