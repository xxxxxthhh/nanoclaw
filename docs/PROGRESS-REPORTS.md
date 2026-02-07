# 进度报告功能

## 概述

NanoClaw 现在支持长时间运行任务的自动进度报告。Agent 会在执行过程中定期向你发送状态更新，让你知道任务仍在正常进行。

## 功能特性

### 1. 24 小时超时时间
- **旧设置**: 30 分钟超时
- **新设置**: 24 小时超时（86400000ms）
- **适用场景**: 深度研究、复杂分析、多步骤任务

### 2. 自动进度报告
- **间隔**: 每 30 分钟
- **内容**:
  - 已运行时间
  - 当前状态
  - 进度更新编号
- **发送方式**: 通过 WhatsApp/Telegram 发送

## 配置说明

在 `.env` 文件中配置：

```bash
# 容器超时时间（毫秒）
# 24 小时 = 86400000ms
CONTAINER_TIMEOUT=86400000

# 进度报告间隔（毫秒）
# 30 分钟 = 1800000ms
PROGRESS_REPORT_INTERVAL=1800000
```

### 自定义配置选项

根据需求调整间隔：

| 间隔 | 毫秒值 | 适用场景 |
|------|--------|---------|
| 15 分钟 | 900000 | 需要频繁更新 |
| 30 分钟 | 1800000 | 标准（推荐）|
| 1 小时 | 3600000 | 长时间任务 |
| 2 小时 | 7200000 | 超长任务 |

修改后需要重启服务：
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## 进度消息示例

### 第一次报告（30 分钟）
```
⏱️ Agent 运行进度更新 #1:

📊 已运行: 30分0秒
🔄 状态: 正在处理中...
💡 任务仍在执行，请耐心等待
```

### 第二次报告（60 分钟）
```
⏱️ Agent 运行进度更新 #2:

📊 已运行: 60分0秒
🔄 状态: 正在处理中...
💡 任务仍在执行，请耐心等待
```

### 长时间任务示例（2 小时）
```
⏱️ Agent 运行进度更新 #4:

📊 已运行: 120分15秒
🔄 状态: 正在处理中...
💡 任务仍在执行，请耐心等待
```

## 使用场景示例

### 场景 1: 深度公司研究

**你的请求**:
```
帮我调研 NVDA，做深度分析，更新到研究中心
```

**Agent 的响应**:
```
收到！我来调研 NVIDIA (NVDA)，计划如下：

1. 分析公司业务和商业模式
2. 研究财务数据和关键指标
3. 评估竞争格局和护城河
4. 梳理增长驱动力
5. 构建多空论点
6. 更新到研究中心

开始工作，完成后会发给你 📊
```

**进度报告（30分钟后）**:
```
⏱️ Agent 运行进度更新 #1:

📊 已运行: 30分12秒
🔄 状态: 正在处理中...
💡 任务仍在执行，请耐心等待
```

**进度报告（60分钟后）**:
```
⏱️ Agent 运行进度更新 #2:

📊 已运行: 60分8秒
🔄 状态: 正在处理中...
💡 任务仍在执行，请耐心等待
```

**完成时**:
```
✅ NVIDIA 深度研究完成！

[完整的研究报告...]

已更新到研究中心：
- 报告文件：research-hub/NVDA_Deep_Research_2026.md
- 网站已更新
- GitHub Pages 已部署
```

### 场景 2: 多个公司对比分析

**你的请求**:
```
帮我对比分析 TSLA、RIVN、LCID 三家电动车公司
```

**进度报告序列**:
- 30 分钟：进度更新 #1
- 60 分钟：进度更新 #2
- 90 分钟：进度更新 #3
- 完成（约 105 分钟）

### 场景 3: 复杂的多步骤任务

**你的请求**:
```
1. 调研 AMD 和 INTC
2. 做对比分析
3. 生成投资建议
4. 更新到研究中心
5. 发布到网站
```

预计执行时间：2-3 小时
进度报告：每 30 分钟一次，总共 4-6 次

## 监控和诊断

### 实时查看进度

使用 `/debug-agent` skill：
```
/debug-agent
```

输出示例：
```
📦 Container Status:
   ✅ Container running (PID: 45678)
      Runtime: 45:23
      CPU: 38.5%
      Memory: 14.2%
      Progress: 52% (12h remaining)

📊 Recent Activity:
   [19:15:20] Progress report sent (elapsed: 45min, reportCount: 2)
```

### 查看所有进度报告

查看日志中的进度报告：
```bash
grep "Progress report sent" ~/Documents/nanoclaw/logs/nanoclaw.log
```

