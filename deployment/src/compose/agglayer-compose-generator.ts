import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface AgglayerExtraConfig {
  proverConfigPath: string;
  agglayerConfigPath: string;
  keystorePath?: string;
}

export class AgglayerComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: AgglayerExtraConfig): Promise<DockerComposeConfig> {
    // 添加 Agglayer Prover 服务
    await this.addAgglayerProverService(extraConfig);
    // 添加 Agglayer 服务
    await this.addAgglayerService(extraConfig);
    return this.composeConfig;
  }

  private async addAgglayerProverService(extraConfig: AgglayerExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('agglayer-prover');

    // 准备环境变量
    const envVars: Record<string, string> = {
      RUST_BACKTRACE: '1'
    };

    // 如果提供了SP1密钥，则设置网络相关环境变量
    if (args.agglayer_prover_sp1_key) {
      envVars.NETWORK_PRIVATE_KEY = args.agglayer_prover_sp1_key;
      envVars.SP1_PRIVATE_KEY = args.agglayer_prover_sp1_key;
      envVars.NETWORK_RPC_URL = args.agglayer_prover_network_url;
    }

    // 添加 Agglayer Prover 服务配置
    this.addService(serviceName, {
      image: args.agglayer_image,
      container_name: `agglayer-prover${args.deployment_suffix}`,
      volumes: [
        `${extraConfig.proverConfigPath}:/etc/zkevm/agglayer-prover-config.toml`
      ],
      ports: [
        `${args.agglayer_prover_port}:${args.agglayer_prover_port}`,
        `${args.agglayer_prover_metrics_port}:${args.agglayer_prover_metrics_port}`
      ],
      entrypoint: ["/usr/local/bin/agglayer"],
      command: ['run', '--cfg', '/etc/zkevm/agglayer-prover-config.toml'],
      environment: envVars
    });
  }

  private async addAgglayerService(extraConfig: AgglayerExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('agglayer');

    // 添加 Agglayer 服务配置
    this.addService(serviceName, {
      image: args.agglayer_image,
      container_name: `agglayer${args.deployment_suffix}`,
      volumes: [
        `${extraConfig.agglayerConfigPath}:/etc/zkevm`,
        ...(extraConfig.keystorePath ? [`${extraConfig.keystorePath}:/opt/zkevm/agglayer.keystore`] : [])
      ],
      ports: [
        `${args.agglayer_readrpc_port}:${args.agglayer_readrpc_port}`,
        `${args.agglayer_metrics_port}:${args.agglayer_metrics_port}`,
        ...(this.agglayer_version(args).startsWith('0.2.') ? [] : [
          `${args.agglayer_grpc_port}:${args.agglayer_grpc_port}`,
          ...(args.agglayer_admin_port !== 0 ? [`${args.agglayer_admin_port}:${args.agglayer_admin_port}`] : [])
        ])
      ],
      command: ['run', '--cfg', '/etc/zkevm/agglayer-config.toml'],
      environment: {
        RUST_BACKTRACE: '1'
      }
    });

    // 添加网络配置
    this.addNetwork();
  }

  private agglayer_version(args: any): string {
    if (args.agglayer_version) {
      return args.agglayer_version;
    } else if (args.agglayer_image && typeof args.agglayer_image === 'string' && args.agglayer_image.includes(":")) {
      return args.agglayer_image.split(":")[1];
    } else {
      return "latest";
    }
  }
} 