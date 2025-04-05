import * as path from 'path';
import { ConfigLoader } from './utils/config-loader';
import { CDKDeployer } from './deployer';
import { Logger } from './utils/logger';

async function main() {
  try {
    // 获取配置文件路径
    const configPath = process.argv[2] || path.join(__dirname, '../default-config.yml');
    
    // 创建日志记录器
    const logger = new Logger();
    
    // 加载配置文件
    const config = ConfigLoader.load(configPath);
    
    // 设置日志级别
    logger.setLevel(config.global_log_level);
    
    // 创建部署器
    const deployer = new CDKDeployer(config, logger);
    
    // 执行部署
    await deployer.deploy();
  } catch (error) {
    console.error('部署失败:', error);
    process.exit(1);
  }
}

main(); 