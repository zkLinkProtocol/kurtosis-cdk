import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

interface ContractArtifact {
  name: string;
  template: string;
}

export class ContractDeployer {
  private readonly config: DeploymentConfig;
  private readonly logger: Logger;
  private readonly workDir: string;
  private readonly contractServiceName: string;

  constructor(config: DeploymentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.workDir = path.join(process.cwd(), 'deployment');
    this.contractServiceName = `contracts${config.deployment_suffix}`;
  }

  public async deploy(): Promise<void> {
    try {
      // 1. 准备部署模板
      await this.prepareDeploymentTemplates();

      // 2. 创建合约部署服务
      await this.createContractService();

      // 3. 执行合约部署
      await this.executeContractDeployment();

      // 4. 创建密钥库
      await this.createKeystores();

      // 5. 存储 CDK 配置
      await this.storeCDKConfigs();

      // 6. 更新 GER
      await this.updateGER();

    } catch (error) {
      this.logger.error('合约部署失败:', error);
      throw error;
    }
  }

  private async prepareDeploymentTemplates(): Promise<void> {
    this.logger.info('准备部署模板...');
    
    const templates = [
      'deploy_parameters.json',
      'create_rollup_parameters.json',
      'run-contract-setup.sh',
      'create-keystores.sh',
      'update-ger.sh',
      'run-l2-contract-setup.sh',
      'run-sovereign-setup.sh',
      'run-sovereign-setup-predeployed.sh',
      'create_new_rollup.json',
      'add_rollup_type.json',
      'sovereign-genesis.json',
      'create-genesis-sovereign-params.json',
      'create-predeployed-sovereign-genesis.sh',
      'op-original-genesis.json'
    ];

    for (const template of templates) {
      const templatePath = path.join(this.workDir, 'templates', 'contract-deploy', template);
      const content = readFileSync(templatePath, 'utf8');
      
      // 替换模板中的变量
      const renderedContent = this.renderTemplate(content);
      
      const outputPath = path.join(this.workDir, 'build', template);
      writeFileSync(outputPath, renderedContent);
    }
  }

  private async createContractService(): Promise<void> {
    this.logger.info('创建合约部署服务...');
    
    // 使用 Docker 创建服务容器
    const cmd = `docker run -d \
      --name ${this.contractServiceName} \
      -v ${path.join(this.workDir, 'build')}:/opt/contract-deploy \
      -v zkevm-artifacts:/opt/zkevm \
      ${this.config.images.zkevm_contracts_image}`;

    execSync(cmd);
  }

  private async executeContractDeployment(): Promise<void> {
    this.logger.info('执行合约部署...');
    
    const cmd = `docker exec ${this.contractServiceName} \
      /bin/sh -c "chmod +x /opt/contract-deploy/run-contract-setup.sh && \
      /opt/contract-deploy/run-contract-setup.sh"`;

    execSync(cmd);
  }

  private async createKeystores(): Promise<void> {
    this.logger.info('创建密钥库...');
    
    const cmd = `docker exec ${this.contractServiceName} \
      /bin/sh -c "chmod +x /opt/contract-deploy/create-keystores.sh && \
      /opt/contract-deploy/create-keystores.sh"`;

    execSync(cmd);
  }

  private async storeCDKConfigs(): Promise<void> {
    this.logger.info('存储 CDK 配置...');
    
    const configs = [
      {
        name: 'cdk-erigon-chain-config',
        src: `dynamic-${this.config.chain_name}-conf.json`
      },
      {
        name: 'cdk-erigon-chain-allocs',
        src: `dynamic-${this.config.chain_name}-allocs.json`
      },
      {
        name: 'cdk-erigon-chain-first-batch',
        src: 'first-batch-config.json'
      }
    ];

    for (const config of configs) {
      const cmd = `docker cp \
        ${this.contractServiceName}:/opt/zkevm/${config.src} \
        ${path.join(this.workDir, 'build', config.name)}`;

      execSync(cmd);
    }
  }

  private async updateGER(): Promise<void> {
    this.logger.info('更新 Global Exit Root...');
    
    const cmd = `docker exec ${this.contractServiceName} \
      /bin/sh -c "chmod +x /opt/contract-deploy/update-ger.sh && \
      /opt/contract-deploy/update-ger.sh"`;

    execSync(cmd);
  }

  private renderTemplate(template: string): string {
    // 替换模板中的变量
    let content = template;
    
    // 基本配置
    content = content.replace(/\{\{deployment_suffix\}\}/g, this.config.deployment_suffix);
    content = content.replace(/\{\{chain_name\}\}/g, this.config.chain_name);
    
    // L1 配置
    content = content.replace(/\{\{l1_chain_id\}\}/g, this.config.l1_chain_id.toString());
    content = content.replace(/\{\{l1_rpc_url\}\}/g, this.config.l1_rpc_url);
    
    // Rollup 配置
    content = content.replace(/\{\{zkevm_rollup_chain_id\}\}/g, this.config.zkevm_rollup_chain_id.toString());
    content = content.replace(/\{\{zkevm_rollup_id\}\}/g, this.config.zkevm_rollup_id.toString());
    
    // 账户配置
    content = content.replace(/\{\{zkevm_l2_admin_address\}\}/g, this.config.accounts.zkevm_l2_admin_address);
    content = content.replace(/\{\{zkevm_l2_admin_private_key\}\}/g, this.config.accounts.zkevm_l2_admin_private_key);
    
    return content;
  }
} 