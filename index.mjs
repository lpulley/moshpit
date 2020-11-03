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

// Commands are indexed from lowercase names to functions
const commands = {
  'ping': Commands.ping,
  'link': Commands.link,
  'start': Commands.start
};

const client = new Discord.Client();
client.on('ready', () => {
  // Send a log message on successful login to Discord
  console.log(`Logged in as "${client.user.tag}"`);
});

// Handle incoming messages
client.on('message', async (message) => {
  // Don't respond to anything that's not in a server
  if (message.guild) {
    // Don't respond to anything that doesn't have the bot's prefix
    if (message.content.match(new RegExp(`^${prefix}(?:\\s+|$)`, 'i'))) {
      const messageWords = message.content.split(/\s+/);
      if (messageWords[1]) {
        // If the message has a command after the prefix, perform the command
        const messageCommand = messageWords[1].toLowerCase();
        try {
          // Build a context object for the command to use
          const context = {
            message: message,
            content: messageWords.slice(2),
            postgres: postgres,
          };
          // Execute the command
          await commands[messageCommand](context);
        } catch (error) {
          // Catch and report any uncaught errors
          message.channel.send('Whoops! Something went very wrong.');
          console.error(error);
        }
      } else {
        // If there's no command, just say hi
        message.channel.send('Hi!');
      }
    }
  }
});

// Actually log in to Discord
client.login(process.env['DISCORD_TOKEN']);

// Exit the Postgres connection when the Node process exits
process.on('exit', postgres.end);
