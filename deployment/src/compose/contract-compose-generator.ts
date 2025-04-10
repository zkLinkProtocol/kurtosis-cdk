import { BaseComposeGenerator, DockerComposeConfig, DockerComposeService, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';
import { PathManager } from '../services/base-deployer';

export interface ContractExtraConfig {
  artifacts: string[];
}

export class ContractComposeGenerator extends BaseComposeGenerator {
  private readonly pathManager: PathManager;

  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
    this.pathManager = new PathManager();
  }

  public async generate(extraConfig: ContractExtraConfig): Promise<DockerComposeConfig> {
    await this.addContractService(extraConfig);
    this.addNetwork();

    // 添加必要的卷定义
    if (!this.composeConfig.volumes) {
      this.composeConfig.volumes = {};
    }
    this.composeConfig.volumes['zkevm-artifacts'] = {};

    return this.composeConfig;
  }

  private async addContractService(extraConfig: ContractExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('contracts');

    // 添加合约部署服务配置
    this.addService(serviceName, {
      image: args.zkevm_contracts_image,
      container_name: serviceName,
      user: 'root',
      volumes: [
        'zkevm-artifacts:/opt/zkevm',
        ...extraConfig.artifacts.map((artifact: string) => 
          `${path.join(this.pathManager.getBuildDir(), artifact)}:/opt/contract-deploy/${artifact}`
        )
      ],
      entrypoint: ['bash', '-c'],
      command: ['sleep infinity']
    });
  }
} 