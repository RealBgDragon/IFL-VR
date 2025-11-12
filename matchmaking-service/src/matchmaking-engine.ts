/**
 * Matchmaking Engine - Core matchmaking logic
 * Extracted from the monolithic Matchmaking.ts to run as independent service
 */

type GameMode = '1v1' | '2v2' | '3v3' | 'ffa' | 'ranked' | 'casual';

interface QueuedPlayer {
    userId: string;
    username: string;
    mmr: number;
    queuedAt: Date;
    gameMode: GameMode;
    partyId?: string;
    rank: string;
}

interface MatchLobby {
    lobbyId: string;
    gameMode: GameMode;
    players: QueuedPlayer[];
    averageMMR: number;
    createdAt: Date;
    status: 'waiting' | 'ready' | 'in_progress' | 'completed';
    maxPlayers: number;
}

interface MMRUpdate {
    userId: string;
    oldMMR: number;
    newMMR: number;
    mmrChange: number;
    newRank: string;
}

export class MatchmakingEngine {
    private queue: Map<GameMode, QueuedPlayer[]>;
    private activeLobbies: Map<string, MatchLobby>;
    private matchHistory: Map<string, MatchLobby>;
    private playerMMR: Map<string, number>; // Cache player MMR
    
    private readonly MMR_SEARCH_RANGE_BASE = 100;
    private readonly MMR_RANGE_EXPANSION_RATE = 50;
    private readonly MAX_MMR_RANGE = 500;
    private readonly MAX_QUEUE_TIME = 120000;
    private readonly TICK_INTERVAL = 2000;
    
    private tickTimer: NodeJS.Timeout | null = null;
    private matchFoundCallback?: (lobby: MatchLobby) => void;
    
    constructor() {
        this.queue = new Map();
        this.activeLobbies = new Map();
        this.matchHistory = new Map();
        this.playerMMR = new Map();
        
        const gameModes: GameMode[] = ['1v1', '2v2', '3v3', 'ffa', 'ranked', 'casual'];
        gameModes.forEach(mode => this.queue.set(mode, []));
    }
    
    start(): void {
        if (this.tickTimer) return;
        
        console.log('[MatchmakingEngine] Started');
        this.tickTimer = setInterval(() => this._tick(), this.TICK_INTERVAL);
    }
    
