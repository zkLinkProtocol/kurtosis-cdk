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
      if (this.config.deployment_args.sequencer_type === 'zkevm') {
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
    const baseCondition = !this.config.deployment_args.zkevm_use_real_verifier && 
                         !this.config.deployment_args.enable_normalcy && 
                         this.config.deployment_args.consensus_contract_type !== 'pessimistic';

    if (!this.config.deployment_args.deploy_prover) {
      return false;
    }
    return (this.config.deployment_args.deploy_prover ?? false) && baseCondition;
  }

  private async deployProver(): Promise<void> {
    this.logger.info('部署 Prover...');

    // 准备 Prover 配置
    await this.configGenerator.renderTemplate('trusted-node/prover-config.json', {
      prover_db: {
        host: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.prover_db?.name,
        user: this.config.database?.prover_db?.user,
        password: this.config.database?.prover_db?.password
      },
    }, 'prover-config.json');


    // 启动 Prover 服务
    // await this.startServices('core');
    // await this.waitForHealthy('core');
  }

  private async getGenesisArtifact(): Promise<string> {
    this.logger.info('获取 Genesis 文件...');

    if (this.config.deployment_args.genesis_file) {
      return this.config.deployment_args.genesis_file;
    }

    const genesisFile = this.config.deployment_args.genesis_file || 'default-genesis.json';
    await this.configGenerator.renderTemplate(genesisFile, {}, 'genesis.json');
    return this.pathManager.getBuildPath('genesis.json');
  }

  private async deployZkEVMComponents(genesisArtifact: string): Promise<void> {
    this.logger.info('部署 zkEVM 组件...');

    // 1. 创建节点配置
    await this.configGenerator.renderTemplate('trusted-node/node-config.toml', {
      ...this.config,
      is_cdk_validium: this.isCDKValidium()
    }, 'node-config.toml');

    // 2. 启动节点服务
    // await this.startServices('node');
    // await this.waitForHealthy('node');
  }

  private async deployCDKErigonComponents(genesisArtifact: string): Promise<void> {
    this.logger.info('部署 CDK Erigon 组件...');

    // 1. 如果启用了严格模式,部署无状态执行器
    if (this.config.deployment_args.erigon_strict_mode) {
      await this.deployStatelessExecutor();
    }

    // 2. 创建 CDK Erigon 配置
    await this.configGenerator.renderTemplate('cdk-erigon/config.toml', {
      ...this.config,
      ...this.contractAddresses
    }, 'sequencer-config.toml');

    // 3. 创建 chainspec 文件
    await this.configGenerator.renderTemplate('cdk-erigon/chainspec.json', {
      ...this.config,
      ...this.contractAddresses
    }, 'chainspec.json');

    // 4. 创建 keystore 文件
    await this.configGenerator.renderTemplate('cdk-erigon/sequencer.keystore', {
      ...this.config,
      ...this.contractAddresses
    }, 'sequencer.keystore');

    // 5. 启动服务
    // await this.startServices('core');
    // await this.waitForHealthy('core');
  }

  private async deployStatelessExecutor(): Promise<void> {
    this.logger.info('部署无状态执行器...');

    // 准备执行器配置
    await this.configGenerator.renderTemplate('trusted-node/prover-config.json', {
      ...this.config,
      stateless_executor: true,
      // 确保数据库配置正确传递
      prover_db: {
        hostname: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.prover_db?.name,
        user: this.config.database?.prover_db?.user,
        password: this.config.database?.prover_db?.password
      },
      // 添加部署后缀
      deployment_suffix: this.config.deployment_args.deployment_suffix || '',
      // 确保端口配置正确传递
      zkevm_executor_port: this.config.deployment_args.zkevm_executor_port || 50071,
      zkevm_hash_db_port: this.config.deployment_args.zkevm_hash_db_port || 50061,
      zkevm_aggregator_port: this.config.deployment_args.zkevm_aggregator_port || 50081,
    }, 'executor-config.json');

    // 启动执行器服务
    // await this.startServices('core');
    // await this.waitForHealthy('core');
  }

  private async deployDAC(): Promise<void> {
    this.logger.info('部署 DAC...');

    // 创建 DAC 配置
    await this.configGenerator.renderTemplate('trusted-node/dac-config.toml', {
      ...this.config,
      ...this.contractAddresses
    }, 'dac-config.toml');

    // 启动 DAC 服务
    // await this.startServices('node');
    // await this.waitForHealthy('node');
  }

  private isCDKValidium(): boolean {
    return this.config.deployment_args.consensus_contract_type === 'cdk-validium';
  }

  // private async prepareProverConfig(proverType: string): Promise<void> {
  //   const config = this.renderTemplate(`${proverType}-prover-config.toml`, {
  //     PROVER_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_proofsigner_private_key,
  //     PROVER_OPERATOR: this.config.deployment_args.zkevm_l2_proofsigner_address,
  //     PROVER_OPERATOR_COMMIT_DELAY: this.config.deployment_args.zkevm_executor_port,
  //     PROVER_OPERATOR_PROOF_DELAY: this.config.deployment_args.zkevm_hash_db_port,
  //     PROVER_OPERATOR_COMMIT_SLOT_SIZE: 1,
  //     PROVER_OPERATOR_PROOF_SLOT_SIZE: 1,
  //     PROVER_OPERATOR_COMMIT_PROOF_RATIO: 1,
  //   });
  //   this.writeConfig(`${proverType}-prover-config.toml`, config);
  // }

  // private async prepareSequencerConfig(): Promise<void> {
  //   const config = this.renderTemplate('sequencer-config.toml', {
  //     SEQUENCER_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_sequencer_private_key,
  //     SEQUENCER_OPERATOR: this.config.deployment_args.zkevm_l2_sequencer_address,
  //     SEQUENCER_OPERATOR_COMMIT_DELAY: this.config.deployment_args.zkevm_executor_port,
  //     SEQUENCER_OPERATOR_PROOF_DELAY: this.config.deployment_args.zkevm_hash_db_port,
  //     SEQUENCER_OPERATOR_COMMIT_SLOT_SIZE: 1,
  //     SEQUENCER_OPERATOR_PROOF_SLOT_SIZE: 1,
  //     SEQUENCER_OPERATOR_COMMIT_PROOF_RATIO: 1,
  //   });
  //   this.writeConfig('sequencer-config.toml', config);
  // }

  // private async prepareValidatorConfig(): Promise<void> {
  //   const config = this.renderTemplate('validator-config.toml', {
  //     VALIDATOR_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_admin_private_key,
  //     VALIDATOR_OPERATOR: this.config.deployment_args.zkevm_l2_admin_address,
  //   });
  //   this.writeConfig('validator-config.toml', config);
  // }

  // private async prepareWitnessConfig(): Promise<void> {
  //   const config = this.renderTemplate('witness-config.toml', {
  //     WITNESS_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_loadtest_private_key,
  //     WITNESS_OPERATOR: this.config.deployment_args.zkevm_l2_loadtest_address,
  //   });
  //   this.writeConfig('witness-config.toml', config);
  // }

  // private async prepareL1Config(): Promise<void> {
  //   const config = this.renderTemplate('l1-config.toml', {
  //     L1_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_l1testing_private_key,
  //     L1_OPERATOR: this.config.deployment_args.zkevm_l2_l1testing_address,
  //   });
  //   this.writeConfig('l1-config.toml', config);
  // }

  // private async prepareL2Config(): Promise<void> {
  //   const template = this.readTemplate('l2-config.toml');
  //   const config = this.renderTemplate(template, {
  //     L2_PRIVATE_KEY: this.config.deployment_args.zkevm_l2_claimtxmanager_private_key,
  //     L2_OPERATOR: this.config.deployment_args.zkevm_l2_claimtxmanager_address,
  //   });
  //   this.writeConfig('l2-config.toml', config);
  // }
} 