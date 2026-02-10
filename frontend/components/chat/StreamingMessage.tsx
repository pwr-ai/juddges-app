import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface StreamingMessageProps {
  content: string;
  isComplete: boolean;
  onComplete?: () => void;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  content,
  isComplete,
  onComplete
}) => {
  const messageRef = useRef<HTMLDivElement>(null);
  const previousCompleteRef = useRef(isComplete);

  // SCROLLING DISABLED
  // Auto-scroll to bottom as content streams
  // useEffect(() => {
  //   if (messageRef.current) {
  //     messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  //   }
  // }, [content]);

  // Trigger completion callback
  useEffect(() => {
    if (isComplete && !previousCompleteRef.current && onComplete) {
      onComplete();
    }
    previousCompleteRef.current = isComplete;
  }, [isComplete, onComplete]);

  return (
    <div className="flex items-start gap-3 mb-4" ref={messageRef}>
      {/* AI Avatar */}
      <motion.div
        className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <span className="text-white text-lg">⚖️</span>
      </motion.div>

      {/* Message Bubble */}
      <motion.div
        className={`flex-1 bg-white border rounded-2xl rounded-tl-sm p-4 max-w-3xl ${
          isComplete ? 'border-gray-200' : 'border-blue-200'
        }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: 1,
          y: 0,
          boxShadow: isComplete
            ? ['0 0 0 0 rgba(34, 197, 94, 0.4)', '0 0 0 8px rgba(34, 197, 94, 0)']
            : '0 0 0 0 rgba(34, 197, 94, 0.4)'
        }}
        transition={{
          opacity: { duration: 0.3 },
          y: { duration: 0.3 },
          boxShadow: { duration: 0.5 }
        }}
      >
        {/* Message Content */}
        <div className="prose prose-sm max-w-none">
          <div className="text-slate-800 leading-relaxed">
            {content}
            {!isComplete && (
              <motion.span
                className="inline-block w-0.5 h-5 bg-blue-500 ml-1 align-middle"
                animate={{
                  opacity: [1, 1, 0, 0],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  times: [0, 0.45, 0.5, 1],
                }}
              >
                |
              </motion.span>
            )}
          </div>
        </div>

        {/* Message Actions (only show when complete) */}
        {isComplete && (
          <motion.div
            className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <button className="text-xs text-slate-600 hover:text-blue-600 transition-colors px-2 py-1 rounded hover:bg-blue-50">
              Copy
            </button>
            <button className="text-xs text-slate-600 hover:text-blue-600 transition-colors px-2 py-1 rounded hover:bg-blue-50">
              Share
            </button>
            <button className="text-xs text-slate-600 hover:text-blue-600 transition-colors px-2 py-1 rounded hover:bg-blue-50">
              Cite Sources
            </button>

            {/* Success indicator */}
            <div className="ml-auto flex items-center gap-1 text-green-600">
              <motion.svg
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <motion.path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </motion.svg>
              <span className="text-xs">Complete</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

// Component for token-by-token animation effect
export const AnimatedToken: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 0
}) => {
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: delay,
      }}
    >
      {children}
    </motion.span>
  );
};
