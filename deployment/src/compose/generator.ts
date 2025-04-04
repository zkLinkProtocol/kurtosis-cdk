import * as fs from 'fs';
import * as path from 'path';
import { parse as yamlParse } from 'yaml';
// @ts-ignore
const { merge } = require('lodash');

export interface ComposeConfig {
  // 基础配置
  buildDir: string;
  dataDir: string;
  network: string;
  
  // L1配置
  l1RpcUrl: string;
  l1WsUrl: string;
  l1ExplorerUrl: string;
  l1ChainId: number;
  
  // ZKEVM配置
  zkevmRollupChainId: number;
  zkevmRollupId: number;
  
  // 账户配置
  zkevmL2AdminAddress: string;
  zkevmL2AdminPrivateKey: string;
  zkevmL2SequencerAddress: string;
  zkevmL2SequencerPrivateKey: string;
  zkevmL2AggregatorAddress: string;
  zkevmL2AggregatorPrivateKey: string;
  
  // 数据库配置
  postgresDb: string;
  postgresUser: string;
  postgresPassword: string;
  postgresPort: number;
  
  // Blockscout配置
  bsPostgresDb: string;
  bsPostgresUser: string;
  bsPostgresPassword: string;
  bsPostgresPort: number;
  bsBackendPort: number;
  
  // Grafana配置
  grafanaAdminUser: string;
  grafanaAdminPassword: string;
  grafanaPort: number;
  
  // Prometheus配置
  prometheusPort: number;
  
  // 服务端口配置
  zkevmExecutorPort: number;
  zkevmHashDbPort: number;
  zkevmDataStreamerPort: number;
  zkevmPprofPort: number;
  zkevmRpcHttpPort: number;
  zkevmRpcWsPort: number;
  zkevmPoolManagerPort: number;
  zkevmCdkNodePort: number;
  zkevmAggregatorPort: number;
  zkevmDacPort: number;
  zkevmBridgeGrpcPort: number;
  zkevmBridgeMetricsPort: number;
  zkevmBridgeRpcPort: number;
  zkevmBridgeUiPort: number;
  
  // Agglayer配置
  agglayerImage: string;
  agglayerProverPort: number;
  agglayerProverMetricsPort: number;
  agglayerReadrpcPort: number;
  agglayerGrpcPort: number;
  agglayerAdminPort: number;
  agglayerMetricsPort: number;
  agglayerKeystore: string;
  agglayerProverPrimaryProver: string;
  
  // 镜像配置
  zkevmContractsImage: string;
  zkevmProverImage: string;
  cdkErigonNodeImage: string;
  zkevmPoolManagerImage: string;
  cdkNodeImage: string;
  zkevmDaImage: string;
  zkevmBridgeServiceImage: string;
  zkevmBridgeUiImage: string;
}

export class ComposeGenerator {
  private readonly config: ComposeConfig;
  private readonly templateDir: string;
  private readonly outputDir: string;

  constructor(config: ComposeConfig, templateDir: string, outputDir: string) {
    this.config = config;
    this.templateDir = templateDir;
    this.outputDir = outputDir;
  }

