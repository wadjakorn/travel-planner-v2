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
// .map() callbacks don't match.
export const I18N_SELECTORS = [
  `JSXAttribute[name.name=${TEXT_ATTR}] Literal[value=${WORD}]`, // title="…", title={x ? '…' : '…'}
  `JSXAttribute[name.name=${TEXT_ATTR}] TemplateElement[value.raw=${WORD}]`, // aria-label={`Remove ${name}`}
  `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > Literal[value=${WORD}]`, // {n === 1 ? 'stay' : 'stays'}
  `:matches(JSXElement, JSXFragment) > JSXExpressionContainer > ConditionalExpression > ConditionalExpression > Literal[value=${WORD}]`,
  `CallExpression[callee.name='toast'] Property[key.name=/^(title|description)$/] Literal[value=${WORD}]`,
].map((selector) => ({ selector, message: MSG }));

// Grows each phase (P1–P5); P6 replaces it with ['src/**/*.{ts,tsx}'] minus
// the exempt files (OG images, lib/seed/**, tests).
export const I18N_DONE = [
  "src/components/trip-rail.tsx",
  "src/components/i18n-provider.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: I18N_DONE,
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
