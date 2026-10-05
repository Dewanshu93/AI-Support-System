---
slug: it-vpn-remote-access
title: VPN and Remote Access
domain: IT
owner: IT Infrastructure Team
version: '2.0'
effectiveDate: 2026-02-01
countries: [US, UK]
employmentTypes: [full_time]
accessLevel: standard
status: active
supersedes: null
---

## Purpose

This guide explains how employees connect to internal systems from outside a company office. The
company VPN is **GlobalProtect**. It is required for the intranet, finance systems, internal code
repositories and file shares whenever you are not on the office network.

Contractors do not use GlobalProtect; they connect through the virtual desktop described in the
Contractor Device and Systems Access guide.

## Connecting

1. Open the GlobalProtect app from the system tray (Windows) or menu bar (macOS). It is installed
   on every company laptop.
2. Enter the portal address `vpn.example.com` if it is not pre-filled.
3. Sign in with your company email and password.
4. Approve the push notification in the Authenticator app on your phone.

The connection uses split tunnelling: traffic to internal systems goes through the VPN, while
general web browsing and video calls go directly to the internet.

## Troubleshooting

- **"Portal unreachable"**: check that you have an internet connection, then disconnect and
  reconnect. Hotel and café networks that need a sign-in page must be accepted in a browser first.
- **No MFA push received**: open the Authenticator app manually and pull to refresh. If your phone
  is new or was reset, re-register MFA at `password.example.com` before connecting.
- **Connected but internal sites do not load**: disconnect, wait 30 seconds and reconnect. If it
  still fails, restart the laptop.
- **GlobalProtect missing or broken**: reinstall it from Company Portal (search "GlobalProtect").

If none of these steps works, raise an IT ticket with the error message and the time it happened.

## Rules

- Do not share VPN credentials or approve MFA pushes you did not start. Report unexpected pushes to
  IT Security straight away.
- Personal devices must never be connected to the company VPN.
- The VPN disconnects after 12 hours; reconnect to continue working.
