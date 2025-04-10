import { Logger } from '../utils/logger';
import { DatabaseDeploymentConfig, DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { Client } from 'pg';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import { DatabaseComposeGenerator, DatabaseExtraConfig } from '../compose/database-compose-generator';
import { getDbConfigs } from '../utils/config-loader';
import { ConfigGenerator } from '../utils/config-generator';

// 数据库配置接口
interface DatabaseConfig {
  name: string;
  user: string;
  password: string;
  init?: string;
}

export class DatabaseDeployer extends BaseDeployer {
  private readonly dbConfigs: DatabaseDeploymentConfig[];
  private readonly initScript: string;
  private serviceName: string;

  constructor(config: DeploymentConfig, logger: Logger) {
    super(config, logger);
    this.dbConfigs = getDbConfigs(this.config);
    this.initScript = `init${this.config.deployment_args.deployment_suffix}.sql`;
    this.serviceName = `postgres${this.config.deployment_args.deployment_suffix}`;
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署数据库服务...');
    
    try {
      // 生成 init.sql
      await this.generateInitScript();

      if (this.config.database.use_remote) {
        // 初始化远程数据库
        await this.initializeRemoteDatabase();
      } else {
        // 生成 docker-compose 配置
        await this.generateDockerComposeConfig();
        // 启动数据库服务
        this.startDatabaseServices();
      }
      
      // 等待数据库服务启动
      await this.waitForDatabaseStartup();

      this.logger.info('数据库服务部署完成');
    } catch (error) {
      this.logger.error('数据库服务部署失败:', error);
      throw error;
    }
  }

  private async generateDockerComposeConfig(): Promise<void> {
    // 使用新的compose生成器
    const composeGenerator = new DatabaseComposeGenerator(
      this.config, 
      this.logger,
      { name: 'zklink-network' }
    );

    const extraConfig: DatabaseExtraConfig = {
      dataDir: path.join(this.pathManager.getDataDir()),
      initScript: path.join(this.pathManager.getBuildDir(), this.initScript)
    };

    const composeConfig = await composeGenerator.generate(extraConfig);

    // 写入配置文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'database-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));
  }

  private async waitForDatabaseStartup(): Promise<void> {
    this.logger.info('等待数据库服务启动...');
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 检查主数据库
        execSync(
          `PGPASSWORD=${this.config.database.postgres_master_password} psql -h ${this.config.database.postgres_host} -p ${this.config.static_ports.database_start_port} -U ${this.config.database.postgres_master_user} -d ${this.config.database.postgres_master_db} -c "\\q"`,
          { stdio: 'pipe' }
        );

        this.logger.info('数据库服务已成功启动！');
        return;
      } catch (error) {
        // 忽略错误，继续重试
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`数据库服务正在启动中... (${retries}/${maxRetries})`);
    }
    
    throw new Error('数据库服务启动超时');
  }

  private async startDatabaseServices(): Promise<void> {
    this.logger.info('启动本地数据库...');

    // 使用 Docker Compose 启动数据库服务
    execSync(`docker compose -f ${this.pathManager.getBuildDir()}/database-docker-compose.yml up -d`, { stdio: 'inherit' });
  }

  private async initializeRemoteDatabase(): Promise<void> {
    this.logger.info('初始化远程数据库...');

    const dbConfig = this.config.database
    const client = new Client({
      host: dbConfig.postgres_host,
      port: dbConfig.postgres_port,
      database: dbConfig.postgres_master_db,
      user: dbConfig.postgres_master_user,
      password: dbConfig.postgres_master_password
    });

    try {
      await client.connect();
      
      // 执行初始化脚本
      const initScript = this.readInitSql(this.initScript);
      await client.query(initScript);
      
      // 对于每个数据库,如果有特定的初始化脚本,也需要执行
      for (const dbConfig of this.dbConfigs) {
        if (dbConfig.init) {
          const specialInitScript = this.readInitSql(dbConfig.init, true);
          await client.query(specialInitScript);
        }
      }

      this.logger.info('远程数据库初始化完成');
    } catch (error) {
      this.logger.error('远程数据库初始化失败:', error);
      throw error;
    } finally {
      await client.end();
    }
  }

  private async generateInitScript(): Promise<void> {
    this.logger.info('准备数据库初始化脚本...');

    const configGenerator = new ConfigGenerator(this.config);
    await configGenerator.renderTemplate('databases/init.sql',
      {
        dbs: this.dbConfigs,
        master_db: this.config.database.postgres_master_db,
        master_user: this.config.database.postgres_master_user
      },
      `init${this.config.deployment_args.deployment_suffix}.sql`);
  }

  private readInitSql(filename: string, specialInitScript?: boolean): string {
    if (specialInitScript) {
      const initScriptPath = path.join(this.pathManager.getTemplatesDir(), 'databases', filename);
      return readFileSync(initScriptPath, 'utf8');
    } else {
      const initScriptPath = path.join(this.pathManager.getBuildDir(), filename);
      return readFileSync(initScriptPath, 'utf8');
    }
  }
} 