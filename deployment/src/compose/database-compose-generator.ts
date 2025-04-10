import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';

export interface DatabaseExtraConfig {
  dataDir: string;
  initScript: string;
}

export class DatabaseComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: DatabaseExtraConfig): Promise<DockerComposeConfig> {
    await this.addPostgresService(extraConfig);
    return this.composeConfig;
  }

  private async addPostgresService(extraConfig: DatabaseExtraConfig): Promise<void> {
    const db = this.config.database;
    const serviceName = this.getServiceName('postgres');

    // 添加 Postgres 服务配置
    this.addService(serviceName, {
      image: 'postgres:16.2',
      container_name: `postgres${this.config.deployment_args.deployment_suffix}`,
      environment: {
        POSTGRES_DB: db.postgres_master_db,
        POSTGRES_USER: db.postgres_master_user,
        POSTGRES_PASSWORD: db.postgres_master_password
      },
      ports: [`${this.config.static_ports.database_start_port}:5432`],
      volumes: [
        `${path.join(extraConfig.dataDir, 'postgres')}:/var/lib/postgresql/data`,
        `${extraConfig.initScript}:/docker-entrypoint-initdb.d/init.sql`
      ]
    });

    // 添加网络配置
    this.addNetwork();
  }

  // private async addProverPostgresService(extraConfig: DatabaseExtraConfig): Promise<void> {
  //   const db = this.config.database;
  //   const serviceName = this.getServiceName('prover-postgres');

  //   // 添加 Prover Postgres 服务配置
  //   this.addService(serviceName, {
  //     image: 'postgres:16.2',
  //     environment: {
  //       POSTGRES_DB: db.prover_db.name,
  //       POSTGRES_USER: db.prover_db.user,
  //       POSTGRES_PASSWORD: db.prover_db.password
  //     },
  //     ports: [`${this.config.static_ports.database_start_port+1}:5432`],
  //     volumes: [
  //       `${path.join(extraConfig.dataDir, 'prover-postgres')}:/var/lib/postgresql/data`
  //     ]
  //   });

  //   // 添加网络配置
  //   this.addNetwork();
  // }

  // private async addBlockscoutPostgresService(extraConfig: DatabaseExtraConfig): Promise<void> {
  //   const serviceName = this.getServiceName('blockscout-postgres');

  //   // 添加 Blockscout Postgres 服务配置
  //   this.addService(serviceName, {
  //     image: 'postgres:16.2',
  //     environment: {
  //       POSTGRES_DB: 'blockscout',
  //       POSTGRES_USER: 'postgres',
  //       POSTGRES_PASSWORD: 'postgres'
  //     },
  //     ports: [`${this.config.static_ports.database_start_port+2}:5432`],
  //     volumes: [
  //       `${path.join(extraConfig.dataDir, 'blockscout-postgres')}:/var/lib/postgresql/data`
  //     ]
  //   });

  //   // 添加网络配置
  //   this.addNetwork();
  // }
} 