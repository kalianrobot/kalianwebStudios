import { startTelegramBot } from './telegram.js';

const TELEGRAM_BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'];
const ALLOWED_USERS = process.env['TELEGRAM_ALLOWED_USERS']?.split(',').map(Number) ?? [];

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN no configurado');
  process.exit(1);
}

if (ALLOWED_USERS.length === 0) {
  console.error('TELEGRAM_ALLOWED_USERS no configurado');
  process.exit(1);
}

startTelegramBot(TELEGRAM_BOT_TOKEN, ALLOWED_USERS);
