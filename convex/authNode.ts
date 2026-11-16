"use node";

import nodemailer from "nodemailer";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { dispatchOtpEmailWithFallback } from "./lib/smtpAdapter";

export const sendOtpEmailAction = internalAction({
  args: {
    canonicalEmail: v.string(),
    code: v.string(),
  },
  handler: async (_ctx, args) => {
    return dispatchOtpEmailWithFallback(
      {
        to: args.canonicalEmail,
        code: args.code,
        expiresInMinutes: 10,
      },
      {
        nodeEnv: process.env.NODE_ENV,
        allowDevOtpLog: process.env.KSUX_ALLOW_DEV_OTP_LOG ?? "true",
        primaryUser: process.env.GMAIL_SMTP_USER,
        primaryPass: process.env.GMAIL_SMTP_APP_PASSWORD,
        fallbackUser: process.env.GMAIL_SMTP_FALLBACK_USER,
        fallbackPass: process.env.GMAIL_SMTP_FALLBACK_APP_PASSWORD,
      },
      {
        createTransport: (user, pass) => {
          const transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: { user, pass },
          });
          return {
            sendMail: async (opts) => {
              await transporter.sendMail(opts);
            },
          };
        },
      }
    );
  },
});
