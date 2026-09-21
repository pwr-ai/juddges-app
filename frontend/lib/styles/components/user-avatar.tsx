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
 "bg-parchment",
 "border border-rule",
 "shadow-none",
 "transition-colors duration-150",
 clickable && [
 "hover:border-ink",
 "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
 ],
 clickable && "cursor-pointer",
 className
 )}
 >
 {profileImage && <AvatarImage src={profileImage} alt={initials} />}
 <AvatarFallback
 className={cn(
 "bg-parchment-deep text-ink font-mono font-medium text-xs",
 "border-0"
 )}
 >
 {initials}
 </AvatarFallback>
 </Avatar>
 );
}
