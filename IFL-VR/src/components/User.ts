import Player from './Player';
import { IUser, IPlayerSettings, IPlayerInventory } from '../utils/mongo_schema';
import mongoose from 'mongoose';

/**
 * User class bridges the in-game Player entity with persistent MongoDB data.
 * Manages user authentication, settings, inventory, and stats.
 */
class User {
    // MongoDB document references
    userId: mongoose.Types.ObjectId;
    username: string;
    email: string;
    
    // Game state
    player: Player;
    
    // Settings and progression
    settings: {
        level: number;
        rank: string;
        xp: number;
        mmr: number; // Matchmaking Rating
        matchHistory: Array<{
            matchId: string;
            result: 'win' | 'loss';
            goals: number;
            assists: number;
            playedAt: Date;
            mmrChange: number;
        }>;
    };
    
    // Inventory and customization
    inventory: {
        ownedItems: string[];
        selectedSkin: string | null;
        emotes: string[];
    };
    
    // Session data
    isOnline: boolean;
    lastLoginAt: Date;
    currentMatchId: string | null;
    
    constructor(userData: IUser, settingsData: IPlayerSettings, inventoryData: IPlayerInventory) {
        // Initialize from MongoDB documents
        this.userId = userData._id as mongoose.Types.ObjectId;
        this.username = userData.username;
        this.email = userData.email;
        
        // Create the in-game player entity
        this.player = new Player({
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            speed: 5,
            jumpStrength: 6,
            gravity: -9.81,
            boundingRadius: 0.5
        });
        
        // Load settings
        this.settings = {
            level: settingsData.level,
            rank: settingsData.rank,
            xp: settingsData.xp,
            mmr: this._calculateMMR(settingsData.matchHistory),
            matchHistory: settingsData.matchHistory.map(entry => ({
                ...entry,
                mmrChange: 0 // Will be calculated from match history
            }))
        };
        
        // Load inventory
        this.inventory = {
            ownedItems: inventoryData.ownedItems,
            selectedSkin: inventoryData.selectedSkin,
            emotes: inventoryData.emotes
        };
        
        // Session state
        this.isOnline = false;
        this.lastLoginAt = new Date();
        this.currentMatchId = null;
    }
    
    /**
     * Calculate MMR from match history
     * Base MMR starts at 1000, adjusted by wins/losses
     */
    private _calculateMMR(matchHistory: any[]): number {
        const BASE_MMR = 1000;
        const WIN_MMR = 25;
        const LOSS_MMR = -20;
        
        let mmr = BASE_MMR;
        for (const match of matchHistory) {
            mmr += match.result === 'win' ? WIN_MMR : LOSS_MMR;
        }
        
        return Math.max(0, mmr); // MMR can't go below 0
    }
    
    /**
     * Update MMR after a match
     */
    updateMMR(won: boolean, opponentMMR: number): number {
        const K_FACTOR = 32; // Standard Elo K-factor
        const expectedScore = 1 / (1 + Math.pow(10, (opponentMMR - this.settings.mmr) / 400));
        const actualScore = won ? 1 : 0;
        const mmrChange = Math.round(K_FACTOR * (actualScore - expectedScore));
        
        this.settings.mmr = Math.max(0, this.settings.mmr + mmrChange);
        this._updateRank();
        
        return mmrChange;
    }
    
    /**
     * Update rank based on MMR
     */
    private _updateRank(): void {
        const mmr = this.settings.mmr;
        
        if (mmr < 800) this.settings.rank = 'Bronze';
        else if (mmr < 1200) this.settings.rank = 'Silver';
        else if (mmr < 1600) this.settings.rank = 'Gold';
        else if (mmr < 2000) this.settings.rank = 'Platinum';
        else if (mmr < 2400) this.settings.rank = 'Diamond';
        else if (mmr < 2800) this.settings.rank = 'Master';
        else this.settings.rank = 'Grandmaster';
    }
    
    /**
     * Add XP and handle level ups
     */
    addXP(amount: number): { leveledUp: boolean; newLevel?: number } {
        this.settings.xp += amount;
        const xpForNextLevel = this._getXPForLevel(this.settings.level + 1);
        
        if (this.settings.xp >= xpForNextLevel) {
            this.settings.level++;
            return { leveledUp: true, newLevel: this.settings.level };
        }
        
        return { leveledUp: false };
    }
    
