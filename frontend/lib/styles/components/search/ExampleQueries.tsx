import { Sparkles } from 'lucide-react';
import { DocumentType } from '@/types/search';
import { cn } from '@/lib/utils';

interface ExampleQuery {
 title: string;
 query: string;
 mode: 'rabbit' | 'thinking';
 documentType: DocumentType;
 language: string;
}

interface ExampleQueriesProps {
 show: boolean;
 documentTypes: DocumentType[];
 onExampleClick: (
 query: string,
 mode: 'rabbit' | 'thinking',
 documentType: DocumentType,
 language: string
 ) => void;
}

const examplesByDocumentType: Record<DocumentType, ExampleQuery[]> = {
 [DocumentType.JUDGMENT]: [
 {
 title: 'Copyright infringement',
 query: 'What are the key elements of copyright infringement?',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Swiss franc loans',
 query: 'Key legal issues and court rulings on Swiss franc loans in Poland',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Data privacy cases',
 query: 'Summarize recent data privacy cases',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Fair use doctrine',
 query: 'Explain fair use doctrine in intellectual property',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Consumer protection',
 query: 'Consumer protection in online transactions',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Wrongful termination',
 query: 'Wrongful termination case precedents',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Contract disputes',
 query: 'Contract breach remedies and damages',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 {
 title: 'Real estate law',
 query: 'Property ownership transfer disputes',
 mode: 'thinking',
 documentType: DocumentType.JUDGMENT,
 language: 'uk',
 },
 ],
 [DocumentType.TAX_INTERPRETATION]: [
 {
 title: 'IP Box relief',
 query: 'Requirements for IP Box tax relief in Poland',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'VAT digital services',
 query: 'VAT application to international digital services',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'R&D deductions',
 query: 'Expenses qualifying for R&D tax deductions',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'Tax residency',
 query: 'Tax residency determination for individuals',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'Corporate income tax',
 query: 'Corporate income tax optimization strategies',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'Transfer pricing',
 query: 'Transfer pricing documentation requirements',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'Withholding tax',
 query: 'Withholding tax on cross-border payments',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 {
 title: 'VAT exemptions',
 query: 'VAT exemptions for financial services',
 mode: 'thinking',
 documentType: DocumentType.TAX_INTERPRETATION,
 language: 'pl',
 },
 ],
 [DocumentType.ERROR]: [], // Empty array for error document type
};

export function ExampleQueries({ show, documentTypes, onExampleClick }: ExampleQueriesProps): React.JSX.Element | null {
 if (!show) return null;

 // Get current examples based on selected document type
 const currentExamples = examplesByDocumentType[documentTypes[0] || DocumentType.JUDGMENT];

 // Show 8 examples as compact pills
 const displayedExamples = currentExamples.slice(0, 8);

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
 onExampleClick(example.query, example.mode, example.documentType, example.language)
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