    stop(): void {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
            console.log('[MatchmakingEngine] Stopped');
        }
    }
    
    onMatchFound(callback: (lobby: MatchLobby) => void): void {
        this.matchFoundCallback = callback;
    }
    
    joinQueue(params: {
        userId: string;
        username: string;
        mmr: number;
        gameMode: GameMode;
        partyId?: string;
    }): { success: boolean; message?: string } {
        const { userId, username, mmr, gameMode, partyId } = params;
        
        if (this._isPlayerInQueue(userId)) {
            return { success: false, message: 'Already in queue' };
        }
        
        const queuedPlayer: QueuedPlayer = {
            userId,
            username,
            mmr,
            queuedAt: new Date(),
            gameMode,
            partyId,
            rank: this._getRankFromMMR(mmr)
        };
        
        const modeQueue = this.queue.get(gameMode);
        if (modeQueue) {
            modeQueue.push(queuedPlayer);
            this.playerMMR.set(userId, mmr);
            console.log(`[MatchmakingEngine] ${username} (MMR: ${mmr}) joined ${gameMode} queue`);
            return { success: true };
        }
        
        return { success: false, message: 'Invalid game mode' };
    }
    
    leaveQueue(userId: string): boolean {
        for (const [mode, players] of this.queue.entries()) {
            const index = players.findIndex(p => p.userId === userId);
            if (index !== -1) {
                const player = players[index];
                players.splice(index, 1);
                this.playerMMR.delete(userId);
                console.log(`[MatchmakingEngine] ${player.username} left ${mode} queue`);
                return true;
            }
        }
        return false;
    }
    
    getQueueStats(gameMode?: GameMode): any {
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
        
        const stats: any[] = [];
        for (const [mode, players] of this.queue.entries()) {
            stats.push({
                gameMode: mode,
                playersInQueue: players.length,
                averageMMR: players.length > 0
                    ? Math.round(players.reduce((sum, p) => sum + p.mmr, 0) / players.length)
                    : 0,
                averageWaitTime: this._getAverageWaitTime(players)
            });
        }
        return stats;
    }
    
    getLobby(lobbyId: string): MatchLobby | undefined {
        return this.activeLobbies.get(lobbyId);
    }
    
    completeMatch(lobbyId: string, results: any[]): MMRUpdate[] {
        const lobby = this.activeLobbies.get(lobbyId);
        if (!lobby) {
            throw new Error('Lobby not found');
        }
        
        lobby.status = 'completed';
        
        const mmrUpdates: MMRUpdate[] = [];
        const totalMMR = lobby.players.reduce((sum, p) => sum + p.mmr, 0);
        
        results.forEach(result => {
            const player = lobby.players.find(p => p.userId === result.user_id);
            if (!player) return;
            
            const opponentMMR = (totalMMR - player.mmr) / (lobby.players.length - 1);
            const oldMMR = player.mmr;
            const newMMR = this._calculateNewMMR(oldMMR, opponentMMR, result.won);
            const mmrChange = newMMR - oldMMR;
            
            this.playerMMR.set(player.userId, newMMR);
            
            mmrUpdates.push({
                userId: player.userId,
                oldMMR,
                newMMR,
                mmrChange,
                newRank: this._getRankFromMMR(newMMR)
            });
        });
        
        this.matchHistory.set(lobbyId, lobby);
        this.activeLobbies.delete(lobbyId);
        
        console.log(`[MatchmakingEngine] Match ${lobbyId} completed`);
        
        return mmrUpdates;
    }
    
    private _tick(): void {
        for (const [gameMode, players] of this.queue.entries()) {
            if (players.length < this._getMinPlayersForMode(gameMode)) {
                continue;
            }
            
            this._processQueue(gameMode, players);
        }
        
        this._cleanupLobbies();
    }
    
    private _processQueue(gameMode: GameMode, players: QueuedPlayer[]): void {
        const maxPlayers = this._getMaxPlayersForMode(gameMode);
        const sortedPlayers = [...players].sort((a, b) => a.mmr - b.mmr);
        
        for (let i = 0; i < sortedPlayers.length; i++) {
            const anchor = sortedPlayers[i];
            const queueTime = Date.now() - anchor.queuedAt.getTime();
            
            if (queueTime > this.MAX_QUEUE_TIME) {
                console.log(`[MatchmakingEngine] ${anchor.username} exceeded max queue time`);
                this.leaveQueue(anchor.userId);
                continue;
            }
            
            const mmrRange = this._calculateMMRRange(queueTime);
            const compatiblePlayers = this._findCompatiblePlayers(
                anchor,
                sortedPlayers.slice(i + 1),
                mmrRange,
                maxPlayers - 1
            );
            
            if (compatiblePlayers.length >= maxPlayers - 1) {
                const matchPlayers = [anchor, ...compatiblePlayers.slice(0, maxPlayers - 1)];
                const lobby = this._createMatch(gameMode, matchPlayers);
                
                matchPlayers.forEach(p => {
                    const idx = players.findIndex(qp => qp.userId === p.userId);
                    if (idx !== -1) players.splice(idx, 1);
                });
                
                if (this.matchFoundCallback) {
                    this.matchFoundCallback(lobby);
                }
            }
        }
    }
    
    private _findCompatiblePlayers(
        anchor: QueuedPlayer,
        candidates: QueuedPlayer[],
        mmrRange: number,
        maxCount: number
    ): QueuedPlayer[] {
        const compatible: QueuedPlayer[] = [];
        
        for (const candidate of candidates) {
            if (compatible.length >= maxCount) break;
            
            const mmrDiff = Math.abs(anchor.mmr - candidate.mmr);
            if (mmrDiff > mmrRange) continue;
            
            if (anchor.partyId && candidate.partyId && anchor.partyId !== candidate.partyId) {
                continue;
            }
            
            compatible.push(candidate);
        }
        
        return compatible;
    }
    
    private _calculateMMRRange(queueTimeMs: number): number {
        const queueTimeSec = queueTimeMs / 1000;
        const expansions = Math.floor(queueTimeSec / 10);
        const range = this.MMR_SEARCH_RANGE_BASE + (expansions * this.MMR_RANGE_EXPANSION_RATE);
        return Math.min(range, this.MAX_MMR_RANGE);
    }
    
    private _createMatch(gameMode: GameMode, players: QueuedPlayer[]): MatchLobby {
        const lobbyId = this._generateLobbyId();
        const averageMMR = Math.round(
            players.reduce((sum, p) => sum + p.mmr, 0) / players.length
        );
        
        const lobby: MatchLobby = {
            lobbyId,
            gameMode,
            players,
            averageMMR,
            createdAt: new Date(),
            status: 'waiting',
            maxPlayers: this._getMaxPlayersForMode(gameMode)
        };
        
        this.activeLobbies.set(lobbyId, lobby);
        
        console.log(
            `[MatchmakingEngine] Created ${gameMode} lobby ${lobbyId} with ${players.length} players (Avg MMR: ${averageMMR})`
        );
        
        return lobby;
    }
    
    private _calculateNewMMR(currentMMR: number, opponentMMR: number, won: boolean): number {
        const K_FACTOR = 32;
        const expectedScore = 1 / (1 + Math.pow(10, (opponentMMR - currentMMR) / 400));
        const actualScore = won ? 1 : 0;
        const mmrChange = Math.round(K_FACTOR * (actualScore - expectedScore));
        return Math.max(0, currentMMR + mmrChange);
    }
    
    private _getRankFromMMR(mmr: number): string {
        if (mmr < 800) return 'Bronze';
        if (mmr < 1200) return 'Silver';
        if (mmr < 1600) return 'Gold';
        if (mmr < 2000) return 'Platinum';
        if (mmr < 2400) return 'Diamond';
        if (mmr < 2800) return 'Master';
        return 'Grandmaster';
    }
    
    private _cleanupLobbies(): void {
        const now = Date.now();
        const LOBBY_TIMEOUT = 600000;
        
        for (const [lobbyId, lobby] of this.activeLobbies.entries()) {
            const age = now - lobby.createdAt.getTime();
            if (age > LOBBY_TIMEOUT && lobby.status !== 'in_progress') {
                console.log(`[MatchmakingEngine] Cleaning up stale lobby ${lobbyId}`);
                this.activeLobbies.delete(lobbyId);
            }
        }
    }
    
    private _getAverageWaitTime(players: QueuedPlayer[]): number {
        if (players.length === 0) return 0;
        const now = Date.now();
        const totalWait = players.reduce((sum, p) => sum + (now - p.queuedAt.getTime()), 0);
        return Math.round(totalWait / players.length / 1000);
    }
    
    private _isPlayerInQueue(userId: string): boolean {
        for (const players of this.queue.values()) {
            if (players.some(p => p.userId === userId)) {
                return true;
            }
        }
        return false;
    }
    
    private _getMinPlayersForMode(mode: GameMode): number {
        const map: Record<GameMode, number> = {
            '1v1': 2, '2v2': 4, '3v3': 6, 'ffa': 4, 'ranked': 2, 'casual': 2
        };
        return map[mode] || 2;
    }
    
    private _getMaxPlayersForMode(mode: GameMode): number {
        const map: Record<GameMode, number> = {
            '1v1': 2, '2v2': 4, '3v3': 6, 'ffa': 8, 'ranked': 2, 'casual': 4
        };
        return map[mode] || 2;
    }
    
    private _generateLobbyId(): string {
        return `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
