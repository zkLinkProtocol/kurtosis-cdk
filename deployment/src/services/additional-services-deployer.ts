import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { AdditionalServicesComposeGenerator } from '../compose/additional-services-compose-generator';
import { Service } from '../utils/service';

export interface BlockscoutCommonArgs {
  chain_id: number;
  l1_rpc_url: string;
  rpc_url: string;        // l2 rpc url
  trace_url: string;      // l2 rpc url
  ws_url: string;         // l2 ws url
  swap_url: string;
  l1_explorer_url: string;
  backend_exposed: boolean;
  deployment_suffix: string;
  blockscout_public_port: number; // 8000
}

export interface BlockscoutArgs {
    POSTGRES: {
        IMAGE: string;
        PORT: number;
        NAME: string;
        USER: string;
        PASSWORD: string;
        SERVICE_NAME: string;
        COMMON: BlockscoutCommonArgs
    },
    BACKEND: {
        DB: {
            NAME: string;
            USER: string;
            PASSWORD: string;
            PORT: number;
        },
        IMAGE: string;
        NAME: string;
        PORT: number;
        PORT_NAME: string;
        TITLE: string;
        COMMON: BlockscoutCommonArgs
    },
    STATS: {
        DB: {
            NAME: string;
            USER: string;
            PASSWORD: string;
            PORT: number;
        },
        IMAGE: string;
        NAME: string;
        PORT: number;
        PORT_NAME: string;
        COMMON: BlockscoutCommonArgs
    },
    VISUALIZE: {
        IMAGE: string;
        NAME: string;
        PORT: number;
        PORT_NAME: string;
        COMMON: BlockscoutCommonArgs
    },
    FRONTEND: {
        IMAGE: string;
        NAME: string;
        PORT: number;
        PORT_NAME: string;
        IP: string;
        TITLE: string;
        COMMON: BlockscoutCommonArgs
    },
}

export interface BlockscoutDBConfig {
    db: string;
    user: string;
    password: string;
}

export class AdditionalServicesDeployer extends BaseDeployer {
  private readonly service: Service;

  constructor(config: DeploymentConfig, logger: Logger, service: Service) {
    super(config, logger);
    this.service = service;
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署附加服务...');
    
    try {
      if (this.config.deployment_args.additional_services.includes('blockscout')) {
        await this.deployBlockscout();
      }

      if (this.config.deployment_args.additional_services.includes('prometheus_grafana')) {
        await this.deployPrometheus();
      }

      this.logger.info('附加服务部署完成');
    } catch (error) {
      this.logger.error('附加服务部署失败:', error);
      throw error;
    }
  }

