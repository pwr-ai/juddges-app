/**
 * Utility functions for document handling
 */

/**
 * Clean document ID for use in URLs by removing any /doc/ prefix
 * Some document IDs in the database have a /doc/ prefix which should not be included in URLs
 *
 * @param docId - The document ID to clean
 * @returns The cleaned document ID suitable for use in URLs
 *
 * @example
 * cleanDocumentIdForUrl('/doc/863364CFD5') // '863364CFD5'
 * cleanDocumentIdForUrl('155025500002506_V_K_001055_2013_Uz_2013-11-14_001') // '155025500002506_V_K_001055_2013_Uz_2013-11-14_001'
 */
export const cleanDocumentIdForUrl = (docId: string): string => {
  return docId.replace(/^\/doc\//, '');
};
