import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface L1ExtraConfig {
  anvil_script_path: string;
}

export class L1ComposeGenerator extends BaseComposeGenerator {
  private readonly STATE_PATH = "/tmp";

  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: L1ExtraConfig): Promise<DockerComposeConfig> {
    await this.addAnvilService(extraConfig);
    return this.composeConfig;
  }

  private async addAnvilService(extraConfig: L1ExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('anvil');

    // 添加 Anvil 服务配置
    this.addService(serviceName, {
      image: args.anvil_image,
      entrypoint: '/bin/sh',
      command: '/app/start-anvil.sh',
      ports: ['8545:8545'],
      volumes: [
        `${extraConfig.anvil_script_path}:/app/start-anvil.sh`,
        ...(args.anvil_state_file ? [`${args.anvil_state_file}:${this.STATE_PATH}/${args.anvil_state_file}`] : [])
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }
} 