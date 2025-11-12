# Git Merge Guide: Microservices Architecture

## Overview

You're merging a **major architectural refactor** that converts the monolithic application into a microservices architecture. This is a significant change that should be handled carefully.

## Current Status

- **Repository**: https://github.com/RealBgDragon/IFL-VR.git
- **Branch**: `main`
- **Remote**: Already configured as `origin`

## Changes to Merge

### New Files (Untracked)
```
Documentation/
├── DEVVIEW.txt                          # Development View documentation
├── MATCHMAKING_SYSTEM.md                # Matchmaking system docs
└── SYSTEM_DIAGRAM.txt                   # Architecture diagrams

IFL-VR/
├── proto/matchmaking.proto              # gRPC protocol definitions
├── src/
│   ├── components/User.ts               # User management class
│   ├── examples/matchmaking_mockup.ts   # Matchmaking demo
│   ├── services/matchmaking-client.ts   # gRPC client
│   └── utils/
│       ├── Matchmaking.ts               # Original matchmaking (deprecated)
│       └── mongo_schema.ts              # Updated with MMR field

matchmaking-service/                     # NEW MICROSERVICE
├── src/
│   ├── server.ts                        # gRPC server
│   └── matchmaking-engine.ts            # Core logic
├── package.json
├── tsconfig.json
├── .env.example
└── README.md

MICROSERVICES_SETUP.md                   # Setup guide
```

### Modified Files
```
IFL-VR/package.json      # Added gRPC dependencies
IFL-VR/tsconfig.json     # Updated TypeScript config
```

---

## Recommended Merge Strategy

### Option 1: Feature Branch (RECOMMENDED)

This is the **safest approach** for major changes:

#### Step 1: Create Feature Branch

```bash
cd /Users/damyankotsev/Desktop/IFL-VR
git checkout -b feature/microservices-architecture
```

#### Step 2: Stage All Changes

```bash
# Stage modified files
git add IFL-VR/package.json
git add IFL-VR/tsconfig.json

# Stage new files
git add Documentation/
git add IFL-VR/proto/
git add IFL-VR/src/components/User.ts
git add IFL-VR/src/examples/
git add IFL-VR/src/services/
git add IFL-VR/src/utils/Matchmaking.ts
git add IFL-VR/src/utils/mongo_schema.ts
git add matchmaking-service/
git add MICROSERVICES_SETUP.md
```

#### Step 3: Commit with Descriptive Message

```bash
git commit -m "feat: Refactor to microservices architecture with gRPC matchmaking

BREAKING CHANGE: Matchmaking system extracted to independent microservice

- Created standalone matchmaking microservice with gRPC server
- Added gRPC protocol definitions (proto/matchmaking.proto)
- Implemented matchmaking client for game service communication
- Created User class to bridge Player with MongoDB
- Added MMR-based matchmaking system with Elo rating
- Updated MongoDB schema with MMR field
- Added comprehensive documentation (DEVVIEW.txt, MICROSERVICES_SETUP.md)
- Configured TypeScript for Node.js types and ES2017

New Services:
- Matchmaking Service (Port 50051) - Independent gRPC microservice
- Game Service (Port 3000) - Main application with gRPC client

Dependencies Added:
- @grpc/grpc-js
- @grpc/proto-loader
- @types/node

Migration Guide: See MICROSERVICES_SETUP.md"
```

#### Step 4: Push Feature Branch

```bash
git push -u origin feature/microservices-architecture
```

#### Step 5: Create Pull Request

1. Go to: https://github.com/RealBgDragon/IFL-VR/pulls
2. Click **"New Pull Request"**
3. Select: `base: main` ← `compare: feature/microservices-architecture`
4. Add detailed description (see template below)
5. Request reviews if working with a team
6. Merge when approved

---

### Option 2: Direct to Main (Use with Caution)

Only use if you're the sole developer and want immediate merge:

```bash
cd /Users/damyankotsev/Desktop/IFL-VR

# Stage all changes
git add -A

# Commit
git commit -m "feat: Refactor to microservices architecture with gRPC matchmaking"

# Push directly to main
git push origin main
```

⚠️ **Warning**: This skips code review and can't be easily undone.

---

## Pull Request Template

Use this when creating your PR:

