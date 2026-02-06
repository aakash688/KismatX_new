/**
 * Supabase Client Configuration for Cloudflare Workers
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client
 * @param {Object} env - Cloudflare Worker environment variables
 * @returns {Object} Supabase client instance
 */
export function getSupabaseClient(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

/**
 * Execute a query with error handling
 * @param {Function} queryFn - Async function that executes the query
 * @returns {Promise} Query result or throws error
 */
export async function executeQuery(queryFn) {
  try {
    const { data, error } = await queryFn();
    
    if (error) {
      console.error('Supabase query error:', error);
      throw new Error(error.message || 'Database query failed');
    }
    
    return data;
  } catch (err) {
    console.error('Query execution error:', err);
    throw err;
  }
}

/**
 * Execute an insert operation with proper error handling
 * Always calls .select() to return the inserted data and detect errors
 * @param {Function} queryFn - Async function that executes the insert
 * @returns {Promise} Insert result or throws error
 */
export async function executeInsert(queryFn) {
  try {
    const { data, error } = await queryFn();
    
    if (error) {
      console.error('Supabase insert error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.details);
      throw new Error(error.message || 'Database insert failed');
    }
    
    return data;
  } catch (err) {
    console.error('Insert execution error:', err);
    throw err;
  }
}
