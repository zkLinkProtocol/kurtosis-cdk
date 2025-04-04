import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Keystore 文件集合
interface KeystoreArtifacts {
  sequencer: string;
  aggregator: string;
  proofsigner: string;
  dac: string;
  claimsponsor: string;
}

// 合约设置地址
interface ContractSetupAddresses {
  polygonRollupManagerAddress: string;
  polygonZkEVMBridgeAddress: string;
  polygonZkEVMGlobalExitRootAddress: string;
  aggLayerGatewayAddress: string;
  [key: string]: string;
}

export class CentralEnvironmentDeployer {
  private readonly config: DeploymentConfig;
  private readonly logger: Logger;
  private readonly workDir: string;
  private readonly contractAddresses: ContractSetupAddresses;

  constructor(
    config: DeploymentConfig, 
    logger: Logger,
    contractAddresses: ContractSetupAddresses
  ) {
    this.config = config;
    this.logger = logger;
    this.workDir = path.join(process.cwd(), 'deployment');
    this.contractAddresses = contractAddresses;
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署 CDK 中心环境...');

      // 1. 部署 Prover (如果需要)
      if (this.shouldDeployProver()) {
        await this.deployProver();
      }

      // 2. 获取 Genesis 文件
      const genesisArtifact = await this.getGenesisArtifact();

      // 3. 获取 Keystore 文件
      const keystores = await this.getKeystoreArtifacts();

      // 4. 根据 sequencer 类型部署相应组件
      if (this.config.sequencer_type === 'zkevm') {
        await this.deployZkEVMComponents(genesisArtifact, keystores);
      } else {
        await this.deployCDKErigonComponents(genesisArtifact, keystores);
      }

      // 5. 如果是 validium 模式,部署 DAC
      if (this.isCDKValidium()) {
        await this.deployDAC(keystores);
      }

      this.logger.info('CDK 中心环境部署完成');
    } catch (error) {
      this.logger.error('CDK 中心环境部署失败:', error);
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

    // 创建 Prover 服务
    const proverServiceName = `zkevm-prover${this.config.deployment_suffix}`;

    // 构建 Docker 运行命令
    let cmd = `docker run -d \
      --name ${proverServiceName}`;

    // 添加端口映射
    if (this.config.prover?.prover_config) {
      const ports = this.config.prover.prover_config;
      cmd += ` \
      -p ${ports.executor_port}:${ports.executor_port} \
      -p ${ports.hash_db_port}:${ports.hash_db_port} \
      -p ${ports.metrics_port}:${ports.metrics_port}`;
    }

    // 添加配置文件挂载
    cmd += ` \
      -v ${configPath}:/app/config.json \
      ${this.config.images.zkevm_prover_image}`;

    execSync(cmd);

    // 等待 Prover 启动
    await this.waitForProver(proverServiceName);
  }

