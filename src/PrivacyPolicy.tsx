import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoA } from '@/components/LogoA';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      {/* Header with back button */}
      <div className="fixed top-4 left-4 z-10">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <ArrowLeft className="size-4 mr-1" />
            Back
          </a>
        </Button>
      </div>

      {/* Header controls */}
      <div className="fixed top-4 right-4 z-10 flex items-center gap-1">
        <ThemeToggle />
      </div>

      {/* Main content */}
      <div className="pt-16 pb-8 max-w-2xl mx-auto">
        {/* Logo and Title */}
        <div className="text-center space-y-3 mb-8">
          <div className="flex justify-center">
            <LogoA size={48} />
          </div>
          <h1
            className="text-3xl md:text-4xl font-bold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: May 8, 2026
          </p>
        </div>

        <Card>
          <CardContent className="p-6 md:p-8 space-y-6">
            <p className="text-foreground">
              HanziLens helps users analyze Chinese text selected on webpages or
              captured from screenshot regions. This policy explains what data is
              transmitted, how it is used, and what HanziLens does not collect or
              sell.
            </p>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Data HanziLens transmits
              </h2>
              <p className="text-foreground">
                HanziLens does not continuously read webpages. It only sends
                content after you explicitly invoke analysis through the extension
                context menu, keyboard shortcut, screenshot selection tool, or
                dictionary lookup inside the HanziLens popup.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-foreground">
                <li>
                  <strong>Selected text:</strong> When you analyze selected
                  Chinese text, the selected text is sent to the HanziLens API
                  for parsing and translation.
                </li>
                <li>
                  <strong>Screenshot OCR regions:</strong> When you use screenshot
                  OCR, the selected screenshot region is sent to the HanziLens
                  API for OCR.
                </li>
                <li>
                  <strong>OCR text and sentences:</strong> OCR-derived Chinese
                  text may be sent to the HanziLens API for parsing and
                  translation.
                </li>
                <li>
                  <strong>Dictionary lookup terms:</strong> When you request a
                  dictionary lookup, the selected Chinese word or phrase is sent
                  to the HanziLens API.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Anonymous request metadata
              </h2>
              <p className="text-foreground">
                HanziLens may collect anonymous request metadata for abuse
                prevention, product analytics, debugging, reliability monitoring,
                rate limiting, and cost monitoring. This metadata may include:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                <li>Anonymous extension install ID</li>
                <li>Extension version</li>
                <li>API route</li>
                <li>Feature name</li>
                <li>Request timestamp</li>
                <li>Request status</li>
                <li>Approximate input size</li>
                <li>Rate-limit status</li>
              </ul>
              <p className="text-foreground">
                Anonymous request metadata is not used to store raw selected
                webpage text, raw OCR text, raw dictionary lookup text, raw
                screenshot image data, or raw IP addresses for analytics.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                How data is used
              </h2>
              <p className="text-foreground">
                HanziLens uses transmitted content and request metadata to:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-foreground">
                <li>
                  Provide text analysis, translation, OCR, and dictionary lookup
                  features
                </li>
                <li>Prevent abuse and enforce rate limits</li>
                <li>Debug errors and improve reliability</li>
                <li>Understand feature usage at an aggregate level</li>
                <li>Monitor backend cost and performance</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Third-party processing
              </h2>
              <p className="text-foreground">
                The HanziLens backend may send selected text or OCR-derived text
                to its configured AI provider for linguistic analysis and
                translation. The current backend uses OpenRouter for text
                analysis. Dictionary lookup is handled by the HanziLens backend
                using its dictionary database.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Local browser storage
              </h2>
              <p className="text-foreground">
                The extension stores settings locally in your browser, such as
                theme preference and an anonymous extension install ID. The
                extension does not store selected webpage text locally.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Data sharing and sale
              </h2>
              <p className="text-foreground">
                HanziLens does not sell user data. HanziLens does not use user
                data for advertising. HanziLens does not share user data for
                credit, lending, employment, housing, insurance, or eligibility
                decisions.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Retention
              </h2>
              <p className="text-foreground">
                Selected text, screenshot image regions, OCR text, and dictionary
                lookup terms are processed by the HanziLens backend to return
                requested results. Operational logs and anonymous request metadata
                may be retained for security, abuse prevention, debugging,
                analytics, reliability, and cost monitoring. Retention is limited
                to operational needs.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Permissions
              </h2>
              <p className="text-foreground">
                HanziLens requests access to website content because it needs to
                read the text or screenshot region that you explicitly ask it to
                analyze. HanziLens requests access to the HanziLens API so the
                extension can provide parsing, translation, OCR, and dictionary
                lookup features.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">
                Contact
              </h2>
              <p className="text-foreground">
                For privacy questions, contact:{' '}
                <a
                  href="mailto:support@hanzilens.com"
                  className="text-primary hover:underline"
                >
                  support@hanzilens.com
                </a>
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
