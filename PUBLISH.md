# Publishing to npm

## Setup (one-time)

1. **Create npm access token**
   - Go to [npmjs.com](https://www.npmjs.com) → Account → Access Tokens
   - Generate New Token → Select "Automation"
   - Copy the token

2. **Add token to GitHub**
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste your npm token

## Publishing

1. **Update version numbers**
   ```bash
   # Edit package.json version in both:
   # - /package.json (@basicbenframework/core)
   # - /create-basicben-app/package.json (create-basicben-app)
   ```

2. **Commit and tag**
   ```bash
   git add .
   git commit -m "v0.1.0"
   git tag v0.1.0
   git push origin main --tags
   ```

3. **GitHub Actions will automatically**
   - Run tests
   - Publish `@basicbenframework/core` to npm
   - Publish `create-basicben-app` to npm

## Manual Publishing (if needed)

```bash
# Login to npm
npm login

# Publish main package
npm publish --access public

# Publish create-basicben-app
cd create-basicben-app
npm publish --access public
```

## Packages

| Package | npm |
|---------|-----|
| `@basicbenframework/core` | Framework core |
| `create-basicben-app` | `npx create-basicben-app my-app` |
