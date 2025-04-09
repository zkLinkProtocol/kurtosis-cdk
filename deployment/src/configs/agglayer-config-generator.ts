import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export interface AgglayerConfig {
  port: number;
  host: string;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  chains: {
    chainId: number;
    rpcUrl: string;
    contracts: {
      [key: string]: string;
    };
  }[];
}

export class AgglayerConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成聚合层配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateConfig(config: AgglayerConfig, outputPath: string): Promise<void> {
    const content = this.formatJSON({
      server: {
        port: config.port,
        host: config.host
      },
      database: {
        ...config.database,
        url: `postgresql://${config.database.user}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.database}`
      },
      chains: config.chains.reduce((acc, chain) => {
        acc[chain.chainId] = {
          rpcUrl: chain.rpcUrl,
          contracts: chain.contracts
        };
        return acc;
      }, {} as Record<number, any>)
    });

    await super.generateConfig(content, outputPath);
  }
} 