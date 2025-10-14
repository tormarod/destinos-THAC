# La Ruleta de la Suerte - Destination Allocation System

A web application for managing and allocating destinations for public service positions. This system allows users to submit their preferred destinations in order of priority, and then runs an allocation algorithm to assign destinations based on user rankings and quotas.

## 🎯 Overview

This application is designed for managing destination assignments where:

- Users have a specific order/position (determined by BOE + 34)
- Users can select and rank their preferred destinations
- The system allocates destinations using a round-robin algorithm based on user priority
- Lower order numbers get higher priority in the allocation process

## 🏗️ Architecture

### Backend (Node.js/Express)

- **Server**: Express.js server with RESTful API
- **Database**: AWS DynamoDB for storing user submissions
- **Storage**: Local JSON files for destination catalogs by season/year
- **Caching**: Demand-driven caching system to reduce DynamoDB reads by 90%+
- **Authentication**: Environment-based AWS credentials
- **Monitoring**: IP logging and cache statistics for performance tracking

### Frontend (Vanilla JavaScript)

- **UI**: Single-page application with modern CSS
- **Features**: Drag-and-drop ranking, search/filter, pagination, scenario simulation
- **Storage**: Local storage for user session management and cooldown tracking
- **Duplicate Prevention**: Multi-layer client-side protection against duplicate submissions
- **Real-time Feedback**: Visual countdown timers and loading states

## 🧩 Modular Architecture

The application has been refactored into a modular architecture for better maintainability and separation of concerns:

### Backend Modules

- **`src/lib/allocate.js`**: Core allocation algorithm with scenario support
- **`src/lib/fakeUsers.js`**: Fake user generation for simulation scenarios
- **`src/lib/itemUtils.js`**: Item utility functions for popularity analysis and blocking
- **`src/middleware/rateLimit.js`**: Rate limiting middleware for API protection
- **`src/services/itemsLoader.js`**: Items loading and caching service
- **`src/routes/`**: Lean API route handlers with dependency injection

### Frontend Modules

- **`public/state.js`**: Application state management and version control
- **`public/ui.js`**: UI rendering functions for tables, pagination, and drag & drop
- **`public/events.js`**: Event handlers and drag & drop functionality
- **`public/scenarios.js`**: Scenario management and location selection
- **`public/submission.js`**: Submission logic and cooldown management
- **`public/utils.js`**: Utility functions for data validation and API calls
- **`public/app.js`**: Main application initialization and coordination

### Benefits

- **Maintainability**: Each module has a single responsibility
- **Testability**: Individual modules can be tested in isolation
- **Scalability**: New features can be added without affecting existing modules
- **Code Reuse**: Common functionality is centralized in utility modules
- **Performance**: Smaller, focused modules load faster and are easier to optimize

## 📁 Project Structure

```
destinos-THAC/
├── server.js                 # Main server entry point
├── package.json              # Dependencies and scripts
├── data.json                 # Sample data for development
├── 2025.json                 # Destination catalog for 2025 season
├── test_user.js              # User testing script
├── test_user_allocation.js   # User allocation testing script
├── public/                   # Frontend static files
│   ├── index.html           # Main application page
│   ├── app.js               # Main application initialization
│   ├── api.js               # API client functions
│   ├── allocation.js        # Allocation algorithm frontend
│   ├── splash.js            # Splash screen functionality
│   ├── state.js             # Application state management
│   ├── ui.js                # UI rendering functions
│   ├── events.js            # Event handlers and drag & drop
│   ├── scenarios.js         # Scenario management
│   ├── submission.js        # Submission and cooldown logic
│   ├── utils.js             # Utility functions
│   ├── styles.css           # Application styles
│   ├── explosive-explosion.webp # Splash screen image
│   └── assets/              # Images and videos
│       ├── img/             # Static images
│       └── video/           # Video assets
├── src/
│   ├── lib/                 # Core library functions
│   │   ├── allocate.js      # Core allocation algorithm
│   │   ├── allocate.test.js # Allocation algorithm tests
│   │   ├── fakeUsers.js     # Fake user generation
│   │   ├── itemUtils.js     # Item utility functions
│   │   ├── ddb.js           # DynamoDB operations
│   │   ├── demandDrivenCache.js # Demand-driven caching system
│   │   ├── ipLogger.js      # IP logging and monitoring
│   │   ├── localItems.js    # Local catalog management
│   │   └── requireEnv.js    # Environment validation
│   ├── middleware/          # Express middleware
│   │   └── rateLimit.js     # Rate limiting middleware
│   ├── services/            # Service layer
│   │   └── itemsLoader.js   # Items loading service
│   └── routes/              # API route handlers
│       ├── state.js         # Application state endpoint
│       ├── submit.js        # User submission endpoint
│       ├── allocate.js      # Allocation execution endpoint
│       ├── orders.js        # Order management endpoint
│       ├── resetUser.js     # User reset endpoint
│       └── resetUserAll.js  # Global user reset endpoint
└── jest.config.js           # Test configuration
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- AWS Account with DynamoDB access
- AWS credentials with appropriate permissions

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd destinos-THAC
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
# Create .env file with the following variables:
AWS_REGION=your-aws-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
DDB_TABLE=your-dynamodb-table-name
ID_FIELD=Vacante
ITEMS_CACHE_TTL_MS=900000
PORT=3000
```

