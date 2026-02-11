import { FC } from "react";
import { Badge } from "@/components/ui/badge";
import { PublicationProject } from "@/types/publication";
import { cn } from "@/lib/utils";

interface ProjectBadgeProps {
  project: PublicationProject;
  className?: string;
}

const projectConfig = {
  [PublicationProject.JUDDGES]: {
    label: "JUDDGES",
    description: "Court Judgment Analysis",
    className: "bg-gradient-to-r from-primary/10 via-indigo-400/10 to-purple-400/10 text-primary border-primary/30 dark:from-primary/15 dark:via-indigo-400/15 dark:to-purple-400/15 dark:text-primary dark:border-primary/30"
  },
  [PublicationProject.AI_TAX]: {
    label: "AI-TAX",
    description: "Tax Law Interpretation",
    className: "bg-purple-400/10 text-purple-700 border-purple-400/30 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30"
  }
};

export const ProjectBadge: FC<ProjectBadgeProps> = ({ project, className }) => {
  const config = projectConfig[project];

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold",
        config.className,
        className
      )}
      title={config.description}
    >
      {config.label}
    </Badge>
  );
};
