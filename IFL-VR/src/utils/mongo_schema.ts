import mongoose, { Schema, Document, Model } from "mongoose";

// ------------- User -------------

export interface IUser extends Document {
  username: string;
  password: string; 
  email: string;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    email:    { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

export const User: Model<IUser> = mongoose.model<IUser>("User", UserSchema);


// ------------- PlayerSettings -------------

export interface IMatchEntry {
  matchId: string;      
  result: "win" | "loss";
  goals: number;
  assists: number;
  playedAt: Date;
}

export interface IPlayerSettings extends Document {
  user: mongoose.Types.ObjectId;  
  level: number;
  rank: string;
  xp: number;
  mmr: number;  // Matchmaking Rating (Elo-based)
  matchHistory: IMatchEntry[];
}

const MatchEntrySchema = new Schema<IMatchEntry>(
  {
    matchId: { type: String, required: true },
    result:  { type: String, enum: ["win", "loss"], required: true },
    goals:   { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    playedAt:{ type: Date,   default: Date.now },
  },
  { _id: false }
);

const PlayerSettingsSchema: Schema<IPlayerSettings> = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    level: { type: Number, default: 1 },
    rank:  { type: String, default: "Unranked" },
    xp:    { type: Number, default: 0 },
    mmr:   { type: Number, default: 1000, index: true }, // Base MMR of 1000
    matchHistory: { type: [MatchEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const PlayerSettings: Model<IPlayerSettings> = mongoose.model<IPlayerSettings>(
  "PlayerSettings",
  PlayerSettingsSchema
);


// ------------- PlayerInventory -------------

export interface IPlayerInventory extends Document {
  user: mongoose.Types.ObjectId;   
  ownedItems: string[];            
  selectedSkin: string | null;
  emotes: string[];                
}

const PlayerInventorySchema: Schema<IPlayerInventory> = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ownedItems:   { type: [String], default: [] },
    selectedSkin: { type: String, default: null },
    emotes:       { type: [String], default: [] },
  },
  { timestamps: true }
);

export const PlayerInventory: Model<IPlayerInventory> = mongoose.model<IPlayerInventory>(
  "PlayerInventory",
  PlayerInventorySchema
);