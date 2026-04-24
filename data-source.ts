import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { parse } from 'pg-connection-string';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

// Parse database URL
const databaseUrl = process.env.DATABASE_URL || 'postgresql://taktip:devpassword@localhost:5432/taktip_dev';
const parsed = parse(databaseUrl);

// Get entities
const entities = [__dirname + '/src/**/entities/*.entity{.ts,.js}'];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: parsed.host || 'localhost',
  port: parsed.port ? parseInt(parsed.port, 10) : 5432,
  username: parsed.user || 'taktip',
  password: parsed.password || 'devpassword',
  database: parsed.database || 'taktip_dev',
  entities: [path.join(__dirname, 'src/auth/entities/user.entity.js')],
  migrations: [__dirname + '/src/database/migrations/*{.ts,.js}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: true,
});