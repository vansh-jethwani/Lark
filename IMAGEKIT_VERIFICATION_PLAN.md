# ImageKit Private Media Implementation - Verification Plan

## Test Scenarios

### 1. Image Thumbnail Loading (Critical)
**Requirement:** Image thumbnails must display directly in chat without user clicking "open"

**Test Steps:**
1. Send an image message from User A to User B
2. Message stored in MongoDB with filePath (e.g., `/chat/...`)
3. Frontend displays thumbnail using `message.imageThumbnailUrl`
4. Open image preview modal using `message.imageOriginalUrl`

**Expected Result:**
- ✅ Thumbnail loads in chat bubble with correct dimensions (320x320)
- ✅ Full image loads in preview modal with correct dimensions (1920px wide max)
- ✅ All URLs are short-lived signed ImageKit URLs (5-minute expiration)

**Code Path Verification:**
```
Backend: Message stored with image: "/chat/..."
Frontend receives: {
  image: "signed-url-640w",
  imageThumbnail: "signed-url-320x320",
  imageOriginal: "signed-url-full"
}
Frontend renders: <img src={imageThumbnailSrc} /> → uses signed thumbnail URL
```

---

### 2. Video Playback with Thumbnail
**Requirement:** Videos must show thumbnail in chat and play when opened

**Test Steps:**
1. Send a video message
2. Verify thumbnail displays in chat
3. Click to open preview modal
4. Video should play with controls

**Expected Result:**
- ✅ Video thumbnail displays in chat
- ✅ Video loads and plays in preview modal
- ✅ All URLs are signed with 5-minute expiration

**Code Path Verification:**
```
Backend generates:
- message.video: signed-url (for playback)
- message.videoThumbnail: signed-url for /ik-thumbnail.jpg (extracted thumbnail)
```

---

### 3. Audio Playback
**Requirement:** Audio messages must play with correct URL

**Test Steps:**
1. Send an audio message
2. Click play button
3. Audio should stream from signed URL

**Expected Result:**
- ✅ Audio plays without buffering issues
- ✅ URL is signed and expires after 5 minutes

---

### 4. Document/PDF Preview
**Requirement:** PDF/document files must be accessible

**Test Steps:**
1. Send a PDF file
2. Click to download/open
3. File should open/download

**Expected Result:**
- ✅ File link is a signed URL
- ✅ User can open or download the file

---

### 5. Authorization - Logged-Out User (Security Test)
**Requirement:** Logged-out users cannot access media files

**Test Steps:**
1. Obtain a signed URL from a message (e.g., from browser console)
2. Wait for URL to expire (5 minutes)
3. Try to access the file with the URL while logged out

**Expected Result:**
- ✅ URL is invalid/expired after 5 minutes
- ✅ Logged-out user cannot access private ImageKit file

---

### 6. Authorization - Unauthorized User (Security Test)
**Requirement:** Users not in conversation cannot get signed URLs

**Test Steps:**
1. User A and User B have a conversation with image
2. User C tries to call `/messages/media/{messageId}/image` endpoint
3. API should reject request

**Expected Result:**
- ✅ API returns 403 Forbidden
- ✅ User C cannot obtain signed URL for User A & B's private messages

**Code Path Verification:**
```
Backend endpoint getFreshMediaUrl():
1. Finds message by ID
2. Checks isMessageParticipant(message, req.userId)
3. Returns 403 if not authorized
4. Only then calls presentMessageMedia(message) which generates signed URL
```

---

### 7. URL Refresh on Expiration (Frontend Resilience)
**Requirement:** Frontend must handle expired URLs gracefully

**Test Steps:**
1. Load chat with images
2. Wait 5+ minutes
3. Try to view image thumbnail (or simulate error in browser)

**Expected Result:**
- ✅ Frontend catches error on image load
- ✅ Frontend calls `/messages/media/{messageId}/image` to refresh URL
- ✅ Frontend retries with new signed URL
- ✅ Image loads successfully

**Code Path Verification:**
```
Frontend MessageBubble.jsx:
<img
  src={imageThumbnailSrc}
  onError={async () => {
    const fresh = await refreshMessageMedia(message.id, "image");
    setImageThumbnailSrc(fresh.thumbnailUrl);
  }}
/>
```

---

### 8. Group Chat Media
**Requirement:** Media in group chats must work the same way

**Test Steps:**
1. Create a group with User A, B, C
2. User A sends an image to group
3. User B and C see thumbnail and can open preview
4. User D (not in group) cannot access the image

**Expected Result:**
- ✅ All group members see thumbnails and can open
- ✅ Non-members get 403 Forbidden on media endpoint

**Code Path Verification:**
```
isMessageParticipant() for group messages:
if (message.groupId) {
  return Boolean(await Group.exists({ 
    _id: message.groupId, 
    members: userId 
  }));
}
```

---

### 9. Existing Messages Compatibility
**Requirement:** Existing messages with old media URLs must continue working

**Test Steps:**
1. Database has messages with old media fields (if any)
2. Reload chat
3. Media should display correctly

**Expected Result:**
- ✅ Migration is not needed (code handles both scenarios)
- ✅ Old messages display correctly with new signed URLs

---

## Implementation Summary

### Backend Changes
✅ **media.js**: Fixed thumbnail URL generation
- Preserves original image path before generating signed URLs
- Generates separate signed URLs for original, display (640w), and thumbnail (320x320)
- Video handling: full video URL + separate thumbnail from `/ik-thumbnail.jpg`

### Authorization Flow
✅ All endpoints require authentication (`protectRoute` middleware)
✅ `getFreshMediaUrl` verifies user is message participant
✅ `getMessages` only returns user's own messages
✅ `getSharedMedia` only returns messages between specific user pair

### URL Generation
✅ Short-lived signed URLs (5-minute expiration)
✅ Transformations applied at generation time:
- IMAGE_DISPLAY: 640px wide, auto quality/format
- IMAGE_THUMBNAIL: 320x320, maintain ratio
- VIDEO_THUMBNAIL: 640px wide quality

### Frontend Handling
✅ Receives separate URL fields for thumbnails and full resolution
✅ Uses thumbnail URLs in chat bubble display
✅ Uses original URLs in preview modal
✅ Handles expired URLs with automatic refresh

---

## Pass/Fail Criteria

All tests must pass:
- [ ] Test 1: Image thumbnail loading
- [ ] Test 2: Video playback with thumbnail
- [ ] Test 3: Audio playback
- [ ] Test 4: Document/PDF preview
- [ ] Test 5: Logged-out user cannot access (security)
- [ ] Test 6: Unauthorized user cannot get signed URL (security)
- [ ] Test 7: URL refresh on expiration works
- [ ] Test 8: Group chat media authorization
- [ ] Test 9: Existing messages compatibility

**Implementation is COMPLETE when all tests pass.**
