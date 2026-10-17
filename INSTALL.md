# 🚀 Quick Installation Guide

## Step-by-Step Setup (5 minutes)

### 1. Download the Extension
- Download all files in the `focus-guardian` folder
- Keep the folder structure intact

### 2. Open Chrome Extensions
- Open Chrome browser
- Type `chrome://extensions/` in the address bar
- Press Enter

### 3. Enable Developer Mode
- Look for the toggle in the **top-right corner**
- Switch "Developer mode" to **ON**

### 4. Load the Extension
- Click the **"Load unpacked"** button (top-left)
- Navigate to and select the `focus-guardian` folder
- Click "Select Folder"

### 5. Verify Installation
- You should see "Focus Guardian" in your extensions list
- The status should show "Enabled"
- Look for the shield icon 🛡️ in your toolbar

### 6. Pin to Toolbar (Recommended)
- Click the **puzzle piece icon** in Chrome toolbar
- Find "Focus Guardian"
- Click the **pin icon** next to it

## ✅ Test It Out

### Test Instagram Blocking:
1. Go to `instagram.com`
2. You should see a purple blocking screen
3. Try refreshing - it should block again

### Test YouTube Focus Mode:
1. Go to `youtube.com`
2. Should redirect to your Watch Later playlist
3. Open any video - no recommendations in sidebar
4. No end-screen suggestions

### Test the Lock System:
1. Click the Focus Guardian icon in toolbar
2. Click "Disable Protection"
3. Complete the challenge presented
4. Extension should disable
5. Click "Enable Protection" to turn it back on

## 🎯 First Use Tips

1. **Extension is active by default** - starts protecting immediately
2. **Easy to enable** - one click, no friction
3. **Hard to disable** - requires completing a random challenge
4. **30% chance of denial** - sometimes it just says "no"

## 🛠️ Customization

Want to customize? Edit these files:

- **Blocked keywords** → `content/youtube.js` (line 15)
- **Challenge difficulty** → `background.js` (lines 37-65)
- **Block message** → `content/instagram.js` (line 58)

## ❓ Common Issues

**Extension not showing up?**
- Make sure Developer Mode is ON
- Check that you selected the correct folder
- Try reloading the extension

**YouTube recommendations still visible?**
- Refresh the YouTube page
- Try opening a new YouTube tab
- Check browser console for errors (F12)

**Can't complete challenges?**
- Make sure you type exactly (for typing challenge)
- Check your math (for math challenge)
- Wait the full time (for timer challenge)

## 🔄 Updating the Extension

After making any code changes:
1. Go to `chrome://extensions/`
2. Find Focus Guardian
3. Click the **refresh icon** 🔄
4. Changes will take effect immediately

---

**Need help?** Check the full README.md for detailed documentation.

**Ready to focus?** 🎯 Start browsing with protection enabled!
