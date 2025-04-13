import { BaseComposeGenerator, DockerComposeConfig, ComposeNetworkConfig } from './base-compose-generator';
import { DeploymentConfig } from '../types/config';
import { Logger } from '../utils/logger';
import path from 'path';
import { execSync } from 'child_process';

export interface ProverExtraConfig {
  proverType: 'prover' | 'executor' | 'stateless-executor';
  proverConfigPath: string;
}

export interface Artifact {
  path: string;
  name: string;
}

export interface SequencerExtraConfig {
  sequencerConfig: Artifact;
  sequencerChainspec: Artifact;
  sequencerChainConfig: Artifact;
  sequencerChainAllocs: Artifact;
  sequencerChainFirstBatch: Artifact;
  sequencerDatadir: Artifact;
  proverConfig?: ProverExtraConfig;
}

export interface RpcExtraConfig {
  rpcConfig: Artifact;
  rpcChainspec: Artifact;
  rpcChainConfig: Artifact;
  rpcChainAllocs: Artifact;
  rpcChainFirstBatch: Artifact;
}

export interface ZkevmPoolManagerExtraConfig {
  zkevmPoolManagerConfig: Artifact;
}

export interface DacExtraConfig {
  dacConfig: Artifact;
  dacKeystore: Artifact;
}

export interface CdkNodeExtraConfig {
  cdkNodeConfig: Artifact;
  cdkNodeGenesis: Artifact;
  cdkNodeAggregatorKeystore: Artifact;
  cdkNodeSequencerKeystore: Artifact;
  cdkNodeClaimsponsorKeystore: Artifact;
  cdkNodeDatadir: Artifact;
}

export interface CentralEnvironmentExtraConfig {
  type: 'cdk-erigon-sequencer' | 'zkevm-pool-manager' | 'cdk-erigon-rpc' | 'prover' | 'stateless-executor' | 'dac' | 'cdk-node';
  config: SequencerExtraConfig | ProverExtraConfig | ZkevmPoolManagerExtraConfig | RpcExtraConfig | DacExtraConfig | CdkNodeExtraConfig;
}

export class CentralEnvironmentComposeGenerator extends BaseComposeGenerator {
  constructor(config: DeploymentConfig, logger: Logger, network: ComposeNetworkConfig) {
    super(config, logger, network);
  }

  public async generate(extraConfig: CentralEnvironmentExtraConfig): Promise<DockerComposeConfig> {
    // 每次调用时创建新的composeConfig对象，避免多次调用之间的相互影响
    this.composeConfig = {
      version: '3.8',
      services: {}
    };

    // 根据 extraConfig 的 type 添加服务
    // 每次调用生成独立的compose文件
    switch (extraConfig.type) {
      case 'cdk-erigon-sequencer':
        await this.addSequencerService(extraConfig);
        break;
      case 'zkevm-pool-manager':
        await this.addZkevmPoolManagerService(extraConfig);
        break;
      case 'cdk-erigon-rpc':
        await this.addRpcService(extraConfig);
        break;
      case 'prover':
          await this.addProverService(extraConfig);
        break;
      case 'dac':
        await this.addDACService(extraConfig);
        break;
      case 'cdk-node':
        await this.addCdkNodeService(extraConfig);
        break;
    }
    
    return this.composeConfig;
  }

  private async addCdkNodeService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const cdkNodeConfig = extraConfig.config as CdkNodeExtraConfig;
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = `cdk-node${args.deployment_suffix}`;

