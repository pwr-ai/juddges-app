'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Header } from "@/lib/styles/components";
import { BookOpen } from "lucide-react";

export default function UseCasesPage() {
  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1600px]">
      <Header icon={BookOpen} title="Use Cases" size="4xl" className="mb-6" />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        <Link href="/use-cases/swiss-franc">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>Swiss Franc Loan Analysis</CardTitle>
              <CardDescription>Real estate loan analysis based on Polish court judgments</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Analyze trends and patterns in Swiss Franc loan cases from Polish courts. View structured information about court decisions, loan terms, and outcomes.</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/use-cases/uk-judgments">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle>UK Judgment Analysis</CardTitle>
              <CardDescription>Analysis of UK court judgments and precedents</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Explore and analyze UK court judgments with structured information extraction and trend visualization.</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
