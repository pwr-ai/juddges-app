/**
 * Configuration for chat loading states and timing
 * Defines how long each stage should last and what messages to display
 */

export type QueryType = 'contract' | 'caselaw' | 'regulatory' | 'general';
export type LoadingStyle = 'judicial' | 'modern' | 'innovation';
export type StageType = 'analyzing' | 'retrieving' | 'reasoning' | 'generating';

export interface LoadingStage {
  name: StageType;
  duration: number; // in seconds
  message: string;
  color: string;
  icon: string;
}

export interface LoadingTiming {
  maxDuration: number;
  stages: LoadingStage[];
}

/**
 * Timing configurations for different response durations
 */
export const loadingTimings: Record<'quick' | 'medium' | 'long', LoadingTiming> = {
  quick: {
    maxDuration: 5,
    stages: [
      {
        name: 'analyzing',
        duration: 5,
        message: 'Thinking...',
        color: '#3b82f6',
        icon: '🔍'
      }
    ]
  },
  medium: {
    maxDuration: 15,
    stages: [
      {
        name: 'analyzing',
        duration: 3,
        message: 'Analyzing your question...',
        color: '#3b82f6',
        icon: '🔍'
      },
      {
        name: 'retrieving',
        duration: 7,
        message: 'Searching legal documents...',
        color: '#8b5cf6',
        icon: '📚'
      },
      {
        name: 'generating',
        duration: 5,
        message: 'Formulating response...',
        color: '#10b981',
        icon: '✍️'
      }
    ]
  },
  long: {
    maxDuration: 30,
    stages: [
      {
        name: 'analyzing',
        duration: 4,
        message: 'Understanding your question...',
        color: '#3b82f6',
        icon: '🔍'
      },
      {
        name: 'retrieving',
        duration: 8,
        message: 'Retrieving relevant documents...',
        color: '#8b5cf6',
        icon: '📚'
      },
      {
        name: 'reasoning',
        duration: 10,
        message: 'Analyzing legal precedents...',
        color: '#ec4899',
        icon: '⚖️'
      },
      {
        name: 'generating',
        duration: 8,
        message: 'Preparing comprehensive answer...',
        color: '#10b981',
        icon: '✍️'
      }
    ]
  }
};

/**
 * Context-aware messages based on query type
 */
export const contextMessages: Record<QueryType, Record<StageType, string>> = {
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
    retrieving: 'Consulting legal knowledge base...',
    reasoning: 'Formulating legal analysis...',
    generating: 'Crafting response...'
  }
};

/**
 * Witty but professional messages for longer responses
 * Only used in 'modern' and 'innovation' styles
 */
export const wittyMessages: string[] = [
  "Consulting my law books... (the digital ones)",
  "Channeling my inner legal scholar...",
  "Running this by my virtual law clerks...",
  "Fact-checking with the speed of jurisprudence...",
  "Applying legal reasoning (without the billable hours)...",
  "Sifting through statutes faster than you can say 'habeas corpus'...",
  "Analyzing precedents at the speed of light...",
  "Putting on my thinking robes...",
  "Cross-referencing 50+ legal sources...",
  "Ensuring accuracy before responding...",
  "Double-checking citations and sources...",
  "Verifying information across multiple databases...",
  "Quality over speed - getting this right..."
];

/**
 * Educational/transparent messages for tech-savvy users
 */
export const technicalMessages: string[] = [
  "Embedding your query in 384 dimensions...",
  "Semantic search across 10,000+ documents...",
  "Ranking relevance using vector similarity...",
  "Applying natural language understanding...",
  "Running transformer-based analysis...",
  "Computing contextual embeddings...",
  "Performing neural text retrieval..."
];

/**
 * Helper function to determine which timing to use based on estimated duration
 */
export function getLoadingTiming(estimatedSeconds: number): LoadingTiming {
  if (estimatedSeconds <= 5) return loadingTimings.quick;
  if (estimatedSeconds <= 15) return loadingTimings.medium;
  return loadingTimings.long;
}

/**
 * Helper function to get the appropriate message for a stage and query type
 */
export function getMessageForStage(
  stage: StageType,
  queryType: QueryType,
  useContextual: boolean = true
): string {
  if (useContextual) {
    return contextMessages[queryType][stage];
  }
  return contextMessages.general[stage];
}

/**
 * Helper function to get a random witty message
 * Returns null if duration is too short or style is judicial
 */
export function getRandomWittyMessage(
  duration: number,
  style: LoadingStyle
): string | null {
  if (duration < 15 || style === 'judicial') return null;

  const randomIndex = Math.floor(Math.random() * wittyMessages.length);
  return wittyMessages[randomIndex];
}

/**
 * Helper function to get a random technical message
 */
export function getRandomTechnicalMessage(): string {
  const randomIndex = Math.floor(Math.random() * technicalMessages.length);
  return technicalMessages[randomIndex];
}

/**
 * Stage colors for consistent theming
 */
export const stageColors: Record<StageType, string> = {
  analyzing: '#3b82f6',  // blue-500
  retrieving: '#8b5cf6', // violet-500
  reasoning: '#ec4899',  // pink-500
  generating: '#10b981'  // green-500
};

/**
 * Animation timings in milliseconds
 */
export const animationTimings = {
  messageTransition: 300,
  shimmerDuration: 2000,
  pulseDuration: 2000,
  typingDotDelay: 200,
  completionFlash: 400,
  avatarFloat: 2000,
  ringRotation: 3000,
  particleOrbit: 3000
};

/**
 * Sound effect configuration (optional feature)
 */
export const soundEffects = {
  messageStart: '/sounds/soft-click.mp3',
  stageTransition: '/sounds/soft-whoosh.mp3',
  tokenAppear: '/sounds/soft-tap.mp3',
  messageComplete: '/sounds/success-chime.mp3',
  defaultVolume: 0.25, // 25% volume
  enabled: false // Disabled by default
};
