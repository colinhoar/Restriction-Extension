# Focus Guardian - Chrome Extension

A powerful Chrome extension designed to protect your focus by blocking Instagram completely and creating a distraction-free YouTube experience. Features a unique psychological friction system to prevent impulsive disabling.

## 🎯 Features

### 1. **Complete Instagram Blocking**
- Blocks all access to instagram.com
- Displays custom blocking message with countdown
- Automatic redirect loop to prevent easy access
- Psychological friction to discourage distraction

### 2. **YouTube Focus Mode**
- Automatically redirects homepage to "Watch Later"
- Hides all recommended videos:
  - Homepage feed
  - Sidebar recommendations
  - End-screen suggestions
- Removes comment sections (optional)
- Keyword filtering to block distracting content
- Works seamlessly with YouTube's single-page application

### 3. **Psychological Friction Lock System: The Gauntlet**
To disable the extension, you have to get through a multi-wave gauntlet of puzzles. Each wave is harder than the one before it.

**How it works:**
- **4 puzzle waves + a final commitment wave**, with no repeated puzzle types in one run
- **Escalation:** each time you disable within 24 hours, the next gauntlet gets +1 wave (up to +3), and from the 2nd disable on, every wave is at higher difficulty
- **Difficulty ramps** from tier 1 → tier 3 across the waves
- **Time limits** on every puzzle (the bar under the prompt)
- **3 strikes:** a wrong answer or timeout costs a strike, a time lockout (6s, then 12s), and a brand-new puzzle. Strike three fails the gauntlet and **locks you out for 3 minutes**
- **30-second final countdown** after the last wave before "Confirm Disable" unlocks
- **30% random denial** before the gauntlet even starts
- **No shortcuts:** text is drawn as an image (no copy/select/Ctrl+F), pasting is blocked, and answers live only in the background worker, which refuses to disable until every wave is cleared
- Progress survives closing the popup, but memory-style puzzles get re-rolled so you can't peek

**Puzzle types (each with 3 difficulty tiers):**
| Puzzle | What you do |
|---|---|
| Mental Math | Multi-step arithmetic, e.g. `206 × 25 − 55 × 36 + 836` |
| Find the Pattern | Next number in a generated sequence (interleaved, Fibonacci-like, alternating ops…) |
| Transcribe | Copy a distorted 18–30 character string (symbols at tier 3) |
| Mirror Image | Type a string backwards |
| Memory Flash | Memorize a code that vanishes after a few seconds (backwards at tier 3) |
| Letter Count | Count one letter in a grid of look-alikes (b/d/p/q/g/h/k) |
| Secret Code | Decode a Caesar-shifted word or phrase |
| Unscramble | Rearrange letters into a word |
| Find in Order | Click 1→N on a shuffled grid; tier 3 alternates 1→A→2→B… A misclick reshuffles the board |
| Pattern Recall | Watch tiles flash, then repeat the sequence (5–9 steps) |
| Final Wave | Type a commitment sentence, e.g. *"I am choosing distraction over the goals I set for myself today."* |

**Tuning:** all the knobs (wave count, strikes, lockouts, cooldown, countdown, denial chance, disable durations, guard waves/pass length) are in `GAUNTLET_CONFIG` at the top of `challenges.js`.

Re-enabling is still one click, with no friction.

### 4. **Timed Disabling**
Disabling is never permanent. On the final screen you pick **5, 15 or 30 minutes**, and protection switches itself back on when time runs out. This works even if Chrome was closed in the meantime. While it's off, the popup shows a countdown and the toolbar icon shows an **OFF** badge. "Re-enable Now" turns it back on early.

### 5. **Guarded Extensions Page**
Opening `chrome://extensions` (or the Edge/Brave/Opera/Vivaldi equivalent) swaps the page for a Focus Guardian lock screen. You have to clear **3 puzzle waves** plus a 10-second countdown, which unlocks the extensions page for **3 minutes**. After that, any open extensions tab gets locked again. The same strike rules apply: three strikes locks the page for 3 minutes. "Never mind, take me back" sends you to a new tab.

Chrome doesn't let extensions draw on top of its own `chrome://` pages, so the guard replaces the page instead of covering it. It's a strong speed bump, not a lock. You can still remove the extension from the toolbar's right-click menu ("Remove from Chrome…"), and the real page may flash for a split second before it's swapped out.

