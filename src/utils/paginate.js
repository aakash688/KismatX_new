// Pagination Utilities
// Handles pagination for API responses

/**
 * Create pagination metadata
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 * @returns {Object} Pagination metadata
 */
export const createPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null
  };
};

/**
 * Apply pagination to query
 * @param {Object} queryBuilder - TypeORM query builder
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Object} Query builder with pagination
 */
export const applyPagination = (queryBuilder, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  return queryBuilder
    .skip(offset)
    .take(limit);
};

/**
 * Create paginated response
 * @param {Array} data - Response data
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} Paginated response
 */
export const createPaginatedResponse = (data, page, limit, total) => {
  return {
    data,
    pagination: createPaginationMeta(page, limit, total)
  };
};
