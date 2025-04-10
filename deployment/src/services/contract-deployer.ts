import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { DEPLOYMENT_ARTIFACTS, DATA_AVAILABILITY_MODES, CONSENSUS_CONTRACTS } from '../types/constants'

// 合约配置接口
interface ArtifactConfig {
  name: string;
  file: string;
}

// 扩展 DeploymentConfig 接口
interface ContractDeploymentConfig extends DeploymentConfig {
  artifacts?: ArtifactConfig[];
}

export class ContractDeployer extends BaseDeployer {
  private readonly contractConfig: ContractDeploymentConfig;

  constructor(
    config: ContractDeploymentConfig,
    logger: Logger
  ) {
    super(config, logger);
    this.contractConfig = config;
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署合约...');
      // 1. 生成配置文件配置
      await this.generatArtifactConfig();
      // 2. 生成部署脚本
      await this.generateDeployScript();
      // 3. create helper service to deploy contracts
      await this.createHelperService();
      // 4. deploy contracts
      // 5. create keystores
      // 6. store CDK configs
      // 7. force update GER


      this.logger.info('合约部署完成');
    } catch (error) {
      this.logger.error('合约部署失败:', error);
      throw error;
    }
  }

  private async generatArtifactConfig(): Promise<void> {
    this.logger.info('生成合约配置...');
    let artifacts = [];
    for (const artifact of DEPLOYMENT_ARTIFACTS) {
      artifacts.push({
        name: artifact.name,
        file: artifact.file
      })
    }

    if (this.contractConfig.deployment_args.use_previously_deployed_contracts) {
      artifacts.push({
        name: 'genesis.json',
        file: 'contract-deploy/genesis.json'
      })
      artifacts.push({
        name: 'combined.json',
        file: 'contract-deploy/combined.json'
      })
      artifacts.push({
        name: 'dynamic-' + this.contractConfig.deployment_args.chain_name + '-conf.json',
        file: 'contract-deploy/dynamic-' + this.contractConfig.deployment_args.chain_name + '-conf.json'
      })
      artifacts.push({
        name: 'dynamic-' + this.contractConfig.deployment_args.chain_name + '-allocs.json',
        file: 'contract-deploy/dynamic-' + this.contractConfig.deployment_args.chain_name + '-allocs.json'
      })
    }
    this.contractConfig.artifacts = artifacts;
  }

  private async generateDeployScript(): Promise<void> {
    this.logger.info('生成部署脚本...');

    // 1. 渲染模板
    const artifacts = this.contractConfig.artifacts || [];
    
    const is_cdk_validium = this.contractConfig.deployment_args.consensus_contract_type === DATA_AVAILABILITY_MODES.cdk_validium;
    const zkevm_rollup_consensus = CONSENSUS_CONTRACTS[this.contractConfig.deployment_args.consensus_contract_type];
    const deploy_optimism_rollup = this.contractConfig.deployment_stages.deploy_optimism_rollup

    for (const artifact of artifacts) {
      await this.configGenerator.renderTemplate(artifact.file,
        {...this.contractConfig.deployment_args,
          is_cdk_validium,
          zkevm_rollup_consensus,
          deploy_optimism_rollup},
        artifact.name);
    }
  }

  private async createHelperService(): Promise<void> {
    this.logger.info('创建helper service...');
  }
} 