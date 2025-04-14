import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import { PathManager } from '../services/base-deployer';

export interface DockerComposeVolume {
  type: 'bind' | 'volume' | 'tmpfs';
  source: string;
  target: string;
  bind?: {
    create_host_path?: boolean;
  };
}

export interface DockerComposeService {
  container_name?: string;
  image: string;
  user?: string;
  entrypoint?: string | string[];
  command?: string | string[];
  environment?: Record<string, string>;
  ports?: string[];
  expose?: string[];
  volumes?: (string | DockerComposeVolume)[];
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
  protected pathManager: PathManager;

  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    this.config = config;
    this.logger = logger;
    this.network = network;
    this.pathManager = new PathManager();
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