  private async deployBlockscout(): Promise<void> {
    const blockscoutConfig = await this.generateBlockscoutConfig();

    // 生成 init.sql 文件
    await this.configGenerator.renderTemplate('blockscout/init.sql', {
        dbs: [
            {
                db: blockscoutConfig.BACKEND.DB.NAME,
                user: blockscoutConfig.BACKEND.DB.USER,
                password: blockscoutConfig.BACKEND.DB.PASSWORD
            },
            {
                db: blockscoutConfig.STATS.DB.NAME,
                user: blockscoutConfig.STATS.DB.USER,
                password: blockscoutConfig.STATS.DB.PASSWORD
            },
        ]
  }, 'init-bs.sql');

    // 生成 docker-compose.yml 文件
    const additionalServicesComposeGenerator = new AdditionalServicesComposeGenerator(this.config, this.logger, { name: 'zklink-network'});
    const composeConfig = await additionalServicesComposeGenerator.generate({
        type: 'blockscout',
        config: {
            databaseConfig: {
                path: this.pathManager.getBuildPath('init-bs.sql'),
                name: 'init.sql',
                envs: {
                    POSTGRES_USER: blockscoutConfig.POSTGRES.USER,
                    POSTGRES_PASSWORD: blockscoutConfig.POSTGRES.PASSWORD,
                    POSTGRES_DB: blockscoutConfig.POSTGRES.NAME
                },
                port: blockscoutConfig.POSTGRES.PORT
            },
            backendConfig: {
                envs: {
                    PORT: blockscoutConfig.BACKEND.PORT,
                    NETWORK: "zklink",
                    SUBNETWORK: blockscoutConfig.BACKEND.TITLE,
                    CHAIN_ID: blockscoutConfig.BACKEND.COMMON.chain_id,
                    CHAIN_TYPE: "polygon_zkevm",
                    COIN: "BNB",
                    ETHEREUM_JSONRPC_VARIANT: "anvil",
                    ETHEREUM_JSONRPC_HTTP_URL: blockscoutConfig.BACKEND.COMMON.rpc_url,
                    ETHEREUM_JSONRPC_TRACE_URL: blockscoutConfig.BACKEND.COMMON.trace_url,
                    ETHEREUM_JSONRPC_WS_URL: blockscoutConfig.BACKEND.COMMON.ws_url,
                    ETHEREUM_JSONRPC_HTTP_INSECURE: "true",
                    DATABASE_URL: `postgres://${blockscoutConfig.BACKEND.DB.USER}:${blockscoutConfig.BACKEND.DB.PASSWORD}@${blockscoutConfig.POSTGRES.SERVICE_NAME}:${blockscoutConfig.BACKEND.DB.PORT}/${blockscoutConfig.BACKEND.DB.NAME}`,
                    ECTO_USE_SSL: "false",
                    MIX_ENV: "prod",
                    LOGO: "/images/blockscout_logo.svg",
                    LOGO_FOOTER: "/images/blockscout_logo.svg",
                    SUPPORTED_CHAINS: "[]",
                    SHOW_OUTDATED_NETWORK_MODAL: "false",
                    DISABLE_INDEXER: "false",
                    INDEXER_ZKEVM_BATCHES_ENABLED: "true",
                    API_V2_ENABLED: "true",
                    BLOCKSCOUT_PROTOCOL: "http",
                    INDEXER_POLYGON_ZKEVM_BATCHES_ENABLED: "true",
                    BRIDGED_TOKENS_ENABLED: "true",
                    INDEXER_POLYGON_ZKEVM_L1_RPC: blockscoutConfig.BACKEND.COMMON.l1_rpc_url,
                },
                port: blockscoutConfig.BACKEND.PORT
            },
            statsConfig: {
                envs: {
                    STATS__DB_URL: `postgres://${blockscoutConfig.STATS.DB.USER}:${blockscoutConfig.STATS.DB.PASSWORD}@${blockscoutConfig.POSTGRES.SERVICE_NAME}:${blockscoutConfig.STATS.DB.PORT}/${blockscoutConfig.STATS.DB.NAME}`,
                    STATS__BLOCKSCOUT_DB_URL: `postgres://${blockscoutConfig.BACKEND.DB.USER}:${blockscoutConfig.BACKEND.DB.PASSWORD}@${blockscoutConfig.POSTGRES.SERVICE_NAME}:${blockscoutConfig.BACKEND.DB.PORT}/${blockscoutConfig.BACKEND.DB.NAME}`,
                    STATS__CREATE_DATABASE: "false",
                    STATS__RUN_MIGRATIONS: "true",
                    STATS__SERVER__HTTP__CORS__ENABLED: "false",
                },
                port: blockscoutConfig.STATS.PORT
            },
            visualizeConfig: {
                port: blockscoutConfig.VISUALIZE.PORT
            },
            frontendConfig: {
                envs: {
                    PORT: blockscoutConfig.FRONTEND.PORT,
                    NEXT_PUBLIC_NETWORK_NAME: blockscoutConfig.FRONTEND.TITLE,
                    NEXT_PUBLIC_NETWORK_ID: blockscoutConfig.FRONTEND.COMMON.chain_id,
                    NEXT_PUBLIC_ROLLUP_TYPE: "zkEvm",
                    NEXT_PUBLIC_ROLLUP_L1_BASE_URL: blockscoutConfig.FRONTEND.COMMON.l1_explorer_url,
                    NEXT_PUBLIC_TRANSACTION_INTERPRETATION_PROVIDER: "blockscout",
                    NEXT_PUBLIC_API_PROTOCOL: "http",
                    NEXT_PUBLIC_API_HOST: `bs-backend${blockscoutConfig.FRONTEND.COMMON.deployment_suffix}`,
                    NEXT_PUBLIC_API_PORT: blockscoutConfig.BACKEND.PORT,
                    NEXT_PUBLIC_API_WEBSOCKET_PROTOCOL: "ws",
                    NEXT_PUBLIC_STATS_API_HOST: `http://bs-stats${blockscoutConfig.FRONTEND.COMMON.deployment_suffix}:${blockscoutConfig.STATS.PORT}`,
                    NEXT_PUBLIC_VISUALIZE_API_HOST: `http://bs-visualize${blockscoutConfig.FRONTEND.COMMON.deployment_suffix}:${blockscoutConfig.VISUALIZE.PORT}`,
                    NEXT_PUBLIC_APP_PROTOCOL: "http",
                    NEXT_PUBLIC_APP_HOST: "127.0.0.1",
                    NEXT_PUBLIC_APP_PORT: blockscoutConfig.FRONTEND.PORT,
                    NEXT_PUBLIC_USE_NEXT_JS_PROXY: "true",
                    NEXT_PUBLIC_AD_BANNER_PROVIDER: "none",
                    NEXT_PUBLIC_AD_TEXT_PROVIDER: "none",
                    NEXT_PUBLIC_DEFI_DROPDOWN_ITEMS: JSON.stringify([{
                        text: "Polygon zkEVM Bridge",
                        icon: "swap",
                        url: blockscoutConfig.FRONTEND.COMMON.swap_url
                    }])
                },
                port: blockscoutConfig.FRONTEND.PORT
            }
        }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'blockscout-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 使用 Docker Compose 启动服务
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });

    await this.checkDockerContainerStatus('bs-postgres');
    await this.checkDockerContainerStatus('bs-backend');
    await this.checkDockerContainerStatus('bs-frontend');
  }