  /**
   * 生成环境变量文件
   */
  private generateEnvFile(): string {
    const envVars = {
      // 基础配置
      BUILD_DIR: this.config.buildDir,
      DATA_DIR: this.config.dataDir,
      NETWORK: this.config.network,
      
      // L1配置
      L1_RPC_URL: this.config.l1RpcUrl,
      L1_WS_URL: this.config.l1WsUrl,
      L1_EXPLORER_URL: this.config.l1ExplorerUrl,
      L1_CHAIN_ID: this.config.l1ChainId,
      
      // ZKEVM配置
      ZKEVM_ROLLUP_CHAIN_ID: this.config.zkevmRollupChainId,
      ZKEVM_ROLLUP_ID: this.config.zkevmRollupId,
      
      // 账户配置
      ZKEVM_L2_ADMIN_ADDRESS: this.config.zkevmL2AdminAddress,
      ZKEVM_L2_ADMIN_PRIVATE_KEY: this.config.zkevmL2AdminPrivateKey,
      ZKEVM_L2_SEQUENCER_ADDRESS: this.config.zkevmL2SequencerAddress,
      ZKEVM_L2_SEQUENCER_PRIVATE_KEY: this.config.zkevmL2SequencerPrivateKey,
      ZKEVM_L2_AGGREGATOR_ADDRESS: this.config.zkevmL2AggregatorAddress,
      ZKEVM_L2_AGGREGATOR_PRIVATE_KEY: this.config.zkevmL2AggregatorPrivateKey,
      
      // 数据库配置
      POSTGRES_DB: this.config.postgresDb,
      POSTGRES_USER: this.config.postgresUser,
      POSTGRES_PASSWORD: this.config.postgresPassword,
      POSTGRES_PORT: this.config.postgresPort,
      
      // Blockscout配置
      BS_POSTGRES_DB: this.config.bsPostgresDb,
      BS_POSTGRES_USER: this.config.bsPostgresUser,
      BS_POSTGRES_PASSWORD: this.config.bsPostgresPassword,
      BS_POSTGRES_PORT: this.config.bsPostgresPort,
      BS_BACKEND_PORT: this.config.bsBackendPort,
      
      // Grafana配置
      GRAFANA_ADMIN_USER: this.config.grafanaAdminUser,
      GRAFANA_ADMIN_PASSWORD: this.config.grafanaAdminPassword,
      GRAFANA_PORT: this.config.grafanaPort,
      
      // Prometheus配置
      PROMETHEUS_PORT: this.config.prometheusPort,
      
      // 服务端口配置
      ZKEVM_EXECUTOR_PORT: this.config.zkevmExecutorPort,
      ZKEVM_HASH_DB_PORT: this.config.zkevmHashDbPort,
      ZKEVM_DATA_STREAMER_PORT: this.config.zkevmDataStreamerPort,
      ZKEVM_PPROF_PORT: this.config.zkevmPprofPort,
      ZKEVM_RPC_HTTP_PORT: this.config.zkevmRpcHttpPort,
      ZKEVM_RPC_WS_PORT: this.config.zkevmRpcWsPort,
      ZKEVM_POOL_MANAGER_PORT: this.config.zkevmPoolManagerPort,
      ZKEVM_CDK_NODE_PORT: this.config.zkevmCdkNodePort,
      ZKEVM_AGGREGATOR_PORT: this.config.zkevmAggregatorPort,
      ZKEVM_DAC_PORT: this.config.zkevmDacPort,
      ZKEVM_BRIDGE_GRPC_PORT: this.config.zkevmBridgeGrpcPort,
      ZKEVM_BRIDGE_METRICS_PORT: this.config.zkevmBridgeMetricsPort,
      ZKEVM_BRIDGE_RPC_PORT: this.config.zkevmBridgeRpcPort,
      ZKEVM_BRIDGE_UI_PORT: this.config.zkevmBridgeUiPort,
      
      // Agglayer配置
      AGGLAYER_IMAGE: this.config.agglayerImage,
      AGGLAYER_PROVER_PORT: this.config.agglayerProverPort,
      AGGLAYER_PROVER_METRICS_PORT: this.config.agglayerProverMetricsPort,
      AGGLAYER_READRPC_PORT: this.config.agglayerReadrpcPort,
      AGGLAYER_GRPC_PORT: this.config.agglayerGrpcPort,
      AGGLAYER_ADMIN_PORT: this.config.agglayerAdminPort,
      AGGLAYER_METRICS_PORT: this.config.agglayerMetricsPort,
      AGGLAYER_KEYSTORE: this.config.agglayerKeystore || '',
      AGGLAYER_PROVER_PRIMARY_PROVER: this.config.agglayerProverPrimaryProver || 'mock-prover',
      
      // 镜像配置
      ZKEVM_CONTRACTS_IMAGE: this.config.zkevmContractsImage,
      ZKEVM_PROVER_IMAGE: this.config.zkevmProverImage,
      CDK_ERIGON_NODE_IMAGE: this.config.cdkErigonNodeImage,
      ZKEVM_POOL_MANAGER_IMAGE: this.config.zkevmPoolManagerImage,
      CDK_NODE_IMAGE: this.config.cdkNodeImage,
      ZKEVM_DA_IMAGE: this.config.zkevmDaImage,
      ZKEVM_BRIDGE_SERVICE_IMAGE: this.config.zkevmBridgeServiceImage,
      ZKEVM_BRIDGE_UI_IMAGE: this.config.zkevmBridgeUiImage
    };

    return Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  /**
   * 读取模板文件
   */
  private readTemplate(templateName: string): string {
    const templatePath = path.join(this.templateDir, templateName);
    return fs.readFileSync(templatePath, 'utf8');
  }

  /**
   * 替换模板中的变量
   */
  private replaceVariables(template: string, variables: Record<string, any>): string {
    return template.replace(/\${(\w+)}/g, (match, key) => {
      const value = variables[key];
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  /**
   * 合并多个compose文件
   */
  private mergeComposeFiles(files: string[]): any {
    const merged = {};
    for (const file of files) {
      const content = yamlParse(file) as any;
      merge(merged, content);
    }
    return merged;
  }

  /**
   * 生成完整的docker-compose文件
   */
  public async generate(): Promise<void> {
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 生成环境变量文件
    const envContent = this.generateEnvFile();
    fs.writeFileSync(path.join(this.outputDir, '.env'), envContent);

    // 读取所有模板
    const templates = {
      contracts: this.readTemplate('docker-compose-contracts.yml.tpl'),
      db: this.readTemplate('docker-compose-db.yml.tpl'),
      core: this.readTemplate('docker-compose-core.yml.tpl'),
      node: this.readTemplate('docker-compose-node.yml.tpl'),
      bridge: this.readTemplate('docker-compose-bridge.yml.tpl'),
      monitoring: this.readTemplate('docker-compose-monitoring.yml.tpl'),
      all: this.readTemplate('docker-compose.yml.tpl')
    };

    // 替换变量
    const variables = Object.entries(this.config).reduce((acc, [key, value]) => {
      acc[key.toUpperCase()] = value;
      return acc;
    }, {} as Record<string, any>);

    const processedTemplates = Object.entries(templates).reduce((acc, [key, template]) => {
      acc[key] = this.replaceVariables(template, variables);
      return acc;
    }, {} as Record<string, string>);

    // 写入各个compose文件
    for (const [name, content] of Object.entries(processedTemplates)) {
      const fileName = name === 'all' ? 'docker-compose.yml' : `docker-compose-${name}.yml`;
      fs.writeFileSync(path.join(this.outputDir, fileName), content);
    }
  }

  /**
   * 按阶段生成docker-compose文件
   */
  public async generateByStage(stage: 'contracts' | 'db' | 'core' | 'node' | 'bridge' | 'agglayer' | 'monitoring' | 'all'): Promise<void> {
    // 确保输出目录存在
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // 生成环境变量文件
    const envContent = this.generateEnvFile();
    fs.writeFileSync(path.join(this.outputDir, '.env'), envContent);

    // 读取指定阶段的模板
    const templateName = stage === 'all' ? 'docker-compose.yml.tpl' : `docker-compose-${stage}.yml.tpl`;
    const template = this.readTemplate(templateName);

    // 替换变量
    const variables = Object.entries(this.config).reduce((acc, [key, value]) => {
      acc[key.toUpperCase()] = value;
      return acc;
    }, {} as Record<string, any>);

    const processedTemplate = this.replaceVariables(template, variables);

    // 写入compose文件
    const fileName = stage === 'all' ? 'docker-compose.yml' : `docker-compose-${stage}.yml`;
    fs.writeFileSync(path.join(this.outputDir, fileName), processedTemplate);
  }
}

// 导出默认配置
export const DEFAULT_CONFIG: ComposeConfig = {
  // 基础配置
  buildDir: './build',
  dataDir: './data',
  network: 'zklink-network',
  
  // L1配置
  l1RpcUrl: 'http://localhost:8545',
  l1WsUrl: 'ws://localhost:8546',
  l1ExplorerUrl: 'https://sepolia.etherscan.io/',
  l1ChainId: 271828,
  
  // ZKEVM配置
  zkevmRollupChainId: 10101,
  zkevmRollupId: 1,
  
  // 账户配置
  zkevmL2AdminAddress: '0xE34aaF64b29273B7D567FCFc40544c014EEe9970',
  zkevmL2AdminPrivateKey: '0x12d7de8621a77640c9241b2595ba78ce443d05e94090365ab3bb5e19df82c625',
  zkevmL2SequencerAddress: '0x5b06837A43bdC3dD9F114558DAf4B26ed49842Ed',
  zkevmL2SequencerPrivateKey: '0x183c492d0ba156041a7f31a1b188958a7a22eebadca741a7fe64436092dc3181',
  zkevmL2AggregatorAddress: '0xCae5b68Ff783594bDe1b93cdE627c741722c4D4d',
  zkevmL2AggregatorPrivateKey: '0x2857ca0e7748448f3a50469f7ffe55cde7299d5696aedd72cfe18a06fb856970',
  
  // 数据库配置
  postgresDb: 'zkevm_db',
  postgresUser: 'postgres',
  postgresPassword: 'postgres',
  postgresPort: 5432,
  
  // Blockscout配置
  bsPostgresDb: 'blockscout',
  bsPostgresUser: 'postgres',
  bsPostgresPassword: 'postgres',
  bsPostgresPort: 5433,
  bsBackendPort: 4004,
  
  // Grafana配置
  grafanaAdminUser: 'admin',
  grafanaAdminPassword: 'admin',
  grafanaPort: 3000,
  
  // Prometheus配置
  prometheusPort: 9090,
  
  // 服务端口配置
  zkevmExecutorPort: 50071,
  zkevmHashDbPort: 50061,
  zkevmDataStreamerPort: 6900,
  zkevmPprofPort: 6060,
  zkevmRpcHttpPort: 8123,
  zkevmRpcWsPort: 8133,
  zkevmPoolManagerPort: 8545,
  zkevmCdkNodePort: 5576,
  zkevmAggregatorPort: 50081,
  zkevmDacPort: 8484,
  zkevmBridgeGrpcPort: 9090,
  zkevmBridgeMetricsPort: 8090,
  zkevmBridgeRpcPort: 8080,
  zkevmBridgeUiPort: 80,
  
  // Agglayer配置
  agglayerImage: 'ghcr.io/agglayer/agglayer:0.3.0-rc.5',
  agglayerProverPort: 4445,
  agglayerProverMetricsPort: 9093,
  agglayerReadrpcPort: 4444,
  agglayerGrpcPort: 4443,
  agglayerAdminPort: 4446,
  agglayerMetricsPort: 9092,
  agglayerKeystore: 'agglayer.keystore',
  agglayerProverPrimaryProver: 'mock-prover',
  
  // 镜像配置
  zkevmContractsImage: 'leovct/zkevm-contracts:v10.0.0-rc.3-fork.12',
  zkevmProverImage: 'hermeznetwork/zkevm-prover:v8.0.0-RC16-fork.12',
  cdkErigonNodeImage: 'hermeznetwork/cdk-erigon:v2.61.19',
  zkevmPoolManagerImage: 'hermeznetwork/zkevm-pool-manager:v0.1.2',
  cdkNodeImage: 'ghcr.io/0xpolygon/cdk:0.5.3-rc1',
  zkevmDaImage: 'ghcr.io/0xpolygon/cdk-data-availability:0.0.13',
  zkevmBridgeServiceImage: 'hermeznetwork/zkevm-bridge-service:v0.6.0-RC15',
  zkevmBridgeUiImage: 'leovct/zkevm-bridge-ui:multi-network'
}; 