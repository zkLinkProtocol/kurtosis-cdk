import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { BridgeComposeGenerator, BridgeExtraConfig } from '../compose/bridge-compose-generator';
import { ContractSetupAddresses, Service } from '../utils/service';


export class BridgeDeployer extends BaseDeployer {
  private readonly service: Service;
  private readonly contractSetupAddresses: ContractSetupAddresses;

  constructor(config: DeploymentConfig, logger: Logger, service: Service) {
    super(config, logger);
    this.service = service;
    this.contractSetupAddresses = this.service.getContractSetupAddresses();
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署桥接服务...');
    
    try {
      // 生成 bridge 配置
      await this.generateBridgeConfig();

      // 启动桥接服务
      this.startBridgeServices();

      // 等待桥接服务启动
      await this.waitForBridgeStartup();

      this.logger.info('桥接服务部署完成');
    } catch (error) {
      this.logger.error('桥接服务部署失败:', error);
      throw error;
    }
  }

  private async generateBridgeConfig(): Promise<void> {
    // 生成bridge配置
    await this.configGenerator.renderTemplate('bridge-infra/bridge-config.toml', {
      ...this.config.deployment_args,
      ...this.contractSetupAddresses,
      bridge_db: {
        hostname: this.config.database.postgres_host,
        port: this.config.database.postgres_port,
        user: this.config.database.central_env_dbs.bridge_db.user,
        password: this.config.database.central_env_dbs.bridge_db.password,
        name: this.config.database.central_env_dbs.bridge_db.name,
      },
    }, 'bridge-config.toml');

    if (this.config.deployment_stages.deploy_cdk_bridge_ui) {
      // 生成 bridge-ui 的 .env 文件
      await this.configGenerator.renderTemplate('bridge-infra/.env', {
        ...this.contractSetupAddresses,
        l1_explorer_url: this.config.deployment_args.l1_explorer_url,
        zkevm_explorer_url: this.config.deployment_args.polygon_zkevm_explorer,
      }, '.env');

      if (this.config.deployment_stages.deploy_l1) {
        // 生成 reverse-proxy 的 haproxy.cfg 文件
        await this.configGenerator.renderTemplate('bridge-infra/haproxy.cfg', {
          l1rpc_ip: `anvil${this.config.deployment_args.deployment_suffix}`,
          l1rpc_port: this.config.deployment_args.l1_rpc_url.split(':')[2],
          l2rpc_ip: `cdk-erigon-rpc${this.config.deployment_args.deployment_suffix}`,
          l2rpc_port: this.service.getL2RpcUrl().http.split(':')[2],
          bridgeservice_ip: `zkevm-bridge-service${this.config.deployment_args.deployment_suffix}`,
          bridgeservice_port: this.config.static_ports.zkevm_bridge_service_start_port,
          bridgeui_ip: `zkevm-bridge-ui${this.config.deployment_args.deployment_suffix}`,
          bridgeui_port: this.config.static_ports.zkevm_bridge_ui_start_port,
        }, 'haproxy.cfg');
      }
    }
  }

  private async startBridgeServices(): Promise<void> {
    // 生成 compose 文件
    const bridgeComposeGenerator = new BridgeComposeGenerator(this.config, this.logger, { name: 'zklink-network'});
    const composeConfig = await bridgeComposeGenerator.generate({
      bridge_service_config: {
        path: this.pathManager.getBuildPath('bridge-config.toml'),
        name: 'bridge-config.toml'
      },
      claimtx_keystore: {
        path: this.pathManager.getBuildPath('claimtxmanager.keystore'),
        name: 'claimtxmanager.keystore'
      },
      bridge_ui_config: {
        path: this.pathManager.getBuildPath('.env'),
        name: '.env'
      },
      reverse_proxy_config: {
        path: this.pathManager.getBuildPath('haproxy.cfg'),
        name: 'haproxy.cfg'
      }
    });

    // 写入 compose 文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'bridge-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));

    // 使用 Docker Compose 启动服务
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
    
  }

  private async waitForBridgeStartup(): Promise<void> {
    this.logger.info('等待桥接服务启动...');
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 检查桥接服务是否启动
        const result = await fetch(`http://localhost:${this.config.static_ports.zkevm_bridge_service_start_port}/health`);
        if (result.ok) {
          this.logger.info('桥接服务已成功启动！');
          return;
        }
      } catch (error) {
        // 忽略错误，继续重试
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`桥接服务正在启动中... (${retries}/${maxRetries})`);
    }
    
    throw new Error('桥接服务启动超时');
  }
} 