import React from 'react';
import { cn } from '@/lib/utils';
import { PrimaryButton } from './primary-button';
import { SecondaryButton } from './secondary-button';

export interface PageSizeToggleProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export function PageSizeToggle({
  options,
  value,
  onChange,
  className,
}: PageSizeToggleProps): React.JSX.Element {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {options.map((size) => {
        const isActive = value === size;

        if (isActive) {
          return (
            <PrimaryButton
              key={size}
              size="sm"
              onClick={() => onChange(size)}
              enhancedHover={true}
              enhancedFocus={true}
              enhancedActive={true}
              className="h-9 min-w-[44px] px-3"
            >
              {size}
            </PrimaryButton>
          );
        }

        return (
          <SecondaryButton
            key={size}
            size="sm"
            onClick={() => onChange(size)}
            enhancedHover={true}
            enhancedFocus={true}
            enhancedActive={true}
            className="h-9 min-w-[44px] px-3"
          >
            {size}
          </SecondaryButton>
        );
      })}
    </div>
  );
}
