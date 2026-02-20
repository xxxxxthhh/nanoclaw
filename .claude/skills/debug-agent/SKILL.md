---
name: debug-agent
description: Real-time agent monitoring and debugging. Use when agent is running, appears stuck, times out, or you need to diagnose execution issues. Runs diagnostic scripts, checks status, analyzes logs, and provides fixes.
---

# Agent Debug & Monitoring Skill

Comprehensive debugging for NanoClaw agents during execution.

## When to Use This Skill

Invoke this skill when:
- 🔄 Agent is running and you want to check progress
- ⏰ Agent seems stuck or taking too long
- ❌ Agent timed out or failed
- 🐛 Need to diagnose what went wrong
- 📊 Want real-time status updates

## What This Skill Does

This skill will:

1. **Run the monitoring script** (`~/Documents/nanoclaw/scripts/monitor-agent.sh`)
2. **Analyze current state**:
   - Check if container is running
   - Calculate how long it's been running
   - Check if it's approaching timeout
3. **Examine recent logs** for errors or warnings
4. **Check configuration**:
   - Timeout settings
   - Model configuration
   - Memory limits
5. **Provide diagnosis** and actionable recommendations

## Diagnostic Workflow

### Step 1: Quick Status Check

Run the monitoring script to get current status:

```bash
~/Documents/nanoclaw/scripts/monitor-agent.sh
```

**Expected output:**
```
🔍 NanoClaw Agent 监控工具
================================

📦 容器状态:
   ✅ 有容器在运行:
   PID: 12345 启动时间: 5:40PM
   开始时间: Thu Feb  6 17:40:23 2026

📊 最近的日志 (最后 20 行):
   [17:40:23] Spawning container agent
   [17:41:15] Processing message
   ...
```

### Step 2: Analyze Container Process

If container is running, check details:

```bash
# Get container PID
CONTAINER_PID=$(ps aux | grep "container run" | grep -v grep | awk '{print $2}')

if [ -n "$CONTAINER_PID" ]; then
  echo "Container PID: $CONTAINER_PID"

  # Calculate running time
  START_TIME=$(ps -o lstart= -p $CONTAINER_PID)
  echo "Started at: $START_TIME"

  # Check elapsed time (in seconds)
  ELAPSED=$(ps -o etime= -p $CONTAINER_PID | tr -d ' ')
  echo "Running for: $ELAPSED"

  # Check CPU usage
  CPU=$(ps -o %cpu= -p $CONTAINER_PID | tr -d ' ')
  echo "CPU usage: ${CPU}%"

  # Check memory usage
  MEM=$(ps -o %mem= -p $CONTAINER_PID | tr -d ' ')
  echo "Memory usage: ${MEM}%"
else
  echo "No container running"
fi
```

### Step 3: Check Timeout Configuration

Verify timeout settings to determine if agent has enough time:

```bash
# Check configured timeout
TIMEOUT=$(grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env | cut -d'=' -f2)
echo "Configured timeout: ${TIMEOUT}ms ($(($TIMEOUT / 60000)) minutes)"

# If container is running, check how close to timeout
if [ -n "$CONTAINER_PID" ]; then
  # Get elapsed time in seconds
  ELAPSED_SEC=$(ps -o etimes= -p $CONTAINER_PID | tr -d ' ')
  ELAPSED_MS=$((ELAPSED_SEC * 1000))
  TIMEOUT_MS=${TIMEOUT:-1800000}

  REMAINING_MS=$((TIMEOUT_MS - ELAPSED_MS))
  REMAINING_MIN=$((REMAINING_MS / 60000))

  PERCENT=$((ELAPSED_MS * 100 / TIMEOUT_MS))

  echo "Progress: ${PERCENT}% (${REMAINING_MIN} minutes remaining)"

  # Warn if approaching timeout
  if [ $PERCENT -gt 80 ]; then
    echo "⚠️  WARNING: Agent is at ${PERCENT}% of timeout!"
  fi
fi
```

### Step 4: Analyze Recent Logs

Look for patterns indicating progress or problems:

```bash
# Get recent agent logs
echo "=== Recent Agent Activity ==="
tail -50 ~/Documents/nanoclaw/logs/nanoclaw.log | grep -E "Spawning|Processing|completed|timeout|error" --color=never

# Check for specific issues
echo -e "\n=== Checking for Issues ==="

# Timeout errors
TIMEOUTS=$(grep -c "Container timeout" ~/Documents/nanoclaw/logs/nanoclaw.log)
if [ $TIMEOUTS -gt 0 ]; then
  echo "⚠️  Found $TIMEOUTS timeout(s) in logs"
  echo "   Last timeout:"
  grep "Container timeout" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -1
fi

# Container errors
ERRORS=$(grep -c "Container.*error" ~/Documents/nanoclaw/logs/nanoclaw.log)
if [ $ERRORS -gt 0 ]; then
  echo "❌ Found $ERRORS container error(s)"
  echo "   Last error:"
  grep "Container.*error" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -1
fi

# Successful completions
COMPLETIONS=$(grep -c "Container completed" ~/Documents/nanoclaw/logs/nanoclaw.log)
echo "✅ Successful completions: $COMPLETIONS"
```

