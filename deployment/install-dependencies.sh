#!/bin/bash

# 设置错误时退出
set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 检查是否为root用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_warning "某些安装可能需要管理员权限。如果安装失败，请尝试使用sudo运行此脚本。"
    fi
}

# 安装Docker和Docker Compose
install_docker() {
    print_message "检查Docker安装..."
    if command_exists docker; then
        print_message "Docker已安装: $(docker --version)"
    else
        print_message "安装Docker..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            print_message "请访问 https://docs.docker.com/desktop/install/mac-install/ 安装Docker Desktop for Mac"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command_exists apt-get; then
                sudo apt-get update
                sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common
                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
                sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
                sudo apt-get update
                sudo apt-get install -y docker-ce
                sudo usermod -aG docker $USER
            elif command_exists yum; then
                sudo yum install -y yum-utils
                sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                sudo yum install -y docker-ce docker-ce-cli containerd.io
                sudo usermod -aG docker $USER
            else
                print_error "无法确定包管理器，请手动安装Docker"
            fi
        else
            print_error "不支持的操作系统，请手动安装Docker"
        fi
    fi

    print_message "检查Docker Compose安装..."
    if command_exists docker-compose; then
        print_message "Docker Compose已安装: $(docker-compose --version)"
    else
        print_message "安装Docker Compose..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            print_message "Docker Compose应该随Docker Desktop一起安装"
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command_exists apt-get; then
                sudo apt-get install -y docker-compose
            elif command_exists yum; then
                sudo yum install -y docker-compose
            else
                print_error "无法确定包管理器，请手动安装Docker Compose"
            fi
        else
            print_error "不支持的操作系统，请手动安装Docker Compose"
        fi
    fi
}

# 安装jq
install_jq() {
    print_message "检查jq安装..."
    if command_exists jq; then
        print_message "jq已安装: $(jq --version)"
    else
        print_message "安装jq..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install jq
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command_exists apt-get; then
                sudo apt-get update
                sudo apt-get install -y jq
            elif command_exists yum; then
                sudo yum install -y jq
            else
                print_error "无法确定包管理器，请手动安装jq"
            fi
        else
            print_error "不支持的操作系统，请手动安装jq"
        fi
    fi
}

# 安装yq
install_yq() {
    print_message "检查yq安装..."
    if command_exists yq; then
        print_message "yq已安装: $(yq --version)"
    else
        print_message "安装yq..."
        if command_exists pip; then
            pip install yq
        elif command_exists pip3; then
            pip3 install yq
        else
            print_error "未找到pip，请先安装Python和pip"
        fi
    fi
}

# 安装nvm和Node.js
install_nvm_node() {
    print_message "检查nvm安装..."
    if [ -d "$HOME/.nvm" ]; then
        print_message "nvm已安装"
        source "$HOME/.nvm/nvm.sh"
    else
        print_message "安装nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi

    print_message "安装Node.js 20..."
    nvm install 20
    nvm use 20
    print_message "Node.js已安装: $(node --version)"
    print_message "npm已安装: $(npm --version)"
}

