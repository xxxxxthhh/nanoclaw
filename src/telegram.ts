/**
 * Telegram Bot Integration for NanoClaw
 * Handles incoming messages and sends responses via Telegram
 */

import TelegramBot from 'node-telegram-bot-api';
import pino from 'pino';
import { TRIGGER_PATTERN } from './config.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

export interface TelegramMessage {
  chatId: number;
  userId: number;
  username?: string;
  text: string;
  messageId: number;
  timestamp: number;
  mediaType?: string;
  mediaData?: string;
  mediaMimeType?: 'image/jpeg' | 'image/png';
}

export class TelegramHandler {
  private bot: TelegramBot;
  private authorizedUserId?: number;
  private token: string;
  private pollingErrorCount = 0;
  private lastPollingError?: Date;
  private readonly MAX_POLLING_ERRORS = 5;
  private readonly ERROR_WINDOW_MS = 60000; // 1 minute
  private restartTimer?: NodeJS.Timeout;
  private isRestarting = false;

  constructor(token: string, authorizedUserId?: number) {
    this.token = token;
    this.authorizedUserId = authorizedUserId;
    this.bot = this.createBot();
    this.setupHandlers();
  }

  private createBot(): TelegramBot {
    return new TelegramBot(this.token, {
      polling: {
        interval: 1000, // Poll every 1 second
        autoStart: true,
        params: {
          timeout: 10 // Long polling timeout
        }
      }
    });
  }

  private setupHandlers(): void {
    this.bot.on('message', async (msg) => {
      try {
        // Skip messages from the bot itself to prevent loops
        if (msg.from?.is_bot) {
          logger.debug({ userId: msg.from?.id }, 'Skipping bot message');
          return;
        }

        // Authorization check (if configured)
        if (this.authorizedUserId && msg.from?.id !== this.authorizedUserId) {
          logger.warn({ userId: msg.from?.id }, 'Unauthorized Telegram user');
          return;
        }

        // Extract text content (from text message or photo caption)
        const text = msg.text || msg.caption || '';

        // Skip messages without text or media
        if (!text && !msg.photo && !msg.video) return;

        let mediaType: string | undefined;
        let mediaData: string | undefined;
        let mediaMimeType: 'image/jpeg' | 'image/png' | undefined;

        // Handle photo messages
        if (msg.photo && msg.photo.length > 0) {
          try {
            // Get the largest photo size (last one in array)
            const photo = msg.photo[msg.photo.length - 1];
            const fileId = photo.file_id;

            // Download photo
            const fileLink = await this.bot.getFileLink(fileId);
            const response = await fetch(fileLink);
            const buffer = await response.arrayBuffer();
            const dataBuffer = Buffer.from(buffer);
            const contentType = response.headers.get('content-type') || undefined;

            mediaType = 'image';
            mediaMimeType = detectImageMimeType(dataBuffer, contentType);
            mediaData = dataBuffer.toString('base64');

            logger.info({ chatId: msg.chat.id, fileId }, 'Downloaded Telegram photo');
          } catch (err) {
            logger.error({ error: err, chatId: msg.chat.id }, 'Failed to download Telegram photo');
          }
        }
        // Handle video messages
        else if (msg.video) {
          try {
            const fileId = msg.video.file_id;

            // Download video (note: may be large, consider limits)
            const fileLink = await this.bot.getFileLink(fileId);
            const response = await fetch(fileLink);
            const buffer = await response.arrayBuffer();

            mediaType = 'video';
            mediaData = Buffer.from(buffer).toString('base64');

            logger.info({ chatId: msg.chat.id, fileId }, 'Downloaded Telegram video');
          } catch (err) {
            logger.error({ error: err, chatId: msg.chat.id }, 'Failed to download Telegram video');
          }
        }

        const telegramMsg: TelegramMessage = {
          chatId: msg.chat.id,
          userId: msg.from?.id || 0,
          username: msg.from?.username,
          text: text,
          messageId: msg.message_id,
          timestamp: msg.date * 1000, // Convert to milliseconds
          mediaType,
          mediaData,
          mediaMimeType
        };

        logger.info({
          chatId: telegramMsg.chatId,
          userId: telegramMsg.userId,
          username: telegramMsg.username,
          hasMedia: !!mediaType
        }, 'Telegram message received');

        // Emit event for message processing
        this.bot.emit('nanoclaw:message', telegramMsg);

      } catch (err) {
        logger.error({ error: err }, 'Error handling Telegram message');
      }
    });

    this.bot.on('polling_error', (error) => {
      this.handlePollingError(error);
    });

    logger.info('Telegram bot handlers initialized');
  }

