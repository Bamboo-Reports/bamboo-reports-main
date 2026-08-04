/**
 * PHASE B: placeholder pages for the five Resources destinations, created so
 * navigation stays on this site instead of linking to the live WordPress
 * pages. Every title and lede below is stand-in copy awaiting real content;
 * replace the strings here and the pages update without touching markup.
 */

export type ResourcePage = {
  slug: string;
  navLabel: string;
  metaTitle: string;
  title: string;
  lede: string;
};

export const resourcePages: ResourcePage[] = [
  {
    slug: "reports-whitepapers",
    navLabel: "Reports & whitepapers",
    metaTitle: "Reports & whitepapers",
    title: "Reports & whitepapers",
    lede: "Original research reports and whitepapers for business and marketing leaders.",
  },
  {
    slug: "experts-view",
    navLabel: "Experts view",
    metaTitle: "Experts view",
    title: "Experts view",
    lede: "Interviews and perspectives from thought leaders, buyers and vendors across B2B technology.",
  },
  {
    slug: "insights",
    navLabel: "Insights",
    metaTitle: "Insights",
    title: "Insights",
    lede: "Articles and analysis from the Research NXT team.",
  },
  {
    slug: "success-stories",
    navLabel: "Success stories",
    metaTitle: "Success stories",
    title: "Success stories",
    lede: "How business and marketing leaders put our research to work.",
  },
  {
    slug: "events",
    navLabel: "Events",
    metaTitle: "Events",
    title: "Events",
    lede: "Launches, roundtables and engagements from Research NXT.",
  },
];

export function getResourcePage(slug: string) {
  return resourcePages.find((page) => page.slug === slug);
}

/* ---------------------------------------------------------------------------
   Report landing pages. Every report gets its own page under
   /resources/reports-whitepapers/[slug], all rendered by one template.
--------------------------------------------------------------------------- */

export type ReportCardItem = {
  title: string;
  /** Optional; card renders without a link until the article page exists. */
  href?: string;
  external?: boolean;
};

/** A run of consent text; segments with an `href` render as links. */
export type ConsentSegment = {
  text: string;
  href?: string;
  external?: boolean;
};

export type ReportLanding = {
  slug: string;
  metaTitle: string;
  metaDescription: string;

  hero: {
    title: string;
    lede: string;
    /** Path under /public. */
    cover: string;
    coverAlt: string;
  };

  /**
   * The hero download form. The real form is a Jotform embed: set `jotformId`
   * and the template renders it instead of the interim placeholder form.
   * TODO(phase-c): set the Jotform id once the form exists.
   */
  download: {
    jotformId?: string;
    submitLabel: string;
    consent: ConsentSegment[];
  };

  /** Body paragraphs; `**` marks bold emphasis. */
  description: string[];

  /** The report's chapters, in reading order. */
  expect: {
    title: string;
    sections: {
      name: string;
      description: string;
      /** Chapter illustration under /public. */
      image?: string;
    }[];
  };

  quickReads: { title: string; items: ReportCardItem[] };

  /** Expert interviews grouped by AI maturity stage, in stage order. */
  expertInsights: {
    title: string;
    groups: { stage: string; items: ReportCardItem[] }[];
  };

  /** Credit band above the closing CTA. */
  credits?: {
    sponsor: { label: string; name: string; logo: string };
    partnerLabel: string;
  };
};

