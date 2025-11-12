/**
 * Matchmaking Microservice - gRPC Server
 * 
 * Independent service that handles all matchmaking logic.
 * Communicates with game clients via gRPC.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { MatchmakingEngine } from './matchmaking-engine';

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../proto/matchmaking.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const matchmakingProto = grpc.loadPackageDefinition(packageDefinition).matchmaking as any;

// Initialize matchmaking engine
const engine = new MatchmakingEngine();

// Map to track user streams for match updates
const userStreams = new Map<string, grpc.ServerWritableStream<any, any>>();

/**
 * gRPC Service Implementation
 */
const matchmakingService = {
    /**
     * Join matchmaking queue
     */
    JoinQueue: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        const { user_id, username, mmr, game_mode, party_id } = call.request;
        
        console.log(`[gRPC] JoinQueue request from ${username} (MMR: ${mmr})`);
        
        try {
            const result = engine.joinQueue({
                userId: user_id,
                username,
                mmr,
                gameMode: mapGameMode(game_mode),
                partyId: party_id
            });
            
            if (result.success) {
                callback(null, {
                    success: true,
                    message: `Joined ${game_mode} queue`,
                    queued_at: Date.now()
                });
                
                // Notify via stream if user is listening
                notifyUser(user_id, {
                    type: 'QUEUED',
                    message: 'Successfully joined queue',
                    timestamp: Date.now()
                });
            } else {
                callback(null, {
                    success: false,
                    message: result.message,
                    queued_at: 0
                });
            }
        } catch (error: any) {
            console.error('[gRPC] JoinQueue error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: error.message
            });
        }
    },
    
    /**
     * Leave matchmaking queue
     */
    LeaveQueue: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        const { user_id } = call.request;
        
        console.log(`[gRPC] LeaveQueue request from ${user_id}`);
        
        try {
            const success = engine.leaveQueue(user_id);
            
            callback(null, {
                success,
                message: success ? 'Left queue successfully' : 'User not in queue'
            });
        } catch (error: any) {
            console.error('[gRPC] LeaveQueue error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: error.message
            });
        }
    },
    
    /**
     * Get queue status
     */
    GetQueueStatus: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        const { game_mode } = call.request;
        
        console.log(`[gRPC] GetQueueStatus request`);
        
        try {
            const stats = engine.getQueueStats(game_mode ? mapGameMode(game_mode) : undefined);
            
            const queueStats = Array.isArray(stats) 
                ? stats 
                : [stats].map(s => ({
                    game_mode: s.gameMode,
                    players_in_queue: s.playersInQueue,
                    average_mmr: s.averageMMR,
                    average_wait_time_seconds: s.averageWaitTime
                }));
            
            callback(null, { queue_stats: queueStats });
        } catch (error: any) {
            console.error('[gRPC] GetQueueStatus error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: error.message
            });
        }
    },
    
    /**
     * Get lobby information
     */
    GetLobby: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        const { lobby_id } = call.request;
        
        console.log(`[gRPC] GetLobby request for ${lobby_id}`);
        
        try {
            const lobby = engine.getLobby(lobby_id);
            
            if (lobby) {
                callback(null, {
                    found: true,
                    lobby: {
                        lobby_id: lobby.lobbyId,
                        game_mode: lobby.gameMode,
                        players: lobby.players.map(p => ({
                            user_id: p.userId,
                            username: p.username,
                            mmr: p.mmr,
                            rank: p.rank
                        })),
                        average_mmr: lobby.averageMMR,
                        created_at: lobby.createdAt.getTime(),
                        status: lobby.status.toUpperCase(),
                        max_players: lobby.maxPlayers
                    }
                });
            } else {
                callback(null, {
                    found: false
                });
            }
        } catch (error: any) {
            console.error('[gRPC] GetLobby error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: error.message
            });
        }
    },
    
    /**
     * Complete match and update MMR
     */
    CompleteMatch: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
        const { lobby_id, results } = call.request;
        
        console.log(`[gRPC] CompleteMatch request for ${lobby_id}`);
        
        try {
            const mmrUpdates = engine.completeMatch(lobby_id, results);
            
            callback(null, {
                success: true,
                message: 'Match completed successfully',
                mmr_updates: mmrUpdates.map(u => ({
                    user_id: u.userId,
                    old_mmr: u.oldMMR,
                    new_mmr: u.newMMR,
                    mmr_change: u.mmrChange,
                    new_rank: u.newRank
                }))
            });
            
            // Notify all players in the match
            mmrUpdates.forEach(update => {
                notifyUser(update.userId, {
                    type: 'MATCH_COMPLETED',
                    message: `Match completed. MMR: ${update.oldMMR} → ${update.newMMR}`,
                    timestamp: Date.now()
                });
            });
        } catch (error: any) {
            console.error('[gRPC] CompleteMatch error:', error);
            callback({
                code: grpc.status.INTERNAL,
                message: error.message
            });
        }
    },
    
    /**
     * Stream match updates to client
     */
    StreamMatchUpdates: (call: grpc.ServerWritableStream<any, any>) => {
        const { user_id } = call.request;
        
        console.log(`[gRPC] StreamMatchUpdates started for ${user_id}`);
        
        // Store stream for this user
        userStreams.set(user_id, call);
        
        // Send initial confirmation
        call.write({
            type: 'SEARCHING',
            message: 'Connected to matchmaking service',
            timestamp: Date.now()
        });
        
        // Handle client disconnect
        call.on('cancelled', () => {
            console.log(`[gRPC] Stream cancelled for ${user_id}`);
            userStreams.delete(user_id);
        });
        
        call.on('error', (error) => {
            console.error(`[gRPC] Stream error for ${user_id}:`, error);
            userStreams.delete(user_id);
        });
    }
};

