import { execSync } from 'child_process';
import { DeploymentConfig, DeploymentStages } from './types';
import { Logger } from './utils/logger';
import { ContractDeployer } from './services/contract-deployer';
import { DatabaseDeployer } from './services/database-deployer';
import { CentralEnvironmentDeployer } from './services/central-environment-deployer';
import { L2ContractDeployer } from './services/l2-contract-deployer';
import { AgglayerDeployer } from './services/agglayer-deployer';
import { L1Deployer } from './services/l1-deployer';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import fs from 'fs';
import { DeploymentConfig as Config } from './types/config';
import { BaseDeployer, PathManager } from './services/base-deployer';
import { Service } from './utils/service';
import { BridgeDeployer } from './services/bridge-deployer';
import { AdditionalServicesDeployer } from './services/additional-services-deployer';


export class CDKDeployer {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly contractDeployer: ContractDeployer;
  private readonly databaseDeployer: DatabaseDeployer;
  private readonly service: Service;
  private contractAddresses: any = {};
  private readonly pathManager: PathManager;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.contractDeployer = new ContractDeployer(this.config, this.logger);
    this.databaseDeployer = new DatabaseDeployer(this.config, this.logger);
    this.service = new Service(this.logger, this.config);
    this.pathManager = new PathManager();
  }

  public async deploy(): Promise<void> {
    try {
      this.logger.info('开始部署 CDK 环境...');

      // 部署 L1 环境
      if (this.config.deployment_stages.deploy_l1) {
        this.logger.info('部署 L1 环境...');
        await this.deployL1Environment();
      } else {
        this.logger.info('跳过部署 L1 环境...');
      }

      // 部署 L1 合约
      if (this.config.deployment_stages.deploy_zkevm_contracts_on_l1) {
        this.logger.info('部署 L1 合约...');
        await this.deployZkEVMContracts();
        // 获取合约地址
        this.contractAddresses = await this.getContractAddresses();
      } else {
        this.logger.info('跳过部署 L1 合约...');
      }

      // 部署数据库
      if (this.config.deployment_stages.deploy_databases) {
        this.logger.info('部署数据库...');
        await this.deployDatabases();
      } else {
        this.logger.info('跳过部署数据库...');
      }

      // 部署 Agglayer
      if (this.config.deployment_stages.deploy_agglayer) {
        this.logger.info('部署 Agglayer...');
        await this.deployAggLayer();
      } else {
        this.logger.info('跳过部署 Agglayer...');
      }

      // 部署中心环境
      if (this.config.deployment_stages.deploy_cdk_central_environment) {
        this.logger.info('部署中心环境...');
        await this.deployCDKCentralEnvironment();

        // 部署 L2 合约
        if (this.config.deployment_stages.deploy_l2_contracts) {
          this.logger.info('部署 L2 合约...');
          await this.deployL2Contracts();
        } else {
          this.logger.info('跳过部署 L2 合约...');
        }

        // 部署桥接服务
        if (this.config.deployment_stages.deploy_cdk_bridge_infra) {
          this.logger.info('部署桥接服务...');
          await this.deployBridge();
        } else {
          this.logger.info('跳过部署桥接服务...');
        }
      } else {
        this.logger.info('跳过部署中心环境...');  
      }

      // 部署额外服务
      if (this.config.deployment_args.additional_services.length > 0) {
        this.logger.info('部署额外服务...');
        await this.deployAdditionalServices();
      } else {
        this.logger.info('跳过部署额外服务...');
      }

      this.logger.info('CDK 环境部署完成');
    } catch (error) {
      this.logger.error('部署失败:', error);
      throw error;
    }
  }

  private async deployL1Environment(): Promise<void> {
    const l1Deployer = new L1Deployer(this.config, this.logger);
    await l1Deployer.deploy();
  }

  private async deployZkEVMContracts(): Promise<void> {
    try {
      await this.contractDeployer.deploy();
      this.logger.info('zkEVM 合约部署完成');
    } catch (error) {
      this.logger.error('zkEVM 合约部署失败:', error);
      throw error;
    }
  }

  private async getContractAddresses(): Promise<any> {
    // 从合约部署服务中获取地址
    const contractsService = `contracts${this.config.deployment_args.deployment_suffix}`;
    const combinedJsonPath = '/opt/zkevm/combined.json';
    
    try {
      const result = execSync(`docker exec ${contractsService} /bin/sh -c "cat ${combinedJsonPath}"`);
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error('获取合约地址失败:', error);
      throw error;
    }
  }

  private async deployDatabases(): Promise<void> {
    try {
      await this.databaseDeployer.deploy();
      this.logger.info('数据库服务部署完成');
    } catch (error) {
      this.logger.error('数据库部署失败:', error);
      throw error;
    }
  }

  private async deployCDKCentralEnvironment(): Promise<void> {
    try {
      const centralEnvDeployer = new CentralEnvironmentDeployer(
        this.config,
        this.logger,
        this.service
      );
      await centralEnvDeployer.deploy();
      this.logger.info('CDK 中心环境部署完成');
    } catch (error) {
      this.logger.error('CDK 中心环境部署失败:', error);
      throw error;
    }
  }

  private async deployAggLayer(): Promise<void> {
    const agglayerDeployer = new AgglayerDeployer(
      this.config,
      this.logger,
      this.service
    );
    await agglayerDeployer.deploy();
  }

  private async deployBridge(): Promise<void> {
    const bridgeDeployer = new BridgeDeployer(this.config, this.logger, this.service);
    await bridgeDeployer.deploy();
  }

  private async deployL2Contracts(): Promise<void> {
    const l2ContractDeployer = new L2ContractDeployer(this.config, this.logger);
    await l2ContractDeployer.deploy(true);
  }

  private async deployAdditionalServices(): Promise<void> {
      const additionalServicesDeployer = new AdditionalServicesDeployer(
        this.config,
        this.logger,
        this.service
    );
    await additionalServicesDeployer.deploy();
  }
} 