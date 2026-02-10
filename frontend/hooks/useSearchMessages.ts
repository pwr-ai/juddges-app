// hooks/useSearchMessages.ts

import { useState, useEffect } from 'react';
import type { SearchMessage } from '@/lib/search-messages';

interface UseSearchMessagesOptions {
  messages: SearchMessage[];
  extendedMessages?: SearchMessage[];
  extendedThreshold?: number; // milliseconds before adding extended messages
}

export function useSearchMessages({
  messages,
  extendedMessages = [],
  extendedThreshold = 10000,
}: UseSearchMessagesOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');
  const [startTime] = useState(Date.now());
  const [activeMessages, setActiveMessages] = useState(messages);

  // Add extended messages if search takes too long
  useEffect(() => {
    if (extendedMessages.length === 0) return;

    const checkDuration = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > extendedThreshold && activeMessages.length === messages.length) {
        setActiveMessages([...messages, ...extendedMessages]);
      }
    }, 1000);

    return () => clearInterval(checkDuration);
  }, [startTime, extendedThreshold, messages, extendedMessages, activeMessages.length]);

  // Message rotation logic
  useEffect(() => {
    const currentMessage = activeMessages[currentIndex];
    if (!currentMessage) return;

    // Fade out before transition
    const fadeOutTimer = setTimeout(() => {
      setFadeState('out');
    }, currentMessage.duration - 300);

    // Transition to next message
    const transitionTimer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % activeMessages.length);
      setFadeState('in');
    }, currentMessage.duration);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(transitionTimer);
    };
  }, [currentIndex, activeMessages]);

  return {
    currentMessage: activeMessages[currentIndex],
    fadeState,
    messageIndex: currentIndex,
    totalMessages: activeMessages.length,
  };
}