/**
 * Notify user via stream if they're connected
 */
function notifyUser(userId: string, update: any) {
    const stream = userStreams.get(userId);
    if (stream) {
        try {
            stream.write(update);
        } catch (error) {
            console.error(`[gRPC] Failed to notify user ${userId}:`, error);
            userStreams.delete(userId);
        }
    }
}

/**
 * Notify multiple users about match found
 */
export function notifyMatchFound(lobby: any) {
    lobby.players.forEach((player: any) => {
        notifyUser(player.userId, {
            type: 'MATCH_FOUND',
            lobby: {
                lobby_id: lobby.lobbyId,
                game_mode: lobby.gameMode,
                players: lobby.players.map((p: any) => ({
                    user_id: p.userId,
                    username: p.username,
                    mmr: p.mmr,
                    rank: p.rank
                })),
                average_mmr: lobby.averageMMR,
                created_at: lobby.createdAt.getTime(),
                status: lobby.status.toUpperCase(),
                max_players: lobby.maxPlayers
            },
            message: 'Match found!',
            timestamp: Date.now()
        });
    });
}

/**
 * Map proto enum to internal game mode
 */
function mapGameMode(protoMode: string): string {
    const mapping: Record<string, string> = {
        'ONE_V_ONE': '1v1',
        'TWO_V_TWO': '2v2',
        'THREE_V_THREE': '3v3',
        'FFA': 'ffa',
        'RANKED': 'ranked',
        'CASUAL': 'casual'
    };
    return mapping[protoMode] || 'ranked';
}

/**
 * Start gRPC server
 */
function startServer() {
    const server = new grpc.Server();
    
    server.addService(matchmakingProto.MatchmakingService.service, matchmakingService);
    
    const PORT = process.env.MATCHMAKING_PORT || '50051';
    const HOST = process.env.MATCHMAKING_HOST || '0.0.0.0';
    
    server.bindAsync(
        `${HOST}:${PORT}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
            if (error) {
                console.error('[gRPC] Failed to start server:', error);
                process.exit(1);
            }
            
            console.log(`[gRPC] Matchmaking service listening on ${HOST}:${port}`);
            server.start();
            
            // Start matchmaking engine
            engine.start();
            
            // Register callback for match found events
            engine.onMatchFound(notifyMatchFound);
        }
    );
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[gRPC] Shutting down matchmaking service...');
    engine.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[gRPC] Shutting down matchmaking service...');
    engine.stop();
    process.exit(0);
});

// Start the server
startServer();
