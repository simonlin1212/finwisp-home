# Kiro plan (AWS Builder mini challenge)

## What the rules say (official rules page, read 2026-10-15 12:15 SGT)
> AWS Builder (Mini Challenge): Any primary track project that incorporates AWS services (i.e. Amazon Bedrock, AgentCore, Strands SDK, **Kiro Crew**, SageMaker, etc.) with documented integrations.
> Kiro Crew qualifies on its own as a development tool used during the hackathon — a submission does not need to also call a runtime AWS service (Bedrock, AgentCore, SageMaker, Strands SDK) to count for this mini-challenge.
> For AWS Builder: Describe which AWS service(s) you used and how, in your Product Feedback answer.

Judging hint for this mini challenge: "Obvious: single Bedrock call, S3. Creative: multi-service pipeline …, agentic architecture with Claude/Kiro for development workflow, agent orchestration patterns."

Note: the rules name **Kiro Crew** (the open-source agent workspace that runs on top of Kiro CLI and reads the project's `.kiro/` steering, skills and agents). Whether plain Kiro IDE/CLI use also counts is not stated; the safest path is to run the work through Kiro Crew (or at least Kiro CLI, which Crew drives) and document it.

## What runs where
- Kiro CLI: Linux glibc ≥ 2.34 x86_64/ARM64, macOS, Windows 11. Kiro Crew: macOS, Linux, Windows; runs on Kiro CLI. Kiro IDE: macOS/Windows/Linux desktop.
- The build box (Debian 13, glibc 2.41, x86_64) meets the CLI requirement. kiro-cli 2.31.1 and Kiro Crew 0.8.0 were installed there on 2026-10-15.
- **Sign-in is required** before any use: `kiro-cli login` with AWS Builder ID, Google or GitHub (device-code flow works on headless machines). Free tier: 50 credits, rate-limited; paid tiers from $20/month. Model use is billed to the Kiro subscription, not to an AWS account. Builder ID is separate from an AWS account; no AWS resources or credit card are needed for the free tier.

## Outcome (2026-10-15 13:20 SGT)
- **Done:**
  - Simon signed in to Kiro CLI with his Builder ID.
  - Kiro Crew 0.8.0 was installed on the box.
  - The spec and steering files were authored for Kiro.
- **Not done by Kiro:** Kiro Crew ran on the bank-aware-cards spec three times (about 28 of 50 free credits) and produced no code:
  - Run 1: worktree writes were denied.
  - Run 2: headless edits were rejected.
  - Run 3: the first attempt hit Bedrock throttling at decomposition. The retry, with `dangerously_skip_permissions` on, still had every write rejected (`headless_no_authorization`).
- **Decision (Simon):** drop Kiro for code. The feature was implemented manually. Kiro did not write it. See `docs/KIRO_LOG.md`.
- **Eligibility:** it is uncertain whether this still qualifies for the AWS Builder mini-challenge. Kiro Crew was installed, signed in and attempted, but contributed no code. Say exactly this in the Product Feedback answer; don't overstate it.

## Original plan (real feature: bank-aware cards)
1. Simon signs in to Kiro once (on his Mac, or on the box via `kiro-cli login` device code), with his own Builder ID / Google / GitHub.
2. Open this repo in Kiro (IDE, CLI or Crew). The `.kiro/steering/` files (product, tech, structure, kiro-usage) load automatically.
3. Run the spec `.kiro/specs/bank-aware-cards/` task by task (requirements → design → tasks are already written; Kiro can refine them). It is small (5 tasks), fixture-tested, and fixes a real gap found on 2026-10-15: banks show "insufficient data" for gross/operating margin.
4. After each task: `npm test`, `npm run typecheck`, `npm run web:build`. Log in `docs/KIRO_LOG.md`; any friction goes to `FRICTION_LOG.md` (counts toward the up-to-10% friction bonus).
5. Capture 10–15 s of screen for the video (Kiro executing a spec task, tests going green) and write the Product Feedback paragraph for Kiro / Kiro Crew.
6. Optional, only if budget allows: a Bedrock call is NOT needed for eligibility (rules above). AWS credits are gone; avoid paid AWS resources.

## Deadline
Feature freeze 2026-10-20 (internal). Submission closes 2026-10-23 12:00 PT (2026-10-24 03:00 SGT).
