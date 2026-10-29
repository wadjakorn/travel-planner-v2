import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// i18n ratchet: files listed in I18N_DONE may not contain user-facing English
// literals (use t()/useT(); see AGENTS.md "UI text"). Opt-in on purpose: each
// extraction phase adds the files it migrated, so files that are not listed —
// including new files on parallel branches — are not affected until i18n P6
// flips this to every file under src/.
const TEXT_ATTR =
  "/^(aria-label|placeholder|title|alt|label|description|hint|successMessage|reason|scopeLabel|scopeTitle|navLabel|confirmLabel|emptyLabel)$/";
const WORD = "/[A-Za-z]{2,}/";
const MSG =
  "User-facing text: add a key to messages/en.json + th.json and use t()/useT().";
// jsx-no-literals sees JSX text and child template literals only; these catch
// the rest. Child-expression selectors use `>` so className strings inside
// .map() callbacks don't match. The descendant selectors skip the key argument
// of t()/tp(), or the fix itself (aria-label={t('x')}) would fail lint.
const T_CALL = "CallExpression[callee.name=/^(t|tp)$/]";
const NOT_KEY = `:not(${T_CALL} > Literal)`;
const NOT_KEY_TPL = `:not(${T_CALL} > TemplateLiteral > TemplateElement)`;
export const I18N_SELECTORS = [
  `JSXAttribute[name.name=${TEXT_ATTR}] Literal[value=${WORD}]${NOT_KEY}`, // title="…", title={x ? '…' : '…'}
  `JSXAttribute[name.name=${TEXT_ATTR}] TemplateElement[value.raw=${WORD}]${NOT_KEY_TPL}`, // aria-label={`Remove ${name}`}
  `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > Literal[value=${WORD}]`, // {n === 1 ? 'stay' : 'stays'}
  `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > ConditionalExpression > ConditionalExpression > Literal[value=${WORD}]`,
  `CallExpression[callee.name='toast'] Property[key.name=/^(title|description)$/] Literal[value=${WORD}]${NOT_KEY}`,
].map((selector) => ({ selector, message: MSG }));

// Grows each phase (P1–P5); P6 replaces it with ['src/**/*.{ts,tsx}'] minus
// the exempt files (OG images, lib/seed/**, tests).
export const I18N_DONE = [
  "src/components/trip-rail.tsx",
  "src/components/i18n-provider.tsx",
  // P1 (TP-0103): shell, auth, home, errors, skeletons
  "src/app/(home)/page.tsx",
  "src/app/error.tsx",
  "src/app/not-found.tsx",
  "src/app/sign-in/page.tsx",
  "src/app/sign-in/error/page.tsx",
  "src/app/sign-in/not-invited/page.tsx",
  "src/app/sign-in/verify-request/page.tsx",
  "src/app/invite/[token]/page.tsx",
  "src/app/trip/[id]/error.tsx",
  "src/app/trip/[id]/booking/loading.tsx",
  "src/app/trip/[id]/expense/loading.tsx",
  "src/components/header.tsx",
  "src/components/account-menu.tsx",
  "src/components/trip-grid-empty.tsx",
  "src/components/trips-browser.tsx",
  "src/components/trip-create-form.tsx",
  "src/components/trip-delete-button.tsx",
  "src/components/route-progress.tsx",
  "src/components/toast.tsx",
  "src/components/pending-saves.tsx",
  "src/components/confirm-dialog.tsx",
  "src/components/skeletons.tsx",
  "src/components/trip-rail-frame.tsx",
  "src/components/public-landing.tsx",
  "src/components/trip-cover.tsx",
  "src/components/trip-card.tsx",
  "src/app/trip/new/page.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Paths, not globs: escape the `[` of dynamic route segments ([id], [token]).
    files: I18N_DONE.map((f) => f.replaceAll("[", "[[]")),
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: [
            "·", ".", "+", ",", "▾", "‹", "›", "−", "%", "/", ":", "~", "|",
            "→", "–", "—", "×", "✕", "…",
            "Traver Planel", "404", "$", "$$", "$$$", "$$$$", "+1d",
            "✈️", // decorative emoji (aria-hidden), e.g. the empty home grid
          ],
        },
      ],
      // One rule: a global no-restricted-syntax added later must merge arrays.
      "no-restricted-syntax": ["error", ...I18N_SELECTORS],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
