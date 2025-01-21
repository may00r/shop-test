# Shop-Test

A TypeScript-based project for managing users, products, and purchases with Fastify, Postgres, and Redis.

## Features

- User registration, authentication, and password management
- Integration with the [Skinport API](https://docs.skinport.com) to fetch product data
- Redis-based caching for Skinport API responses
- Product purchasing functionality with balance updates
- Strict TypeScript usage for type safety

## Requirements

- **Node.js** >= 21.x
- **PostgreSQL** >= 13.x
- **Redis** >= 6.x

## Installation

1. Clone the repository:

```bash
git clone git@github.com:may00r/shop-test.git
cd shop-test
```

2. Install dependencies:

```bash
npm ci
```

3. Create a `.env` file in the project root and configure the environment variables provided in `.env.example` file.

4. Apply the database schema provided in root.

## Scripts

### Command Description

```bash
npm run dev # Run the project in development mode
npm run build # Build the project using TypeScript
npm start # Run the built application
```

## Usage

### API Endpoints

#### Authentication

```
POST /register: Register a new user
POST /login: Authenticate a user and return a token
POST /change-password: Change the user’s password
```

#### Skinport Integration

```
GET /prices: Fetch items from the Skinport API
```

#### Product Management

```
POST /purchase: Purchase a product, updating the user’s balance
```

## Dependencies

### Main

```
bcrypt, dotenv, fastify, ioredis, postgres
```

### Development

```
typescript, eslint, prettier, tsx
```

## Author

A.Pahtusov
