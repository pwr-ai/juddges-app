// components/search/LoadingMessage.tsx

import React from 'react';
import { cn } from '@/lib/utils';
import type { SearchMessage } from '@/lib/search-messages';

interface LoadingMessageProps {
 message: SearchMessage;
 fadeState: 'in' | 'out';
}

export function LoadingMessage({ message, fadeState }: LoadingMessageProps) {
 const isSpecial = message.category === 'tip' || message.category === 'entertaining';

 return (
 <p
 className={cn(
"text-base font-medium min-h-[24px] relative overflow-hidden",
"transition-all duration-500 ease-out",
 isSpecial
 ? "text-slate-600"
 : "text-slate-700",
 fadeState === 'in'
 ? "opacity-100 translate-y-0 scale-100"
 : "opacity-0 -translate-y-3 scale-95 blur-sm"
 )}
 aria-live="polite"
 aria-atomic="true"
 >
 <span
 className={cn(
"relative inline-block"
 )}
 >
 {message.text}
 </span>
 </p>
 );
}
