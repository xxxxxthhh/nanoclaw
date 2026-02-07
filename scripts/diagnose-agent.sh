#!/bin/bash
# Comprehensive Agent Diagnostics Script
# Usage: ./diagnose-agent.sh

set -euo pipefail

NANOCLAW_ROOT="$HOME/Documents/nanoclaw"
LOG_FILE="$NANOCLAW_ROOT/logs/nanoclaw.log"
ENV_FILE="$NANOCLAW_ROOT/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 NanoClaw Agent Diagnostics${NC}"
echo "======================================"
date
echo ""

# 1. Service Status
echo -e "${BLUE}📱 Service Status:${NC}"
NANOCLAW_PID=$(ps aux | grep "node.*nanoclaw/dist/index.js" | grep -v grep | awk '{print $2}' || true)
if [ -n "$NANOCLAW_PID" ]; then
  echo -e "   ${GREEN}✅ NanoClaw service running${NC} (PID: $NANOCLAW_PID)"
else
  echo -e "   ${RED}❌ NanoClaw service NOT running!${NC}"
  echo "      Fix: launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist"
  exit 1
fi

echo ""

# 2. Container Status
echo -e "${BLUE}📦 Container Status:${NC}"
CONTAINER_PID=$(ps aux | grep "container run" | grep -v grep | awk '{print $2}' || true)
if [ -n "$CONTAINER_PID" ]; then
  echo -e "   ${GREEN}✅ Container running${NC} (PID: $CONTAINER_PID)"

  # Runtime details
  ELAPSED=$(ps -o etime= -p $CONTAINER_PID | tr -d ' ')
  CPU=$(ps -o %cpu= -p $CONTAINER_PID | tr -d ' ')
  MEM=$(ps -o %mem= -p $CONTAINER_PID | tr -d ' ')

  echo "      Runtime: $ELAPSED"
  echo "      CPU: ${CPU}%"
  echo "      Memory: ${MEM}%"

  # Timeout check
  TIMEOUT=$(grep CONTAINER_TIMEOUT "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "1800000")
  TIMEOUT_MIN=$((TIMEOUT / 60000))

  ELAPSED_SEC=$(ps -o etimes= -p $CONTAINER_PID | tr -d ' ')
  ELAPSED_MS=$((ELAPSED_SEC * 1000))
  PERCENT=$((ELAPSED_MS * 100 / TIMEOUT))
  REMAINING_MS=$((TIMEOUT - ELAPSED_MS))
  REMAINING_MIN=$((REMAINING_MS / 60000))

  echo "      Timeout: ${TIMEOUT_MIN}min configured"
  echo "      Progress: ${PERCENT}% (${REMAINING_MIN}min remaining)"

  if [ $PERCENT -gt 90 ]; then
    echo -e "      ${RED}⚠️  CRITICAL: Approaching timeout!${NC}"
  elif [ $PERCENT -gt 75 ]; then
    echo -e "      ${YELLOW}⚠️  WARNING: Over 75% of timeout${NC}"
  fi
else
  echo -e "   ${YELLOW}❌ No container running${NC}"
  echo "      Agent may have completed or not yet started"
fi

echo ""

# 3. Configuration
echo -e "${BLUE}⚙️  Configuration:${NC}"
TIMEOUT=$(grep CONTAINER_TIMEOUT "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "1800000")
TIMEOUT_MIN=$((TIMEOUT / 60000))
echo "   Timeout: ${TIMEOUT_MIN} minutes (${TIMEOUT}ms)"

MODEL=$(grep ANTHROPIC_MODEL "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 || echo "claude-sonnet-4-5 (default)")
echo "   Model: $MODEL"

if [[ "$MODEL" == *"opus"* ]]; then
  echo "   Note: Opus is slower but more thorough - ensure adequate timeout"
fi

echo ""

# 4. Recent Activity
echo -e "${BLUE}📊 Recent Activity (last 10 relevant lines):${NC}"
if [ -f "$LOG_FILE" ]; then
  tail -50 "$LOG_FILE" | grep -E "Spawning|Processing|Container|completed|timeout|error" | tail -10 | while read -r line; do
    if [[ "$line" == *"error"* ]] || [[ "$line" == *"timeout"* ]]; then
      echo -e "   ${RED}$line${NC}"
    elif [[ "$line" == *"completed"* ]]; then
      echo -e "   ${GREEN}$line${NC}"
    else
      echo "   $line"
    fi
  done
else
  echo "   No log file found"
fi

echo ""

# 5. Error Check
echo -e "${BLUE}🔍 Error Check:${NC}"
if [ -f "$LOG_FILE" ]; then
  RECENT_ERRORS=$(tail -100 "$LOG_FILE" | grep -ci error || echo "0")
  if [ "$RECENT_ERRORS" -gt 0 ]; then
    echo -e "   ${YELLOW}⚠️  Found $RECENT_ERRORS error(s) in recent logs:${NC}"
    tail -100 "$LOG_FILE" | grep -i error | tail -3 | while read -r line; do
      echo -e "      ${RED}$line${NC}"
    done
  else
    echo -e "   ${GREEN}✅ No recent errors${NC}"
  fi
fi

echo ""

# 6. Last Completion
echo -e "${BLUE}✅ Last Successful Completion:${NC}"
if [ -f "$LOG_FILE" ]; then
  LAST_COMPLETION=$(grep "Container completed" "$LOG_FILE" | tail -1 || echo "")
  if [ -n "$LAST_COMPLETION" ]; then
    # Extract duration if available
    if [[ "$LAST_COMPLETION" =~ duration:\ ([0-9]+) ]]; then
      DURATION_MS="${BASH_REMATCH[1]}"
      DURATION_MIN=$((DURATION_MS / 60000))
      DURATION_SEC=$(((DURATION_MS % 60000) / 1000))
      echo "   Last task completed in ${DURATION_MIN}m ${DURATION_SEC}s"
    fi
    echo "   $LAST_COMPLETION"
  else
    echo "   No completions found in logs"
  fi
fi

echo ""

# 7. Timeout Statistics
echo -e "${BLUE}📈 Timeout Statistics:${NC}"
if [ -f "$LOG_FILE" ]; then
  TOTAL_COMPLETIONS=$(grep -c "Container completed" "$LOG_FILE" || echo "0")
  TOTAL_TIMEOUTS=$(grep -c "Container timeout" "$LOG_FILE" || echo "0")

  echo "   Total completions: $TOTAL_COMPLETIONS"
  echo "   Total timeouts: $TOTAL_TIMEOUTS"

  if [ "$TOTAL_TIMEOUTS" -gt 0 ] && [ "$TOTAL_COMPLETIONS" -gt 0 ]; then
    TIMEOUT_RATE=$((TOTAL_TIMEOUTS * 100 / (TOTAL_COMPLETIONS + TOTAL_TIMEOUTS)))
    echo "   Timeout rate: ${TIMEOUT_RATE}%"

    if [ "$TIMEOUT_RATE" -gt 20 ]; then
      echo -e "   ${YELLOW}⚠️  High timeout rate - consider increasing CONTAINER_TIMEOUT${NC}"
    fi
  fi
fi

echo ""
echo "======================================"
echo -e "${BLUE}💡 Recommendations:${NC}"

RECOMMENDATIONS=0

if [ -z "$NANOCLAW_PID" ]; then
  echo "   ${RECOMMENDATIONS}. Start NanoClaw service"
  RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
fi

if [ -n "$CONTAINER_PID" ] && [ $PERCENT -gt 75 ]; then
  echo "   ${RECOMMENDATIONS}. Agent approaching timeout - consider increasing CONTAINER_TIMEOUT"
  RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
fi

if [ "$RECENT_ERRORS" -gt 5 ]; then
  echo "   ${RECOMMENDATIONS}. Multiple errors detected - check logs: tail -f $LOG_FILE"
  RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
fi

if [ -z "$CONTAINER_PID" ] && [ -n "$NANOCLAW_PID" ]; then
  RECENT_SPAWN=$(tail -20 "$LOG_FILE" | grep -c "Spawning container" | tr -d '\n' || echo "0")
  RECENT_SPAWN=${RECENT_SPAWN:-0}  # Default to 0 if empty
  if [ "$RECENT_SPAWN" -eq 0 ]; then
    echo "   ${RECOMMENDATIONS}. No recent agent activity - send a message to trigger"
    RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
  fi
fi

# Check if timeout is too low for Opus
if [[ "$MODEL" == *"opus"* ]] && [ $TIMEOUT_MIN -lt 30 ]; then
  echo "   ${RECOMMENDATIONS}. Using Opus model with only ${TIMEOUT_MIN}min timeout - recommend 30min+"
  RECOMMENDATIONS=$((RECOMMENDATIONS + 1))
fi

if [ $RECOMMENDATIONS -eq 0 ]; then
  echo -e "   ${GREEN}✅ Everything looks good!${NC}"
fi

echo ""
echo "======================================"
echo -e "${BLUE}Quick Commands:${NC}"
echo "   Monitor logs:  tail -f $LOG_FILE"
echo "   Check config:  cat $ENV_FILE"
echo "   Restart:       launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist && launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist"
