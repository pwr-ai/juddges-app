import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LoadingMessageProps {
  style?: 'judicial' | 'modern' | 'innovation';
  queryType?: 'contract' | 'caselaw' | 'regulatory' | 'general';
  estimatedDuration?: number;
  onComplete?: () => void;
}

interface Stage {
  id: string;
  color: string;
  icon: string;
  label: string;
}

const stages: Stage[] = [
  { id: 'analyzing', color: '#3b82f6', icon: '🔍', label: 'Analyzing' },
  { id: 'retrieving', color: '#8b5cf6', icon: '📚', label: 'Retrieving' },
  { id: 'reasoning', color: '#ec4899', icon: '⚖️', label: 'Reasoning' },
  { id: 'generating', color: '#10b981', icon: '✍️', label: 'Generating' }
];

const messages = {
  contract: {
    analyzing: 'Reading contract clauses...',
    retrieving: 'Searching contract law database...',
    reasoning: 'Analyzing provisions...',
    generating: 'Drafting interpretation...'
  },
  caselaw: {
    analyzing: 'Understanding legal issue...',
    retrieving: 'Searching case law...',
    reasoning: 'Analyzing precedents...',
    generating: 'Synthesizing findings...'
  },
  regulatory: {
    analyzing: 'Identifying regulations...',
    retrieving: 'Cross-referencing requirements...',
    reasoning: 'Evaluating compliance...',
    generating: 'Preparing guidance...'
  },
  general: {
    analyzing: 'Analyzing your question...',
    retrieving: 'Searching legal documents...',
    reasoning: 'Formulating legal reasoning...',
    generating: 'Preparing response...'
  }
};

const wittyMessages = [
  "Consulting my law books... (the digital ones)",
  "Channeling my inner legal scholar...",
  "Running this by my virtual law clerks...",
  "Applying legal reasoning (without the billable hours)...",
  "Analyzing precedents at the speed of light...",
  "Cross-referencing 50+ legal sources...",
  "Ensuring accuracy before responding..."
];

