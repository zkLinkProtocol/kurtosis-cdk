import * as fs from 'fs';
import * as path from 'path';
import { DeploymentConfig } from '../types/config';

/**
 * 配置生成器的基类
 */
export abstract class BaseConfigGenerator {
  protected readonly config: DeploymentConfig;

  protected constructor(config: DeploymentConfig) {
    this.config = config;
  }

  /**
   * 生成配置文件
   * @param content 配置内容
   * @param outputPath 输出文件路径
   */
  protected async generateConfig(content: string, outputPath: string): Promise<void> {
    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // 写入配置文件
    await fs.promises.writeFile(outputPath, content, 'utf8');
  }

  /**
   * 格式化 JSON 配置
   * @param obj 要格式化的对象
   */
  protected formatJSON(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }

  /**
   * 格式化 TOML 配置
   * @param obj 要格式化的对象
   */
  protected formatTOML(obj: any): string {
    // TODO: 实现 TOML 格式化
    throw new Error('TOML formatting not implemented yet');
  }

  /**
   * 格式化 Shell 脚本
   * @param commands shell 命令数组
   */
  protected formatShell(commands: string[]): string {
    return ['#!/bin/bash', '', ...commands].join('\n');
  }
} 