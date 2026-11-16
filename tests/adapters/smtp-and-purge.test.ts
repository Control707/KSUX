import { describe, expect, it, vi } from "vitest";
import { dispatchOtpEmailWithFallback } from "../../convex/lib/smtpAdapter";

describe("Seam 2 — Gmail App-Password SMTP & Dev OTP Console Fallback (#15)", () => {
  it("dispatches 6-digit OTP via primary Gmail SMTP without magic links", async () => {
    const sent: any[] = [];
    const res = await dispatchOtpEmailWithFallback(
      {
        to: "maya.patel@students.kennesaw.edu",
        code: "482910",
        expiresInMinutes: 10,
      },
      {
        nodeEnv: "production",
        primaryUser: "ksux.mailer@gmail.com",
        primaryPass: "abcd efgh ijkl mnop",
      },
      {
        createTransport: () => ({
          sendMail: async (payload) => {
            sent.push(payload);
          },
        }),
      }
    );

    expect(res.channel).toBe("primary_smtp");
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("482910");
    // Ensure zero clickable https:// magic links exist in email body so Safe Links cannot pre-fetch
    expect(sent[0].html).not.toMatch(/https?:\/\//i);
  });

  it("fails over cleanly to secondary Gmail relay when primary hits daily quota", async () => {
    const usedUsers: string[] = [];
    const res = await dispatchOtpEmailWithFallback(
      {
        to: "jordan@students.kennesaw.edu",
        code: "193847",
        expiresInMinutes: 10,
      },
      {
        nodeEnv: "production",
        primaryUser: "primary@gmail.com",
        primaryPass: "pass1",
        fallbackUser: "fallback@gmail.com",
        fallbackPass: "pass2",
      },
      {
        createTransport: (user) => ({
          sendMail: async () => {
            usedUsers.push(user);
            if (user === "primary@gmail.com") {
              throw new Error("550 5.4.5 Daily user sending quota exceeded");
            }
          },
        }),
      }
    );

    expect(res.channel).toBe("fallback_smtp");
    expect(usedUsers).toEqual(["primary@gmail.com", "fallback@gmail.com"]);
  });

  it("permits dev console OTP logging ONLY outside production when KSUX_ALLOW_DEV_OTP_LOG=true", async () => {
    const logger = vi.fn();
    const devRes = await dispatchOtpEmailWithFallback(
      {
        to: "alex@students.kennesaw.edu",
        code: "774411",
        expiresInMinutes: 10,
      },
      {
        nodeEnv: "development",
        allowDevOtpLog: "true",
      },
      {
        createTransport: () => ({ sendMail: async () => {} }),
        devLogger: logger,
      }
    );
    expect(devRes.channel).toBe("dev_console");
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("774411")
    );

    // Must hard-reject in production even if KSUX_ALLOW_DEV_OTP_LOG=true!
    await expect(
      dispatchOtpEmailWithFallback(
        {
          to: "alex@students.kennesaw.edu",
          code: "774411",
          expiresInMinutes: 10,
        },
        {
          nodeEnv: "production",
          allowDevOtpLog: "true",
        },
        {
          createTransport: () => ({ sendMail: async () => {} }),
          devLogger: logger,
        }
      )
    ).rejects.toThrowError(/forbidden/);
  });
});