    /**
     * Calculate XP required for a given level
     */
    private _getXPForLevel(level: number): number {
        // Exponential XP curve: 100 * 1.5^(level-1)
        return Math.floor(100 * Math.pow(1.5, level - 1));
    }
    
    /**
     * Record a match result
     */
    recordMatch(matchData: {
        matchId: string;
        result: 'win' | 'loss';
        goals: number;
        assists: number;
        opponentMMR: number;
    }): void {
        const mmrChange = this.updateMMR(matchData.result === 'win', matchData.opponentMMR);
        
        this.settings.matchHistory.push({
            matchId: matchData.matchId,
            result: matchData.result,
            goals: matchData.goals,
            assists: matchData.assists,
            playedAt: new Date(),
            mmrChange
        });
        
        // Award XP based on performance
        const baseXP = matchData.result === 'win' ? 100 : 50;
        const performanceXP = (matchData.goals * 10) + (matchData.assists * 5);
        this.addXP(baseXP + performanceXP);
    }
    
    /**
     * Get win rate percentage
     */
    getWinRate(): number {
        if (this.settings.matchHistory.length === 0) return 0;
        
        const wins = this.settings.matchHistory.filter(m => m.result === 'win').length;
        return (wins / this.settings.matchHistory.length) * 100;
    }
    
    /**
     * Get total stats
     */
    getStats() {
        const totalMatches = this.settings.matchHistory.length;
        const wins = this.settings.matchHistory.filter(m => m.result === 'win').length;
        const losses = totalMatches - wins;
        const totalGoals = this.settings.matchHistory.reduce((sum, m) => sum + m.goals, 0);
        const totalAssists = this.settings.matchHistory.reduce((sum, m) => sum + m.assists, 0);
        
        return {
            totalMatches,
            wins,
            losses,
            winRate: this.getWinRate(),
            totalGoals,
            totalAssists,
            avgGoalsPerMatch: totalMatches > 0 ? totalGoals / totalMatches : 0,
            avgAssistsPerMatch: totalMatches > 0 ? totalAssists / totalMatches : 0,
            currentStreak: this._getCurrentStreak()
        };
    }
    
    /**
     * Calculate current win/loss streak
     */
    private _getCurrentStreak(): { type: 'win' | 'loss' | 'none'; count: number } {
        if (this.settings.matchHistory.length === 0) {
            return { type: 'none', count: 0 };
        }
        
        const recent = [...this.settings.matchHistory].reverse();
        const streakType = recent[0].result;
        let count = 0;
        
        for (const match of recent) {
            if (match.result === streakType) count++;
            else break;
        }
        
        return { type: streakType, count };
    }
    
    /**
     * Equip an item (skin, emote, etc.)
     */
    equipItem(itemId: string): boolean {
        if (!this.inventory.ownedItems.includes(itemId)) {
            return false;
        }
        
        this.inventory.selectedSkin = itemId;
        return true;
    }
    
    /**
     * Purchase an item
     */
    purchaseItem(itemId: string): boolean {
        // TODO: Implement currency system
        if (this.inventory.ownedItems.includes(itemId)) {
            return false; // Already owned
        }
        
        this.inventory.ownedItems.push(itemId);
        return true;
    }
    
    /**
     * Serialize user data for network transmission
     */
    toNetworkData() {
        return {
            userId: this.userId.toString(),
            username: this.username,
            level: this.settings.level,
            rank: this.settings.rank,
            mmr: this.settings.mmr,
            selectedSkin: this.inventory.selectedSkin,
            isOnline: this.isOnline,
            playerState: this.player.toJSON()
        };
    }
    
    /**
     * Serialize for MongoDB update
     */
    toMongoUpdate() {
        return {
            settings: {
                level: this.settings.level,
                rank: this.settings.rank,
                xp: this.settings.xp,
                matchHistory: this.settings.matchHistory
            },
            inventory: {
                ownedItems: this.inventory.ownedItems,
                selectedSkin: this.inventory.selectedSkin,
                emotes: this.inventory.emotes
            }
        };
    }
}

export default User;
