# Retrieval eval — 2026-10-06 01:00 UTC

- **Result:** PASS (gate: fused recall@5 ≥ 75.0%, reranked recall@5 ≥ fused, forbidden-doc leakage 0 in both)
- Run `6ac448328a98148ad4ac10e9`, dataset v1, commit `cfa5ea7`, 54 cases, 429.3 s
- Embeddings `gemini-embedding-001`; vectorNumCandidates 150, vectorLimit 20, keywordLimit 20, rrfK 60, fusedTopK 12, contextTopK 5, contextMinRelevance 1
- Rerank (P-2) `gemini-3.1-flash-lite`: 0 fallbacks; coverage full 45, partial 8, none 1; LLM cost $0.0842

## By mode

| Mode     | Recall@5 | Hits  | MRR   | Leakage (cases) |
| -------- | -------- | ----- | ----- | --------------- |
| vector   | 100.0%   | 54/54 | 0.991 | 0               |
| keyword  | 100.0%   | 54/54 | 0.937 | 0               |
| fused    | 100.0%   | 54/54 | 0.972 | 0               |
| reranked | 100.0%   | 54/54 | 0.991 | 0               |

## By category (recall@5)

| Category   | Cases | Vector | Keyword | Fused  | Reranked | Fused leakage |
| ---------- | ----- | ------ | ------- | ------ | -------- | ------------- |
| answerable | 35    | 100.0% | 100.0%  | 100.0% | 100.0%   | 0             |
| escalate   | 9     | 100.0% | 100.0%  | 100.0% | 100.0%   | 0             |
| partial    | 10    | 100.0% | 100.0%  | 100.0% | 100.0%   | 0             |

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
