# Cloudflare Worker Setup Guide

This guide will help you set up `setup.fly-overhead.com` using GitHub Raw URLs and Cloudflare Workers.

## Overview

- **GitHub Raw**: Hosts the actual setup script
- **Cloudflare Worker**: Redirects `setup.fly-overhead.com` → GitHub Raw URL
- **Cloudflare Pages** (optional): Hosts a nice landing page

## Step 1: Upload Script to GitHub

1. **Commit the setup script to your repo:**
   ```bash
   git add setup-public-feeder.sh
   git commit -m "Add public feeder setup script"
   git push origin main
   ```

2. **Get the GitHub Raw URL:**
   ```
   https://raw.githubusercontent.com/YOUR_USERNAME/fly-overhead-feeder-service/main/setup-public-feeder.sh
   ```
   
   Replace `YOUR_USERNAME` with your GitHub username.

## Step 2: Set Up Cloudflare Worker

### Option A: Using Cloudflare Dashboard (Easiest)

1. **Log in to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Select your account

2. **Create a Worker**
   - Click "Workers & Pages" → "Create application"
   - Click "Create Worker"
   - Name it: `setup-redirect` (or any name)

3. **Add the Code**
   - Copy the contents of `cloudflare-worker.js`
   - Paste into the Worker editor
   - **Update the GitHub URL** on line 15:
     ```javascript
     const githubRawUrl = 'https://raw.githubusercontent.com/YOUR_USERNAME/fly-overhead-feeder-service/main/setup-public-feeder.sh'
     ```

4. **Deploy**
   - Click "Save and Deploy"
   - Your Worker will be available at: `setup-redirect.YOUR_SUBDOMAIN.workers.dev`

### Option B: Using Wrangler CLI

1. **Install Wrangler:**
   ```bash
   npm install -g wrangler
   ```

2. **Login:**
   ```bash
   wrangler login
   ```

3. **Create Worker:**
   ```bash
   wrangler init setup-redirect
   cd setup-redirect
   ```

4. **Update `src/index.js`** with the code from `cloudflare-worker.js`

5. **Update `wrangler.toml`:**
   ```toml
   name = "setup-redirect"
   main = "src/index.js"
   compatibility_date = "2024-01-01"
   ```

6. **Deploy:**
   ```bash
   wrangler deploy
   ```

## Step 3: Set Up Custom Domain

1. **Add Custom Domain to Worker**
   - In Cloudflare Dashboard → Workers & Pages
   - Click on your Worker
   - Go to "Settings" → "Triggers"
   - Click "Add Custom Domain"
   - Enter: `setup.fly-overhead.com`

2. **DNS Configuration**
   - Go to Cloudflare Dashboard → DNS
   - Add a CNAME record:
     - **Name**: `setup`
     - **Target**: `setup-redirect.YOUR_SUBDOMAIN.workers.dev`
     - **Proxy**: ✅ Proxied (orange cloud)

3. **Wait for DNS Propagation**
   - Usually takes a few minutes
   - Check with: `dig setup.fly-overhead.com`

## Step 4: Test

1. **Test the redirect:**
   ```bash
   curl -I https://setup.fly-overhead.com/setup.sh
   ```
   Should return a 302 redirect to GitHub Raw URL.

2. **Test the HTML page:**
   ```bash
   curl -H "Accept: text/html" https://setup.fly-overhead.com/
   ```
   Should return the HTML landing page.

3. **Test the script download:**
   ```bash
   curl -fsSL https://setup.fly-overhead.com/setup.sh | head -20
   ```
   Should show the first 20 lines of your setup script.

## Step 5: Update Documentation

Update your documentation to reference the new URL:

```markdown
## Quick Setup

```bash
curl -fsSL https://setup.fly-overhead.com/setup.sh | bash
```
```

## Optional: Add Landing Page

If you want a nicer landing page, you can:

1. **Use Cloudflare Pages:**
   - Create a simple HTML page
   - Deploy to Cloudflare Pages
   - Point `setup.fly-overhead.com` to the Pages site
   - The Worker can still handle `/setup.sh` route

2. **Or update the Worker** to serve HTML for the root path (already included in the Worker code).

## Troubleshooting

### Worker not deploying
- Check Cloudflare account limits (free tier allows 100,000 requests/day)
- Verify your code syntax

### DNS not resolving
- Wait a few minutes for DNS propagation
- Check DNS records in Cloudflare dashboard
- Verify domain is using Cloudflare nameservers

### Redirect not working
- Check Worker logs in Cloudflare Dashboard
- Verify GitHub Raw URL is correct
- Test GitHub Raw URL directly in browser

### Script not downloading
- Verify GitHub repo is public
- Check file path is correct
- Test GitHub Raw URL directly

## Cost

**Free Tier Includes:**
- ✅ 100,000 requests/day per Worker
- ✅ Unlimited Workers
- ✅ Custom domains
- ✅ Global CDN

**For most use cases, this is completely free!**

## Security Considerations

1. **GitHub Repo**: Make sure your repo is public (or use GitHub releases)
2. **Script Security**: Users should review scripts before running
3. **HTTPS**: Cloudflare automatically provides SSL/TLS
4. **Rate Limiting**: Consider adding rate limiting if needed

## Next Steps

1. ✅ Upload script to GitHub
2. ✅ Create Cloudflare Worker
3. ✅ Set up custom domain
4. ✅ Test everything
5. ✅ Update documentation
6. ✅ Share with users!

## Support

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Cloudflare Community: https://community.cloudflare.com/

