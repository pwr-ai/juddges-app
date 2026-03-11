"use client";

import {
 Check,
 Sparkles,
 AlertTriangle,
 ArrowRight,
 Info,
 Mail,
 AlertCircle,
 Lock,
 Bell,
 ExternalLink,
} from "lucide-react";
import {
 BaseCard,
 LightCard,
 PageContainer,
 PrimaryButton,
 SecondaryButton,
 PlanBadge,
} from "@/lib/styles/components";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export default function PlansPage() {
 const [index, setIndex] = useState(0);
 const descriptions = [
"Experience the future of tax analysis",
"Automate your workflow",
"Unlock insights from millions of documents"
 ];

 useEffect(() => {
 const timer = setInterval(() => {
 setIndex((prev) => (prev + 1) % descriptions.length);
 }, 3000);
 return () => clearInterval(timer);
 }, [descriptions.length]);

 const plan = {
 name: "Preview",
 price: "$0",
 period: "/ month",
 description:
"AI-powered legal and tax document analysis. Explore, extract data, and gain insights instantly.",
 features: [
"AI-powered document chat and Q&A",
"Semantic search across legal documents",
"Automated data extraction with custom schemas",
"Document relationship visualization",
"Research collections and organization",
 ],
 cta: {
 label: "Get Started Now",
 href: "/auth/sign-up",
 },
 };

 return (
 <PageContainer className="py-8 md:py-12">
 {/* Custom Animated Header */}
 <div className="mb-12 text-center flex flex-col items-center justify-center gap-2">
 <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 font-bold tracking-tight">
 <span className="text-4xl md:text-6xl bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent whitespace-nowrap">
 JuDDGES
 </span>

 <div className="h-[1.5em] min-w-[280px] md:min-w-[350px] relative flex items-center justify-center md:justify-start text-lg md:text-xl font-medium">
 <AnimatePresence mode="wait">
 <motion.div
 key={index}
 initial={{ y: 10, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: -10, opacity: 0 }}
 transition={{ duration: 0.3, ease: "easeOut"}}
 className="absolute inset-0 flex items-center justify-center md:justify-start gap-2 text-muted-foreground"
 >
 <span className="whitespace-nowrap">{descriptions[index]}</span>
 <Sparkles className="h-4 w-4 text-primary animate-pulse flex-shrink-0"/>
 </motion.div>
 </AnimatePresence>
 </div>
 </div>

 <span className="text-sm font-bold tracking-[0.2em] text-muted-foreground/60 uppercase mt-2">
 Plans
 </span>
 </div>

 {/* Preview Phase Notice below title */}
 <div className="max-w-5xl mx-auto mb-8">
 <LightCard
 padding="md"
 className="border-amber-200 bg-amber-50/50"
 >
 <div className="flex items-start gap-3">
 <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5"/>
 <div className="flex-1">
 <h3 className="text-sm font-semibold text-foreground mb-1">
 Preview Phase Notice
 </h3>
 <p className="text-sm text-muted-foreground mb-4">
 This is a preview version of JuDDGES. In the preview phase, features may not work as intended, and some discrepancies can occur.
 We continuously improve both the UI/UX of the app and work on our models based on user feedback.
 </p>
 <div className="flex justify-end">
 <Link href="/contact">
 <SecondaryButton size="sm">
 <Mail className="h-4 w-4 mr-2"/>
 Request Feature or Report Issue
 </SecondaryButton>
 </Link>
 </div>
 </div>
 </div>
 </LightCard>
 </div>

 <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-8 items-stretch">
 {/* Column 1: Active Preview Plan */}
 <div className="flex flex-col gap-4 h-full">
 <motion.div
 whileHover={{
 scale: 1.015,
 transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
 }}
 whileTap={{
 scale: 0.995,
 transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
 }}
 className="h-full"
 >
 <BaseCard
 clickable={false}
 className="p-6 md:p-8 relative overflow-visible flex flex-col flex-1 h-full"
 >
 <motion.div
 className="absolute inset-0 rounded-2xl pointer-events-none -z-10"
 initial={{ opacity: 0 }}
 whileHover={{
 opacity: 1,
 transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
 }}
 >
 <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-indigo-400/10 to-purple-400/10"/>
 </motion.div>
 <motion.div
 className="absolute inset-[1px] rounded-2xl pointer-events-none -z-10"
 initial={{ opacity: 0 }}
 whileHover={{
 opacity: 1,
 transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
 }}
 >
 <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/20 via-transparent to-transparent"/>
 </motion.div>
 <div className="relative z-0">
 {/* Current Plan Badge - Top Right Corner */}


 {/* Badge positioned at the top center of the card content */}
 <div className="flex flex-col items-center text-center mb-6">
 <div className="mb-3">
 <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
 Current Plan
 </span>
 </div>
 <div className="mb-6">
 <PlanBadge size="lg"/>
 </div>

 {/* Pricing Info */}
 <div className="mb-2 flex items-baseline justify-center gap-1">
 <span className="text-4xl font-bold text-foreground">$0</span>
 <span className="text-muted-foreground font-medium">/ month</span>
 </div>
 <div className="mb-6">
 <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
 Free Preview • Academic & Research Use Only
 </span>
 </div>

 <p className="text-base text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed text-center">
 {plan.description}
 </p>
 </div>



 <div className="space-y-3 mb-8 flex-grow">
 {plan.features.map((feature, index) => (
 <div key={index} className="flex items-start gap-3.5">
 <div className="flex-shrink-0 mt-1">
 <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
 <Check className="h-3 w-3 text-primary"/>
 </div>
 </div>
 <span className="text-base text-foreground/90">{feature}</span>
 </div>
 ))}
 </div>



 {/* Quota Info */}
 <p className="text-xs text-muted-foreground text-center mb-6 italic">
 * Fair usage quotas apply to AI features during preview.
 </p>


 </div>
 </BaseCard>
 </motion.div>
 </div>

 {/* Column 2: Future Plans - Coming Soon */}
 <div className="flex flex-col gap-4 h-full">
 <motion.div
 whileHover={{
 scale: 1.015,
 opacity: 0.9,
 transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
 }}
 whileTap={{
 scale: 0.995,
 transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] }
 }}
 className="h-full">

 <BaseCard
 clickable={false}
 variant="light"
 className={cn(
"p-6 md:p-8 relative overflow-visible flex flex-col h-full",
"border-dashed"
 )}
 >
 <motion.div
 className="absolute inset-0 rounded-2xl pointer-events-none -z-10"
 initial={{ opacity: 0 }}
 whileHover={{
 opacity: 1,
 transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
 }}
 >
 <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-indigo-400/5 to-purple-400/5"/>
 </motion.div>
 <motion.div
 className="absolute inset-[1px] rounded-2xl pointer-events-none -z-10"
 initial={{ opacity: 0 }}
 whileHover={{
 opacity: 1,
 transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
 }}
 >
 <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/10 via-transparent to-transparent"/>
 </motion.div>
 <div className="relative z-0 flex flex-col h-full gap-6">
 {/* Badge positioned at the top center of the card content */}
 <div className="flex flex-col items-center text-center">
 {/* Spacer to align with Left Card's 'Current Plan' badge */}
 <div className="mb-3 opacity-0 select-none pointer-events-none"aria-hidden="true">
 <span className="inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium">
 Placeholder
 </span>
 </div>
 <div className="flex items-center justify-center gap-3 mb-6">
 <h3 className="text-2xl font-bold text-foreground">Standard Plans</h3>
 <PlanBadge size="lg"hideLabel badgeText="COMING SOON"/>
 </div>
 <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
 Other plans are not available in app preview and will be introduced later.
 </p>
 </div>

 {/* Stay Updated */}
 <div className="rounded-lg bg-muted/40 p-4">
 <div className="flex items-start gap-3">
 <Bell className="h-4 w-4 text-primary mt-0.5 shrink-0"/>
 <div className="space-y-3 flex-1">
 <p className="text-sm text-muted-foreground">
 <strong>Stay Updated.</strong> Check our blog and release notes for announcements about new plans and features.
 </p>
 <SecondaryButton
 href="/blog"
 size="sm"
 className="w-full"
 >
 View Updates
 <ExternalLink className="ml-2 h-3.5 w-3.5"/>
 </SecondaryButton>
 </div>
 </div>
 </div>

 {/* Data Safety Notice */}
 <div className="rounded-lg bg-muted/40 p-4">
 <div className="flex items-start gap-3">
 <Info className="h-4 w-4 text-green-600 mt-0.5 shrink-0"/>
 <div className="space-y-1">
 <p className="text-sm text-muted-foreground">
 <strong>Data Continuity Guarantee.</strong> All data created during the Preview phase (including collections, extractions, schemas, and chat history) will be automatically migrated and remain accessible when transitioning to standard plans.
 </p>
 </div>
 </div>
 </div>

 <div className="flex-grow"></div>
 </div>
 </BaseCard>
 </motion.div>
 </div>
 </div>
 </PageContainer>
 );
}
