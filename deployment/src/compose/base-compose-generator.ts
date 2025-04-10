import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';

export interface DockerComposeService {
  image: string;
  entrypoint?: string;
  command?: string;
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  depends_on?: string[];
  networks?: string[];
}

export interface DockerComposeConfig {
  version: string;
  services: {
    [key: string]: DockerComposeService;
  };
  networks?: {
    [key: string]: {
      external?: boolean;
      name?: string;
    };
  };
  volumes?: {
    [key: string]: {
      external?: boolean;
      name?: string;
    };
  };
}

export interface ComposeNetworkConfig {
  name: string;
  isExternal?: boolean;
}

export abstract class BaseComposeGenerator {
  protected readonly config: DeploymentConfig;
  protected readonly logger: Logger;
  protected readonly network: ComposeNetworkConfig;
  protected composeConfig: DockerComposeConfig;

  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    this.config = config;
    this.logger = logger;
    this.network = network;
    this.composeConfig = {
      version: '3.8',
      services: {}
    };
  }

  /**
   * 生成docker-compose配置
   */
  public abstract generate(extraConfig?: Record<string, any>): Promise<DockerComposeConfig>;

  /**
   * 添加服务配置
   */
  protected addService(name: string, service: DockerComposeService): void {
    this.composeConfig.services[name] = service;
  }

  /**
   * 添加网络配置
   */
  protected addNetwork(): void {
    if (!this.composeConfig.networks) {
      this.composeConfig.networks = {};
    }
    this.composeConfig.networks[this.network.name] = {
      external: this.network.isExternal
    };
  }

  /**
   * 获取完整的服务名称（添加部署后缀）
   */
  protected getServiceName(baseName: string): string {
    return `${baseName}${this.config.deployment_args.deployment_suffix}`;
  }
} 