## 📦 Installation

### Method 1: Load Unpacked (Development)

1. **Download or Clone** this repository to your computer

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `focus-guardian` folder
   - The extension should now appear in your extensions list

5. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome toolbar
   - Find "Focus Guardian" and click the pin icon

### Method 2: Create .crx Package (Distribution)

```bash
# Package the extension (Chrome will create a .crx file)
# 1. Go to chrome://extensions/
# 2. Click "Pack extension"
# 3. Select the focus-guardian folder
# 4. Click "Pack Extension"
```

## 🚀 Usage

### Getting Started

1. **Click the Extension Icon** in your Chrome toolbar
2. The extension is **enabled by default** after installation
3. Visit Instagram or YouTube to see the blocking/focus features in action

### Popup Interface

The popup shows:
- **Status Indicator**: Green (active) or Red (disabled)
- **Toggle Button**: Enable/Disable the extension
- **Disable Attempts Counter**: Tracks how many times you've tried to disable
- **Motivational Quote**: Random inspiring message
- **Extension Info**: Brief description

### Disabling the Extension

When you click "Disable Protection", you'll encounter one of three random challenges:

**Math Challenge:**
```
What is 72 × 39?
[Enter answer: ____]
```

**Typing Challenge:**
```
Type this exactly:
aBc9Kl2mPqR7sWx
[Type here: ____]
```

**Timer Challenge:**
```
Please wait...
[15 seconds countdown]
[Confirm Disable button becomes active]
```

**Probabilistic Denial (30% chance):**
```
🚫 Not right now. Maybe later.
The extension knows you don't really want to disable it.
```

### Re-enabling Protection

Simply click "Enable Protection" - no challenges required! This encourages users to quickly re-activate their focus protection.

## 🛠️ Technical Details

### File Structure

```
focus-guardian/
├── manifest.json              # Extension configuration
├── background.js              # Service worker (state management)
├── content/
│   ├── instagram.js          # Instagram blocking logic
│   ├── youtube.js            # YouTube focus mode logic
│   └── youtube.css           # YouTube styling
├── popup/
│   ├── popup.html            # Popup interface
│   ├── popup.js              # Popup logic
│   └── popup.css             # Popup styling
├── icons/
│   ├── icon16.png            # 16x16 icon
│   ├── icon48.png            # 48x48 icon
│   └── icon128.png           # 128x128 icon
└── README.md                 # This file
```

### How It Works

**Background Script (`background.js`):**
- Manages global extension state in `chrome.storage.local`
- Handles enable/disable requests from popup
- Generates random challenges
- Implements 30% probabilistic denial
- Reloads affected tabs when state changes

**Instagram Content Script (`content/instagram.js`):**
- Runs at `document_start` to block page load immediately
- Completely replaces page DOM with blocking message
- Implements countdown timer and redirect loop
- Uses MutationObserver to prevent page modifications

**YouTube Content Script (`content/youtube.js`):**
- Runs at `document_end` after page loads
- Redirects homepage to Watch Later playlist
- Uses MutationObserver to handle SPA navigation
- Removes recommendations using robust selectors
- Filters videos by keyword matching
- Hides comments and end-screen suggestions

**Popup Interface:**
- Communicates with background script via `chrome.runtime.sendMessage`
- Displays current state and statistics
- Handles challenge UI and validation
- Shows random motivational quotes

### Permissions Used

- `storage`: Store extension state and settings
- `scripting`: Execute content scripts
- `activeTab`: Access current tab information
- `tabs`: Reload affected tabs
- Host permissions for `*.instagram.com` and `*.youtube.com`

## 🎨 Customization

### Modify Blocked Keywords (YouTube)

Edit `content/youtube.js`, line ~15:

```javascript
const BLOCKED_KEYWORDS = [
  'prank', 'pranks', 'pranked',
  'reaction', 'reacts', 'reacting',
  'shorts', 'short',
  // Add your own keywords here
  'gaming', 'vlog', 'challenge'
];
```

### Adjust Challenge Difficulty

Edit `background.js`:

**Math difficulty** (line ~37):
```javascript
const num1 = Math.floor(Math.random() * 90) + 10; // Change range
const num2 = Math.floor(Math.random() * 90) + 10;
```

