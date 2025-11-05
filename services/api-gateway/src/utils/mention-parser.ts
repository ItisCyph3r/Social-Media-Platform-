/**
 * Utility functions for parsing and validating @mentions in comments
 */

/**
 * Extract @mentions from text content
 * Returns array of unique usernames (without @ symbol)
 */
export function extractMentions(content: string): string[] {
  // Match @username patterns (alphanumeric, underscore, hyphen)
  // Negative lookbehind to avoid matching @ in the middle of words
  const mentionRegex = /@(\w+)/g;
  const matches = content.matchAll(mentionRegex);
  const mentions = new Set<string>();
  
  for (const match of matches) {
    const username = match[1];
    // Filter out empty strings and very long usernames (likely invalid)
    if (username && username.length > 0 && username.length <= 50) {
      mentions.add(username.toLowerCase());
    }
  }
  
  return Array.from(mentions);
}

/**
 * Validate and convert usernames to user IDs
 * Returns array of user IDs for valid usernames
 */
export async function validateMentions(
  usernames: string[],
  userClient: any,
): Promise<string[]> {
  if (usernames.length === 0) {
    return [];
  }

  // Batch lookup users by username
  // Note: This assumes we have a searchUsers method that can handle username lookup
  // For now, we'll need to search for each username individually
  // In a production system, you'd want a batch lookup method
  const userIds: string[] = [];
  
  for (const username of usernames) {
    try {
      // Search for the user by username
      const searchResult = await userClient.searchUsers(username, '', 1, 1);
      const user = searchResult.users.find(
        (u: any) => u.username.toLowerCase() === username.toLowerCase(),
      );
      
      if (user) {
        userIds.push(user.userId);
      }
    } catch (error) {
      // Silently skip invalid usernames
      console.error(`Failed to validate mention: ${username}`, error);
    }
  }
  
  return userIds;
}

