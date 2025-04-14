import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface Artifact {
  path: string;
  name: string;
}

export interface BridgeExtraConfig {
  bridge_service_config: Artifact;
  claimtx_keystore: Artifact;
  bridge_ui_config: Artifact;
  reverse_proxy_config: Artifact;
}

export class BridgeComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: BridgeExtraConfig): Promise<DockerComposeConfig> {
    await this.addBridgeService(extraConfig);
    await this.addBridgeUiService(extraConfig);
    await this.addReverseProxy(extraConfig);
    this.addNetwork();
    return this.composeConfig;
  }

  private async addBridgeService(extraConfig: BridgeExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('zkevm-bridge-service');

    // 添加 Bridge 服务配置
    this.addService(serviceName, {
      image: args.zkevm_bridge_service_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind',
          source: extraConfig.bridge_service_config.path,
          target: `/etc/zkevm/${extraConfig.bridge_service_config.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind',
          source: extraConfig.claimtx_keystore.path,
          target: `/etc/zkevm/${extraConfig.claimtx_keystore.name}`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.zkevm_bridge_service_start_port}:${args.zkevm_bridge_rpc_port}`, // rpc
        `${static_ports.zkevm_bridge_service_start_port + 1}:${args.zkevm_bridge_grpc_port}`, // grpc
        `${static_ports.zkevm_bridge_service_start_port + 2}:${args.zkevm_bridge_metrics_port}` // metrics
      ],
      entrypoint: [
        "/app/zkevm-bridge",
      ],
      command: ["run", "--cfg", `/etc/zkevm/${extraConfig.bridge_service_config.name}`],
    });
  }

  private async addBridgeUiService(extraConfig: BridgeExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('zkevm-bridge-ui');

    // 添加 Bridge UI 服务配置
    this.addService(serviceName, {
      image: args.zkevm_bridge_ui_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind',
          source: extraConfig.bridge_ui_config.path,
          target: `/etc/zkevm/${extraConfig.bridge_ui_config.name}`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.zkevm_bridge_ui_start_port}:${args.zkevm_bridge_ui_port}`
      ],
      entrypoint: ["/bin/sh", "-c"],
      command: ["set -a; source /etc/zkevm/.env; set +a; sh /app/scripts/deploy.sh run"]
    });
  }

  private async addReverseProxy(extraConfig: BridgeExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('zkevm-bridge-proxy');

    // 添加 Reverse Proxy 服务配置
    this.addService(serviceName, {
      image: args.zkevm_bridge_proxy_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind',
          source: extraConfig.reverse_proxy_config.path,
          target: `/usr/local/etc/haproxy/${extraConfig.reverse_proxy_config.name}`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.reverse_proxy_start_port}:80`
      ]
    });
  }
} 
