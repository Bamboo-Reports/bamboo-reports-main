# Logo.dev Integration Guide

This guide details the integration of **Logo.dev** for fetching and displaying company logos across the application. It covers configuration, component usage, and troubleshooting.

> **Context:** Used to enhance the visual identity of Accounts and Centers in tables and dialogs.

---

## 1. Configuration & Setup

### 1.1 Environment Variables
To enable logo fetching, you must provide a publishable API token.

| Variable | Required | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_LOGO_DEV_KEY` | **Yes** | The **publishable** key (starts with `pk_`) from your Logo.dev dashboard. Safe for client-side use. |

### 1.2 Data Requirements
The component relies on specific database columns to extract the domain name for the logo lookup.

-   **Accounts:** Uses `account_hq_website` (mapped from `ACCOUNT WEBSITE`).
-   **Centers:** Uses `center_account_website` (mapped from `CENTER ACCOUNT WEBSITE`).

> **Note:** The component includes a helper to strip protocols (`https://`) and paths (`/about`) to extract the raw hostname (e.g., `microsoft.com`).

---

## 2. Component Reference: `<CompanyLogo />`

A reusable, optimized component located at `components/ui/company-logo.tsx`.

### 2.1 Props Interface

```typescript
interface CompanyLogoProps {
  // The website URL or domain (e.g. "https://google.com" or "google.com")
  domain?: string | null;
  
  // Company name for alt text and fallback initials
  companyName: string;
  
  // Size variant (controls dimensions and API image quality)
  size?: "sm" | "md" | "lg" | "xl";
  
  // Theme preference (defaults to "auto" for Logo.dev detection)
  theme?: "light" | "dark" | "auto";
  
  // Additional CSS classes
  className?: string;
}
```

### 2.2 Size Mapping

The component automatically requests a higher-resolution image than the container size to ensure sharpness on high-DPI displays.

| Variant | Container Size | API Request Size | Use Case |
| :--- | :--- | :--- | :--- |
| `sm` | 32px | 80px | Data Tables (`AccountRow`, `CenterRow`) |
| `md` | 48px | 100px | Detail Dialog Headers |
| `lg` | 64px | 128px | Large Summary Cards (Future) |
| `xl` | 96px | 150px | Profile / Hero Pages (Future) |

---

## 3. Implementation Details

### 3.1 Usage Locations
The `CompanyLogo` component is currently integrated in:

1.  **Account Dialog:** `components/dialogs/account-details-dialog.tsx` (Size: `md`)
2.  **Center Dialog:** `components/dialogs/center-details-dialog.tsx` (Size: `md`)
3.  **Account Table:** `components/tables/account-row.tsx` (Size: `sm`)
4.  **Center Table:** `components/tables/center-row.tsx` (Size: `sm`)

### 3.2 Performance & Fallback Logic
1.  **Lazy Loading:** Images use `loading="lazy"` to prevent bandwidth waste on off-screen rows.
2.  **Smart Scaling:** Logos are scaled `1.5x` within their container with `8%` padding to ensure they fill the circular frame visually without being cut off.
3.  **Fallback Strategy:**
    -   **State 1 (Loading):** Shows a skeletal pulse or generic building icon.
    -   **State 2 (Success):** Displays the fetched PNG logo.
    -   **State 3 (Error/404):** If Logo.dev returns a 404 (company not found), it permanently reverts to the generic Building icon to prevent broken image icons.

---

## 4. Troubleshooting

| Issue | Check | Solution |
| :--- | :--- | :--- |
| **Logos are 403 Forbidden** | Environment Variable | Ensure `NEXT_PUBLIC_LOGO_DEV_KEY` is set in Vercel/local `.env`. |
| **Building Icon Shows (No Logo)** | Domain Quality | Check if the database field (`account_hq_website`) is empty or invalid. |
| **Building Icon Shows (Valid Domain)** | Logo Coverage | The company might not be in the Logo.dev index. This is expected behavior. |
| **Logo is blurry** | Size Prop | Ensure you aren't using `size="sm"` in a large container. Upgrade to `md` or `lg`. |

---

## 5. Security & Rate Limits

-   **Security:** The API token is publishable. Do **not** use your Secret Key (starts with `sk_`).
-   **Rate Limits:** The Free tier allows ~10k requests/month. Browser caching helps significantly reduce hit counts for recurring visitors.
