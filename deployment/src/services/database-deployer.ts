import { Logger } from '../utils/logger';
import { DeploymentConfig, DatabaseConnectionConfig } from '../types/config';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { Client } from 'pg';

// 默认 PostgreSQL 配置
const DEFAULT_POSTGRES_CONFIG: DatabaseConnectionConfig = {
  use_remote: false,
  host: '127.0.0.1',
  port: 5432,
  master_db: 'master',
  master_user: 'master_user',
  master_password: 'master_password'
};

// 数据库配置接口
interface DatabaseConfig {
  name: string;
  user: string;
  password: string;
  init?: string;
}

export class DatabaseDeployer {
  private readonly config: DeploymentConfig;
  private readonly logger: Logger;
  private readonly workDir: string;
  private readonly postgresServiceName: string;
  private readonly dbConfig: DatabaseConnectionConfig;

  constructor(config: DeploymentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.workDir = path.join(process.cwd(), 'deployment');
    this.postgresServiceName = `postgres${config.deployment_suffix}`;
    // 使用配置文件中的数据库配置,如果没有则使用默认配置
    this.dbConfig = config.database || DEFAULT_POSTGRES_CONFIG;
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署数据库服务...');

      // 1. 获取数据库配置
      const dbConfigs = this.getDbConfigs();

      // 2. 准备初始化脚本
      await this.prepareInitScript(dbConfigs);

      if (this.dbConfig.use_remote) {
        // 使用远程数据库
        this.logger.info('使用远程数据库:', this.dbConfig.host);
        await this.initializeRemoteDatabase(dbConfigs);
      } else {
        // 部署本地数据库
        this.logger.info('部署本地数据库服务');
        await this.deployLocalDatabase(dbConfigs);
      }

      this.logger.info('数据库服务部署完成');
    } catch (error) {
      this.logger.error('数据库部署失败:', error);
      throw error;
    }
  }

  private async initializeRemoteDatabase(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
    this.logger.info('初始化远程数据库...');

    const client = new Client({
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      database: this.dbConfig.master_db,
      user: this.dbConfig.master_user,
      password: this.dbConfig.master_password
    });

    try {
      await client.connect();
      
      // 执行初始化脚本
      const initScript = this.readInitSql(`init${this.config.deployment_suffix}.sql`);
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

  private async deployLocalDatabase(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
    this.logger.info('部署本地数据库...');

    const cmd = `docker run -d \
      --name ${this.postgresServiceName} \
      -p ${this.dbConfig.port}:${this.dbConfig.port} \
      -e POSTGRES_DB=${this.dbConfig.master_db} \
      -e POSTGRES_USER=${this.dbConfig.master_user} \
      -e POSTGRES_PASSWORD=${this.dbConfig.master_password} \
      -v ${path.join(this.workDir, 'build', `init${this.config.deployment_suffix}.sql`)}:/docker-entrypoint-initdb.d/init.sql \
      postgres:16.2 \
      -N 1000`;

    execSync(cmd);

    // 等待数据库启动
    await this.waitForDatabase();
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
    if (this.config.sequencer_type === 'erigon') {
      return {
        ...CENTRAL_ENV_DBS,
        ...PROVER_DB,
        ...CDK_ERIGON_DBS
      };
    } else if (this.config.sequencer_type === 'zkevm') {
      return {
        ...CENTRAL_ENV_DBS,
        ...PROVER_DB,
        ...ZKEVM_NODE_DBS
      };
    } else {
      throw new Error(`不支持的 sequencer 类型: ${this.config.sequencer_type}`);
    }
  }

  private readInitSql(filename: string): string {
    const filePath = path.join(this.workDir, 'templates', 'databases', filename);
    return readFileSync(filePath, 'utf8');
  }

  private async prepareInitScript(dbConfigs: Record<string, DatabaseConfig>): Promise<void> {
    this.logger.info('准备数据库初始化脚本...');

    const initScriptTemplate = this.readInitSql('init.sql');
    const renderedScript = this.renderInitScript(initScriptTemplate, dbConfigs);
    
    const outputPath = path.join(this.workDir, 'build', `init${this.config.deployment_suffix}.sql`);
    writeFileSync(outputPath, renderedScript);
  }

  private renderInitScript(template: string, dbConfigs: Record<string, DatabaseConfig>): string {
    let script = template;

    // 替换主数据库配置
    script = script.replace(/\{\{master_db\}\}/g, this.dbConfig.master_db);
    script = script.replace(/\{\{master_user\}\}/g, this.dbConfig.master_user);

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

  private async waitForDatabase(): Promise<void> {
    this.logger.info('等待数据库启动...');
    
    let retries = 30;
    while (retries > 0) {
      try {
        if (this.dbConfig.use_remote) {
          // 检查远程数据库连接
          const client = new Client({
            host: this.dbConfig.host,
            port: this.dbConfig.port,
            database: this.dbConfig.master_db,
            user: this.dbConfig.master_user,
            password: this.dbConfig.master_password
          });
          await client.connect();
          await client.end();
        } else {
          // 检查本地数据库容器
          execSync(`docker exec ${this.postgresServiceName} pg_isready`);
        }
        this.logger.info('数据库已就绪');
        return;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error('数据库启动超时');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
} 