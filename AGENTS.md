# Repository Guidelines for AI Agents

## Git & Delivery Workflow
- **Commit and push automatically:** After completing requested changes and passing local verification, commit all changes with a clear Conventional Commit message and push the branch to `origin` without waiting to be asked.
- If working on a feature/fix branch, open a pull request against `main` via `gh pr create` unless the user explicitly asked to push directly to `main` or stay local.

## Build & Verification
- `resume.json` is the single source of truth for portfolio content, metadata, JSON-LD, `llms.txt`, `site.webmanifest`, and `sitemap.xml`. Always run `npm run build` (or `npm run sync`) after editing `resume.json` so committed files stay in sync (enforced by CI).
- Run `npm run build && npm run test:html && npm run test:perf` before committing changes to HTML, CSS, JS, `resume.json`, or build scripts.
