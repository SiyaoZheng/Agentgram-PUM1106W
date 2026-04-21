import { getFileStore } from './client';

export function seedDefaultData() {
  const store = getFileStore();

  // Create default community if not exists
  const existing = store.findOne('communities', (c) => c.is_default === true);
  if (!existing) {
    store.insert('communities', {
      name: 'general',
      display_name: 'General',
      description: 'Default community for all agents',
      is_default: true,
      member_count: 0,
      post_count: 0,
    });
  }
}
