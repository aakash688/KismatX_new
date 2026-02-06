// Object Picking Utilities
// Handles object property selection and filtering

/**
 * Pick specific properties from an object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to pick
 * @returns {Object} Object with picked properties
 */
export const pick = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const result = {};
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};

/**
 * Omit specific properties from an object
 * @param {Object} obj - Source object
 * @param {Array} keys - Keys to omit
 * @returns {Object} Object without omitted properties
 */
export const omit = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
};

/**
 * Pick properties that match a condition
 * @param {Object} obj - Source object
 * @param {Function} predicate - Condition function
 * @returns {Object} Object with matching properties
 */
export const pickBy = (obj, predicate) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const result = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (predicate(value, key)) {
      result[key] = value;
    }
  });
  return result;
};

/**
 * Pick properties with non-null values
 * @param {Object} obj - Source object
 * @returns {Object} Object with non-null properties
 */
export const pickNonNull = (obj) => {
  return pickBy(obj, value => value !== null && value !== undefined);
};

/**
 * Pick properties with truthy values
 * @param {Object} obj - Source object
 * @returns {Object} Object with truthy properties
 */
export const pickTruthy = (obj) => {
  return pickBy(obj, value => Boolean(value));
};

/**
 * Deep pick properties from nested objects
 * @param {Object} obj - Source object
 * @param {Array} paths - Property paths to pick
 * @returns {Object} Object with picked nested properties
 */
export const deepPick = (obj, paths) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const result = {};
  paths.forEach(path => {
    const keys = path.split('.');
    let current = obj;
    let target = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) return;
      current = current[key];
      if (!(key in target)) target[key] = {};
      target = target[key];
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey in current) {
      target[lastKey] = current[lastKey];
    }
  });
  
  return result;
};
