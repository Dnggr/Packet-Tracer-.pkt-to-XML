# pkt2xml-web (working title)

A small public website that converts Cisco Packet Tracer `.pkt` files into XML you can download, so you can study the XML yourself or hand it to an AI assistant to inspect, explain, or check your lab.

> **Status: PLANNING ONLY (Phase 1). Nothing is implemented yet.**
> There is no application code, no scaffold, and no deployment. Every statement below describes the *plan*.

## Intended workflow

1. Open the website.
2. Pick or drag in a `.pkt` file.
3. The file is validated and converted to XML **inside your browser** (planned; see [TECHNICAL_FEASIBILITY.md](TECHNICAL_FEASIBILITY.md)).
4. Click **Download XML**.
5. Optionally give the XML to an AI assistant. Read the privacy note first: the XML may contain device passwords ([SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md)).

## Planned deployment

GitHub repository → Vercel (static site, no server functions, no environment variables). Details: [DEPLOYMENT.md](DEPLOYMENT.md).

## Conversion engine

Based on the algorithm in [mircodz/pka2xml](https://github.com/mircodz/pka2xml) (BSD-2-Clause), pinned at commit `22fee2681779a6dd764d6562b0a134ceb339e770`. The recommended plan re-implements that four-stage algorithm in TypeScript and proves it matches the original binary byte-for-byte before anything ships. That recommendation **needs your approval** (see [DECISIONS.md](DECISIONS.md) D-002).

## Document map

| File | Owns |
|---|---|
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Goals, non-goals, MVP scope, acceptance criteria |
| [TECHNICAL_FEASIBILITY.md](TECHNICAL_FEASIBILITY.md) | What was verified, options compared, recommendation, risks |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data flow, error flow |
| [FILE_STRUCTURE.md](FILE_STRUCTURE.md) | Planned files and why each exists |
| [SECURITY_AND_PRIVACY.md](SECURITY_AND_PRIVACY.md) | Threat model, limits, privacy, legal notes |
| [TESTING_PLAN.md](TESTING_PLAN.md) | Test cases, fixtures, differential testing |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub + Vercel steps, troubleshooting |
| [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) | Ordered phases with completion criteria |
| [DECISIONS.md](DECISIONS.md) | Decision log and open questions |
