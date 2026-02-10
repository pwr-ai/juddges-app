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
        {/* Icon with gradient background */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 blur-2xl" />
          <div className="relative p-6 rounded-2xl bg-muted/50 backdrop-blur-sm">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {React.cloneElement(icon as React.ReactElement<any>, {
              className: "size-12 text-muted-foreground"
            })}
          </div>
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
          <Button onClick={action.onClick} size="lg" className="shadow-lg hover:shadow-xl transition-all">
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
