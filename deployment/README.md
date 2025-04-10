# zkLink CDK 部署工具

这个工具用于自动部署zkLink CDK堆栈，包括L1合约、数据库、zkEVM节点、桥接服务等组件。

## 环境要求

- Docker 和 Docker Compose
- jq (https://github.com/jqlang/jq) - 命令行JSON处理工具
- yq (https://pypi.org/project/yq/) - 命令行YAML处理工具
- nvm (Node Version Manager)
- Node.js v20+ (通过nvm安装)
- npm (随Node.js一起安装)
- tatt (https://github.com/michenriksen/tatt) - 模板工具
- Go 1.22.1+ (tatt的依赖，需要较新版本)

## 安装依赖

我们提供了一个自动化脚本来安装所有必需的依赖项。您可以直接运行此脚本：

```bash
# 进入deployment目录
cd deployment

# 运行安装脚本
./install-dependencies.sh
```

如果您希望手动安装依赖，请参考以下说明：

### 安装Docker和Docker Compose

请参考[Docker官方文档](https://docs.docker.com/get-docker/)安装Docker和Docker Compose。

### 安装jq

macOS:
```bash
brew install jq
```

Linux:
```bash
sudo apt-get install jq  # Ubuntu/Debian
sudo yum install jq      # CentOS/RHEL
```

### 安装yq

```bash
pip install yq
```

### 安装nvm和Node.js

```bash
# 安装nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

# 重新加载shell配置
source ~/.bashrc  # 或 source ~/.zshrc

# 安装Node.js
nvm install 20
nvm use 20
```

### 安装Go (tatt依赖)

tatt需要Go 1.22.1或更高版本。请从[Go官方网站](https://go.dev/dl/)下载并安装最新版本。

macOS:
```bash
brew install go
```

Linux:
```bash
# 下载最新版本
wget https://go.dev/dl/$(curl -s https://go.dev/VERSION?m=text).linux-amd64.tar.gz

# 删除旧版本（如果存在）
sudo rm -rf /usr/local/go

# 解压到/usr/local
sudo tar -C /usr/local -xzf go*.tar.gz
rm go*.tar.gz

# 设置环境变量
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
source ~/.bashrc
```

### 安装tatt

```bash
go install github.com/michenriksen/tatt@latest
```

## 安装步骤

1. 克隆仓库并进入部署目录：

```bash
git clone https://github.com/your-repo/zklink.git
cd zklink/deployment
```

2. 安装依赖：

```bash
npm install
```

3. 编译TypeScript代码：

```bash
npm run build
```

## 配置说明

部署工具使用YAML格式的配置文件来定义部署参数。您可以创建自定义配置文件（例如`config.yml`）：

```yaml
deployment_stages:
  deploy_l1: false
  deploy_zkevm_contracts_on_l1: true
  deploy_databases: true
  deploy_cdk_central_environment: true
  deploy_cdk_bridge_infra: true
  deploy_l2_contracts: true

args:
  deployment_suffix: "-test"
  verbosity: "info"
  global_log_level: "info"
  
  l1_chain_id: 11155111
  l1_engine: "anvil"
  l1_rpc_url: "https://ethereum-sepolia.publicnode.com"
  l1_ws_url: "wss://ethereum-sepolia.publicnode.com"
  l1_explorer_url: "https://sepolia.etherscan.io"
```

关键配置项说明：
- `deployment_stages`: 定义要执行的部署阶段
- `args.deployment_suffix`: 部署服务名称后缀，用于区分不同环境
- `args.l1_engine`: L1链引擎类型，支持`geth`或`anvil`
- `args.l1_rpc_url`: L1链的RPC URL

完整配置选项请参考`src/types/config.ts`文件。

## 使用方法

使用配置文件启动部署：

```bash
npm start /path/to/your/config.yml
```

或使用ts-node直接运行：

```bash
npx ts-node src/index.ts /path/to/your/config.yml
```

## 部署步骤说明

部署过程将按照以下步骤执行（取决于您在`deployment_stages`中启用的阶段）：

1. **部署L1链**（可选）- 如果启用`deploy_l1`，将部署本地L1开发链
2. **部署zkEVM合约** - 在L1上部署zkEVM相关合约
3. **部署数据库** - 部署PostgreSQL数据库服务
4. **部署CDK中心环境** - 部署zkEVM节点和Prover（如需要）
5. **部署L2合约** - 在L2上部署基础合约
6. **部署桥接服务** - 部署L1-L2桥接服务和UI
7. **部署AggLayer**（可选）- 部署聚合层
8. **部署额外服务**（可选）- 如Blockscout、Prometheus等

## 常见问题

### 如何指定使用本地或远程L1链？

在配置文件中设置`args.use_local_l1`：
- `true`: 使用本地部署的L1链（需设置`deployment_stages.deploy_l1: true`）
- `false`: 使用现有的L1链（通过`args.l1_rpc_url`指定）

### 如何查看部署日志？

部署日志保存在`deployment.log`文件中，您也可以通过控制台输出实时查看。

### 部署失败如何处理？

1. 查看日志文件了解具体错误
2. 修复配置或环境问题
3. 根据需要调整`deployment_stages`，跳过已完成的阶段，重新运行部署 