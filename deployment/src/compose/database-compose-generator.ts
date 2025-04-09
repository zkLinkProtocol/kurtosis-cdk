import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface DatabaseExtraConfig {
  dataDir: string;
}

export class DatabaseComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: DatabaseExtraConfig): Promise<DockerComposeConfig> {
    await this.addPostgresService(extraConfig);
    await this.addBlockscoutPostgresService(extraConfig);
    return this.composeConfig;
  }

  private async addPostgresService(extraConfig: DatabaseExtraConfig): Promise<void> {
    const db = this.config.database;
    const serviceName = this.getServiceName('postgres');

    // 添加 Postgres 服务配置
    this.addService(serviceName, {
      image: 'postgres:15-alpine',
      environment: {
        POSTGRES_DB: db.postgres_master_db,
        POSTGRES_USER: db.postgres_master_user,
        POSTGRES_PASSWORD: db.postgres_master_password
      },
      ports: [`${db.postgres_port}:5432`],
      volumes: [
        `${path.join(extraConfig.dataDir, 'postgres')}:/var/lib/postgresql/data`
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }

  private async addBlockscoutPostgresService(extraConfig: DatabaseExtraConfig): Promise<void> {
    const serviceName = this.getServiceName('blockscout-postgres');

    // 添加 Blockscout Postgres 服务配置
    this.addService(serviceName, {
      image: 'postgres:15-alpine',
      environment: {
        POSTGRES_DB: 'blockscout',
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'postgres'
      },
      ports: ['5433:5432'],
      volumes: [
        `${path.join(extraConfig.dataDir, 'blockscout-postgres')}:/var/lib/postgresql/data`
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }
} 