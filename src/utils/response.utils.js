/**
 * Standardised API response helpers.
 * All controllers should use these instead of raw res.status().json()
 */

const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null, meta = null }) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendCreated = (res, { message = 'Created successfully', data = null }) =>
  sendSuccess(res, { statusCode: 201, message, data });

const sendPaginated = (res, { data, total, page, limit, message = 'Success' }) =>
  sendSuccess(res, {
    message,
    data,
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });

const sendError = (res, { statusCode = 500, message = 'Something went wrong' }) =>
  res.status(statusCode).json({ success: false, message });

module.exports = { sendSuccess, sendCreated, sendPaginated, sendError };
