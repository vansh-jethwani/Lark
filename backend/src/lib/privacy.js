// Profile-photo privacy enforcement. privacy.profilePhoto === "nobody" hides
// the photo from everyone; anything else shows it. Apply to any user object
// before it leaves the server (search results, group members, call identity,
// push payloads) so the toggle is honored in exactly one place.
//
// The query feeding this MUST select the `privacy` field (Mongoose excludes
// it by default if you project specific fields without it).
export function applyPhotoPrivacy(user) {
  if (!user) return user;
  // Accept Mongoose documents as well as plain objects.
  const plain = typeof user.toObject === "function" ? user.toObject() : user;
  if (plain?.privacy?.profilePhoto === "nobody") {
    return { ...plain, profilePic: "" };
  }
  return plain;
}

export function applyPhotoPrivacyToList(users) {
  return (users || []).map(applyPhotoPrivacy);
}
