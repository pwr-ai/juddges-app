import { apiLogger, DocumentRetrievalInput, ApiResponse, StreamData, StreamChatCallbacks } from './client';

// Configuration for simulated streaming
const SIMULATE_STREAMING = true; // Set to false to disable
const CHARS_PER_CHUNK = 10; // Characters to show per update (~2 words at a time)
const CHUNK_DELAY_MS = 25; // Milliseconds between chunks (40 updates/second = ~400 chars/sec)

export async function askQuestion(
  input: DocumentRetrievalInput
): Promise<ApiResponse> {
  const response = await fetch(`/api/qa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export async function askChatQuestion(
  input: DocumentRetrievalInput
): Promise<ApiResponse> {
  const response = await fetch(`/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    // Try to parse error response to get more details
    let errorMessage = `API error: ${response.status}`;
    let errorDetails: unknown = null;

    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'string'
          ? errorData.detail
          : JSON.stringify(errorData.detail);
      }
      errorDetails = errorData;
    } catch {
      // If we can't parse JSON, try to get text
      try {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = errorText;
        }
      } catch {
        // Use default error message
      }
    }

    const error = new Error(errorMessage);
    (error as Error & { status?: number; details?: unknown }).status = response.status;
    (error as Error & { status?: number; details?: unknown }).details = errorDetails;
    throw error;
  }

  return response.json();
}

