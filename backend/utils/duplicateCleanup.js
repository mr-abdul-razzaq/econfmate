/**
 * Duplicate Submission Cleanup Utility
 * 
 * Handles the full cleanup pipeline when a paper is rejected as duplicate:
 * 1. Delete uploaded file from Cloudinary
 * 2. Delete hash record from PDE
 * 3. Update submission record with cleanup status
 * 4. Log all operations for audit
 * 
 * All operations are retryable and failures are tracked in the submission
 * document for admin visibility.
 */

const cloudinary = require('cloudinary').v2;
const { deletePaperHash } = require('./pdeClient');
const Submission = require('../models/Submission');
const { sanitizeMessage } = require('./errorSanitizer');

/**
 * Extract Cloudinary public_id from a Cloudinary URL.
 * Cloudinary URLs follow: https://res.cloudinary.com/{cloud}/raw/upload/v{version}/{folder}/{public_id}.{ext}
 * 
 * @param {string} fileUrl - The Cloudinary file URL
 * @returns {string|null} The public_id (including folder prefix)
 */
function extractCloudinaryPublicId(fileUrl) {
  try {
    if (!fileUrl) return null;

    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');

    // Find 'upload' segment, everything after version is the public_id
    const uploadIndex = pathParts.indexOf('upload');
    if (uploadIndex === -1) return null;

    // Skip version segment (v1234567890)
    const afterUpload = pathParts.slice(uploadIndex + 1);
    const startIndex = afterUpload[0]?.startsWith('v') ? 1 : 0;

    // Join remaining parts as public_id (includes folder path)
    // Remove file extension
    const publicIdWithExt = afterUpload.slice(startIndex).join('/');
    const lastDotIndex = publicIdWithExt.lastIndexOf('.');
    return lastDotIndex > -1 ? publicIdWithExt.substring(0, lastDotIndex) : publicIdWithExt;
  } catch (err) {
    console.error('[Cleanup] Failed to extract Cloudinary public_id:', sanitizeMessage(err.message));
    return null;
  }
}

/**
 * Delete a file from Cloudinary by its URL.
 * 
 * @param {string} fileUrl - Cloudinary file URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteFromCloudinary(fileUrl) {
  try {
    const publicId = extractCloudinaryPublicId(fileUrl);
    if (!publicId) {
      console.warn('[Cleanup] Could not extract public_id from URL:', fileUrl);
      return { success: false, error: 'Could not extract public_id from file URL' };
    }

    console.log(`[Cleanup] Deleting from Cloudinary: ${publicId}`);

    // Conference papers are uploaded as 'raw' resource type
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });

    if (result.result === 'ok' || result.result === 'not found') {
      console.log(`[Cleanup] Cloudinary deletion successful: ${publicId}`);
      return { success: true };
    }

    console.warn(`[Cleanup] Cloudinary deletion returned: ${result.result}`);
    return { success: false, error: `Cloudinary returned: ${result.result}` };
  } catch (err) {
    console.error('[Cleanup] Cloudinary deletion failed:', sanitizeMessage(err.message));
    return { success: false, error: sanitizeMessage(err.message) };
  }
}

/**
 * Full cleanup pipeline for a duplicate-rejected submission.
 * 
 * Steps:
 * 1. Delete file from Cloudinary
 * 2. Delete hash from PDE (if PDE paper_id exists)
 * 3. Update submission cleanup status in DB
 * 
 * @param {string} submissionId - MongoDB _id of the submission
 * @returns {Promise<{cloudinaryDeleted: boolean, pdeHashDeleted: boolean, errors: string[]}>}
 */
async function cleanupDuplicateSubmission(submissionId) {
  const errors = [];
  let cloudinaryDeleted = false;
  let pdeHashDeleted = false;

  console.log(`[Cleanup] Starting cleanup for submission: ${submissionId}`);

  try {
    const submission = await Submission.findById(submissionId);
    if (!submission) {
      console.error(`[Cleanup] Submission not found: ${submissionId}`);
      return { cloudinaryDeleted, pdeHashDeleted, errors: ['Submission not found'] };
    }

    // 1. Delete from Cloudinary
    if (submission.fileUrl) {
      const cloudResult = await deleteFromCloudinary(submission.fileUrl);
      cloudinaryDeleted = cloudResult.success;
      if (!cloudResult.success) {
        errors.push(`Cloudinary: ${cloudResult.error}`);
      }
    } else {
      cloudinaryDeleted = true; // Nothing to delete
    }

    // 2. Delete hash from PDE
    const pdePaperId = submission.duplicationCheck?.pdePaperId;
    if (pdePaperId) {
      try {
        await deletePaperHash(pdePaperId);
        pdeHashDeleted = true;
      } catch (err) {
        console.error('[Cleanup] PDE hash deletion failed:', sanitizeMessage(err.message));
        errors.push(`PDE: ${sanitizeMessage(err.message)}`);
      }
    } else {
      pdeHashDeleted = true; // No PDE record to delete
    }

    // 3. Update submission cleanup status
    await Submission.findByIdAndUpdate(submissionId, {
      cleanupStatus: {
        cloudinaryDeleted,
        pdeHashDeleted,
        cleanedAt: new Date(),
        cleanupError: errors.length > 0 ? errors.join('; ') : null
      }
    });

    console.log(`[Cleanup] Cleanup complete for ${submissionId}:`, {
      cloudinaryDeleted,
      pdeHashDeleted,
      errors: errors.length > 0 ? errors : 'none'
    });

  } catch (err) {
    console.error('[Cleanup] Fatal cleanup error:', sanitizeMessage(err.message));
    errors.push(`Fatal: ${sanitizeMessage(err.message)}`);

    // Try to save the error state even if cleanup failed
    try {
      await Submission.findByIdAndUpdate(submissionId, {
        'cleanupStatus.cleanupError': errors.join('; ')
      });
    } catch (saveErr) {
      console.error('[Cleanup] Failed to save cleanup error state:', sanitizeMessage(saveErr.message));
    }
  }

  return { cloudinaryDeleted, pdeHashDeleted, errors };
}

module.exports = {
  cleanupDuplicateSubmission,
  deleteFromCloudinary,
  extractCloudinaryPublicId
};
