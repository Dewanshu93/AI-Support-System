---
slug: it-office-wifi
title: Office Wi-Fi Networks
domain: IT
owner: IT Infrastructure Team
version: '1.3'
effectiveDate: 2025-09-01
countries: [US, UK]
employmentTypes: [full_time, contractor]
accessLevel: standard
status: active
supersedes: null
---

## Networks in every office

| Network       | Who can use it                      | How to connect                                   |
| ------------- | ----------------------------------- | ------------------------------------------------ |
| `Corp-Secure` | Company laptops and enrolled phones | Connects automatically with your company sign-in |
| `Corp-Guest`  | Visitors and personal devices       | Daily voucher from reception, valid for 24 hours |

Company laptops join `Corp-Secure` automatically using certificate authentication. You do not need a
password, and you do not need the VPN while connected to `Corp-Secure`.

Contractors working on their own devices use `Corp-Guest` and then open the virtual desktop.

## Connecting a company laptop

If your laptop does not join `Corp-Secure`:

1. Turn Wi-Fi off and on again.
2. Remove ("forget") `Corp-Secure` and select it again; choose the company certificate if asked.
3. Restart the laptop while in the office so it can renew its certificate.

## Guest access

Ask reception for a guest voucher. Each voucher works on up to two devices for 24 hours. Guest Wi-Fi
is internet-only: it cannot reach internal systems, printers or file shares.

## Rules

- Do not connect personal devices to `Corp-Secure`.
- Do not set up personal hotspots or routers in the office; they interfere with the office network.
- Report a weak or missing signal in a meeting room with the room name, so IT can check the access
  point.
