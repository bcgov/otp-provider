// Commitlint configuration (used by wagoid/commitlint-github-action in
// .github/workflows/pre-commit.yml). Extends the default conventional-commit
// rules, but relaxes the 100-char body line limit so that auto-generated
// commit bodies (e.g. Dependabot changelog/compatibility notes on grouped,
// squash-merged update PRs) don't fail CI.
// @see https://commitlint.js.org/reference/rules.html
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Disable the body line-length cap (default: 100 chars/line).
    'body-max-line-length': [0],
  },
};
