/**
 * WhatsApp Authentication Script
 *
 * Run this during setup to authenticate with WhatsApp.
 * Displays QR code, waits for scan, saves credentials, then exits.
 *
 * Usage: npx tsx src/whatsapp-auth.ts
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';

const AUTH_DIR = './store/auth';

const logger = pino({
  level: 'warn', // Quiet logging - only show errors
});

async function authenticate(): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  if (state.creds.registered) {
    console.log('✓ Already authenticated with WhatsApp');
    console.log('  To re-authenticate, delete the store/auth folder and run again.');
    process.exit(0);
  }

  console.log('Starting WhatsApp authentication...\n');

  let qrShown = false;
  let retryCount = 0;
  const MAX_RETRIES = 5;

  function connectToWhatsApp() {
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      logger,
      browser: ['NanoClaw', 'Chrome', '1.0.0'],
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (!qrShown) {
          console.log('Scan this QR code with WhatsApp:\n');
          console.log('  1. Open WhatsApp on your phone');
          console.log('  2. Tap Settings → Linked Devices → Link a Device');
          console.log('  3. Point your camera at the QR code below\n');
          qrShown = true;
        }
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as any)?.output?.statusCode;

        if (reason === DisconnectReason.loggedOut) {
          console.log('\n✗ Logged out. Delete store/auth and try again.');
          process.exit(1);
        } else if (reason === DisconnectReason.restartRequired || reason === 515) {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`\n⟳ Connection interrupted, reconnecting (attempt ${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => connectToWhatsApp(), 2000);
          } else {
            console.log('\n✗ Max reconnection attempts reached. Please try again.');
            process.exit(1);
          }
        } else {
          console.log(`\n✗ Connection failed (code: ${reason}).`);
          process.exit(1);
        }
      }

      if (connection === 'open') {
        console.log('\n✓ Successfully authenticated with WhatsApp!');
        console.log('  Credentials saved to store/auth/');
        console.log('  You can now start the NanoClaw service.\n');

        // Give it a moment to save credentials, then exit
        setTimeout(() => process.exit(0), 1000);
      }
    });

    sock.ev.on('creds.update', saveCreds);
  }

  connectToWhatsApp();
}

authenticate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});
