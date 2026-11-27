# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Best (Hub Admin Supervisor, Flash Express BPL HUB, Bang Phli) and his team (hub admins). Thai speakers, not technical. They sit at a hub admin desk with the PDA scanners (iData K3S) plugged into the PC by USB, usually between shifts when a device's storage is full. Best said text in v0.2 was hard to read; they need large, plain Thai and one obvious action at a time.

## Product Purpose
K3S Tool frees storage on Flash Kit PDA scanners without a factory reset. Flash Kit saves a photo for every scan (`/sdcard/imagePath/success` uploaded, `/fail` maybe not uploaded) and deleted files linger in the trash (`.trashed-*`), so devices filled up and were reset 2-3 times a day. Success = one click frees the space, no reset, no commands typed.

## Positioning
A single web page that talks to the device directly over USB from Chrome/Edge (WebUSB + ADB), so the hub needs no installed software and no Google account on the device.

## Operating Context
- Windows PC (user "Flash"), Chrome or Edge, desktop monitor ~1920x1080 and laptops 14-15".
- Device: iData K3S, Android 12 (SDK 31), 64 GB, Flash Kit package `com.flashexpress.express.courier`.
- Several devices may be plugged in at once (USB hub).
- Company device management (MDM) is present; Play Store unusable on Flash Wi-Fi.
- Hosted on GitHub Pages: https://flashadminb.github.io/k3s-tool/

## Capabilities and Constraints
- Delete success photos, trash, fail photos (warn + confirm), delete all; back up fail photos to the PC; clear cache; biggest files; auto delete on a timer; act on all devices.
- Device info (battery, Android, Flash version), screenshot, screen record, live screen with tap/swipe, restart Flash app, reboot, logcat, install/update APK (choose devices), send wallpaper (Android's wallpaper screen; one tap on device), factory reset (2 typed confirmations).
- Apps: list, uninstall, hide/restore system apps, banned-apps list; MDM and Flash apps cannot be removed.
- Standard settings, per-model photo folders, device registry and delete history (CSV).
- Never work around company restrictions; if blocked, tell the user to ask Flash IT.
- Wireless ADB postponed until IT allows PC and devices on the same Wi-Fi.
- Deletes are permanent (skip trash) and always confirmed.

## Evidence on Hand
Real device readings: iData K3S, Android 12, serial ending 660067, Flash Kit 8.2.65. No testimonials, metrics or logos to use.

## Product Principles
1. One obvious main action: free the space.
2. Plain Thai a non-technical admin can follow step by step.
3. Never risk unuploaded photos silently.
4. Respect company control; stop and point to IT.

## Accessibility & Inclusion
Large readable Thai text (users found small text hard to read); high contrast; big click targets; works on laptop and desktop screens.
