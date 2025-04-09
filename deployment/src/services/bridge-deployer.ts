import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { BridgeComposeGenerator, BridgeExtraConfig } from '../compose/bridge-compose-generator';

export class BridgeDeployer extends BaseDeployer {
  private l1_bridge_addr: string = '';
  private l2_bridge_addr: string = '';

  constructor(config: DeploymentConfig, logger: Logger) {
    super(config, logger);
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署桥接服务...');
    
    try {
      // 生成 docker-compose 配置
      const composePath = await this.generateDockerComposeConfig();

      // 启动桥接服务
      this.startBridgeServices(composePath);

      // 等待桥接服务启动
      await this.waitForBridgeStartup();

      this.logger.info('桥接服务部署完成');
    } catch (error) {
      this.logger.error('桥接服务部署失败:', error);
      throw error;
    }
  }

  private async generateDockerComposeConfig(): Promise<string> {
    // 使用新的compose生成器
    const composeGenerator = new BridgeComposeGenerator(
      this.config, 
      this.logger,
      { name: 'zklink-network' }
    );

    const extraConfig: BridgeExtraConfig = {
      l1_bridge_addr: this.l1_bridge_addr,
      l2_bridge_addr: this.l2_bridge_addr
    };

    const composeConfig = await composeGenerator.generate(extraConfig);

    // 写入配置文件
    const composePath = path.join(this.pathManager.getBuildDir(), 'bridge-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(composeConfig));
    return composePath;
  }

  private startBridgeServices(composePath: string): void {
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  }

  private async waitForBridgeStartup(): Promise<void> {
    this.logger.info('等待桥接服务启动...');
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // 检查桥接服务是否启动
        const result = await fetch(`http://localhost:${this.config.deployment_args.zkevm_bridge_rpc_port}/health`);
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

  public setBridgeAddresses(l1BridgeAddr: string, l2BridgeAddr: string): void {
    this.l1_bridge_addr = l1BridgeAddr;
    this.l2_bridge_addr = l2BridgeAddr;
  }
} 