import { Search } from 'lucide-react';
import { Header } from '@/lib/styles/components';

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
        description="Discover relevant legal documents with semantic search"
      />
    </div>
  );
}
