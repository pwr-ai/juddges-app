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

  // Menu item base classes following dropdown-button pattern
  const menuItemClasses = cn(
    "group relative flex items-center gap-2.5 px-3 py-2 rounded-md",
    "text-sm text-muted-foreground",
    "transition-all duration-200",
    "cursor-pointer",
    "overflow-hidden",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
  );

  return (
    <div
      className={cn(
        "w-56 p-1",
        // Modern background styling following dropdown-button pattern
        "bg-gradient-to-br from-background via-background/80 to-background",
        "backdrop-blur-sm",
        "border border-border/50 rounded-lg",
        "shadow-lg shadow-primary/10",
        className
      )}
    >
      {/* User Info Header */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <UserAvatar size="sm" clickable={false} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {userName || "User"}
            </div>
            <div className="text-xs text-muted-foreground">
              Preview Plan
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-1" />

      {/* Settings Link */}
      <Link
        href="/settings"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-primary/10" />
        <div className="relative z-10 flex items-center gap-2.5">
          <Settings className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
          <span className="group-hover:text-foreground transition-colors">Settings</span>
        </div>
      </Link>

      <Separator className="my-1" />

      {/* Help Section */}
      <div className="px-3 py-1.5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Help
        </div>
      </div>

      <Link
        href="/help"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-primary/10" />
        <div className="relative z-10 flex items-center gap-2.5">
          <HelpCircle className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          <span className="group-hover:text-foreground transition-colors">Help Center</span>
        </div>
      </Link>

      <Link
        href="/contact"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-primary/10" />
        <div className="relative z-10 flex items-center gap-2.5">
          <Mail className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          <span className="group-hover:text-foreground transition-colors">Contact</span>
        </div>
      </Link>

      <Link
        href="/terms"
        onClick={handleLinkClick}
        className={menuItemClasses}
      >
        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-primary/10" />
        <div className="relative z-10 flex items-center gap-2.5">
          <FileCheck className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          <span className="group-hover:text-foreground transition-colors">Terms of Service</span>
        </div>
      </Link>

      <Separator className="my-1" />

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className={cn(menuItemClasses, "w-full")}
        aria-label="Logout"
      >
        <div className="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-destructive/10" />
        <div className="relative z-10 flex items-center gap-2.5">
          <LogOut className="h-4 w-4 transition-transform duration-200 group-hover:rotate-6 group-hover:scale-110 group-hover:text-destructive" />
          <span className="group-hover:text-destructive transition-colors">Logout</span>
        </div>
      </button>
    </div>
  );
}
