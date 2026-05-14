/**
 * PDE Client Service
 * 
 * Handles all communication between CMS and the Paper Duplication Engine (PDE).
 * PDE is deployed at the URL configured via PDE_BASE_URL env variable.
 * 
 * Features:
 * - Multipart file forwarding (downloads from Cloudinary URL, sends to PDE)
 * - Exponential backoff retry logic
 * - Timeout handling
 * - Structured error responses (never leaks PDE internals)
 */

const axios = require('axios');
const FormData = require('form-data');
const { sanitizeMessage } = require('./errorSanitizer');

const PDE_BASE_URL = process.env.PDE_BASE_URL || 'https://econfmate-dds.onrender.com';
const PDE_API_KEY = process.env.PDE_API_KEY || '';
const PDE_TIMEOUT = parseInt(process.env.PDE_TIMEOUT_MS) || 15000;
const PDE_MAX_RETRIES = parseInt(process.env.PDE_MAX_RETRIES) || 3;

// Dedicated axios instance for PDE calls
const pdeAxios = axios.create({
  baseURL: PDE_BASE_URL,
  timeout: PDE_TIMEOUT,
  headers: {
    'X-API-Key': PDE_API_KEY
  }
});

/**
 * Execute a function with exponential backoff retry.
 * @param {Function} fn - Async function to execute
 * @param {number} retries - Max retry count
 * @returns {Promise<any>} - Result of fn
 */
async function withRetry(fn, retries = PDE_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable =
        !err.response || // network error
        err.code === 'ECONNABORTED' || // timeout
        (err.response && err.response.status >= 500); // server error

      if (!isRetryable || attempt === retries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s, ...
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[PDE] Retry ${attempt + 1}/${retries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Analyze a paper for duplication by sending it to PDE.
 * 
 * Downloads the file from the provided URL (Cloudinary) and forwards it
 * to PDE as multipart/form-data along with title and abstract.
 * 
 * @param {string} title - Paper title
 * @param {string} abstract - Paper abstract
 * @param {string} fileUrl - URL of the uploaded paper file (Cloudinary)
 * @returns {Promise<Object>} PDE analysis result:
 *   { paper_id, status, similarity_score, matched_paper_id, message }
 */
async function analyzePaper(title, abstract, fileUrl) {
  return withRetry(async () => {
    // Download the file from Cloudinary
    console.log('[PDE] Downloading paper from Cloudinary for analysis...');
    const fileResponse = await axios.get(fileUrl, {
      responseType: 'stream',
      timeout: PDE_TIMEOUT
    });

    // Determine filename from URL
    const urlPath = new URL(fileUrl).pathname;
    const filename = urlPath.split('/').pop() || 'paper.pdf';

    // Build multipart form
    const form = new FormData();
    form.append('title', title);
    form.append('abstract', abstract);
    form.append('file', fileResponse.data, {
      filename: filename,
      contentType: 'application/pdf'
    });

    console.log('[PDE] Sending paper to PDE for duplication analysis...');
    const response = await pdeAxios.post('/api/analyze', form, {
      headers: {
        ...form.getHeaders(),
        'X-API-Key': PDE_API_KEY
      },
      // Increase timeout for analysis (file processing)
      timeout: PDE_TIMEOUT * 2
    });

    console.log('[PDE] Analysis complete:', {
      paperId: response.data.paper_id,
      status: response.data.status,
      score: response.data.similarity_score
    });

    return response.data;
  });
}

/**
 * Get the status/report of a previously analyzed paper from PDE.
 * 
 * @param {string} pdePaperId - The paper_id returned by PDE during analysis
 * @returns {Promise<Object>} Paper status from PDE
 */
async function getPaperStatus(pdePaperId) {
  return withRetry(async () => {
    const response = await pdeAxios.get(`/api/status/${pdePaperId}`);
    return response.data;
  });
}

/**
 * Delete a paper's hash record from PDE.
 * Used during cleanup when a duplicate paper is rejected and needs full removal.
 * 
 * @param {string} pdePaperId - The paper_id returned by PDE during analysis
 * @returns {Promise<Object>} Deletion result
 */
async function deletePaperHash(pdePaperId) {
  return withRetry(async () => {
    const response = await pdeAxios.delete(`/api/paper/${pdePaperId}`);
    console.log(`[PDE] Deleted hash for paper: ${pdePaperId}`);
    return response.data;
  });
}

/**
 * Check if PDE service is reachable.
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
  try {
    const response = await pdeAxios.get('/health', { timeout: 5000 });
    return response.data?.status === 'ok';
  } catch (err) {
    console.error('[PDE] Health check failed:', sanitizeMessage(err.message));
    return false;
  }
}

module.exports = {
  analyzePaper,
  getPaperStatus,
  deletePaperHash,
  checkHealth
};
