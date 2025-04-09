import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface DockerComposeService {
  image: string;
  ports: string[];
  volumes?: string[];
  command: string;
  depends_on?: string[];
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

    // 构建 Anvil 命令
    const cmd = [
      'anvil',
      '--block-time', (args.l1_anvil_block_time || 1).toString(),
      '--slots-in-an-epoch', (args.l1_anvil_slots_in_epoch || 1).toString(),
      '--chain-id', args.l1_chain_id.toString(),
      '--host', '0.0.0.0',
      '--port', '8545',
      '--dump-state', `${this.STATE_PATH}/state_out.json`,
      '--balance', '1000000000',
      '--mnemonic', `"${args.l1_preallocated_mnemonic}"`
    ];

    // 如果指定了状态文件，添加加载状态的参数
    if (args.anvil_state_file) {
      cmd.push('--load-state', `${this.STATE_PATH}/${args.anvil_state_file}`);
    }

    // 添加 Anvil 服务配置
    this.composeConfig.services[serviceName] = {
      image: args.anvil_image,
      command: cmd.join(' '),
      ports: ['8545:8545'],
      volumes: args.anvil_state_file ? 
        [`${args.anvil_state_file}:${this.STATE_PATH}/${args.anvil_state_file}`] : 
        undefined
    };
  }

  private writeDockerComposeConfig(): string {
    const composePath = path.join(this.pathManager.getBuildDir(), 'l1-docker-compose.yml');
    writeFileSync(composePath, yaml.dump(this.composeConfig));
    return composePath;
  }

  private startL1Environment(composePath: string): void {
    execSync(`docker-compose -f ${composePath} up -d`, { stdio: 'inherit' });
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
