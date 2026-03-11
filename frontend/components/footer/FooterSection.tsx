interface FooterSectionProps {
 title: string;
 children: React.ReactNode;
}

export function FooterSection({ title, children }: FooterSectionProps) {
 return (
 <div>
 <h3 className="text-sm font-semibold mb-4 text-slate-700 uppercase tracking-wide">
 {title}
 </h3>
 <ul className="space-y-2.5">
 {children}
 </ul>
 </div>
 );
}
