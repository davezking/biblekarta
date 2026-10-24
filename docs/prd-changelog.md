# PRD changelog

Changes to requirements after planning. `/triage-feedback` appends here. Use Change mode in the saas-architect skill to update the plan.

| Date | Change | Source | Affected task IDs | Status |
|---|---|---|---|---|
| 2026-10-23 | PRD v5.4: the base text is the Society's HTML Bible (scan = authority); OCR only for gaps; logged auto-cleaning; targeted proofreading (436 flags + anchor verses + 2–5% spot check, 0.5% escalation); versification map; ፡ generated at display time | PRD v5.4 | Phase 1 S2–S3 replaced; P1-S1-T1/T3/T5, P1-S3-T4/T5/T7, P1-SEED, P1-E2E rewritten; P2-S4-T2; new P3-S1-T6 | Applied (plan v3) |
| 2026-10-23 | Repo split: public `biblekarta` + private `biblekarta-scripture`; FR-29 via rulesets + CODEOWNERS; promotion gate removed | Owner decision | P1-S1-T1, P3-S1-T3, workflows | Applied (plan v3) |
| 2026-10-24 | Scripture text rules after P1-S3-T4: "!" is allowed punctuation; whitespace runs become one space (new logged, reversible cleaning rule); verses that are only "-" are flagged "Joined verses" and stored as ranges (`to`, Join decision); 12 verses with stray characters flagged "Unexpected characters" (727 flags in round 1) | Owner decision | scripture: P1-S2-T2/T4/T6, P1-S3-T1/T4 (done in biblekarta-scripture); site: P1-S3-T7, P1-E2E, architecture.md | Applied |
