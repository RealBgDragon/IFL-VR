import User from '../components/User';

/**
 * Represents a player in the matchmaking queue
 */
interface QueuedPlayer {
    user: User;
    queuedAt: Date;
    mmr: number;
    preferredGameMode: GameMode;
    partyId?: string; // For party matchmaking
}

/**
 * Represents a matched game lobby
 */
interface MatchLobby {
    lobbyId: string;
    gameMode: GameMode;
    players: User[];
    averageMMR: number;
    createdAt: Date;
    status: 'waiting' | 'ready' | 'in_progress' | 'completed';
    maxPlayers: number;
}

/**
 * Game modes available for matchmaking
 */
type GameMode = '1v1' | '2v2' | '3v3' | 'ffa' | 'ranked' | 'casual';

/**
 * MMR-based matchmaking system for VR game
 * Uses Elo-like rating system with queue time expansion
 */
class MatchmakingSystem {
    private queue: Map<GameMode, QueuedPlayer[]>;
    private activeLobbies: Map<string, MatchLobby>;
    private matchHistory: Map<string, MatchLobby>;
    
    // Matchmaking configuration
    private readonly MMR_SEARCH_RANGE_BASE = 100; // Initial MMR search range
    private readonly MMR_RANGE_EXPANSION_RATE = 50; // MMR range increase per 10 seconds
    private readonly MAX_MMR_RANGE = 500; // Maximum MMR difference allowed
    private readonly MAX_QUEUE_TIME = 120000; // 2 minutes max queue time
    private readonly TICK_INTERVAL = 2000; // Check for matches every 2 seconds
    
    private tickTimer: NodeJS.Timeout | null = null;
    
    constructor() {
        this.queue = new Map();
        this.activeLobbies = new Map();
        this.matchHistory = new Map();
        
        // Initialize queues for each game mode
        const gameModes: GameMode[] = ['1v1', '2v2', '3v3', 'ffa', 'ranked', 'casual'];
        gameModes.forEach(mode => this.queue.set(mode, []));
    }
    
    /**
     * Start the matchmaking system
     */
    start(): void {
        if (this.tickTimer) return;
        
        console.log('[Matchmaking] System started');
        this.tickTimer = setInterval(() => this._tick(), this.TICK_INTERVAL);
    }
    