export const LoadingMessage: React.FC<LoadingMessageProps> = ({
  style = 'modern',
  queryType = 'general',
  estimatedDuration = 15,
}) => {
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [wittyMessage, setWittyMessage] = useState('');

  useEffect(() => {
    // Randomly select a witty message for long responses
    if (estimatedDuration > 15 && style !== 'judicial') {
      const randomIndex = Math.floor(Math.random() * wittyMessages.length);
      setWittyMessage(wittyMessages[randomIndex]);
    }

    const stageDuration = estimatedDuration / stages.length;

    // Progress update
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        const increment = 100 / (estimatedDuration * 10);
        const newProgress = prev + increment;
        if (newProgress >= 99) {
          clearInterval(progressInterval);
          return 99;
        }
        return newProgress;
      });
    }, 100);

    // Stage transitions
    const stageInterval = setInterval(() => {
      setCurrentStage(prev => {
        if (prev < stages.length - 1) return prev + 1;
        return prev;
      });
    }, stageDuration * 1000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(stageInterval);
    };
  }, [estimatedDuration, style]);

  const currentStageData = stages[currentStage];
  const currentMessage = messages[queryType]?.[currentStageData.id as keyof typeof messages.contract] ||
                         messages.general[currentStageData.id as keyof typeof messages.general];

  if (style === 'judicial') {
    return <JudicialLoadingMessage currentMessage={currentMessage} progress={progress} />;
  }

  if (style === 'innovation') {
    return (
      <InnovationLoadingMessage
        currentStage={currentStageData}
        currentMessage={currentMessage}
        progress={progress}
        wittyMessage={wittyMessage}
        stageIndex={currentStage}
      />
    );
  }

  // Default: Modern Counsel style
  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Animated Avatar */}
      <div className="relative flex-shrink-0">
        <motion.div
          className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center relative overflow-hidden"
          animate={{
            y: [0, -4, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          {/* Rotating outer ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-white/30"
            animate={{ rotate: 360 }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
            style={{
              borderTopColor: 'white',
              borderRightColor: 'transparent',
            }}
          />

          {/* Icon */}
          <motion.span
            className="text-white text-lg z-10"
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
            }}
          >
            {currentStageData.icon}
          </motion.span>
        </motion.div>

        {/* Progress ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="22"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          <motion.circle
            cx="50%"
            cy="50%"
            r="22"
            fill="none"
            stroke={currentStageData.color}
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: progress / 100 }}
            style={{
              strokeDasharray: '0 1',
            }}
          />
        </svg>
      </div>

      {/* Message Bubble */}
      <motion.div
        className="flex-1 bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-2xl rounded-tl-sm p-4 relative overflow-hidden max-w-md"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear"
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Stage indicator */}
          <div className="flex items-center gap-2 mb-3">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center"
              >
                <motion.div
                  className={`w-2 h-2 rounded-full ${
                    index < currentStage
                      ? 'bg-green-500'
                      : index === currentStage
                      ? 'bg-blue-500'
                      : 'bg-gray-300'
                  }`}
                  animate={
                    index === currentStage
                      ? {
                          scale: [1, 1.3, 1],
                        }
                      : {}
                  }
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                />
                {index < stages.length - 1 && (
                  <div className="w-6 h-0.5 bg-gray-200 mx-1" />
                )}
              </div>
            ))}
          </div>

          {/* Message */}
          <AnimatePresence mode="wait">
            <motion.p
              key={currentStage}
              className="text-sm text-slate-700 font-medium mb-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {currentMessage}
            </motion.p>
          </AnimatePresence>

          {/* Witty message for long responses */}
          {wittyMessage && (
            <motion.p
              className="text-xs text-slate-500 italic mb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
            >
              {wittyMessage}
            </motion.p>
          )}

          {/* Typing indicator */}
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-slate-400 rounded-full"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// Judicial Precision Style (Conservative)
const JudicialLoadingMessage: React.FC<{ currentMessage: string; progress: number }> = ({
  currentMessage,
  progress
}) => {
  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Simple Avatar with Pulse */}
      <motion.div
        className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center"
        animate={{
          boxShadow: [
            '0 0 0 0 rgba(51, 65, 85, 0.3)',
            '0 0 0 8px rgba(51, 65, 85, 0)',
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
        }}
      >
        <span className="text-white text-lg">⚖️</span>
      </motion.div>

      {/* Minimal Bubble */}
      <motion.div
        className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm p-4 max-w-md"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="text-sm text-slate-600 font-medium mb-3">
          {currentMessage}
        </p>

        {/* Simple progress bar */}
        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-slate-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Classic typing dots */}
        <div className="flex gap-1 mt-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 bg-slate-400 rounded-full"
              animate={{
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.3,
              }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// Legal Innovation Style (Progressive)
const InnovationLoadingMessage: React.FC<{
  currentStage: Stage;
  currentMessage: string;
  progress: number;
  wittyMessage: string;
  stageIndex: number;
}> = ({ currentStage, currentMessage, progress, wittyMessage, stageIndex }) => {
  return (
    <div className="flex items-start gap-3 mb-4">
      {/* Dynamic Avatar */}
      <div className="relative flex-shrink-0 w-12 h-12">
        {/* Outer rotating ring */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <div className="w-full h-full rounded-full border-2 border-violet-500/30 border-t-violet-500" />
        </motion.div>

        {/* Middle counter-rotating ring */}
        <motion.div
          className="absolute inset-1"
          animate={{ rotate: -360 }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear"
          }}
        >
          <div className="w-full h-full rounded-full border-2 border-fuchsia-500/30 border-r-fuchsia-500" />
        </motion.div>

        {/* Center icon */}
        <motion.div
          className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-blue-500 flex items-center justify-center"
          animate={{
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
          }}
        >
          <span className="text-white text-lg">{currentStage.icon}</span>
        </motion.div>

        {/* Particles */}
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-violet-500/50"
            style={{
              top: '50%',
              left: '50%',
            }}
            animate={{
              x: [0, Math.cos(i * 72 * Math.PI / 180) * 30],
              y: [0, Math.sin(i * 72 * Math.PI / 180) * 30],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>

      {/* Message Bubble */}
      <motion.div
        className="flex-1 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-blue-50 border border-violet-200 rounded-2xl rounded-tl-sm p-4 relative overflow-hidden max-w-md"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-violet-400/10 via-fuchsia-400/10 to-blue-400/10"
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear"
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Stage labels */}
          <div className="flex items-center gap-2 mb-3">
            {stages.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <motion.div
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    index === stageIndex
                      ? 'bg-violet-500 text-white'
                      : index < stageIndex
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                  animate={
                    index === stageIndex
                      ? {
                          scale: [1, 1.05, 1],
                        }
                      : {}
                  }
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                  }}
                >
                  {index < stageIndex ? '✓' : stage.icon}
                  <span className="hidden sm:inline">{stage.label}</span>
                </motion.div>
                {index < stages.length - 1 && (
                  <div className="w-4 h-0.5 bg-gray-300" />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Main message */}
          <AnimatePresence mode="wait">
            <motion.p
              key={stageIndex}
              className="text-sm text-slate-800 font-semibold mb-2"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {currentMessage}
            </motion.p>
          </AnimatePresence>

          {/* Witty message */}
          {wittyMessage && (
            <motion.p
              className="text-xs text-slate-600 italic mb-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
            >
              {wittyMessage}
            </motion.p>
          )}

          {/* Progress bar */}
          <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-2">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Animated typing indicator */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 bg-violet-500 rounded-full"
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
