import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class DatabaseConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成数据库配置
   * @param config 配置参数
   * @param outputPath 输出路径
   */
  async generateConfig(config: DatabaseConfig, outputPath: string): Promise<void> {
    const content = this.formatJSON({
      database: {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        url: `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`
      }
    });

    await super.generateConfig(content, outputPath);
  }
} 