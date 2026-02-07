# Upstream 更新检查指南

## 概述

NanoClaw 提供了自动检查和获取上游更新的功能，让你能够轻松跟踪原始项目的最新改进和 bug 修复。

## 仓库结构

```
upstream (原始)    https://github.com/gavrielc/nanoclaw.git
    ↓
  fork (你的)      https://github.com/xxxxxthhh/nanoclaw.git
    ↓
  local (本地)     /Users/kyx/Documents/nanoclaw
```

## 快速使用

### 方式 1: 通过 Skill（推荐）

在 WhatsApp/Telegram 发送：
```
/check-upstream
```

或自然语言：
```
检查上游更新
有没有 upstream 的新提交
查看上游变更
```

### 方式 2: 手动运行脚本

```bash
# 仅查看是否有更新（不获取）
~/Documents/nanoclaw/scripts/check-upstream.sh

# 获取更新但不合并
~/Documents/nanoclaw/scripts/check-upstream.sh --fetch

# 获取并合并更新（交互式）
~/Documents/nanoclaw/scripts/check-upstream.sh --merge
```

### ~~自动检查~~（已禁用）

**注意**: 自动检查功能已禁用。现在使用 `/check-upstream` skill 手动触发。

如果需要重新启用自动检查：
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

## 脚本功能详解

### 1. 基本检查模式（默认）

```bash
./scripts/check-upstream.sh
```

**输出内容**:

```
🔍 NanoClaw Upstream Update Checker
======================================

📡 Remote Repositories:
   origin    https://github.com/xxxxxthhh/nanoclaw.git (fetch)
   upstream  https://github.com/gavrielc/nanoclaw.git (fetch)

📌 Current Branch: main

🔍 Working Directory Status:
   ✅ Clean - no uncommitted changes

📊 Commit Comparison:
   Local:    67209a0
   Upstream: 80e68dc

📈 Status:
   ✅ Up to date (you are 18 commits ahead)
```

**说明**:
- 不会修改任何东西
- 只检查本地和上游的差异
- 显示你领先或落后的提交数

### 2. 获取模式

```bash
./scripts/check-upstream.sh --fetch
```

**额外操作**:
- 从 upstream 获取最新的提交
- 更新本地的 upstream/main 分支引用
- **不会修改你的工作分支**

**输出增加**:
```
📥 Fetching from upstream...
✅ Fetch complete

📝 New Commits from Upstream:
   * 80e68dc Add new feature
   * 7a2f3c1 Fix bug in container
   * ...

📄 Detailed Changes:
   Commit: 80e68dc
   Author: gavrielc
   Date:   2 days ago
   Subject: Add new feature

   Files changed:
      M src/index.ts
      A src/new-feature.ts

📋 Summary of Changes:
   Added:    2 file(s)
   Modified: 5 file(s)
   Deleted:  0 file(s)
```

### 3. 合并模式（交互式）

```bash
./scripts/check-upstream.sh --merge
```

**流程**:
1. 检查工作目录是否干净
2. 获取上游更新
3. 显示详细变更
4. **询问确认**是否合并
5. 执行合并
6. 提示后续步骤

**示例输出**:
```
🔀 Merge Mode

⚠️  This will merge upstream changes into your current branch

Do you want to proceed? (y/N) y

Merging upstream/main into main...
✅ Merge successful!

New HEAD: 9a8b7c6

ℹ️  Don't forget to:
   1. Test the changes
   2. Push to your fork: git push origin main
```

## 输出说明

### 状态类型

**✅ Up to date**
- 你的本地代码与 upstream 完全同步

**✅ Up to date (you are X commits ahead)**
- 与 upstream 同步
- 你有本地的额外提交（你的改进）
- **这是正常状态**

**⚠️ Behind upstream by X commit(s)**
- upstream 有新的提交
- 你需要决定是否合并这些更新

**⚠️ Behind upstream by X commit(s) (you are also Y commits ahead)**
- upstream 有新提交
- 你也有本地提交
- 合并时可能需要解决冲突

