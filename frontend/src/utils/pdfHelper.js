/**
 * PDF Helper Utility
 * Provides functions for viewing and downloading PDF files from Cloudinary
 */

const API_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'https://cms-backend-fjdo.onrender.com';

/**
 * Get a viewable URL for a PDF file
 * Uses Google Docs Viewer for Cloudinary raw resources that can't render inline
 * @param {string} fileUrl - The original file URL
 * @returns {string} - A URL that can be used in an iframe for viewing
 */
export const getViewableUrl = (fileUrl) => {
    if (!fileUrl) return '';

    // Get the full URL first
    let fullUrl = fileUrl;

    // If it's a relative path, prepend backend URL
    if (fileUrl.startsWith('/')) {
        fullUrl = `${API_BASE_URL}${fileUrl}`;
    }

    // For Cloudinary raw resources, use Google Docs Viewer
    if (fullUrl.includes('cloudinary.com') && fullUrl.includes('/raw/')) {
        // Google Docs Viewer can render any public PDF
        return `https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`;
    }

    // For image-type PDFs or other URLs, return as-is
    return fullUrl;
};

/**
 * Get the direct URL for a file (for downloads or linking)
 * @param {string} fileUrl - The original file URL
 * @param {boolean} forDownload - Whether this is for a download (adds fl_attachment flag)
 * @returns {string} - The processed file URL
 */
export const getFileUrl = (fileUrl, forDownload = false) => {
    if (!fileUrl) return '';

    // If it's already a full URL
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        // For Cloudinary URLs, add attachment flag for downloads
        if (fileUrl.includes('cloudinary.com') && forDownload) {
            return fileUrl.replace('/upload/', '/upload/fl_attachment/');
        }
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

        // Remove any Cloudinary transformations from the filename
        if (filename.includes('fl_attachment')) {
            filename = filename.replace('fl_attachment', '').replace(/^\/+/, '');
        }

        // Ensure it has .pdf extension
        if (!filename.toLowerCase().endsWith('.pdf')) {
            filename = `${filename}.pdf`;
        }

        return filename;
    } catch {
        return `${defaultName}.pdf`;
    }
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
        // Get the direct file URL (with attachment flag for Cloudinary)
        const downloadUrl = getFileUrl(fileUrl, true);

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

        // Fallback: open in new tab if blob download fails
        const fallbackUrl = getFileUrl(fileUrl, true);
        window.open(fallbackUrl, '_blank');
    }
};

/**
 * Open a PDF for viewing in a new tab
 * @param {string} fileUrl - The URL of the file to view
 */
export const viewPdfInNewTab = (fileUrl) => {
    if (!fileUrl) {
        console.error('No file URL provided for viewing');
        return;
    }

    const viewUrl = getViewableUrl(fileUrl);
    window.open(viewUrl, '_blank');
};

const pdfHelper = {
    getViewableUrl,
    getFileUrl,
    extractFilename,
    downloadPdfFile,
    viewPdfInNewTab
};

export default pdfHelper;
