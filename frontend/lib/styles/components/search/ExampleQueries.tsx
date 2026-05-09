import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExampleQuery {
 title: string;
 query: string;
 mode: 'rabbit' | 'thinking';
 language: string;
}

interface ExampleQueriesProps {
 show: boolean;
 onExampleClick: (
 query: string,
 mode: 'rabbit' | 'thinking',
 language: string
 ) => void;
}

const JUDGMENT_EXAMPLES: ExampleQuery[] = [
 {
 title: 'Copyright infringement',
 query: 'What are the key elements of copyright infringement?',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Swiss franc loans',
 query: 'Key legal issues and court rulings on Swiss franc loans in Poland',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Data privacy cases',
 query: 'Summarize recent data privacy cases',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Fair use doctrine',
 query: 'Explain fair use doctrine in intellectual property',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Consumer protection',
 query: 'Consumer protection in online transactions',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Wrongful termination',
 query: 'Wrongful termination case precedents',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Contract disputes',
 query: 'Contract breach remedies and damages',
 mode: 'thinking',
 language: 'uk',
 },
 {
 title: 'Real estate law',
 query: 'Property ownership transfer disputes',
 mode: 'thinking',
 language: 'uk',
 },
];

export function ExampleQueries({ show, onExampleClick }: ExampleQueriesProps): React.JSX.Element | null {
 if (!show) return null;

 // Show 8 examples as compact pills
 const displayedExamples = JUDGMENT_EXAMPLES.slice(0, 8);

 return (
 <div className="w-full">
 <div className="flex items-center gap-2 mb-3">
 <Sparkles className="size-4 text-primary"/>
 <span className="text-sm font-medium text-muted-foreground">Try an example</span>
 </div>
 {/* Compact pills layout - wraps naturally */}
 <div className="flex flex-wrap gap-2 justify-center">
 {displayedExamples.map((example, index) => (
 <button
 key={index}
 onClick={() =>
 onExampleClick(example.query, example.mode, example.language)
 }
 className={cn(
"px-4 py-2 text-sm font-medium rounded-full",
"bg-white/60",
"backdrop-blur-sm",
"border border-slate-200/60",
"text-slate-700",
"hover:bg-primary/10 hover:border-primary/30 hover:text-primary",
"",
"transition-all duration-200",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
"active:scale-[0.97]",
"cursor-pointer"
 )}
 title={example.query}
 >
 {example.title}
 </button>
 ))}
 </div>
 </div>
 );
}
