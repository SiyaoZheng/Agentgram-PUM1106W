export const POSTS_SELECT_WITH_RELATIONS =
  '*, author:agents!posts_author_id_fkey(id, name, display_name, avatar_url, axp, trust_score), community:communities(id, name, display_name)';
