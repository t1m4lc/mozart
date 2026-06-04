---
description: Get the Mozart desktop app on your machine.
order: 2
---

Mozart is a desktop app. Install it once, point it at a Project, and start running Tasks.

## System requirements

- macOS 13 or later
- Windows 11
- Ubuntu 22.04+ or a compatible Debian-based Linux distribution
- Git available on your PATH
- A Claude Code or Codex account

## Download

Mozart is in private beta — [request access](https://mozart.build) and we will share a download link once your request is approved.

---

## macOS

Open the `.dmg`, drag **Mozart** into your Applications folder, then eject the disk image.

**Security warning on first launch**

Mozart is not yet code-signed. macOS will block the app the first time you open it with a message like _"Mozart.app can't be opened because Apple cannot check it for malicious software."_

To get past it:

1. Open **Finder → Applications**.
2. Right-click (or Control-click) **Mozart** → **Open**.
3. A new dialog appears with an **Open** button — click it.

If that doesn't work, go to **System Settings → Privacy & Security**, scroll to the _Security_ section, and click **Open Anyway** next to the Mozart entry. macOS may ask for your password or Touch ID before proceeding.

You only need to do this once. Subsequent launches work normally.

---

## Windows

Run the `.exe` installer and follow the on-screen steps. Mozart installs to your user folder and creates a Start Menu shortcut.

**Browser download warning**

Edge and Chrome may flag the file as _"not commonly downloaded"_ and move it to your Downloads folder with a warning. Click **Keep** (Edge) or **Keep anyway** (Chrome) to save the file.

**SmartScreen warning during install**

When you run the installer, Windows Defender SmartScreen may show _"Windows protected your PC"_ because the app isn't signed yet.

To proceed:

1. Click **More info** in the SmartScreen dialog.
2. Click **Run anyway**.

The installer will continue normally. You only need to do this once.

---

## Linux

Mozart ships as a `.deb` package for Debian-based distributions (Ubuntu 22.04+).

**Install the package**

```bash
sudo dpkg -i mozart_*.deb
```

If `dpkg` reports missing dependencies, run the following to resolve them automatically, then install again:

```bash
sudo apt-get install -f
sudo dpkg -i mozart_*.deb
```

**Launch Mozart**

After installation, Mozart appears in your application launcher. You can also start it from the terminal:

```bash
mozart
```

---

## Verify the install

After launching Mozart for the first time, open the **About** menu. The version number shown should match the build you downloaded.
