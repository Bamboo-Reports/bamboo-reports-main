import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { JotformEmbed } from "@/components/forms/jotform-embed";
import { Logo } from "@/components/layout/logo";
import { Reveal } from "@/components/motion/reveal";
import { ReportCardCarousel } from "@/components/report-card-carousel";
import { TestimonialCarousel } from "@/components/testimonial-carousel";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { getReportLanding, reportLandings } from "@/content/resources";
import { delay, step } from "@/lib/motion";
import type { ReportCardItem } from "@/content/resources";

/**
 * Landing page template for a single report, mirroring the structure of the
 * live WordPress microsites: hero with the cover and its companion panel,
 * description, chapters, quick reads, expert insights by AI maturity stage,
 * sponsor credits, closing CTA. Every report in `content/resources.ts` gets
 * its own page here; only the data differs.
 */

type Params = { params: Promise<{ slug: string }> };

/** Renders `**` emphasis in body copy as bold ink. */
function emphasised(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, index) =>
    index % 2 === 1 ? (
      <strong key={part} className="font-semibold text-ink">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

/** Card grid shared by the quick-reads and expert-insights sections.
    PHASE B: items render with the homepage placeholder image and no link
    until the article pages exist; add `href` to an item to make it a link. */
function ReportCardGrid({ items }: { items: ReportCardItem[] }) {
  return (
    <Reveal className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.title}
          className="flex flex-col gap-4 border-t border-line pt-4"
          style={step(index)}
        >
          <Image
            src="/resource-placeholder.svg"
            alt=""
            width={640}
            height={360}
            className="mt-1 aspect-video w-full rounded-md object-cover"
          />
          <h3 className="clamp-3 text-base font-semibold">{item.title}</h3>
        </div>
      ))}
    </Reveal>
  );
}

