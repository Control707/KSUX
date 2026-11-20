export interface OtpEmailMessage {
  to: string;
  code: string;
  expiresInMinutes: number;
}

export interface SmtpTransportClient {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void>;
}

export interface OtpDispatchEnv {
  nodeEnv?: string;
  allowDevOtpLog?: string;
  primaryUser?: string;
  primaryPass?: string;
  fallbackUser?: string;
  fallbackPass?: string;
}

export interface OtpDispatchDeps {
  createTransport: (user: string, pass: string) => SmtpTransportClient;
  devLogger?: (msg: string) => void;
}

export async function dispatchOtpEmailWithFallback(
  msg: OtpEmailMessage,
  env: OtpDispatchEnv,
  deps: OtpDispatchDeps
): Promise<{ channel: "primary_smtp" | "fallback_smtp" | "dev_console" }> {
  const subject = `${msg.code} is your OwlSide verification code`;
  const text = `Your OwlSide 6-digit verification code is ${msg.code}. It expires in ${msg.expiresInMinutes} minutes. Never share this code.`;
  const html = `<div style="font-family:system-ui,sans-serif;padding:20px;background:#111317;color:#fff;border-radius:12px;">
    <h2 style="color:#FDBB30;margin:0 0 12px;">🦉 OwlSide Verification Code</h2>
    <p style="font-size:14px;color:#E5E7EB;">Enter this 6-digit numeric code in OwlSide (expires in ${msg.expiresInMinutes} minutes):</p>
    <div style="font-size:32px;font-weight:900;letter-spacing:6px;color:#FDBB30;padding:12px 0;">${msg.code}</div>
    <p style="font-size:12px;color:#9CA3AF;">Sent without clickable links so KSU Safe Links never invalidates your code.</p>
  </div>`;

  if (env.primaryUser && env.primaryPass) {
    try {
      const primary = deps.createTransport(env.primaryUser, env.primaryPass);
      await primary.sendMail({
        from: `"OwlSide Campus" <${env.primaryUser}>`,
        to: msg.to,
        subject,
        text,
        html,
      });
      return { channel: "primary_smtp" };
    } catch (primaryErr) {
      if (env.fallbackUser && env.fallbackPass) {
        const fallback = deps.createTransport(
          env.fallbackUser,
          env.fallbackPass
        );
        await fallback.sendMail({
          from: `"OwlSide Campus" <${env.fallbackUser}>`,
          to: msg.to,
          subject,
          text,
          html,
        });
        return { channel: "fallback_smtp" };
      }
      throw primaryErr;
    }
  }

  const isProd = env.nodeEnv === "production";
  if (!isProd && env.allowDevOtpLog === "true") {
    const logFn = deps.devLogger ?? console.info;
    logFn(`[OwlSide DEV OTP] ${msg.to} -> ${msg.code}`);
    return { channel: "dev_console" };
  }

  throw new Error(
    isProd
      ? "SMTP credentials are required in production; dev console OTP logging is forbidden."
      : "GMAIL_SMTP_USER/GMAIL_SMTP_APP_PASSWORD unset and OWLSIDE_ALLOW_DEV_OTP_LOG is not enabled."
  );
}
