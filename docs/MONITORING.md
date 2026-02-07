# Agent 监控指南

## 问题：如何知道 Agent 在工作而不是卡住了？

当 Agent 执行长时间任务时，你可以通过以下方式监控它的状态。

## 🔍 快速检查

### 1. 一键监控脚本

```bash
~/Documents/nanoclaw/scripts/monitor-agent.sh
```

这会显示：
- 容器运行状态
- 运行时长
- 最近的日志

### 2. 实时日志监控

```bash
# 实时查看所有日志
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log

# 只看 agent 相关日志
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log | grep -i "container\|agent\|completed"
```

### 3. 检查容器进程

```bash
ps aux | grep "container run" | grep -v grep
```

如果有输出，说明 agent 正在运行。

## 📊 理解日志输出

### 正常工作的标志

```
✅ Spawning container agent
   group: "main"
   mountCount: 7
   isMain: true
```
→ Agent 容器正在启动

```
✅ Container completed
   duration: 450000
   status: "success"
```
→ Agent 成功完成任务（用时 450 秒 = 7.5 分钟）

### 问题标志

```
❌ Container timeout, killing
   Container timed out after 300000ms
```
→ 任务超时被杀死（需要增加 `CONTAINER_TIMEOUT`）

```
❌ Container exited with error
   error: "some error message"
```
→ Agent 执行出错

## ⏱️ 超时配置

### 当前设置

默认超时：**30 分钟** (1800000ms)

在 `.env` 文件中配置：
```bash
CONTAINER_TIMEOUT=1800000  # 30 minutes
```

### 推荐设置

| 任务类型 | 推荐超时 | 设置值 |
|---------|---------|--------|
| 简单问答 | 5 分钟 | 300000 |
| 代码编写 | 10 分钟 | 600000 |
| 公司研究 | 30 分钟 | 1800000 |
| 深度分析 | 60 分钟 | 3600000 |

### 修改超时

1. 编辑 `.env` 文件：
   ```bash
   nano ~/Documents/nanoclaw/.env
   ```

2. 添加或修改：
   ```bash
   CONTAINER_TIMEOUT=1800000  # 30分钟
   ```

3. 重启服务：
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
   launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
   ```

## 🎯 监控最佳实践

### 执行长任务时

1. **启动任务前**：打开日志监控
   ```bash
   tail -f ~/Documents/nanoclaw/logs/nanoclaw.log
   ```

2. **发送消息**：触发 agent 任务

3. **观察日志**：看到这些说明正常
   - `Spawning container agent` - 容器启动
   - `Processing message` - 开始处理
   - 定期有日志输出（即使只是 WhatsApp 心跳）

4. **完成标志**：
   - `Container completed` - 任务完成
   - 收到 WhatsApp/Telegram 回复

### 判断是否卡住

如果超过 **2 分钟** 没有任何日志输出，可能有问题。

检查：
```bash
# 查看最后一条日志的时间
tail -1 ~/Documents/nanoclaw/logs/nanoclaw.log

# 查看容器是否还在运行
ps aux | grep "container run"
```

### 估算任务时长

参考之前的任务日志：
```bash
# 查看最近完成的任务耗时
grep "Container completed" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -5
```

输出示例：
```
Container completed
  duration: 450000  # 7.5 分钟
```

## 🔧 故障排查

### 任务一直不完成

1. **检查超时设置**：
   ```bash
   grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env
   ```

2. **查看错误日志**：
   ```bash
   grep -i "error\|timeout\|failed" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -20
   ```

3. **检查容器日志**：
   ```bash
   # 如果容器还在运行，查看其 PID
   ps aux | grep "container run"

   # 然后查看该进程的详细信息
   lsof -p <PID>
   ```

### 容器频繁超时

如果经常看到 timeout，增加超时时间：

```bash
# 对于研究类任务，设置为 1 小时
echo "CONTAINER_TIMEOUT=3600000" >> ~/Documents/nanoclaw/.env

# 重启服务
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

### 无法判断是否在工作

添加更详细的日志：

1. 设置日志级别为 debug：
   ```bash
   echo "LOG_LEVEL=debug" >> ~/Documents/nanoclaw/.env
   ```

2. 重启服务

3. 查看日志会更详细

## 📱 实时通知（未来改进）

未来可以实现的功能：

- [ ] Agent 定期发送进度更新（每 5 分钟）
- [ ] 任务完成推送通知
- [ ] Web 界面显示实时状态
- [ ] 进度条显示任务进度

## 快速参考

```bash
# 实时监控
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log

# 检查运行状态
~/Documents/nanoclaw/scripts/monitor-agent.sh

# 查看超时设置
grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env

# 查看最近的错误
grep -i error ~/Documents/nanoclaw/logs/nanoclaw.log | tail -10
```