/** Copy transcribed from researchnxt.com/microsite/implementer-guide-to-ai/ */
const implementersGuideToAI: ReportLanding = {
  slug: "implementers-guide-to-ai",
  metaTitle: "Implementer's Guide to AI",
  metaDescription:
    "Explore the comprehensive framework for AI readiness, strategies, governance, and cross departmental integration in Indian businesses across industries",

  hero: {
    title: "Implementer's Guide to AI",
    lede: "Explore the comprehensive framework for AI readiness, strategies, governance, and cross departmental integration in Indian businesses across industries",
    cover: "/covers/implementers-guide-to-ai.png",
    coverAlt: "Cover of the Implementer's Guide to AI report",
  },

  download: {
    jotformId: "252512579059463",
    submitLabel: "Download",
    consent: [
      {
        text: "By submitting this form, you agree to have your contact information, including email, passed on to Salesforce for the purpose of following up on your interests, and that you have read and agree to the ",
      },
      { text: "Research NXT Privacy Policy", href: "/privacy-policy" },
      { text: " and the " },
      {
        text: "Salesforce Privacy Statement",
        href: "https://www.salesforce.com/company/privacy/",
        external: true,
      },
      { text: "." },
    ],
  },

  description: [
    "The **Implementer's Guide to AI** is a practical handbook crafted to empower businesses on their journey to adopting and scaling AI.",
    "This guide is presented in partnership with Salesforce. Tailored for Indian businesses, it draws on insights from over **1,500+ survey responses** and **15+ expert interviews** across industries such as finance, retail, and healthcare. Backed by secondary research, it offers actionable strategies and real-world examples to guide effective AI adoption.",
  ],

  expect: {
    title: "What to expect from the report",
    sections: [
      {
        name: "Landscape",
        description:
          "Explore the maturity levels and current adoption patterns of AI across Indian business functions and departments",
        image: "/report-sections/implementers-guide-landscape.png",
      },
      {
        name: "Strategy",
        description:
          "Understand how strategic AI implementations align with key business objectives to drive measurable growth",
        image: "/report-sections/implementers-guide-strategy.png",
      },
      {
        name: "Governance",
        description:
          "Master responsible AI frameworks and assessment methods to ensure compliant and successful deployment",
        image: "/report-sections/implementers-guide-governance.png",
      },
    ],
  },

  quickReads: {
    title: "Quick reads and toolkits for AI adoption",
    items: [
      { title: "AI is the Future, and the Future is Now" },
      {
        title:
          "Implementer's Guide to AI: Finance Leaders Transition from Caution to Customer-Centric Scale",
      },
      {
        title:
          "Implementer's Guide to AI: Manufacturing, Automotive & Energy Leaders Move from Pilots to Scale",
      },
      {
        title:
          "Implementer's Guide to AI: Retail & Consumer Goods Leaders Shift from Experiments to Loyalty-Led Scale",
      },
      { title: "The Four Waves of AI: A Ready Guide for Business Leaders" },
    ],
  },

  expertInsights: {
    title: "Insights shared by experts",
    groups: [
      {
        stage: "Exploring",
        items: [
          {
            title:
              "Transforming SaaS, Reviving Storytelling, and Redefining the Future of Creativity",
          },
          {
            title: "How Spacewood Leverages AI to Redefine Customer Experience",
          },
        ],
      },
      {
        stage: "Experimenting",
        items: [
          {
            title:
              "How Carat Lane is Redefining Customer Experience in the Jewellery Industry",
          },
          {
            title: "SkinQ's AI-Powered Vision and Strategic Marketing Insights",
          },
        ],
      },
      {
        stage: "Implementing",
        items: [
          {
            title:
              "AI-Driven Branding & Digital Marketing: Insights from Hansveen Kaur",
          },
          {
            title:
              "AI's Role in Engineering & Infrastructure: Insights from Manish",
          },
          {
            title:
              "Transforming Retail with AI: Insights from Pressto's Marketing Evolution",
          },
          {
            title:
              "AI in Manufacturing: Driving Digital Transformation and Intelligent Operations",
          },
          {
            title:
              "Insights on Data Unification, Customer Experience, and Ethical Innovation",
          },
          {
            title:
              "How Edelweiss Life Insurance is Redefining Industry Standards Through Innovation and AI",
          },
        ],
      },
      {
        stage: "Deployed",
        items: [
          { title: "AI-Led Transformation in Automotive Manufacturing" },
          { title: "How AI Powers Kissht's Customer-Centric Approach" },
          {
            title:
              "Transforming Customer Engagement, Decision-Making, and Operational Efficiency",
          },
          {
            title:
              "How PolicyBoss is Leveraging AI to Redefine Distribution, Personalisation, and Customer Experience",
          },
          {
            title:
              "Transforming Insurance Sales and Distribution at Allianz Partners",
          },
          {
            title:
              "How Apollo Hospitals Leverages AI to Revolutionise Patient Care and International Outreach",
          },
        ],
      },
    ],
  },

  credits: {
    sponsor: {
      label: "Research sponsor",
      name: "Salesforce",
      logo: "/logos/trusted/salesforce.png",
    },
    partnerLabel: "Research partner",
  },
};

export const reportLandings: ReportLanding[] = [implementersGuideToAI];

export function getReportLanding(slug: string) {
  return reportLandings.find((report) => report.slug === slug);
}
