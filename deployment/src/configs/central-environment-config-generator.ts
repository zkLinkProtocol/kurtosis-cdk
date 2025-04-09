import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export interface CentralEnvironmentConfig {
  environment: string;
  services: {
    [key: string]: {
      image: string;
      port: number;
      env: Record<string, string>;
      volumes?: string[];
    };
  };
  networks: {
    [key: string]: {
      rpcUrl: string;
      chainId: number;
      contracts: Record<string, string>;
    };
  };
  databases: {
    [key: string]: {
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
    };
  };
}

export class CentralEnvironmentConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成中心环境配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateConfig(config: CentralEnvironmentConfig, outputPath: string): Promise<void> {
    // 处理数据库 URL
    const databases = Object.entries(config.databases).reduce((acc, [key, db]) => {
      acc[key] = {
        ...db,
        url: `postgresql://${db.user}:${db.password}@${db.host}:${db.port}/${db.database}`
      };
      return acc;
    }, {} as Record<string, any>);

    const content = this.formatJSON({
      environment: config.environment,
      services: config.services,
      networks: config.networks,
      databases
    });

    await super.generateConfig(content, outputPath);
  }

  /**
   * 生成 Docker Compose 配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateDockerCompose(config: CentralEnvironmentConfig, outputPath: string): Promise<void> {
    const services = Object.entries(config.services).reduce((acc, [name, service]) => {
      acc[name] = {
        image: service.image,
        ports: [`${service.port}:${service.port}`],
        environment: service.env,
        ...(service.volumes ? { volumes: service.volumes } : {})
      };
      return acc;
    }, {} as Record<string, any>);

    const content = this.formatYAML({
      version: '3.8',
      services
    });

    await super.generateConfig(content, outputPath);
  }

  private formatYAML(obj: any): string {
    // TODO: 实现 YAML 格式化
    throw new Error('YAML formatting not implemented yet');
  }
} 