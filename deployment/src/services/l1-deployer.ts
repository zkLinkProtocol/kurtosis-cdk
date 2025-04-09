import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { L1ConfigGenerator } from '../configs/l1-config-generator';

interface DockerComposeService {
  image: string;
  entrypoint?: string;
  command?: string;
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
}

interface DockerComposeConfig {
  version: string;
  services: {
    [key: string]: DockerComposeService;
  };
}

export class L1Deployer extends BaseDeployer {
  private readonly STATE_PATH = "/tmp";
  private readonly composeConfig: DockerComposeConfig;

  constructor(config: DeploymentConfig, logger: Logger) {
    super(config, logger);
    this.composeConfig = {
      version: '3.8',
      services: {}
    };
  }

  public async deploy(): Promise<void> {
    this.logger.info('部署 L1 环境...');
    
    try {
      await this.deployAnvilL1();

      // 写入 docker-compose 配置
      const composePath = this.writeDockerComposeConfig();

      // 启动 L1 环境
      this.startL1Environment(composePath);

      // 等待 L1 环境启动
      await this.waitForL1Startup();

      this.logger.info('L1 环境部署完成');
    } catch (error) {
      this.logger.error('L1 环境部署失败:', error);
      throw error;
    }
  }

  private async deployAnvilL1(): Promise<void> {
    const args = this.config.deployment_args;
    const serviceName = `anvil${args.deployment_suffix}`;

    // 使用配置生成器生成启动脚本
    const scriptPath = path.join(this.pathManager.getBuildDir(), 'start-anvil.sh');
    const l1ConfigGenerator = new L1ConfigGenerator(this.config);
    
    // 确保构建目录存在
    execSync(`mkdir -p ${this.pathManager.getBuildDir()}`);
    
    // 生成启动脚本并设置执行权限
    await l1ConfigGenerator.generateAnvilStartScript(scriptPath);
    execSync(`chmod +x ${scriptPath}`);

    // 添加 Anvil 服务配置
    this.composeConfig.services[serviceName] = {
      image: args.anvil_image,
      entrypoint: '/bin/sh',
      command: '/app/start-anvil.sh',
      ports: ['8545:8545'],
      volumes: [
        `${scriptPath}:/app/start-anvil.sh`,
        ...(args.anvil_state_file ? [`${args.anvil_state_file}:${this.STATE_PATH}/${args.anvil_state_file}`] : [])
      ]
    };
  }

  private writeDockerComposeConfig(): string {
    const composePath = path.join(this.pathManager.getBuildDir(), 'l1-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(this.composeConfig));
    return composePath;
  }

  private startL1Environment(composePath: string): void {
    execSync(`docker compose -f ${composePath} up -d`, { stdio: 'inherit' });
  }

  private async waitForL1Startup(): Promise<void> {
    this.logger.info('等待 L1 环境启动...');
    
    const maxRetries = 60; // 最多等待 5 分钟
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        const result = execSync(
          'curl --silent -X POST -H "Content-Type: application/json" --data \'{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}\' http://localhost:8545',
          { stdio: 'pipe' }
        );
        const response = JSON.parse(result.toString());
        if (response.result) {
          this.logger.info('L1 环境已成功启动！');
          return;
        }
      } catch (error) {
        // 忽略错误，继续重试
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 5 秒
      retries++;
      this.logger.info(`L1 环境正在启动中... (${retries}/${maxRetries})`);
    }
    
    throw new Error('L1 环境启动超时');
  }
}
