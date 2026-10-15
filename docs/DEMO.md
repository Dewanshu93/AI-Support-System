# Demo script: the Loss of Pay scenario

A 10–15 minute walkthrough of the Employee Unified AI Gateway (Build Contract v2.0,
deliverable P.5 and acceptance S.2). One story covers flows 1, 5, 8, 3, 6 and 7; the
optional extras at the end show the safety rails (flow 9). The same story runs as an automated
test: `e2e/tests/lop.spec.ts`.

**The story.** Priya Shah's latest payslip carries a Loss of Pay deduction of $400.00 for a day
she has no timesheet and no attendance for. She asks the copilot why, logs the hours she
actually worked, asks payroll to review the deduction, and follows the request until an agent
picks it up.

## Before the demo

1. Pick the demo date. The examples below use **2026-10-08**, which makes the unpaid day
   **Fri 11 Sept 2026** and the amount **$400.00** (salary $104,000 / 260 working days).
2. In `.env`, set `DEMO_TODAY=2026-10-08`, then reset the demo data for that date:

   ```bash
   npm run reset -- --today 2026-10-08
   ```

   Reset (W4-08) restores the demo users, Priya's scenario (Loss of Pay $400.00 for 2026-09-11),
   timesheets, notifications and demo requests; **deletes every conversation and ticket that
   earlier rehearsals, tests or dev chats left behind**; and loads 14 days of synthetic history
   (~120 conversations, ~40 tickets, traces, feedback, a knowledge-gap snapshot) so the admin
   overview, traces, knowledge gaps and agent queues are populated. It takes well under two
   minutes and is safe to run again after every rehearsal. Evaluation runs and the audit log are
   kept. (`npm run seed` alone restores the scenario without touching other conversations.)

   Run the reset **after** any E2E run: E2E tests share the database and leave their
   conversations behind (and re-seed the scenario for 2026-10-08).

3. Start the app (`npm run dev:api`, `npm run dev:web`) and check http://localhost:4000/api/health
   reports `db`, `vectorStore` and `llmConfigured` as up/true.
4. Open http://localhost:3000 in two browser windows (or one normal and one private): one for
   Priya, one for Hana Kim (agent).
5. LLM calls use the live provider (`config/models.yaml`). A copilot turn takes a few seconds;
   if a provider is out of quota, switch the provider in `models.yaml` and restart the API.

## The walkthrough

| #   | Do                                                                                                                         | Show and say                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sign in as **Priya Shah**.                                                                                                 | The dashboard: tasks, this week's timesheet (one missing day flagged), pay with **Loss of Pay −$400.00**, active requests.                                                                                                          |
| 2   | Open the bell.                                                                                                             | "Salary reduced: Loss of Pay deduction". Notifications are in-app only.                                                                                                                                                             |
| 3   | Open the copilot and ask **"Why was my salary reduced?"**                                                                  | The reply has separate parts: **Your records** (Loss of Pay $400.00 for Fri 11 Sept, no attendance, no timesheet hours) and **What the policy says** (cited; click a citation chip).                                                |
| 4   | Point at **Next steps**.                                                                                                   | Every figure and date in "Your records" comes from code reading her records; the model only explains the policy and never sees her pay figures.                                                                                     |
| 5   | Ask **"I actually worked that day. Log 8 hours for the Banking Module on that day."**                                      | Follow-up memory: "that day" is 11 Sept without asking again.                                                                                                                                                                       |
| 6   | Show the **Confirm timesheet entry** card.                                                                                 | Date, project, hours, day total and a **Late entry** badge (the pay period has closed). "Nothing is saved until you confirm" — the chat box is locked until she decides.                                                            |
| 7   | Click **Confirm and save**.                                                                                                | "Saved to your timesheet: 8 h on Banking Module for Fri 11 Sept." Saved through the same rules as the timesheet form, and audited as "triggered by copilot, approved by employee".                                                  |
| 8   | Ask **"Please contact payroll about my Loss of Pay deduction."** Answer any question for a missing detail.                 | The AI drafts the request and an email.                                                                                                                                                                                             |
| 9   | Walk through the draft card.                                                                                               | Queue **Payroll** and priority are set by code; fields marked "From your records" were filled by code; the email (To payroll@example.com) lists the deduction, the day and the late entry. Edit the subject to show it is editable. |
| 10  | Click **Send request and email**.                                                                                          | The request is created (HR-…) and the email is recorded in the outbox (mock delivery). Nothing existed before this click.                                                                                                           |
| 11  | Open **Requests** (list, then board).                                                                                      | The new request with its stage; open it to show the timeline and the email that was sent.                                                                                                                                           |
| 12  | As **Hana Kim**, set the request to _in progress_ (agent API; the agent UI is deferred, see below). Back as Priya, reload. | The tracker shows **Under review**, and the bell shows "HR-… is under review".                                                                                                                                                      |

Step 12 without the agent UI: from Hana's window, open the browser console on the portal and run

```js
await fetch('/api/agent/tickets/<ticket id from the URL>/status', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'in_progress' }),
});
```

## Optional extras (flow 9 and others)

| Ask (as Priya unless noted)                            | Shows                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| "Which days am I missing this week?"                   | Timesheet status from records (flow 4).                     |
| "Show my pending requests."                            | Request status from the ticket store (flow 7).              |
| "What is the leave policy?" (as Olivia, then as Priya) | Cited answers that differ by country (UK / US).             |
| "My manager keeps harassing me in team meetings"       | Confidential HR handoff; no AI advice, no fields extracted. |
| "Book me a flight to Paris"                            | Fixed out-of-scope reply.                                   |
| "It's broken"                                          | One clarifying question.                                    |
| The same payroll request again, in a new chat          | "Add to the existing request or create a new one?"          |
| "Why was my salary reduced?" as **Tom Clarke**         | Contractors are paid by their agency; no payslip figures.   |

## If something goes wrong

- **A copilot turn shows an error:** the provider failed or is out of quota. Retry, or switch
  the provider in `config/models.yaml` and restart the API.
- **The dashboard shows a different day or amount:** the data was seeded for another date. Seed
  again with `--today` matching `DEMO_TODAY`.
- **Step 7 says the day is already logged:** the scenario was already run. Seed again.
