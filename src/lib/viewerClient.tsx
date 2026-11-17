"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { compressImageToExifStrippedWebP } from "./imageCompression";
import { Id } from "@convex/_generated/dataModel";
import {
  clearCommuterCache,
  readCachedStudentScope,
  type CommuterScope,
} from "./commuterCache";

const DEMO_CODE_SESSION_KEY = "ksux_demo_short_code";
const DEMO_PERSONA_SESSION_KEY = "ksux_demo_persona";
export type ActiveAuthState =
  | { status: "booting" }
  | { status: "unauthenticated" }
  | { status: "offline"; scope: CommuterScope }
  | {
      status: "demo";
      demoShortCode: string;
      demoPersonaHandle: string;
    }
  | {
      status: "student";
      sessionToken: string;
      browserExpiresAt: number;
      studentId?: string;
      sessionExpiresAt?: number;
    };

function readStudentSession(response: {
  authenticated?: boolean;
  browserCredential?: string;
  expiresAt?: number;
  sessionExpiresAt?: number;
  student?: { _id?: string };
} | null): Extract<ActiveAuthState, { status: "student" }> | null {
  if (!response?.authenticated || !response.browserCredential || !response.expiresAt ||
      !response.sessionExpiresAt || !response.student?._id) return null;
  return {
    status: "student",
    sessionToken: response.browserCredential,
    browserExpiresAt: response.expiresAt,
    studentId: response.student._id,
    sessionExpiresAt: response.sessionExpiresAt,
  };
}

interface ViewerClientContextValue {
  auth: ActiveAuthState;
  authArgs: {
    sessionToken?: string;
    demoShortCode?: string;
    demoPersonaHandle?: string;
  } | null;
  enterJudgeDemo: (opts?: {
    shortCode?: string;
    persona?: string;
  }) => Promise<void>;
  switchDemoPersona: (personaHandle: string) => void;
  resetDemoState: () => Promise<void>;
  exitDemoToSignIn: () => void;
  establishStudentSession: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  uploadImage: (
    file: File,
    purpose: "avatar" | "post" | "listing" | "chat"
  ) => Promise<{
    mediaAssetId: Id<"mediaAssets">;
    url: string;
    width: number;
    height: number;
  }>;
  quickComposerKind:
    | null
    | "post"
    | "parking_report"
    | "listing"
    | "study_session";
  setQuickComposerKind: (
    kind: null | "post" | "parking_report" | "listing" | "study_session"
  ) => void;
  pendingDraftCard: {
    draftKind: "post" | "listing" | "parking_report" | "study_session";
    title: string;
    summary: string;
    payloadJson: string;
  } | null;
  setPendingDraftCard: (
    draft: {
      draftKind: "post" | "listing" | "parking_report" | "study_session";
      title: string;
      summary: string;
      payloadJson: string;
    } | null
  ) => void;
  openSignInModal: boolean;
  setOpenSignInModal: (open: boolean) => void;
}

const ViewerClientContext = createContext<ViewerClientContextValue | null>(
  null
);

let singletonConvexClient: ConvexReactClient | null = null;
function getConvexClient(): ConvexReactClient {
  if (!singletonConvexClient) {
    const url =
      process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
    singletonConvexClient = new ConvexReactClient(url);
  }
  return singletonConvexClient;
}

export function getCommuterScope(auth: ActiveAuthState): CommuterScope | null {
  if (auth.status === "offline") return auth.scope;
  if (auth.status === "demo") {
    return { mode: "demo", shortCode: auth.demoShortCode, persona: auth.demoPersonaHandle };
  }
  if (auth.status === "student" && auth.studentId && auth.sessionExpiresAt) {
    return { mode: "student", studentId: auth.studentId, expiresAt: auth.sessionExpiresAt };
  }
  return null;
}

