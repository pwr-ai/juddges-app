/**
 * User Avatar Component
 * Styled user avatar component for navbar
 * Displays user's profile image or initials fallback
 */

"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import useCurrentUserImage from "@/hooks/use-current-user-image";
import useCurrentUserName from "@/hooks/use-current-user-name";
import { cn } from "@/lib/utils";

export interface UserAvatarProps {
 /** Optional className for additional styling */
 className?: string;
 /** Size variant */
 size?: "sm"|"md"|"lg";
 /** Whether to show hover effects */
 clickable?: boolean;
}

/**
 * User Avatar Component
 *
 * A styled user avatar component that displays the user's profile image
 * or initials fallback. Designed for use in the navbar.
 *
 * @example
 * ```tsx
 * <UserAvatar />
 * ```
 *
 * @example
 * ```tsx
 * <UserAvatar size="lg"clickable={true} />
 * ```
 */
export function UserAvatar({
 className,
 size ="md",
 clickable = true,
}: UserAvatarProps): React.JSX.Element {
 const profileImage = useCurrentUserImage();
 const name = useCurrentUserName();
 const initials = name
 ?.split("")
 ?.map((word) => word[0])
 ?.join("")
 ?.toUpperCase() || "? ";

 const sizeClasses = {
 sm: "h-8 w-8",
 md: "h-9 w-9",
 lg: "h-10 w-10",
 };

 return (
 <Avatar
 className={cn(
 sizeClasses[size],
 // Base styling with gradient background
"bg-gradient-to-br from-background via-background/95 to-muted/50",
 // Border with semantic tokens
"border border-border/50",
 // Shadow effects
"shadow-sm",
 // Smooth transitions
"transition-all duration-300 ease-in-out",
 // Hover effects when clickable
 clickable && [
"hover:shadow-md",
"hover:scale-[1.02]",
"hover:border-primary/30",
"active:scale-[0.98]",
 // Focus state for accessibility
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
 ],
 // Cursor when clickable
 clickable &&"cursor-pointer",
 className
 )}
 >
 {profileImage && <AvatarImage src={profileImage} alt={initials} />}
 <AvatarFallback
 className={cn(
"bg-gradient-to-br from-primary/20 via-indigo-500/20 to-purple-500/20",
"",
"text-primary font-medium text-xs",
"border-0"
 )}
 >
 {initials}
 </AvatarFallback>
 </Avatar>
 );
}
