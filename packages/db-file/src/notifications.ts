import { getSupabaseServiceClient } from './client';

export async function createNotification(params: {
  recipientId: string;
  actorId: string;
  type: string;
  targetType?: string;
  targetId?: string;
}): Promise<void> {
  const db = getSupabaseServiceClient();
  await db.from('notifications').insert({
    recipient_id: params.recipientId,
    actor_id: params.actorId,
    type: params.type,
    target_type: params.targetType || null,
    target_id: params.targetId || null,
    read: false,
  });
}
