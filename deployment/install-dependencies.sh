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
    else
        print_message "安装Go..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            brew install go
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command_exists apt-get; then
                sudo apt-get update
                sudo apt-get install -y golang
            elif command_exists yum; then
                sudo yum install -y golang
            else
                print_error "无法确定包管理器，请手动安装Go"
            fi
        else
            print_error "不支持的操作系统，请手动安装Go"
        fi
    fi
}

# 安装tatt
install_tatt() {
    print_message "检查tatt安装..."
    if command_exists tatt; then
        print_message "tatt已安装"
    else
        print_message "安装tatt..."
        go install github.com/michenriksen/tatt@latest
        # 确保GOPATH/bin在PATH中
        if [[ "$OSTYPE" == "darwin"* ]]; then
            echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.zshrc
            source ~/.zshrc
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            echo 'export PATH=$PATH:$(go env GOPATH)/bin' >> ~/.bashrc
            source ~/.bashrc
        fi
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