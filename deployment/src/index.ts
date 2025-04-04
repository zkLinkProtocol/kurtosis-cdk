import { CDKDeployer } from './deployer';
import { ConfigLoader } from './utils/config-loader';

async function main() {
  try {
    // 获取配置文件路径(从命令行参数)
    const configPath = process.argv[2];
    if (!configPath) {
      console.error('请指定配置文件路径');
      process.exit(1);
    }

    // 加载配置
    const { config, stages } = ConfigLoader.load(configPath);

    // 创建部署器
    const deployer = new CDKDeployer(config, stages);

    // 执行部署
    await deployer.deploy();
  } catch (error) {
    console.error('部署失败:', error);
    process.exit(1);
  }
}

main(); 