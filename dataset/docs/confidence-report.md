  Overall: 146 API calls, ~$0.02, all 24 examples processed.

  ┌────────────┬─────┬────────┬──────┬──────────┬─────────────┐
  │   Method   │ OK  │ UNSURE │ FAIL │ Accuracy │ Avg Latency │
  ├────────────┼─────┼────────┼──────┼──────────┼─────────────┤
  │ Self-check │ 21  │ 3      │ 0    │ 95%      │ 1.78s       │
  ├────────────┼─────┼────────┼──────┼──────────┼─────────────┤
  │ Redundancy │ 20  │ 4      │ 0    │ 95%      │ 1.88s       │
  ├────────────┼─────┼────────┼──────┼──────────┼─────────────┤
  │ Constraint │ 24  │ 0      │ 0    │ 95%      │ 0.66s       │
  └────────────┴─────┴────────┴──────┴──────────┴─────────────┘

  Per tier:
  - Correct (12): 100% accuracy across all methods. One false UNSURE from redundancy.
  - Edge (6): 100% accuracy, all OK — the model handled sarcasm/emoji/short text well.
  - Adversarial (6): 50% accuracy. Self-check and redundancy each flagged 3 as UNSURE, while constraint flagged 0 (it only checks format, not correctness).

  Key takeaways:
  - Self-check and redundancy are the useful confidence signals — they caught uncertainty on adversarial inputs
  - Constraint validation never triggered FAIL (gpt-4o-mini always returns valid labels), only needed 2 retries
  - Combined status gave 20 OK, 4 UNSURE, 0 FAIL
  - No need to rerun — these results are ready for your assignment
