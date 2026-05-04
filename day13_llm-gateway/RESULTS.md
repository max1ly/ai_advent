# Acceptance Test Results

Run at: 2026-05-04T08:46:41.908Z

| # | Case | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Input: AWS access key (block mode) | 400, finding=AWS_ACCESS_KEY | 400, findings=["AWS_ACCESS_KEY"] | **PASS** |
| 2 | Input: Credit card + Luhn validation | 400, finding=CREDIT_CARD | 400, findings=["CREDIT_CARD"] | **PASS** |
| 3 | Input: Base64-encoded OpenAI key (recursion) | 400, finding=BASE64_SECRET with nested OPENAI_KEY | 400, findings=["BASE64_SECRET"] | **PASS** |
| 4 | Input: Fragmented key (sk-proj-abc, below 20-char threshold) | MISSED — regex requires 20+ chars after prefix | 200 (not detected — MISSED as expected) — Known limitation: regex-based detection cannot catch short/fragmented tokens. See README. | **MISSED** |
| 5 | Clean prompt (no secrets) | 200, non-empty reply, no findings | 200, reply=present, findings=none | **PASS** |
| 6 | Input: Email + phone number | 400, findings=EMAIL, PHONE | 400, findings=["EMAIL","PHONE"] | **PASS** |
| 7 | Input: GitHub personal access token | 400, finding=GITHUB_TOKEN | 400, findings=["GITHUB_TOKEN"] | **PASS** |
| 8 | Output guard: hallucinated AWS key | 502, flag=AWS_ACCESS_KEY | 502, flags=[{"name":"AWS_ACCESS_KEY","count":1,"sampleHash":"1a5d44a2dca19669"}] | **PASS** |
| 9 | Output guard: canary leak | 502, flag=canary_leak | 502, flags=["canary_leak"] | **PASS** |
| 10 | Rate limiter: exceed limit within window | 429 with retryAfter | 5 requests got 429, retryAfter=60 | **PASS** |

**Summary:** 9 PASS, 1 MISSED, 0 FAIL
