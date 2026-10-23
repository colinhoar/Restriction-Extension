/**
 * Site Blocker Content Script
 * Completely blocks a site (Instagram, last.fm, ...) with a custom message.
 * To block another site, add it here, to BLOCKED_SITES in background.js,
 * and to host_permissions + this script's "matches" in manifest.json.
 */

(function() {
  'use strict';

  const SITES = {
    'instagram.com': {
      name: 'Instagram',
      reason: 'Instagram is designed to capture your attention and keep you scrolling.'
    },
    'last.fm': {
      name: 'Last.fm',
      reason: 'Checking your stats and charts is a loop that never really ends.'
    }
  };

  const host = window.location.hostname;
  const siteKey = Object.keys(SITES).find((d) => host === d || host.endsWith('.' + d));
  if (!siteKey) return;
  const site = SITES[siteKey];
  
  // Check if extension is enabled
  chrome.storage.local.get(['extensionEnabled'], (data) => {
    if (data.extensionEnabled === false) {
      // Extension is disabled, allow normal access
      return;
    }
    
    // Extension is active - block the site
    blockSite();
  });
  
  function blockSite() {
    // Clear the entire page
    document.documentElement.innerHTML = '';
    
    // Create a styled blocking message
    const style = document.createElement('style');
    style.textContent = `
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        overflow: hidden;
      }
      
      .block-container {
        text-align: center;
        color: white;
        padding: 40px;
        max-width: 600px;
        animation: fadeIn 0.5s ease-in;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      .block-icon {
        font-size: 80px;
        margin-bottom: 20px;
        animation: pulse 2s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      h1 {
        font-size: 42px;
        margin: 20px 0;
        font-weight: 700;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      }
      
      p {
        font-size: 18px;
        line-height: 1.6;
        margin: 15px 0;
        opacity: 0.95;
      }
      
      .quote {
        font-style: italic;
        margin-top: 30px;
        padding: 20px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        font-size: 16px;
      }
      
      .redirect-notice {
        margin-top: 30px;
        font-size: 14px;
        opacity: 0.8;
      }
      
      .countdown {
        font-size: 48px;
        font-weight: bold;
        margin: 20px 0;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.5);
      }
    `;
    
    document.head.appendChild(style);
    
    // Create the blocking UI
    const container = document.createElement('div');
    container.className = 'block-container';
    
    // Random countdown for psychological effect
    const countdownSeconds = Math.floor(Math.random() * 6) + 5; // 5-10 seconds
    
    container.innerHTML = `
      <div class="block-icon">🛡️</div>
      <h1>${site.name} is Blocked</h1>
      <p>This site has been blocked to protect your focus and productivity.</p>
      <p>${site.reason}</p>
      <div class="quote">
        "The time you enjoy wasting is not wasted time, but the time you regret wasting is."
      </div>
      <div class="redirect-notice">
        <p>Redirecting you away in...</p>
        <div class="countdown" id="countdown">${countdownSeconds}</div>
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Implement annoying countdown and redirect loop
    let timeLeft = countdownSeconds;
    const countdownEl = document.getElementById('countdown');
    
    const countdownInterval = setInterval(() => {
      timeLeft--;
      countdownEl.textContent = timeLeft;
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        // Redirect to a blank page, creating a mild redirect loop effect
        // User can't easily get back without disabling extension
        window.location.href = 'about:blank';
      }
    }, 1000);
    
    // Prevent any attempts to modify the page
    const observer = new MutationObserver(() => {
      // If someone tries to modify the page, reset it
      if (document.body.children.length !== 1 || 
          !document.body.querySelector('.block-container')) {
        document.body.innerHTML = '';
        document.body.appendChild(container);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Prevent navigation away from block page
  window.addEventListener('beforeunload', (e) => {
    chrome.storage.local.get(['extensionEnabled'], (data) => {
      if (data.extensionEnabled !== false && 
          (host === siteKey || host.endsWith('.' + siteKey))) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  });
  
})();
