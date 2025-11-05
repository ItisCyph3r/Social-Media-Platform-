# SMP - Full Stack Microservices Application

A production-ready social media platform built with microservices architecture, featuring real-time messaging, post sharing, analytics, and more.

## Architecture

This application follows a microservices architecture with the following services:

- **API Gateway** (NestJS) - Main entry point, routes requests to appropriate services
- **Auth Service** (NestJS) - Authentication & Authorization with JWT
- **User Service** (NestJS) - User profile management, follow/unfollow
- **Post Service** (NestJS) - Posts, likes, comments management
- **Message Service** (NestJS) - Direct messaging, group messaging, WebSockets
- **Notification Service** (NestJS) - Notifications, email notifications via RabbitMQ, WebSockets
- **Analytics Service** (FastAPI) - Data analytics, ML recommendations

### Technology Stack

- **Backend**: NestJS (TypeScript), FastAPI (Python)
- **Frontend**: Next.js (React with TypeScript)
- **Databases**: PostgreSQL (one per service)
- **Caching**: Redis
- **Message Queue**: RabbitMQ
- **File Storage**: MinIO (S3-compatible)
- **Communication**: gRPC (inter-service), REST/HTTP (external), WebSockets (real-time)
- **ORM**: TypeORM (NestJS), SQLAlchemy (FastAPI)

## Features

### Core Features
- User authentication and authorization
- User profiles and follow/unfollow system
- Posts with media uploads
- Real-time direct messaging (1-on-1)
- Group messaging
- Share posts in DMs
- Reply/tag messages in conversations
- Email notifications
- Analytics and insights

## Project Structure

```
project-root/
├── docs/                    # Documentation (PRD, Architecture, API Spec)
├── services/
│   ├── api-gateway/         # NestJS - API Gateway
│   ├── auth-service/        # NestJS - Authentication
│   ├── user-service/        # NestJS - User Management
│   ├── post-service/        # NestJS - Posts Management
│   ├── message-service/     # NestJS - Messaging with WebSockets
│   ├── notification-service/ # NestJS - Notifications & Email Notifications
│   └── analytics-service/   # FastAPI - Analytics & ML
├── frontend/                # Next.js Application
├── shared/
│   └── protos/             # gRPC Protocol Buffer Definitions
├── docker-compose.yml      # Docker Compose Configuration
└── .env.example            # Environment Variables Template
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)
- RabbitMQ 3.13+ (or use Docker)

### Environment Setup

1. Copy environment variables:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration (JWT secret, SMTP credentials, etc.)

3. Copy service-specific `.env.example` files:
```bash
cd services/api-gateway && cp .env.example .env
cd ../auth-service && cp .env.example .env
# ... repeat for each service
```

### Docker Compose (Recommended for Development)

Start all infrastructure services:
```bash
docker-compose up -d postgres-auth postgres-user postgres-post postgres-message postgres-notification postgres-analytics redis rabbitmq minio
```

Or start everything:
```bash
docker-compose up
```

### Manual Setup (Alternative)

#### 1. Install Dependencies

**NestJS Services:**
```bash
cd services/api-gateway && npm install
cd ../auth-service && npm install
# ... repeat for each NestJS service
```

**FastAPI Service:**
```bash
cd services/analytics-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Frontend:**
```bash
cd frontend && npm install
```

#### 2. Start Infrastructure

- PostgreSQL: Start 6 instances on ports 5432-5437
- Redis: `redis-server` on port 6379
- RabbitMQ: Start on port 5672
- MinIO: Start on port 9000

#### 3. Run Migrations

Each service will need TypeORM migrations (or SQLAlchemy for FastAPI) to set up the database schema.

#### 4. Start Services

**Option A: Using VS Code Tasks (Recommended)**

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "Tasks: Run Task"
3. Select one of:
   - `Start Services Group 1 (API Gateway, Auth, Post)` - Opens 3 services in split terminals
   - `Start Services Group 2 (Notification, Message, User)` - Opens 3 services in split terminals
   - `Start All Services` - Opens all 6 services

**Option B: Using PowerShell Script (Windows)**

```powershell
.\start-services.ps1
```

This will open all services in split terminals using Windows Terminal (if installed).

**Option C: Using Bash Script (macOS/Linux)**

```bash
chmod +x start-services.sh
./start-services.sh
```

This uses tmux to create split terminals.

**Option D: Manual Start**

**API Gateway:**
```bash
cd services/api-gateway && npm run start:dev
```

**Auth Service:**
```bash
cd services/auth-service && npm run start:dev
```

**Other services:** Similar pattern

**Analytics Service:**
```bash
cd services/analytics-service
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend && npm run dev
```

## Documentation

See the `docs/` directory for detailed documentation:
- `PRD.md` - Product Requirements Document
- `ARCHITECTURE.md` - System Architecture
- `FEATURES.md` - Feature Specifications
- `API_SPEC.md` - API Specification
- `TECHNICAL_STACK.md` - Technology Stack Details

## Development

### gRPC Protocol Buffers

Protocol buffer definitions are in `shared/protos/`. To generate code:

**NestJS (TypeScript):**
```bash
npm install --save-dev @grpc/grpc-js @grpc/proto-loader
# Use grpc-tools to generate TypeScript definitions
```

**FastAPI (Python):**
```bash
python -m grpc_tools.protoc -I shared/protos --python_out=. --grpc_python_out=. shared/protos/*.proto
```

## License

MIT

