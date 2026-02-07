# Debug Agent Skill 使用指南

## 概述

`/debug-agent` skill 是一个全面的 Agent 运行时监控和诊断工具，可以帮你实时了解 Agent 的工作状态、诊断问题并提供修复建议。

## 何时使用

在以下情况下使用 `/debug-agent`：

- ✅ Agent 正在运行，想查看进度
- ✅ Agent 似乎卡住或运行时间很长
- ✅ Agent 超时或失败
- ✅ 想知道 Agent 是否还在工作
- ✅ 需要诊断任何执行问题

## 使用方法

### 方法 1：通过消息触发（推荐）

直接在 WhatsApp 或 Telegram 发送：
```
/debug-agent
```

或者自然语言：
```
debug agent
帮我检查 agent 状态
agent 卡住了吗
```

### 方法 2：直接运行脚本

在终端运行：
```bash
# 快速监控
~/Documents/nanoclaw/scripts/monitor-agent.sh

# 完整诊断
~/Documents/nanoclaw/scripts/diagnose-agent.sh
```

## Skill 会做什么

当你调用 `/debug-agent` 时，skill 会自动：

1. **运行诊断脚本** - 执行完整的系统检查
2. **分析当前状态** - 判断 agent 是运行中/完成/失败
3. **检查配置** - 验证超时、模型等设置
4. **查看日志** - 分析最近的活动和错误
5. **提供建议** - 给出具体的修复方案

## 输出示例

### 场景 1：Agent 正在运行

```
🔍 NanoClaw Agent Diagnostics
======================================

📱 Service Status:
   ✅ NanoClaw service running (PID: 16606)

📦 Container Status:
   ✅ Container running (PID: 25678)
      Runtime: 8:34
      CPU: 45.2%
      Memory: 12.8%
      Timeout: 30min configured
      Progress: 28% (21min remaining)

⚙️  Configuration:
   Timeout: 30 minutes
   Model: claude-opus-4-6

📊 Recent Activity:
   [18:20:15] Spawning container agent
   [18:21:30] Processing message
   [18:25:42] Container working...

🔍 Error Check:
   ✅ No recent errors

💡 Recommendations:
   ✅ Everything looks good! Agent is working normally.
```

**解读**：
- ✅ 一切正常，Agent 在正常工作
- ⏱️ 已运行 8 分 34 秒，还有 21 分钟超时
- 💻 CPU 使用率 45%，正在计算
- 📝 建议：耐心等待

### 场景 2：Agent 接近超时

```
📦 Container Status:
   ✅ Container running (PID: 25678)
      Runtime: 24:15
      CPU: 52.1%
      Memory: 15.3%
      Timeout: 30min configured
      Progress: 81% (5min remaining)
      ⚠️  WARNING: Over 75% of timeout

💡 Recommendations:
   1. Agent approaching timeout - consider increasing CONTAINER_TIMEOUT
```

**解读**：
- ⚠️ 已用 81% 的超时时间
- 🔧 建议：增加超时设置

### 场景 3：Agent 已超时

```
📦 Container Status:
   ❌ No container running

🔍 Error Check:
   ⚠️  Found 3 error(s) in recent logs:
      [18:30:00] Container timeout, killing
      [18:30:00] Container timed out after 1800000ms
      [18:30:01] Container exited with error

💡 Recommendations:
   1. Last task timed out - increase CONTAINER_TIMEOUT for complex tasks
   2. For research tasks, recommend 30min+ timeout
```

**解读**：
- ❌ 任务超时了（30 分钟）
- 🔧 建议：增加超时时间或简化任务

### 场景 4：没有活动

```
📦 Container Status:
   ❌ No container running
      Agent may have completed or not yet started

✅ Last Successful Completion:
   [17:45:30] Container completed
   Last task completed in 12m 45s

💡 Recommendations:
   ✅ Last task completed successfully
   No recent agent activity - send a message to trigger
```

**解读**：
- ✅ 上一个任务已成功完成
- 📝 当前没有任务在运行

## 诊断工具说明

