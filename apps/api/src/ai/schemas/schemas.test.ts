import { loadConfig } from '../../config';
import { VALID_ENV } from '../../../test/helpers/config';
import {
  ClarifyingQuestionSchema,
  GapClusterLabelSchema,
  GroundedAnswerTrailerSchema,
  RerankAssessmentSchema,
  turnAnalysisSchema,
} from '.';

const { taxonomy } = loadConfig(VALID_ENV);
const TurnAnalysis = turnAnalysisSchema({ taxonomy });

const analysis = {
  intent: 'report_issue',
  domain: 'IT',
  category: 'network',
  urgency: 'high',
  urgencyReason: 'cannot work remotely',
  sensitivity: 'none',
  ambiguity: 'low',
  searchQuery: 'VPN connection fails on company laptop',
};

describe('TurnAnalysis', () => {
  it('accepts a valid analysis; optional fields may be omitted', () => {
    expect(TurnAnalysis.parse(analysis)).toEqual(analysis);
  });

  it('takes categories from the taxonomy config', () => {
    expect(TurnAnalysis.safeParse({ ...analysis, category: 'catering' }).success).toBe(false);
    expect(TurnAnalysis.safeParse({ ...analysis, category: 'none' }).success).toBe(true);
  });

  it('requires the subcategory to belong to the category', () => {
    expect(
      TurnAnalysis.safeParse({ ...analysis, category: 'access', subcategory: 'password_reset' })
        .success,
    ).toBe(true);
    const wrong = TurnAnalysis.safeParse({ ...analysis, subcategory: 'password_reset' });
    expect(wrong.error?.issues[0]?.path).toEqual(['subcategory']);
  });

  it('limits the search query to 30 words', () => {
    const long = Array.from({ length: 31 }, (_, i) => `w${i}`).join(' ');
    expect(TurnAnalysis.safeParse({ ...analysis, searchQuery: long }).success).toBe(false);
  });
});

describe('other output schemas', () => {
  it('RerankAssessment bounds relevance 0..3 and reasons to 15 words', () => {
    const ok = {
      ranked: [{ chunkId: 'c1', relevance: 3, reason: 'direct answer' }],
      coverage: 'full',
      missingAspects: [],
    };
    expect(RerankAssessmentSchema.safeParse(ok).success).toBe(true);
    expect(
      RerankAssessmentSchema.safeParse({ ...ok, ranked: [{ ...ok.ranked[0], relevance: 4 }] })
        .success,
    ).toBe(false);
    expect(RerankAssessmentSchema.safeParse({ ...ok, coverage: 'unknown' }).success).toBe(false);
  });

  it('GroundedAnswerTrailer and ClarifyingQuestion', () => {
    expect(GroundedAnswerTrailerSchema.parse({ uncovered: [] })).toEqual({ uncovered: [] });
    expect(
      ClarifyingQuestionSchema.safeParse({
        question: 'Which laptop?',
        fieldsAsked: ['a', 'b', 'c'],
      }).success,
    ).toBe(false);
  });
});

describe('GapClusterLabel (P-8)', () => {
  it('a short topic label and a domain', () => {
    expect(
      GapClusterLabelSchema.parse({ label: 'Parental leave for contractors', domain: 'HR' }),
    ).toEqual({ label: 'Parental leave for contractors', domain: 'HR' });
  });

  it('labels over 8 words and unknown domains are rejected', () => {
    expect(
      GapClusterLabelSchema.safeParse({
        label: 'one two three four five six seven eight nine',
        domain: 'IT',
      }).success,
    ).toBe(false);
    expect(GapClusterLabelSchema.safeParse({ label: 'VPN', domain: 'Finance' }).success).toBe(
      false,
    );
  });
});