  private async waitForProver(serviceName: string): Promise<void> {
    this.logger.info('等待 Prover 启动...');
    
    let retries = 30;
    while (retries > 0) {
      try {
        // 检查 Prover 的健康状态
        execSync(`docker exec ${serviceName} curl -s http://localhost:${this.config.prover?.prover_config?.metrics_port || 9092}/metrics`);
        this.logger.info('Prover 已就绪');
        return;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('Prover 启动超时');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async getGenesisArtifact(): Promise<string> {
    this.logger.info('获取 Genesis 文件...');

    if (this.config['genesis_artifact']) {
      return this.config['genesis_artifact'];
    }

    const genesisTemplate = this.readTemplate(this.config.genesis_file);
    const genesisContent = this.renderTemplate(genesisTemplate, {});
    
    const outputPath = path.join(this.workDir, 'build', 'genesis.json');
    writeFileSync(outputPath, genesisContent);
    
    return outputPath;
  }

  private async getKeystoreArtifacts(): Promise<KeystoreArtifacts> {
    this.logger.info('获取 Keystore 文件...');

    const contractsService = `contracts${this.config.deployment_suffix}`;
    const keystoreFiles = {
      sequencer: 'sequencer.keystore',
      aggregator: 'aggregator.keystore',
      proofsigner: 'proofsigner.keystore',
      dac: 'dac.keystore',
      claimsponsor: 'claimsponsor.keystore'
    };

    const artifacts: Partial<KeystoreArtifacts> = {};
    for (const [key, filename] of Object.entries(keystoreFiles)) {
      const sourcePath = path.join('/opt/zkevm', filename);
      const targetPath = path.join(this.workDir, 'build', filename);
      
      execSync(`docker cp ${contractsService}:${sourcePath} ${targetPath}`);
      artifacts[key] = targetPath;
    }

    return artifacts as KeystoreArtifacts;
  }

  private async deployZkEVMComponents(
    genesisArtifact: string,
    keystores: KeystoreArtifacts
  ): Promise<void> {
    this.logger.info('部署 zkEVM 组件...');

    // 1. 创建节点配置
    const nodeConfigTemplate = this.readTemplate('trusted-node/node-config.toml');
    const nodeConfig = this.renderTemplate(nodeConfigTemplate, {
      ...this.config,
      is_cdk_validium: this.isCDKValidium()
    });

    // 2. 部署同步器
    await this.deployZkEVMSynchronizer(nodeConfig, genesisArtifact);

    // 3. 部署其他 zkEVM 节点组件
    await this.deployZkEVMNodeComponents(nodeConfig, genesisArtifact, keystores);
  }

  private async deployCDKErigonComponents(
    genesisArtifact: string,
    keystores: KeystoreArtifacts
  ): Promise<void> {
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

    // 3. 部署 CDK Erigon 节点
    await this.deployCDKErigonNode(erigonConfig, genesisArtifact, keystores);
  }

  private async deployDAC(keystores: KeystoreArtifacts): Promise<void> {
    this.logger.info('部署 DAC...');

    // 创建 DAC 配置
    const dacConfigTemplate = this.readTemplate('trusted-node/dac-config.toml');
    const dacConfig = this.renderTemplate(dacConfigTemplate, {
      ...this.config,
      ...this.contractAddresses
    });

    // 部署 DAC 服务
    const dacServiceName = `zkevm-dac${this.config.deployment_suffix}`;
    const cmd = `docker run -d \
      --name ${dacServiceName} \
      -v ${path.join(this.workDir, 'build', 'dac-config.toml')}:/app/config.toml \
      -v ${keystores.dac}:/app/keystore \
      ${this.config.images.zkevm_da_image}`;

    execSync(cmd);
  }

  private isCDKValidium(): boolean {
    return this.config.consensus_contract_type === 'cdk-validium';
  }

  private readTemplate(templatePath: string): string {
    return readFileSync(path.join(this.workDir, 'templates', templatePath), 'utf8');
  }

  private renderTemplate(template: string, data: any): string {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value.toString());
    }
    return result;
  }

  // 以下是具体组件部署的辅助方法
  private async deployZkEVMSynchronizer(nodeConfig: string, genesisArtifact: string): Promise<void> {
    this.logger.info('部署 zkEVM 同步器...');

    const synchronizerServiceName = `zkevm-node-synchronizer${this.config.deployment_suffix}`;
    const cmd = `docker run -d \
      --name ${synchronizerServiceName} \
      -v ${path.join(this.workDir, 'build', 'node-config.toml')}:/app/config.toml \
      -v ${genesisArtifact}:/app/genesis.json \
      ${this.config.images.zkevm_node_image} \
      synchronizer`;

    execSync(cmd);
  }

  private async deployZkEVMNodeComponents(
    nodeConfig: string, 
    genesisArtifact: string,
    keystores: KeystoreArtifacts
  ): Promise<void> {
    this.logger.info('部署 zkEVM 节点组件...');

    // 部署聚合器
    const aggregatorServiceName = `zkevm-node-aggregator${this.config.deployment_suffix}`;
    execSync(`docker run -d \
      --name ${aggregatorServiceName} \
      -v ${path.join(this.workDir, 'build', 'node-config.toml')}:/app/config.toml \
      -v ${genesisArtifact}:/app/genesis.json \
      -v ${keystores.aggregator}:/app/aggregator.keystore \
      ${this.config.images.zkevm_node_image} \
      aggregator`);

    // 部署 RPC 节点
    const rpcServiceName = `zkevm-node-rpc${this.config.deployment_suffix}`;
    execSync(`docker run -d \
      --name ${rpcServiceName} \
      -v ${path.join(this.workDir, 'build', 'node-config.toml')}:/app/config.toml \
      -v ${genesisArtifact}:/app/genesis.json \
      ${this.config.images.zkevm_node_image} \
      rpc`);

    // 部署 Sequence Sender
    const sequenceSenderServiceName = `zkevm-sequence-sender${this.config.deployment_suffix}`;
    execSync(`docker run -d \
      --name ${sequenceSenderServiceName} \
      -v ${path.join(this.workDir, 'build', 'node-config.toml')}:/app/config.toml \
      -v ${keystores.sequencer}:/app/sequencer.keystore \
      ${this.config.images.zkevm_sequence_sender_image}`);
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

    // 创建执行器服务
    const executorServiceName = `zkevm-stateless-executor${this.config.deployment_suffix}`;
    
    // 构建 Docker 运行命令
    let cmd = `docker run -d \
      --name ${executorServiceName}`;

    // 添加端口映射
    if (this.config.prover?.prover_config) {
      const ports = this.config.prover.prover_config;
      cmd += ` \
      -p ${ports.executor_port}:${ports.executor_port}`;
    }

    // 添加配置文件挂载和启动命令
    cmd += ` \
      -v ${configPath}:/app/config.json \
      ${this.config.images.zkevm_prover_image} \
      --config /app/config.json \
      --mode executor`;

    execSync(cmd);

    // 等待执行器启动
    await this.waitForExecutor(executorServiceName);
  }

  private async waitForExecutor(serviceName: string): Promise<void> {
    this.logger.info('等待执行器启动...');
    
    let retries = 30;
    while (retries > 0) {
      try {
        // 检查执行器的健康状态
        execSync(`docker exec ${serviceName} curl -s http://localhost:${this.config.prover?.prover_config?.executor_port || 50071}/health`);
        this.logger.info('执行器已就绪');
        return;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('执行器启动超时');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async deployCDKErigonNode(
    erigonConfig: string,
    genesisArtifact: string,
    keystores: KeystoreArtifacts
  ): Promise<void> {
    this.logger.info('部署 CDK Erigon 节点...');

    // 准备链规范配置
    const chainSpecTemplate = this.readTemplate('cdk-erigon/chainspec.json');
    const chainSpec = this.renderTemplate(chainSpecTemplate, {
      chain_id: this.config.zkevm_rollup_chain_id,
      enable_normalcy: this.config.enable_normalcy,
      chain_name: this.config.chain_name
    });

    // 创建数据目录
    const dataDirPath = path.join(this.workDir, 'data', `cdk-erigon${this.config.deployment_suffix}`);
    execSync(`mkdir -p ${dataDirPath}`);

    // 部署 CDK Erigon 节点
    const erigonServiceName = `cdk-erigon${this.config.deployment_suffix}`;
    const cmd = `docker run -d \
      --name ${erigonServiceName} \
      -v ${path.join(this.workDir, 'build', 'config.yml')}:/app/config.yml \
      -v ${path.join(this.workDir, 'build', 'chainspec.json')}:/app/chainspec.json \
      -v ${genesisArtifact}:/app/genesis.json \
      -v ${dataDirPath}:/data \
      -v ${keystores.sequencer}:/app/sequencer.keystore \
      ${this.config.images.cdk_erigon_node_image} \
      --config /app/config.yml \
      --datadir /data \
      --chain.config /app/chainspec.json`;

    execSync(cmd);

    // 等待节点启动
    await this.waitForErigonNode(erigonServiceName);
  }

  private async waitForErigonNode(serviceName: string): Promise<void> {
    this.logger.info('等待 CDK Erigon 节点启动...');
    
    let retries = 30;
    while (retries > 0) {
      try {
        execSync(`docker exec ${serviceName} curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}' http://localhost:8545`);
        this.logger.info('CDK Erigon 节点已就绪');
        return;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('CDK Erigon 节点启动超时');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
} 