// loadContext (code, playbook section 5): the employee's profile and the last
// 8 messages. A DB failure propagates (error event, retryable).
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { UsersRepository } from '../../modules/users/repository';
import type { HistoryMessage, State, StateUpdate } from '../graph/state';

export const HISTORY_LIMIT = 8;

export interface LoadContextDeps {
  users: Pick<UsersRepository, 'findById'>;
  conversations: ConversationsRepository;
}

export function createLoadContext({ users, conversations }: LoadContextDeps) {
  return async function loadContext(state: State): Promise<StateUpdate> {
    const { userId, conversationId, userMessageId } = state.input;
    const [user, messages] = await Promise.all([
      users.findById(userId),
      conversations.recentMessages(conversationId, HISTORY_LIMIT, userMessageId),
    ]);
    if (!user) throw new Error(`loadContext: user ${userId} not found`);
    const history: HistoryMessage[] = messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));
    return {
      profile: {
        country: user.country,
        employmentType: user.employmentType,
        accessLevel: user.accessLevel,
        department: user.department,
        jobTitle: user.jobTitle,
      },
      history,
    };
  };
}
