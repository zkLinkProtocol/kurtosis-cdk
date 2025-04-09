import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface BridgeExtraConfig {
  l1_bridge_addr?: string;
  l2_bridge_addr?: string;
}

export class BridgeComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: BridgeExtraConfig): Promise<DockerComposeConfig> {
    await this.addBridgeService(extraConfig);
    await this.addBridgeUiService();
    return this.composeConfig;
  }

  private async addBridgeService(extraConfig: BridgeExtraConfig): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('bridge-service');

    // 添加 Bridge 服务配置
    this.addService(serviceName, {
      image: args.zkevm_bridge_service_image,
      environment: {
        ZKEVM_NODE_URL: `http://localhost:${args.zkevm_rpc_http_port}`,
        L1_RPC_URL: args.l1_rpc_url,
        L1_BRIDGE_ADDR: extraConfig.l1_bridge_addr || '',
        L2_BRIDGE_ADDR: extraConfig.l2_bridge_addr || '',
        METRICS_ENABLED: 'true',
        METRICS_PORT: args.zkevm_bridge_metrics_port.toString()
      },
      ports: [
        `${args.zkevm_bridge_grpc_port}:${args.zkevm_bridge_grpc_port}`,
        `${args.zkevm_bridge_metrics_port}:${args.zkevm_bridge_metrics_port}`,
        `${args.zkevm_bridge_rpc_port}:${args.zkevm_bridge_rpc_port}`
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }

  private async addBridgeUiService(): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = this.getServiceName('bridge-ui');

    // 添加 Bridge UI 服务配置
    this.addService(serviceName, {
      image: args.zkevm_bridge_ui_image,
      environment: {
        BRIDGE_API_URL: `http://localhost:${args.zkevm_bridge_rpc_port}`,
        L1_NETWORK_ID: args.l1_chain_id.toString(),
        L2_NETWORK_ID: args.zkevm_rollup_chain_id.toString(),
        L1_EXPLORER_URL: args.l1_explorer_url,
        L2_EXPLORER_URL: args.polygon_zkevm_explorer || ''
      },
      ports: [
        `${args.zkevm_bridge_ui_port}:80`
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }
} 