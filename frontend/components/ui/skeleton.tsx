import { cn } from "@/lib/utils"

function Skeleton({
 className,
 ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
 return (
 <div
 className={cn("animate-pulse rounded-md bg-gradient-to-r from-slate-200/60 via-slate-100/60 to-slate-200/60 backdrop-blur-sm", className)}
 {...props}
 />
 )
}

export { Skeleton }