export function generateStaticParams() {
  return reportLandings.map((report) => ({ slug: report.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const report = getReportLanding(slug);
  if (!report) return {};

  return {
    title: report.metaTitle,
    description: report.metaDescription,
    alternates: {
      canonical: `/resources/reports-whitepapers/${report.slug}`,
    },
  };
}

export default async function ReportLandingPage({ params }: Params) {
  const { slug } = await params;
  const report = getReportLanding(slug);
  if (!report) notFound();

  return (
    <main id="main">
      {/* Hero. The cover carries the title, so the visible band is only the
          artifact and the single action: the cover large on the light brand
          wash, the form as a raised panel beside it. The h1 stays for
          assistive tech and the document outline. */}
      <Section spacing="none" className="report-hero-field border-b border-line">
        <Container className="py-10 sm:py-14 lg:py-16">
          <div className="mx-auto grid max-w-[65rem] items-center gap-6 sm:gap-8 lg:grid-cols-[minmax(28rem,34rem)_minmax(0,28rem)] lg:gap-12">
            <div className="flex flex-col items-center justify-center gap-4 sm:gap-5">
              <h1 className="sr-only">{report.hero.title}</h1>
              <Image
                src={report.hero.cover}
                alt={report.hero.coverAlt}
                width={768}
                height={768}
                priority
                className="anim-rise w-56 sm:w-72 lg:w-[30rem]"
              />
              <p className="max-w-xl text-center text-base font-semibold leading-relaxed text-ink-soft sm:text-lg">
                {report.hero.lede}
              </p>
            </div>

            <div
              id="download"
              className="anim-rise scroll-mt-24"
              style={delay(160)}
            >
              <div className="overflow-hidden rounded-lg bg-[#f5f5f5] px-6 pt-6 sm:px-8 sm:pt-8">
                <h2 className="text-title font-display-soft">
                  Get the full report
                </h2>
                <p className="mt-1.5 text-sm text-ink-soft">
                  Free download, sent straight to your work email.
                </p>
                <div className="mt-3 h-[34rem] overflow-hidden">
                  {report.download.jotformId ? (
                    <JotformEmbed
                      formId={report.download.jotformId}
                      title={`${report.hero.title} download form`}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* About the report. */}
      <Section spacing="default">
        <Container>
          <div className="flex flex-col gap-5">
            {report.description.map((paragraph) => (
              <p
                key={paragraph}
                className="text-lg leading-relaxed text-ink-soft"
              >
                {emphasised(paragraph)}
              </p>
            ))}
          </div>
        </Container>
      </Section>

      {/* The report's chapters, in reading order. */}
      <Section surface="subtle" bordered spacing="default">
        <Container>
          <SectionHeading
            title={report.expect.title}
            align="center"
            className="mb-12"
          />
          <Reveal className="grid gap-x-10 gap-y-10 sm:grid-cols-3">
            {report.expect.sections.map((section, index) => (
              <div
                key={section.name}
                className="flex flex-col items-center gap-3 border-t border-line pt-6 text-center"
                style={step(index)}
              >
                {section.image ? (
                  <Image
                    src={section.image}
                    alt=""
                    width={1024}
                    height={1024}
                    className="mb-1 size-24 object-contain"
                  />
                ) : null}
                <h3 className="text-title font-display-soft">{section.name}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">
                  {section.description}
                </p>
              </div>
            ))}
          </Reveal>
        </Container>
      </Section>

      <Section bordered spacing="default">
        <Container>
          <SectionHeading
            title={report.quickReads.title}
            align="center"
            className="mb-12"
          />
          <ReportCardGrid items={report.quickReads.items} />
        </Container>
      </Section>

      {/* Expert insights, grouped by the AI maturity stages the report uses.
          The stages read in order, so they stack rather than hide in tabs. */}
      <Section surface="subtle" bordered spacing="default">
        <Container>
          <SectionHeading
            title={report.expertInsights.title}
            className="mb-12"
          />
          <div className="flex flex-col gap-14">
            {report.expertInsights.groups.map((group) => (
              <div
                key={group.stage}
                id={`insights-${group.stage.toLowerCase()}`}
                className="scroll-mt-24 flex flex-col gap-6"
              >
                {group.items.length > 4 ? (
                  <ReportCardCarousel
                    items={group.items}
                    stage={group.stage}
                  />
                ) : (
                  <>
                    <p className="flex items-center gap-3 text-sm font-semibold text-accent">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-[1px] bg-signal"
                      />
                      {group.stage}
                      <span
                        aria-hidden="true"
                        className="rule-ticks h-px min-w-8 flex-1"
                      />
                    </p>
                    <ReportCardGrid items={group.items} />
                  </>
                )}
              </div>
            ))}
          </div>
        </Container>
      </Section>

      <Section bordered spacing="default">
        <Container>
          <TestimonialCarousel />
        </Container>
      </Section>

      {report.credits ? (
        <Section id="credits" bordered spacing="tight">
          <Container>
            <div className="mx-auto grid w-full max-w-xl grid-cols-2 items-start gap-8 sm:gap-14">
              <div className="grid grid-rows-[auto_7.5rem] justify-items-center gap-3 text-center">
                <p className="text-sm font-semibold text-ink-muted">
                  {report.credits.sponsor.label}
                </p>
                <div className="flex h-full w-full items-center justify-center">
                  <Image
                    src={report.credits.sponsor.logo}
                    alt={report.credits.sponsor.name}
                    width={240}
                    height={120}
                    className="h-auto w-56 shrink-0 mix-blend-multiply"
                  />
                </div>
              </div>
              <div className="grid grid-rows-[auto_7.5rem] justify-items-center gap-3 text-center">
                <p className="text-sm font-semibold text-ink-muted">
                  {report.credits.partnerLabel}
                </p>
                <div className="flex h-full items-center justify-center">
                  <Logo className="[&_svg]:h-7" />
                </div>
              </div>
            </div>
          </Container>
        </Section>
      ) : null}

    </main>
  );
}
