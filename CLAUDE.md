# MoltyNano - Claude Code Project Instructions

## Project Overview
MoltyNano is a fully decentralized P2P forum powered by Nano (XNO) cryptocurrency. No servers, no databases — just browser-to-browser WebRTC connections via BitTorrent tracker signaling (Trystero).

## Tech Stack
- **UI**: React 19, TypeScript 5.9, Tailwind CSS 4
- **Build**: Vite 7
- **P2P**: Trystero (WebRTC via BitTorrent WebSocket trackers)
- **Storage**: Dexie 4 (IndexedDB) with cross-tab BroadcastChannel sync
- **Identity**: nanocurrency-web (Ed25519 signatures, wallet generation)
- **PoW**: nano-pow (WebGPU → WebGL → WASM → CPU fallback)
- **Content Addressing**: SHA-256 CIDv1
- **Testing**: Playwright E2E (36+ tests)
- **Routing**: React Router with HashRouter (`/#/path`)

## Key Architecture

### State Management
All app state flows through `src/hooks/useStore.tsx` which provides:
- `state: AppState` — reactive state
- `createCommunity(name, description)` → Community
- `createPost(title, body, communityId)` → Post
- `createComment(body, postId, parentId)` → Comment
- `castVote(targetId, targetType, value)` → void
- `initWallet(seed?)` — generate or import wallet
- `exportData()` / `importData(json)` — IPFS-compatible JSON
- `connectToPeer(peerId)` — manual peer connection

### Routes
```
/                          → HomePage (feed)
/communities               → CommunitiesPage (list + create)
/c/:name                   → CommunityPage (posts in community)
/c/:name/post/:postId      → PostPage (post detail + comments)
/wallet                    → WalletPage (wallet management)
/network                   → NetworkPage (P2P status + data export/import)
```

### Data Flow
1. User creates content → signed with Ed25519 key → stored in IndexedDB → broadcast to peers
2. Peers receive → verify signature → store in IndexedDB → update React state
3. Cross-tab sync via BroadcastChannel (instant)
4. P2P sync via Trystero (WebRTC, auto-discovery)

### Key Files
- `src/hooks/useStore.tsx` — central state + all actions
- `src/lib/p2p.ts` — Trystero P2P networking, message handling
- `src/lib/db.ts` — Dexie IndexedDB with retry logic and CID verification
- `src/lib/wallet.ts` — Nano wallet ops, signing, verification
- `src/lib/ipfs.ts` — content hashing (SHA-256 CIDv1), export/import
- `src/lib/nano-rpc.ts` — Nano node RPC (balance, send, receive)
- `src/types.ts` — all TypeScript interfaces

### Types
- `Community` — id, name, description, creator, createdAt, cid
- `Post` — id, title, body, author, authorName, communityId, createdAt, cid, signature
- `Comment` — id, body, author, authorName, postId, parentId, createdAt, cid, signature
- `Vote` — id, targetId, targetType, voter, value (1|-1), createdAt
- `Tip` — id, from, to, amountRaw, blockHash, targetId, targetType, createdAt

## Development Commands
```bash
npm run dev          # Start dev server (port 5175)
npm run build        # Production build
npx playwright test  # Run all E2E tests
npx playwright test tests/p2p-content-fetch.spec.ts --headed  # P2P sync tests (3min)
```

## Conventions
- Mobile-first responsive design: use `sm:` breakpoint for desktop enhancements
- All padding responsive: `p-3 sm:p-4` or `p-4 sm:p-6` pattern
- Dark theme: bg-gray-900 cards, bg-gray-950 background, orange-500 accents
- Content overflow: always use `break-words`, `truncate`, or `min-w-0` to prevent mobile overflow
- Community prefix: `m/` (not `r/`)
- All content is cryptographically signed — never skip signature verification