  private async deployPrometheus(): Promise<void> {
    const args = this.config.deployment_args;
  }

  private async generateBlockscoutConfig(): Promise<BlockscoutArgs> {
    const args = this.config.deployment_args;
    const l2RpcUrl = this.service.getL2RpcUrl();

    const DB_PORT = 5432
    const TITLE = "zklink"
    const IMAGE_POSTGRES = "postgres:17.0"
    const IMAGE_BACKEND = "blockscout/blockscout-zkevm:6.8.1"
    const IMAGE_STATS = "ghcr.io/blockscout/stats:v2.1.1"
    const IMAGE_VISUALIZE = "ghcr.io/blockscout/visualizer:v0.2.1"
    const IMAGE_FRONTEND = "ghcr.io/blockscout/frontend:v1.35.0"
    
    const commonArgs: BlockscoutCommonArgs = {
        chain_id: args.zkevm_rollup_chain_id,
        l1_rpc_url: args.l1_rpc_url,
        rpc_url: l2RpcUrl.http,
        trace_url: l2RpcUrl.http,
        ws_url: l2RpcUrl.ws,
        swap_url: "https://app.uniswap.org/#/swap",
        l1_explorer_url: "https://etherscan.io/",
        backend_exposed: false,
        deployment_suffix: args.deployment_suffix,
        blockscout_public_port: args.blockscout_params.blockscout_public_port
    }

    const config: BlockscoutArgs = {
        POSTGRES: {
            IMAGE: IMAGE_POSTGRES,
            PORT: DB_PORT,
            NAME: "master",
            USER: "master",
            PASSWORD: "master",
            SERVICE_NAME: "bs-postgres" + args.deployment_suffix,
            COMMON: commonArgs
        },
        BACKEND: {
            DB: {
                NAME: "blockscout",
                USER: "blockscout",
                PASSWORD: "blockscout",
                PORT: DB_PORT,
            },
            IMAGE: IMAGE_BACKEND,
            NAME: "bs-backend" + args.deployment_suffix,
            PORT: 4004,
            PORT_NAME: "backend",
            TITLE: TITLE,
            COMMON: commonArgs
        },
        STATS: {
            DB: {
                NAME: "stats",
                USER: "stats",
                PASSWORD: "stats",
                PORT: DB_PORT,
            },
            IMAGE: IMAGE_STATS,
            NAME: "bs-stats" + args.deployment_suffix,
            PORT: 8050,
            PORT_NAME: "stats",
            COMMON: commonArgs
        },
        VISUALIZE: {
            IMAGE: IMAGE_VISUALIZE,
            NAME: "bs-visualize" + args.deployment_suffix,
            PORT: 8050,
            PORT_NAME: "visualize",
            COMMON: commonArgs
        },
        FRONTEND: {
            IMAGE: IMAGE_FRONTEND,
            NAME: "bs-frontend" + args.deployment_suffix,
            PORT: args.blockscout_params.blockscout_public_port,
            PORT_NAME: "frontend",
            IP: "0.0.0.0",
            TITLE: TITLE,
            COMMON: commonArgs
        },
    }

    return config;
  }

  private async checkDockerContainerStatus(serviceName: string): Promise<void> {
    const containerName = `${serviceName}${this.config.deployment_args.deployment_suffix}`;

    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const command = `docker ps -f name=${containerName} --format "{{.Status}}"`;
        const status = execSync(command, { encoding: 'utf-8' }).trim();
        if (!status.includes('Up')) {
          throw new Error(`${serviceName} 服务未启动`);
        }
        this.logger.info(`${serviceName} 服务已启动`);
        return;
      } catch (error) {
        // 忽略错误，继续重试
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`${serviceName} 服务正在启动中... (${retries}/${maxRetries})`);
    }

    throw new Error(`${serviceName} 服务启动失败`);
  }
}