4. Set up AWS resources:
   - Create a DynamoDB table with partition key `pk` and sort key `sk`
   - Add destination data as JSON files named `{year}.json` (e.g., `2025.json`) in the project root

5. Start the server:

```bash
npm start
```

6. Open your browser to `http://localhost:3000`

## 📊 Data Format

### Destination Catalog (Local JSON files)

```json
[
  {
    "Vacante": 200,
    "Centro directivo": "DELEGACION ESPECIAL DE ANDALUCIA, CEUTA Y MELILLA",
    "Centro de destino": "DELEGACION CEUTA-SEDE CEUTA. AREA DE GESTION",
    "Provincia": "CEUTA",
    "Localidad": "CEUTA",
    "Horario/ATF": null
  }
]
```

### User Submission (DynamoDB)

```json
{
  "pk": "SUBMISSION#2025",
  "sk": "u_73t4dx4ron8",
  "season": "2025",
  "name": "Fernando Alonso",
  "order": 14,
  "rankedItems": ["684", "683", "682"],
  "submittedAt": 1759837255515,
  "updatedAt": 1759837255545
}
```

**Note**: The `pk` and `sk` fields are internal DynamoDB keys. The API returns submissions with `id` instead of `sk`.

## 🔧 API Endpoints

### GET `/api/state?season=2025`

Retrieves the current application state including available destinations and user submissions.

**Response:**

```json
{
  "items": [...],
  "submissions": [...],
  "idField": "Vacante",
  "season": "2025",
  "notFound": false
}
```

### POST `/api/submit`

Submits or updates a user's destination preferences.

**Request Body:**

```json
{
  "name": "Fernando Alonso",
  "order": 14,
  "rankedItems": ["684", "683", "682"],
  "id": "u_73t4dx4ron8",
  "season": "2025",
  "requestId": "req_1703123456789_abc123"
}
```

**Response:**

```json
{
  "ok": true,
  "id": "u_73t4dx4ron8"
}
```

### POST `/api/allocate`

Runs the allocation algorithm for the specified season. This endpoint now supports user-specific allocation with scenario simulation.

**Request Body:**

```json
{
  "season": "2025",
  "userId": "u_73t4dx4ron8",
  "scenario": 0,
  "blockedItems": {
    "selectedLocalidades": ["Madrid", "Barcelona"],
    "selectedCentros": ["Hospital General"]
  },
  "competitionDepth": 1
}
```

**Parameters:**

- `season`: The allocation season/year
- `userId`: User ID for user-specific allocation (required)
- `scenario`: Simulation scenario (0-3, optional, default: 0)
- `blockedItems`: Items to mark as unavailable for scenario 2 (optional)
- `competitionDepth`: Number of preferences to simulate as blocked for scenario 3 (optional, default: 1)

**Response:**

```json
{
  "allocation": [
    {
      "userId": "u_73t4dx4ron8",
      "name": "Fernando Alonso",
      "order": 14,
      "rankedItems": ["684", "683", "682"],
      "assignedItemIds": ["684"],
      "availableByPreference": ["683", "682", "685", "686"]
    }
  ],
  "season": "2025",
  "scenario": 0,
  "usersAboveCount": 13
}
```

### POST `/api/reset-user`

Deletes a specific user's submissions for a season.

### POST `/api/reset-user-all`

Deletes all submissions for a user across all seasons.

### GET `/api/orders?season=2025`

Retrieves all user orders for a season.

**Response:**

```json
{
  "orders": [
    {
      "id": "u_73t4dx4ron8",
      "order": 14,
      "name": "Fernando Alonso",
      "season": "2025"
    }
  ]
}
```

### GET `/api/config`

Retrieves application configuration including rate limits.

**Response:**

```json
{
  "allocationRateLimitSeconds": 30
}
```

### GET `/api/cache-stats`

Retrieves cache statistics and status for monitoring.

**Response:**

