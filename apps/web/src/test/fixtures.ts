// Shared test data for web unit and component tests (not imported by app code).
import type { TicketDraft } from '@sd/shared';

export const DRAFT: TicketDraft = {
  domain: 'IT',
  category: 'hardware',
  subcategory: 'laptop_fault',
  queue: { id: 'it_hardware', label: 'IT Hardware' },
  priority: 'high',
  aiUrgency: 'medium',
  priorityFloorApplied: 'org_impact',
  impactScope: 'me',
  summary: 'Laptop does not power on',
  description: 'The laptop does not power on after a battery drain.',
  alreadyTried: ['charging overnight'],
  errorMessages: [],
  fields: {
    device_model: 'Dell Latitude 7440',
    symptoms: 'Does not power on',
    started_at: 'unknown',
    asset_tag: 'unknown',
  },
  aiFilledFields: ['device_model', 'symptoms'],
  requiredMissing: ['asset_tag'],
  articlesShown: [],
  restricted: false,
};
