"use client";

import { GraduationCap, Lock, Shield, CheckCircle2, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FooterSection } from "./FooterSection";
import { FooterLink } from "./FooterLink";
import { SocialLinks } from "./SocialLinks";
import { cn } from "@/lib/utils";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export function Footer({ className }: { className?: string }) {
 return (
 <footer
 role="contentinfo"
 aria-label="Site footer"
 className={cn(
"mt-auto",
"bg-gradient-to-b from-slate-50/50 via-slate-100/30 to-slate-50/50",
"",
 className
 )}
 >
 {/* Main Footer Content */}
 <div className="container mx-auto max-w-7xl px-6 lg:px-8 py-4">

 {/* University Badge */}
 <div className="mb-4">
 <Badge
 variant="outline"
 className={cn(
"mb-3 text-sm font-medium px-3 py-1.5",
"bg-gradient-to-br from-blue-50/80 via-indigo-50/60 to-purple-50/80",
"",
"border-blue-200/70",
"text-blue-700"
 )}
 >
 <GraduationCap className="size-3.5 mr-1.5"/>
 WUST Research Project
 </Badge>
 <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
 JuDDGES is a research platform developed by Wroclaw University of Science and Technology,
 providing AI-powered legal document analysis and research tools for court judgments.
 </p>
 </div>

 {/* Footer Columns */}
 <nav aria-label="Footer navigation">
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">

 {/* Column 1: About */}
 <FooterSection title="The Project">
 <li><FooterLink href="/about">About Us</FooterLink></li>
 <li><FooterLink href="/about#research">Our Research</FooterLink></li>
 <li><FooterLink href="/ecosystem">Ecosystem</FooterLink></li>
 <li><FooterLink href="/team">Team</FooterLink></li>
 <li><FooterLink href="/publications">Publications</FooterLink></li>
 <li><FooterLink href="https://juddges.org"external>juddges.org</FooterLink></li>
 <li><FooterLink href="https://pwr.edu.pl"external>University</FooterLink></li>
 </FooterSection>

 {/* Column 2: Platform */}
 <FooterSection title="Platform">
 <li><FooterLink href="/search">Document Search</FooterLink></li>
 <li><FooterLink href="/chat">AI Assistant</FooterLink></li>
 <li><FooterLink href="/schemas">Data Extraction</FooterLink></li>
 <li><FooterLink href="/use-cases">Use Cases</FooterLink></li>
 <li><FooterLink href="/collections">Collections</FooterLink></li>
 </FooterSection>

 {/* Column 3: Resources */}
 <FooterSection title="Resources">
 <li><FooterLink href="/help">Help Center</FooterLink></li>
 <li><FooterLink href="https://github.com/pwr-ai/juddges-app"external>
 GitHub
 </FooterLink></li>
 <li><FooterLink href="/contact">Contact</FooterLink></li>
 <li><FooterLink href="/status">System Status</FooterLink></li>
 </FooterSection>

 {/* Column 4: Legal */}
 <div className="space-y-4">
 <FooterSection title="Policies">
 <li><FooterLink href="/privacy">Privacy Policy</FooterLink></li>
 <li><FooterLink href="/terms">Terms of Service</FooterLink></li>
 <li><FooterLink href="/cookies">Cookie Policy</FooterLink></li>
 <li><FooterLink href="/accessibility">Accessibility</FooterLink></li>
 </FooterSection>
 </div>
 </div>
 </nav>

 {/* Trust Badges */}
 <div className="mt-4 pt-3 border-t border-slate-200/30">
 <div className="flex flex-wrap gap-4 md:gap-6">
 <div className="flex items-center gap-2 text-xs text-slate-600">
 <Lock className="size-4 text-blue-600"/>
 <span className="font-medium">GDPR Compliant</span>
 </div>
 <div className="flex items-center gap-2 text-xs text-slate-600">
 <Globe className="size-4 text-blue-600"/>
 <span className="font-medium">EU Hosted</span>
 </div>
 <div className="flex items-center gap-2 text-xs text-slate-600">
 <Shield className="size-4 text-blue-600"/>
 <span className="font-medium">SSL Secured</span>
 </div>
 <div className="flex items-center gap-2 text-xs text-slate-600">
 <CheckCircle2 className="size-4 text-green-600"/>
 <span className="font-medium">Open Source</span>
 </div>
 </div>
 </div>

 {/* Legal Disclaimer */}
 <div className="mt-3 pt-3 border-t border-slate-200/30">
 <p className="text-xs text-slate-600 leading-relaxed max-w-4xl">
 <strong className="font-semibold text-slate-700">Legal Notice:</strong> JuDDGES provides AI-powered legal information for
 research and educational purposes. This system does not constitute professional legal
 advice and should not be used as a substitute for consultation with a qualified attorney.
 </p>
 </div>
 </div>

 {/* Bottom Bar */}
 <div className="container mx-auto max-w-7xl px-6 lg:px-8 py-3 border-t border-slate-200/30">
 <div className="flex flex-col md:flex-row items-center justify-between gap-4">

 {/* Copyright */}
 <div className="text-xs text-slate-600 text-center md:text-left flex items-center gap-2 flex-wrap justify-center md:justify-start">
 <p>© {new Date().getFullYear()} Wrocław University of Science and Technology. All rights reserved.</p>
 {APP_VERSION && (
 <>
 <span aria-hidden="true">•</span>
 <span aria-label="Application version" className="text-slate-600">v{APP_VERSION}</span>
 </>
 )}
 </div>

 {/* Social Links */}
 <div className="flex items-center gap-2">
 <SocialLinks />
 </div>
 </div>
 </div>
 </footer>
 );
}
