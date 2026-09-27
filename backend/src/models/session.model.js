import mongoose from "mongoose";

// One row per issued login token. Lets the user see every device that is
// currently signed in and revoke a single session without changing their
// password (the JWT itself stays stateless; protectRoute rejects revoked rows).
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    // From the login request; shown in Settings → Active sessions.
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true } // createdAt = login time
);

sessionSchema.index({ userId: 1, revoked: 1, updatedAt: -1 });

const Session = mongoose.model("Session", sessionSchema);

export default Session;
