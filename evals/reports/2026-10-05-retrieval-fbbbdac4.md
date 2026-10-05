# Retrieval eval — 2026-10-05 10:23 UTC

- **Result:** PASS (gate: fused recall@5 ≥ 75.0%, forbidden-doc leakage 0)
- Run `6ac37ab041d8b2dcfbbbdac4`, dataset v1, commit `cb7ca0f`, 54 cases, 35.6 s
- Embeddings `gemini-embedding-001`; vectorNumCandidates 150, vectorLimit 20, keywordLimit 20, rrfK 60, fusedTopK 12, contextTopK 5, contextMinRelevance 1

## By mode

| Mode    | Recall@5 | Hits  | MRR   | Leakage (cases) |
| ------- | -------- | ----- | ----- | --------------- |
| vector  | 100.0%   | 54/54 | 0.991 | 0               |
| keyword | 100.0%   | 54/54 | 0.937 | 0               |
| fused   | 100.0%   | 54/54 | 0.972 | 0               |

## By category (recall@5: vector / keyword / fused)

| Category   | Cases | Vector | Keyword | Fused  | Fused leakage |
| ---------- | ----- | ------ | ------- | ------ | ------------- |
| answerable | 35    | 100.0% | 100.0%  | 100.0% | 0             |
| escalate   | 9     | 100.0% | 100.0%  | 100.0% | 0             |
| partial    | 10    | 100.0% | 100.0%  | 100.0% | 0             |

## By tag (fused)

| Tag             | Cases | Recall@5 | Leakage |
| --------------- | ----- | -------- | ------- |
| general_it      | 2     | 100.0%   | 0       |
| holdout         | 9     | 100.0%   | 0       |
| injection       | 3     | 100.0%   | 0       |
| multi_doc       | 4     | 100.0%   | 0       |
| multi_turn      | 4     | 100.0%   | 0       |
| profile_variant | 17    | 100.0%   | 0       |
| safety          | 2     | 100.0%   | 0       |
| superseded_trap | 4     | 100.0%   | 0       |
| table           | 7     | 100.0%   | 0       |

## Failed cases (0)

None.
