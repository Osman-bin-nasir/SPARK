# Docker Setup Guide for SPARK

This guide explains how to build and run the SPARK application using Docker and Docker Compose.

## Architecture

SPARK consists of:
- **Frontend**: React/Vite app (served statically)
- **Backend**: Node.js/Express API server (port 4000)
- **Database**: PostgreSQL (port 5432)
- **Worker**: Optional background job processor

## Files Included

- **Dockerfile** - Multi-stage build for production deployment (includes client build + server)
- **Dockerfile.worker** - Separate worker service for background jobs
- **docker-compose.yml** - Orchestration of all services (app, database, optional worker)
- **.dockerignore** - Files excluded from Docker builds
- **.env.example** - Environment variable template

## Prerequisites

- Docker Desktop (includes Docker and Docker Compose)
- Git

## Quick Start

### 1. Clone and Setup

```bash
cd /path/to/spark
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` with your configuration:

**Critical (must change):**
```env
JWT_SECRET=<generate-secure-key>
DB_PASSWORD=<generate-strong-password>
```

Compose constructs `DATABASE_URL` from the `DB_*` values. The bundled
PostgreSQL service uses `DATABASE_SSL=false`; set it to `true` when connecting
to a hosted database that requires TLS.

**Optional (for full features):**
```env
GOOGLE_CLIENT_ID=<your-google-oauth-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-secret>
TELEGRAM_BOT_USERNAME=<your-bot-username>
```

### 3. Build and Start

```bash
# Build and start all services
docker-compose up --build

# Or detached mode
docker-compose up --build -d

# Or just start (without rebuilding)
docker-compose up
```

The app container applies pending database migrations before starting.

### 4. Verify Deployment

```bash
# Check running containers
docker-compose ps

# View logs
docker-compose logs -f

# Access the app
# Frontend: http://localhost:8000
# API: http://localhost:8000/api

# Test database connection
docker exec spark-postgres psql -U spark_user -d spark_db -c "SELECT 1"
```

## Common Commands

### Manage Services

```bash
# Start services
docker-compose up

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f [service_name]

# Execute command in container
docker exec spark-app npm run migrate

# Shell access
docker exec -it spark-app sh
```

### Database Management

```bash
# Access PostgreSQL
docker exec -it spark-postgres psql -U spark_user -d spark_db

# Run migrations
docker exec spark-app npm run migrate

# Seed demo data
docker exec spark-app npm run seed:startup-demo

# Backup database
docker exec spark-postgres pg_dump -U spark_user spark_db > backup.sql

# Restore database
docker exec -i spark-postgres psql -U spark_user spark_db < backup.sql
```

### Development Workflow

```bash
# Rebuild after code changes
docker-compose up --build

# View container logs
docker-compose logs -f app

# Enter development shell
docker exec -it spark-app sh
```

## Worker Service (Optional)

The worker service runs background jobs. It's defined with a `worker` profile and won't start by default.

```bash
# Start with worker
docker-compose --profile worker up

# Run only worker
docker-compose --profile worker up worker

# Worker uses same environment variables as main app
```

## Production Deployment

### Environment Variables

For production, **change these critical values:**

```bash
# Generate secure keys
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('REFRESH_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Use strong database password
DB_PASSWORD=<generate-strong-password>

# Use production app URL
APP_BASE_URL=https://your-production-domain.com
```

### Docker Production Tips

```bash
# Build with specific tag for production
docker build -t spark:1.0.0 .

# Push to registry
docker tag spark:1.0.0 your-registry/spark:1.0.0
docker push your-registry/spark:1.0.0

# Use with Docker Swarm or Kubernetes
# (Adjust docker-compose.yml as needed for orchestration)

# Production compose override (docker-compose.prod.yml)
version: '3.9'
services:
  app:
    restart: always
    environment:
      NODE_ENV: production
```

### Health Checks

The app and PostgreSQL services include health checks:

```bash
# Check app health
curl http://localhost:8000/health

# Check compose health status
docker-compose ps
```

## Troubleshooting

### Container Won't Start

```bash
# View logs
docker-compose logs app

# Common issues:
# - Database not ready: Wait for "postgres: service healthy" status
# - Missing environment variables: Check .env file
# - Port already in use: Change APP_PORT or DB_PORT in .env
```

### Database Connection Issues

```bash
# Test database connection
docker exec spark-app node -e "
const pg = require('pg');
new pg.Client(process.env.DATABASE_URL).connect()
  .then(() => console.log('✓ Connected'))
  .catch(e => console.error('✗ Error:', e.message))
"

# Check database logs
docker-compose logs postgres
```

### Permission Issues

```bash
# If you see permission denied errors:
sudo chown -R $USER:$USER /path/to/spark
```

### Clean Rebuild

```bash
# Remove everything and start fresh
docker-compose down -v  # -v removes volumes
docker system prune -a  # Remove unused images
docker-compose up --build
```

## Environment Variables Reference

See `.env.example` for complete list. Key variables:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| NODE_ENV | No | production | Node environment |
| PORT | No | 4000 | Internal app port |
| DATABASE_URL | Yes | - | PostgreSQL connection string |
| DATABASE_SSL | No | false in Compose | Enable TLS for the database connection |
| JWT_SECRET | Yes | - | JWT signing key |
| GOOGLE_CLIENT_ID | No | - | Google OAuth ID |
| TELEGRAM_BOT_USERNAME | No | osman80bot | Telegram bot username |
| APP_BASE_URL | No | http://localhost:8000 | Application URL for redirects |

## Performance Considerations

- Alpine Linux images (lightweight, ~100MB base)
- Multi-stage build (reduces final image size)
- Non-root user for security
- Proper signal handling with dumb-init
- Health checks for reliability

## Networking

Services communicate via `spark-network` bridge:

- **app** → postgres (via hostname `postgres:5432`)
- **worker** → postgres (via hostname `postgres:5432`)
- **External access** → app (via localhost:8000)

## Security Best Practices

- [ ] Change all JWT secrets in production
- [ ] Use strong database password
- [ ] Set HTTPS/TLS in reverse proxy
- [ ] Keep Docker and images updated
- [ ] Use .env file (never commit secrets)
- [ ] Scan images for vulnerabilities: `docker scan spark:latest`
- [ ] Run container as non-root user (already configured)

## Source Changes

The default Compose configuration runs the built image without source bind
mounts. Rebuild the image after changing application code:

```bash
docker-compose up --build
```

## Resource Limits

To add resource limits in production:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Monitoring & Logging

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app

# Follow logs with timestamps
docker-compose logs -f --timestamps

# View logs from last hour
docker-compose logs --since 1h

# Export logs
docker-compose logs > app.log
```

## Next Steps

- Review `.env.example` and configure for your environment
- Run `docker-compose up --build` to start
- Access http://localhost:8000
- Check logs: `docker-compose logs -f`
- Run migrations: `docker exec spark-app npm run migrate`

For more Docker information, see: https://docs.docker.com/