### 1. monitor-agent.sh（快速检查）

**用途**：快速查看当前状态

**输出**：
- 容器是否在运行
- 运行时长
- 最近 20 行日志

**适用场景**：快速确认 agent 是否在工作

### 2. diagnose-agent.sh（完整诊断）

**用途**：全面的系统诊断

**输出**：
- 服务状态
- 容器详情（PID、CPU、内存、进度）
- 配置检查（超时、模型）
- 最近活动
- 错误分析
- 超时统计
- 具体建议

**适用场景**：
- 排查问题
- 了解系统健康状况
- 优化配置

## 常见问题诊断

### Q1: 如何知道 agent 是否卡住了？

运行 `/debug-agent`，查看：
- **CPU 使用率**：如果是 0%，可能卡住了
- **日志活动**：超过 2 分钟无日志更新，可能有问题
- **进度**：如果接近超时但 CPU 仍在工作，可能需要更多时间

### Q2: Agent 运行很久但没响应怎么办？

1. 检查进度：看还剩多少时间
2. 查看 CPU：确认是否在工作
3. 看日志：是否有错误

如果接近超时：
```bash
# 增加超时到 60 分钟
nano ~/Documents/nanoclaw/.env
# 添加: CONTAINER_TIMEOUT=3600000

# 重启服务
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

### Q3: 如何实时监控 agent 工作？

```bash
# 方法 1：实时日志
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log

# 方法 2：过滤相关日志
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log | grep -E "Spawning|Processing|completed|error"

# 方法 3：定期运行诊断
watch -n 30 ~/Documents/nanoclaw/scripts/diagnose-agent.sh
```

### Q4: 超时率多少算正常？

根据诊断脚本的统计：
- **< 5%**：✅ 优秀，配置合理
- **5-15%**：⚠️ 可以接受，但可能需要调整
- **> 15%**：❌ 需要增加超时或优化任务

### Q5: Opus 模型需要多长超时？

根据任务类型：
- **简单问答**：10 分钟
- **代码编写**：15 分钟
- **公司研究**：30 分钟
- **深度分析**：60 分钟

推荐设置：
```bash
# 对于研究类任务，设置 30 分钟
CONTAINER_TIMEOUT=1800000

# 对于复杂分析，设置 60 分钟
CONTAINER_TIMEOUT=3600000
```

## 进阶用法

### 自动化监控

创建一个监控循环，每分钟检查一次：

```bash
#!/bin/bash
# ~/Documents/nanoclaw/scripts/watch-agent.sh

while true; do
  clear
  ~/Documents/nanoclaw/scripts/diagnose-agent.sh
  sleep 60
done
```

### 导出诊断报告

```bash
# 保存诊断结果
~/Documents/nanoclaw/scripts/diagnose-agent.sh > ~/agent-diagnosis-$(date +%Y%m%d-%H%M%S).txt
```

### 设置告警

如果想在 agent 超时时收到通知：

```bash
# 检查最近是否有超时
if grep -q "Container timeout" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -10; then
  osascript -e 'display notification "Agent timed out!" with title "NanoClaw Alert"'
fi
```

## 与其他工具配合

- `/debug` - 容器技术细节调试
- `/customize` - 修改系统配置
- `/setup` - 初始设置和认证

## 快速参考

```bash
# 触发 skill
/debug-agent

# 快速检查
~/Documents/nanoclaw/scripts/monitor-agent.sh

# 完整诊断
~/Documents/nanoclaw/scripts/diagnose-agent.sh

# 实时日志
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log

# 检查配置
cat ~/Documents/nanoclaw/.env | grep CONTAINER_TIMEOUT

# 增加超时（编辑 .env）
nano ~/Documents/nanoclaw/.env

# 重启服务
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist && \
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## 总结

`/debug-agent` skill 让你可以：
- 👀 实时了解 agent 工作状态
- 🔍 快速诊断问题
- 💡 获得具体修复建议
- 📊 查看性能统计
- ⚙️ 优化配置

遇到任何 agent 执行问题，第一步就是运行 `/debug-agent`！
