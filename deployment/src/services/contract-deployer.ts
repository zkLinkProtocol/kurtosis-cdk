import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';

// 合约配置接口
interface ContractConfig {
  name: string;
  args: string[];
  value?: string;
  libraries?: Record<string, string>;
}

// 扩展 DeploymentConfig 接口
interface ExtendedDeploymentConfig extends DeploymentConfig {
  contracts?: ContractConfig[];
}

export class ContractDeployer extends BaseDeployer {
  private readonly extendedConfig: ExtendedDeploymentConfig;

  constructor(
    config: ExtendedDeploymentConfig,
    logger: Logger
  ) {
    super(config, logger);
    this.extendedConfig = config;
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署合约...');

      // 1. 生成部署脚本
      await this.generateDeployScript();

      // 2. 启动部署服务
      await this.startServices('contracts');
      await this.waitForHealthy('contracts');

      this.logger.info('合约部署完成');
    } catch (error) {
      this.logger.error('合约部署失败:', error);
      throw error;
    }
  }

  private async generateDeployScript(): Promise<void> {
    this.logger.info('生成部署脚本...');

    // 1. 读取模板
    const template = 'deploy.ts';
    const templatePath = path.join(this.pathManager.getTemplatesDir(), 'contract-deploy', template);
    const templateContent = readFileSync(templatePath, 'utf8');

    // 2. 渲染模板
    const contracts = this.extendedConfig.contracts || [];
    const renderedContent = this.renderTemplate(templateContent, {
      contracts: contracts.map(this.formatContractConfig)
    });

    // 3. 写入文件
    const outputPath = this.pathManager.getBuildPath(template);
    writeFileSync(outputPath, renderedContent);

    // 4. 编译脚本
    execSync(`tsc ${outputPath} --esModuleInterop --target es2020 --module commonjs`, {
      stdio: 'inherit'
    });
  }

  private formatContractConfig(config: ContractConfig): string {
    const args = config.args.map(arg => `'${arg}'`).join(', ');
    const value = config.value ? `, { value: '${config.value}' }` : '';
    const libraries = config.libraries ? 
      `, { libraries: ${JSON.stringify(config.libraries)} }` : 
      '';

    return `await deploy('${config.name}', [${args}]${value}${libraries});`;
  }

  private async compileContracts(contractName: string): Promise<void> {
    this.logger.info('编译合约...');

    const command = `cd ${this.pathManager.getBuildPath(contractName)} && yarn && yarn compile`;
    execSync(command, { stdio: 'inherit' });
  }
} 