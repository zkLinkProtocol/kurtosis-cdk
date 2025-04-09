import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { Client } from 'pg';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import { DatabaseComposeGenerator, DatabaseExtraConfig } from '../compose/database-compose-generator';


// 数据库配置接口
interface DatabaseConfig {
  name: string;
  user: string;
  password: string;
  init?: string;
}

export class DatabaseDeployer extends BaseDeployer {
  constructor(config: DeploymentConfig, logger: Logger) {
    super(config, logger);
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署数据库服务...');
    
    try {
      // 生成 docker-compose 配置
      const composePath = await this.generateDockerComposeConfig();

      // 启动数据库服务
      this.startDatabaseServices(composePath);

      // 等待数据库服务启动
      await this.waitForDatabaseStartup();

      this.logger.info('数据库服务部署完成');
    } catch (error) {
      this.logger.error('数据库服务部署失败:', error);
      throw error;
    }
  }

  private async generateDockerComposeConfig(): Promise<string> {
    // 使用新的compose生成器
    const composeGenerator = new DatabaseComposeGenerator(
      this.config, 
      this.logger,
      { name: 'zklink-network' }
    );

    const extraConfig: DatabaseExtraConfig = {
      dataDir: path.join(this.pathManager.getDataDir())
    };

    const composeConfig = await composeGenerator.generate(extraConfig);

    // 写入配置文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'database-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));
    return composePath;
  }

  private startDatabaseServices(composePath: string): void {
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  }

  private async waitForDatabaseStartup(): Promise<void> {
    this.logger.info('等待数据库服务启动...');
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 检查主数据库
        execSync(
          `PGPASSWORD=${this.config.database.postgres_master_password} psql -h localhost -U ${this.config.database.postgres_master_user} -d ${this.config.database.postgres_master_db} -c "\\q"`,
          { stdio: 'pipe' }
        );

        // 检查 Blockscout 数据库
        execSync(
          'PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d blockscout -c "\\q"',
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

  private async deployLocalDatabase(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
    this.logger.info('部署本地数据库...');

    // 使用 Docker Compose 启动数据库服务
    // await this.startServices('db');
    // await this.waitForHealthy('db');
  }

  private async initializeRemoteDatabase(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
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
      const initScript = this.readInitSql(`init${this.config.deployment_args.deployment_suffix}.sql`);
      await client.query(initScript);
      
      // 对于每个数据库,如果有特定的初始化脚本,也需要执行
      for (const [key, db] of Object.entries(dbConfigs)) {
        if (db.init) {
          await client.query(`\\c ${db.name}`);
          await client.query(db.init);
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

  private getDbConfigs(): Record<string, DatabaseConfig> {
    // 中心环境数据库
    const CENTRAL_ENV_DBS: Record<string, DatabaseConfig> = {
      aggregator_db: {
        name: 'aggregator_db',
        user: 'aggregator_user',
        password: 'redacted'
      },
      aggregator_syncer_db: {
        name: 'aggregator_syncer_db',
        user: 'aggregator_syncer_db_user',
        password: 'redacted'
      },
      bridge_db: {
        name: 'bridge_db',
        user: 'bridge_user',
        password: 'redacted'
      },
      dac_db: {
        name: 'dac_db',
        user: 'dac_user',
        password: 'redacted'
      },
      sovereign_bridge_db: {
        name: 'sovereign_bridge_db',
        user: 'sovereign_bridge_user',
        password: 'redacted'
      }
    };

    // Prover 数据库
    const PROVER_DB: Record<string, DatabaseConfig> = {
      prover_db: {
        name: 'prover_db',
        user: 'prover_user',
        password: 'redacted',
        init: this.readInitSql('prover-db-init.sql')
      }
    };

    // zkEVM 节点数据库
    const ZKEVM_NODE_DBS: Record<string, DatabaseConfig> = {
      event_db: {
        name: 'event_db',
        user: 'event_user',
        password: 'redacted',
        init: this.readInitSql('event-db-init.sql')
      },
      pool_db: {
        name: 'pool_db',
        user: 'pool_user',
        password: 'redacted'
      },
      state_db: {
        name: 'state_db',
        user: 'state_user',
        password: 'redacted'
      }
    };

    // CDK Erigon 数据库
    const CDK_ERIGON_DBS: Record<string, DatabaseConfig> = {
      pool_manager_db: {
        name: 'pool_manager_db',
        user: 'pool_manager_user',
        password: 'redacted'
      }
    };

    // 根据 sequencer 类型选择需要部署的数据库
    if (this.config.deployment_args.sequencer_type === 'erigon') {
      return {
        ...CENTRAL_ENV_DBS,
        ...PROVER_DB,
        ...CDK_ERIGON_DBS
      };
    } else if (this.config.deployment_args.sequencer_type === 'zkevm') {
      return {
        ...CENTRAL_ENV_DBS,
        ...PROVER_DB,
        ...ZKEVM_NODE_DBS
      };
    } else {
      throw new Error(`不支持的 sequencer 类型: ${this.config.deployment_args.sequencer_type}`);
    }
  }

  private readInitSql(filename: string): string {
    const filePath = path.join(this.pathManager.getTemplatesDir(), 'databases', filename);
    return readFileSync(filePath, 'utf8');
  }

  private async prepareInitScript(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
    this.logger.info('准备数据库初始化脚本...');

    const buildDir = this.pathManager.getBuildDir();
    const initScriptTemplate = this.readInitSql('init.sql');
    const renderedScript = this.renderInitScript(initScriptTemplate, dbConfigs);
    
    const outputPath = path.join(buildDir, `init${this.config.deployment_args.deployment_suffix}.sql`);
    writeFileSync(outputPath, renderedScript);
  }

  private renderInitScript(template: string, dbConfigs: Record<string, DatabaseConfig>): string {
    let script = template;
    const dbConfig = this.config.database;

    // 替换主数据库配置
    script = script.replace(/\{\{postgres_master_db\}\}/g, dbConfig.postgres_master_db);
    script = script.replace(/\{\{postgres_master_user\}\}/g, dbConfig.postgres_master_user);

    // 替换数据库配置
    let dbCreationScript = '';
    for (const [key, db] of Object.entries(dbConfigs)) {
      dbCreationScript += `
-- 创建数据库 ${db.name}
CREATE DATABASE ${db.name};

-- 创建用户并授权
CREATE USER ${db.user} WITH PASSWORD '${db.password}';
GRANT ALL PRIVILEGES ON DATABASE ${db.name} TO ${db.user};

${db.init ? `\\c ${db.name}\n${db.init}` : ''}
`;
    }

    script = script.replace(/\{\{db_creation\}\}/g, dbCreationScript);
    return script;
  }
} 