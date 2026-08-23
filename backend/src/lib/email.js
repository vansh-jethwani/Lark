import { Resend } from "resend";

export async function sendEmailVerificationCode(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error("Resend email configuration is missing");
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Verify your Lark email",
    text: `Your Lark verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your Lark verification code is <strong>${code}</strong>.</p><p>This code expires in 5 minutes.</p>`,
  });

  if (error) {
    const deliveryError = new Error("Resend rejected the verification email");
    deliveryError.statusCode = error.statusCode;
    throw deliveryError;
  }
}