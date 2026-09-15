import * as React from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@juddges/design-system";

export const JudgmentOutline = () => (
  <Accordion type="single" collapsible defaultValue="facts" className="w-full max-w-2xl">
    <AccordionItem value="facts">
      <AccordionTrigger>Facts of the case</AccordionTrigger>
      <AccordionContent>
        On 3 June 2022 the accused entered a warehouse in Wrocław-Fabryczna and removed goods
        valued at 41,300 PLN. The District Court (III K 219/22) sentenced him to three years
        of imprisonment under art. 278 § 1 k.k.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="grounds">
      <AccordionTrigger>Grounds of appeal</AccordionTrigger>
      <AccordionContent>
        The defence argued that the first-instance court failed to weigh the accused&apos;s
        restitution and prior clean record.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="holding">
      <AccordionTrigger>Holding</AccordionTrigger>
      <AccordionContent>Sentence reduced to two years and six months; conviction upheld.</AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const MultipleOpen = () => (
  <Accordion type="multiple" defaultValue={["issue", "decision"]} className="w-full max-w-2xl">
    <AccordionItem value="issue">
      <AccordionTrigger>Issue — credit for a late guilty plea</AccordionTrigger>
      <AccordionContent>
        R v Okafor [2023] EWCA Crim 412: whether a plea entered on the first day of trial
        attracts any reduction under the Sentencing Council guideline.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="decision">
      <AccordionTrigger>Decision</AccordionTrigger>
      <AccordionContent>
        Appeal allowed; a 10% reduction should have been applied. Sentence of 5 years quashed
        and 4 years 6 months substituted.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="cited">
      <AccordionTrigger>Authorities cited</AccordionTrigger>
      <AccordionContent>R v Caley [2012] EWCA Crim 2821; R v Plaku [2021] EWCA Crim 568.</AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const AllCollapsed = () => (
  <Accordion type="single" collapsible className="w-full max-w-2xl">
    <AccordionItem value="a">
      <AccordionTrigger>Sąd Apelacyjny we Wrocławiu — II AKa 47/23</AccordionTrigger>
      <AccordionContent>Sentence reduced.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="b">
      <AccordionTrigger>Sąd Najwyższy — III KK 112/21</AccordionTrigger>
      <AccordionContent>Cassation allowed.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="c">
      <AccordionTrigger>Court of Appeal (Criminal Division) — [2023] EWCA Crim 412</AccordionTrigger>
      <AccordionContent>Sentence quashed.</AccordionContent>
    </AccordionItem>
  </Accordion>
);
