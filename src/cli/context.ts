import type { Profile } from '../profile/types.js';

export interface CommandContext {
  command: string;
  args: string[];
  profile: Profile;
  pageId?: string;
}

export const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
