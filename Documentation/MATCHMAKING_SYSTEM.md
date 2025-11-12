# VR Game Matchmaking System

## Overview

This document describes the matchmaking and user management system for the IFL-VR game. The system consists of three main components:

1. **User Class** - Bridges in-game Player entities with persistent MongoDB data
2. **Matchmaking System** - MMR-based matchmaking with dynamic queue expansion
3. **MongoDB Schema** - Persistent storage for user data, settings, and match history

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Game Client (VR)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Player     │  │     User     │  │  Matchmaking │     │
│  │  (Physics)   │◄─┤  (Bridge)    │◄─┤    System    │     │
│  └──────────────┘  └──────┬───────┘  └──────────────┘     │
└────────────────────────────┼────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      MongoDB Database                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │     User     │  │PlayerSettings│  │   Inventory  │     │
│  │  (Auth)      │  │  (Stats/MMR) │  │  (Items)     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## User Class

**Location:** `src/components/User.ts`

The `User` class serves as a bridge between the in-game `Player` entity (which handles physics and movement) and the persistent MongoDB data (which stores user settings, stats, and inventory).

### Key Features

- **Player Integration**: Creates and manages a `Player` instance for in-game physics
- **Settings Management**: Level, XP, MMR, rank, and match history
- **Inventory System**: Owned items, equipped skins, and emotes
- **Statistics Tracking**: Win rate, goals, assists, streaks
- **MMR Calculation**: Elo-based rating system for competitive matchmaking

### Usage Example

```typescript
import User from './components/User';
import { User as UserModel, PlayerSettings, PlayerInventory } from './utils/mongo_schema';

// Load user from database
const userData = await UserModel.findOne({ username: 'ProGamer_VR' });
const settingsData = await PlayerSettings.findOne({ user: userData._id });
const inventoryData = await PlayerInventory.findOne({ user: userData._id });

// Create User instance
const user = new User(userData, settingsData, inventoryData);

// Access in-game player
user.player.move('forward', 0.016, true); // Sprint forward
user.player.jump();

// Record match result
user.recordMatch({
    matchId: 'match_123',
    result: 'win',
    goals: 3,
    assists: 2,
    opponentMMR: 1600
});

// Check stats
const stats = user.getStats();
console.log(`Win Rate: ${stats.winRate}%`);
console.log(`MMR: ${user.settings.mmr}`);
console.log(`Rank: ${user.settings.rank}`);
```

### Key Methods

- `updateMMR(won, opponentMMR)` - Update MMR using Elo algorithm
- `addXP(amount)` - Add experience points and handle level ups
- `recordMatch(matchData)` - Record match result and update stats
- `getStats()` - Get comprehensive player statistics
- `equipItem(itemId)` - Equip a skin or item
- `toNetworkData()` - Serialize for network transmission
- `toMongoUpdate()` - Serialize for database updates

---

## Matchmaking System

**Location:** `src/utils/Matchmaking.ts`

The matchmaking system uses an MMR-based (Elo) algorithm with dynamic queue expansion to create fair matches while minimizing wait times.

### Key Features

- **Multiple Game Modes**: 1v1, 2v2, 3v3, FFA, Ranked, Casual
- **MMR-Based Matching**: Uses Elo rating system for fair matches
- **Dynamic Queue Expansion**: Search range expands over time
- **Party Support**: Players can queue together
- **Lobby Management**: Tracks active matches and history

### Matchmaking Algorithm

1. **Initial Search**: ±100 MMR range
2. **Time-Based Expansion**: +50 MMR every 10 seconds
3. **Maximum Range**: ±500 MMR (prevents unfair matches)
4. **Maximum Wait**: 2 minutes before timeout

### MMR Calculation (Elo-based)

```
Expected Score = 1 / (1 + 10^((OpponentMMR - YourMMR) / 400))
MMR Change = K-Factor × (Actual Score - Expected Score)
```

- **K-Factor**: 32 (standard Elo)
- **Base MMR**: 1000 (new players)
- **Minimum MMR**: 0 (cannot go negative)

### Rank Tiers

| Rank         | MMR Range    |
|--------------|--------------|
| Bronze       | 0 - 799      |
| Silver       | 800 - 1199   |
| Gold         | 1200 - 1599  |
| Platinum     | 1600 - 1999  |
| Diamond      | 2000 - 2399  |
| Master       | 2400 - 2799  |
| Grandmaster  | 2800+        |

