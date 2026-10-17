/**
 * YouTube Content Script
 * Removes recommendations, redirects homepage to Watch Later,
 * and implements keyword filtering
 */

(function() {
  'use strict';

  // Distracting keywords to filter out
  const BLOCKED_KEYWORDS = [
    'prank', 'pranks', 'pranked',
    'reaction', 'reacts', 'reacting',
    'shorts', 'short',
    'compilation', 'compilations',
    'tiktok', 'viral',
    'drama', 'beef',
    'exposed', 'exposing',
    'cringe'
  ];

  // Check if extension is enabled
  chrome.storage.local.get(['extensionEnabled'], (data) => {
    if (data.extensionEnabled === false) {
      return; // Extension disabled, don't modify YouTube
    }

    initYouTubeFocusMode();
  });

  function initYouTubeFocusMode() {
    console.log('Focus Guardian: YouTube Focus Mode Active');

    // Redirect homepage to Watch Later
    redirectToWatchLater();

    // Remove recommendations immediately
    removeRecommendations();

    // Set up MutationObserver for SPA navigation
    // YouTube is a single-page app, so we need to watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      removeRecommendations();
      checkForHomeRedirect();
    });

    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for URL changes (YouTube SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        onUrlChange();
      }
    }).observe(document.querySelector('title'), {
      childList: true,
      subtree: true
    });
  }

  /**
   * Redirect homepage to Watch Later
   */
  function redirectToWatchLater() {
    if (window.location.pathname === '/' || window.location.pathname === '/feed/trending') {
      console.log('Focus Guardian: Redirecting to Watch Later');
      window.location.href = 'https://www.youtube.com/playlist?list=WL';
    }
  }

  /**
   * Check if we're on homepage and redirect
   */
  function checkForHomeRedirect() {
    if (window.location.pathname === '/' || window.location.pathname === '/feed/trending') {
      redirectToWatchLater();
    }
  }

  /**
   * Called when URL changes (SPA navigation)
   */
  function onUrlChange() {
    console.log('Focus Guardian: URL changed, reapplying focus mode');
    redirectToWatchLater();
    removeRecommendations();
  }

  /**
   * Main function to remove all recommendations and distractions
   */
  function removeRecommendations() {
    // Check if we're on the Watch Later page
    const isWatchLaterPage = window.location.href.includes('list=WL') ||
        window.location.pathname.includes('/playlist');

    // Only hide homepage recommendations if NOT on Watch Later
    if (!isWatchLaterPage) {
      removeHomeRecommendations();
    }

    // Sidebar recommendations (related videos) - hide on all pages
    removeSidebarRecommendations();

    // End screen recommendations - hide on all pages
    removeEndScreenRecommendations();

    // Comments (optional) - hide on all pages
    removeComments();

    // Filter videos by keywords - but skip on Watch Later page
    if (!isWatchLaterPage) {
      filterVideosByKeywords();
    }
  }

  /**
   * Remove homepage feed recommendations (but not playlist content)
   */
  function removeHomeRecommendations() {
    // Only hide these if we're actually on the homepage/trending
    const isHomepage = window.location.pathname === '/' ||
        window.location.pathname === '/feed/trending';

    if (!isHomepage) return;

    const selectors = [
      'ytd-rich-grid-renderer', // Main grid on homepage
      'ytd-two-column-browse-results-renderer',
      '#contents.ytd-rich-grid-renderer',
      'ytd-browse[page-subtype="home"]',
      'ytd-browse[page-subtype="trending"]'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.dataset.focusGuardianHidden) {
          el.style.display = 'none';
          el.dataset.focusGuardianHidden = 'true';
        }
      });
    });
  }

  /**
   * Remove sidebar recommendations (related videos)
   * Only when watching individual videos, not on playlist pages
   */
  function removeSidebarRecommendations() {
    // Check if we're on a watch page (individual video)
    const isWatchPage = window.location.pathname === '/watch';

    if (!isWatchPage) return; // Don't hide sidebar on playlist pages

    const selectors = [
      '#related', // Main related videos container
      'ytd-watch-next-secondary-results-renderer',
      '#secondary', // Secondary column
      'ytd-compact-video-renderer', // Individual recommendation items
      'ytd-shelf-renderer' // Shelves of recommendations
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.dataset.focusGuardianHidden) {
          el.style.display = 'none';
          el.dataset.focusGuardianHidden = 'true';
        }
      });
    });
  }

  /**
   * Remove end screen recommendations
   */
  function removeEndScreenRecommendations() {
    const selectors = [
      '.ytp-ce-element', // End screen elements
      '.ytp-endscreen-content',
      '.ytp-suggestion-set',
      'ytp-ce-covering-overlay',
      '.ytp-ce-covering-image',
      '.ytp-ce-expanding-overlay-background'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.dataset.focusGuardianHidden) {
          el.style.display = 'none';
          el.dataset.focusGuardianHidden = 'true';
        }
      });
    });
  }

  /**
   * Remove comments section (optional)
   */
  function removeComments() {
    const selectors = [
      'ytd-comments',
      '#comments',
      'ytd-comment-thread-renderer'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (!el.dataset.focusGuardianHidden) {
          el.style.display = 'none';
          el.dataset.focusGuardianHidden = 'true';
        }
      });
    });
  }

  /**
   * Filter videos containing distracting keywords
   * Only applies to homepage and search results, NOT playlists
   */
  function filterVideosByKeywords() {
    // Don't filter on playlist pages - user intentionally added these
    const isPlaylistPage = window.location.href.includes('list=') ||
        window.location.pathname.includes('/playlist');

    if (isPlaylistPage) return;

    // Find all video elements
    const videoElements = document.querySelectorAll([
      'ytd-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer'
      // Note: Removed 'ytd-playlist-video-renderer' to avoid filtering playlist videos
    ].join(','));

    videoElements.forEach(video => {
      // Get title
      const titleElement = video.querySelector('#video-title');
      if (!titleElement) return;

      const title = titleElement.textContent.toLowerCase();

      // Check if title contains any blocked keywords
      const containsBlockedKeyword = BLOCKED_KEYWORDS.some(keyword =>
          title.includes(keyword.toLowerCase())
      );

      if (containsBlockedKeyword && !video.dataset.focusGuardianFiltered) {
        video.style.display = 'none';
        video.dataset.focusGuardianFiltered = 'true';
        console.log('Focus Guardian: Filtered video with blocked keyword:', title);
      }
    });
  }

  /**
   * Add a motivational message overlay
   */
  function addMotivationalOverlay() {
    // Check if overlay already exists
    if (document.querySelector('.focus-guardian-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'focus-guardian-overlay';
    overlay.innerHTML = `
      <div class="focus-message">
        <h3>🎯 Focus Mode Active</h3>
        <p>Recommendations hidden. Focus on intentional learning.</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

})();