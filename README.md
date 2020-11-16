# moshpit

## Installation

To run *moshpit*, you'll need Node (>=12.0.0) and a Postgres database. Dependencies can be set up
with `npm install`.

You will also need to set up a `.env` file with environment variables for the Node server, as
follows:

```env
PGHOST=__ADDRESS_OF_POSTGRES_SERVER__
PGUSER=__POSTGRES_USERNAME__
PGDATABASE=__POSTGRES_DATABASE_NAME__
PGPASSWORD=__POSTGRES_PASSWORD__
PGPORT=__POSTGRES_PORT__

DISCORD_TOKEN=__DISCORD_BOT_TOKEN__
DISCORD_PREFIX=__DISCORD_BOT_PREFIX__

CALLBACK_HOST=__CALLBACK_HOST_URL__
CALLBACK_PORT=__CALLBACK_PORT_NUMBER__

SPOTIFY_CLIENT_ID=__SPOTIFY_CLIENT_ID__
SPOTIFY_CLIENT_SECRET=__SPOTIFY_CLIENT_SECRET__
SPOTIFY_CALLBACK_PATH=__SPOTIFY_CALLBACK_PATH__
```

### Environment notes

The `CALLBACK_HOST` + `SPOTIFY_CALLBACK_PATH` combination must be listed in the Spotify app's
configuration on Spotify's developer dashboard. Make sure that `CALLBACK_HOST` doesn't end in a
slash, and that `SPOTIFY_CALLBACK_PATH` begins with a slash. `CALLBACK_HOST` must include the scheme
(e.g. `https://`).

## Running

Run the server with Node, e.g. `node index.mjs`. The bot should connect to Discord and begin
watching messages.
