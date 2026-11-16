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

const DEMO_CODE_SESSION_KEY = "ksux_demo_short_code";
const DEMO_PERSONA_SESSION_KEY = "ksux_demo_persona";
export const COMMUTER_CACHE_STORAGE_KEY = "ksux_commuter_cache";

export type ActiveAuthState =
  | { status: "booting" }
  | { status: "unauthenticated" }
  | {
      status: "demo";
      demoShortCode: string;
      demoPersonaHandle: string;
    }
  | {
      status: "student";
      sessionToken: string;
    };

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
  establishStudentSession: (sessionToken: string) => Promise<void>;
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

export function clearCommuterCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COMMUTER_CACHE_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
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
        if (!navigator.onLine) {
          setAuth({
            status: "demo",
            demoShortCode: tabDemoCode,
            demoPersonaHandle: tabDemoPersona,
          });
          return;
        }
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
          const data = (await resp.json()) as {
            authenticated?: boolean;
            sessionToken?: string;
          };
          if (data.authenticated && data.sessionToken) {
            setAuth({
              status: "student",
              sessionToken: data.sessionToken,
            });
            return;
          }
        }
      } catch {
        // If offline and commuter cache exists, surface unauthenticated/offline shell
      }

      setAuth({ status: "unauthenticated" });
    };

    void boot();
  }, [enterJudgeDemo]);

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
    clearCommuterCache();
    await resetDemoMutation({
      demoShortCode: auth.demoShortCode,
      demoPersonaHandle: auth.demoPersonaHandle,
    });
  }, [auth, resetDemoMutation]);

  const exitDemoToSignIn = useCallback(() => {
    clearCommuterCache();
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

  const establishStudentSession = useCallback(async (sessionToken: string) => {
    clearCommuterCache();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
      window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      url.searchParams.delete("persona");
      window.history.replaceState({}, "", url.pathname);
    }
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ sessionToken }),
    });
    setAuth({ status: "student", sessionToken });
    setOpenSignInModal(false);
  }, []);

  const signOut = useCallback(async () => {
    clearCommuterCache();
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(DEMO_CODE_SESSION_KEY);
      window.sessionStorage.removeItem(DEMO_PERSONA_SESSION_KEY);
      const url = new URL(window.location.href);
      url.searchParams.delete("demo");
      url.searchParams.delete("persona");
      window.history.replaceState({}, "", "/");
    }
    await fetch("/api/auth/session", {
      method: "DELETE",
      credentials: "same-origin",
    }).catch(() => {});
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
