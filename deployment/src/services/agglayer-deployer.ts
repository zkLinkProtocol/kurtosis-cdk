import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { readFileSync, writeFileSync } from 'fs';
import { ContractSetupAddresses } from '../types';

export class AgglayerDeployer extends BaseDeployer {
  constructor(
    config: DeploymentConfig,
    logger: Logger,
    private readonly contractAddresses: ContractSetupAddresses
  ) {
    super(config, logger);
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署Agglayer...');

      // 1. 准备Agglayer Prover配置
      await this.prepareAgglayerProverConfig();

      // 2. 准备Agglayer配置
      await this.prepareAgglayerConfig();

      // 3. 复制Keystore文件
      await this.copyKeystoreFile();

      // 4. 启动Agglayer服务
      await this.startServices('agglayer');
      await this.waitForHealthy('agglayer');

      this.logger.info('Agglayer部署完成');
    } catch (error) {
      this.logger.error('Agglayer部署失败:', error);
      throw error;
    }
  }

  private async prepareAgglayerProverConfig(): Promise<void> {
    this.logger.info('准备Agglayer Prover配置...');

    // 读取模板
    const template = this.readTemplate('bridge-infra/agglayer-prover-config.toml');

    // 确定启用哪种类型的prover
    const isCpuProverEnabled = !this.config.agglayer_prover_sp1_key;
    const isNetworkProverEnabled = !!this.config.agglayer_prover_sp1_key;

    // 渲染配置
    const config = this.renderTemplate(template, {
      deployment_suffix: this.config.deployment_suffix,
      global_log_level: this.config.global_log_level,
      zkevm_rollup_fork_id: this.config.zkevm_rollup_fork_id,
      agglayer_prover_port: this.config.images?.agglayer_prover_port || 4445,
      prometheus_port: this.config.images?.agglayer_prover_metrics_port || 9093,
      is_cpu_prover_enabled: isCpuProverEnabled.toString(),
      is_network_prover_enabled: isNetworkProverEnabled.toString(),
      primary_prover: this.config.agglayer_prover_primary_prover || 'mock-prover',
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'agglayer-prover-config.toml');
    writeFileSync(configPath, config);
  }

  private async prepareAgglayerConfig(): Promise<void> {
    this.logger.info('准备Agglayer配置...');

    // 读取模板
    const template = this.readTemplate('bridge-infra/agglayer-config.toml');

    // 渲染配置
    const config = this.renderTemplate(template, {
      // 基础配置
      deployment_suffix: this.config.deployment_suffix,
      global_log_level: this.config.global_log_level,
      l1_chain_id: this.config.l1_chain_id,
      l1_rpc_url: this.config.l1_rpc_url,
      l1_ws_url: this.config.l1_ws_url,
      zkevm_rollup_fork_id: this.config.zkevm_rollup_fork_id,
      zkevm_l2_keystore_password: this.config.zkevm_l2_keystore_password,
      zkevm_l2_proofsigner_address: this.config.zkevm_l2_proofsigner_address,
      zkevm_l2_sequencer_address: this.config.zkevm_l2_sequencer_address,
      // 端口
      zkevm_rpc_http_port: this.config.images?.zkevm_rpc_http_port || 8123,
      agglayer_grpc_port: this.config.images?.agglayer_grpc_port || 4443,
      agglayer_readrpc_port: this.config.images?.agglayer_readrpc_port || 4444,
      agglayer_admin_port: this.config.images?.agglayer_admin_port || 4446,
      agglayer_prover_entrypoint: `http://agglayer-prover:${this.config.images?.agglayer_prover_port || 4445}`,
      agglayer_metrics_port: this.config.images?.agglayer_metrics_port || 9092,
      l2_rpc_name: this.config.l2_rpc_name,
      polygon_zkevm_explorer: this.config.polygon_zkevm_explorer,
      // verifier
      mock_verifier: (this.config.agglayer_prover_primary_prover || 'mock-prover') === 'mock-prover',
      // 数据库配置
      postgres_user: this.config.database?.master_user || 'postgres',
      postgres_password: this.config.database?.master_password || 'postgres',
      postgres_db: this.config.database?.master_db || 'zkevm_db',
      // contractAddresses
      ...this.contractAddresses,
    });

    // 写入配置文件
    const configPath = path.join(this.workDir, 'build', 'agglayer-config.toml');
    writeFileSync(configPath, config);
  }

  private async copyKeystoreFile(): Promise<void> {
    try {
      this.logger.info('复制Agglayer Keystore文件...');
      
      // 从contracts服务中复制keystore文件
      execSync(`docker cp contracts:/opt/zkevm/agglayer.keystore ${path.join(this.workDir, 'build')}`, {
        stdio: 'inherit'
      });
    } catch (error) {
      this.logger.warn('复制Agglayer Keystore文件失败:', error);
      
      // 如果复制失败，生成一个空的keystore文件(仅用于测试)
      const emptiesKeystorePath = path.join(this.workDir, 'build', 'agglayer.keystore');
      writeFileSync(emptiesKeystorePath, '{}');
    }
  }

  /**
   * 读取模板文件
   */
  private readTemplate(templateName: string): string {
    const templatePath = path.join(this.workDir, 'templates', templateName);
    return readFileSync(templatePath, 'utf8');
  }

  /**
   * 渲染模板
   */
  private renderTemplate(template: string, data: any): string {
    return template.replace(/\${(\w+)}/g, (match, key) => {
      return data[key] !== undefined ? data[key].toString() : match;
    });
  }

  /**
   * 等待服务健康检查通过
   */
  private async waitForHealthy(serviceName: string): Promise<void> {
    this.logger.info(`等待${serviceName}服务就绪...`);
    
    // 最多等待5分钟
    const maxRetries = 30;
    const retryInterval = 10000; // 10秒
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 检查服务状态
        const result = execSync(`docker-compose -f ${path.join(this.workDir, 'build', `docker-compose-${serviceName}.yml`)} ps -q | xargs docker inspect -f '{{.State.Health.Status}}'`, {
          encoding: 'utf8'
        });
        
        // 如果所有服务都显示为"healthy"，则返回
        if (!result.includes('unhealthy') && !result.includes('starting') && result.trim()) {
          this.logger.info(`${serviceName}服务已就绪`);
          return;
        }
      } catch (error) {
        this.logger.debug(`等待${serviceName}服务就绪时发生错误:`, error);
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      this.logger.debug(`等待${serviceName}服务就绪(${i + 1}/${maxRetries})...`);
    }
    
    this.logger.warn(`等待${serviceName}服务就绪超时`);
  }
} 