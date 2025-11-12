/**
 * Matchmaking gRPC Client
 * 
 * Client for the game service to communicate with the matchmaking microservice via gRPC
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { EventEmitter } from 'events';

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../../proto/matchmaking.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const matchmakingProto = grpc.loadPackageDefinition(packageDefinition).matchmaking as any;

/**
 * Matchmaking Client - Communicates with matchmaking service via gRPC
 */
export class MatchmakingClient extends EventEmitter {
    private client: any;
    private matchStream: any = null;
    private connected: boolean = false;
    
    constructor(host: string = 'localhost:50051') {
        super();
        
        this.client = new matchmakingProto.MatchmakingService(
            host,
            grpc.credentials.createInsecure()
        );
        
        this.connected = true;
        console.log(`[MatchmakingClient] Connected to matchmaking service at ${host}`);
    }
    
    /**
     * Join matchmaking queue
     */
    async joinQueue(params: {
        userId: string;
        username: string;
        mmr: number;
        gameMode: string;
        partyId?: string;
    }): Promise<{ success: boolean; message: string; queuedAt?: number }> {
        return new Promise((resolve, reject) => {
            const request = {
                user_id: params.userId,
                username: params.username,
                mmr: params.mmr,
                game_mode: this._mapGameMode(params.gameMode),
                party_id: params.partyId
            };
            
            this.client.JoinQueue(request, (error: any, response: any) => {
                if (error) {
                    console.error('[MatchmakingClient] JoinQueue error:', error);
                    reject(error);
                    return;
                }
                
                resolve({
                    success: response.success,
                    message: response.message,
                    queuedAt: response.queued_at
                });
            });
        });
    }
    
    /**
     * Leave matchmaking queue
     */
    async leaveQueue(userId: string): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve, reject) => {
            this.client.LeaveQueue({ user_id: userId }, (error: any, response: any) => {
                if (error) {
                    console.error('[MatchmakingClient] LeaveQueue error:', error);
                    reject(error);
                    return;
                }
                
                resolve({
                    success: response.success,
                    message: response.message
                });
            });
        });
    }
    
    /**
     * Get queue statistics
     */
    async getQueueStatus(gameMode?: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const request = gameMode ? { game_mode: this._mapGameMode(gameMode) } : {};
            
            this.client.GetQueueStatus(request, (error: any, response: any) => {
                if (error) {
                    console.error('[MatchmakingClient] GetQueueStatus error:', error);
                    reject(error);
                    return;
                }
                
                resolve(response.queue_stats || []);
            });
        });
    }
    
    /**
     * Get lobby information
     */
    async getLobby(lobbyId: string): Promise<any | null> {
        return new Promise((resolve, reject) => {
            this.client.GetLobby({ lobby_id: lobbyId }, (error: any, response: any) => {
                if (error) {
                    console.error('[MatchmakingClient] GetLobby error:', error);
                    reject(error);
                    return;
                }
                
                resolve(response.found ? response.lobby : null);
            });
        });
    }
    
    /**
     * Complete a match
     */
    async completeMatch(lobbyId: string, results: Array<{
        userId: string;
        won: boolean;
        goals: number;
        assists: number;
    }>): Promise<{ success: boolean; message: string; mmrUpdates: any[] }> {
        return new Promise((resolve, reject) => {
            const request = {
                lobby_id: lobbyId,
                results: results.map(r => ({
                    user_id: r.userId,
                    won: r.won,
                    goals: r.goals,
                    assists: r.assists
                }))
            };
            
            this.client.CompleteMatch(request, (error: any, response: any) => {
                if (error) {
                    console.error('[MatchmakingClient] CompleteMatch error:', error);
                    reject(error);
                    return;
                }
                
                resolve({
                    success: response.success,
                    message: response.message,
                    mmrUpdates: response.mmr_updates || []
                });
            });
        });
    }
    
    /**
     * Start streaming match updates
     */
    streamMatchUpdates(userId: string): void {
        if (this.matchStream) {
            console.warn('[MatchmakingClient] Stream already active');
            return;
        }
        
        this.matchStream = this.client.StreamMatchUpdates({ user_id: userId });
        
        this.matchStream.on('data', (update: any) => {
            console.log(`[MatchmakingClient] Match update:`, update.type);
            
            switch (update.type) {
                case 'QUEUED':
                    this.emit('queued', update);
                    break;
                case 'SEARCHING':
                    this.emit('searching', update);
                    break;
                case 'MATCH_FOUND':
                    this.emit('matchFound', update.lobby);
                    break;
                case 'LOBBY_READY':
                    this.emit('lobbyReady', update.lobby);
                    break;
                case 'MATCH_STARTED':
                    this.emit('matchStarted', update);
                    break;
                case 'MATCH_CANCELLED':
                    this.emit('matchCancelled', update);
                    break;
                default:
                    this.emit('update', update);
            }
        });
        
        this.matchStream.on('error', (error: any) => {
            console.error('[MatchmakingClient] Stream error:', error);
            this.emit('error', error);
            this.matchStream = null;
        });
        
        this.matchStream.on('end', () => {
            console.log('[MatchmakingClient] Stream ended');
            this.emit('streamEnded');
            this.matchStream = null;
        });
    }
    
    /**
     * Stop streaming match updates
     */
    stopStreamMatchUpdates(): void {
        if (this.matchStream) {
            this.matchStream.cancel();
            this.matchStream = null;
        }
    }
    
    /**
     * Check if connected to matchmaking service
     */
    isConnected(): boolean {
        return this.connected;
    }
    
    /**
     * Close connection
     */
    close(): void {
        this.stopStreamMatchUpdates();
        if (this.client) {
            grpc.closeClient(this.client);
            this.connected = false;
            console.log('[MatchmakingClient] Disconnected from matchmaking service');
        }
    }
    
    /**
     * Map internal game mode to proto enum
     */
    private _mapGameMode(mode: string): string {
        const mapping: Record<string, string> = {
            '1v1': 'ONE_V_ONE',
            '2v2': 'TWO_V_TWO',
            '3v3': 'THREE_V_THREE',
            'ffa': 'FFA',
            'ranked': 'RANKED',
            'casual': 'CASUAL'
        };
        return mapping[mode] || 'RANKED';
    }
}

/**
 * Singleton instance for easy access
 */
let matchmakingClient: MatchmakingClient | null = null;

export function getMatchmakingClient(host?: string): MatchmakingClient {
    if (!matchmakingClient) {
        matchmakingClient = new MatchmakingClient(host);
    }
    return matchmakingClient;
}

export function closeMatchmakingClient(): void {
    if (matchmakingClient) {
        matchmakingClient.close();
        matchmakingClient = null;
    }
}
