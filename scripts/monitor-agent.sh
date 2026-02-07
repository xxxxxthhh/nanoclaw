#!/bin/bash
# Agent 监控脚本 - 实时查看 agent 工作状态

echo "🔍 NanoClaw Agent 监控工具"
echo "================================"
echo ""

# 检查是否有容器在运行
echo "📦 容器状态:"
CONTAINERS=$(ps aux | grep "container run" | grep -v grep)
if [ -z "$CONTAINERS" ]; then
    echo "   ❌ 没有容器在运行"
else
    echo "   ✅ 有容器在运行:"
    echo "$CONTAINERS" | awk '{print "   PID:", $2, "启动时间:", $9}'

    # 计算运行时长
    for PID in $(echo "$CONTAINERS" | awk '{print $2}'); do
        START_TIME=$(ps -o lstart= -p $PID)
        echo "   开始时间: $START_TIME"
    done
fi

echo ""
echo "📊 最近的日志 (最后 20 行):"
echo "--------------------------------"
tail -20 ~/Documents/nanoclaw/logs/nanoclaw.log | grep -E "Container|agent|Processing|completed|error" --color=always

echo ""
echo "💡 提示:"
echo "   - 如果看到 'Spawning container agent' 说明正在启动"
echo "   - 如果看到 'Container completed' 说明已完成"
echo "   - 如果容器运行超过 5 分钟，可能需要检查"
echo ""
echo "🔄 实时监控日志，运行:"
echo "   tail -f ~/Documents/nanoclaw/logs/nanoclaw.log"