  private handlePollingError(error: Error): void {
    const now = new Date();
    const errorCode = (error as any).code;
    const errorMessage = error.message;

    // Check if this is a network error that warrants reconnection
    const isNetworkError =
      errorCode === 'EFATAL' ||
      errorMessage.includes('ECONNRESET') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNREFUSED');

    if (isNetworkError) {
      logger.warn({
        error: { code: errorCode, message: errorMessage },
        errorCount: this.pollingErrorCount + 1
      }, 'Telegram network error detected');

      // Reset error count if last error was more than ERROR_WINDOW_MS ago
      if (this.lastPollingError && (now.getTime() - this.lastPollingError.getTime()) > this.ERROR_WINDOW_MS) {
        this.pollingErrorCount = 0;
      }

      this.pollingErrorCount++;
      this.lastPollingError = now;

      // If too many errors in a short time, restart the bot
      if (this.pollingErrorCount >= this.MAX_POLLING_ERRORS) {
        logger.error({
          errorCount: this.pollingErrorCount,
          windowMs: this.ERROR_WINDOW_MS
        }, 'Too many polling errors, restarting Telegram bot');
        this.restartPolling();
      }
    } else {
      // Non-network errors (e.g., API errors) - just log
      logger.error({ error: { code: errorCode, message: errorMessage } }, 'Telegram polling error');
    }
  }

  private async restartPolling(): Promise<void> {
    if (this.isRestarting) {
      logger.debug('Bot restart already in progress, skipping');
      return;
    }

    this.isRestarting = true;

    try {
      logger.info('Stopping Telegram polling...');
      await this.bot.stopPolling();

      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));

      logger.info('Restarting Telegram polling...');
      await this.bot.startPolling();

      // Reset error counter on successful restart
      this.pollingErrorCount = 0;
      this.lastPollingError = undefined;

      logger.info('Telegram polling restarted successfully');
    } catch (err) {
      logger.error({ error: err }, 'Failed to restart Telegram polling');

      // Schedule another restart attempt
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
      }
      this.restartTimer = setTimeout(() => {
        logger.info('Retrying Telegram polling restart...');
        this.isRestarting = false;
        this.restartPolling();
      }, 5000);
    } finally {
      this.isRestarting = false;
    }
  }

  public async stopPolling(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    await this.bot.stopPolling();
  }

  public onMessage(handler: (msg: TelegramMessage) => Promise<void>): void {
    this.bot.on('nanoclaw:message', handler);
  }

  public async sendMessage(chatId: number, text: string, options?: { parse_mode?: 'Markdown' | 'HTML'; reply_to_message_id?: number }): Promise<void> {
    try {
      await this.bot.sendMessage(chatId, text, {
        parse_mode: options?.parse_mode || 'Markdown',
        reply_to_message_id: options?.reply_to_message_id
      });
      logger.info({ chatId, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ chatId, error: err }, 'Failed to send Telegram message');
      throw err;
    }
  }

  public async sendTypingAction(chatId: number): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, 'typing');
    } catch (err) {
      // Non-critical, just log
      logger.debug({ chatId, error: err }, 'Failed to send typing action');
    }
  }

  public getBot(): TelegramBot {
    return this.bot;
  }

  public async getMe(): Promise<TelegramBot.User> {
    return await this.bot.getMe();
  }
}

function detectImageMimeType(buffer: Buffer, contentType?: string): 'image/jpeg' | 'image/png' {
  if (contentType === 'image/png') return 'image/png';
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'image/jpeg';

  if (buffer.length >= 4) {
    // PNG signature: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    // JPEG signature: FF D8
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      return 'image/jpeg';
    }
  }

  return 'image/jpeg';
}

export function shouldProcessMessage(text: string, isPrivateChat: boolean): boolean {
  // In private chat (main channel), process all messages
  if (isPrivateChat) {
    return true;
  }

  // In group chats, only process if trigger pattern matches
  return TRIGGER_PATTERN.test(text);
}

export function stripTrigger(text: string): string {
  return text.replace(TRIGGER_PATTERN, '').trim();
}
