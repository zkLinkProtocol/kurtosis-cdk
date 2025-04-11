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
    const static_ports = this.config.static_ports;
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
        {
          type: 'bind' as const,
          source: extraConfig.proverConfigPath,
          target: '/etc/zkevm/agglayer-prover-config.toml',
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.agglayer_prover_start_port}:${args.agglayer_prover_port}`,
        `${static_ports.agglayer_prover_start_port+1}:${args.agglayer_prover_metrics_port}`
      ],
      entrypoint: ["/usr/local/bin/agglayer"],
      command: ['prover', '--cfg', '/etc/zkevm/agglayer-prover-config.toml'],
      environment: envVars
    });
  }

  private async addAgglayerService(extraConfig: AgglayerExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('agglayer');

    // 添加 Agglayer 服务配置
    this.addService(serviceName, {
      image: args.agglayer_image,
      container_name: `agglayer${args.deployment_suffix}`,
      volumes: [
        {
          type: 'bind' as const,
          source: extraConfig.agglayerConfigPath,
          target: '/etc/zkevm/agglayer-config.toml',
          bind: {
            create_host_path: true
          }
        },
        ...(extraConfig.keystorePath ? [{
          type: 'bind' as const,
          source: extraConfig.keystorePath,
          target: '/etc/zkevm/agglayer.keystore',
          bind: {
            create_host_path: true
          }
        }] : [])
      ],
      ports: [
        `${static_ports.agglayer_start_port}:${args.agglayer_readrpc_port}`,
        `${static_ports.agglayer_start_port+1}:${args.agglayer_metrics_port}`,
        ...(this.agglayer_version(args).startsWith('0.2.') ? [] : [
          `${static_ports.agglayer_start_port+2}:${args.agglayer_grpc_port}`,
          ...(args.agglayer_admin_port !== 0 ? [`${static_ports.agglayer_start_port+3}:${args.agglayer_admin_port}`] : [])
        ])
      ],
      entrypoint: ["/usr/local/bin/agglayer"],
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