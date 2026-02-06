// TypeORM Logger Configuration
// Custom logger for TypeORM database operations

import { logger } from './logger.js';

export default class CustomLogger {
  logQuery(query, parameters) {
    logger.debug('Database Query', {
      query: query,
      parameters: parameters
    });
  }

  logQueryError(error, query, parameters) {
    logger.error('Database Query Error', error, {
      query: query,
      parameters: parameters
    });
  }

  logQuerySlow(time, query, parameters) {
    logger.warn('Slow Database Query', {
      time: time,
      query: query,
      parameters: parameters
    });
  }

  logSchemaBuild(message) {
    logger.debug('Database Schema Build', { message });
  }

  logMigration(message) {
    logger.info('Database Migration', { message });
  }

  log(level, message) {
    switch (level) {
      case 'log':
        logger.info('Database Log', { message });
        break;
      case 'info':
        logger.info('Database Info', { message });
        break;
      case 'warn':
        logger.warn('Database Warning', { message });
        break;
      case 'error':
        logger.error('Database Error', { message });
        break;
      default:
        logger.debug('Database Debug', { message });
    }
  }
}
