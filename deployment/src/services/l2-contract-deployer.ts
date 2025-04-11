import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types/config';
import { BaseDeployer } from './base-deployer';
import { execSync } from 'child_process';
import { Service } from '../utils/service';

export class L2ContractDeployer extends BaseDeployer {
  constructor(config: DeploymentConfig, logger: Logger) {
    super(config, logger);
  }

  public async deploy(shouldDeployL2Contracts: boolean): Promise<void> {
    try {
      this.logger.info('开始部署 L2 合约...');

      // 获取 L2 RPC URL
      const service = new Service(this.logger, this.config);
      const l2RpcUrl = service.getL2RpcUrl();

      // 执行 L2 合约部署
      const contractServiceName = `contracts${this.config.deployment_args.deployment_suffix}`;
      const cmd = `docker exec ${contractServiceName} \
        /bin/sh -c "export l2_rpc_url=${l2RpcUrl} && \
        chmod +x /opt/contract-deploy/run-l2-contract-setup.sh && \
        /opt/contract-deploy/run-l2-contract-setup.sh ${shouldDeployL2Contracts}"`;

      execSync(cmd);

      this.logger.info('L2 合约部署完成');
    } catch (error) {
      this.logger.error('L2 合约部署失败:', error);
      throw error;
    }
  }
} 