**Typing length** (line ~47):
```javascript
const length = Math.floor(Math.random() * 6) + 15; // 15-20 chars
```

**Timer duration** (line ~57):
```javascript
const waitTime = Math.floor(Math.random() * 11) + 5; // 5-15 seconds
```

**Denial probability** (line ~65):
```javascript
const shouldDeny = Math.random() < 0.3; // 30% chance
```

### Change Instagram Block Message

Edit `content/instagram.js`, line ~58-75 in the `innerHTML` section.

## 🧪 Testing

### Test Instagram Blocking
1. Enable the extension
2. Navigate to `https://www.instagram.com`
3. You should see the purple blocking screen with countdown
4. Try refreshing - should block again

### Test YouTube Focus Mode
1. Enable the extension
2. Navigate to `https://www.youtube.com`
3. Should redirect to Watch Later
4. Open any video - sidebar recommendations should be hidden
5. Comments should be hidden

### Test Challenge System
1. Click extension icon
2. Click "Disable Protection"
3. Complete the challenge
4. Verify extension is disabled
5. Re-enable and test different challenges (refresh popup to get new challenge)

### Test Probabilistic Denial
1. Click "Disable Protection" multiple times
2. Eventually (about 30% of attempts) you should see the denial message
3. Close and try again

## 🔧 Troubleshooting

### Extension Not Working After Installation
- Make sure Developer Mode is enabled
- Try reloading the extension (click reload icon in chrome://extensions/)
- Check browser console for errors (F12)

### YouTube Recommendations Still Showing
- YouTube frequently updates their DOM structure
- Check the selectors in `content/youtube.js` and `content/youtube.css`
- The MutationObserver should catch most changes, but may need selector updates

### Instagram Not Blocking
- Ensure the extension has permission for `*.instagram.com`
- Check that content script is set to run at `document_start`
- Look for console errors in Instagram tab

### Challenges Not Working
- Clear extension storage: Chrome DevTools → Application → Storage → Local Storage → Clear
- Reload the extension
- Ensure popup can communicate with background script

## 🚨 Known Limitations

1. **YouTube Layout Changes**: YouTube frequently updates their interface. Selectors may need periodic updates.

2. **No Server-Side Enforcement**: This is a client-side solution. Tech-savvy users can disable it through Chrome's extension manager (though our friction system makes this annoying).

3. **Browser-Specific**: Built for Chrome/Edge. Won't work on Firefox without modifications (Manifest V2/V3 differences).

4. **No Cross-Device Sync**: Extension state is local to each browser installation.

## 🔒 Privacy & Security

- **No Data Collection**: This extension does not collect, store, or transmit any personal data
- **No External Requests**: All functionality is client-side
- **Open Source**: All code is visible and auditable
- **Local Storage Only**: Uses Chrome's local storage API for state management

## 🎯 Philosophy

This extension is designed around **psychological friction** rather than hard blocking:

- Easy to enable (one click)
- Annoying to disable (random challenges + probabilistic denial)
- Encourages better habits through gentle nudges
- Not meant to be unbreakable, but to make you pause and reconsider

The goal is to create a **speed bump** for impulsive distraction-seeking behavior, not to create an impenetrable fortress. Users can still disable it if truly needed, but the friction makes them conscious of the decision.

## 📝 Future Enhancements

Potential features to add:
- [ ] Customizable keyword blocklist
- [ ] Whitelist for educational YouTube channels
- [ ] Time-based rules (e.g., block during work hours)
- [ ] Statistics dashboard (time saved, blocks prevented)
- [ ] Custom motivational messages
- [ ] Options page for configuration
- [ ] Export/import settings
- [ ] Support for other distracting websites

## 🤝 Contributing

Feel free to fork and modify! Some ideas:
- Add support for other social media sites (Twitter, TikTok, Reddit)
- Improve YouTube selector robustness
- Add more challenge types
- Create a better UI
- Add dark mode

## 📄 License

This project is open source and available for personal use and modification.

## ⚠️ Disclaimer

This extension is provided as-is for productivity purposes. It's designed to help users manage their own browsing habits. The developers are not responsible for any consequences of using or modifying this extension.

---

**Built with focus. Stay productive! 🚀**