### Step 5: Check Model Configuration

Verify which model is being used:

```bash
echo "=== Model Configuration ==="
MODEL=$(grep ANTHROPIC_MODEL ~/Documents/nanoclaw/.env | cut -d'=' -f2)
echo "Current model: $MODEL"

# Model is set via ANTHROPIC_MODEL in .env (currently claude-opus-4-6)
```

### Step 6: Real-Time Log Streaming

For live monitoring while agent is working:

```bash
# Stream logs with relevant filtering
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log | grep --line-buffered -E "Spawning|Processing|Container|completed|timeout|error"
```

## Common Scenarios & Diagnosis

### Scenario 1: "Agent is working, but taking a long time"

**Diagnosis Steps:**

1. Check if container is still running (Step 2)
2. Check timeout progress (Step 3)
3. Look for recent log activity (Step 4)

**Healthy Signs:**
- Container process exists
- CPU usage > 0%
- Logs show periodic activity
- Less than 80% of timeout elapsed

**Action:**
- ✅ **If healthy**: Wait and monitor
- ⚠️ **If approaching timeout**: Consider increasing `CONTAINER_TIMEOUT`
- ❌ **If no activity for 2+ minutes**: May be stuck, check for errors

### Scenario 2: "Container timed out"

**Log Pattern:**
```
Container timeout, killing
Container timed out after 300000ms
```

**Diagnosis:**
```bash
# Check what timeout was set
grep "Container timeout" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -1

# Check current timeout setting
grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env
```

**Fix:**
```bash
# Increase timeout (e.g., to 30 minutes for research tasks)
echo "CONTAINER_TIMEOUT=1800000" >> ~/Documents/nanoclaw/.env

# Or edit .env directly
nano ~/Documents/nanoclaw/.env
# Add: CONTAINER_TIMEOUT=1800000

# Restart service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

### Scenario 3: "Container failed with error"

**Log Pattern:**
```
Container exited with error
error: "some error message"
```

**Diagnosis:**
```bash
# Get detailed error message
grep -A 10 "Container exited with error" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -15

