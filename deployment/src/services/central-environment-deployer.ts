import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { BaseDeployer } from './base-deployer';
import { existsSync, mkdirSync } from 'fs';
import { chain } from 'lodash';
import { CentralEnvironmentComposeGenerator } from '../compose/central-environment-compose-generator';
import { Service, ContractSetupAddresses } from '../utils/service';
import { getDbConfigs } from '../utils/config-loader';
import yaml from 'js-yaml';
import { Pool } from 'pg';
import { DatabaseComposeGenerator } from '../compose/database-compose-generator';

// Keystore 文件接口
interface KeystoreArtifacts {
  [key: string]: {
    address: string;
    keystore: string;
    password: string;
  };
}

// 配置文件接口
interface ConfigFile {
  [key: string]: string | number | boolean | ConfigFile;
}

export class CentralEnvironmentDeployer extends BaseDeployer {
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
    try {
      this.logger.info('开始部署中心环境...');

      // 1. 部署 cdk erigon sequencer 服务
      await this.deploySequencer();

      // 2. 部署 zkevm-pool-manager 服务
      if (this.config.deployment_stages.deploy_cdk_erigon_node) {
        await this.deployZkevmPoolManager();
      } else {
        this.logger.info('不部署 zkevm-pool-manager 服务');
      }

      // 3. 部署 cdk erigon rpc 服务
      if (this.config.deployment_stages.deploy_cdk_erigon_node) {
        await this.deployRpc();
      } else {
        this.logger.info('不部署 cdk erigon rpc 服务');
      }

      // 4. 部署 prover 服务
      if (this.shouldDeployProver()) {
        await this.deployProver();
      } else {
        this.logger.info('不部署 prover 服务');
      }

      // 5. 部署 DAC 服务
      if (this.isCDKValidium()) {
        await this.deployDAC();
      } else {
        this.logger.info('不部署 DAC 服务');
      }

      // 6. 部署 cdk erigon node
      await this.deployCDKErigonNode();

      this.logger.info('中心环境部署完成');
    } catch (error) {
      this.logger.error('中心环境部署失败:', error);
      throw error;
    }
  }

  private async deploySequencer(): Promise<void> {
    this.logger.info('部署 cdk erigon sequencer...');

    // 如果启用了严格模式,准备无状态执行器配置
    if (this.config.deployment_args.erigon_strict_mode) {
      await this.prepareStatelessExecutorConfig();
    }

    // 生成 sequencer 服务配置
    // config.yml
    const dockerConfigName = 'config.yaml';
    const configName = 'cdk-erigon-sequencer-config.yml';
    await this.configGenerator.renderTemplate('cdk-erigon/config.yml', {
      ...this.config.deployment_args,
      ...this.contractSetupAddresses,
      "zkevm_data_stream_port": this.config.deployment_args.zkevm_data_streamer_port,
      "is_sequencer": true,
      "consensus_contract_type": this.config.deployment_args.consensus_contract_type,
      "l1_sync_start_block": this.config.deployment_args.anvil_state_file ? 1 : 0,
      "prometheus_port": this.config.deployment_args.prometheus_port,
    }, configName);

    // 生成 chainspec.json
    const chainspecName = `dynamic-${this.config.deployment_args.chain_name}-chainspec.json`;
    await this.configGenerator.renderTemplate('cdk-erigon/chainspec.json', {
      chain_id: this.config.deployment_args.zkevm_rollup_chain_id,
      enable_normalcy: this.config.deployment_args.enable_normalcy,
      chain_name: this.config.deployment_args.chain_name,
    }, chainspecName);

    const chainConfigName = `dynamic-${this.config.deployment_args.chain_name}-conf.json`;
    const chainAllocsName = `dynamic-${this.config.deployment_args.chain_name}-allocs.json`;
    const chainFirstBatchName = 'first-batch-config.json';
    // 创建 datadir
    const datadirPath = this.pathManager.getDataPath('datadir');
    if (!existsSync(datadirPath)) {
      mkdirSync(datadirPath, { recursive: true });
    }

    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'cdk-erigon-sequencer',
      config: {
        sequencerConfig: {
          path: this.pathManager.getBuildPath(configName),
          name: dockerConfigName,
        },
        sequencerChainspec: {
          path: this.pathManager.getBuildPath(chainspecName),
          name: chainspecName,
        },
        sequencerChainConfig: {
          path: this.pathManager.getBuildPath(chainConfigName),
          name: chainConfigName,
        },
        sequencerChainAllocs: {
          path: this.pathManager.getBuildPath(chainAllocsName),
          name: chainAllocsName,
        },
        sequencerChainFirstBatch: {
          path: this.pathManager.getBuildPath(chainFirstBatchName),
          name: chainFirstBatchName,
        },
        sequencerDatadir: {
          path: datadirPath,
          name: 'cdk-erigon-datadir',
        },
        proverConfig: {
          proverType: 'stateless-executor',
          proverConfigPath: this.pathManager.getBuildPath('stateless-executor-config.json'),
        }
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'cdk-erigon-sequencer-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 sequencer 服务...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    // 等待服务启动
    await this.waitForServiceStartup('cdk-erigon-sequencer', this.config.static_ports.cdk_erigon_sequencer_start_port);
  }

  private async waitForServiceStartup(serviceName: string, port: number): Promise<void> {
    this.logger.info(`等待 ${serviceName} 服务启动...`);

    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;

    while (retries < maxRetries) {
      try {
        execSync(`curl -s http://localhost:${port} > /dev/null`, { stdio: 'pipe' });
        this.logger.info(`${serviceName} 服务已成功启动！`);
        return;
      } catch (error) {
        // 忽略错误，继续重试
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`${serviceName} 服务正在启动中... (${retries}/${maxRetries})`);
    }

    throw new Error(`${serviceName} 服务启动失败`);
  }

  private async deployZkevmPoolManager(): Promise<void> {
    this.logger.info('部署 zkevm pool manager...');

    // 生成 zkevm-pool-manager 服务配置
    const configName = 'pool-manager-config.toml';
    await this.configGenerator.renderTemplate('pool-manager/pool-manager-config.toml', {
      ...this.config.deployment_args,
      pool_manager_db: {
        hostname: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.cdk_erigon_dbs.pool_manager_db.name,
        user: this.config.database?.cdk_erigon_dbs.pool_manager_db.user,
        password: this.config.database?.cdk_erigon_dbs.pool_manager_db.password
      }
    }, configName);
    
    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'zkevm-pool-manager',
      config: {
        zkevmPoolManagerConfig: {
          path: this.pathManager.getBuildPath(configName),
          name: configName,
        }
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'zkevm-pool-manager-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 zkevm-pool-manager 服务...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
    
    // 等待服务启动
    await this.waitForServiceStartup('zkevm-pool-manager', this.config.static_ports.zkevm_pool_manager_start_port);
  }

  private async deployRpc(): Promise<void> {
    this.logger.info('部署 cdk rpc...');

    // 生成 cdk Erigon node 服务配置
    const zkevm_sequence_url = `http://cdk-erigon-sequencer${this.config.deployment_args.deployment_suffix}:${this.config.deployment_args.zkevm_rpc_http_port}`
    const zkevm_datastreamer_url = `http://cdk-erigon-sequencer${this.config.deployment_args.deployment_suffix}:${this.config.deployment_args.zkevm_data_streamer_port}`
    const pool_manager_url = `http://zkevm-pool-manager${this.config.deployment_args.deployment_suffix}:${this.config.deployment_args.zkevm_pool_manager_port}`

    const dockerConfigName = 'config.yaml';
    const configName = 'cdk-erigon-rpc-config.yml';
    await this.configGenerator.renderTemplate('cdk-erigon/config.yml', {
      ...this.config.deployment_args,
      ...this.contractSetupAddresses,
      "zkevm_sequencer_url": zkevm_sequence_url,
      "zkevm_datastreamer_url": zkevm_datastreamer_url,
      "is_sequencer": false,
      "pool_manager_url": pool_manager_url,
      "consensus_contract_type": this.config.deployment_args.consensus_contract_type,
      "l1_sync_start_block": 0,
      "prometheus_port": this.config.deployment_args.prometheus_port,
    }, configName);

    const chainspecName = `dynamic-${this.config.deployment_args.chain_name}-chainspec.json`;
    await this.configGenerator.renderTemplate('cdk-erigon/chainspec.json', {
      "chain_id": this.config.deployment_args.zkevm_rollup_chain_id,
      "enable_normalcy": this.config.deployment_args.enable_normalcy,
      "chain_name": this.config.deployment_args.chain_name,
    }, chainspecName);

    const chainConfigName = `dynamic-${this.config.deployment_args.chain_name}-conf.json`;
    const chainAllocsName = `dynamic-${this.config.deployment_args.chain_name}-allocs.json`;
    const chainFirstBatchName = 'first-batch-config.json';
    
    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'cdk-erigon-rpc',
      config: {
        rpcConfig: {
          path: this.pathManager.getBuildPath(configName),
          name: dockerConfigName,
        },
        rpcChainspec: {
          path: this.pathManager.getBuildPath(chainspecName),
          name: chainspecName,
        },
        rpcChainConfig: {
          path: this.pathManager.getBuildPath(chainConfigName),
          name: chainConfigName,
        },
        rpcChainAllocs: {
          path: this.pathManager.getBuildPath(chainAllocsName),
          name: chainAllocsName,
        },
        rpcChainFirstBatch: {
          path: this.pathManager.getBuildPath(chainFirstBatchName),
          name: chainFirstBatchName,
        },
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'cdk-erigon-rpc-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 cdk rpc 服务...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    // 等待服务启动
    await this.waitForServiceStartup('cdk-erigon-rpc', this.config.static_ports.cdk_erigon_rpc_start_port);
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

    // 生成 prover 服务配置
    await this.configGenerator.renderTemplate('trusted-node/prover-config.json', {
      ...this.config.deployment_args,
      prover_db: {
        hostname: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.prover_db?.name,
        user: this.config.database?.prover_db?.user,
        password: this.config.database?.prover_db?.password
      },
    }, 'prover-config.json');

    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'prover',
      config: {
        proverType: 'prover',
        proverConfigPath: this.pathManager.getBuildPath('prover-config.json'),
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'prover-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 Prover 服务...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    // 等待服务启动
    await this.checkDockerContainerStatus('zkevm-prover');
  }

  private async deployCDKErigonNode(): Promise<void> {
    this.logger.info('部署 cdk erigon node...');

    // 生成 cdk Erigon node 服务配置
    const configName = 'cdk-node-config.toml';
    await this.configGenerator.renderTemplate('trusted-node/cdk-node-config.toml', {
      ...this.config.deployment_args,
      ...this.contractSetupAddresses,
      aggregator_db: {
        hostname: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.central_env_dbs.aggregator_db.name,
        user: this.config.database?.central_env_dbs.aggregator_db.user,
        password: this.config.database?.central_env_dbs.aggregator_db.password
      },
      is_cdk_validium: this.isCDKValidium(),
    }, configName);

    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'cdk-node',
      config: {
        cdkNodeConfig: {
          path: this.pathManager.getBuildPath(configName),
          name: configName,
        },
        cdkNodeGenesis: {
          path: this.pathManager.getBuildPath('genesis.json'),
          name: 'genesis.json',
        },
        cdkNodeAggregatorKeystore: {
          path: this.pathManager.getBuildPath('aggregator.keystore'),
          name: 'aggregator.keystore',
        },
        cdkNodeSequencerKeystore: {
          path: this.pathManager.getBuildPath('sequencer.keystore'),
          name: 'sequencer.keystore',
        },
        cdkNodeClaimsponsorKeystore: {
          path: this.pathManager.getBuildPath('claimsponsor.keystore'),
          name: 'claimsponsor.keystore',
        },
        cdkNodeDatadir: {
          path: this.pathManager.getDataPath('cdk-node-datadir'),
          name: '/data',
        }
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'cdk-erigon-node-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 cdk erigon node...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    // 等待服务启动
    await this.checkDockerContainerStatus('cdk-node');
  }

  private async prepareStatelessExecutorConfig(): Promise<void> {
    this.logger.info('准备stateless-executor配置...');

    // 准备stateless-executor-config.json
    await this.configGenerator.renderTemplate('trusted-node/prover-config.json', {
      ...this.config.deployment_args,
      stateless_executor: true,
    }, 'stateless-executor-config.json');
  }

  private async deployDAC(): Promise<void> {
    this.logger.info('部署 DAC...');

    // 创建 DAC 配置
    await this.configGenerator.renderTemplate('trusted-node/dac-config.toml', {
      ...this.config.deployment_args,
      ...this.contractSetupAddresses,
      dac_db: {
        hostname: this.config.database?.postgres_host,
        port: this.config.database?.postgres_port,
        name: this.config.database?.central_env_dbs.dac_db.name,
        user: this.config.database?.central_env_dbs.dac_db.user,
        password: this.config.database?.central_env_dbs.dac_db.password
      }
    }, 'dac-config.toml');

    // 生成 compose 文件
    const composeGenerator = new CentralEnvironmentComposeGenerator(this.config, this.logger, { name: 'zklink-network' });
    const composeConfig = await composeGenerator.generate({
      type: 'dac',
      config: {
        dacConfig: {
          path: this.pathManager.getBuildPath('dac-config.toml'),
          name: 'dac-config.toml',
        },
        dacKeystore: {
          path: this.pathManager.getBuildPath('dac.keystore'),
          name: 'dac.keystore',
        }
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'dac-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 启动服务
    this.logger.info('启动 DAC 服务...');
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    // 等待服务启动
    // await this.waitForServiceStartup('dac', this.config.static_ports.zkevm_dac_start_port);
    await this.checkDockerContainerStatus('zkevm-dac');
  }

  private isCDKValidium(): boolean {
    return this.config.deployment_args.consensus_contract_type === 'cdk-validium';
  }

  private async checkDockerContainerStatus(serviceName: string): Promise<void> {
    const containerName = `${serviceName}${this.config.deployment_args.deployment_suffix}`;

    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const command = `docker ps -f name=${containerName} --format "{{.Status}}"`;
        const status = execSync(command, { encoding: 'utf-8' }).trim();
        if (!status.includes('Up')) {
          throw new Error(`${serviceName} 服务未启动`);
        }
        this.logger.info(`${serviceName} 服务已启动`);
        return;
      } catch (error) {
        // 忽略错误，继续重试
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`${serviceName} 服务正在启动中... (${retries}/${maxRetries})`);
    }

    throw new Error(`${serviceName} 服务启动失败`);
  }
} 