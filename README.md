# moshpit

## Installation

To run *moshpit*, you'll need Node (>=12.0.0) and a Postgres database. Dependencies can be set up with `npm install`.

You will also need to set up a `.env` file with environment variables for the Node server, as follows:

```env
PGHOST=__ADDRESS_OF_POSTGRES_SERVER__
PGUSER=__POSTGRES_USERNAME__
PGDATABASE=__POSTGRES_DATABASE_NAME__
PGPASSWORD=__POSTGRES_PASSWORD__
PGPORT=__POSTGRES_PORT__

DISCORD_TOKEN=__DISCORD_BOT_TOKEN__
DISCORD_PREFIX=__DISCORD_BOT_PREFIX__
```

## Running

Run the server with Node, e.g. `node index.mjs`. The bot should connect to Discord and begin watching messages.