# 安装Go
install_go() {
    print_message "检查Go安装..."
    if command_exists go; then
        print_message "Go已安装: $(go version)"
        # 检查Go版本是否满足要求
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        if [[ "$(printf '%s\n' "1.22.1" "$GO_VERSION" | sort -V | head -n1)" != "1.22.1" ]]; then
            print_warning "当前Go版本($GO_VERSION)低于1.22.1，tatt需要Go 1.22.1或更高版本"
            print_message "将安装最新版本的Go..."
            # 继续安装最新版本
        else
            print_message "Go版本满足要求，无需更新"
            # 设置环境变量
            setup_go_env
            return
        fi
    fi
    
    print_message "安装最新版本的Go..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # 对于macOS，使用brew安装最新版本
        brew install go
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # 对于Linux，从官方下载最新版本
        GO_ARCH=$(uname -m)
        if [[ "$GO_ARCH" == "x86_64" ]]; then
            GO_ARCH="amd64"
        elif [[ "$GO_ARCH" == "aarch64" ]]; then
            GO_ARCH="arm64"
        fi
        
        GO_OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        
        # 尝试获取最新版本
        GO_VERSION=$(curl -s https://go.dev/VERSION?m=text)
        if [ -z "$GO_VERSION" ]; then
            print_warning "无法获取最新Go版本，使用固定版本1.22.1"
            GO_VERSION="go1.22.1"
        fi
        
        GO_URL="https://go.dev/dl/${GO_VERSION}.${GO_OS}-${GO_ARCH}.tar.gz"
        
        print_message "下载Go: $GO_URL"
        # 使用curl代替wget，并添加错误处理
        if ! curl -L -o /tmp/go.tar.gz "$GO_URL"; then
            print_error "下载Go失败，尝试使用备用URL..."
            # 备用URL
            BACKUP_URL="https://go.dev/dl/go1.22.1.${GO_OS}-${GO_ARCH}.tar.gz"
            print_message "尝试下载: $BACKUP_URL"
            if ! curl -L -o /tmp/go.tar.gz "$BACKUP_URL"; then
                print_error "下载Go失败，请手动安装Go 1.22.1或更高版本"
                return 1
            fi
        fi
        
        # 删除旧版本（如果存在）
        if [ -d "/usr/local/go" ]; then
            sudo rm -rf /usr/local/go
        fi
        
        # 解压到/usr/local
        if ! sudo tar -C /usr/local -xzf /tmp/go.tar.gz; then
            print_error "解压Go失败，请手动安装Go 1.22.1或更高版本"
            rm /tmp/go.tar.gz
            return 1
        fi
        
        rm /tmp/go.tar.gz
    else
        print_error "不支持的操作系统，请手动安装Go"
        return 1
    fi
    
    # 设置环境变量
    setup_go_env
}

# 设置Go环境变量
setup_go_env() {
    print_message "设置Go环境变量..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # 检查.zshrc中是否已存在Go环境变量
        if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.zshrc; then
            echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.zshrc
        fi
        if ! grep -q "export PATH=\$PATH:\$(go env GOPATH)/bin" ~/.zshrc; then
            echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.zshrc
        fi
        # 立即应用更改
        export PATH=$PATH:/usr/local/go/bin
        export PATH=$PATH:$(go env GOPATH)/bin
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # 检查.bashrc中是否已存在Go环境变量
        if ! grep -q "export PATH=\$PATH:/usr/local/go/bin" ~/.bashrc; then
            echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
        fi
        if ! grep -q "export PATH=\$PATH:\$(go env GOPATH)/bin" ~/.bashrc; then
            echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
        fi
        # 立即应用更改
        export PATH=$PATH:/usr/local/go/bin
        export PATH=$PATH:$(go env GOPATH)/bin
    fi
    
    print_message "Go环境变量已设置"
    print_message "Go已安装: $(go version)"
}

# 安装tatt
install_tatt() {
    print_message "检查tatt安装..."
    if command_exists tatt; then
        print_message "tatt已安装"
    else
        print_message "安装tatt..."
        # 确保Go版本满足要求
        GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
        if [[ "$(printf '%s\n' "1.22.1" "$GO_VERSION" | sort -V | head -n1)" != "1.22.1" ]]; then
            print_error "Go版本($GO_VERSION)低于1.22.1，tatt需要Go 1.22.1或更高版本"
            print_message "请先更新Go版本后再安装tatt"
            return 1
        fi
        
        # 安装tatt
        go install github.com/michenriksen/tatt/cmd/tatt@latest
        # 环境变量已在install_go函数中设置，无需重复设置
    fi
}

# 主函数
main() {
    print_message "开始安装依赖..."
    check_root
    
    install_docker
    install_jq
    install_yq
    install_nvm_node
    install_go
    install_tatt
    
    print_message "所有依赖安装完成！"
    print_message "请重新启动终端或运行 'source ~/.bashrc' (Linux) 或 'source ~/.zshrc' (macOS) 以使更改生效。"
}

# 执行主函数
main 