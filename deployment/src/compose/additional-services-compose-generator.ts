import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';
import { execSync } from 'child_process';

export interface AdditionalServicesExtraConfig {
    type: 'blockscout' | 'prometheus';
    config: BlockscoutExtraConfig | PrometheusExtraConfig;
}

export interface Artifact {
    path?: string;
    name?: string;
    envs?: any;
    port?: number | null;
}

export interface BlockscoutExtraConfig {
    databaseConfig: Artifact;
    backendConfig: Artifact;
    statsConfig: Artifact;
    visualizeConfig: Artifact;
    frontendConfig: Artifact;
}

export interface PrometheusExtraConfig {
    prometheusConfig: Artifact;
}

export class AdditionalServicesComposeGenerator extends BaseComposeGenerator {
    constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
        super(config, logger, network);
    }

    public async generate(extraConfig: AdditionalServicesExtraConfig): Promise<DockerComposeConfig> {
        // 每次调用时创建新的composeConfig对象，避免多次调用之间的相互影响
        this.composeConfig = {
            version: '3.8',
            services: {}
        };

        // 根据 extraConfig 的 type 添加服务
        // 每次调用生成独立的compose文件
        if (extraConfig.type === 'blockscout') {
            await this.addBlockscoutService(extraConfig);
        } else if (extraConfig.type === 'prometheus') {
            await this.addPrometheusService(extraConfig);
        }

        return this.composeConfig;
    }

    private async addBlockscoutService(extraConfig: AdditionalServicesExtraConfig): Promise<void> {
        const config = extraConfig.config as BlockscoutExtraConfig;
        const args = this.config.deployment_args;

        const IMAGE_POSTGRES = "postgres:17.0"
        const IMAGE_BACKEND = "blockscout/blockscout-zkevm:6.8.1"
        const IMAGE_STATS = "ghcr.io/blockscout/stats:v2.1.1"
        const IMAGE_VISUALIZE = "ghcr.io/blockscout/visualizer:v0.2.1"
        const IMAGE_FRONTEND = "ghcr.io/blockscout/frontend:v1.35.0"

        const bs_postgres = `bs-postgres${args.deployment_suffix}`;
        const bs_backend = `bs-backend${args.deployment_suffix}`;
        const bs_stats = `bs-stats${args.deployment_suffix}`;
        const bs_visualize = `bs-visualize${args.deployment_suffix}`;
        const bs_frontend = `bs-frontend${args.deployment_suffix}`;

        // add postgres service
        this.addService(bs_postgres, {
            image: IMAGE_POSTGRES,
            container_name: bs_postgres,
            volumes: [
                {
                    type: 'bind' as const,
                    source: config.databaseConfig.path!,
                    target: `/docker-entrypoint-initdb.d/${config.databaseConfig.name}`,
                    bind: {
                        create_host_path: true
                    }
                }
            ],
            ports: [
                `${this.config.static_ports.database_start_port+1}:${config.databaseConfig.port}`
            ],
            environment: config.databaseConfig.envs,
            command: ["-N 500"]
        })

        // add backend service
        this.addService(bs_backend, {
            image: IMAGE_BACKEND,
            container_name: bs_backend,
            expose: [
                `${config.backendConfig.port}`
            ],
            environment: config.backendConfig.envs,
            depends_on: [bs_postgres],
            command: ['/bin/sh -c bin/blockscout eval "Elixir.Explorer.ReleaseTasks.create_and_migrate()" && bin/blockscout start']
        })

        // add stats service
        this.addService(bs_stats, {
            image: IMAGE_STATS,
            container_name: bs_stats,
            expose: [
                `${config.statsConfig.port}`
            ],
            environment: config.statsConfig.envs,
            depends_on: [bs_backend, bs_postgres],
        })

        // add visualize service
        this.addService(bs_visualize, {
            image: IMAGE_VISUALIZE,
            container_name: bs_visualize,
            expose: [
                `${config.visualizeConfig.port}`
            ],
            depends_on: [bs_postgres],
        })

        // add frontend service
        this.addService(bs_frontend, {
            image: IMAGE_FRONTEND,
            container_name: bs_frontend,
            ports: [
                `${args.blockscout_params.blockscout_public_port}:${config.frontendConfig.port}`
            ],
            environment: config.frontendConfig.envs,
            depends_on: [bs_backend, bs_postgres],
        })
        
        this.addNetwork();
    }

    private async addPrometheusService(extraConfig: AdditionalServicesExtraConfig): Promise<void> {
        const args = this.config.deployment_args;
    }
}