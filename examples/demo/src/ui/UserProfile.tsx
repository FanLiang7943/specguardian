import { getUserProfile, type UserProfile as Profile } from "../services/userService";

export async function renderUserProfile(id: string): Promise<string> {
  const profile: Profile | undefined = await getUserProfile(id);
  return profile ? `<h1>${profile.displayName}</h1>` : "<p>User not found</p>";
}
