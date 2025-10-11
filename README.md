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
- **Authentication**: Environment-based AWS credentials

### Frontend (Vanilla JavaScript)

- **UI**: Single-page application with modern CSS
- **Features**: Drag-and-drop ranking, search/filter, pagination
- **Storage**: Local storage for user session management

## 📁 Project Structure

```
destinos-THAC/
├── server.js                 # Main server entry point
├── package.json              # Dependencies and scripts
├── data.json                 # Sample data for development
├── public/                   # Frontend static files
│   ├── index.html           # Main application page
│   ├── app.js               # Frontend application logic
│   ├── api.js               # API client functions
│   ├── allocation.js        # Allocation algorithm frontend
│   ├── splash.js            # Splash screen functionality
│   ├── styles.css           # Application styles
│   └── assets/              # Images and videos
├── src/
│   ├── lib/                 # Core library functions
│   │   ├── allocate.js      # Allocation algorithm
│   │   ├── ddb.js           # DynamoDB operations
│   │   ├── localItems.js    # Local catalog management
│   │   └── requireEnv.js    # Environment validation
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
ID_FIELD=Nº vacante
ITEMS_CACHE_TTL_MS=900000
PORT=3000
```

4. Set up AWS resources:
   - Create a DynamoDB table with partition key `pk` and sort key `sk`
   - Create an S3 bucket for storing destination catalogs
   - Upload destination data as JSON files named `{year}.json` (e.g., `2024.json`)

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
    "Nº vacante": "684",
    "Centro de destino": "Hospital General",
    "Localidad": "Madrid",
    "Provincia": "Madrid",
    "Horario/ATF": "H24"
  }
]
```

### User Submission (DynamoDB)

```json
{
  "pk": "SUBMISSION#2024",
  "sk": "u_73t4dx4ron8",
  "season": "2024",
  "name": "Fernando Alonso",
  "order": 14,
  "rankedItems": ["684", "683", "682"],
  "submittedAt": 1759837255515
}
```

## 🔧 API Endpoints

### GET `/api/state?season=2024`

Retrieves the current application state including available destinations and user submissions.

**Response:**

```json
{
  "items": [...],
  "submissions": [...],
  "idField": "Nº vacante",
  "season": "2024",
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
  "season": "2024"
}
```

### POST `/api/allocate`

Runs the allocation algorithm for the specified season.

**Request Body:**

```json
{
  "season": "2024"
}
```

**Response:**

```json
{
  "allocation": [
    {
      "userId": "u_73t4dx4ron8",
      "name": "Fernando Alonso",
      "order": 14,
      "rankedItems": ["684", "683", "682"],
      "assignedItemIds": ["684", "683"],
      "availableByPreference": ["684", "683", "682"]
    }
  ],
  "season": "2024"
}
```

### POST `/api/reset-user`

Deletes a specific user's submissions for a season.

### POST `/api/reset-user-all`

Deletes all submissions for a user across all seasons.

### GET `/api/orders?season=2024`

Retrieves all user orders for a season.

## 🎲 Allocation Algorithm

The allocation system uses a fair, single-item allocation algorithm with the following rules:

1. **Priority Order**: Users are sorted by their `order` field (lower number = higher priority)
2. **Tie Breaking**: If orders are equal, earlier submission time wins
3. **Single Item**: Each user receives exactly 1 destination (if available)
4. **Preference Matching**: Each user gets their highest-ranked available destination
5. **Backup Allocations**: Users can see their next 20 backup allocations in different scenarios, with configurable simulation of unavailable preferences from higher priority users

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

### AvailableByPreference Parameter:

The `allocate(submissions, x)` function accepts an optional second parameter `x`:

- **x = 0 (default)**: Standard backup calculation - only the user's own preferences are marked unavailable in scenarios
- **x > 0**: The first X preferences of all users above the current user are marked as unavailable in the simulation, providing more realistic backup scenarios that account for potential competition from higher priority users

## 🎨 Frontend Features

### User Interface

- **Season Selection**: Choose from available years
- **Destination Browser**: Searchable, paginated table of available destinations
- **Drag & Drop Ranking**: Reorder selected destinations by dragging
- **Real-time Validation**: Check for order conflicts and quota limits
- **Submission Management**: View and update your submissions

### Key Components

- **Splash Screen**: Animated introduction with video
- **Search & Filter**: Real-time filtering of destinations
- **Pagination**: Efficient browsing of large destination lists
- **Responsive Design**: Works on desktop and mobile devices

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
- `ID_FIELD`: Field name for destination ID (default: "Nº vacante")
- `ALLOCATION_RATE_LIMIT_SECONDS`: Rate limit for allocation requests in seconds (default: 30)
- `ITEMS_CACHE_TTL_MS`: Cache TTL for local items (default: 15 minutes)
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
