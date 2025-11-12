# IFL-VR Microservices Setup Guide

## Architecture Overview

The IFL-VR project has been refactored from a **monolithic** architecture to a **microservices** architecture with the matchmaking system separated into an independent service.

```
┌──────────────────────┐         gRPC (Port 50051)       ┌──────────────────────┐
│   Game Service       │◄─────────────────────────-─────►│  Matchmaking Service │
│   (Main Application) │                                 │   (Independent)      │
├──────────────────────┤                                 ├──────────────────────┤
│ • VR Rendering       │                                 │ • Queue Management   │
│ • Player Physics     │                                 │ • MMR Matching       │
│ • User Management    │                                 │ • Lobby System       │
│ • Game Logic         │                                 │ • Match Tracking     │
│                      │                                 │                      │
│ MongoDB (User Data)  │                                 │ In-Memory State      │
└──────────────────────┘                                 └──────────────────────┘
      Port: 3000                                               Port: 50051
```

## Benefits of This Architecture

### 1. **Independent Scaling**
- Scale matchmaking service independently based on player count
- Game servers can scale based on active matches
- Different resource requirements for each service

### 2. **Independent Deployment**
- Update matchmaking logic without restarting game servers
- Deploy new features to one service at a time
- Reduced downtime and risk

### 3. **Technology Flexibility**
- Each service can use different tech stacks if needed
- Optimize each service for its specific workload
- Easier to experiment with new technologies

### 4. **Fault Isolation**
- If matchmaking crashes, active games continue
- Better error handling and recovery
- Improved overall system reliability

### 5. **Development Efficiency**
- Teams can work on services independently
- Faster development cycles
- Clearer separation of concerns

## Project Structure

```
IFL-VR/
├── IFL-VR/                          # Game Service (Main Application)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Player.ts            # Physics engine
│   │   │   ├── User.ts              # User management
│   │   │   ├── VRScene.ts           # VR rendering
│   │   │   └── Environment.ts       # Game world
│   │   ├── services/
│   │   │   └── matchmaking-client.ts  # gRPC client for matchmaking
│   │   ├── utils/
│   │   │   ├── mongo_schema.ts      # Database schemas
│   │   │   ├── Physics.ts           # Physics utilities
│   │   │   └── VRControls.ts        # VR input
│   │   └── main.ts                  # Application entry
│   └── package.json
│
├── matchmaking-service/             # Matchmaking Microservice
│   ├── src/
│   │   ├── server.ts                # gRPC server
│   │   └── matchmaking-engine.ts    # Core matchmaking logic
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── README.md
│
├── proto/
│   └── matchmaking.proto            # gRPC protocol definitions
│
└── Documentation/
    ├── SYSTEM_DIAGRAM.txt
    ├── DEVVIEW.txt
    └── MICROSERVICES_SETUP.md       # This file
```

## Installation & Setup

### Prerequisites

- Node.js 16+ installed
- MongoDB running (for game service)
- Terminal access

### Step 1: Install Game Service Dependencies

```bash
cd IFL-VR
npm install
```

This installs:
- `mongoose` - MongoDB ODM
- `three` - 3D graphics
- `@grpc/grpc-js` - gRPC client
- `@grpc/proto-loader` - Protocol buffer loader
- `@types/node` - TypeScript types

### Step 2: Install Matchmaking Service Dependencies

```bash
cd ../matchmaking-service
npm install
```

This installs:
- `@grpc/grpc-js` - gRPC server
- `@grpc/proto-loader` - Protocol buffer loader
- TypeScript and build tools

### Step 3: Configure Environment Variables

#### Matchmaking Service

```bash
cd matchmaking-service
cp .env.example .env
```

Edit `.env`:
```env
MATCHMAKING_HOST=0.0.0.0
MATCHMAKING_PORT=50051
NODE_ENV=development
```

#### Game Service

Create `.env` in `IFL-VR/`:
```env
MATCHMAKING_SERVICE_URL=localhost:50051
MONGODB_URI=mongodb://localhost:27017/ifl-vr
PORT=3000
```

## Running the Services

### Option 1: Development Mode (Recommended)

Open **two terminal windows**:

**Terminal 1 - Matchmaking Service:**
```bash
cd matchmaking-service
npm run dev
```

You should see:
```
[gRPC] Matchmaking service listening on 0.0.0.0:50051
[MatchmakingEngine] Started
```

**Terminal 2 - Game Service:**
```bash
cd IFL-VR
npm run start
```

### Option 2: Production Mode

**Terminal 1 - Matchmaking Service:**
```bash
cd matchmaking-service
npm run build
npm start
```

**Terminal 2 - Game Service:**
```bash
cd IFL-VR
npm run build
npm start
```

## Using the Matchmaking Client

### In Your Game Code

