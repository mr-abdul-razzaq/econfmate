/**
 * PDF Helper Utility
 * Provides functions for viewing and downloading PDF files from Cloudinary
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
 * Get a viewable URL for a PDF file
 * For Cloudinary raw resources, adds fl_inline flag to make the PDF render in browser
 * @param {string} fileUrl - The original file URL
 * @returns {string} - A URL that can be used for inline viewing (in iframe or new tab)
 */
export const getViewableUrl = (fileUrl) => {
    if (!fileUrl) return '';

    const fullUrl = getDirectUrl(fileUrl);

    // For Cloudinary raw resources, add fl_inline flag to enable browser rendering
    // This changes Content-Disposition from "attachment" to "inline"
    if (fullUrl.includes('cloudinary.com') && fullUrl.includes('/raw/upload/')) {
        // Insert fl_inline flag after /upload/
        return fullUrl.replace('/raw/upload/', '/raw/upload/fl_inline/');
    }

    return fullUrl;
};

/**
 * Get a downloadable URL for a file
 * For Cloudinary resources, adds fl_attachment flag to force download
 * @param {string} fileUrl - The original file URL
 * @returns {string} - A URL that forces download when accessed
 */
export const getDownloadUrl = (fileUrl) => {
    if (!fileUrl) return '';

    const fullUrl = getDirectUrl(fileUrl);

    // For Cloudinary raw resources, add fl_attachment flag to force download
    if (fullUrl.includes('cloudinary.com') && fullUrl.includes('/raw/upload/')) {
        // Insert fl_attachment flag after /upload/
        return fullUrl.replace('/raw/upload/', '/raw/upload/fl_attachment/');
    }

    return fullUrl;
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

        // Clean up Cloudinary flags from filename
        filename = filename.replace(/^fl_(inline|attachment)\//, '');

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
        // Get the direct file URL (no flags needed, we'll handle download ourselves)
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

        // Fallback: try opening with fl_attachment flag
        const fallbackUrl = getDownloadUrl(fileUrl);
        window.open(fallbackUrl, '_blank');
    }
};

/**
 * Open a PDF for viewing in a new tab
 * Uses fl_inline flag for Cloudinary URLs so PDF renders in browser
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

// Keep legacy function name for backward compatibility
export const getFileUrl = getDirectUrl;

const pdfHelper = {
    getDirectUrl,
    getViewableUrl,
    getDownloadUrl,
    getFileUrl,
    extractFilename,
    downloadPdfFile,
    viewPdfInNewTab
};

export default pdfHelper;
