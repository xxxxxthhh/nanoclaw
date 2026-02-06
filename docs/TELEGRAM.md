# Telegram Integration

## Overview

NanoClaw integrates with Telegram via a bot that can receive and respond to messages. The integration includes robust error handling, automatic reconnection, and health monitoring.

## Configuration

Set these environment variables in `~/Library/LaunchAgents/com.nanoclaw.plist`:

```xml
<key>TELEGRAM_BOT_TOKEN</key>
<string>your-bot-token</string>
<key>TELEGRAM_AUTHORIZED_USER_ID</key>
<string>your-telegram-user-id</string>
<key>TELEGRAM_MAIN_CHAT_ID</key>
<string>your-chat-id</string>
```

## Features

### 1. **Auto-Reconnection**
- Monitors polling errors and automatically restarts the connection when network issues occur
- Distinguishes between network errors (ECONNRESET, ETIMEDOUT) and API errors
- Implements exponential backoff to avoid overwhelming the Telegram API

### 2. **Error Tracking**
- Tracks polling error frequency within a sliding time window
- Automatically restarts polling after 5 errors within 1 minute
- Logs detailed error information for debugging

### 3. **Health Monitoring**
- Performs periodic health checks every 5 minutes
- Verifies bot connection by calling `getMe()` API
- Monitors message activity to detect prolonged silence periods
- Logs warning if no messages received for over 1 hour

### 4. **Graceful Shutdown**
- Properly stops polling when service is terminated
- Cleans up health check timers
- Responds to SIGTERM and SIGINT signals

## Error Handling

### Network Errors
When network errors occur:
1. Error is logged with code and message
2. Error counter increments
3. If 5 errors occur within 1 minute, polling is restarted
4. Counter resets after successful restart

### API Errors
Non-network errors (e.g., invalid token, rate limiting):
- Logged for monitoring
- Does NOT trigger automatic restart
- Requires manual intervention

## Monitoring

### Log Messages

**Success:**
- `Telegram bot handlers initialized` - Bot started successfully
- `Connected to Telegram` - Bot authenticated and ready
- `Telegram health check started` - Health monitoring active
- `Telegram message received` - Incoming message detected

**Warnings:**
- `Telegram network error detected` - Network issue occurred
- `Telegram bot has been silent for extended period` - No activity for >1 hour

**Errors:**
- `Too many polling errors, restarting Telegram bot` - Auto-restart triggered
- `Telegram health check failed` - Bot may be disconnected
- `Failed to restart Telegram polling` - Restart attempt failed

### Health Check

The health check runs every 5 minutes and:
- Verifies the bot is still connected to Telegram API
- Tracks time since last message
- Logs warnings if silent for over 1 hour

## Troubleshooting

### Bot Not Responding

1. **Check logs for errors:**
   ```bash
   tail -f ~/Documents/nanoclaw/logs/nanoclaw.log | grep -i telegram
   ```

2. **Verify bot token is valid:**
   ```bash
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
   ```

3. **Restart the service:**
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
   launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
   ```

### Frequent Polling Errors

If you see continuous polling errors:

1. **Network issues:** Check internet connection
2. **Firewall:** Ensure Telegram API (api.telegram.org) is not blocked
3. **Rate limiting:** Reduce polling frequency if needed

### Bot Silently Stops Working

1. Check for `Telegram health check failed` in logs
2. Look for `Too many polling errors` indicating automatic restarts
3. Verify the bot token hasn't been revoked
4. Check that authorized user ID is correct

## Configuration Tuning

You can adjust these constants in `src/telegram.ts`:

```typescript
// Maximum errors before restart
private readonly MAX_POLLING_ERRORS = 5;

// Time window for error counting (1 minute)
private readonly ERROR_WINDOW_MS = 60000;
```

And in `src/telegram-integration.ts`:

```typescript
// Health check interval (5 minutes)
private readonly HEALTH_CHECK_INTERVAL_MS = 300000;

// Max silence before warning (1 hour)
private readonly MAX_SILENCE_MS = 3600000;
```

## Testing

### Send a Test Message

Send any message to your bot to verify it's working:
```
Hello bot!
```

### Trigger Auto-Reconnect

To test auto-reconnect (not recommended for production):
1. Temporarily block api.telegram.org in your firewall
2. Wait for 5 polling errors
3. Unblock and watch logs for successful restart

### Check Health Status

Health checks log every 5 minutes. To force a check, restart the service and wait 5 minutes.

## Architecture

```
┌─────────────────────────────────────────┐
│         TelegramHandler                  │
│  - Manages polling connection           │
│  - Tracks error frequency                │
│  - Auto-restarts on network errors      │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      TelegramIntegration                 │
│  - Message processing pipeline           │
│  - Health monitoring                     │
│  - Command handling (/clear, /help)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         Main Process (index.ts)          │
│  - Graceful shutdown                     │
│  - Signal handling (SIGTERM, SIGINT)    │
└─────────────────────────────────────────┘
```

## Best Practices

1. **Monitor logs regularly** for polling errors
2. **Set up alerts** for repeated health check failures
3. **Keep bot token secure** - never commit to git
4. **Use authorized user ID** to prevent unauthorized access
5. **Test auto-reconnect** in staging before relying on it in production