function ViewerClientInner({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<ActiveAuthState>({ status: "booting" });
  const [quickComposerKind, setQuickComposerKind] = useState<
    null | "post" | "parking_report" | "listing" | "study_session"
  >(null);
  const [pendingDraftCard, setPendingDraftCard] = useState<{
    draftKind: "post" | "listing" | "parking_report" | "study_session";
    title: string;
    summary: string;
    payloadJson: string;
  } | null>(null);
  const [openSignInModal, setOpenSignInModal] = useState(false);

  const provisionDemoMutation = useMutation(
    api.demo.session.provisionOrAttachDemoSession
  );
  const resetDemoMutation = useMutation(api.demo.session.resetDemoWorkspace);
  const bootStartedRef = useRef(false);

  const enterJudgeDemo = useCallback(
    async (opts?: { shortCode?: string; persona?: string }) => {
      const requestedCode =
        opts?.shortCode && opts.shortCode !== "1" && opts.shortCode !== "true"
          ? opts.shortCode.trim().toLowerCase()
          : undefined;
      const requestedPersona = opts?.persona
        ? opts.persona.trim().replace(/^@+/, "").toLowerCase()
        : undefined;

      const res = await provisionDemoMutation({
        shortCode: requestedCode,
        preferredPersona: requestedPersona,
      });

      if (typeof window !== "undefined") {
        // Strictly store activePersonaHandle in per-tab sessionStorage so 2-tab co-testing never collides!
        window.sessionStorage.setItem(DEMO_CODE_SESSION_KEY, res.shortCode);
        window.sessionStorage.setItem(
          DEMO_PERSONA_SESSION_KEY,
          res.personaHandle
        );

        const url = new URL(window.location.href);
        url.searchParams.set("demo", res.shortCode);
        if (requestedPersona) {
          url.searchParams.set("persona", res.personaHandle);
        }
        window.history.replaceState({}, "", url.toString());
      }

      setAuth({
        status: "demo",
        demoShortCode: res.shortCode,
        demoPersonaHandle: res.personaHandle,
      });
    },
    [provisionDemoMutation]
  );

  useEffect(() => {
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;

    const boot = async () => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const demoParam = params.get("demo")?.trim();
      const personaParam = params.get("persona")?.trim();

      if (!navigator.onLine) {
        const shortCode = window.sessionStorage.getItem(DEMO_CODE_SESSION_KEY);
        const persona = window.sessionStorage.getItem(DEMO_PERSONA_SESSION_KEY);
        const sameDemo = !demoParam || ["1", "true", shortCode].includes(demoParam);
        if (shortCode && persona && sameDemo && (!personaParam || personaParam === persona)) {
          setAuth({ status: "offline", scope: { mode: "demo", shortCode, persona } });
          return;
        }
        const scope = !demoParam && readCachedStudentScope();
        setAuth(scope ? { status: "offline", scope } : { status: "unauthenticated" });
        return;
      }

      // 1. Direct URL ?demo=1 or ?demo=<shortCode>&persona=... zero-click boot
      if (demoParam) {
        const storedTabPersona = window.sessionStorage.getItem(
          DEMO_PERSONA_SESSION_KEY
        );
        const existingTabCode = window.sessionStorage.getItem(
          DEMO_CODE_SESSION_KEY
        );
        const shortCodeToUse =
          demoParam === "1" || demoParam === "true"
            ? existingTabCode || undefined
            : demoParam;
        try {
          await enterJudgeDemo({
            shortCode: shortCodeToUse,
            persona: personaParam || storedTabPersona || "maya_cs",
          });
          return;
        } catch {
          // Fall through if offline — try cached demo state
        }
      }

      // 2. Resume active per-tab Judge Demo Mode session if present in this tab's sessionStorage
      const tabDemoCode = window.sessionStorage.getItem(DEMO_CODE_SESSION_KEY);
      const tabDemoPersona =
        window.sessionStorage.getItem(DEMO_PERSONA_SESSION_KEY) || "maya_cs";
      if (tabDemoCode) {
        try {
          await enterJudgeDemo({
            shortCode: tabDemoCode,
            persona: tabDemoPersona,
          });
          return;
        } catch {
          window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
          window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
        }
      }

      // 3. Check HttpOnly .edu Student session cookie via /api/auth/session
      try {
        const resp = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
        });
        if (resp.ok) {
          const session = readStudentSession(await resp.json());
          if (session) {
            setAuth(session);
            return;
          }
        }
      } catch {
        const scope = !demoParam && readCachedStudentScope();
        if (scope) {
          setAuth({ status: "offline", scope });
          return;
        }
      }

      clearCommuterCache("student");
      setAuth({ status: "unauthenticated" });
    };

    void boot();
  }, [enterJudgeDemo]);

  useEffect(() => {
    if (auth.status !== "offline") return;
    const reconnect = () => window.location.reload();
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [auth.status]);

  useEffect(() => {
    if (auth.status !== "student") return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8_000),
        });
        if (canceled) return;
        if (response.status === 401) {
          clearCommuterCache("student");
          setAuth({ status: "unauthenticated" });
          return;
        }
        if (response.ok) {
          const session = readStudentSession(await response.json());
          if (canceled) return;
          if (session) {
            setAuth(session);
            return;
          }
        }
      } catch {
        // Keep retrying transient backend failures without treating them as revocation.
      }
      if (!canceled) timer = setTimeout(() => void refresh(), 30_000);
    };
    timer = setTimeout(() => void refresh(), Math.max(0, auth.browserExpiresAt - Date.now() - 60_000));
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [auth]);

  const switchDemoPersona = useCallback((personaHandle: string) => {
    const clean = personaHandle.trim().replace(/^@+/, "").toLowerCase();
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DEMO_PERSONA_SESSION_KEY, clean);
      const url = new URL(window.location.href);
      if (url.searchParams.has("persona")) {
        url.searchParams.set("persona", clean);
        window.history.replaceState({}, "", url.toString());
      }
    }
    setAuth((prev) =>
      prev.status === "demo"
        ? { ...prev, demoPersonaHandle: clean }
        : prev
    );
  }, []);

  const resetDemoState = useCallback(async () => {
    if (auth.status !== "demo") return;
    clearCommuterCache("demo");
    await resetDemoMutation({
      demoShortCode: auth.demoShortCode,
      demoPersonaHandle: auth.demoPersonaHandle,
    });
  }, [auth, resetDemoMutation]);

  const exitDemoToSignIn = useCallback(() => {
    clearCommuterCache("demo");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
      window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      url.searchParams.delete("persona");
      window.history.replaceState({}, "", url.pathname);
    }
    setAuth({ status: "unauthenticated" });
    setOpenSignInModal(true);
  }, []);

  const establishStudentSession = useCallback(async (email: string, code: string) => {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ operation: "verify", email, code }),
    });
    const result = await response.json().catch(() => null);
    const session = response.ok ? readStudentSession(result) : null;
    if (!session) throw new Error(result?.message ?? result?.error ?? "Verification failed.");

    clearCommuterCache();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
      window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      url.searchParams.delete("persona");
      window.history.replaceState({}, "", url.pathname);
    }
    setAuth(session);
    setOpenSignInModal(false);
  }, []);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not revoke this session. Try signing out again.");
    clearCommuterCache();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
      window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      url.searchParams.delete("persona");
      window.history.replaceState({}, "", "/");
    }
    setAuth({ status: "unauthenticated" });
  }, []);

  const uploadImage = useCallback(
    async (
      file: File,
      purpose: "avatar" | "post" | "listing" | "chat"
    ): Promise<{
      mediaAssetId: Id<"mediaAssets">;
      url: string;
      width: number;
      height: number;
    }> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error(
          "Offline: uploads are disabled until network connectivity returns."
        );
      }
      if (auth.status !== "student" && auth.status !== "demo") {
        throw new Error("Sign in or enter Judge Demo Mode before uploading.");
      }
      const compressed = await compressImageToExifStrippedWebP(file);
      const formData = new FormData();
      formData.set("file", compressed.file);
      formData.set("purpose", purpose);
      formData.set("width", String(compressed.width));
      formData.set("height", String(compressed.height));

      const headers: Record<string, string> = {};
      if (auth.status === "demo") {
        headers["x-ksux-demo-session"] = auth.demoShortCode;
        headers["x-ksux-demo-persona"] = auth.demoPersonaHandle;
      }

      const resp = await fetch("/api/uploadthing", {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: formData,
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || "Image upload failed.");
      }
      return {
        mediaAssetId: data.mediaAssetId as Id<"mediaAssets">,
        url: String(data.url),
        width: Number(data.width),
        height: Number(data.height),
      };
    },
    [auth]
  );

  const authArgs = useMemo(() => {
    if (auth.status === "student") {
      return { sessionToken: auth.sessionToken };
    }
    if (auth.status === "demo") {
      return {
        demoShortCode: auth.demoShortCode,
        demoPersonaHandle: auth.demoPersonaHandle,
      };
    }
    return null;
  }, [auth]);

  const value = useMemo<ViewerClientContextValue>(
    () => ({
      auth,
      authArgs,
      enterJudgeDemo,
      switchDemoPersona,
      resetDemoState,
      exitDemoToSignIn,
      establishStudentSession,
      signOut,
      uploadImage,
      quickComposerKind,
      setQuickComposerKind,
      pendingDraftCard,
      setPendingDraftCard,
      openSignInModal,
      setOpenSignInModal,
    }),
    [
      auth,
      authArgs,
      enterJudgeDemo,
      switchDemoPersona,
      resetDemoState,
      exitDemoToSignIn,
      establishStudentSession,
      signOut,
      uploadImage,
      quickComposerKind,
      pendingDraftCard,
      openSignInModal,
    ]
  );

  return (
    <ViewerClientContext.Provider value={value}>
      {children}
    </ViewerClientContext.Provider>
  );
}

