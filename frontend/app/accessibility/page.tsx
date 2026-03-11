import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accessibility, Eye, Keyboard, Volume2, Monitor, Heart, Mail } from "lucide-react";

export default function AccessibilityPage() {
 return (
 <div className="container mx-auto px-4 py-12 max-w-4xl">
 {/* Header */}
 <div className="mb-8">
 <Badge variant="outline"className="mb-4">
 <Accessibility className="h-3 w-3 mr-1"/>
 Accessibility
 </Badge>
 <h1 className="text-4xl font-bold tracking-tight mb-4">
 Accessibility Statement
 </h1>
 <p className="text-lg text-muted-foreground">
 Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
 </p>
 </div>

 {/* Commitment */}
 <Alert className="mb-8">
 <Heart className="h-4 w-4"/>
 <AlertDescription>
 Wrocław University of Science and Technology is committed to ensuring digital accessibility for people with disabilities.
 We are continually improving the user experience for everyone and applying the relevant accessibility standards.
 </AlertDescription>
 </Alert>

 {/* Content Sections */}
 <div className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle>Our Commitment</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 JuDDGES strives to ensure that its services are accessible to people with disabilities. We have invested
 significant resources to help ensure that our website is made easier to use and more accessible for people
 with disabilities, with the strong belief that website accessibility efforts assist all users and that
 every person has the right to live with dignity, equality, comfort, and independence.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Accessibility Features</CardTitle>
 <CardDescription>
 We implement various features to make our platform more accessible
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex gap-3">
 <div className="flex-shrink-0">
 <Keyboard className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h3 className="font-semibold mb-1">Keyboard Navigation</h3>
 <p className="text-sm text-muted-foreground">
 All interactive elements can be accessed using keyboard navigation. Use Tab to move forward,
 Shift+Tab to move backward, and Enter or Space to activate elements.
 </p>
 </div>
 </div>

 <div className="flex gap-3">
 <div className="flex-shrink-0">
 <Eye className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h3 className="font-semibold mb-1">Screen Reader Compatibility</h3>
 <p className="text-sm text-muted-foreground">
 Our website is designed to work with popular screen readers including JAWS, NVDA, and VoiceOver.
 We use proper semantic HTML and ARIA labels to ensure content is properly announced.
 </p>
 </div>
 </div>

 <div className="flex gap-3">
 <div className="flex-shrink-0">
 <Monitor className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h3 className="font-semibold mb-1">Responsive Design</h3>
 <p className="text-sm text-muted-foreground">
 Our platform adapts to different screen sizes and works on various devices, making it accessible
 to users with different needs and preferences.
 </p>
 </div>
 </div>

 <div className="flex gap-3">
 <div className="flex-shrink-0">
 <Volume2 className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h3 className="font-semibold mb-1">Clear Content Structure</h3>
 <p className="text-sm text-muted-foreground">
 We use proper heading hierarchy, clear labels, and descriptive text to help users understand
 the content and navigate the site efficiently.
 </p>
 </div>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Standards Compliance</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 JuDDGES aims to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standards.
 These guidelines explain how to make web content more accessible for people with disabilities and
 user-friendly for everyone.
 </p>
 <p>
 We continuously monitor our website to ensure compliance with these standards and are committed to
 addressing any accessibility issues that are identified.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Known Limitations</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 Despite our best efforts to ensure accessibility of JuDDGES, there may be some limitations. Below is
 a description of known limitations:
 </p>
 <ul>
 <li>Some complex visualizations may not be fully accessible to screen reader users</li>
 <li>PDF documents uploaded by users may not meet accessibility standards</li>
 <li>Some third-party integrations may have their own accessibility limitations</li>
 </ul>
 <p className="text-sm text-muted-foreground mt-4">
 We are actively working to address these limitations in future updates.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Assistive Technologies</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 JuDDGES is designed to be compatible with the following assistive technologies:
 </p>
 <ul>
 <li>Screen readers (JAWS, NVDA, VoiceOver)</li>
 <li>Screen magnification software</li>
 <li>Speech recognition software</li>
 <li>Alternative input devices</li>
 </ul>
 <p>
 We test our platform with these technologies to ensure the best possible experience.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Mail className="h-5 w-5"/>
 Feedback and Contact
 </CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-muted-foreground mb-4">
 We welcome your feedback on the accessibility of JuDDGES. If you encounter accessibility barriers,
 please let us know so we can work to resolve the issue:
 </p>
 <div className="space-y-2 text-sm">
 <p>
 <strong>Email:</strong>{""}
 <a href="mailto:accessibility@legal-ai.augustyniak.ai"className="text-primary hover:underline">
 accessibility@legal-ai.augustyniak.ai
 </a>
 </p>
 <p>
 <strong>Response Time:</strong> We aim to respond to accessibility feedback within 5 business days.
 </p>
 <p>
 <strong>Institution:</strong> Wrocław University of Science and Technology
 </p>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Assessment and Testing</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 JuDDGES is assessed for accessibility compliance using a combination of:
 </p>
 <ul>
 <li>Automated testing tools</li>
 <li>Manual testing with assistive technologies</li>
 <li>User testing with people with disabilities</li>
 <li>Regular accessibility audits by third-party experts</li>
 </ul>
 <p className="text-sm text-muted-foreground mt-4">
 This statement was last assessed on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
 </p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Continuous Improvement</CardTitle>
 </CardHeader>
 <CardContent className="prose prose-sm max-w-none">
 <p>
 Accessibility is an ongoing effort. We regularly review our website and implement improvements based on:
 </p>
 <ul>
 <li>User feedback and reports</li>
 <li>Evolving accessibility standards and best practices</li>
 <li>New assistive technology capabilities</li>
 <li>Regular accessibility audits and testing</li>
 </ul>
 <p>
 We are committed to providing an accessible and inclusive experience for all users.
 </p>
 </CardContent>
 </Card>
 </div>
 </div>
 );
}
