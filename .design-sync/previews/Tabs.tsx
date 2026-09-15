import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@juddges/design-system";

const Panel = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-xl text-sm leading-relaxed text-[color:var(--ink-soft)]">{children}</p>
);

export const JudgmentSections = () => (
  <Tabs defaultValue="summary" className="w-full max-w-2xl">
    <TabsList>
      <TabsTrigger value="summary">Summary</TabsTrigger>
      <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
      <TabsTrigger value="citations">Citations</TabsTrigger>
      <TabsTrigger value="metadata">Metadata</TabsTrigger>
    </TabsList>
    <TabsContent value="summary">
      <Panel>
        II AKa 47/23, Sąd Apelacyjny we Wrocławiu — appeal against a sentence for aggravated
        theft (art. 278 § 1 k.k.). The court upheld the conviction and reduced the custodial
        term to two years and six months.
      </Panel>
    </TabsContent>
    <TabsContent value="reasoning">
      <Panel>The appellate court found the first-instance assessment of mitigating factors incomplete.</Panel>
    </TabsContent>
    <TabsContent value="citations">
      <Panel>Cites III KK 112/21 (SN) and II AKa 210/22 (SA Wrocław).</Panel>
    </TabsContent>
    <TabsContent value="metadata">
      <Panel>Judgment date 14 March 2023 · Panel: SSA M. Kowalczyk (presiding), SSA J. Nowak, SSO del. A. Wiśniewska.</Panel>
    </TabsContent>
  </Tabs>
);

export const SecondTabActive = () => (
  <Tabs defaultValue="reasoning" className="w-full max-w-2xl">
    <TabsList>
      <TabsTrigger value="summary">Summary</TabsTrigger>
      <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
      <TabsTrigger value="citations">Citations</TabsTrigger>
    </TabsList>
    <TabsContent value="reasoning">
      <Panel>
        R v Okafor [2023] EWCA Crim 412 — the Court of Appeal held that the sentencing judge
        erred in treating the defendant&apos;s late guilty plea as carrying no credit at all.
      </Panel>
    </TabsContent>
  </Tabs>
);

export const WithDisabledTab = () => (
  <Tabs defaultValue="polish" className="w-full max-w-2xl">
    <TabsList>
      <TabsTrigger value="polish">Polish courts</TabsTrigger>
      <TabsTrigger value="ew">England &amp; Wales</TabsTrigger>
      <TabsTrigger value="eu" disabled>CJEU (coming soon)</TabsTrigger>
    </TabsList>
    <TabsContent value="polish">
      <Panel>Common courts (sądy powszechne), Supreme Court and Supreme Administrative Court judgments since 2000.</Panel>
    </TabsContent>
  </Tabs>
);

export const FullWidthList = () => (
  <Tabs defaultValue="search" className="w-full max-w-2xl">
    <TabsList className="w-full">
      <TabsTrigger value="search">Search</TabsTrigger>
      <TabsTrigger value="chat">Chat</TabsTrigger>
      <TabsTrigger value="extract">Extract</TabsTrigger>
    </TabsList>
    <TabsContent value="search">
      <Panel>Semantic search over 47,000+ judgments with hybrid BM25 + pgvector ranking.</Panel>
    </TabsContent>
  </Tabs>
);
