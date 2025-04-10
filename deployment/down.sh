#!/bin/bash

# 设置脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

# 查找所有docker-compose文件
echo "正在查找所有docker-compose文件..."
COMPOSE_FILES=$(find "$BUILD_DIR" -name "*docker-compose*.yml")

# 检查是否找到任何文件
if [ -z "$COMPOSE_FILES" ]; then
  echo "未找到任何docker-compose文件"
else
  # 遍历每个文件并执行docker compose down
  for file in $COMPOSE_FILES; do
    echo "正在处理: $file"
    docker compose -f "$file" down
  done
  echo "所有docker compose down操作已完成"
fi

# 删除data目录
DATA_DIR="$SCRIPT_DIR/data"
if [ -d "$DATA_DIR" ]; then
  echo "正在删除数据目录: $DATA_DIR"
  rm -rf "$DATA_DIR"
  echo "数据目录删除完成"
else
  echo "数据目录不存在: $DATA_DIR"
fi

# 删除build目录
if [ -d "$BUILD_DIR" ]; then
  echo "正在删除build目录: $BUILD_DIR"
  rm -rf "$BUILD_DIR"
  echo "build目录删除完成"
fi