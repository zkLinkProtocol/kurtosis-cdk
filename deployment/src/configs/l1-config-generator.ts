import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../types/config';

export class L1ConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成 Anvil 启动脚本
   * @param outputPath 输出路径
   */
  async generateAnvilStartScript(outputPath: string): Promise<void> {
    const args = this.config.deployment_args;
    
    const commands = [
      '#!/bin/sh',
      'anvil \\',
      `  --block-time ${args.l1_anvil_block_time || 1} \\`,
      `  --slots-in-an-epoch ${args.l1_anvil_slots_in_epoch || 1} \\`,
      `  --chain-id ${args.l1_chain_id} \\`,
      '  --host 0.0.0.0 \\',
      '  --port 8545 \\',
      '  --dump-state /tmp/state_out.json \\',
      '  --balance 1000000000 \\',
      `  --mnemonic "${args.l1_preallocated_mnemonic}"`
    ];

    const content = commands.join('\n');
    await this.generateConfig(content, outputPath);
  }
} 