### 文件变更标记

- **M** (Modified) - 修改的文件
- **A** (Added) - 新增的文件
- **D** (Deleted) - 删除的文件

### 颜色说明

- 🟢 绿色：新增的文件
- 🟡 黄色：修改的文件
- 🔴 红色：删除的文件

## 定期检查配置

### 当前配置

定期检查服务已配置在：
```
~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

**默认设置**:
- **频率**: 每天一次
- **时间**: 早上 9:00
- **操作**: 自动获取（`--fetch`）
- **日志**: `~/Documents/nanoclaw/logs/upstream-check.log`

### 启用/禁用自动检查

**启用**:
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

**禁用**:
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

**查看状态**:
```bash
launchctl list | grep nanoclaw.upstream
```

### 修改检查频率

编辑 plist 文件：
```bash
nano ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

**每天两次（9:00 和 21:00）**:
```xml
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <dict>
        <key>Hour</key>
        <integer>21</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</array>
```

**每周一次（周一 9:00）**:
```xml
<key>StartCalendarInterval</key>
<dict>
    <key>Weekday</key>
    <integer>1</integer>  <!-- 1 = Monday -->
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
</dict>
```

修改后重新加载：
```bash
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

## 合并更新流程

### 推荐流程

1. **检查更新**:
   ```bash
   ./scripts/check-upstream.sh --fetch
   ```

2. **查看详细变更**:
   ```bash
   git log --oneline HEAD..upstream/main
   git diff HEAD..upstream/main
   ```

3. **确保工作目录干净**:
   ```bash
   git status
   # 如果有未提交的更改
   git add .
   git commit -m "Your changes"
   ```

4. **合并更新**:
   ```bash
   ./scripts/check-upstream.sh --merge
   ```

5. **测试**:
   ```bash
   npm run build
   npm run dev  # 或测试你的改动
   ```

6. **推送到你的 fork**:
   ```bash
   git push origin main
   ```

### 处理合并冲突

如果合并时出现冲突：

```
❌ Merge failed - conflicts detected

CONFLICT (content): Merge conflict in src/index.ts
```

**解决步骤**:

1. **查看冲突文件**:
   ```bash
   git status
   ```

2. **编辑冲突文件**:
   打开文件，找到冲突标记：
   ```
   <<<<<<< HEAD
   你的代码
   =======
   upstream 的代码
   >>>>>>> upstream/main
   ```

3. **解决冲突**:
   - 保留需要的代码
   - 删除冲突标记
   - 保存文件

4. **标记为已解决**:
   ```bash
   git add src/index.ts
   ```

5. **完成合并**:
   ```bash
   git commit
   ```

6. **或者放弃合并**:
   ```bash
   git merge --abort
   ```

## 查看日志

### 自动检查日志

```bash
# 查看最近的检查
tail -50 ~/Documents/nanoclaw/logs/upstream-check.log

# 实时监控
tail -f ~/Documents/nanoclaw/logs/upstream-check.log

# 查看错误
tail -f ~/Documents/nanoclaw/logs/upstream-check.error.log
```

### 检查历史

```bash
# 查看何时检查的
ls -lt ~/Documents/nanoclaw/logs/upstream-check.log

# 统计检查次数
grep "NanoClaw Upstream Update Checker" ~/Documents/nanoclaw/logs/upstream-check.log | wc -l
```

## 常见场景

### 场景 1: 发现新的 upstream 更新

**检查结果**:
```
⚠️ Behind upstream by 3 commit(s)

New Commits:
   * 80e68dc Fix critical bug
   * 7a2f3c1 Add performance improvement
   * 5d4e2b8 Update dependencies
```

**操作**:
```bash
# 1. 先查看变更详情
./scripts/check-upstream.sh --fetch

# 2. 如果想合并
./scripts/check-upstream.sh --merge

# 3. 测试
npm run build
npm test