export function ViewerClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(() => getConvexClient(), []);
  return (
    <ConvexProvider client={client}>
      <ViewerClientInner>{children}</ViewerClientInner>
    </ConvexProvider>
  );
}

export function useViewerClient(): ViewerClientContextValue {
  const ctx = useContext(ViewerClientContext);
  if (!ctx) {
    throw new Error("useViewerClient must be used inside ViewerClientProvider");
  }
  return ctx;
}

type StripAuthArgs<T> = Omit<
  T,
  "sessionToken" | "demoShortCode" | "demoPersonaHandle"
>;

export function useViewerQuery<
  Query extends FunctionReference<"query", "public", any, any>,
>(
  queryRef: Query,
  args: StripAuthArgs<FunctionArgs<Query>> | "skip"
): FunctionReturnType<Query> | undefined {
  const { authArgs } = useViewerClient();
  const merged =
    args === "skip" || !authArgs
      ? ("skip" as const)
      : ({ ...args, ...authArgs } as FunctionArgs<Query>);
  return useQuery(queryRef, merged);
}

export function useViewerMutation<
  Mutation extends FunctionReference<"mutation", "public", any, any>,
>(mutationRef: Mutation) {
  const { authArgs } = useViewerClient();
  const rawMutate = useMutation(mutationRef);

  return useCallback(
    async (
      args: StripAuthArgs<FunctionArgs<Mutation>>
    ): Promise<FunctionReturnType<Mutation>> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error(
          "Offline: writes are paused while offline (showing saved read-only commuter cache)."
        );
      }
      if (!authArgs) {
        throw new Error(
          "Sign in with KSU .edu email or enter Judge Demo Mode."
        );
      }
      return rawMutate({ ...args, ...authArgs } as FunctionArgs<Mutation>);
    },
    [authArgs, rawMutate]
  );
}
