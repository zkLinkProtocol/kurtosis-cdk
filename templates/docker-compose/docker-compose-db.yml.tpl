version: '3.8'

services:
  postgres:
    image: postgres:16.2
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER} 
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - ./build/init.sql:/docker-entrypoint-initdb.d/init.sql
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "${POSTGRES_PORT}:5432"
    command: ["-N", "1000"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  bs-postgres:
    image: postgres:16.2
    environment:
      - POSTGRES_DB=${BS_POSTGRES_DB}
      - POSTGRES_USER=${BS_POSTGRES_USER}
      - POSTGRES_PASSWORD=${BS_POSTGRES_PASSWORD}
    volumes:
      - ./build/init.sql:/docker-entrypoint-initdb.d/init.sql
      - bs-postgres-data:/var/lib/postgresql/data
    ports:
      - "${BS_POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${BS_POSTGRES_USER} -d ${BS_POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
  bs-postgres-data:

networks:
  default:
    name: zklink-network
    external: true 