### Usage Example

```typescript
import MatchmakingSystem from './utils/Matchmaking';

// Initialize system
const matchmaking = new MatchmakingSystem();
matchmaking.start();

// Player joins queue
matchmaking.joinQueue(user, 'ranked');

// Check queue stats
const stats = matchmaking.getQueueStats('ranked');
console.log(`Players in queue: ${stats.playersInQueue}`);
console.log(`Average MMR: ${stats.averageMMR}`);

// Complete a match
const results = new Map();
results.set(player1.userId.toString(), { won: true, goals: 3, assists: 1 });
results.set(player2.userId.toString(), { won: false, goals: 1, assists: 0 });
matchmaking.completeMatch(lobbyId, results);

// Stop system
matchmaking.stop();
```

### Key Methods

- `start()` - Start the matchmaking tick system
- `stop()` - Stop the matchmaking system
- `joinQueue(user, gameMode, partyId?)` - Add player to queue
- `leaveQueue(userId)` - Remove player from queue
- `getLobby(lobbyId)` - Get lobby information
- `completeMatch(lobbyId, results)` - Record match completion
- `getQueueStats(gameMode?)` - Get queue statistics

---

## MongoDB Schema

**Location:** `src/utils/mongo_schema.ts`

### Collections

#### 1. User (Authentication)

```typescript
{
  username: string;      // Unique username
  password: string;      // Hashed password
  email: string;         // Unique email
  createdAt: Date;       // Auto-generated
  updatedAt: Date;       // Auto-generated
}
```

#### 2. PlayerSettings (Stats & Progression)