# Check container-specific logs
ls -t ~/Documents/nanoclaw/groups/*/logs/container-*.log | head -1 | xargs tail -50
```

**Common Errors:**

1. **Authentication failure**:
   ```
   Invalid API key · Please run /login
   ```
   Fix: Check `.env` has valid `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`

2. **Out of memory**:
   ```
   JavaScript heap out of memory
   ```
   Fix: Reduce task complexity or add memory limit configuration

3. **Permission denied**:
   ```
   EACCES: permission denied
   ```
   Fix: Check file permissions on mounted directories

### Scenario 4: "No container running, no response"

**Possible Causes:**

1. **Already completed**: Check for completion message in logs
   ```bash
   grep "Container completed" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -1
   ```

2. **Failed to start**: Check for spawn errors
   ```bash
   grep -A 5 "Spawning container" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -10
   ```

3. **Service not running**: Check NanoClaw process
   ```bash
   ps aux | grep nanoclaw | grep -v grep
   ```

## Automatic Diagnosis Script

Here's a comprehensive diagnostic that checks everything:

```bash
#!/bin/bash
# Comprehensive Agent Diagnostics

echo "🔍 NanoClaw Agent Diagnostics"
echo "======================================"
date
echo ""

# 1. Service Status
echo "📱 Service Status:"
NANOCLAW_PID=$(ps aux | grep "node.*nanoclaw/dist/index.js" | grep -v grep | awk '{print $2}')
if [ -n "$NANOCLAW_PID" ]; then
  echo "   ✅ NanoClaw service running (PID: $NANOCLAW_PID)"
else
  echo "   ❌ NanoClaw service NOT running!"
  echo "      Fix: launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist"
fi

echo ""

# 2. Container Status
echo "📦 Container Status:"
CONTAINER_PID=$(ps aux | grep "container run" | grep -v grep | awk '{print $2}')
if [ -n "$CONTAINER_PID" ]; then
  echo "   ✅ Container running (PID: $CONTAINER_PID)"

  # Runtime details
  ELAPSED=$(ps -o etime= -p $CONTAINER_PID | tr -d ' ')
  CPU=$(ps -o %cpu= -p $CONTAINER_PID | tr -d ' ')
  MEM=$(ps -o %mem= -p $CONTAINER_PID | tr -d ' ')

  echo "      Runtime: $ELAPSED"
  echo "      CPU: ${CPU}%"
  echo "      Memory: ${MEM}%"

  # Timeout check
  TIMEOUT=$(grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env 2>/dev/null | cut -d'=' -f2)
  TIMEOUT=${TIMEOUT:-1800000}  # Default 30 min

  ELAPSED_SEC=$(ps -o etimes= -p $CONTAINER_PID | tr -d ' ')
  ELAPSED_MS=$((ELAPSED_SEC * 1000))
  PERCENT=$((ELAPSED_MS * 100 / TIMEOUT))
  REMAINING_MIN=$(((TIMEOUT - ELAPSED_MS) / 60000))

  echo "      Progress: ${PERCENT}% (${REMAINING_MIN}min remaining)"

  if [ $PERCENT -gt 90 ]; then
    echo "      ⚠️  CRITICAL: Approaching timeout!"
  elif [ $PERCENT -gt 75 ]; then
    echo "      ⚠️  WARNING: Over 75% of timeout"
  fi
else
  echo "   ❌ No container running"
fi

echo ""

# 3. Configuration
echo "⚙️  Configuration:"
TIMEOUT=$(grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env 2>/dev/null | cut -d'=' -f2)
TIMEOUT=${TIMEOUT:-1800000}
TIMEOUT_MIN=$((TIMEOUT / 60000))
echo "   Timeout: ${TIMEOUT_MIN} minutes"

MODEL=$(grep ANTHROPIC_MODEL ~/Documents/nanoclaw/.env 2>/dev/null | cut -d'=' -f2)
echo "   Model: ${MODEL:-claude-opus-4-6 (default)}"

echo ""

# 4. Recent Activity
echo "📊 Recent Activity (last 10 lines):"
tail -10 ~/Documents/nanoclaw/logs/nanoclaw.log | grep -v "^$" | while read -r line; do
  echo "   $line"
done

echo ""

# 5. Error Check
echo "🔍 Error Check:"
RECENT_ERRORS=$(tail -100 ~/Documents/nanoclaw/logs/nanoclaw.log | grep -i error | wc -l | tr -d ' ')
if [ "$RECENT_ERRORS" -gt 0 ]; then
  echo "   ⚠️  Found $RECENT_ERRORS error(s) in recent logs:"
  tail -100 ~/Documents/nanoclaw/logs/nanoclaw.log | grep -i error | tail -3 | while read -r line; do
    echo "      $line"
  done
else
  echo "   ✅ No recent errors"
fi

echo ""

# 6. Last Completion
echo "✅ Last Successful Completion:"
LAST_COMPLETION=$(grep "Container completed" ~/Documents/nanoclaw/logs/nanoclaw.log | tail -1)
if [ -n "$LAST_COMPLETION" ]; then
  echo "   $LAST_COMPLETION"
else
  echo "   No completions found"
fi

echo ""
echo "======================================"
echo "💡 Recommendations:"

if [ -z "$NANOCLAW_PID" ]; then
  echo "   1. Start NanoClaw service"
fi

if [ -n "$CONTAINER_PID" ] && [ $PERCENT -gt 75 ]; then
  echo "   2. Agent is approaching timeout - consider increasing CONTAINER_TIMEOUT"
fi

if [ "$RECENT_ERRORS" -gt 5 ]; then
  echo "   3. Multiple errors detected - check logs for details"
fi

if [ -z "$CONTAINER_PID" ] && [ -n "$NANOCLAW_PID" ]; then
  echo "   4. No active agent - task may have completed or failed"
fi
```

## Quick Reference Commands

```bash
# One-line status check
~/Documents/nanoclaw/scripts/monitor-agent.sh

# Real-time log monitoring
tail -f ~/Documents/nanoclaw/logs/nanoclaw.log

# Check if container is running
ps aux | grep "container run" | grep -v grep

# Get current timeout setting
grep CONTAINER_TIMEOUT ~/Documents/nanoclaw/.env

# Check recent errors
grep -i error ~/Documents/nanoclaw/logs/nanoclaw.log | tail -10

# View last container log
ls -t ~/Documents/nanoclaw/groups/*/logs/container-*.log | head -1 | xargs tail -50

# Restart NanoClaw service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist && \
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Integration with This Skill

When you invoke this skill (`/debug-agent`), I will:

1. **Run the monitoring script** and show you the output
2. **Analyze the current state** (running/stuck/completed/failed)
3. **Check configuration** (timeout, model)
4. **Examine logs** for errors or patterns
5. **Provide specific diagnosis** based on what I find
6. **Suggest fixes** if issues are detected

Just say: "debug agent" or "/debug-agent" and I'll handle the rest!
