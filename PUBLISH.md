# Publishing to npm

## Quick Release

Once Trusted Publishing is configured, use the release script:

```bash
# Interactive mode (prompts for version)
npm run release

# Or specify version directly
./scripts/publish.sh 0.2.0
```

The script will:
1. Prompt for new version (or offer patch/minor/major bump)
2. Update both `package.json` files
3. Commit and tag
4. Push to origin → triggers GitHub Actions

---

## First Publish (Manual)

Packages must exist before configuring Trusted Publishing.

```bash
# Login to npm
npm login

# Publish main package
npm publish --access public

# Publish @basicbenframework/create
cd create-basicben-app
npm publish --access public
```

## Setup Trusted Publishing

After packages exist, configure OIDC for automated releases.

1. Go to [npmjs.com](https://www.npmjs.com) → Package Settings → Publishing Access
2. Click "Add Linked Provider" → GitHub Actions
3. Repository: `BasicBenFramework/basicben-framework`
4. Repeat for both packages:
   - `@basicbenframework/core`
   - `@basicbenframework/create`

## Manual Publishing

If you prefer not to use the script:

1. **Update version numbers**
   ```bash
   # Edit package.json version in both:
   # - /package.json
   # - /create-basicben-app/package.json
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
   - Publish both packages to npm

## Packages

| Package | Description |
|---------|-------------|
| `@basicbenframework/core` | Framework core |
| `@basicbenframework/create` | `npx @basicbenframework/create my-app` |
