import fs from 'fs';
import path from 'path';
import { ConfigLoader } from '../utils/config-loader';
import { DeploymentConfig } from '../types/config';

describe('ConfigLoader', () => {
  const defaultConfigPath = path.join(__dirname, '../../default-config.yml');
  const customConfigPath = path.join(__dirname, 'test-data/custom-config.yml');

  describe('加载默认配置', () => {
    it('应该成功加载默认配置', () => {
      const loader = new ConfigLoader(defaultConfigPath);
      const config = loader.getConfig();

      expect(config).toHaveProperty('deployment_stages');
      expect(config).toHaveProperty('deployment_args');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('op_stack_args');

      // 验证deployment_stages
      expect(config.deployment_stages.deploy_l1).toBe(true);
      expect(config.deployment_stages.deploy_optimism_rollup).toBe(false);

      // 验证deployment_args
      expect(config.deployment_args.deployment_suffix).toBe('-001');
      expect(config.deployment_args.sequencer_type).toBe('erigon');
      expect(config.deployment_args.consensus_contract_type).toBe('cdk-validium');

      // 验证database配置
      expect(config.database.postgres_host).toBe('localhost');
      expect(config.database.postgres_port).toBe(5432);
      expect(config.database.postgres_master_db).toBe('master');

      // 验证op_stack_args
      expect(config.op_stack_args.source).toBe(
        'github.com/ethpandaops/optimism-package/main.star@884f4eb813884c4c8e5deead6ca4e0c54b85da90'
      );
    });
  });

  describe('合并自定义配置', () => {
    beforeEach(() => {
      // 创建测试数据目录
      const testDataDir = path.dirname(customConfigPath);
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    });

    afterEach(() => {
      // 清理自定义配置文件
      if (fs.existsSync(customConfigPath)) {
        fs.unlinkSync(customConfigPath);
      }
    });

    it('应该正确合并部分自定义配置', () => {
      // 创建自定义配置文件
      const customConfig = {
        deployment_stages: {
          deploy_l1: false,
          deploy_optimism_rollup: true
        },
        deployment_args: {
          deployment_suffix: "-002",
          sequencer_type: "zkevm",
          consensus_contract_type: "cdk-validium"
        },
        database: {
          postgres_port: 5433
        }
      };
      fs.writeFileSync(customConfigPath, JSON.stringify(customConfig, null, 2));

      const loader = new ConfigLoader(defaultConfigPath, customConfigPath);
      const config = loader.getConfig();

      // 验证自定义配置是否正确覆盖默认配置
      expect(config.deployment_stages.deploy_l1).toBe(false);
      expect(config.deployment_stages.deploy_optimism_rollup).toBe(true);
      expect(config.deployment_stages.deploy_databases).toBe(true);

      expect(config.deployment_args.deployment_suffix).toBe('-002');
      expect(config.deployment_args.sequencer_type).toBe('zkevm');
      expect(config.deployment_args.consensus_contract_type).toBe('cdk-validium');

      expect(config.database.postgres_port).toBe(5433);
      expect(config.database.postgres_host).toBe('localhost');
    });
  });

  describe('配置验证', () => {
    beforeEach(() => {
      // 创建测试数据目录
      const testDataDir = path.dirname(customConfigPath);
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    });

    afterEach(() => {
      // 清理自定义配置文件
      if (fs.existsSync(customConfigPath)) {
        fs.unlinkSync(customConfigPath);
      }
    });

    it('应该在sequencer_type无效时抛出错误', () => {
      const invalidConfig = {
        deployment_args: {
          sequencer_type: "invalid"
        }
      };
      fs.writeFileSync(customConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => new ConfigLoader(defaultConfigPath, customConfigPath)).toThrow();
    });

    it('应该在consensus_contract_type无效时抛出错误', () => {
      const invalidConfig = {
        deployment_args: {
          consensus_contract_type: "invalid"
        }
      };
      fs.writeFileSync(customConfigPath, JSON.stringify(invalidConfig, null, 2));

      expect(() => new ConfigLoader(defaultConfigPath, customConfigPath)).toThrow();
    });
  });
}); 