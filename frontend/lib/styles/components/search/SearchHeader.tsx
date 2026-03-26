import { Search, Sparkles } from 'lucide-react';
import { Header, Badge } from '@/lib/styles/components';

interface SearchHeaderProps {
  show: boolean;
}

export function SearchHeader({ show }: SearchHeaderProps): React.JSX.Element | null {
  if (!show) return null;

  return (
    <div className="w-full text-center">
      <Header
        icon={Search}
        title="Legal Judgment Search"
        size="5xl"
        center
        className="[&_p]:!text-lg [&_p]:!md:text-xl"
        description={
          <>
            Discover relevant legal documents with{' '}
            <Badge className="text-sm font-semibold bg-gradient-to-r from-primary/10 via-blue-500/10 to-cyan-500/10 border-primary/20 text-primary hover:from-primary/15 hover:via-blue-500/15 hover:to-cyan-500/15 transition-all flex items-center gap-1">
              <Sparkles className="h-4 w-4" />
              AI-powered
            </Badge>{' '}
            semantic search
          </>
        }
      />
    </div>
  );
}
