# BeatStats

Unofficial BeatLeader Discord bot integration

[Invite here!](https://discord.com/api/oauth2/authorize?client_id=1156310849439400047&scope=bot)

## Features

- Clan Live Scores
- Clan Leaderboard
- Share scores (recent, top, search)
- Scores playlist generation (all scores with less than 95% accuracy)
- Potential scores playlist (maps worth Xpp at Y accuracy and/or Z stars)

## Self-host

It's possible to self-host the bot with these steps.

1. Install Node 18 or newer (or use NVM, Node Version Manager)
    - `mvm install 18` -> `nvm use 18`
2. Run `yarn install`
3. Run `yarn build`
4. Create a bot and get the token and application ID.
5. Edit `config.json` and fill in the `TOKEN`, `applicationId`, and `ownerId`
6. Run `yarn start`

Enjoy using the bot!
