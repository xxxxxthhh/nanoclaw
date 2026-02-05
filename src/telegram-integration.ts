/**
 * Telegram Integration for NanoClaw
 * Bridges Telegram messages to the existing message processing pipeline
 */

import pino from 'pino';
import { TelegramHandler, TelegramMessage, shouldProcessMessage, stripTrigger } from './telegram.js';
import { storeTelegramMessage, storeChatMetadata } from './db.js';
import { ASSISTANT_NAME } from './config.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

export interface TelegramConfig {
  token: string;
  authorizedUserId?: number;
  mainChatId?: number; // Your personal chat ID (optional)
}

export interface MessageHandler {
  (
    chatJid: string,
    content: string,
    timestamp: string,
    images?: Array<{ data: string; mediaType: 'image/jpeg' | 'image/png' }>,
    documents?: Array<{ data: string; filename: string }>
  ): Promise<string | null>;
}

export interface ResponseSender {
  (chatJid: string, text: string): Promise<void>;
}

export interface SessionClearer {
  (groupFolder: string): Promise<void>;
}

export class TelegramIntegration {
  private handler: TelegramHandler;
  private mainChatId?: number;
  private processMessage: MessageHandler;
  private sendResponse: ResponseSender;
  private clearSession: SessionClearer;

  constructor(
    config: TelegramConfig,
    processMessage: MessageHandler,
    sendResponse: ResponseSender,
    clearSession: SessionClearer
  ) {
    this.handler = new TelegramHandler(config.token, config.authorizedUserId);
    this.mainChatId = config.mainChatId;
    this.processMessage = processMessage;
    this.sendResponse = sendResponse;
    this.clearSession = clearSession;

    this.setupMessageHandler();
  }

  private setupMessageHandler(): void {
    this.handler.onMessage(async (msg: TelegramMessage) => {
      try {
        // Store chat metadata for discovery
        const chatJid = `telegram:${msg.chatId}`;
        const chatName = msg.username ? `@${msg.username}` : chatJid;
        storeChatMetadata(chatJid, new Date(msg.timestamp).toISOString(), chatName);

        // Do NOT store Telegram messages to database to prevent duplicate processing
        // Telegram messages are processed in real-time with images passed directly to the agent
        // WhatsApp uses database + polling, but Telegram uses direct event-driven processing

        // Check if this is main chat (private chat with authorized user)
        const isMainChat = this.mainChatId ? msg.chatId === this.mainChatId : msg.chatId > 0;

        // Handle slash commands
        if (msg.text.startsWith('/')) {
          await this.handleCommand(msg.chatId, msg.text, isMainChat);
          return;
        }

        // Determine if we should process this message
        if (!shouldProcessMessage(msg.text, isMainChat)) {
          logger.debug({ chatId: msg.chatId, isMainChat }, 'Message does not match trigger pattern');
          return;
        }

        // Remove trigger word if present (for group chats)
        const content = isMainChat ? msg.text : stripTrigger(msg.text);

        // Prepare media for processing
        const images = msg.mediaType === 'image' && msg.mediaData
          ? [{ data: msg.mediaData, mediaType: 'image/jpeg' as const }]
          : undefined;

        logger.info({
          chatId: msg.chatId,
          userId: msg.userId,
          username: msg.username,
          isMainChat,
          hasImage: !!images
        }, 'Processing Telegram message');

        // Show typing indicator
        await this.handler.sendTypingAction(msg.chatId);

        // Process through existing pipeline with images
        const response = await this.processMessage(
          chatJid,
          content,
          new Date(msg.timestamp).toISOString(),
          images,
          undefined // documents
        );

        if (response) {
          // Send response via Telegram
          // Note: We don't quote the original message to keep responses clean
          await this.handler.sendMessage(
            msg.chatId,
            response
          );

          // Do NOT store bot response in database to prevent duplicate processing by polling loop
          // Telegram messages are processed in real-time, not via polling
        }
      } catch (err) {
        logger.error({ error: err, chatId: msg.chatId }, 'Error processing Telegram message');

        try {
          await this.handler.sendMessage(
            msg.chatId,
            'Sorry, I encountered an error processing your message. Please try again later.'
          );
        } catch (sendErr) {
          logger.error({ error: sendErr }, 'Failed to send error message');
        }
      }
    });
  }

  private async handleCommand(chatId: number, text: string, isMainChat: boolean): Promise<void> {
    const command = text.toLowerCase().split(' ')[0];

    switch (command) {
      case '/clear':
      case '/new':
      case '/reset':
        try {
          // Only main chat can clear session (for now)
          // TODO: support group-specific session clearing
          const groupFolder = 'main';
          await this.clearSession(groupFolder);
          await this.handler.sendMessage(
            chatId,
            '✓ Session cleared. Starting fresh conversation!'
          );
          logger.info({ chatId, groupFolder }, 'Session cleared via command');
        } catch (err) {
          logger.error({ error: err, chatId }, 'Failed to clear session');
          await this.handler.sendMessage(
            chatId,
            '✗ Failed to clear session. Please try again.'
          );
        }
        break;

      case '/help':
        const helpText = `*Available Commands:*

/clear - Clear conversation history and start a new session
/new - Same as /clear
/reset - Same as /clear
/help - Show this help message

*How to talk to ${ASSISTANT_NAME}:*
${isMainChat ? 'Just send any message!' : `Mention @${ASSISTANT_NAME} in your message`}`;
        await this.handler.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
        break;

      default:
        // Unknown command - ignore silently
        logger.debug({ chatId, command }, 'Unknown command');
        break;
    }
  }

  public async getMe() {
    return await this.handler.getMe();
  }

  public getBot() {
    return this.handler.getBot();
  }

  /**
   * Send a message via Telegram (called from IPC or other parts of the system)
   */
  public async send(chatJid: string, text: string): Promise<void> {
    // Extract chat ID from JID (format: telegram:12345)
    if (!chatJid.startsWith('telegram:')) {
      throw new Error(`Invalid Telegram JID: ${chatJid}`);
    }

    const chatId = parseInt(chatJid.replace('telegram:', ''), 10);
    if (isNaN(chatId)) {
      throw new Error(`Invalid chat ID in JID: ${chatJid}`);
    }

    await this.handler.sendMessage(chatId, text);
  }
}
