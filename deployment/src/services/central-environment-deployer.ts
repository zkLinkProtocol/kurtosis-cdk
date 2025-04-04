import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { BaseDeployer } from './base-deployer';

// Keystore 文件接口
interface KeystoreArtifacts {
  [key: string]: {
    address: string;
    keystore: string;
    password: string;
  };
}

// 合约地址接口
interface ContractSetupAddresses {
  l1_bridge_address: string;
  l1_bridge_proxy_address: string;
  l1_rollup_address: string;
  l1_rollup_proxy_address: string;
  l1_ger_address: string;
  l1_ger_proxy_address: string;
  l1_sovereign_bridge_address: string;
  l1_sovereign_bridge_proxy_address: string;
}

// 配置文件接口
interface ConfigFile {
  [key: string]: string | number | boolean | ConfigFile;
}

export class CentralEnvironmentDeployer extends BaseDeployer {
  constructor(
    config: DeploymentConfig,
    logger: Logger,
    private readonly contractAddresses: ContractSetupAddresses
  ) {
    super(config, logger);
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署中心环境...');

      // 1. 部署 Prover (如果需要)
      if (this.shouldDeployProver()) {
        await this.deployProver();
      }

      // 2. 获取 Genesis 文件
      const genesisArtifact = await this.getGenesisArtifact();

      // 3. 根据 sequencer 类型部署相应组件
      if (this.config.sequencer_type === 'zkevm') {
        await this.deployZkEVMComponents(genesisArtifact);
      } else {
        await this.deployCDKErigonComponents(genesisArtifact);
      }

      // 4. 如果是 validium 模式,部署 DAC
      if (this.isCDKValidium()) {
        await this.deployDAC();
      }

      this.logger.info('中心环境部署完成');
    } catch (error) {
      this.logger.error('中心环境部署失败:', error);
      throw error;
    }
  }

  private shouldDeployProver(): boolean {
    // 检查是否需要部署 Prover
    const baseCondition = !this.config.zkevm_use_real_verifier && 
                         !this.config.enable_normalcy && 
                         this.config.consensus_contract_type !== 'pessimistic';

    // 如果配置了 Prover 部署选项,则按配置决定
    if (this.config.prover) {
      return this.config.prover.deploy_prover && baseCondition;
    }

    // 如果没有配置,则按基本条件决定
    return baseCondition;
  }

  private async deployProver(): Promise<void> {
    this.logger.info('部署 Prover...');

    // 准备 Prover 配置
    const proverConfigTemplate = this.readTemplate('trusted-node/prover-config.json');
    const proverConfig = this.renderTemplate(proverConfigTemplate, {
      ...this.config,
      ...this.contractAddresses,
      // 如果有 Prover 专用配置,使用专用配置
      ...(this.config.prover?.prover_config || {})
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'prover-config.json');
    writeFileSync(configPath, proverConfig);

    // 启动 Prover 服务
    await this.startServices('core');
    await this.waitForHealthy('core');
  }

  private async getGenesisArtifact(): Promise<string> {
    this.logger.info('获取 Genesis 文件...');

    if (this.config.genesis_artifact) {
      return this.config.genesis_artifact;
    }

    const genesisFile = this.config.genesis_file || 'default-genesis.json';
    const genesisTemplate = this.readTemplate(genesisFile);
    const genesisContent = this.renderTemplate(genesisTemplate, {});
    
    const outputPath = path.join(this.workDir, 'build', 'genesis.json');
    writeFileSync(outputPath, genesisContent);
    
    return outputPath;
  }

  private async deployZkEVMComponents(genesisArtifact: string): Promise<void> {
    this.logger.info('部署 zkEVM 组件...');

    // 1. 创建节点配置
    const nodeConfigTemplate = this.readTemplate('trusted-node/node-config.toml');
    const nodeConfig = this.renderTemplate(nodeConfigTemplate, {
      ...this.config,
      is_cdk_validium: this.isCDKValidium()
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'node-config.toml');
    writeFileSync(configPath, nodeConfig);

    // 2. 启动节点服务
    await this.startServices('node');
    await this.waitForHealthy('node');
  }

  private async deployCDKErigonComponents(genesisArtifact: string): Promise<void> {
    this.logger.info('部署 CDK Erigon 组件...');

    // 1. 如果启用了严格模式,部署无状态执行器
    if (this.config.erigon_strict_mode) {
      await this.deployStatelessExecutor();
    }

    // 2. 创建 CDK Erigon 配置
    const erigonConfigTemplate = this.readTemplate('cdk-erigon/config.yml');
    const erigonConfig = this.renderTemplate(erigonConfigTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'config.yml');
    writeFileSync(configPath, erigonConfig);

    // 3. 启动节点服务
    await this.startServices('node');
    await this.waitForHealthy('node');
  }

  private async deployStatelessExecutor(): Promise<void> {
    this.logger.info('部署无状态执行器...');

    // 准备执行器配置
    const executorConfigTemplate = this.readTemplate('trusted-node/prover-config.json');
    const executorConfig = this.renderTemplate(executorConfigTemplate, {
      ...this.config,
      stateless_executor: true,
      // 如果有 Prover 专用配置,使用专用配置
      ...(this.config.prover?.prover_config || {})
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'executor-config.json');
    writeFileSync(configPath, executorConfig);

    // 启动执行器服务
    await this.startServices('core');
    await this.waitForHealthy('core');
  }

  private async deployDAC(): Promise<void> {
    this.logger.info('部署 DAC...');

    // 创建 DAC 配置
    const dacConfigTemplate = this.readTemplate('trusted-node/dac-config.toml');
    const dacConfig = this.renderTemplate(dacConfigTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'dac-config.toml');
    writeFileSync(configPath, dacConfig);

    // 启动 DAC 服务
    await this.startServices('node');
    await this.waitForHealthy('node');
  }

  private isCDKValidium(): boolean {
    return this.config.consensus_contract_type === 'cdk-validium';
  }

  private readTemplate(templatePath: string): string {
    return readFileSync(path.join(this.workDir, 'templates', templatePath), 'utf8');
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
    return result;
  }
} 