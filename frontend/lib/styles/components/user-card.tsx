/**
 * User Card Component
 * Modern popover content component for user menu
 * Contains user info, settings, logout, and help pages
 */

"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  Settings,
  LogOut,
  HelpCircle,
  Mail,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "./user-avatar";
import useCurrentUserName from "@/hooks/use-current-user-name";
import { logger } from "@/lib/logger";

export interface UserCardProps {
  /** Optional className for additional styling */
  className?: string;
  /** Callback when card is closed */
  onClose?: () => void;
}

/**
 * User Card Component
 *
 * A modern, compact popover content component that displays user menu options
 * including user info, settings link, logout, and help pages.
 *
 * @example
 * ```tsx
 * <Popover>
 *   <PopoverTrigger>
 *     <UserAvatar />
 *   </PopoverTrigger>
 *   <PopoverContent>
 *     <UserCard onClose={() => setIsOpen(false)} />
 *   </PopoverContent>
 * </Popover>
 * ```
 */
export function UserCard({
  className,
  onClose,
}: UserCardProps): React.JSX.Element {
  const { signOut } = useAuth();
  const router = useRouter();
  const userName = useCurrentUserName();

  const handleLogout = async (): Promise<void> => {
    try {
      await signOut();
      router.push("/auth/login");
      onClose?.();
    } catch (error) {
      logger.error("Error logging out: ", error);
    }
  };

  const handleLinkClick = (): void => {
    onClose?.();
  };

  // Menu item base classes following Editorial pattern
  const menuItemClasses = cn(
    "group relative flex items-center gap-2.5 px-3 py-2 rounded-none",
    "text-xs font-mono text-ink-soft hover:text-ink hover:bg-parchment-deep",
    "transition-colors duration-150",
    "cursor-pointer",
    "overflow-hidden",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
  );

  return (
    <div
      className={cn(
        "w-56 p-1",
        "bg-parchment",
        "border border-rule rounded-none",
        "shadow-md",
        className
      )}
    >
      {/* User Info Header */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <UserAvatar size="sm" clickable={false} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono font-medium text-ink truncate">
              {userName || "User"}
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-1 border-rule" />

      {/* Settings Link */}
      <Link
        href="/settings"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="relative z-10 flex items-center gap-2.5">
          <Settings className="h-4 w-4 text-ink-soft group-hover:text-ink transition-transform duration-150 group-hover:rotate-90" />
          <span>Settings</span>
        </div>
      </Link>

      <Separator className="my-1 border-rule" />

      {/* Help Section */}
      <div className="px-3 py-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-soft">
          Help
        </div>
      </div>

      <Link
        href="/help"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="relative z-10 flex items-center gap-2.5">
          <HelpCircle className="h-4 w-4 text-ink-soft group-hover:text-ink transition-colors" />
          <span>Help Center</span>
        </div>
      </Link>

      <Link
        href="/contact"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="relative z-10 flex items-center gap-2.5">
          <Mail className="h-4 w-4 text-ink-soft group-hover:text-ink transition-colors" />
          <span>Contact</span>
        </div>
      </Link>

      <Link
        href="/terms"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="relative z-10 flex items-center gap-2.5">
          <FileCheck className="h-4 w-4 text-ink-soft group-hover:text-ink transition-colors" />
          <span>Terms of Service</span>
        </div>
      </Link>

      <Separator className="my-1 border-rule" />

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className={cn(menuItemClasses, "w-full text-ink-soft hover:text-oxblood")}
        aria-label="Logout"
      >
        <div className="relative z-10 flex items-center gap-2.5">
          <LogOut className="h-4 w-4 transition-colors text-ink-soft group-hover:text-oxblood" />
          <span>Logout</span>
        </div>
      </button>
    </div>
  );
}