export async function streamChatQuestion(
  input: DocumentRetrievalInput,
  callbacks: StreamChatCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {
    const response = await fetch(`/api/chat?stream=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal,
    });

    if (!response.ok) {
      // Try to parse error response to get more details
      let errorMessage = `API error: ${response.status}`;
      let errorDetails: unknown = null;

      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorMessage = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail);
        }
        errorDetails = errorData;
      } catch {
        // If we can't parse JSON, try to get text
        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        } catch {
          // Use default error message
        }
      }

      const error = new Error(errorMessage);
      (error as Error & { status?: number; details?: unknown }).status = response.status;
      (error as Error & { status?: number; details?: unknown }).details = errorDetails;
      throw error;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get response reader");
    }

    // Process the stream
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let documentIds: string[] | undefined;
    let latestChunkSequence = 0;
    // Track pending animation timeout IDs so we can cancel them on new chunks
    let pendingAnimationTimeouts: ReturnType<typeof setTimeout>[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining buffer before completing
          if (buffer.trim()) {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim() === "" || !line.startsWith("data: ")) continue;

              const jsonStr = line.slice(5).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const data = JSON.parse(jsonStr);

                if (data.event === "data" && data.data) {
                  const text = data.data.text || data.data?.chunk?.text || "";
                  if (text && text.length > fullText.length) {
                    fullText = text;
                    callbacks.onToken(text);
                  }
                  if (data.data.document_ids) {
                    documentIds = data.data.document_ids;
                  }
                }
              } catch (e) {
                apiLogger.error("Error parsing buffered SSE data", e);
              }
            }
          }

          callbacks.onComplete(fullText, documentIds);
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete events in the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(5).trim();

            // Skip the [DONE] message
            if (jsonStr === "[DONE]") continue;

            try {
              const data = JSON.parse(jsonStr);

              // Try to extract text from ANY structure
              let extractedText = "";
              let extractedDocIds: string[] | undefined;

              // Method 1: Check if data.event === "data" (LangServe format)
              if (data.event === "data") {
                const chunk = data.data?.chunk;
                const directData = data.data;

                // Try chunk first
                if (chunk) {
                  if (typeof chunk === "string") {
                    extractedText = chunk;
                  } else if (chunk.text) {
                    extractedText = chunk.text;
                  } else if (chunk.output?.text) {
                    extractedText = chunk.output.text;
                  } else if (chunk.content) {
                    extractedText = typeof chunk.content === "string" ? chunk.content : "";
                  }
                }

                // Try direct data
                if (!extractedText && directData) {
                  if (typeof directData === "string") {
                    extractedText = directData;
                  } else if (directData.text) {
                    extractedText = directData.text;
                  } else if (directData.output?.text) {
                    extractedText = directData.output.text;
                  }
                }

                // Extract document IDs
                if (chunk?.document_ids) {
                  extractedDocIds = chunk.document_ids;
                } else if (directData?.document_ids) {
                  extractedDocIds = directData.document_ids;
                }
              }
              // Method 2: Maybe it's a direct response without event wrapper
              else if (data.text) {
                extractedText = data.text;
                extractedDocIds = data.document_ids;
              }
              // Method 3: Check for output property
              else if (data.output?.text) {
                extractedText = data.output.text;
                extractedDocIds = data.output.document_ids;
              }
              // Method 4: Metadata event
              else if (data.event === "metadata" && callbacks.onMetadata) {
                callbacks.onMetadata(data.data);
              }
              // Method 5: End event
              else if (data.event === "end") {
                const output = data.data?.output || data.output;
                if (output && output.text && !fullText) {
                  extractedText = output.text;
                  extractedDocIds = output.document_ids;
                }
              }

              // Process extracted text
              if (extractedText) {
                // Backend sends progressively growing text (buffer filling up)
                // Use length as the key - only update if we got MORE text than before
                const textLength = extractedText.length;

                if (textLength > fullText.length) {
                  // Cancel any in-progress animation before starting a new one
                  // This prevents visual "jumping" when a new chunk arrives mid-animation
                  if (pendingAnimationTimeouts.length > 0) {
                    for (const tid of pendingAnimationTimeouts) {
                      clearTimeout(tid);
                    }
                    pendingAnimationTimeouts = [];
                    // Jump to the current full text so the user sees all content so far
                    callbacks.onToken(fullText);
                  }

                  const chunkSequence = ++latestChunkSequence;
                  const previousLength = fullText.length;
                  fullText = extractedText;

                  const sendToken = (token: string): void => {
                    if (chunkSequence !== latestChunkSequence) {
                      return;
                    }
                    callbacks.onToken(token);
                  };

                  // Simulate slower streaming for smoother visual effect
                  if (SIMULATE_STREAMING && previousLength === 0) {
                    // First chunk - simulate token-by-token rendering
                    let currentPos = 0;
                    const streamChunks = (): void => {
                      if (chunkSequence !== latestChunkSequence) {
                        return;
                      }

                      if (currentPos < extractedText.length) {
                        const nextPos = Math.min(currentPos + CHARS_PER_CHUNK, extractedText.length);
                        const chunk = extractedText.substring(0, nextPos);
                        sendToken(chunk);
                        currentPos = nextPos;

                        if (currentPos < extractedText.length) {
                          const tid = setTimeout(streamChunks, CHUNK_DELAY_MS);
                          pendingAnimationTimeouts.push(tid);
                        }
                      }
                    };
                    streamChunks();
                  } else {
                    // Subsequent updates or no simulation - send immediately
                    sendToken(extractedText);
                  }
                }
              }
              // Note: Not all events have text (e.g., metadata, empty end events) - this is expected

              // Update document IDs if found
              if (extractedDocIds) {
                documentIds = extractedDocIds;
              }
            } catch (e) {
              apiLogger.error("Error parsing SSE data", e, { line: jsonStr });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error) {
      // Don't call onError for AbortError (user cancelled)
      if (error.name === "AbortError") {
        return;
      }
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error("Unknown error occurred during streaming"));
    }
  }
}

export async function streamQuestion(
  input: DocumentRetrievalInput,
  onData: (data: StreamData) => void,
  onComplete: () => void
): Promise<void> {
  const response = await fetch(`/api/qa/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  // Process the stream
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      onComplete();
      break;
    }

    // Decode the chunk and add to buffer
    buffer += decoder.decode(value, { stream: true });

    // Process complete events in the buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

    for (const line of lines) {
      if (line.trim() === "") continue;

      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(5).trim();
        try {
          const data = JSON.parse(jsonStr);
          onData(data);
        } catch (e) {
          apiLogger.error("Error parsing SSE data", e);
        }
      }
    }
  }
}