```markdown
# Microservices Architecture Refactor

## 🎯 Overview

Refactored the IFL-VR application from a monolithic architecture to a microservices architecture by extracting the matchmaking system into an independent gRPC service.

## 🏗️ Architecture Changes

### Before (Monolithic)
```
┌─────────────────────────┐
│   IFL-VR Application    │
│  • VR Rendering         │
│  • Player Physics       │
│  • User Management      │
│  • Matchmaking Logic    │ ← Tightly coupled
│  • MongoDB              │
└─────────────────────────┘
```

### After (Microservices)
```
┌──────────────────┐  gRPC   ┌──────────────────┐
│  Game Service    │◄────────►│  Matchmaking     │
│  (Port 3000)     │          │  Service         │
│                  │          │  (Port 50051)    │
│ • VR Rendering   │          │ • Queue Mgmt     │
│ • Player Physics │          │ • MMR Matching   │
│ • User Mgmt      │          │ • Lobby System   │
│ • MongoDB        │          │ • In-Memory      │
└──────────────────┘          └──────────────────┘
```

## ✨ New Features

### Matchmaking Microservice
- **Independent service** running on port 50051
- **gRPC communication** with Protocol Buffers
- **Real-time streaming** of match updates
- **MMR-based matching** with Elo rating system
- **Dynamic queue expansion** for faster matches
- **Multiple game modes**: 1v1, 2v2, 3v3, FFA, Ranked, Casual

### User Management
- New `User` class bridging `Player` with MongoDB
- MMR tracking and rank progression
- Match history storage
- XP and leveling system

### gRPC Client
- Event-based API for game service
- Automatic reconnection
- Stream management
- Singleton pattern for easy access

## 📁 New Files

- `matchmaking-service/` - Complete microservice
- `proto/matchmaking.proto` - gRPC protocol definitions
- `IFL-VR/src/services/matchmaking-client.ts` - gRPC client
- `IFL-VR/src/components/User.ts` - User management
- `Documentation/DEVVIEW.txt` - Development view
- `MICROSERVICES_SETUP.md` - Setup guide

## 🔧 Modified Files

- `IFL-VR/package.json` - Added gRPC dependencies
- `IFL-VR/tsconfig.json` - Updated for Node.js types
- `IFL-VR/src/utils/mongo_schema.ts` - Added MMR field

## 🚀 Benefits

1. **Independent Scaling** - Scale matchmaking separately
2. **Independent Deployment** - Update without downtime
3. **Fault Isolation** - Service failures don't cascade
4. **Performance** - gRPC is faster than REST
5. **Development Speed** - Teams work independently

## 📋 Testing Checklist

- [ ] Matchmaking service starts successfully
- [ ] Game service connects to matchmaking via gRPC
- [ ] Players can join queue
- [ ] Matches are created correctly
- [ ] MMR updates after match completion
- [ ] Real-time streaming works
- [ ] TypeScript compiles without errors

## 🔄 Migration Guide

See `MICROSERVICES_SETUP.md` for complete setup instructions.

**Quick Start:**
```bash
# Terminal 1 - Matchmaking Service
cd matchmaking-service
npm install
npm run dev

# Terminal 2 - Game Service
cd IFL-VR
npm install
npm start
```

## ⚠️ Breaking Changes

- Matchmaking now requires separate service to be running
- New dependencies: `@grpc/grpc-js`, `@grpc/proto-loader`
- Port 50051 must be available for matchmaking service
- MongoDB schema updated (auto-migrates)

## 📚 Documentation

- Architecture: `Documentation/SYSTEM_DIAGRAM.txt`
- Development: `Documentation/DEVVIEW.txt`
- Setup: `MICROSERVICES_SETUP.md`
- Matchmaking: `Documentation/MATCHMAKING_SYSTEM.md`
- Service: `matchmaking-service/README.md`

## 🎯 Next Steps

After merge:
1. Update CI/CD for multi-service deployment
2. Add Docker Compose for easy local development
3. Add Kubernetes manifests for production
4. Implement service discovery (Consul/etcd)
5. Add monitoring (Prometheus/Grafana)
6. Add distributed tracing (Jaeger)

## 👥 Reviewers

Please review:
- Architecture changes
- gRPC implementation
- TypeScript types
- Documentation completeness
```

---

## Post-Merge Steps

After merging to main:

### 1. Update Local Main Branch

```bash
git checkout main
git pull origin main
```

### 2. Delete Feature Branch (Optional)

```bash
# Delete local branch
git branch -d feature/microservices-architecture

# Delete remote branch
git push origin --delete feature/microservices-architecture
```

### 3. Tag the Release

```bash
git tag -a v2.0.0 -m "Microservices architecture release"
git push origin v2.0.0
```

### 4. Update README

Add a badge or note about the microservices architecture:

```markdown
## Architecture

This project uses a **microservices architecture** with:
- Game Service (Port 3000)
- Matchmaking Service (Port 50051)

See [MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md) for details.
```

---

## Handling Conflicts

If you encounter merge conflicts:

### View Conflicts
```bash
git status
```

### Resolve Conflicts
1. Open conflicted files in your editor
2. Look for conflict markers: `<<<<<<<`, `=======`, `>>>>>>>`
3. Choose which changes to keep
4. Remove conflict markers
5. Stage resolved files: `git add <file>`
6. Continue: `git commit`

### Abort Merge (if needed)
```bash
git merge --abort
```

---

## Rollback Strategy

If something goes wrong after merge:

### Revert Last Commit
```bash
git revert HEAD
git push origin main
```

### Hard Reset (Dangerous)
```bash
# Only if no one else has pulled
git reset --hard HEAD~1
git push -f origin main
```

---

## CI/CD Considerations

Update your CI/CD pipeline to:

1. **Build both services**:
   ```yaml
   - name: Build Game Service
     run: cd IFL-VR && npm install && npm run build
   
   - name: Build Matchmaking Service
     run: cd matchmaking-service && npm install && npm run build
   ```

2. **Run tests for both**:
   ```yaml
   - name: Test Game Service
     run: cd IFL-VR && npm test
   
   - name: Test Matchmaking Service
     run: cd matchmaking-service && npm test
   ```

3. **Deploy both services**:
   ```yaml
   - name: Deploy Game Service
     run: ./deploy-game.sh
   
   - name: Deploy Matchmaking Service
     run: ./deploy-matchmaking.sh
   ```

---

## Summary

**Recommended Flow:**
1. ✅ Create feature branch
2. ✅ Stage and commit all changes
3. ✅ Push feature branch
4. ✅ Create Pull Request with detailed description
5. ✅ Review and merge
6. ✅ Tag release as v2.0.0
7. ✅ Update CI/CD for multi-service deployment

This ensures a clean, reviewable, and reversible merge process.
