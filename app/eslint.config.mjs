import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// i18n guard: every file under src/ except I18N_EXEMPT may not contain
// user-facing English literals (use t()/useT(); see AGENTS.md "UI text").
// i18n P1–P5 grew an opt-in list file by file; P6 (TP-0109) flipped it to all
// of src/, so a new file is guarded from its first commit.
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

export const I18N_FILES = ["src/**/*.{ts,tsx}"];
// Not UI text, or text that stays English on purpose. Keep each entry justified.
export const I18N_EXEMPT = [
  // Shared social cards stay English (crawlers send no lang cookie).
  "src/app/opengraph-image.tsx",
  "src/app/trip/[[]id]/opengraph-image.tsx",
  // Seed / demo data is stored data (i18n Decision 4).
  "src/lib/seed/**",
  "src/lib/seed-trip.ts",
  "src/lib/seed-days.ts",
  // Tests assert English copy and fixtures.
  "src/**/*.test.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: I18N_FILES,
    // Globs: a literal `[` (dynamic route segments) is written `[[]`.
    ignores: I18N_EXEMPT,
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
