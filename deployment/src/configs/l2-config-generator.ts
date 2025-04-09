import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export interface L2Config {
  rpcUrl: string;
  chainId: number;
  contractAddresses: {
    [key: string]: string;
  };
  deployerPrivateKey: string;
  bridgeConfig?: {
    l1ChainId: number;
    l2ChainId: number;
    bridgeAddress: string;
  };
}

export class L2ConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成 L2 配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateConfig(config: L2Config, outputPath: string): Promise<void> {
    const content = this.formatJSON({
      network: {
        rpcUrl: config.rpcUrl,
        chainId: config.chainId
      },
      contracts: config.contractAddresses,
      deployer: {
        privateKey: config.deployerPrivateKey
      },
      bridge: config.bridgeConfig
    });

    await super.generateConfig(content, outputPath);
  }
} 