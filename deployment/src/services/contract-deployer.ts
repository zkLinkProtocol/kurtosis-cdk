import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { DEPLOYMENT_ARTIFACTS } from '../types/constants'

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
      // 0. 生成合约配置
      await this.generateContractConfig();
      // 1. 生成部署脚本
      await this.generateDeployScript();

      // 2. 启动部署服务
      // await this.startServices('contracts');
      // await this.waitForHealthy('contracts');

      this.logger.info('合约部署完成');
    } catch (error) {
      this.logger.error('合约部署失败:', error);
      throw error;
    }
  }

  private async generateContractConfig(): Promise<void> {
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
        file: './templates/contract-deploy/genesis.json'
      })
      artifacts.push({
        name: 'combined.json',
        file: './templates/contract-deploy/combined.json'
      })
      artifacts.push({
        name: 'dynamic-' + this.contractConfig.deployment_args.chain_name + '-conf.json',
        file: './templates/contract-deploy/dynamic-' + this.contractConfig.deployment_args.chain_name + '-conf.json'
      })
      artifacts.push({
        name: 'dynamic-' + this.contractConfig.deployment_args.chain_name + '-allocs.json',
        file: './templates/contract-deploy/dynamic-' + this.contractConfig.deployment_args.chain_name + '-allocs.json'
      })
    }
    this.contractConfig.artifacts = artifacts;
  }

  private async generateDeployScript(): Promise<void> {
    this.logger.info('生成部署脚本...');

    // 1. 渲染模板
    const contracts = this.contractConfig.artifacts || [];
    // const renderedContent = this.renderTemplate('contract-deploy/deploy.ts', {
    //   // contracts: contracts.map(this.formatContractConfig)
    // });

    // 2. 写入文件
    // const outputPath = this.pathManager.getBuildPath('deploy.ts');
    // writeFileSync(outputPath, renderedContent);

    // 3. 编译脚本
    // execSync(`tsc ${outputPath} --esModuleInterop --target es2020 --module commonjs`, {
    //   stdio: 'inherit'
    // });
  }

  // private formatContractConfig(config: ArtifactConfig): string {
  //   const args = config.args.map(arg => `'${arg}'`).join(', ');
  //   const value = config.value ? `, { value: '${config.value}' }` : '';
  //   const libraries = config.libraries ? 
  //     `, { libraries: ${JSON.stringify(config.libraries)} }` : 
  //     '';

  //   return `await deploy('${config.name}', [${args}]${value}${libraries});`;
  // }

  private async compileContracts(contractName: string): Promise<void> {
    this.logger.info('编译合约...');

    const command = `cd ${this.pathManager.getBuildPath(contractName)} && yarn && yarn compile`;
    execSync(command, { stdio: 'inherit' });
  }
} 