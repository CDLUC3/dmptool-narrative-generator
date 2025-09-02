import * as mysql2 from 'mysql2/promise';
import { Logger } from 'pino';
import { logger, prepareObjectForLogs } from './logger';
import {JWTAccessToken} from "./server";

export interface DatabaseConnection {
  getConnection(): Promise<mysql2.PoolConnection>;
  query<T>(sql: string, values?: string[]): Promise<T>;
  close(): Promise<void>;
}

export class DatabaseError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

const HOST_CONFIG = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT) || 3306,
  database: process.env.MYSQL_DATABASE || 'dmsp',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
};

const POOL_CONFIG = {
  waitForConnections: true,
  multipleStatements: false,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT) || 60000,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
  queueLimit: Number(process.env.MYSQL_QUEUE_LIMIT) || 100
};

export class MySQLConnection implements DatabaseConnection {
  private pool: mysql2.Pool;
  public initPromise: Promise<void>;

  constructor() {
    logger.info('Establishing MySQL connection pool...');
    try {
      this.pool = mysql2.createPool({
        ...HOST_CONFIG,
        ...POOL_CONFIG
      });

      // Add initialization check
      this.initPromise = this.validateConnection();

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.pool.on('connection', (_connection) => {
        logger.trace('Connection established');
      })

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.pool.on('release', (_connection) => {
        logger.trace('Connection released');
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.pool.on('acquire', (_connection) => {
        logger.trace('Connection acquired');
      });
    } catch (err) {
      logger.error('Unable to establish the MySQL connection pool');
      throw new DatabaseError('Failed to create connection pool', err);
    }
  }

  // Verify that the pool is able to establish a connection
  private async validateConnection(): Promise<void> {
    const connection = await this.getConnection();
    connection.release();
  }

  // Get a new connection
  public async getConnection(): Promise<mysql2.PoolConnection> {
    try {
      return await this.pool.getConnection();
    } catch (err) {
      logger.error('Failed to get connection from pool');
      throw new DatabaseError('Failed to get connection from pool', err);
    }
  }

  public async releaseConnection(connection: mysql2.PoolConnection): Promise<void> {
    try {
      connection.release();
    } catch (err) {
      logger.error('Failed to release connection');
      throw new DatabaseError('Failed to release connection', err);
    }
  }

  // Query the database
  public async query<T>(sql: string, values: string[] = []): Promise<T> {
    let connection: mysql2.PoolConnection | null = null;
    try {
      // Wait for initialization to complete before querying
      await this.initPromise;

      connection = await this.getConnection();
      const sanitizedValues = values.map(val =>
        typeof val === 'string' ? val.trim() : val
      );

      const [rows] = await connection.execute(sql, sanitizedValues);
      return rows as T;
    } catch (err) {
      throw new DatabaseError('Database query failed', err);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  // Shutdown the pool
  public async close(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (err) {
        logger.error('Unable to close the MySQL connection pool');
        throw new DatabaseError('Failed to close connection pool', err);
      }
    }
  }

  public async getUserDMPs(requestLogger: Logger, token: JWTAccessToken): Promise<any> {
    // If there is no token bail out.
    if (!token?.email) return [];

    const sql = 'SELECT DISTINCT p.dmpId as dmpId, pcs.accessLevel as accessLevel ' +
      'FROM plans p ' +
      'INNER JOIN projects prj ON p.projectId = prj.id ' +
      'INNER JOIN projectCollaborators pcs ON prj.id = pcs.projectId ' +
      'WHERE pcs.email = ? ' +
      'ORDER BY p.dmpId;';
    const values = [token.email];

    try {
      const results = await this.query(sql, values);
      return Array.isArray(results) ? results : [];
    } catch (err) {
      requestLogger.error(prepareObjectForLogs({ sql, values, err }), 'Unable to process SQL query');
    }
  }
}
