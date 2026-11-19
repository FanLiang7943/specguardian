import { findUserById } from "../db/users";
import { logger } from "../lib/logger";

export interface UserProfile {
  id: string;
  displayName: string;
}

export async function getUserProfile(id: string): Promise<UserProfile | undefined> {
  const user = await findUserById(id);
  if (!user) {
    logger.info("user not found", { id });
    return undefined;
  }
  return { id: user.id, displayName: user.name };
}