    this.addService(serviceName, {
      image: args.cdk_node_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeConfig.path,
          target: `/etc/cdk/${cdkNodeConfig.cdkNodeConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeGenesis.path,
          target: `/etc/cdk/${cdkNodeConfig.cdkNodeGenesis.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeAggregatorKeystore.path,
          target: `/etc/cdk/${cdkNodeConfig.cdkNodeAggregatorKeystore.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeSequencerKeystore.path,
          target: `/etc/cdk/${cdkNodeConfig.cdkNodeSequencerKeystore.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeClaimsponsorKeystore.path,
          target: `/etc/cdk/${cdkNodeConfig.cdkNodeClaimsponsorKeystore.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: cdkNodeConfig.cdkNodeDatadir.path,
          target: `/data`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.cdk_node_start_port}:${args.zkevm_aggregator_port}`, // aggregator
        `${static_ports.cdk_node_start_port+1}:${args.zkevm_cdk_node_port}`, // grpc
      ],
      entrypoint: ["/bin/bash", "-c"],
      command: ["sleep 20 && cdk-node run --cfg=/etc/cdk/cdk-node-config.toml --custom-network-file=/etc/cdk/genesis.json --components=sequence-sender,aggregator"],
    });

    // 添加网络配置
    this.addNetwork();
  }

  private async addProverService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const proverConfig = extraConfig.config as ProverExtraConfig;
    
    const cpu_arch_result = execSync('uname -m | tr -d \'\n\'');
    const cpu_arch = cpu_arch_result.toString().trim();

    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = `zkevm-${proverConfig.proverType}${args.deployment_suffix}`;
    
    this.addService(serviceName, {
      image: args.zkevm_prover_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind' as const,
          source: proverConfig.proverConfigPath,
          target: `/etc/zkevm/${proverConfig.proverType}-config.json`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: this.getProverPorts(proverConfig),
      entrypoint: ["/bin/bash", "-c"],
      command: [`/usr/local/bin/zkProver -c /etc/zkevm/${proverConfig.proverType}-config.json`],
      // 添加环境变量
      environment: {
        EXPERIMENTAL_DOCKER_DESKTOP_FORCE_QEMU: cpu_arch === 'aarch64' || cpu_arch === 'arm64' ? '1' : '0'
      }
    });