```typescript
{
  user: ObjectId;        // Reference to User
  level: number;         // Player level (default: 1)
  rank: string;          // Current rank (default: "Unranked")
  xp: number;            // Experience points (default: 0)
  mmr: number;           // Matchmaking rating (default: 1000)
  matchHistory: [{
    matchId: string;
    result: "win" | "loss";
    goals: number;
    assists: number;
    playedAt: Date;
  }];
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3. PlayerInventory (Items & Customization)

```typescript
{
  user: ObjectId;        // Reference to User
  ownedItems: string[];  // Array of item IDs
  selectedSkin: string;  // Currently equipped skin
  emotes: string[];      // Owned emotes
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes

- `User.username` - Unique index for fast lookups
- `User.email` - Unique index for authentication
- `PlayerSettings.user` - Index for user queries
- `PlayerSettings.mmr` - Index for matchmaking queries
- `PlayerInventory.user` - Index for user queries

---

## Matchmaking Flow

```
1. Player Joins Queue
   ↓
2. System Ticks Every 2 Seconds
   ↓
3. Sort Players by MMR
   ↓
4. Calculate Dynamic MMR Range
   ↓
5. Find Compatible Players
   ↓
6. Create Match Lobby (if enough players)
   ↓
7. Match In Progress
   ↓
8. Match Completes
   ↓
9. Calculate MMR Changes
   ↓
10. Update Player Stats
    ↓
11. Save to Database
```

---

## MMR Examples

### Example 1: Even Match

- **Player A**: 1500 MMR
- **Player B**: 1500 MMR
- **Expected Score**: 50% each
- **Result**: A wins
- **MMR Change**: A +16, B -16

### Example 2: Upset Victory

- **Player A**: 1200 MMR (underdog)
- **Player B**: 1800 MMR (favorite)
- **Expected Score**: A 15%, B 85%
- **Result**: A wins (upset!)
- **MMR Change**: A +27, B -27

### Example 3: Expected Victory

- **Player A**: 2000 MMR (favorite)
- **Player B**: 1400 MMR (underdog)
- **Expected Score**: A 91%, B 9%
- **Result**: A wins (expected)
- **MMR Change**: A +3, B -3

---

## Queue Expansion Example

Player with 1500 MMR searching:

| Time  | MMR Range     | Search Window |
|-------|---------------|---------------|
| 0s    | 1400-1600     | ±100          |
| 10s   | 1350-1650     | ±150          |
| 20s   | 1300-1700     | ±200          |
| 30s   | 1250-1750     | ±250          |
| 40s   | 1200-1800     | ±300          |
| 60s   | 1100-1900     | ±400          |
| 80s+  | 1000-2000     | ±500 (MAX)    |

---

## Testing & Mockup

**Location:** `src/examples/matchmaking_mockup.ts`

Run the matchmaking simulation to see the system in action:

```bash
npm run start
```

The mockup demonstrates:
- Player pool creation with varying MMR levels
- Queue joining and matchmaking
- MMR range expansion over time
- Match completion and MMR updates
- Player statistics and progression

---

## Configuration

### Matchmaking Constants

```typescript
MMR_SEARCH_RANGE_BASE = 100;      // Initial search range
MMR_RANGE_EXPANSION_RATE = 50;    // Expansion per 10 seconds
MAX_MMR_RANGE = 500;               // Maximum search range
MAX_QUEUE_TIME = 120000;           // 2 minutes
TICK_INTERVAL = 2000;              // Check every 2 seconds
```

### MMR Constants

```typescript
BASE_MMR = 1000;                   // Starting MMR
K_FACTOR = 32;                     // Elo K-factor
WIN_MMR = 25;                      // Simple win bonus
LOSS_MMR = -20;                    // Simple loss penalty
```

### XP System

```typescript
XP_FOR_LEVEL = 100 × 1.5^(level-1)  // Exponential curve
BASE_XP_WIN = 100;                   // XP for winning
BASE_XP_LOSS = 50;                   // XP for losing
GOAL_XP = 10;                        // XP per goal
ASSIST_XP = 5;                       // XP per assist
```

---

## Future Enhancements

### Potential Features

1. **Party Matchmaking**: Full party system with team MMR
2. **Seasonal Rankings**: Reset ranks each season
3. **Placement Matches**: Initial calibration matches
4. **MMR Decay**: Reduce MMR for inactive players
5. **Leaderboards**: Global and regional rankings
6. **Anti-Smurf Detection**: Detect and handle smurfs
7. **Report System**: Player reporting and moderation
8. **Replay System**: Save and review matches
9. **Tournament Mode**: Bracket-based competitions
10. **Custom Games**: Private lobbies with custom rules

### Database Optimizations

- Add compound indexes for complex queries
- Implement caching layer (Redis)
- Archive old match history
- Shard by region for global scaling

---

## Integration Guide

### Step 1: Initialize Database Connection

```typescript
import mongoose from 'mongoose';

await mongoose.connect('mongodb://localhost:27017/ifl-vr');
```

### Step 2: Create User Account

```typescript
import { User, PlayerSettings, PlayerInventory } from './utils/mongo_schema';

const user = await User.create({
    username: 'NewPlayer',
    email: 'player@example.com',
    password: hashedPassword
});

const settings = await PlayerSettings.create({
    user: user._id
});

const inventory = await PlayerInventory.create({
    user: user._id
});
```

### Step 3: Load User in Game

```typescript
import User from './components/User';

const userData = await User.findById(userId);
const settingsData = await PlayerSettings.findOne({ user: userId });
const inventoryData = await PlayerInventory.findOne({ user: userId });

const gameUser = new User(userData, settingsData, inventoryData);
```

### Step 4: Start Matchmaking

```typescript
import MatchmakingSystem from './utils/Matchmaking';

const matchmaking = new MatchmakingSystem();
matchmaking.start();

// Join queue
matchmaking.joinQueue(gameUser, 'ranked');
```

### Step 5: Handle Match Completion

```typescript
// After match ends
const results = new Map();
results.set(player1.userId.toString(), {
    won: true,
    goals: 3,
    assists: 2
});

matchmaking.completeMatch(lobbyId, results);

// Save to database
await PlayerSettings.findOneAndUpdate(
    { user: player1.userId },
    player1.toMongoUpdate().settings
);
```

---

## Notes

- This is a **sketch/prototype** system - production use requires additional error handling, validation, and security measures
- TypeScript errors regarding `mongoose`, `NodeJS`, and string methods can be resolved by:
  - Installing `@types/node`: `npm install --save-dev @types/node`
  - Updating `tsconfig.json` to target ES2017+ and include node types
- The system is designed to be modular and extensible
- MMR calculations use standard Elo formulas but can be customized
- Queue expansion ensures players don't wait indefinitely while maintaining match quality

---

## Contact & Support

For questions or contributions, please refer to the project repository.