    /**
     * Stop the matchmaking system
     */
    stop(): void {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
            console.log('[Matchmaking] System stopped');
        }
    }
    
    /**
     * Add a player to the matchmaking queue
     */
    joinQueue(user: User, gameMode: GameMode, partyId?: string): boolean {
        // Check if player is already in queue
        if (this._isPlayerInQueue(user.userId.toString())) {
            console.log(`[Matchmaking] Player ${user.username} is already in queue`);
            return false;
        }
        
        // Check if player is in an active match
        if (user.currentMatchId) {
            console.log(`[Matchmaking] Player ${user.username} is in an active match`);
            return false;
        }
        
        const queuedPlayer: QueuedPlayer = {
            user,
            queuedAt: new Date(),
            mmr: user.settings.mmr,
            preferredGameMode: gameMode,
            partyId
        };
        
        const modeQueue = this.queue.get(gameMode);
        if (modeQueue) {
            modeQueue.push(queuedPlayer);
            console.log(`[Matchmaking] ${user.username} (MMR: ${user.settings.mmr}) joined ${gameMode} queue`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Remove a player from the queue
     */
    leaveQueue(userId: string): boolean {
        for (const [mode, players] of this.queue.entries()) {
            const index = players.findIndex(p => p.user.userId.toString() === userId);
            if (index !== -1) {
                const player = players[index];
                players.splice(index, 1);
                console.log(`[Matchmaking] ${player.user.username} left ${mode} queue`);
                return true;
            }
        }
        return false;
    }
    
    /**
     * Main matchmaking tick - runs periodically to create matches
     */
    private _tick(): void {
        for (const [gameMode, players] of this.queue.entries()) {
            if (players.length < this._getMinPlayersForMode(gameMode)) {
                continue;
            }
            
            // Try to create matches for this game mode
            this._processQueue(gameMode, players);
        }
        
        // Clean up old lobbies
        this._cleanupLobbies();
    }
    
    /**
     * Process a queue and create matches
     */
    private _processQueue(gameMode: GameMode, players: QueuedPlayer[]): void {
        const maxPlayers = this._getMaxPlayersForMode(gameMode);
        const sortedPlayers = [...players].sort((a, b) => a.mmr - b.mmr);
        
        for (let i = 0; i < sortedPlayers.length; i++) {
            const anchor = sortedPlayers[i];
            const queueTime = Date.now() - anchor.queuedAt.getTime();
            
            // Skip if player waited too long
            if (queueTime > this.MAX_QUEUE_TIME) {
                console.log(`[Matchmaking] ${anchor.user.username} exceeded max queue time`);
                this.leaveQueue(anchor.user.userId.toString());
                continue;
            }
            
            // Calculate dynamic MMR range based on queue time
            const mmrRange = this._calculateMMRRange(queueTime);
            
            // Find compatible players
            const compatiblePlayers = this._findCompatiblePlayers(
                anchor,
                sortedPlayers.slice(i + 1),
                mmrRange,
                maxPlayers - 1
            );
            
            // Create match if we have enough players
            if (compatiblePlayers.length >= maxPlayers - 1) {
                const matchPlayers = [anchor, ...compatiblePlayers.slice(0, maxPlayers - 1)];
                this._createMatch(gameMode, matchPlayers);
                
                // Remove matched players from queue
                matchPlayers.forEach(p => {
                    const idx = players.findIndex(qp => qp.user.userId.toString() === p.user.userId.toString());
                    if (idx !== -1) players.splice(idx, 1);
                });
            }
        }
    }
    
    /**
     * Find players compatible with the anchor player
     */
    private _findCompatiblePlayers(
        anchor: QueuedPlayer,
        candidates: QueuedPlayer[],
        mmrRange: number,
        maxCount: number
    ): QueuedPlayer[] {
        const compatible: QueuedPlayer[] = [];
        
        for (const candidate of candidates) {
            if (compatible.length >= maxCount) break;
            
            // Check MMR compatibility
            const mmrDiff = Math.abs(anchor.mmr - candidate.mmr);
            if (mmrDiff > mmrRange) continue;
            
            // Check party compatibility (same party or no party)
            if (anchor.partyId && candidate.partyId && anchor.partyId !== candidate.partyId) {
                continue;
            }
            
            compatible.push(candidate);
        }
        
        return compatible;
    }
    
    /**
     * Calculate MMR search range based on queue time
     */
    private _calculateMMRRange(queueTimeMs: number): number {
        const queueTimeSec = queueTimeMs / 1000;
        const expansions = Math.floor(queueTimeSec / 10); // Expand every 10 seconds
        const range = this.MMR_SEARCH_RANGE_BASE + (expansions * this.MMR_RANGE_EXPANSION_RATE);
        return Math.min(range, this.MAX_MMR_RANGE);
    }
    
    /**
     * Create a match lobby
     */
    private _createMatch(gameMode: GameMode, players: QueuedPlayer[]): MatchLobby {
        const lobbyId = this._generateLobbyId();
        const users = players.map(p => p.user);
        const averageMMR = Math.round(
            players.reduce((sum, p) => sum + p.mmr, 0) / players.length
        );
        
        const lobby: MatchLobby = {
            lobbyId,
            gameMode,
            players: users,
            averageMMR,
            createdAt: new Date(),
            status: 'waiting',
            maxPlayers: this._getMaxPlayersForMode(gameMode)
        };
        
        this.activeLobbies.set(lobbyId, lobby);
        
        // Update player match IDs
        users.forEach(user => {
            user.currentMatchId = lobbyId;
        });
        
        console.log(
            `[Matchmaking] Created ${gameMode} lobby ${lobbyId} with ${users.length} players (Avg MMR: ${averageMMR})`
        );
        console.log(`  Players: ${users.map(u => `${u.username}(${u.settings.mmr})`).join(', ')}`);
        
        return lobby;
    }
    
    /**
     * Get lobby by ID
     */
    getLobby(lobbyId: string): MatchLobby | undefined {
        return this.activeLobbies.get(lobbyId);
    }
    
    /**
     * Complete a match and record results
     */
    completeMatch(lobbyId: string, results: Map<string, { won: boolean; goals: number; assists: number }>): void {
        const lobby = this.activeLobbies.get(lobbyId);
        if (!lobby) return;
        
        lobby.status = 'completed';
        
        // Calculate team average MMR for each player's opponent
        const totalMMR = lobby.players.reduce((sum, p) => sum + p.settings.mmr, 0);
        
        // Record match for each player
        lobby.players.forEach(player => {
            const result = results.get(player.userId.toString());
            if (!result) return;
            
            // Opponent MMR is average of all other players
            const opponentMMR = (totalMMR - player.settings.mmr) / (lobby.players.length - 1);
            
            player.recordMatch({
                matchId: lobbyId,
                result: result.won ? 'win' : 'loss',
                goals: result.goals,
                assists: result.assists,
                opponentMMR
            });
            
            player.currentMatchId = null;
        });
        
        // Move to history
        this.matchHistory.set(lobbyId, lobby);
        this.activeLobbies.delete(lobbyId);
        
        console.log(`[Matchmaking] Match ${lobbyId} completed`);
    }
    
    /**
     * Clean up old lobbies
     */
    private _cleanupLobbies(): void {
        const now = Date.now();
        const LOBBY_TIMEOUT = 600000; // 10 minutes
        
        for (const [lobbyId, lobby] of this.activeLobbies.entries()) {
            const age = now - lobby.createdAt.getTime();
            if (age > LOBBY_TIMEOUT && lobby.status !== 'in_progress') {
                console.log(`[Matchmaking] Cleaning up stale lobby ${lobbyId}`);
                lobby.players.forEach(p => p.currentMatchId = null);
                this.activeLobbies.delete(lobbyId);
            }
        }
    }
    
    /**
     * Get queue statistics
     */
    getQueueStats(gameMode?: GameMode) {
        if (gameMode) {
            const players = this.queue.get(gameMode) || [];
            return {
                gameMode,
                playersInQueue: players.length,
                averageMMR: players.length > 0
                    ? Math.round(players.reduce((sum, p) => sum + p.mmr, 0) / players.length)
                    : 0,
                averageWaitTime: this._getAverageWaitTime(players)
            };
        }
        
        // All queues
        const stats: any = {};
        for (const [mode, players] of this.queue.entries()) {
            stats[mode] = {
                playersInQueue: players.length,
                averageMMR: players.length > 0
                    ? Math.round(players.reduce((sum, p) => sum + p.mmr, 0) / players.length)
                    : 0,
                averageWaitTime: this._getAverageWaitTime(players)
            };
        }
        return stats;
    }
    
    /**
     * Get average wait time for players in queue
     */
    private _getAverageWaitTime(players: QueuedPlayer[]): number {
        if (players.length === 0) return 0;
        const now = Date.now();
        const totalWait = players.reduce((sum, p) => sum + (now - p.queuedAt.getTime()), 0);
        return Math.round(totalWait / players.length / 1000); // Return in seconds
    }
    
    /**
     * Check if player is in any queue
     */
    private _isPlayerInQueue(userId: string): boolean {
        for (const players of this.queue.values()) {
            if (players.some(p => p.user.userId.toString() === userId)) {
                return true;
            }
        }
        return false;
    }
    
    /**
     * Get minimum players required for a game mode
     */
    private _getMinPlayersForMode(mode: GameMode): number {
        switch (mode) {
            case '1v1': return 2;
            case '2v2': return 4;
            case '3v3': return 6;
            case 'ffa': return 4;
            case 'ranked': return 2;
            case 'casual': return 2;
            default: return 2;
        }
    }
    
    /**
     * Get maximum players for a game mode
     */
    private _getMaxPlayersForMode(mode: GameMode): number {
        switch (mode) {
            case '1v1': return 2;
            case '2v2': return 4;
            case '3v3': return 6;
            case 'ffa': return 8;
            case 'ranked': return 2;
            case 'casual': return 4;
            default: return 2;
        }
    }
    
    /**
     * Generate unique lobby ID
     */
    private _generateLobbyId(): string {
        return `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export default MatchmakingSystem;
export { QueuedPlayer, MatchLobby, GameMode };
