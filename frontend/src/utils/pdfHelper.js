/**
 * PDF Helper Utility
 * Provides functions for viewing and downloading PDF files from Cloudinary
 * 
 * Key insight: Cloudinary raw resources don't support fl_inline/fl_attachment flags.
 * Solution: Fetch files as blobs and create blob URLs for both viewing and downloading.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'https://cms-backend-fjdo.onrender.com';

/**
 * Get the direct URL for accessing a file
 * @param {string} fileUrl - The original file URL
 * @returns {string} - The properly formatted file URL
 */
export const getDirectUrl = (fileUrl) => {
    if (!fileUrl) return '';

    // If it's already a full URL, return as-is
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        return fileUrl;
    }

    // If it's a relative path, prepend backend URL
    if (fileUrl.startsWith('/')) {
        return `${API_BASE_URL}${fileUrl}`;
    }

    return fileUrl;
};

/**
 * Extract a clean filename from a URL
 * @param {string} fileUrl - The file URL
 * @param {string} defaultName - Default name if extraction fails
 * @returns {string} - The extracted filename with .pdf extension
 */
export const extractFilename = (fileUrl, defaultName = 'paper') => {
    if (!fileUrl) return `${defaultName}.pdf`;

    try {
        // Get the last part of the URL path
        const urlPath = fileUrl.split('?')[0]; // Remove query params
        let filename = urlPath.split('/').pop();

        // If the filename is a cloudinary-style name, use the default instead
        if (filename.startsWith('paper-') && /paper-\d+-\d+/.test(filename)) {
            filename = defaultName;
        }

        // Ensure it has .pdf extension
        if (!filename.toLowerCase().endsWith('.pdf')) {
            filename = `${filename}.pdf`;
        }

        // Clean the filename for safety
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        return filename;
    } catch {
        return `${defaultName}.pdf`;
    }
};

/**
 * Fetch a file as a blob and create a blob URL with correct MIME type
 * This works around Cloudinary raw resource limitations
 * @param {string} fileUrl - The URL of the file to fetch
 * @returns {Promise<string>} - A blob URL that can be used in iframe/object tags
 */
export const fetchAsBlobUrl = async (fileUrl) => {
    if (!fileUrl) {
        throw new Error('No file URL provided');
    }

    const directUrl = getDirectUrl(fileUrl);
    const response = await fetch(directUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
    }

    // Get the blob data
    const blobData = await response.blob();

    // Create a new blob with explicit PDF MIME type
    // This ensures the browser knows to render it inline instead of downloading
    const pdfBlob = new Blob([blobData], { type: 'application/pdf' });

    return window.URL.createObjectURL(pdfBlob);
};

/**
 * Download a file programmatically as a blob with proper filename
 * This ensures the file downloads with the correct .pdf extension
 * @param {string} fileUrl - The URL of the file to download
 * @param {string} filename - Optional custom filename (will ensure .pdf extension)
 * @returns {Promise<void>}
 */
export const downloadPdfFile = async (fileUrl, filename = null) => {
    if (!fileUrl) {
        console.error('No file URL provided for download');
        return;
    }

    try {
        const downloadUrl = getDirectUrl(fileUrl);

        // Fetch the file as a blob
        const response = await fetch(downloadUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status}`);
        }

        const blob = await response.blob();

        // Determine the filename
        let finalFilename = filename || extractFilename(fileUrl, 'paper');

        // Ensure .pdf extension
        if (!finalFilename.toLowerCase().endsWith('.pdf')) {
            finalFilename = `${finalFilename}.pdf`;
        }

        // Create a blob URL and trigger download
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = finalFilename;
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
        console.error('Error downloading PDF:', error);
        // Fallback: open in new tab
        window.open(getDirectUrl(fileUrl), '_blank');
    }
};

/**
 * Open a PDF for viewing in a new tab
 * Fetches the file as blob first to avoid Cloudinary raw resource limitations
 * @param {string} fileUrl - The URL of the file to view
 */
export const viewPdfInNewTab = async (fileUrl) => {
    if (!fileUrl) {
        console.error('No file URL provided for viewing');
        return;
    }

    try {
        const blobUrl = await fetchAsBlobUrl(fileUrl);
        window.open(blobUrl, '_blank');
        // Note: We don't revoke the blob URL here as it would close the new tab's content
    } catch (error) {
        console.error('Error opening PDF:', error);
        // Fallback: try direct URL
        window.open(getDirectUrl(fileUrl), '_blank');
    }
};

// Keep legacy function names for backward compatibility
export const getFileUrl = getDirectUrl;
export const getViewableUrl = getDirectUrl; // Now just returns direct URL, iframe will use PdfViewer component

const pdfHelper = {
    getDirectUrl,
    getFileUrl,
    getViewableUrl,
    extractFilename,
    fetchAsBlobUrl,
    downloadPdfFile,
    viewPdfInNewTab
};

export default pdfHelper;