示例输出：
```
[18:30:00] Progress report sent (elapsed: 30min, reportCount: 1)
[19:00:00] Progress report sent (elapsed: 60min, reportCount: 2)
[19:30:00] Progress report sent (elapsed: 90min, reportCount: 3)
```

## 工作原理

### 技术实现

1. **容器启动时**: 设置进度报告定时器
2. **每隔 PROGRESS_REPORT_INTERVAL**:
   - 计算已运行时间
   - 生成进度消息
   - 写入 IPC 目录
3. **主进程**:
   - 监听 IPC 目录
   - 读取进度消息
   - 发送到 WhatsApp/Telegram
4. **容器完成时**: 清除定时器

### 代码流程

```
runContainerAgent()
    ↓
启动容器
    ↓
设置超时定时器 (24h)
    ↓
设置进度报告定时器 (30min)
    ↓
每 30 分钟:
    - 计算运行时间
    - 生成进度消息
    - 写入 IPC 文件
    ↓
容器完成/超时:
    - 清除两个定时器
    - 返回结果
```

## 自定义进度消息

如果你想自定义进度消息的内容，可以编辑 `src/container-runner.ts`:

```typescript
const progressMessage = `⏱️ Agent 运行进度更新 #${progressReportCount}:\n\n` +
  `📊 已运行: ${elapsedMinutes}分${elapsedSeconds}秒\n` +
  `🔄 状态: 正在处理中...\n` +
  `💡 任务仍在执行，请耐心等待`;
```

可以修改为：
```typescript
const progressMessage =
  `🤖 ${ASSISTANT_NAME} 进度报告 #${progressReportCount}\n\n` +
  `⏱️ 运行时长: ${elapsedMinutes}分${elapsedSeconds}秒\n` +
  `💻 任务进行中，请稍候...\n` +
  `📝 预计完成时间: [根据任务复杂度而定]`;
```

修改后重新编译：
```bash
npm run build
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## 禁用进度报告

如果你不需要进度报告，可以设置一个非常大的间隔：

```bash
# 设置为 24 小时（基本等于禁用）
PROGRESS_REPORT_INTERVAL=86400000
```

或者设置为 0 来完全禁用（需要修改代码）。

## 故障排查

### 问题: 没有收到进度报告

**检查配置**:
```bash
grep PROGRESS_REPORT_INTERVAL ~/Documents/nanoclaw/.env
```

**查看日志**:
```bash
grep "Progress report" ~/Documents/nanoclaw/logs/nanoclaw.log
```

**可能原因**:
1. 任务运行时间不足 30 分钟
2. PROGRESS_REPORT_INTERVAL 设置过大
3. IPC 目录权限问题

### 问题: 进度报告太频繁

**解决方案**:
```bash
# 增加间隔到 1 小时
nano ~/Documents/nanoclaw/.env
# 修改: PROGRESS_REPORT_INTERVAL=3600000
```

### 问题: 想知道具体在做什么

进度报告只显示运行时间，不显示具体任务进度。

要了解详细状态，可以：
1. 使用 `/debug-agent` 查看日志
2. 实时监控：`tail -f ~/Documents/nanoclaw/logs/nanoclaw.log`
3. 等待任务完成后查看完整结果

## 最佳实践

### 1. 根据任务类型调整间隔

- **快速任务 (< 30 分钟)**: 不需要进度报告
- **中等任务 (30-60 分钟)**: 30 分钟间隔
- **长任务 (1-3 小时)**: 30 分钟间隔
- **超长任务 (3+ 小时)**: 1 小时间隔

### 2. 设置合理的超时

```bash
# 研究类任务：2-4 小时
CONTAINER_TIMEOUT=14400000  # 4 hours

# 分析类任务：1-2 小时
CONTAINER_TIMEOUT=7200000   # 2 hours

# 极限任务：24 小时
CONTAINER_TIMEOUT=86400000  # 24 hours
```

### 3. 监控资源使用

长时间运行的任务可能消耗较多资源：

```bash
# 检查 CPU 和内存
~/Documents/nanoclaw/scripts/diagnose-agent.sh
```

### 4. 定期检查日志

```bash
# 查看最近的进度报告
tail -100 ~/Documents/nanoclaw/logs/nanoclaw.log | grep "Progress report"
```

## 总结

进度报告功能让你可以：
- ✅ 安心等待长时间任务完成
- ✅ 知道 agent 仍在正常工作
- ✅ 不需要频繁检查状态
- ✅ 在出现问题时及时发现

现在你可以放心地让 agent 执行复杂的长时间任务，每 30 分钟收到一次"还活着"的信号！🎉
