import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../utils/logger';
import { DeploymentConfig } from '../types';
import { existsSync, mkdirSync, readFileSync, writeFileSync, accessSync, unlinkSync } from 'fs';
import { constants } from 'fs';
import { ConfigGenerator } from '../utils/config-generator';

// 路径管理类
export class PathManager {
  private readonly projectRoot: string;
  private readonly deploymentDir: string;
  private readonly buildDir: string;
  private readonly dataDir: string;
  private readonly templatesDir: string;

  constructor() {
    // deployment 目录
    this.deploymentDir = process.cwd();
    // 项目根目录
    this.projectRoot = this.deploymentDir;
    // build 目录
    this.buildDir = path.join(this.deploymentDir, 'build');
    // data 目录
    this.dataDir = path.join(this.deploymentDir, 'data');
    // templates 目录
    this.templatesDir = path.join(this.deploymentDir, 'templates');

    // 确保必要的目录存在
    this.ensureDirectoryExists(this.buildDir);
    this.ensureDirectoryExists(this.dataDir);
  }

  // 获取构建目录路径
  public getBuildDir(): string {
    return this.buildDir;
  }

  // 获取数据目录路径
  public getDataDir(): string {
    return this.dataDir;
  }

  // 获取数据目录路径
  public getDataPath(subdir: string): string {
    return path.join(this.dataDir, subdir);
  }

  // 获取模板目录路径
  public getTemplatesDir(): string {
    return this.templatesDir;
  }

  // 获取部署目录路径
  public getDeploymentDir(): string {
    return this.deploymentDir;
  }

  // 获取项目根目录路径
  public getProjectRoot(): string {
    return this.projectRoot;
  }

  // 获取构建文件路径
  public getBuildPath(filename: string): string {
    return path.join(this.buildDir, filename);
  }

  // 获取模板文件路径
  public getTemplatePath(templatePath: string): string {
    return path.join(this.templatesDir, templatePath);
  }

  // 确保目录存在
  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export abstract class BaseDeployer {
  protected config: DeploymentConfig;
  protected logger: Logger;
  protected pathManager: PathManager;
  protected configGenerator: ConfigGenerator;
  constructor(config: DeploymentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.pathManager = new PathManager();
    this.configGenerator = new ConfigGenerator(config);
  }

  /**
   * 读取模板文件
   */
  protected readTemplate(templatePath: string): string {
    return readFileSync(this.pathManager.getTemplatePath(templatePath), 'utf8');
  }

  /**
   * 写入配置文件
   */
  protected writeConfig(filename: string, content: string): void {
    const filePath = this.pathManager.getBuildPath(filename);
    try {
      // 检查目录是否存在
      const dir = path.dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // 检查目录权限
      try {
        accessSync(dir, constants.W_OK);
      } catch (error: any) {
        throw new Error(`目录 ${dir} 没有写入权限: ${error.message}`);
      }

      // 如果文件已存在，先删除它
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }

      // 写入文件
      writeFileSync(filePath, content);
      
      // 检查文件是否成功创建
      if (!existsSync(filePath)) {
        throw new Error(`配置文件 ${filename} 创建失败`);
      }

      // 检查文件内容
      const writtenContent = readFileSync(filePath, 'utf8');
      if (writtenContent !== content) {
        throw new Error(`配置文件 ${filename} 内容验证失败`);
      }
      
      this.logger.info(`配置文件 ${filename} 已生成: ${filePath}`);
    } catch (error: any) {
      const errorMessage = `写入配置文件 ${filename} 失败:\n` +
        `路径: ${filePath}\n` +
        `错误: ${error.message}\n` +
        `堆栈: ${error.stack}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
} 