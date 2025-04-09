import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export interface BridgeConfig {
  l1Chain: {
    chainId: number;
    rpcUrl: string;
    contracts: Record<string, string>;
  };
  l2Chains: {
    chainId: number;
    rpcUrl: string;
    contracts: Record<string, string>;
  }[];
  bridgeContracts: {
    [chainId: number]: {
      bridge: string;
      token: string;
    };
  };
}

export class BridgeConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成桥接配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateConfig(config: BridgeConfig, outputPath: string): Promise<void> {
    const content = this.formatJSON({
      l1: {
        chainId: config.l1Chain.chainId,
        rpcUrl: config.l1Chain.rpcUrl,
        contracts: {
          ...config.l1Chain.contracts,
          bridge: config.bridgeContracts[config.l1Chain.chainId]?.bridge,
          token: config.bridgeContracts[config.l1Chain.chainId]?.token
        }
      },
      l2s: config.l2Chains.map(chain => ({
        chainId: chain.chainId,
        rpcUrl: chain.rpcUrl,
        contracts: {
          ...chain.contracts,
          bridge: config.bridgeContracts[chain.chainId]?.bridge,
          token: config.bridgeContracts[chain.chainId]?.token
        }
      }))
    });

    await super.generateConfig(content, outputPath);
  }
} 