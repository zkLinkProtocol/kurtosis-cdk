import * as fs from 'fs';
import * as path from 'path';
import { GoTemplateParser, FileFormat, detectFileFormat } from '../template-parser';
import { Logger } from '../logger';

// 模拟Logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

describe('GoTemplateParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 基本功能测试
  describe('基础功能', () => {
    test('移除注释', () => {
      const template = `
      {{/* This is a comment */}}
      {
        "key": "value"
      }
      `;
      const parser = new GoTemplateParser(template, {}, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      expect(JSON.parse(result)).toEqual({ key: "value" });
    });

    test('简单变量替换', () => {
      const template = `
      {
        "key": "{{.value}}"
      }
      `;
      const context = { value: 'test' };
      const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      
      // 先检查结果是否是有效的JSON
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ key: "test" });
    });

    test('嵌套路径变量', () => {
      const template = `
      {
        "key": "{{.obj.value}}"
      }
      `;
      const context = { obj: { value: 'nested' } };
      const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      
      // 先检查结果是否是有效的JSON
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toEqual({ key: "nested" });
    });

    test('条件语句处理', () => {
      const template = `
      {
        {{if .enabled}}"feature": "enabled"{{else}}"feature": "disabled"{{end}}
      }
      `;
      
      const enabledContext = { enabled: true };
      const disabledContext = { enabled: false };
      
      const enabledParser = new GoTemplateParser(template, enabledContext, FileFormat.JSON, mockLogger);
      const disabledParser = new GoTemplateParser(template, disabledContext, FileFormat.JSON, mockLogger);
      
      const enabledResult = enabledParser.parse();
      const disabledResult = disabledParser.parse();
      
      expect(JSON.parse(enabledResult)).toEqual({ feature: "enabled" });
      expect(JSON.parse(disabledResult)).toEqual({ feature: "disabled" });
    });

    test('缺失变量处理', () => {
      const template = `
      {
        "key": "{{.missing}}"
      }
      `;
      const parser = new GoTemplateParser(template, {}, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      expect(JSON.parse(result)).toEqual({ key: null });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // 数据库URL处理测试
  describe('数据库URL处理', () => {
    test('基本数据库URL', () => {
      const template = `
      {
        "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}"
      }
      `;
      
      const context = {
        prover_db: {
          user: 'user',
          password: 'pass',
          hostname: 'localhost',
          port: 5432,
          name: 'db'
        }
      };
      
      const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      
      // 验证结果能正确解析为JSON
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      
      // 验证数据库URL字段存在且格式正确
      expect(parsed).toHaveProperty('databaseURL');
      expect(parsed.databaseURL).toBe("postgresql://user:pass@localhost:5432/db");
    });
    
    test('带特殊字符的数据库密码', () => {
      const template = `
      {
        "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}"
      }
      `;
      
      const context = {
        prover_db: {
          user: 'user',
          password: 'p@ss"word',  // 包含特殊字符的密码
          hostname: 'localhost',
          port: 5432,
          name: 'db'
        }
      };
      
      const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      const parsedResult = JSON.parse(result);
      // 验证生成的URL能够被正确解析为JSON
      expect(parsedResult).toHaveProperty('databaseURL');
      // 确保URL格式正确
      expect(parsedResult.databaseURL).toContain('postgresql://');
      expect(parsedResult.databaseURL).toContain('@localhost:5432/db');
    });

    test('prover-config.json条件场景', () => {
      const template = `
      {
        "runExecutorServer": true,
        "storageRomFile": "config/scripts/storage_sm_rom.json",
        {{if .stateless_executor}}
        "databaseURL": "local",
        "dbReadOnly": true,
        {{else}}
        "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}",
        {{end}}
        "dbNodesTableName": "state.nodes"
      }
      `;
      
      // 场景1：带状态执行器
      const contextWithState = {
        stateless_executor: false,
        prover_db: {
          user: 'prover_user',
          password: 'redacted',
          hostname: 'postgres',
          port: 5432,
          name: 'prover_db'
        }
      };
      
      // 场景2：无状态执行器
      const contextStateless = {
        stateless_executor: true
      };
      
      const parserWithState = new GoTemplateParser(template, contextWithState, FileFormat.JSON, mockLogger);
      const resultWithState = parserWithState.parse();
      const parsedWithState = JSON.parse(resultWithState);
      
      const parserStateless = new GoTemplateParser(template, contextStateless, FileFormat.JSON, mockLogger);
      const resultStateless = parserStateless.parse();
      const parsedStateless = JSON.parse(resultStateless);
      
      // 验证带状态执行器场景
      expect(parsedWithState.databaseURL).toBe("postgresql://prover_user:redacted@postgres:5432/prover_db");
      
      // 验证无状态执行器场景
      expect(parsedStateless.databaseURL).toBe("local");
      expect(parsedStateless.dbReadOnly).toBe(true);
    });

    test('实际调用中的数据库URL处理', () => {
      const template = `
      {
        "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.host}}:{{.prover_db.port}}/{{.prover_db.name}}"
      }
      `;
      
      // 模拟central-environment-deployer.ts中的调用
      const context = {
        prover_db: {
          host: '127.0.0.1',
          port: 5432,
          name: 'prover_db',
          user: 'prover_user',
          password: 'redacted'
        }
      };
      
      const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      const parsedResult = JSON.parse(result);
      
      expect(parsedResult.databaseURL).toBe("postgresql://prover_user:redacted@127.0.0.1:5432/prover_db");
    });
  });

  // TOML格式测试
  describe('TOML格式处理', () => {
    test('TOML基础变量替换', () => {
      const template = `
      key = "{{.value}}"
      
      [section]
      nested = "{{.nested}}"
      `;
      
      const context = { 
        value: 'test',
        nested: 'nested-value'
      };
      
      const parser = new GoTemplateParser(template, context, FileFormat.TOML, mockLogger);
      const result = parser.parse();
      
      // 我们可能不能直接匹配文本内容，因为TOML输出可能有不同的格式
      // 而是检查是否包含相关键值对
      expect(result).toContain('key =');
      expect(result).toContain('test');
      expect(result).toContain('[section]');
      expect(result).toContain('nested =');
      expect(result).toContain('nested-value');
    });

    test('TOML数据库URL处理', () => {
      const template = `
      [database]
      url = "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}"
      `;
      
      const context = {
        prover_db: {
          user: 'user',
          password: 'p@ss',  // 包含特殊字符
          hostname: 'localhost',
          port: 5432,
          name: 'db'
        }
      };
      
      const parser = new GoTemplateParser(template, context, FileFormat.TOML, mockLogger);
      const result = parser.parse();
      
      expect(result).toContain('[database]');
      expect(result).toContain('url = "postgresql://user:p@ss@localhost:5432/db"');
    });
  });

  // 错误处理测试
  describe('错误处理', () => {
    test('JSON格式错误修复', () => {
      const template = `
      {
        "key": "value with "quotes" inside"
      }
      `;
      const parser = new GoTemplateParser(template, {}, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      
      // 虽然输入有问题，但解析器应该尝试修复或至少不应崩溃
      expect(mockLogger.error).toHaveBeenCalled();
      expect(result).toBeTruthy();
    });

    test('处理重复键', () => {
      const template = `
      {
        "key": "value1",
        "key": "value2"
      }
      `;
      const parser = new GoTemplateParser(template, {}, FileFormat.JSON, mockLogger);
      const result = parser.parse();
      
      expect(JSON.parse(result)).toEqual({ key: "value1" });
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  // 文件格式检测测试
  describe('文件格式检测', () => {
    test('根据扩展名检测格式', () => {
      expect(detectFileFormat('file.json', '{}')).toBe(FileFormat.JSON);
      expect(detectFileFormat('file.toml', 'key = "value"')).toBe(FileFormat.TOML);
    });

    test('根据内容推断格式', () => {
      expect(detectFileFormat('file', '{"key": "value"}')).toBe(FileFormat.JSON);
      expect(detectFileFormat('file', '[section]\nkey = "value"')).toBe(FileFormat.TOML);
      expect(detectFileFormat('file', 'plain text')).toBe(FileFormat.UNKNOWN);
    });
  });
});

// 实际模板文件测试
describe('实际模板文件集成测试', () => {
  // 使用简单测试模板文件
  test('解析JSON模板文件', () => {
    // 创建简单的JSON测试模板
    const jsonTemplate = `
    {
      "runExecutorServer": true,
      "executorServerPort": {{.executor_port}},
      "hashDBServerPort": {{.hash_db_port}},
      {{if .stateless_executor}}
      "databaseURL": "local",
      "dbReadOnly": true,
      {{else}}
      "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}",
      {{end}}
      "dbNodesTableName": "state.nodes"
    }
    `;
    
    // 提供上下文
    const context = {
      executor_port: 8123,
      hash_db_port: 8125,
      stateless_executor: false,
      prover_db: {
        user: 'prover_user',
        password: 'test_password',
        hostname: 'postgres',
        port: 5432,
        name: 'prover_db'
      }
    };
    
    const parser = new GoTemplateParser(jsonTemplate, context, FileFormat.JSON, mockLogger);
    const result = parser.parse();
    
    // 验证解析结果
    expect(result).toBeTruthy();
    
    // 尝试将结果解析为JSON
    let parsedJSON;
    expect(() => {
      parsedJSON = JSON.parse(result);
    }).not.toThrow();
    
    // 验证关键字段
    expect(parsedJSON).toHaveProperty('runExecutorServer', true);
    expect(parsedJSON).toHaveProperty('executorServerPort', 8123);
    expect(parsedJSON).toHaveProperty('hashDBServerPort', 8125);
    expect(parsedJSON).toHaveProperty('databaseURL', 'postgresql://prover_user:test_password@postgres:5432/prover_db');
  });
  
  test('解析TOML模板文件', () => {
    // 创建简单的TOML测试模板
    const tomlTemplate = `
    PathRWData = "{{.path_rw_data}}"
    L1URL="{{.l1_rpc_url}}"
    ForkId = {{.rollup_fork_id}}
    
    {{if eq .rollup_fork_id "12"}}
    ContractVersions = "banana"
    {{else if eq .rollup_fork_id "13"}}
    ContractVersions = "banana"
    {{else}}
    ContractVersions = "elderberry"
    {{end}}
    
    [Database]
    Name = "{{.db.name}}"
    User = "{{.db.user}}"
    Password = "{{.db.password}}"
    Host = "{{.db.hostname}}"
    Port = {{.db.port}}
    `;
    
    // 提供上下文
    const context = {
      path_rw_data: "/data/rw",
      l1_rpc_url: "http://l1-rpc:8545",
      rollup_fork_id: "12",
      db: {
        name: "test_db",
        user: "test_user",
        password: "test_password",
        hostname: "postgres",
        port: 5432
      }
    };
    
    const parser = new GoTemplateParser(tomlTemplate, context, FileFormat.TOML, mockLogger);
    const result = parser.parse();
    
    // 验证解析结果
    expect(result).toBeTruthy();
    
    // 输出TOML结果，帮助调试
    console.log("TOML Result:", result);
    
    // 验证TOML结果包含预期的键值对，检查更宽松，仅检查关键部分
    expect(result).toContain('PathRWData =');
    expect(result).toContain('/data/rw');
    expect(result).toContain('L1URL=');
    expect(result).toContain('http://l1-rpc:8545');
    expect(result).toContain('ForkId = 12');
    expect(result).toContain('ContractVersions =');
    expect(result).toContain('banana');
    expect(result).toContain('[Database]');
    expect(result).toContain('Name =');
    expect(result).toContain('test_db');
    expect(result).toContain('Port = 5432');
  });
  
  // 测试分叉ID条件语句
  test('解析不同分叉ID场景', () => {
    // 创建更清晰的包含分叉ID条件的模板
    const template = `
    ForkId = {{.rollup_fork_id}}
    
    {{if eq .rollup_fork_id "12"}}
    ContractVersions = "banana-12"
    {{else if eq .rollup_fork_id "13"}}
    ContractVersions = "banana-13"
    {{else}}
    ContractVersions = "elderberry"
    {{end}}
    `;
    
    // 测试分叉ID 12
    const context12 = { rollup_fork_id: "12" };
    const parser12 = new GoTemplateParser(template, context12, FileFormat.TOML, mockLogger);
    const result12 = parser12.parse();
    console.log("Result for ForkId 12:", result12);
    expect(result12).toContain('ForkId = 12');
    expect(result12).toContain('banana-12');
    
    // 测试分叉ID 13
    const context13 = { rollup_fork_id: "13" };
    const parser13 = new GoTemplateParser(template, context13, FileFormat.TOML, mockLogger);
    const result13 = parser13.parse();
    console.log("Result for ForkId 13:", result13);
    expect(result13).toContain('ForkId = 13');
    expect(result13).toContain('banana-13');
    
    // 测试其他分叉ID
    const context14 = { rollup_fork_id: "14" };
    const parser14 = new GoTemplateParser(template, context14, FileFormat.TOML, mockLogger);
    const result14 = parser14.parse();
    console.log("Result for ForkId 14:", result14);
    expect(result14).toContain('ForkId = 14');
    expect(result14).toContain('elderberry');
  });
  
  // 测试有状态与无状态执行器的场景
  test('解析有状态和无状态执行器场景', () => {
    // 创建包含执行器条件的模板
    const template = `
    {
      "runExecutorServer": true,
      {{if .stateless_executor}}
      "databaseURL": "local",
      "dbReadOnly": true,
      "hashDBSingleton": false,
      {{else}}
      "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}",
      {{end}}
      "dbNodesTableName": "state.nodes"
    }
    `;
    
    // 基本上下文，共享属性
    const baseContext = {
      prover_db: {
        user: 'prover_user',
        password: 'test_password',
        hostname: 'postgres',
        port: 5432,
        name: 'prover_db'
      }
    };
    
    // 测试无状态执行器
    const statelessContext = { ...baseContext, stateless_executor: true };
    const statelessParser = new GoTemplateParser(template, statelessContext, FileFormat.JSON, mockLogger);
    const statelessResult = statelessParser.parse();
    const statelessJSON = JSON.parse(statelessResult);
    
    expect(statelessJSON).toHaveProperty('databaseURL', 'local');
    expect(statelessJSON).toHaveProperty('dbReadOnly', true);
    expect(statelessJSON).toHaveProperty('hashDBSingleton', false);
    
    // 测试有状态执行器
    const statefulContext = { ...baseContext, stateless_executor: false };
    const statefulParser = new GoTemplateParser(template, statefulContext, FileFormat.JSON, mockLogger);
    const statefulResult = statefulParser.parse();
    const statefulJSON = JSON.parse(statefulResult);
    
    expect(statefulJSON).toHaveProperty('databaseURL', 'postgresql://prover_user:test_password@postgres:5432/prover_db');
    expect(statefulJSON).not.toHaveProperty('dbReadOnly');
    expect(statefulJSON).not.toHaveProperty('hashDBSingleton');
  });
  
  // 测试数据库URL处理
  test('解析数据库URL', () => {
    // 创建包含数据库URL的模板
    const template = `
    {
      "databaseURL": "postgresql://{{.prover_db.user}}:{{.prover_db.password}}@{{.prover_db.hostname}}:{{.prover_db.port}}/{{.prover_db.name}}"
    }
    `;
    
    // 正常情况
    const context = {
      prover_db: {
        user: 'prover_user',
        password: 'test_password',
        hostname: 'postgres',
        port: 5432,
        name: 'prover_db'
      }
    };
    
    const parser = new GoTemplateParser(template, context, FileFormat.JSON, mockLogger);
    const result = parser.parse();
    const parsedJSON = JSON.parse(result);
    
    expect(parsedJSON).toHaveProperty('databaseURL', 'postgresql://prover_user:test_password@postgres:5432/prover_db');
    
    // 特殊字符密码
    const contextSpecialChars = {
      prover_db: {
        user: 'prover_user',
        password: 'p@ss"word', // 包含特殊字符
        hostname: 'postgres',
        port: 5432,
        name: 'prover_db'
      }
    };
    
    const parserSpecial = new GoTemplateParser(template, contextSpecialChars, FileFormat.JSON, mockLogger);
    const resultSpecial = parserSpecial.parse();
    const parsedJSONSpecial = JSON.parse(resultSpecial);
    
    expect(parsedJSONSpecial).toHaveProperty('databaseURL');
    expect(parsedJSONSpecial.databaseURL).toContain('postgresql://');
    expect(parsedJSONSpecial.databaseURL).toContain('prover_user:');
    expect(parsedJSONSpecial.databaseURL).toContain('@postgres:5432/prover_db');
  });

  // 测试分叉ID条件语句 - 使用简单版本
  test('简单eq条件处理', () => {
    // 更简单的条件模板
    const template = `
    {{if eq .test_value "value1"}}
    Result = "value1-matched"
    {{else if eq .test_value "value2"}}
    Result = "value2-matched"
    {{else}}
    Result = "no-match"
    {{end}}
    `;
    
    // 测试值1
    const context1 = { test_value: "value1" };
    const parser1 = new GoTemplateParser(template, context1, FileFormat.TOML, mockLogger);
    const result1 = parser1.parse();
    console.log("Result for value1:", result1);
    expect(result1).toContain('value1-matched');
    
    // 测试值2
    const context2 = { test_value: "value2" };
    const parser2 = new GoTemplateParser(template, context2, FileFormat.TOML, mockLogger);
    const result2 = parser2.parse();
    console.log("Result for value2:", result2);
    expect(result2).toContain('value2-matched');
    
    // 测试其他值
    const context3 = { test_value: "value3" };
    const parser3 = new GoTemplateParser(template, context3, FileFormat.TOML, mockLogger);
    const result3 = parser3.parse();
    console.log("Result for value3:", result3);
    expect(result3).toContain('no-match');
  });
}); 