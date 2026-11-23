// Helper to extract error message and code from backend response
export async function parseBackendError(response: Response): Promise<{ message: string; code: string }> {
  const defaultMessage = `Backend API error: ${response.status}`;
  const defaultCode = 'BACKEND_ERROR';

  try {
    const text = await response.text();
    try {
      const errorData = JSON.parse(text);
      const detail = errorData.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail?.message || detail?.error || errorData.message || errorData.error || defaultMessage;
      const code = detail?.code || errorData.code || defaultCode;
      return { message, code };
    } catch {
      return { message: text || defaultMessage, code: defaultCode };
    }
  } catch {
    return { message: defaultMessage, code: defaultCode };
  }
}
