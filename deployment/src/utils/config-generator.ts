import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DeploymentConfig } from '../types/config';
import { PathManager } from '../services/base-deployer';

/**
 * 统一的配置生成器
 * 使用tatt工具渲染模板生成配置文件
 */
export class ConfigGenerator {
  protected readonly config: DeploymentConfig;
  protected readonly pathManager: PathManager;

  constructor(config: DeploymentConfig) {
    this.config = config;
    this.pathManager = new PathManager();
  }

  /**
   * 渲染模板文件
   * @param templateRelativePath 模板文件路径
   * @param data 数据对象
   * @param outputRelativePath 输出文件路径
   */
  public async renderTemplate(templateRelativePath: string, data: any, outputRelativePath: string): Promise<void> {
    // 确保构建目录存在
    await fs.promises.mkdir(this.pathManager.getBuildDir(), { recursive: true });

    // 创建临时数据文件
    const tempDataPath = path.join(this.pathManager.getDataDir(), 'temp_data.json');
    await fs.promises.writeFile(tempDataPath, JSON.stringify(data, null, 2), 'utf8');

    const templateAbsolutePath = path.join(this.pathManager.getTemplatesDir(), templateRelativePath);
    const outputAbsolutePath = path.join(this.pathManager.getBuildDir(), outputRelativePath);

    try {
      // 确保输出目录存在
      const outputDir = path.dirname(outputAbsolutePath);
      await fs.promises.mkdir(outputDir, { recursive: true });

      // 使用tatt渲染模板
      const result = execSync(`${process.env.HOME}/go/bin/tatt --data ${tempDataPath} ${templateAbsolutePath}`, {
        encoding: 'utf8'
      });

      // 写入输出文件
      await fs.promises.writeFile(outputAbsolutePath, result, 'utf8');
    } finally {
      // 清理临时数据文件
      await fs.promises.unlink(tempDataPath);
    }
  }
} 