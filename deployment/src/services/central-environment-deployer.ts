import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { existsSync, mkdirSync } from 'fs';

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

    if (!this.config.prover) {
      return false;
    }
    return (this.config.prover.deploy_prover ?? false) && baseCondition;
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
    this.writeConfig('prover-config.json', proverConfig);

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
    
    this.writeConfig('genesis.json', genesisContent);
    return this.pathManager.getBuildPath('genesis.json');
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
    this.writeConfig('node-config.toml', nodeConfig);

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
    const erigonConfigTemplate = this.readTemplate('cdk-erigon/config.toml');
    const erigonConfig = this.renderTemplate(erigonConfigTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 写入配置文件
    this.writeConfig('sequencer-config.toml', erigonConfig);

    // 3. 创建 chainspec 文件
    const chainspecTemplate = this.readTemplate('cdk-erigon/chainspec.json');
    const chainspecConfig = this.renderTemplate(chainspecTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 写入 chainspec 文件
    this.writeConfig('chainspec.json', chainspecConfig);

    // 4. 创建 keystore 文件
    const keystoreTemplate = this.readTemplate('cdk-erigon/sequencer.keystore');
    const keystoreConfig = this.renderTemplate(keystoreTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 写入 keystore 文件
    this.writeConfig('sequencer.keystore', keystoreConfig);

    // 5. 启动服务
    await this.startServices('core');
    await this.waitForHealthy('core');
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
    this.writeConfig('executor-config.json', executorConfig);

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
    this.writeConfig('dac-config.toml', dacConfig);

    // 启动 DAC 服务
    await this.startServices('node');
    await this.waitForHealthy('node');
  }

  private isCDKValidium(): boolean {
    return this.config.consensus_contract_type === 'cdk-validium';
  }

  private async prepareProverConfig(proverType: string): Promise<void> {
    const template = this.readTemplate(`${proverType}-prover-config.toml`);
    const config = this.renderTemplate(template, {
      PROVER_PRIVATE_KEY: this.config.accounts.zkevm_l2_proofsigner_private_key,
      PROVER_OPERATOR: this.config.accounts.zkevm_l2_proofsigner_address,
      PROVER_OPERATOR_COMMIT_DELAY: this.config.prover?.prover_config?.executor_port || 0,
      PROVER_OPERATOR_PROOF_DELAY: this.config.prover?.prover_config?.hash_db_port || 0,
      PROVER_OPERATOR_COMMIT_SLOT_SIZE: 1,
      PROVER_OPERATOR_PROOF_SLOT_SIZE: 1,
      PROVER_OPERATOR_COMMIT_PROOF_RATIO: 1,
    });
    this.writeConfig(`${proverType}-prover-config.toml`, config);
  }

  private async prepareSequencerConfig(): Promise<void> {
    const template = this.readTemplate('sequencer-config.toml');
    const config = this.renderTemplate(template, {
      SEQUENCER_PRIVATE_KEY: this.config.accounts.zkevm_l2_sequencer_private_key,
      SEQUENCER_OPERATOR: this.config.accounts.zkevm_l2_sequencer_address,
      SEQUENCER_OPERATOR_COMMIT_DELAY: this.config.prover?.prover_config?.executor_port || 0,
      SEQUENCER_OPERATOR_PROOF_DELAY: this.config.prover?.prover_config?.hash_db_port || 0,
      SEQUENCER_OPERATOR_COMMIT_SLOT_SIZE: 1,
      SEQUENCER_OPERATOR_PROOF_SLOT_SIZE: 1,
      SEQUENCER_OPERATOR_COMMIT_PROOF_RATIO: 1,
    });
    this.writeConfig('sequencer-config.toml', config);
  }

  private async prepareValidatorConfig(): Promise<void> {
    const template = this.readTemplate('validator-config.toml');
    const config = this.renderTemplate(template, {
      VALIDATOR_PRIVATE_KEY: this.config.accounts.zkevm_l2_admin_private_key,
      VALIDATOR_OPERATOR: this.config.accounts.zkevm_l2_admin_address,
    });
    this.writeConfig('validator-config.toml', config);
  }

  private async prepareWitnessConfig(): Promise<void> {
    const template = this.readTemplate('witness-config.toml');
    const config = this.renderTemplate(template, {
      WITNESS_PRIVATE_KEY: this.config.accounts.zkevm_l2_loadtest_private_key,
      WITNESS_OPERATOR: this.config.accounts.zkevm_l2_loadtest_address,
    });
    this.writeConfig('witness-config.toml', config);
  }

  private async prepareL1Config(): Promise<void> {
    const template = this.readTemplate('l1-config.toml');
    const config = this.renderTemplate(template, {
      L1_PRIVATE_KEY: this.config.accounts.zkevm_l2_l1testing_private_key,
      L1_OPERATOR: this.config.accounts.zkevm_l2_l1testing_address,
    });
    this.writeConfig('l1-config.toml', config);
  }

  private async prepareL2Config(): Promise<void> {
    const template = this.readTemplate('l2-config.toml');
    const config = this.renderTemplate(template, {
      L2_PRIVATE_KEY: this.config.accounts.zkevm_l2_claimtxmanager_private_key,
      L2_OPERATOR: this.config.accounts.zkevm_l2_claimtxmanager_address,
    });
    this.writeConfig('l2-config.toml', config);
  }

  private async prepareL3Config(): Promise<void> {
    const template = this.readTemplate('l3-config.toml');
    const config = this.renderTemplate(template, {
      L3_PRIVATE_KEY: this.config.accounts.zkevm_l2_timelock_private_key,
      L3_OPERATOR: this.config.accounts.zkevm_l2_timelock_address,
    });
    this.writeConfig('l3-config.toml', config);
  }

  private async prepareL4Config(): Promise<void> {
    const template = this.readTemplate('l4-config.toml');
    const config = this.renderTemplate(template, {
      L4_PRIVATE_KEY: this.config.accounts.zkevm_l2_agglayer_private_key,
      L4_OPERATOR: this.config.accounts.zkevm_l2_agglayer_address,
    });
    this.writeConfig('l4-config.toml', config);
  }

  private async prepareL5Config(): Promise<void> {
    const template = this.readTemplate('l5-config.toml');
    const config = this.renderTemplate(template, {
      L5_PRIVATE_KEY: this.config.accounts.zkevm_l2_dac_private_key,
      L5_OPERATOR: this.config.accounts.zkevm_l2_dac_address,
    });
    this.writeConfig('l5-config.toml', config);
  }

  private async prepareL6Config(): Promise<void> {
    const template = this.readTemplate('l6-config.toml');
    const config = this.renderTemplate(template, {
      L6_PRIVATE_KEY: this.config.accounts.zkevm_l2_proofsigner_private_key,
      L6_OPERATOR: this.config.accounts.zkevm_l2_proofsigner_address,
    });
    this.writeConfig('l6-config.toml', config);
  }

  private async prepareL7Config(): Promise<void> {
    const template = this.readTemplate('l7-config.toml');
    const config = this.renderTemplate(template, {
      L7_PRIVATE_KEY: this.config.accounts.zkevm_l2_l1testing_private_key,
      L7_OPERATOR: this.config.accounts.zkevm_l2_l1testing_address,
    });
    this.writeConfig('l7-config.toml', config);
  }

  private async prepareL8Config(): Promise<void> {
    const template = this.readTemplate('l8-config.toml');
    const config = this.renderTemplate(template, {
      L8_PRIVATE_KEY: this.config.accounts.zkevm_l2_claimsponsor_private_key,
      L8_OPERATOR: this.config.accounts.zkevm_l2_claimsponsor_address,
    });
    this.writeConfig('l8-config.toml', config);
  }

  private async prepareL9Config(): Promise<void> {
    const template = this.readTemplate('l9-config.toml');
    const config = this.renderTemplate(template, {
      L9_PRIVATE_KEY: this.config.accounts.zkevm_l2_aggoracle_private_key,
      L9_OPERATOR: this.config.accounts.zkevm_l2_aggoracle_address,
    });
    this.writeConfig('l9-config.toml', config);
  }

  private async prepareL10Config(): Promise<void> {
    const template = this.readTemplate('l10-config.toml');
    const config = this.renderTemplate(template, {
      L10_PRIVATE_KEY: this.config.accounts.zkevm_l2_claimtx_private_key,
      L10_OPERATOR: this.config.accounts.zkevm_l2_claimtx_address,
    });
    this.writeConfig('l10-config.toml', config);
  }
} 