# Contributing to Badassery PR

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. Follow the setup instructions in [README.md](README.md)
4. Create a new branch for your work

## Branch Naming Convention

```
feature/short-description    # New features
fix/short-description        # Bug fixes
docs/short-description       # Documentation changes
refactor/short-description   # Code refactoring
```

Examples:
- `feature/add-spotify-scraping`
- `fix/apple-rating-parsing`
- `docs/update-api-guide`

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

[optional body]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `test` — Adding or updating tests
- `chore` — Build process, dependencies, or tooling changes

**Examples:**
```
feat(scraper): add Spotify podcast scraping
fix(scoring): correct percentile calculation for small categories
docs(readme): update deployment instructions
refactor(enricher): optimize RSS parallel processing
```

## Pull Request Process

1. Create your feature branch from `main`
2. Make your changes
3. Test your changes locally
4. Update documentation if needed
5. Submit a Pull Request with a clear description

### PR Checklist

- [ ] Code works locally (`npm run dev`)
- [ ] Build succeeds (`npm run build`)
- [ ] No secrets or API keys in the code
- [ ] No large data files included
- [ ] Documentation updated if needed
- [ ] Commit messages follow the convention

## Development Workflow

### Web App (React)

```bash
cd webapp/badassery
npm run dev         # Start dev server
npm run build       # Build for production
npm run deploy      # Deploy to Firebase Hosting
```

### Python Scripts (Enrichment)

```bash
# Activate virtual environment
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # Mac/Linux

# Run enrichment
python podcast_enricher_v2.py
```

### Cloud Functions

```bash
cd webapp/badassery/functions
npm run build                           # Compile TypeScript
firebase deploy --only functions        # Deploy
```

## Reporting Bugs

Open a GitHub Issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Environment (OS, Node version, Python version)

## Security

**NEVER** commit:
- API keys or secrets
- `.env` files
- `serviceAccountKey.json`
- Firebase admin SDK JSON files
- Gmail passwords

If you accidentally commit a secret, notify the project owner immediately so credentials can be rotated.

## Questions?

Open a GitHub Issue or reach out to the project owner.
