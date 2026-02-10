'use client';

import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { LocaleCode, LocaleConfig } from '@/lib/i18n/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  /** Show full language name or just code */
  showFullName?: boolean;
  /** Show flag emoji */
  showFlag?: boolean;
  /** Compact mode for tight spaces */
  compact?: boolean;
  /** Custom className */
  className?: string;
  /** Align dropdown menu */
  align?: 'start' | 'center' | 'end';
}

/**
 * Language Switcher Component
 *
 * Provides a dropdown menu to switch between available languages.
 * Automatically updates the UI language and persists the selection.
 */
export function LanguageSwitcher({
  showFullName = true,
  showFlag = true,
  compact = false,
  className,
  align = 'end',
}: LanguageSwitcherProps) {
  const { locale, config, availableLocales, setLocale, isRTL } = useLanguage();

  const handleLocaleChange = (newLocale: LocaleCode) => {
    setLocale(newLocale);
  };

  const renderLocaleLabel = (localeConfig: LocaleConfig, showName: boolean = true) => {
    return (
      <span className="flex items-center gap-2">
        {showFlag && <span className="text-base">{localeConfig.flag}</span>}
        {showName && (
          <span className={cn(compact && 'sr-only sm:not-sr-only')}>
            {showFullName ? localeConfig.nativeName : localeConfig.code.toUpperCase()}
          </span>
        )}
      </span>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'sm' : 'default'}
          className={cn(
            'flex items-center gap-1.5',
            compact && 'h-8 px-2',
            isRTL && 'flex-row-reverse',
            className
          )}
          aria-label="Select language"
        >
          {compact ? (
            <>
              <Globe className="h-4 w-4" />
              {showFlag && <span className="text-sm">{config.flag}</span>}
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              {renderLocaleLabel(config)}
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[160px]">
        {availableLocales.map((localeConfig) => (
          <DropdownMenuItem
            key={localeConfig.code}
            onClick={() => handleLocaleChange(localeConfig.code)}
            className={cn(
              'flex items-center justify-between cursor-pointer',
              locale === localeConfig.code && 'bg-accent'
            )}
          >
            <span className="flex items-center gap-2">
              {showFlag && <span className="text-base">{localeConfig.flag}</span>}
              <span className="flex flex-col">
                <span className="font-medium">{localeConfig.nativeName}</span>
                {localeConfig.nativeName !== localeConfig.englishName && (
                  <span className="text-xs text-muted-foreground">
                    {localeConfig.englishName}
                  </span>
                )}
              </span>
            </span>
            {locale === localeConfig.code && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Minimal language switcher for icon-only display
 */
export function LanguageSwitcherMinimal({ className }: { className?: string }) {
  return (
    <LanguageSwitcher
      compact
      showFullName={false}
      showFlag={true}
      className={className}
    />
  );
}

/**
 * Language switcher button group variant
 * Displays all languages as inline buttons
 */
export function LanguageSwitcherButtons({ className }: { className?: string }) {
  const { locale, availableLocales, setLocale } = useLanguage();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {availableLocales.map((localeConfig) => (
        <Button
          key={localeConfig.code}
          variant={locale === localeConfig.code ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setLocale(localeConfig.code)}
          className="h-8 px-2"
          title={localeConfig.nativeName}
        >
          <span className="text-base">{localeConfig.flag}</span>
        </Button>
      ))}
    </div>
  );
}
