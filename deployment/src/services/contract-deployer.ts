import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { DEPLOYMENT_ARTIFACTS, DATA_AVAILABILITY_MODES, CONSENSUS_CONTRACTS } from '../types/constants'
import yaml from 'js-yaml';
import { ContractComposeGenerator, ContractExtraConfig } from '../compose/contract-compose-generator';
import { ComposeNetworkConfig } from '../compose/base-compose-generator';

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
      await this.deployContracts();
      // 5. create keystores
      await this.createKeystores();
      // 6. store CDK configs
      await this.storeCDKConfigs();
      // 7. force update GER
      await this.updateGER();

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
    this.logger.info('创建合约部署服务...');
    
    const network: ComposeNetworkConfig = {
      name: this.contractConfig.deployment_args.chain_name
    };

    const extraConfig: ContractExtraConfig = {
      artifacts: this.contractConfig.artifacts?.map(a => a.name) || []
    };

    const composeGenerator = new ContractComposeGenerator(this.contractConfig, this.logger, network);
    const composeConfig = await composeGenerator.generate(extraConfig);

    // 写入配置文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'contract-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  }

  private async deployContracts(): Promise<void> {
    this.logger.info('部署智能合约...');
    const contractsServiceName = `contracts${this.contractConfig.deployment_args.deployment_suffix}`;
    
    execSync(`docker compose exec ${contractsServiceName} /bin/sh -c "chmod +x /opt/contract-deploy/run-contract-setup.sh && /opt/contract-deploy/run-contract-setup.sh"`, 
      { stdio: 'inherit' });
  }

  private async createKeystores(): Promise<void> {
    this.logger.info('创建密钥库...');
    const contractsServiceName = `contracts${this.contractConfig.deployment_args.deployment_suffix}`;
    
    execSync(`docker compose exec ${contractsServiceName} /bin/sh -c "chmod +x /opt/contract-deploy/create-keystores.sh && /opt/contract-deploy/create-keystores.sh"`,
      { stdio: 'inherit' });
  }

  private async storeCDKConfigs(): Promise<void> {
    this.logger.info('存储 CDK 配置...');
    const contractsServiceName = `contracts${this.contractConfig.deployment_args.deployment_suffix}`;
    const chainName = this.contractConfig.deployment_args.chain_name;

    // Store chain config
    execSync(`docker compose cp ${contractsServiceName}:/opt/zkevm/dynamic-${chainName}-conf.json ${this.pathManager.getBuildDir()}/`,
      { stdio: 'inherit' });

    // Store chain allocs
    execSync(`docker compose cp ${contractsServiceName}:/opt/zkevm/dynamic-${chainName}-allocs.json ${this.pathManager.getBuildDir()}/`,
      { stdio: 'inherit' });

    // Store first batch config
    execSync(`docker compose cp ${contractsServiceName}:/opt/zkevm/first-batch-config.json ${this.pathManager.getBuildDir()}/`,
      { stdio: 'inherit' });
  }

  private async updateGER(): Promise<void> {
    this.logger.info('更新 GER...');
    const contractsServiceName = `contracts${this.contractConfig.deployment_args.deployment_suffix}`;
    
    execSync(`docker compose exec ${contractsServiceName} /bin/sh -c "chmod +x /opt/contract-deploy/update-ger.sh && /opt/contract-deploy/update-ger.sh"`,
      { stdio: 'inherit' });
  }
} 