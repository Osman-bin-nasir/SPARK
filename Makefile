.PHONY: help build up down logs test clean migrate seed health shell db-shell restart

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)SPARK Docker Commands$(NC)"
	@echo "======================"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

## Docker Compose Commands

build: ## Build Docker images
	@echo "$(BLUE)Building Docker images...$(NC)"
	docker-compose build

up: ## Start all services
	@echo "$(BLUE)Starting services...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✓ Services started$(NC)"
	@echo "App: http://localhost:8000"
	@echo "API: http://localhost:8000/api"

up-logs: ## Start all services and show logs
	@echo "$(BLUE)Starting services...$(NC)"
	docker-compose up

down: ## Stop all services
	@echo "$(BLUE)Stopping services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✓ Services stopped$(NC)"

down-volumes: ## Stop all services and remove volumes
	@echo "$(RED)Removing all data...$(NC)"
	docker-compose down -v
	@echo "$(GREEN)✓ Services and volumes removed$(NC)"

restart: ## Restart all services
	@echo "$(BLUE)Restarting services...$(NC)"
	docker-compose restart
	@echo "$(GREEN)✓ Services restarted$(NC)"

logs: ## Show service logs
	docker-compose logs -f

logs-app: ## Show app logs
	docker-compose logs -f app

logs-db: ## Show database logs
	docker-compose logs -f postgres

logs-worker: ## Show worker logs
	docker-compose logs -f worker

ps: ## Show running containers
	docker-compose ps

## Application Commands

shell: ## Open shell in app container
	docker exec -it spark-app sh

db-shell: ## Open PostgreSQL shell
	docker exec -it spark-postgres psql -U spark_user -d spark_db

migrate: ## Run database migrations
	@echo "$(BLUE)Running migrations...$(NC)"
	docker exec spark-app npm run migrate
	@echo "$(GREEN)✓ Migrations complete$(NC)"

seed: ## Seed database with demo data
	@echo "$(BLUE)Seeding database...$(NC)"
	docker exec spark-app npm run seed:startup-demo
	@echo "$(GREEN)✓ Database seeded$(NC)"

health: ## Check service health
	@echo "$(BLUE)Checking health...$(NC)"
	@docker exec spark-app node -e "require('http').get('http://localhost:4000/health', (r) => console.log(r.statusCode === 200 ? '$(GREEN)✓ App healthy$(NC)' : '$(RED)✗ App unhealthy$(NC)'))"
	@docker exec spark-postgres pg_isready -U spark_user && echo "$(GREEN)✓ Database healthy$(NC)" || echo "$(RED)✗ Database unhealthy$(NC)"

test: ## Run tests in app container
	docker exec spark-app npm test

lint: ## Run ESLint
	docker exec spark-app npm run lint

## Database Commands

db-backup: ## Backup database to backup.sql
	@echo "$(BLUE)Backing up database...$(NC)"
	docker exec spark-postgres pg_dump -U spark_user spark_db > backup.sql
	@echo "$(GREEN)✓ Database backed up to backup.sql$(NC)"

db-restore: ## Restore database from backup.sql
	@echo "$(BLUE)Restoring database...$(NC)"
	docker exec -i spark-postgres psql -U spark_user spark_db < backup.sql
	@echo "$(GREEN)✓ Database restored$(NC)"

db-reset: ## Reset database (remove all data)
	@echo "$(RED)Resetting database...$(NC)"
	docker-compose down -v
	docker-compose up -d postgres
	@sleep 5
	docker exec spark-app npm run migrate
	@echo "$(GREEN)✓ Database reset$(NC)"

## Development Commands

dev: ## Start services for development (with volume mounts)
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✓ Development environment ready$(NC)"
	@echo "Hot reload enabled for: ./server/src"

dev-build: ## Rebuild for development
	@echo "$(BLUE)Building for development...$(NC)"
	docker-compose up --build -d
	@echo "$(GREEN)✓ Build complete$(NC)"

watch: ## Watch logs in development
	docker-compose logs -f

## Cleanup Commands

clean: ## Remove stopped containers and unused images
	@echo "$(BLUE)Cleaning up Docker resources...$(NC)"
	docker-compose down
	docker system prune -f
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: ## Remove everything (containers, images, volumes)
	@echo "$(RED)Removing all Docker resources...$(NC)"
	docker-compose down -v
	docker system prune -a --volumes -f
	@echo "$(GREEN)✓ Complete cleanup done$(NC)"

clean-images: ## Remove Docker images
	@echo "$(BLUE)Removing images...$(NC)"
	docker rmi spark:latest spark-app:latest -f 2>/dev/null || true
	@echo "$(GREEN)✓ Images removed$(NC)"

## Worker Commands (Profile)

worker-up: ## Start worker service
	@echo "$(BLUE)Starting worker...$(NC)"
	docker-compose --profile worker up -d worker
	@echo "$(GREEN)✓ Worker started$(NC)"

worker-down: ## Stop worker service
	@echo "$(BLUE)Stopping worker...$(NC)"
	docker-compose --profile worker down
	@echo "$(GREEN)✓ Worker stopped$(NC)"

worker-logs: ## Show worker logs
	docker-compose --profile worker logs -f worker

## Utility Commands

version: ## Show Docker version info
	@docker --version
	@docker-compose --version

env-check: ## Check if .env file exists
	@if [ -f .env ]; then \
		echo "$(GREEN)✓ .env file found$(NC)"; \
	else \
		echo "$(RED)✗ .env file not found$(NC)"; \
		echo "Creating .env from .env.example..."; \
		cp .env.example .env; \
		echo "$(GREEN)✓ .env created (please edit and add secrets)$(NC)"; \
	fi

# Recipe to run make commands inside containers
container-shell: ## Interactive shell in app container
	docker exec -it spark-app bash

## Default
.DEFAULT_GOAL := help

# Configuration
COMPOSE_PROJECT_NAME ?= spark
DOCKER_BUILDKIT ?= 1
export DOCKER_BUILDKIT
