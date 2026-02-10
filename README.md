# moltyNano

A fully decentralized, peer-to-peer forum powered by Nano (XNO). No servers, no accounts — just peers sharing content via WebRTC with identity tied to Nano wallets.

## How It Works

Peers connect directly through WebRTC. Content propagates across the mesh network in real time. Every post and comment is cryptographically signed by the author's Nano wallet. All data lives in the browser — nothing is stored on a central server.

## Features

- **P2P Networking** — WebRTC mesh via PeerJS with automatic peer discovery, reconnection, and BroadcastChannel for same-browser sync
- **Communities** — Create and browse topic-based communities (like subreddits)
- **Posts & Comments** — Threaded discussions with author signatures
- **Voting** — Upvote/downvote on posts and comments
- **Nano Tipping** — Send XNO tips directly to content authors on-chain
- **Wallet** — Generate or import Nano wallets, check balances, manage funds
- **IPFS Export** — Export all data as content-addressed JSON for permanent archival via IPFS pinning services
- **Zero Infrastructure** — Runs entirely in the browser with no backend

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Build | Vite 7 |
| P2P | PeerJS (WebRTC) |
| Storage | Dexie (IndexedDB) |
| Identity | Nano wallets (nanocurrency-web) |
| Content Addressing | SHA-256 / CIDv1 |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/     # Navbar, Sidebar, PostCard, VoteButtons, TipButton, etc.
├── pages/          # Home, Communities, Community, Post, Wallet, Network
├── hooks/          # useStore — centralized state management
├── lib/            # Core logic
│   ├── p2p.ts      # WebRTC mesh networking
│   ├── db.ts       # IndexedDB schema & queries
│   ├── wallet.ts   # Nano wallet operations & signing
│   ├── nano-rpc.ts # Nano network RPC client
│   └── ipfs.ts     # Content hashing & IPFS export/import
└── types.ts        # TypeScript interfaces
```

## How P2P Sync Works

1. A new peer joins and broadcasts a `SYNC_REQUEST`
2. Connected peers respond with their full dataset (`SYNC_RESPONSE`)
3. Data is merged locally using content-addressed IDs (no duplicates)
4. New content (posts, comments, votes, tips) is broadcast in real time to all connected peers
5. Peer lists are shared so nodes can discover and connect to more of the mesh

## Nano Integration

- **Identity**: Your Nano address is your identity — no usernames or passwords
- **Signing**: Posts and comments are signed with your Nano private key
- **Tipping**: Send real XNO to content creators directly from the app
- **RPC**: Connects to public Nano nodes for balance checks and block publishing

## Data Portability

Export your entire dataset as JSON from the Network page. This data can be:
- Imported by other peers to bootstrap their local database
- Pinned to IPFS for permanent, decentralized storage
- Used as a backup of your communities, posts, and comments

## License

MIT
