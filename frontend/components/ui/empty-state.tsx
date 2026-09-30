import React from "react";
import { Button } from "./button";
import { Card, CardContent } from "./card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactElement;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed bg-muted/20", className)}>
      <CardContent className="flex flex-col items-center justify-center py-16 px-6 text-center">
        {/* Icon in a ruled frame */}
        <div className="mb-6 border border-rule bg-parchment-deep p-6">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {React.cloneElement(icon as React.ReactElement<any>, {
            className: "size-12 text-ink-soft"
          })}
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
          {description}
        </p>

        {/* Action */}
        {action && (
          <Button onClick={action.onClick} size="lg">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
