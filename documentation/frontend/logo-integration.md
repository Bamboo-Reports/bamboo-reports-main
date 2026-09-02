# Brandfetch Logo Integration Guide

This guide details the integration of the **Brandfetch Logo API** for
fetching and displaying company logos across the application. It covers
configuration, component usage, and troubleshooting.

> **Context:** Used to enhance the visual identity of Accounts and Centers
> in tables and dialogs. Replaced the earlier Logo.dev integration on
> 2026-07-29 (see `2026-07-29-perf-and-data-hygiene.md`).

---

## 1. Configuration & Setup

### 1.1 Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` | **Yes** | Client ID from the [Brandfetch developer portal](https://developers.brandfetch.com/register). Public by design; it ships in every image URL. Without it the UI renders monogram fallbacks. |
| `BRANDFETCH_API_KEY` | No | Server-side key for Brandfetch's separate Brand API (vector originals, brand metadata). Stored for future use; the logo embed does not use it. |

### 1.2 Data Requirements

The component relies on specific database columns to extract the domain
name for the logo lookup.

- **Accounts:** Uses `account_hq_website` (mapped from `ACCOUNT WEBSITE`).
- **Centers:** Uses `center_account_website` (mapped from `CENTER ACCOUNT WEBSITE`).

> **Note:** The component includes a helper to strip protocols
> (`https://`) and paths (`/about`) to extract the raw hostname
> (e.g. `microsoft.com`).

### 1.3 URL Format

The component builds path-segment URLs against `cdn.brandfetch.io`:

```
https://cdn.brandfetch.io/domain/{domain}/w/{size}/h/{size}[/theme/{light|dark}]/fallback/404/type/icon.png?c={clientId}
```

- `w`/`h`: pixel size, doubled when `retina` (default true).
- `theme`: appended when the app theme resolves to light or dark. Theme
  variants mostly exist for the wordmark type (`type/logo`); icons are
  usually theme-neutral.
- `fallback/404`: a missing logo returns HTTP 404 so the component's
  onError renders the monogram instead of a placeholder image.
- `type/icon.png`: square icon as PNG. Extensionless serves WebP; `.jpg`
  serves JPEG. No SVG on this endpoint (use the Brand API for vectors).

`next.config.mjs` allows the `cdn.brandfetch.io` remote pattern, but images
render with `unoptimized` because Brandfetch's bot protection blocks the
Next image optimizer's server-side fetch (browsers are never blocked). The
CDN already serves exact-size images, so nothing is lost.

---

## 2. Component Reference: `<CompanyLogo />`

A reusable component located at `components/ui/company-logo.tsx`.

### 2.1 Props Interface

```typescript
interface CompanyLogoProps {
  // The website URL or domain (e.g. "https://google.com" or "google.com")
  domain?: string;

  // Company name for alt text and fallback initials
  companyName: string;

  // Size variant (controls dimensions and requested image size)
  size?: "sm" | "md" | "lg" | "xl";

  // Theme preference (defaults to "auto": follows the app theme)
  theme?: "light" | "dark" | "auto";

  // "monogram" (first letter) or "icon" (building icon) when no logo
  fallbackMode?: "monogram" | "icon";

  // Request 2x resolution for high-DPI displays (default true)
  retina?: boolean;

  // Eager-load above-the-fold logos (default false)
  priority?: boolean;

  // Additional CSS classes
  className?: string;
}
```

### 2.2 Size Mapping

| Variant | Container Size | Requested Size (retina) | Use Case |
| :--- | :--- | :--- | :--- |
| `sm` | 32px | 160px | Data Tables (`AccountRow`, `CenterRow`) |
| `md` | 48px | 200px | Detail Dialog Headers |
| `lg` | 64px | 256px | Large Summary Cards (Future) |
| `xl` | 96px | 300px | Profile / Hero Pages (Future) |

---

## 3. Implementation Details

### 3.1 Usage Locations

1. **Account Dialog:** `components/dialogs/account-details-tabbed-dialog.tsx`
2. **Center Dialog:** `components/dialogs/center-details-dialog.tsx`
3. **Account Table:** `components/tables/account-row.tsx`
4. **Center Table:** `components/tables/center-row.tsx`
5. **Grid Cards:** `components/cards/account-grid-card.tsx`, `components/cards/center-grid-card.tsx`

### 3.2 Performance & Fallback Logic

1. **Lazy Loading:** Images use `loading="lazy"` unless `priority` is set.
2. **Fallback Strategy:**
   - **State 1 (Loading):** Building icon placeholder while the image loads.
   - **State 2 (Success):** Displays the fetched PNG logo.
   - **State 3 (Error/404):** If Brandfetch has no logo for the domain,
     the request 404s and the component renders the monogram (or building
     icon, per `fallbackMode`). Expected behavior, not an error.

---

## 4. Troubleshooting

| Issue | Check | Solution |
| :--- | :--- | :--- |
| **All logos show monograms** | Environment variable | Ensure `NEXT_PUBLIC_BRANDFETCH_CLIENT_ID` is set in Vercel/local `.env` and the dev server was restarted. |
| **Monogram for one company** | Domain quality | Check the website column is a valid domain, then whether Brandfetch indexes it (expected miss otherwise). |
| **"isn't a valid image" in dev logs** | next/image optimizer | The `<Image>` must keep `unoptimized`; Brandfetch blocks the optimizer's server-side fetch. |
| **curl returns HTML docs page** | User agent | Brandfetch bounces generic CLI user agents; pass a browser UA when testing by hand. |

---

## 5. Security & Rate Limits

- **Security:** The client ID is public by design. The `BRANDFETCH_API_KEY`
  is secret; keep it server-side only.
- **Rate Limits:** Fair use of 500k requests/month, 1,000 requests per 5
  minutes per IP. The CDN sends `cache-control: immutable` (1 day), so
  browser caching absorbs most repeat views.
