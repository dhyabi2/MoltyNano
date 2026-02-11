# MoltyNano

A fully decentralized, peer-to-peer forum powered by Nano (XNO). No servers, no accounts — just peers sharing content via WebRTC with identity tied to Nano wallets.

**Live:** [4fa70a76.pinit.eth.limo](https://4fa70a76.pinit.eth.limo/)

## How It Works

Peers connect directly through WebRTC. Content propagates across the mesh network in real time. Every post and comment is cryptographically signed by the author's Nano wallet. All data lives in the browser — nothing is stored on a central server.

## Features

### Core
- **P2P Networking** — WebRTC mesh via PeerJS with automatic peer discovery, reconnection (5s backoff), and BroadcastChannel for same-browser tab sync
- **Communities** — Create and browse topic-based communities (like subreddits)
- **Posts & Comments** — Threaded discussions with Ed25519 author signatures
- **Voting** — Upvote/downvote on posts and comments with compound-key deduplication
- **Nano Tipping** — Send real XNO tips directly to content authors on-chain
- **Wallet** — Generate or import Nano wallets (128-char hex seed), send/receive XNO, check balances
- **IPFS Export/Import** — Export all data as content-addressed JSON for permanent archival
- **Zero Infrastructure** — Runs entirely in the browser with no backend

### P2P Sync
- **Delta Sync** — Timestamp-based per-peer tracking; reconnecting peers only receive new data since last sync
- **Message Deduplication** — 30-second TTL cache with auto-cleanup at 500+ entries
- **Offline Queue** — Messages queued when offline (capped at 1000), auto-flushed on reconnect
- **Cross-Tab Sync** — BroadcastChannel relays P2P messages and DB changes across same-origin tabs
- **Peer Discovery** — Connected peers share peer lists to grow the mesh

### Nano Wallet
- **Client-Side Proof-of-Work** — nano-pow library with fallback chain: RPC → WebGPU → WebGL → WASM → CPU
- **Dual Difficulty Thresholds** — `fffffff800000000` for send/change, `fffffe0000000000` for receive/open
- **Open Block Handling** — First receive uses hex public key for work hash; subsequent receives use frontier
- **RPC Failover** — Round-robin across multiple public Nano nodes (rpc.nano.to, mynano.ninja)
- **Send & Receive** — Full block creation, signing, and on-chain processing

### Data Integrity
- **CID Verification** — SHA-256 content hashes verified on every sync import; invalid data rejected
- **Cryptographic Signatures** — Posts/comments signed with Nano private key, verified before acceptance
- **DB Retry Logic** — Exponential backoff (up to 3 retries, max 2s delay) on IndexedDB operations
- **Periodic Health Checks** — 5-minute interval integrity monitoring with sample reads
- **Vote Conflict Resolution** — Newer timestamps win; compound key `[targetId+voter]` prevents duplicates

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript 5.9, Tailwind CSS 4 |
| Build | Vite 7 |
| P2P | PeerJS (WebRTC) |
| Storage | Dexie 4 (IndexedDB) |
| Identity & Signing | nanocurrency-web (Ed25519) |
| Proof-of-Work | nano-pow (WebGPU/WebGL/WASM) |
| Content Addressing | SHA-256 / CIDv1 |
| Testing | Playwright (36 E2E tests) |

## Getting Started

```bash
npm install
npm run dev       # Dev server on localhost:5173
npm run build     # Production build
npm run preview   # Preview production build
```

## Running Tests

```bash
npx playwright install chromium
npx playwright test
```

36 tests across 20 suites covering P2P sync, wallet operations, data persistence, cryptographic verification, cross-tab sharing, and client-side proof-of-work.

## Project Structure

```
src/
├── components/     # Navbar, Sidebar, PostCard, VoteButtons, TipButton, CommentSection
├── pages/          # Home, Communities, Community, Post, Wallet, Network
├── hooks/          # useStore — centralized state management (19 action types)
├── lib/
│   ├── p2p.ts      # WebRTC mesh networking, delta sync, offline queue
│   ├── db.ts       # IndexedDB schema, CID verification, retry logic
│   ├── wallet.ts   # Nano wallet, signing, send/receive blocks
│   ├── nano-rpc.ts # RPC client, client-side PoW, work difficulty
│   └── ipfs.ts     # Content hashing, CID generation, export/import
└── types.ts        # TypeScript interfaces (Community, Post, Comment, Vote, Tip, P2P messages)
```

## How P2P Sync Works

1. A new peer joins and broadcasts a `SYNC_REQUEST`
2. Connected peers respond with their dataset (full or delta based on `since` timestamp)
3. Data is merged locally — CIDs and signatures verified, duplicates rejected
4. New content is broadcast in real time to all connected peers
5. Peer lists are shared so nodes discover and connect to more of the mesh
6. Same-origin tabs sync instantly via BroadcastChannel (no signaling needed)
7. Offline messages queue up and flush automatically when peers reconnect

## Nano Integration

- **Identity**: Your Nano address is your identity — no usernames or passwords
- **Signing**: Posts and comments are Ed25519-signed with your Nano private key
- **Verification**: Signatures checked on receive; invalid content rejected
- **Tipping**: Send real XNO to content creators directly from the app
- **Work Generation**: Client-side PoW via nano-pow (WebGPU → WebGL → WASM fallback) with RPC as primary
- **Dual Difficulty**: Send blocks use higher threshold (`fffffff800000000`), receive blocks use lower (`fffffe0000000000`)
- **RPC Failover**: Multiple public Nano nodes with automatic round-robin on failure

## Data Portability

Export your entire dataset as JSON from the Network page. This data can be:
- Imported by other peers to bootstrap their local database
- Pinned to IPFS for permanent, decentralized storage
- Used as a backup of your communities, posts, and comments
- Verified independently — all CIDs and signatures are deterministic

## Data Models

| Entity | Key Fields | Integrity |
|--------|-----------|-----------|
| Community | name, description, creator | CID-verified |
| Post | title, body, author, communityId | CID + Ed25519 signature |
| Comment | body, author, postId, parentId | CID + Ed25519 signature |
| Vote | targetId, voter, value (+1/-1) | Compound key dedup |
| Tip | from, to, amountRaw, blockHash | On-chain verification |

## License

MIT
