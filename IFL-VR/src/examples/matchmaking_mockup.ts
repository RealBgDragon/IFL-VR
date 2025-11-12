/**
 * MATCHMAKING SYSTEM MOCKUP
 * 
 * This file demonstrates how the matchmaking system works with the User class
 * and provides a visual representation of the MMR-based matchmaking flow.
 */

import User from '../components/User';
import MatchmakingSystem, { GameMode } from '../utils/Matchmaking';
import { IUser, IPlayerSettings, IPlayerInventory } from '../utils/mongo_schema';

// ============================================================================
// MOCK DATA SETUP
// ============================================================================

/**
 * Create mock user data for testing
 */
function createMockUserData(username: string, mmrBase: number): {
    userData: IUser,
    settingsData: IPlayerSettings,
    inventoryData: IPlayerInventory
} {
    // Simulate match history to generate MMR
    const matchCount = Math.floor(Math.random() * 20) + 5;
    const matchHistory = [];
    
    for (let i = 0; i < matchCount; i++) {
        matchHistory.push({
            matchId: `match_${i}`,
            result: Math.random() > 0.5 ? 'win' : 'loss',
            goals: Math.floor(Math.random() * 5),
            assists: Math.floor(Math.random() * 3),
            playedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        } as any);
    }
    
    return {
        userData: {
            _id: `user_${username}`,
            username,
            email: `${username}@example.com`,
            password: 'hashed_password'
        } as any,
        settingsData: {
            user: `user_${username}`,
            level: Math.floor(Math.random() * 50) + 1,
            rank: 'Unranked',
            xp: Math.floor(Math.random() * 10000),
            matchHistory
        } as any,
        inventoryData: {
            user: `user_${username}`,
            ownedItems: ['default_skin', 'starter_emote'],
            selectedSkin: 'default_skin',
            emotes: ['wave', 'dance']
        } as any
    };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRankFromMMR(mmr: number): string {
    if (mmr < 800) return 'Bronze';
    if (mmr < 1200) return 'Silver';
    if (mmr < 1600) return 'Gold';
    if (mmr < 2000) return 'Platinum';
    if (mmr < 2400) return 'Diamond';
    if (mmr < 2800) return 'Master';
    return 'Grandmaster';
}

function calculateMMRRange(queueTimeSec: number): number {
    const BASE = 100;
    const EXPANSION = 50;
    const MAX = 500;
    const expansions = Math.floor(queueTimeSec / 10);
    return Math.min(BASE + (expansions * EXPANSION), MAX);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// MATCHMAKING SIMULATION
// ============================================================================

/**
 * Simulate a complete matchmaking scenario
 */
async function simulateMatchmaking() {
    console.log('\n' + '='.repeat(70));
    console.log('VR GAME MATCHMAKING SYSTEM - SIMULATION');
    console.log('='.repeat(70));
    
    // Initialize matchmaking system
    const matchmaking = new MatchmakingSystem();
    matchmaking.start();
    
    // Create test users with varying MMR levels
    const testPlayers = [
        { name: 'ProGamer_VR', mmr: 2100 },
        { name: 'CasualPlayer', mmr: 1050 },
        { name: 'Newbie123', mmr: 850 },
        { name: 'VRMaster', mmr: 2400 },
        { name: 'MidTierPlayer', mmr: 1500 },
        { name: 'RankedGrinder', mmr: 1800 },
        { name: 'WeekendWarrior', mmr: 1200 },
        { name: 'EliteVR', mmr: 2600 }
    ];
    
    const users: User[] = [];
    
    console.log('\n📊 PLAYER POOL');
    console.log('-'.repeat(70));
    
    for (const player of testPlayers) {
        const mockData = createMockUserData(player.name, player.mmr);
        const user = new User(mockData.userData, mockData.settingsData, mockData.inventoryData);
        
        // Override MMR to our test value
        user.settings.mmr = player.mmr;
        user.settings.rank = getRankFromMMR(player.mmr);
        
        users.push(user);
        
        const stats = user.getStats();
        console.log(
            `  ${user.username.padEnd(20)} | MMR: ${user.settings.mmr.toString().padStart(4)} | ` +
            `Rank: ${user.settings.rank.padEnd(12)} | W/L: ${stats.wins}/${stats.losses}`
        );
    }
    
    // Scenario 1: Players join ranked queue
    console.log('\n\n🎮 SCENARIO 1: RANKED 1v1 MATCHMAKING');
    console.log('-'.repeat(70));
    
    const rankedPlayers = [users[0], users[1], users[4], users[5]];
    
    console.log('\n⏳ Players joining ranked queue...');
    for (let i = 0; i < rankedPlayers.length; i++) {
        const user = rankedPlayers[i];
        matchmaking.joinQueue(user, 'ranked');
        console.log(`  [+] ${user.username} (MMR: ${user.settings.mmr}) entered queue`);
        await sleep(500);
    }
    
    // Wait for matchmaking
    await sleep(3000);
    
    console.log('\n📈 Queue Statistics:');
    const rankedStats = matchmaking.getQueueStats('ranked');
    console.log(`  Players in queue: ${rankedStats.playersInQueue}`);
    console.log(`  Average MMR: ${rankedStats.averageMMR}`);
    
    // Scenario 2: MMR Range Expansion Demo
    console.log('\n\n🎮 SCENARIO 2: MMR RANGE EXPANSION');
    console.log('-'.repeat(70));
    console.log('\nDemonstrating how MMR search range expands over time:');
    console.log('  Base range: ±100 MMR');
    console.log('  Expansion: +50 MMR every 10 seconds');
    console.log('  Maximum: ±500 MMR\n');
    
    const timePoints = [0, 10, 20, 30, 40, 60];
    timePoints.forEach(seconds => {
        const range = calculateMMRRange(seconds);
        console.log(`  After ${seconds.toString().padStart(2)}s: ±${range} MMR search range`);
    });
    
    // Scenario 3: Match completion and MMR updates
    console.log('\n\n🎮 SCENARIO 3: MATCH COMPLETION & MMR UPDATES');
    console.log('-'.repeat(70));
    
    const player1 = users[0]; // ProGamer_VR (2100 MMR)
    const player2 = users[4]; // MidTierPlayer (1500 MMR)
    
    console.log('\n🏆 Match Result:');
    console.log(`  ${player1.username} (MMR: ${player1.settings.mmr}) vs ${player2.username} (MMR: ${player2.settings.mmr})`);
    
    const p1InitialMMR = player1.settings.mmr;
    const p2InitialMMR = player2.settings.mmr;
    
    // Simulate match - underdog wins
    player2.recordMatch({
        matchId: 'demo_match_1',
        result: 'win',
        goals: 3,
        assists: 1,
        opponentMMR: player1.settings.mmr
    });
    
    player1.recordMatch({
        matchId: 'demo_match_1',
        result: 'loss',
        goals: 1,
        assists: 0,
        opponentMMR: player2.settings.mmr
    });
    
    console.log('\n  Result: Underdog Victory!');
    console.log(`  ${player2.username} defeats ${player1.username} 3-1`);
    console.log('\n  MMR Changes:');
    console.log(`    ${player1.username}: ${p1InitialMMR} → ${player1.settings.mmr} (${player1.settings.mmr - p1InitialMMR})`);
    console.log(`    ${player2.username}: ${p2InitialMMR} → ${player2.settings.mmr} (+${player2.settings.mmr - p2InitialMMR})`);
    
    // Display updated ranks
    console.log('\n  Updated Ranks:');
    console.log(`    ${player1.username}: ${player1.settings.rank}`);
    console.log(`    ${player2.username}: ${player2.settings.rank}`);
    
    // Scenario 4: Player Statistics
    console.log('\n\n📊 SCENARIO 4: PLAYER STATISTICS');
    console.log('-'.repeat(70));
    
    const demoPlayer = users[0];
    const stats = demoPlayer.getStats();
    
    console.log(`\n  Player: ${demoPlayer.username}`);
    console.log(`  Level: ${demoPlayer.settings.level} | XP: ${demoPlayer.settings.xp}`);
    console.log(`  MMR: ${demoPlayer.settings.mmr} | Rank: ${demoPlayer.settings.rank}`);
    console.log('\n  Match Statistics:');
    console.log(`    Total Matches: ${stats.totalMatches}`);
    console.log(`    Record: ${stats.wins}W - ${stats.losses}L`);
    console.log(`    Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`    Total Goals: ${stats.totalGoals}`);
    console.log(`    Total Assists: ${stats.totalAssists}`);
    console.log(`    Current Streak: ${stats.currentStreak.count} ${stats.currentStreak.type}(s)`);
    
    matchmaking.stop();
    
    console.log('\n' + '='.repeat(70));
    console.log('SIMULATION COMPLETE');
    console.log('='.repeat(70) + '\n');
}

// ============================================================================
// MATCHMAKING FLOW DIAGRAM
// ============================================================================

/**
 * Visual representation of the matchmaking flow
 */
function printMatchmakingFlow() {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                    MATCHMAKING SYSTEM FLOW                         ║
╚════════════════════════════════════════════════════════════════════╝

1. PLAYER JOINS QUEUE
   ┌─────────────┐
   │   Player    │
   │  (User obj) │
   └──────┬──────┘
          │
          ▼
   ┌─────────────────────┐
   │ Select Game Mode    │
   │ - 1v1 Ranked        │
   │ - 2v2 Team          │
   │ - 3v3 Team          │
   │ - FFA (Free-for-all)│
   └──────┬──────────────┘
          │
          ▼
   ┌─────────────────────┐
   │  Join Queue         │
   │  (with MMR: 1500)   │
   └──────┬──────────────┘

2. MATCHMAKING ALGORITHM
          │
          ▼
   ┌─────────────────────────────────────┐
   │  Every 2 seconds (tick):            │
   │  1. Sort players by MMR             │
   │  2. Calculate MMR search range      │
   │     - Base: ±100 MMR                │
   │     - +50 every 10 seconds          │
   │     - Max: ±500 MMR                 │
   │  3. Find compatible players         │
   │  4. Create match if enough players  │
   └──────┬──────────────────────────────┘
          │
          ▼
   ┌─────────────────────┐
   │  Match Found!       │
   │  Players: 2-8       │
   │  Avg MMR: 1520      │
   └──────┬──────────────┘

3. MATCH LOBBY
          │
          ▼
   ┌─────────────────────┐
   │  Create Lobby       │
   │  - Lobby ID         │
   │  - Player list      │
   │  - Average MMR      │
   │  - Status: waiting  │
   └──────┬──────────────┘
          │
          ▼
   ┌─────────────────────┐
   │  Match In Progress  │
   │  Status: in_progress│
   └──────┬──────────────┘

4. MATCH COMPLETION
          │
          ▼
   ┌─────────────────────────────────────┐
   │  Record Results:                    │
   │  - Winner/Loser                     │
   │  - Goals & Assists                  │
   │  - Calculate MMR changes (Elo)      │
   │  - Award XP                         │
   │  - Update player stats              │
   │  - Check for level up               │
   │  - Update rank                      │
   └──────┬──────────────────────────────┘
          │
          ▼
   ┌─────────────────────┐
   │  Save to Database   │
   │  - User settings    │
   │  - Match history    │
   │  - Updated MMR/Rank │
   └─────────────────────┘

╔════════════════════════════════════════════════════════════════════╗
║                         MMR SYSTEM                                 ║
╚════════════════════════════════════════════════════════════════════╝

Rank Tiers (based on MMR):
  Bronze:       0 - 799
  Silver:     800 - 1199
  Gold:      1200 - 1599
  Platinum:  1600 - 1999
  Diamond:   2000 - 2399
  Master:    2400 - 2799
  Grandmaster: 2800+

MMR Calculation (Elo-based):
  - K-Factor: 32
  - Expected Score = 1 / (1 + 10^((OpponentMMR - YourMMR) / 400))
  - MMR Change = K * (ActualScore - ExpectedScore)
  
Example:
  Your MMR: 1500, Opponent MMR: 1700
  Expected Score: 0.24 (24% chance to win)
  If you WIN: +24 MMR (upset bonus!)
  If you LOSE: -8 MMR (expected loss)

╔════════════════════════════════════════════════════════════════════╗
║                    QUEUE EXPANSION EXAMPLE                         ║
╚════════════════════════════════════════════════════════════════════╝

Player with MMR 1500 searching:

Time 0s:   Search range: 1400-1600 (±100)
Time 10s:  Search range: 1350-1650 (±150)
Time 20s:  Search range: 1300-1700 (±200)
Time 30s:  Search range: 1250-1750 (±250)
Time 40s:  Search range: 1200-1800 (±300)
Time 60s:  Search range: 1100-1900 (±400)
Time 80s+: Search range: 1000-2000 (±500 MAX)

This ensures:
  ✓ Fair matches initially
  ✓ Faster queue times for high/low MMR players
  ✓ No one waits forever
`);
}

// ============================================================================
// EXPORT FOR TESTING
// ============================================================================

export {
    simulateMatchmaking,
    printMatchmakingFlow,
    createMockUserData,
    getRankFromMMR,
    calculateMMRRange
};

// Run simulation if executed directly
if (require.main === module) {
    printMatchmakingFlow();
    simulateMatchmaking().catch(console.error);
}