# 4. 推送
git push origin main
```

### 场景 2: 你有本地改动想保留

**检查结果**:
```
⚠️ Behind upstream by 2 commit(s)
ℹ️  You are also 5 commit(s) ahead
```

**操作**:
```bash
# 1. 提交你的改动
git add .
git commit -m "My improvements"

# 2. 获取 upstream
./scripts/check-upstream.sh --fetch

# 3. 合并（可能有冲突）
./scripts/check-upstream.sh --merge

# 4. 解决冲突（如果有）
# 5. 测试
# 6. 推送
git push origin main
```

### 场景 3: 只想查看不想合并

**操作**:
```bash
# 查看有什么新东西
./scripts/check-upstream.sh --fetch

# 查看具体改动
git log HEAD..upstream/main
git diff HEAD..upstream/main

# 暂时不合并，之后再说
```

### 场景 4: 想回退到之前的状态

如果合并后发现问题：

```bash
# 查看最近的提交
git log --oneline -10

# 回退到合并前（假设合并是最后一次提交）
git reset --hard HEAD~1

# 如果已经推送了，需要强制推送（危险！）
git push origin main --force
```

## 最佳实践

### 1. 定期检查

- ✅ 每天自动检查（已配置）
- ✅ 手动检查后再决定是否合并
- ✅ 不要盲目自动合并

### 2. 合并前准备

- ✅ 确保本地没有未提交的更改
- ✅ 先用 `--fetch` 查看变更
- ✅ 了解 upstream 改了什么
- ✅ 评估是否会影响你的改动

### 3. 合并后验证

- ✅ 运行 `npm run build` 确保编译通过
- ✅ 测试关键功能
- ✅ 查看日志确认服务正常
- ✅ 推送到你的 fork

### 4. 保持分支清晰

```bash
# 查看本地和 upstream 的差异
git log --oneline --graph --all --decorate

# 如果分支太乱，可以 rebase
git rebase upstream/main
```

## 故障排查

### 问题 1: upstream 未配置

**错误**:
```
fatal: 'upstream' does not appear to be a git repository
```

**解决**:
```bash
git remote add upstream https://github.com/gavrielc/nanoclaw.git
git fetch upstream
```

### 问题 2: 脚本没有执行权限

**错误**:
```
Permission denied
```

**解决**:
```bash
chmod +x ~/Documents/nanoclaw/scripts/check-upstream.sh
```

### 问题 3: 自动检查没有运行

**检查**:
```bash
# 查看服务状态
launchctl list | grep upstream

# 查看日志
tail ~/Documents/nanoclaw/logs/upstream-check.log
```

**解决**:
```bash
# 重新加载服务
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist
```

### 问题 4: 合并冲突太多

如果冲突很多，难以解决：

**方案 1: 创建新分支**
```bash
# 在新分支上尝试合并
git checkout -b merge-upstream
git merge upstream/main
# 慢慢解决冲突
```

**方案 2: 使用 rebase**
```bash
git rebase upstream/main
# 一个一个解决冲突
```

**方案 3: 重新开始**
```bash
# 如果改动不多，考虑重新 fork
# 然后手动迁移你的改动
```

## 快速参考

```bash
# 查看更新（不获取）
./scripts/check-upstream.sh

# 获取更新（不合并）
./scripts/check-upstream.sh --fetch

# 获取并合并
./scripts/check-upstream.sh --merge

# 查看自动检查日志
tail -f ~/Documents/nanoclaw/logs/upstream-check.log

# 启用自动检查
launchctl load ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist

# 禁用自动检查
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.upstream-check.plist

# 手动查看差异
git log HEAD..upstream/main
git diff HEAD..upstream/main
```

## 总结

- 📅 **自动检查**: 每天 9:00 自动获取 upstream 更新
- 🔍 **手动检查**: 随时运行脚本查看详细变更
- 🔀 **安全合并**: 交互式合并，有充分的确认和错误处理
- 📊 **详细日志**: 所有操作都有日志记录
- ✅ **最佳实践**: 先查看、再测试、后合并、最后推送

保持与上游同步，享受最新的改进和修复！🚀