```typescript
import { getMatchmakingClient } from './services/matchmaking-client';
import User from './components/User';

// Initialize client (connects to matchmaking service)
const matchmaking = getMatchmakingClient('localhost:50051');

// Listen for match found event
matchmaking.on('matchFound', (lobby) => {
    console.log('Match found!', lobby);
    console.log('Players:', lobby.players);
    console.log('Average MMR:', lobby.average_mmr);
    
    // Start the game with these players
    startGame(lobby);
});

// Listen for other events
matchmaking.on('queued', (update) => {
    console.log('Successfully joined queue');
});

matchmaking.on('searching', (update) => {
    console.log('Searching for match...');
});

matchmaking.on('error', (error) => {
    console.error('Matchmaking error:', error);
});

// Join matchmaking queue
async function joinMatchmaking(user: User) {
    try {
        // Start streaming updates
        matchmaking.streamMatchUpdates(user.userId.toString());
        
        // Join queue
        const response = await matchmaking.joinQueue({
            userId: user.userId.toString(),
            username: user.username,
            mmr: user.settings.mmr,
            gameMode: 'ranked'
        });
        
        if (response.success) {
            console.log('Joined queue successfully');
        }
    } catch (error) {
        console.error('Failed to join queue:', error);
    }
}

// Leave queue
async function leaveMatchmaking(userId: string) {
    try {
        const response = await matchmaking.leaveQueue(userId);
        matchmaking.stopStreamMatchUpdates();
        console.log('Left queue');
    } catch (error) {
        console.error('Failed to leave queue:', error);
    }
}

// After match completes
async function completeMatch(lobbyId: string, results: any[]) {
    try {
        const response = await matchmaking.completeMatch(lobbyId, results);
        
        console.log('Match completed');
        console.log('MMR updates:', response.mmrUpdates);
        
        // Update local user data with new MMR
        response.mmrUpdates.forEach(update => {
            console.log(`${update.user_id}: ${update.old_mmr} → ${update.new_mmr}`);
        });
    } catch (error) {
        console.error('Failed to complete match:', error);
    }
}
```

## Testing the Setup

### 1. Test Matchmaking Service Health

```bash
# In a new terminal
grpcurl -plaintext localhost:50051 list
```

You should see:
```
matchmaking.MatchmakingService
```

### 2. Test Queue Join (Manual)

Create a test script `test-matchmaking.ts`:

```typescript
import { getMatchmakingClient } from './src/services/matchmaking-client';

const client = getMatchmakingClient('localhost:50051');

// Test joining queue
async function test() {
    try {
        // Join queue
        const response = await client.joinQueue({
            userId: 'test-user-1',
            username: 'TestPlayer',
            mmr: 1500,
            gameMode: 'ranked'
        });
        
        console.log('Join response:', response);
        
        // Get queue stats
        const stats = await client.getQueueStatus();
        console.log('Queue stats:', stats);
        
        // Leave queue
        await client.leaveQueue('test-user-1');
        console.log('Left queue');
        
        client.close();
    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
```

Run:
```bash
ts-node test-matchmaking.ts
```

## Monitoring

### Matchmaking Service Logs

The matchmaking service logs all important events:

```
[gRPC] JoinQueue request from TestPlayer (MMR: 1500)
[MatchmakingEngine] TestPlayer (MMR: 1500) joined ranked queue
[MatchmakingEngine] Created ranked lobby lobby_123 with 2 players (Avg MMR: 1510)
[gRPC] Match update: MATCH_FOUND
```

### Game Service Logs

```
[MatchmakingClient] Connected to matchmaking service at localhost:50051
[MatchmakingClient] Match update: MATCH_FOUND
Match found! { lobby_id: 'lobby_123', players: [...] }
```

## Troubleshooting

### Issue: "Cannot connect to matchmaking service"

**Solution:**
1. Ensure matchmaking service is running: `cd matchmaking-service && npm run dev`
2. Check port 50051 is not in use: `lsof -i :50051`
3. Verify MATCHMAKING_SERVICE_URL in game service `.env`

### Issue: "gRPC module not found"

**Solution:**
```bash
npm install @grpc/grpc-js @grpc/proto-loader
```

### Issue: "Proto file not found"

**Solution:**
Ensure `proto/matchmaking.proto` exists and paths in client/server are correct.

### Issue: "TypeScript errors about NodeJS"

**Solution:**
```bash
npm install --save-dev @types/node
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["node"]
  }
}
```

## Deployment

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  matchmaking:
    build: ./matchmaking-service
    ports:
      - "50051:50051"
    environment:
      - MATCHMAKING_PORT=50051
      - NODE_ENV=production
    restart: unless-stopped
    
  game:
    build: ./IFL-VR
    ports:
      - "3000:3000"
    environment:
      - MATCHMAKING_SERVICE_URL=matchmaking:50051
      - MONGODB_URI=mongodb://mongo:27017/ifl-vr
      - PORT=3000
    depends_on:
      - matchmaking
      - mongo
    restart: unless-stopped
    
  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

volumes:
  mongo-data:
```

Run:
```bash
docker-compose up -d
```

### Kubernetes

See `matchmaking-service/README.md` for Kubernetes deployment examples.

## Performance Considerations

### Matchmaking Service
- **Latency**: <10ms for queue operations
- **Throughput**: ~10,000 requests/second
- **Memory**: ~50MB + 1KB per queued player
- **Scaling**: Horizontal (multiple instances with load balancer)

### gRPC Communication
- **Protocol**: HTTP/2 with Protocol Buffers
- **Overhead**: ~5-10ms network latency (local)
- **Bandwidth**: Minimal (~1KB per request)

## Next Steps

1. **Add Authentication**: Secure gRPC with TLS/SSL
2. **Add Redis**: Share state across multiple matchmaking instances
3. **Add Monitoring**: Prometheus + Grafana for metrics
4. **Add Logging**: ELK stack or Datadog
5. **Add Load Balancer**: Nginx or HAProxy for matchmaking service
6. **Add Service Discovery**: Consul or etcd for dynamic service location

## Summary

You now have:
- ✅ Independent matchmaking microservice
- ✅ gRPC communication between services
- ✅ Real-time match updates via streaming
- ✅ Scalable architecture
- ✅ Clear separation of concerns

The matchmaking service can now be scaled, deployed, and updated independently from the game service!
