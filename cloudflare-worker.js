/**
 * Cloudflare Worker for setup.fly-overhead.com
 * 
 * Redirects to GitHub Raw URL for the setup script
 * Also serves a simple HTML page explaining the setup process
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // If requesting the script directly, redirect to GitHub Raw
  if (url.pathname === '/setup.sh' || url.pathname === '/') {
    // Update this URL to your actual GitHub repo
    const githubRawUrl = 'https://raw.githubusercontent.com/dhightnm/fly-overhead-feeder-service/main/setup-public-feeder.sh'
    
    // If Accept header includes text/html, serve HTML page
    const acceptHeader = request.headers.get('Accept') || ''
    if (acceptHeader.includes('text/html') && url.pathname === '/') {
      return new Response(getHTMLPage(), {
        headers: {
          'Content-Type': 'text/html',
        },
      })
    }
    
    // Otherwise redirect to GitHub Raw
    return Response.redirect(githubRawUrl, 302)
  }
  
  // 404 for other paths
  return new Response('Not Found', { status: 404 })
}

function getHTMLPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fly Overhead Feeder Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .code-block {
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 6px;
            padding: 15px;
            margin: 20px 0;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            overflow-x: auto;
        }
        .button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
            margin: 10px 5px;
            transition: background 0.3s;
        }
        .button:hover {
            background: #5568d3;
        }
        .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .warning-box {
            background: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        ul {
            margin-left: 20px;
            margin-top: 10px;
        }
        li {
            margin: 5px 0;
        }
        .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #999;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Fly Overhead Feeder Setup</h1>
        <p class="subtitle">Connect your ADS-B feeder in minutes</p>
        
        <div class="info-box">
            <strong>What you need:</strong>
            <ul>
                <li>An existing ADS-B feeder (PiAware, dump1090, etc.)</li>
                <li>SSH access to your feeder device</li>
                <li>About 5 minutes</li>
            </ul>
        </div>
        
        <h2>Quick Setup</h2>
        <p>Run this command on your feeder device:</p>
        <div class="code-block">
curl -fsSL https://setup.fly-overhead.com/setup.sh | bash
        </div>
        
        <div class="warning-box">
            <strong>⚠️ Important:</strong> This script will:
            <ul>
                <li>Register your feeder automatically</li>
                <li>Install required dependencies</li>
                <li>Set up a systemd service</li>
                <li>Start feeding data to Fly Overhead</li>
            </ul>
            <p style="margin-top: 10px;">Make sure to save your API key when prompted!</p>
        </div>
        
        <h2>Manual Setup</h2>
        <p>Prefer to set it up manually? Check out our <a href="https://docs.fly-overhead.com/feeders/setup">detailed guide</a>.</p>
        
        <h2>What Data Is Shared?</h2>
        <p>Your feeder sends aircraft tracking data (positions, altitude, speed, etc.) to help improve global aircraft tracking coverage.</p>
        <p><strong>We do NOT collect:</strong> Personal information, your IP address, or any data not related to aircraft tracking.</p>
        
        <div class="footer">
            <p>Questions? <a href="https://docs.fly-overhead.com">Documentation</a> | <a href="https://github.com/fly-overhead/feeder-service/issues">Support</a></p>
            <p style="margin-top: 10px;">Thank you for contributing to Fly Overhead! 🎉</p>
        </div>
    </div>
</body>
</html>`
}

