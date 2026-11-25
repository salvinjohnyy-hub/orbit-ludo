# Orbit Ludo — starter project

This is a **starter prototype**, not a finished online multiplayer game.

## What's included
- Responsive React/Vite landing page and lobby preview
- Room-code and invite-link interface mockup
- Basic dice-roll preview and chat mockup
- Starter Supabase database schema

## Important limitations
- The current UI does not yet connect to a live backend.
- Room creation, joining, chat, spectators, and multiplayer synchronization are local previews only.
- The board is illustrative, not a complete traditional Ludo board.
- Full 2–8 player rules, move validation, animations, sound effects, security, and reconnection handling still need implementation.

## Development
Requires Node.js 20+.

```bash
npm install
npm run dev
```

To publish a real multiplayer game, the project still needs a Supabase backend, secure server-side game actions, and deployment (for example, through Vercel).
