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

  constructor(token: string, authorizedUserId?: number) {
    this.bot = new TelegramBot(token, { polling: true });
    this.authorizedUserId = authorizedUserId;
    this.setupHandlers();
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
      logger.error({ error }, 'Telegram polling error');
    });

    logger.info('Telegram bot handlers initialized');
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
