/**
 * Test script to verify SendGrid email delivery.
 *
 * Usage:
 *   npx tsx scripts/test-email.ts recipient@example.com
 *   npm run test:email -- recipient@example.com
 */

import "dotenv/config";
import sgMail from "@sendgrid/mail";

const recipient = process.argv[2];

if (!recipient) {
  console.error("Usage: npx tsx scripts/test-email.ts <recipient-email>");
  console.error("Example: npx tsx scripts/test-email.ts you@example.com");
  process.exit(1);
}

const apiKey = process.env.SENDGRID_API_KEY;
if (!apiKey) {
  console.error("Error: SENDGRID_API_KEY is not set in your .env file.");
  console.error("See docs/sendgrid-setup.md for configuration instructions.");
  process.exit(1);
}

const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "noreply@example.com";
const fromName = process.env.EMAIL_FROM_NAME ?? "Marketing Agent";

sgMail.setApiKey(apiKey);

console.log(`\nSending test email to: ${recipient}`);
console.log(`From: ${fromName} <${fromAddress}>\n`);

try {
  const [response] = await sgMail.send({
    to: recipient,
    from: { email: fromAddress, name: fromName },
    subject: "Marketing Agent — Test Email",
    text: [
      "This is a test email from the Marketing Agent platform.",
      "",
      "If you received this, your SendGrid configuration is working correctly.",
      "",
      `Sent at: ${new Date().toISOString()}`,
      `From: ${fromName} <${fromAddress}>`,
    ].join("\n"),
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Marketing Agent — Test Email</h2>
        <p>This is a test email from the Marketing Agent platform.</p>
        <p style="color: green; font-weight: bold;">
          If you received this, your SendGrid configuration is working correctly.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">
          Sent at: ${new Date().toISOString()}<br>
          From: ${fromName} &lt;${fromAddress}&gt;
        </p>
      </div>
    `,
  });

  const messageId =
    response.headers?.["x-message-id"] ?? `unknown-${Date.now()}`;

  console.log("Email sent successfully!");
  console.log(`Message ID: ${messageId}`);
  console.log(`Status code: ${response.statusCode}`);
  console.log("\nCheck your inbox (and spam folder) for the test email.");
  console.log(
    "You can also verify delivery in SendGrid: Activity → search by email."
  );
} catch (error: unknown) {
  console.error("Failed to send test email.\n");

  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    (error as { response?: { body?: unknown } }).response
  ) {
    const sgError = error as { response: { body: unknown; statusCode: number } };
    console.error(`Status: ${sgError.response.statusCode}`);
    console.error("Response:", JSON.stringify(sgError.response.body, null, 2));
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(error);
  }

  console.error("\nSee docs/sendgrid-setup.md for troubleshooting.");
  process.exit(1);
}
