import { BaseConfigGenerator } from './base-config-generator';
import { DeploymentConfig } from '../src/types/config';

export class ContractConfigGenerator extends BaseConfigGenerator {
  constructor(config: DeploymentConfig) {
    super(config);
  }

  /**
   * 生成合约部署参数配置文件
   * @param outputPath 输出路径
   */
  async generateDeployParameters(outputPath: string): Promise<void> {
    const content = this.formatJSON({
      admin: this.config.deployment_args.zkevm_l2_admin_address,
      deployerPvtKey: this.config.deployment_args.zkevm_l2_admin_private_key,
      emergencyCouncilAddress: this.config.deployment_args.zkevm_l2_admin_address,
      initialZkEVMDeployerOwner: this.config.deployment_args.zkevm_l2_admin_address,
      maxFeePerGas: "",
      maxPriorityFeePerGas: "",
      minDelayTimelock: 60,
      multiplierGas: "",
      pendingStateTimeout: 604799,
      polTokenAddress: "",
      salt: "0x0000000000000000000000000000000000000000000000000000000000000001",
      timelockAdminAddress: this.config.deployment_args.zkevm_l2_admin_address,
      trustedSequencer: this.config.deployment_args.zkevm_l2_sequencer_address,
      trustedSequencerURL: `http://${this.config.deployment_args.sequencer_name}${this.config.deployment_args.deployment_suffix}:${this.config.deployment_args.zkevm_rpc_http_port}`,
      trustedAggregator: this.config.deployment_args.zkevm_l2_aggregator_address,
      trustedAggregatorTimeout: 604799,
      forkID: this.config.deployment_args.zkevm_rollup_fork_id,
      test: true
    });

    await this.generateConfig(content, outputPath);
  }

  /**
   * 生成合约部署脚本
   * @param outputPath 输出路径
   */
  async generateSetupScript(outputPath: string): Promise<void> {
    const commands = [
      '#!/bin/bash',
      `global_log_level="${this.config.deployment_args.global_log_level}"`,
      'if [[ $global_log_level == "debug" ]]; then',
      '    set -x',
      'fi',
      '',
      'echo_ts() {',
      '    green="\\e[32m"',
      '    end_color="\\e[0m"',
      '    timestamp=$(date +"[%Y-%m-%d %H:%M:%S]")',
      '    echo -e "$green$timestamp$end_color $1" >&2',
      '}',
      '',
      'wait_for_rpc_to_be_available() {',
      '    counter=0',
      '    max_retries=20',
      `    until cast send --rpc-url "${this.config.deployment_args.l1_rpc_url}" --mnemonic "${this.config.deployment_args.l1_preallocated_mnemonic}" --value 0 "${this.config.deployment_args.zkevm_l2_sequencer_address}" &> /dev/null; do`,
      '        ((counter++))',
      '        echo_ts "Can\'t send L1 transfers yet... Retrying ($counter)..."',
      '        if [[ $counter -ge $max_retries ]]; then',
      '            echo_ts "Exceeded maximum retry attempts. Exiting."',
      '            exit 1',
      '        fi',
      '        sleep 5',
      '    done',
      '}',
      '',
      'fund_account_on_l1() {',
      '    name="$1"',
      '    address="$2"',
      '    echo_ts "Funding $name account"',
      '    cast send \\',
      `        --rpc-url "${this.config.deployment_args.l1_rpc_url}" \\`,
      `        --mnemonic "${this.config.deployment_args.l1_preallocated_mnemonic}" \\`,
      `        --value "${this.config.deployment_args.l1_funding_amount}" \\`,
      '        "$address"',
      '}'
    ];

    // 添加资金转移命令
    commands.push(
      '',
      'echo_ts "Funding important accounts on L1"',
      `fund_account_on_l1 "admin" "${this.config.deployment_args.zkevm_l2_admin_address}"`,
      `fund_account_on_l1 "sequencer" "${this.config.deployment_args.zkevm_l2_sequencer_address}"`,
      `fund_account_on_l1 "aggregator" "${this.config.deployment_args.zkevm_l2_aggregator_address}"`,
      `fund_account_on_l1 "agglayer" "${this.config.deployment_args.zkevm_l2_agglayer_address}"`,
      `fund_account_on_l1 "l1testing" "${this.config.deployment_args.zkevm_l2_l1testing_address}"`
    );

    // 添加 DAC 相关配置（如果需要）
    if (this.config.deployment_args.consensus_contract_type === 'cdk-validium') {
      commands.push(
        '',
        '# Configure DAC',
        'echo_ts "Setting the data availability committee"',
        'cast send \\',
        `    --private-key "${this.config.deployment_args.zkevm_l2_admin_private_key}" \\`,
        `    --rpc-url "${this.config.deployment_args.l1_rpc_url}" \\`,
        '    "$(jq -r \'.polygonDataCommitteeAddress\' combined.json)" \\',
        '    \'function setupCommittee(uint256 _requiredAmountOfSignatures, string[] urls, bytes addrsBytes) returns()\' \\',
        `    1 ["http://zkevm-dac${this.config.deployment_args.deployment_suffix}:${this.config.deployment_args.zkevm_dac_port}"] "${this.config.deployment_args.zkevm_l2_dac_address}"`
      );
    }

    const content = this.formatShell(commands);
    await this.generateConfig(content, outputPath);
  }
} 