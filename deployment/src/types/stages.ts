export interface DeploymentStages {
  // 部署本地 L1 链
  deploy_l1?: boolean;
  
  // 在 L1 上部署 zkEVM 合约
  deploy_zkevm_contracts_on_l1?: boolean;
  
  // 部署数据库
  deploy_databases?: boolean;
  
  // 部署 CDK 中心环境
  deploy_cdk_central_environment?: boolean;
  
  // 部署 CDK 桥接基础设施
  deploy_cdk_bridge_infra?: boolean;
  
  // 部署 CDK 桥接 UI
  deploy_cdk_bridge_ui?: boolean;
  
  // 部署 AggLayer
  deploy_agglayer?: boolean;
  
  // 部署 CDK-Erigon 节点
  deploy_cdk_erigon_node?: boolean;
  
  // 部署 Optimism rollup
  deploy_optimism_rollup?: boolean;
  
  // 部署 OP Succinct
  deploy_op_succinct?: boolean;
  
  // 部署 L2 合约
  deploy_l2_contracts?: boolean;
} 