    // 添加网络配置
    this.addNetwork();
      
  }

  private getProverPorts(proverConfig: ProverExtraConfig): string[] {
    if (proverConfig.proverType === 'stateless-executor') {
      return [
        `${this.config.static_ports.zkevm_stateless_executor_start_port}:${this.config.deployment_args.zkevm_hash_db_port}`,
        `${this.config.static_ports.zkevm_stateless_executor_start_port+1}:${this.config.deployment_args.zkevm_executor_port}`
      ];
    } else if (proverConfig.proverType === 'executor') {
      return [
        `${this.config.static_ports.zkevm_executor_start_port}:${this.config.deployment_args.zkevm_hash_db_port}`,
        `${this.config.static_ports.zkevm_executor_start_port+1}:${this.config.deployment_args.zkevm_executor_port}`
      ];
    } else if (proverConfig.proverType === 'prover') {
      return [
        `${this.config.static_ports.zkevm_prover_start_port}:${this.config.deployment_args.zkevm_hash_db_port}`,
        `${this.config.static_ports.zkevm_prover_start_port+1}:${this.config.deployment_args.zkevm_executor_port}`
      ];
    } else {
      this.logger.error(`Invalid prover type: ${proverConfig.proverType}`);
      return [];
    }
  }
  

  private async addSequencerService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const sequencerConfig = extraConfig.config as SequencerExtraConfig;
    const serviceName = this.getServiceName('cdk-erigon-sequencer');
    const static_ports = this.config.static_ports;
    const args = this.config.deployment_args;
    
    // 添加 stateless-executor 服务
    if (this.config.deployment_args.erigon_strict_mode) {
      this.addProverService({
        type: 'stateless-executor',
        config: sequencerConfig.proverConfig!
      });
    }

    this.addService(serviceName, {
      image: args.cdk_erigon_node_image,
      container_name: serviceName,
      volumes: [
        // 添加 sequencer-config.toml
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerConfig.path,
          target: `/etc/cdk-erigon/${sequencerConfig.sequencerConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-spec.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainspec.path,
          target: `/etc/cdk-erigon/${sequencerConfig.sequencerChainspec.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-config.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainConfig.path,
          target: `/etc/cdk-erigon/${sequencerConfig.sequencerChainConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-allocs.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainAllocs.path,
          target: `/etc/cdk-erigon/${sequencerConfig.sequencerChainAllocs.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-first-batch.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainFirstBatch.path,
          target: `/etc/cdk-erigon/${sequencerConfig.sequencerChainFirstBatch.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-spec.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainspec.path,
          target: `/home/erigon/dynamic-configs/${sequencerConfig.sequencerChainspec.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 加 dynamic-configs chain-config.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainConfig.path,
          target: `/home/erigon/dynamic-configs/${sequencerConfig.sequencerChainConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-allocs.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainAllocs.path,
          target: `/home/erigon/dynamic-configs/${sequencerConfig.sequencerChainAllocs.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-first-batch.json
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerChainFirstBatch.path,
          target: `/home/erigon/dynamic-configs/${sequencerConfig.sequencerChainFirstBatch.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs datadir
        {
          type: 'bind' as const,
          source: sequencerConfig.sequencerDatadir.path,
          target: `/home/erigon/data/dynamic-${this.config.deployment_args.chain_name}-sequencer`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 proc-runner
        {
          type: 'bind' as const,
          source: this.pathManager.getTemplatePath('proc-runner.sh'),
          target: `/usr/local/share/proc-runner/proc-runner.sh`,
          bind: {
            create_host_path: true,
          }
        }
      ],
      ports: [
        `${static_ports.cdk_erigon_sequencer_start_port}:${args.zkevm_rpc_http_port}`,  // rpc http
        `${static_ports.cdk_erigon_sequencer_start_port+1}:${args.zkevm_rpc_ws_port}`,  // rpc ws
        `${static_ports.cdk_erigon_sequencer_start_port+2}:${args.zkevm_data_streamer_port}`,  // data streamer
        `${static_ports.cdk_erigon_sequencer_start_port+3}:${args.zkevm_pprof_port}`,  // pprof
        `${static_ports.cdk_erigon_sequencer_start_port+4}:${args.prometheus_port}`,  // prometheus
      ],
      entrypoint: ["/usr/local/share/proc-runner/proc-runner.sh"],
      command: ["cdk-erigon --config /etc/cdk-erigon/config.yaml"],
      environment: {
        CDK_ERIGON_SEQUENCER: '1'
      }
    });
    // 添加网络配置
    this.addNetwork();
  }

  private async addZkevmPoolManagerService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const zkevmPoolManagerConfig = extraConfig.config as ZkevmPoolManagerExtraConfig;
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('zkevm-pool-manager');

    // 添加 zkevm-pool-manager 服务配置
    this.addService(serviceName, {
      image: args.zkevm_pool_manager_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind' as const,
          source: zkevmPoolManagerConfig.zkevmPoolManagerConfig.path,
          target: `/etc/pool-manager/${zkevmPoolManagerConfig.zkevmPoolManagerConfig.name}`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.zkevm_pool_manager_start_port}:${args.zkevm_pool_manager_port}`,
      ],
      entrypoint: ["/bin/sh", "-c"],
      command: [`/app/zkevm-pool-manager run --cfg /etc/pool-manager/${zkevmPoolManagerConfig.zkevmPoolManagerConfig.name}`],
    });

    // 添加网络配置
    this.addNetwork();
  }

  private async addRpcService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const cdkErigonNodeConfig = extraConfig.config as RpcExtraConfig;
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('cdk-erigon-rpc');

    // 添加 cdk erigon rpc 服务配置
    this.addService(serviceName, {
      image: args.cdk_erigon_node_image,
      container_name: `cdk-erigon-rpc${args.deployment_suffix}`,
      volumes: [
        // 添加 config.yaml
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcConfig.path,
          target: `/etc/cdk-erigon/${cdkErigonNodeConfig.rpcConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chainspec.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainspec.path,
          target: `/etc/cdk-erigon/${cdkErigonNodeConfig.rpcChainspec.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-config.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainConfig.path,
          target: `/etc/cdk-erigon/${cdkErigonNodeConfig.rpcChainConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-allocs.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainAllocs.path,
          target: `/etc/cdk-erigon/${cdkErigonNodeConfig.rpcChainAllocs.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 chain-first-batch.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainFirstBatch.path,
          target: `/etc/cdk-erigon/${cdkErigonNodeConfig.rpcChainFirstBatch.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-spec.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainspec.path,
          target: `/home/erigon/dynamic-configs/${cdkErigonNodeConfig.rpcChainspec.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-config.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainConfig.path,
          target: `/home/erigon/dynamic-configs/${cdkErigonNodeConfig.rpcChainConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-allocs.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainAllocs.path,
          target: `/home/erigon/dynamic-configs/${cdkErigonNodeConfig.rpcChainAllocs.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 dynamic-configs chain-first-batch.json
        {
          type: 'bind' as const,
          source: cdkErigonNodeConfig.rpcChainFirstBatch.path,
          target: `/home/erigon/dynamic-configs/${cdkErigonNodeConfig.rpcChainFirstBatch.name}`,
          bind: {
            create_host_path: true
          }
        },
        // 添加 proc-runner
        {
          type: 'bind' as const,
          source: this.pathManager.getTemplatePath('proc-runner.sh'),
          target: `/usr/local/share/proc-runner/proc-runner.sh`,
          bind: {
            create_host_path: true,
          }
        }
      ],
      ports: [
        `${static_ports.cdk_erigon_rpc_start_port}:${args.zkevm_rpc_http_port}`,
        `${static_ports.cdk_erigon_rpc_start_port+1}:${args.zkevm_rpc_ws_port}`,
        `${static_ports.cdk_erigon_rpc_start_port+2}:${args.zkevm_pprof_port}`,
        `${static_ports.cdk_erigon_rpc_start_port+3}:${args.prometheus_port}`
      ],
      entrypoint: ["/usr/local/share/proc-runner/proc-runner.sh"],
      command: ["cdk-erigon --config /etc/cdk-erigon/config.yaml"],
    });

    // 添加网络配置
    this.addNetwork();
  }

  private async addDACService(extraConfig: CentralEnvironmentExtraConfig): Promise<void> {
    const dacConfig = extraConfig.config as DacExtraConfig;
    const args = this.config.deployment_args;
    const static_ports = this.config.static_ports;
    const serviceName = this.getServiceName('zkevm-dac');

    // 添加 DAC 服务配置
    this.addService(serviceName, {
      image: args.zkevm_da_image,
      container_name: serviceName,
      volumes: [
        {
          type: 'bind' as const,
          source: dacConfig.dacConfig.path,
          target: `/etc/zkevm/${dacConfig.dacConfig.name}`,
          bind: {
            create_host_path: true
          }
        },
        {
          type: 'bind' as const,
          source: dacConfig.dacKeystore.path,
          target: `/etc/zkevm/${dacConfig.dacKeystore.name}`,
          bind: {
            create_host_path: true
          }
        }
      ],
      ports: [
        `${static_ports.zkevm_dac_start_port}:${args.zkevm_dac_port}`,
      ],
      entrypoint: ["/app/cdk-data-availability"],
      command: ['run --cfg /etc/zkevm/dac-config.toml'],
    });

    // 添加网络配置
    this.addNetwork();
  }

  private shouldDeployProver(): boolean {
    // 检查是否需要部署 Prover
    const baseCondition = !this.config.deployment_args.zkevm_use_real_verifier && 
                         !this.config.deployment_args.enable_normalcy && 
                         this.config.deployment_args.consensus_contract_type !== 'pessimistic';

    if (!this.config.deployment_args.deploy_prover) {
      return false;
    }
    return (this.config.deployment_args.deploy_prover ?? false) && baseCondition;
  }

  private isCDKValidium(): boolean {
    return this.config.deployment_args.consensus_contract_type === 'cdk-validium';
  }
} 