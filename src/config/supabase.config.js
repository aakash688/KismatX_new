/**
 * Supabase Configuration
 * Connection setup for KismatX backend to Supabase PostgreSQL
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in your .env file');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

/**
 * Helper function to provide TypeORM-like repository pattern
 * This makes migration from TypeORM easier
 * 
 * @param {string} tableName - Name of the table
 * @returns {object} Repository-like object with common methods
 */
export const getRepository = (tableName) => {
  return {
    /**
     * Find multiple records
     * @param {object} options - Query options
     * @returns {Promise<Array>}
     */
    find: async (options = {}) => {
      let query = supabase.from(tableName).select('*');
      
      // Handle where conditions
      if (options.where) {
        Object.keys(options.where).forEach(key => {
          const value = options.where[key];
          if (value !== null && value !== undefined) {
            query = query.eq(key, value);
          }
        });
      }
      
      // Handle relations (basic join support)
      if (options.relations) {
        const selectFields = ['*'];
        options.relations.forEach(relation => {
          selectFields.push(`${relation}(*)`);
        });
        query = supabase.from(tableName).select(selectFields.join(','));
      }
      
      // Handle ordering
      if (options.order) {
        Object.keys(options.order).forEach(key => {
          const direction = options.order[key].toLowerCase();
          query = query.order(key, { ascending: direction === 'asc' });
        });
      }
      
      // Handle limit
      if (options.take) {
        query = query.limit(options.take);
      }
      
      // Handle offset
      if (options.skip) {
        query = query.range(options.skip, options.skip + (options.take || 10) - 1);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    
    /**
     * Find a single record
     * @param {object} options - Query options
     * @returns {Promise<object|null>}
     */
    findOne: async (options = {}) => {
      let query = supabase.from(tableName).select('*');
      
      // Handle where conditions
      if (options.where) {
        Object.keys(options.where).forEach(key => {
          query = query.eq(key, options.where[key]);
        });
      }
      
      // Handle relations
      if (options.relations) {
        const selectFields = ['*'];
        options.relations.forEach(relation => {
          selectFields.push(`${relation}(*)`);
        });
        query = supabase.from(tableName).select(selectFields.join(','));
      }
      
      const { data, error } = await query.single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data;
    },
    
    /**
     * Create a new record
     * @param {object} entity - Data to insert
     * @returns {object} Created entity
     */
    create: (entity) => {
      return entity; // Just return the entity, actual save happens in save()
    },
    
    /**
     * Save (insert or update) a record
     * @param {object} entity - Data to save
     * @returns {Promise<object>}
     */
    save: async (entity) => {
      if (entity.id) {
        // Update existing record
        const { data, error } = await supabase
          .from(tableName)
          .update(entity)
          .eq('id', entity.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from(tableName)
          .insert(entity)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    
    /**
     * Delete a record by ID
     * @param {number} id - Record ID
     * @returns {Promise<void>}
     */
    delete: async (id) => {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    
    /**
     * Count records
     * @param {object} options - Query options
     * @returns {Promise<number>}
     */
    count: async (options = {}) => {
      let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
      
      if (options.where) {
        Object.keys(options.where).forEach(key => {
          query = query.eq(key, options.where[key]);
        });
      }
      
      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    
    /**
     * Create a query builder (simplified version)
     * @param {string} alias - Table alias
     * @returns {object} Query builder
     */
    createQueryBuilder: (alias) => {
      let queryConfig = {
        select: '*',
        where: [],
        order: null,
        limit: null,
        offset: null
      };
      
      return {
        select: (fields) => {
          queryConfig.select = fields;
          return this;
        },
        where: (condition, params) => {
          queryConfig.where.push({ condition, params });
          return this;
        },
        andWhere: (condition, params) => {
          queryConfig.where.push({ condition, params });
          return this;
        },
        orderBy: (field, direction) => {
          queryConfig.order = { field, direction };
          return this;
        },
        limit: (limit) => {
          queryConfig.limit = limit;
          return this;
        },
        skip: (offset) => {
          queryConfig.offset = offset;
          return this;
        },
        getMany: async () => {
          let query = supabase.from(tableName).select(queryConfig.select);
          
          // Apply where conditions
          queryConfig.where.forEach(({ condition, params }) => {
            Object.keys(params).forEach(key => {
              query = query.eq(key, params[key]);
            });
          });
          
          // Apply ordering
          if (queryConfig.order) {
            query = query.order(queryConfig.order.field, {
              ascending: queryConfig.order.direction.toLowerCase() === 'asc'
            });
          }
          
          // Apply limit
          if (queryConfig.limit) {
            query = query.limit(queryConfig.limit);
          }
          
          // Apply offset
          if (queryConfig.offset) {
            query = query.range(queryConfig.offset, queryConfig.offset + (queryConfig.limit || 10) - 1);
          }
          
          const { data, error } = await query;
          if (error) throw error;
          return data || [];
        },
        getOne: async () => {
          let query = supabase.from(tableName).select(queryConfig.select);
          
          queryConfig.where.forEach(({ condition, params }) => {
            Object.keys(params).forEach(key => {
              query = query.eq(key, params[key]);
            });
          });
          
          const { data, error } = await query.single();
          if (error && error.code !== 'PGRST116') throw error;
          return data;
        },
        getCount: async () => {
          let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
          
          queryConfig.where.forEach(({ condition, params }) => {
            Object.keys(params).forEach(key => {
              query = query.eq(key, params[key]);
            });
          });
          
          const { count, error } = await query;
          if (error) throw error;
          return count || 0;
        }
      };
    }
  };
};

/**
 * AppDataSource-like object for compatibility with existing code
 * This allows minimal changes to existing TypeORM code
 */
export const AppDataSource = {
  initialize: async () => {
    try {
      // Test connection
      const { data, error } = await supabase.from('settings').select('count');
      if (error) throw error;
      console.log('✅ Supabase connection established successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('❌ Failed to connect to Supabase:', error);
      throw error;
    }
  },
  
  getRepository: (entityName) => {
    // Convert entity names to table names (lowercase, snake_case)
    const tableMap = {
      'User': 'users',
      'Role': 'roles',
      'Permission': 'permissions',
      'RefreshToken': 'refresh_tokens',
      'Game': 'games',
      'BetSlip': 'bet_slips',
      'BetDetail': 'bet_details',
      'GameCardTotal': 'game_card_totals',
      'WalletLog': 'wallet_logs',
      'AuditLog': 'audit_logs',
      'LoginHistory': 'login_history',
      'Settings': 'settings',
      'SettingsLog': 'settings_logs'
    };
    
    const tableName = tableMap[entityName] || entityName.toLowerCase();
    return getRepository(tableName);
  },
  
  synchronize: async () => {
    console.log('⚠️ Synchronize is not needed with Supabase (schema managed via migrations)');
    return Promise.resolve();
  }
};

// Export supabase client as default
export default supabase;