```json
{
  "stats": {
    "totalRequests": 150,
    "cacheHits": 120,
    "cacheMisses": 30,
    "inactiveSeasons": 2,
    "activeSeasons": 1,
    "totalCachedSeasons": 3,
    "cacheHitRate": "80.00%"
  },
  "cacheStatus": {
    "2025": {
      "isActive": true,
      "hasData": true,
      "timeSinceRefresh": "45s",
      "timeSinceRequest": "12s",
      "activeCount": 8,
      "needsRefresh": false
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🎲 Allocation Algorithm

The allocation system uses a fair, single-item allocation algorithm with the following rules:

1. **Priority Order**: Users are sorted by their `order` field (lower number = higher priority)
2. **Tie Breaking**: If orders are equal, earlier submission time wins
3. **Single Item**: Each user receives exactly 1 destination (if available)
4. **Preference Matching**: Each user gets their highest-ranked available destination
5. **Backup Allocations**: Users can see their next 20 backup allocations in different scenarios, with configurable simulation of unavailable preferences from higher priority users

### Allocation Scenarios

The system supports 4 different simulation scenarios:

- **Scenario 0 (Default)**: Current state allocation - shows what would happen with existing submissions
- **Scenario 1**: Missing users simulation - generates realistic fake submissions for users who haven't submitted yet
- **Scenario 2**: Specific items unavailable - simulates scenarios where certain destinations (by location or center) are blocked
- **Scenario 3**: Competition depth simulation - simulates worst-case scenarios where higher priority users get their top N preferences (configurable)

### Algorithm Steps:

1. Sort users by order (ascending) and submission time (ascending)
2. For each user in priority order:
   - Find their highest-ranked available destination
   - Assign it if not already taken
3. Return allocation results with assigned items and available preferences

### Key Features:

- **Fair Distribution**: Everyone gets exactly 1 item, ensuring equal opportunity
- **Priority Respect**: Higher priority users get their top choices first
- **Backup Visibility**: Users can see their next 20 backup allocations in different scenarios
- **Configurable Simulation**: The `availableByPreference` calculation can simulate scenarios where the first X preferences of all users above are unavailable, providing more realistic backup options

### Advanced Features:

- **Fake User Generation**: For scenario 1, the system analyzes real user preference patterns by order ranges and generates realistic fake submissions for missing users
- **Blocked Items Simulation**: For scenario 2, users can select specific locations or centers to mark as unavailable
- **Competition Depth**: For scenario 3, users can configure how many preferences of higher priority users should be simulated as unavailable (1-20)
- **Rate Limiting**: Allocation requests are rate-limited per user to prevent abuse (configurable via environment variable)
- **User-Specific Allocation**: The system now supports efficient user-specific allocation without processing all submissions
- **Demand-Driven Caching**: Intelligent server-side caching that only refreshes when users are actively requesting allocations, reducing DynamoDB reads by 90%+
- **Duplicate Prevention**: Multi-layer protection against duplicate submissions with client-side cooldown and server-side request ID tracking
- **Real-time Monitoring**: IP logging and cache statistics for performance tracking and debugging

## 🚀 Demand-Driven Caching System

The application implements an intelligent caching system that dramatically reduces DynamoDB read costs while maintaining data freshness:

### How It Works

1. **Request-Driven Activation**: When a user makes an allocation request, the season is marked as "active"
2. **Smart Refresh Logic**: Cache is refreshed every 15 minutes (configurable) ONLY if the season is active
3. **Automatic Inactivity Detection**: If no requests come in for 15+ minutes, the season becomes "inactive" and stops refreshing
4. **Resume on Demand**: When users return to an inactive season, the cache is refreshed immediately

### Benefits

- **90%+ Reduction in DynamoDB Reads**: Only refresh when users are actually active
- **Zero Waste**: No background refreshes during inactive periods
- **Always Fresh Data**: Active seasons get regular updates
- **Automatic Scaling**: More active seasons get more attention
- **Cost Optimization**: Pay only for what you use

### Cache Lifecycle

- **Active Period (0-15 min)**: Regular 15-minute refreshes
- **Inactive Period (15+ min)**: Season marked inactive, next request triggers fresh refresh

### Monitoring

Use the `/api/cache-stats` endpoint to monitor cache performance, hit rates, and season activity.

## 🔄 Version Management System

The application includes an automatic version management system to ensure users always have the latest code after deployments:

### How It Works

1. **Server-Side Version Injection**: The server injects the current version (from `APP_VERSION` environment variable) into the HTML
2. **Client-Side Version Check**: The frontend checks for version changes on page load
3. **Automatic Refresh**: If a version change is detected, users are automatically refreshed to get the latest code
4. **Cache Busting**: All static assets get version parameters to prevent browser caching issues

### Benefits

- **Seamless Updates**: Users automatically get new versions without manual intervention
- **Cache Prevention**: Eliminates issues with stale frontend code after deployments
- **Zero Downtime**: Updates happen transparently in the background
- **Reliable Deployment**: Ensures all users are running the same version

### Configuration

Set the `APP_VERSION` environment variable to trigger version updates:

```bash
APP_VERSION=1.5.0
```

## 🛡️ Duplicate Prevention System

The application implements a comprehensive multi-layer duplicate prevention system to handle network issues and user behavior:

### Client-Side Protection

- **Visual Feedback**: Submit button shows countdown timer during cooldown period
- **Persistent Cooldown**: Uses localStorage to maintain cooldown across page refreshes
- **Request ID Generation**: Each submission attempt gets a unique request ID
- **Submission State Tracking**: Prevents rapid clicks and multiple submissions

### Server-Side Protection

- **Request ID Tracking**: Prevents processing the same request multiple times
- **Cooldown Enforcement**: 15-second cooldown between submissions per user
- **Memory Management**: Automatic cleanup of old tracking data
- **Cache Invalidation**: Ensures fresh data after submissions

### Benefits

- **Network Resilience**: Handles poor connections and timeouts gracefully
- **User Experience**: Clear feedback and prevents accidental duplicates
- **Data Integrity**: Ensures each submission is processed exactly once
- **Performance**: Minimal overhead with automatic cleanup

## 🎨 Frontend Features

### User Interface

- **Season Selection**: Choose from available years
- **Destination Browser**: Searchable, paginated table of available destinations
- **Drag & Drop Ranking**: Reorder selected destinations by dragging
- **Real-time Validation**: Check for order conflicts and quota limits
- **Submission Management**: View and update your submissions
- **Scenario Selection**: Choose from 4 different allocation simulation scenarios
- **Blocked Items Selection**: For scenario 2, select specific locations or centers to simulate as unavailable
- **Competition Depth Control**: For scenario 3, configure how many preferences of higher priority users to simulate as blocked
- **Rate Limit Display**: Shows countdown timer when allocation requests are rate-limited
- **Duplicate Prevention**: Multi-layer protection with visual feedback and cooldown timers

### Key Components

- **Splash Screen**: Animated introduction with video
- **Search & Filter**: Real-time filtering of destinations
- **Pagination**: Efficient browsing of large destination lists
- **Responsive Design**: Works on desktop and mobile devices
- **Scenario UI**: Dynamic interface that shows/hides relevant controls based on selected scenario
- **Blocked Items Preview**: Shows preview of destinations that would be affected by blocked items selection
- **Allocation Animation**: Visual feedback during allocation process with rate limit handling
- **Cooldown Management**: Persistent cooldown tracking across page refreshes with localStorage

## 🧪 Testing

Run the test suite:

```bash
npm test
```

The project includes Jest tests for the allocation algorithm and core functionality.

## 🔒 Security Considerations

- AWS credentials should be stored securely and not committed to version control
- Consider implementing user authentication for production use
- Validate all user inputs on both client and server side
- Use HTTPS in production environments
- Multi-layer duplicate submission prevention with request ID tracking
- Rate limiting to prevent abuse of allocation endpoints
- IP logging for monitoring and security auditing

## 🚀 Deployment

### Environment Setup

1. Set up AWS infrastructure (DynamoDB table)
2. Configure IAM roles with minimal required permissions
3. Set environment variables in your deployment platform
4. Add destination catalogs as JSON files in the root directory

### Production Considerations

- Use a reverse proxy (nginx) for static file serving
- Implement proper logging and monitoring
- Set up automated backups for DynamoDB
- Consider using a CDN for static file delivery

## 📝 Configuration

### Environment Variables

- `AWS_REGION`: AWS region for services
- `AWS_ACCESS_KEY_ID`: AWS access key
- `AWS_SECRET_ACCESS_KEY`: AWS secret key
- `DDB_TABLE`: DynamoDB table name
- `ID_FIELD`: Field name for destination ID (default: "Vacante")
- `ALLOCATION_RATE_LIMIT_SECONDS`: Rate limit for allocation requests in seconds (default: 30)
- `ITEMS_CACHE_TTL_MS`: Cache TTL for local items (default: 15 minutes)
- `APP_VERSION`: Application version for cache busting and user refresh (optional)
- `PORT`: Server port (default: 3000)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For issues and questions:

1. Check the existing issues in the repository
2. Create a new issue with detailed information
3. Include steps to reproduce any bugs

---

**Note**: This system is designed for Spanish public service destination allocation. The interface and terminology are in Spanish, reflecting its intended use case.
