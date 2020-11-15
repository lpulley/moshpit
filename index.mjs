'use strict';

// dotenv lets us easily use environment variables
import dotenv from 'dotenv';
dotenv.config();

// The environment's PREFIX value is the keyword Moshpit will respond to
const prefix = process.env['DISCORD_PREFIX'];

// pg lets us easily use Postgres
import Postgres from 'pg';
const postgres = new Postgres.Pool();
// pg will use connection details from the environment
postgres.connect();

// discord.js lets us easily use Discord's API
import * as Discord from 'discord.js';

// Command actions are stored as functions in ./commands.mjs
import * as Commands from './commands.mjs';

// Commands that can be used in guilds
const guildCommands = {
  'whoami': Commands.whoami,
  'link': Commands.link,
  'start': Commands.start,
  'quit': Commands.quit,
  'aq1': Commands.aq1,
  'aq2': Commands.aq2,
  'data': Commands.data,
};

const client = new Discord.Client();
client.on('ready', () => {
  // Send a log message on successful login to Discord
  console.log(`Logged in as "${client.user.tag}"`);
});

// Handle incoming messages
const prefixExpression = new RegExp(`^${prefix}(?:\\s+(.*))?$`, 'i');
client.on('message', async (message) => {
  const execute = async (command, commands) => {
    const messageWords = command.split(/\s+/);
    if (messageWords[0]) {
      // If the message has a command after the prefix, perform the command
      const messageCommand = messageWords[0].toLowerCase();
      if (messageCommand in commands) {
        // Known command
        try {
          // Build a context object for the command to use
          const context = {
            message: message,
            content: messageWords.slice(1),
            postgres: postgres,
          };
          // Execute the command
          await commands[messageCommand](context);
        } catch (error) {
          // Catch and report any uncaught errors
          await message.reply('whoops! Something went very wrong.');
          console.error(error);
        }
      } else {
        // Unknown command
        await message.reply('that\'s an unknown command.');
      }
    } else {
      // If there's no command, just say hi
      await message.reply('hi!');
    }
  };

  if (!message.author.bot && message.guild) {
    const match = message.content.match(prefixExpression);
    if (match) {
      await execute(match[1] || '', guildCommands);
    }
  }
});

// Actually log in to Discord
client.login(process.env['DISCORD_TOKEN']);

// Exit the Postgres connection when the Node process exits
process.on('exit', postgres.end);
