import { Github, Mail, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

const socialLinks = [
  {
    href: "https://github.com/pwr-ai/legal-ai",
    icon: Github,
    label: "GitHub Repository",
  },
  {
    href: "mailto:lukasz.augustyniak@pwr.edu.pl",
    icon: Mail,
    label: "Contact Email",
  },
  {
    href: "https://pwr.edu.pl",
    icon: Globe,
    label: "Wrocław University of Science and Technology",
  },
];

export function SocialLinks() {
  return (
    <div className="flex items-center gap-2">
      {socialLinks.map((link) => (
        <Button
          key={link.href}
          variant="ghost"
          size="icon"
          className="size-8 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all duration-200 rounded-lg"
          asChild
        >
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
          >
            <link.icon className="size-4" />
          </a>
        </Button>
      ))}
    </div>
  );
}
