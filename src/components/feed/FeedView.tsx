"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bookmark,
  Edit3,
  Hash,
  Heart,
  ImagePlus,
  MessageCircle,
  Plus,
  Quote,
  Repeat2,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import {
  CampusEntityCard,
  CitationPill,
} from "@/components/shared/CampusEntityCard";
import { ReportTrigger } from "@/components/shared/ReportTrigger";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";

type Stream = "campus" | "following" | "trending";

/** The server keeps the "campus" arg; only the label is "All KSU" (SPEC-v2 §3). */
const STREAMS = [
  { value: "campus", label: "All KSU" },
  { value: "following", label: "Following" },
  { value: "trending", label: "Trending (24h)" },
] as const;

const primaryBtn =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-pill)] bg-[var(--ink)] px-[var(--sp-4)] text-sm font-bold text-[var(--bg)] disabled:opacity-60";
const secondaryBtn =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-4)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]";
const iconBtn =
  "inline-flex min-h-[var(--target)] min-w-[var(--target)] items-center justify-center gap-[var(--sp-1)] rounded-[var(--r-pill)] px-[var(--sp-2)] text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]";
const field =
  "w-full rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--sp-3)] text-body text-[var(--ink)]";
const muted = "text-sm text-[var(--muted)]";
const chipBase =
  "inline-flex min-h-[var(--target)] max-w-full items-center gap-[var(--sp-1)] rounded-[var(--r-pill)] border px-[var(--sp-3)] text-sm font-bold";

function chipClass(active: boolean) {
  return `${chipBase} ${
    active
      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]"
      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--ink)]"
  }`;
}

function errorMessage(err: any, fallback: string): string {
  return err?.data?.message || err?.message || fallback;
}

export function FeedView() {
  const searchParams = useSearchParams();
  const { toast } = useAnnouncer();
  const {
    uploadImage,
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();
  const composerId = useId();

  const [stream, setStream] = useState<Stream>("campus");
  const [selectedHubId, setSelectedHubId] = useState<Id<"courseHubs"> | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<Id<"clubs"> | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  // `/feed?post=<id>` opens that thread (saved items, search). getPostThread re-checks access.
  const [activeThreadPostId, setActiveThreadPostId] = useState<Id<"posts"> | null>(
    () => {
      const id = searchParams.get("post");
      return id && /^[a-z0-9]{16,64}$/.test(id) ? (id as Id<"posts">) : null;
    },
  );

  // Composer state
  const [composerOpen, setComposerOpen] = useState(searchParams.get("compose") === "1");
  const [body, setBody] = useState("");
  const [crossPostToCampus, setCrossPostToCampus] = useState(true);
  const [mediaItems, setMediaItems] = useState<
    Array<{ mediaAssetId: Id<"mediaAssets">; url: string }>
  >([]);
  const [selectedEmbedIdx, setSelectedEmbedIdx] = useState<string>("");
  const [quotedPost, setQuotedPost] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reply & edit state
  const [replyBody, setReplyBody] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<Id<"posts"> | null>(null);
  const [editingBody, setEditingBody] = useState("");

  useEffect(() => {
    if (quickComposerKind === "post") {
      setComposerOpen(true);
      setQuickComposerKind(null);
    }
  }, [quickComposerKind, setQuickComposerKind]);

  useEffect(() => {
    if (pendingDraftCard && pendingDraftCard.draftKind === "post") {
      try {
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as { body?: string };
        if (parsed.body) setBody(parsed.body);
      } catch {
        setBody(pendingDraftCard.summary);
      }
      setComposerOpen(true);
      setPendingDraftCard(null);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  // Course Hubs default to not cross-posting; Clubs and the main stream do.
  useEffect(() => {
    setCrossPostToCampus(!selectedHubId);
  }, [selectedHubId, selectedClubId]);

  const ringsAndTrends = useViewerQuery(api.feed.listFeedRingsAndTrends, {});
  const embedOptions = useViewerQuery(api.feed.listEmbeddableEntities, {});

  const usingFollowing = stream === "following" && !selectedHubId && !selectedClubId;

  const campusOrTrendingResult = useViewerQuery(
    api.feed.listCampusOrTrendingFeed,
    usingFollowing
      ? "skip"
      : {
          stream: stream === "trending" ? "trending" : "campus",
          courseHubId: selectedHubId ?? undefined,
          clubId: selectedClubId ?? undefined,
          tagFilter: tagFilter ?? undefined,
          paginationOpts: { numItems: 25, cursor: null },
        }
  );

  const followingResult = useViewerQuery(api.feed.listFollowingFeed, usingFollowing ? {} : "skip");

  const threadDetail = useViewerQuery(
    api.feed.getPostThread,
    activeThreadPostId ? { postId: activeThreadPostId } : "skip"
  );

  const createPost = useViewerMutation(api.feed.createPost);
  const editPost = useViewerMutation(api.feed.editPost);
  const deletePost = useViewerMutation(api.feed.deletePost);
  const toggleInteraction = useViewerMutation(api.feed.togglePostInteraction);
  const submitReport = useViewerMutation(api.moderation.submitReport);
  const retryScrappyMention = useViewerMutation(api.scrappy.mentions.retryFailedMention);

  const loading = usingFollowing ? followingResult === undefined : campusOrTrendingResult === undefined;
  const posts = usingFollowing ? (followingResult ?? []) : (campusOrTrendingResult?.page ?? []);

  const selectedHub = ringsAndTrends?.courseRings.find((h) => h._id === selectedHubId);
  const selectedClub = ringsAndTrends?.clubRings.find((c) => c._id === selectedClubId);
  const scopeLabel = selectedHub
    ? selectedHub.subjectCourse
    : selectedClub
      ? selectedClub.shortName
      : STREAMS.find((s) => s.value === stream)!.label;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || mediaItems.length >= 4) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "post");
      setMediaItems((prev) => [...prev, { mediaAssetId: uploaded.mediaAssetId, url: uploaded.url }]);
    } catch (err: any) {
      setError(errorMessage(err, "Image upload failed."));
    }
  };

  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const chosenEmbed =
        selectedEmbedIdx !== "" && embedOptions?.[Number(selectedEmbedIdx)]
          ? embedOptions[Number(selectedEmbedIdx)]
          : undefined;

      await createPost({
        body,
        courseHubId: selectedHubId ?? undefined,
        clubId: selectedClubId ?? undefined,
        crossPostToCampusFeed: crossPostToCampus,
        mediaAssetIds: mediaItems.map((m) => m.mediaAssetId),
        embed: chosenEmbed,
        quotedPostId: quotedPost?._id,
      });
      setBody("");
      setMediaItems([]);
      setSelectedEmbedIdx("");
      setQuotedPost(null);
      setComposerOpen(false);
      toast({ tone: "success", message: "Post published", detail: `Showing in ${scopeLabel}.`, testId: "post-published-toast" });
    } catch (err: any) {
      setError(errorMessage(err, "Could not publish Post."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadPostId || !replyBody.trim()) return;
    setSubmitting(true);
    setReplyError(null);
    try {
      await createPost({ body: replyBody, replyToPostId: activeThreadPostId });
      setReplyBody("");
      toast({ tone: "success", message: "Reply posted" });
    } catch (err: any) {
      setReplyError(errorMessage(err, "Reply failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = (action: () => Promise<unknown>, done: string, failed: string) => {
    void action()
      .then(() => toast({ tone: "success", message: done }))
      .catch((err: any) => toast({ tone: "error", message: failed, detail: errorMessage(err, "") || undefined }));
  };

  const clearRings = () => {
    setSelectedHubId(null);
    setSelectedClubId(null);
  };

  return (
    <div data-testid="campus-feed-view" className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <div className="flex flex-wrap items-end justify-between gap-[var(--sp-3)]">
        <div className="min-w-0">
          <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold leading-tight text-[var(--ink)]">
            Feed
          </h1>
          <p className={muted}>Posts from Students at Kennesaw and Marietta. Each Post shows its Campus.</p>
        </div>
        <button
          type="button"
          data-testid="open-post-composer-btn"
          aria-haspopup="dialog"
          onClick={() => setComposerOpen(true)}
          className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] bg-[var(--accent)] px-[var(--sp-4)] text-sm font-bold text-[var(--on-accent)]"
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
          New Post
        </button>
      </div>

      <SegmentedControl<Stream>
        label="Feed stream"
        options={STREAMS}
        value={selectedHubId || selectedClubId ? ("" as Stream) : stream}
        testIdPrefix="feed-stream"
        onChange={(next) => {
          clearRings();
          setStream(next);
        }}
      />

      {/* Course Hub and Club rings */}
      <nav aria-label="Your Course Hubs and Clubs" data-testid="feed-rings-strip">
        <ul className="flex flex-wrap items-center gap-[var(--sp-2)]">
          <li>
            <button type="button" aria-pressed={!selectedHubId && !selectedClubId} onClick={clearRings} className={chipClass(!selectedHubId && !selectedClubId)}>
              All Feed
            </button>
          </li>
          {(ringsAndTrends?.courseRings ?? []).map((hub) => {
            const active = selectedHubId === hub._id;
            return (
              <li key={String(hub._id)}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedClubId(null);
                    setSelectedHubId(active ? null : hub._id);
                  }}
                  className={chipClass(active)}
                >
                  <span className="sr-only">Course Hub </span>
                  {hub.subjectCourse}
                </button>
              </li>
            );
          })}
          {(ringsAndTrends?.clubRings ?? []).map((club) => {
            const active = selectedClubId === club._id;
            return (
              <li key={String(club._id)}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedHubId(null);
                    setSelectedClubId(active ? null : club._id);
                  }}
                  className={chipClass(active)}
                >
                  <span className="sr-only">Club </span>
                  {club.shortName}
                </button>
              </li>
            );
          })}
          <li>
            <Link href="/clubs" className={`${chipBase} border-transparent text-[var(--accent-ink)] underline underline-offset-2`}>
              Browse Hubs &amp; Clubs
            </Link>
          </li>
        </ul>
      </nav>

      {(ringsAndTrends?.topTrendingTags.length ?? 0) > 0 && (
        <div role="group" aria-labelledby="feed-tags-label" className="flex flex-wrap items-center gap-[var(--sp-2)]">
          <span id="feed-tags-label" className="inline-flex items-center gap-[var(--sp-1)] text-sm font-bold text-[var(--muted)]">
            <Hash aria-hidden="true" className="h-4 w-4" />
            Trending topics, 24h
          </span>
          {ringsAndTrends!.topTrendingTags.map((t) => {
            const active = tagFilter === t.tag;
            return (
              <button
                key={t.tag}
                type="button"
                aria-pressed={active}
                onClick={() => setTagFilter(active ? null : t.tag)}
                className={chipClass(active)}
              >
                #{t.tag}
                <span className="font-normal">({t.count} <span className="sr-only">Posts</span>)</span>
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New Post"
        description={`Posting to ${scopeLabel}. Don't include names, handles, phone numbers or room numbers of other people.`}
        variant="sheet"
        testId="post-composer-dialog"
        closeLabel="Close New Post"
      >
        <form data-testid="post-composer-form" onSubmit={handlePublishPost} className="space-y-[var(--sp-3)]">
          {quotedPost && (
            <div className="flex items-start justify-between gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--surface-2)] p-[var(--sp-2)] text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <strong>Quoting @{quotedPost.author.handle}:</strong> {quotedPost.body}
              </span>
              <button type="button" aria-label="Remove quoted Post" onClick={() => setQuotedPost(null)} className={iconBtn}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}

          <div>
            <label htmlFor={`${composerId}-body`} className="text-sm font-bold text-[var(--ink)]">
              Your Post
            </label>
            <textarea
              id={`${composerId}-body`}
              data-testid="post-composer-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              rows={4}
              aria-describedby={`${composerId}-count`}
              placeholder="Share a campus update, a #topic, or ask @scrappy"
              className={`${field} mt-[var(--sp-1)]`}
            />
            <p id={`${composerId}-count`} className={`${muted} text-right`}>
              {body.length} of 500 characters
            </p>
          </div>

          {mediaItems.length > 0 && (
            <ul aria-label="Attached photos" className="flex flex-wrap gap-[var(--sp-2)]">
              {mediaItems.map((m, idx) => (
                <li key={String(m.mediaAssetId)} className="flex flex-col items-center gap-[var(--sp-1)]">
                  <img src={m.url} alt={`Photo ${idx + 1} preview`} className="h-16 w-16 rounded-[var(--r-sm)] object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${idx + 1}`}
                    onClick={() => setMediaItems((prev) => prev.filter((_, i) => i !== idx))}
                    className={iconBtn}
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(selectedHubId || selectedClubId) && (
            <label className="flex min-h-[var(--target)] items-center gap-[var(--sp-2)] text-sm font-bold text-[var(--ink)]">
              <input
                type="checkbox"
                checked={crossPostToCampus}
                onChange={(e) => setCrossPostToCampus(e.target.checked)}
                className="h-5 w-5"
              />
              <span>
                Also post to All KSU{selectedHubId ? " (off by default for Course Hubs)" : ""}
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-end gap-[var(--sp-2)]">
            <label
              className={`${secondaryBtn} cursor-pointer focus-within:outline focus-within:outline-[length:var(--focus-w)] focus-within:outline-[var(--focus)] ${mediaItems.length >= 4 ? "opacity-60" : ""}`}
            >
              <ImagePlus aria-hidden="true" className="h-4 w-4" />
              <span>Add photo ({mediaItems.length} of 4)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={mediaItems.length >= 4}
                onChange={handleImagePick}
                className="sr-only"
              />
            </label>

            <div className="flex min-w-0 flex-1 flex-col">
              <label htmlFor={`${composerId}-embed`} className="text-sm font-bold text-[var(--ink)]">
                Campus card (optional)
              </label>
              <select
                id={`${composerId}-embed`}
                value={selectedEmbedIdx}
                onChange={(e) => setSelectedEmbedIdx(e.target.value)}
                className="min-h-[var(--target)] w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-2)] text-sm text-[var(--ink)]"
              >
                <option value="">None</option>
                {(embedOptions ?? []).map((opt, idx) => (
                  <option key={`${opt.entityType}-${opt.entityId}`} value={idx}>
                    {opt.entityType}: {opt.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-[var(--r-sm)] bg-[var(--bad-bg)] p-[var(--sp-2)] text-sm font-bold text-[var(--bad-fg)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
            <button type="button" onClick={() => setComposerOpen(false)} className={secondaryBtn}>
              Cancel
            </button>
            <button type="submit" data-testid="publish-post-btn" disabled={submitting || !body.trim()} className={primaryBtn}>
              <Send aria-hidden="true" className="h-4 w-4" />
              {submitting ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      </Dialog>

      <section aria-labelledby="feed-posts-h" aria-busy={loading}>
        <h2 id="feed-posts-h" className="sr-only">
          Posts in {scopeLabel}
        </h2>
        {loading ? (
          <p role="status" className={`rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] ${muted}`}>
            Loading Posts…
          </p>
        ) : posts.length === 0 ? (
          <p className={`rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] ${muted}`}>
            No Posts in {scopeLabel} yet. Choose <strong>New Post</strong> to start the conversation.
          </p>
        ) : (
          <ul className="space-y-[var(--sp-3)]">
            {posts.map((post) => {
              const authorName = post.authorIsScrappy ? "Scrappy" : post.author.displayName;
              const headingId = `post-h-${String(post._id)}`;
              const canEdit = post.isOwnPost && Date.now() - post.publishedAt <= 5 * 60_000;
              return (
                <li key={String(post._id)}>
                  <article
                    data-testid="feed-post-card"
                    aria-labelledby={headingId}
                    className="min-w-0 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-[var(--sp-2)]">
                      <div className="flex min-w-0 flex-1 flex-col gap-[var(--sp-1)]">
                        <h3 id={headingId} className="min-w-0 text-sm [overflow-wrap:anywhere]">
                          <Link
                            href={`/profile?handle=${post.author.handle}`}
                            className="inline-flex min-h-[var(--target)] items-center font-bold text-[var(--ink)] underline-offset-2 hover:underline"
                          >
                            {post.authorIsScrappy && <span aria-hidden="true">🦉 </span>}
                            {authorName}
                          </Link>{" "}
                          <span className="font-normal text-[var(--muted)]">
                            @{post.author.handle}
                            {post.editedAt ? " · Edited" : ""}
                          </span>
                        </h3>
                        <div className="flex flex-wrap items-center gap-[var(--sp-1)]">
                          <CampusBadge campus={post.campus} />
                          {post.courseHub && (
                            <Link
                              href={`/courses/${encodeURIComponent(post.courseHub.subjectCourse)}`}
                              className={`${chipBase} border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]`}
                            >
                              <span className="sr-only">Course Hub </span>
                              {post.courseHub.subjectCourse}
                            </Link>
                          )}
                          {post.club && (
                            <Link href={`/clubs/${post.club.slug}`} className={`${chipBase} border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]`}>
                              <span className="sr-only">Club </span>
                              {post.club.name}
                            </Link>
                          )}
                        </div>
                      </div>

                      {post.isOwnPost ? (
                        <div className="flex flex-wrap items-center gap-[var(--sp-1)]">
                          {canEdit && (
                            <button
                              type="button"
                              aria-label="Edit Post (within 5 minutes of posting)"
                              onClick={() => {
                                setEditingPostId(post._id);
                                setEditingBody(post.body);
                              }}
                              className={iconBtn}
                            >
                              <Edit3 aria-hidden="true" className="h-5 w-5" />
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label="Delete Post"
                            onClick={() => runAction(() => deletePost({ postId: post._id }), "Post deleted", "Couldn’t delete Post")}
                            className={`${iconBtn} hover:bg-[var(--bad-bg)] hover:text-[var(--bad-fg)]`}
                          >
                            <Trash2 aria-hidden="true" className="h-5 w-5" />
                          </button>
                        </div>
                      ) : (
                        <ReportTrigger
                          targetType="post"
                          targetId={String(post._id)}
                          targetLabel={`Post by ${authorName}`}
                          onSubmitReport={async (p) => {
                            await submitReport(p);
                          }}
                        />
                      )}
                    </div>

                    {editingPostId === post._id ? (
                      <form
                        className="mt-[var(--sp-2)] space-y-[var(--sp-2)]"
                        onSubmit={(e) => {
                          e.preventDefault();
                          runAction(
                            async () => {
                              await editPost({ postId: post._id, body: editingBody });
                              setEditingPostId(null);
                            },
                            "Edit saved",
                            "Couldn’t save edit"
                          );
                        }}
                      >
                        <label htmlFor={`edit-${String(post._id)}`} className="text-sm font-bold">
                          Edit Post
                        </label>
                        <textarea
                          id={`edit-${String(post._id)}`}
                          value={editingBody}
                          onChange={(e) => setEditingBody(e.target.value)}
                          rows={3}
                          maxLength={500}
                          className={field}
                        />
                        <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
                          <button type="button" onClick={() => setEditingPostId(null)} className={secondaryBtn}>
                            Cancel
                          </button>
                          <button type="submit" className={primaryBtn}>
                            Save edit
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-[var(--sp-2)] whitespace-pre-wrap text-body leading-relaxed text-[var(--ink)] [overflow-wrap:anywhere]">
                        {post.body}
                      </p>
                    )}

                    {post.mediaUrls.length > 0 && (
                      <div className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-2 gap-[var(--sp-2)]">
                        {post.mediaUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`Photo ${idx + 1} attached by ${authorName}`}
                            className="max-h-56 w-full rounded-[var(--r-sm)] object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {post.embed && <CampusEntityCard {...post.embed} />}

                    {post.referencedPost && (
                      <blockquote className="mt-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-3)] text-sm">
                        <div className="flex flex-wrap items-center gap-[var(--sp-1)] font-bold text-[var(--ink)]">
                          @{post.referencedPost.authorHandle}
                          <CampusBadge campus={post.referencedPost.campus} />
                        </div>
                        <p className="mt-[var(--sp-1)] text-[var(--ink)] [overflow-wrap:anywhere]">{post.referencedPost.body}</p>
                      </blockquote>
                    )}

                    {post.scrappyCitations.length > 0 && (
                      <div className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-1)]">
                        {post.scrappyCitations.map((c, idx) => (
                          <CitationPill key={idx} label={c.label} href={c.href} campus={c.campus} />
                        ))}
                      </div>
                    )}

                    <div role="group" aria-label={`Actions for Post by ${authorName}`} className="mt-[var(--sp-3)] flex flex-wrap items-center gap-[var(--sp-1)] border-t border-[var(--line)] pt-[var(--sp-2)]">
                      <button
                        type="button"
                        data-testid="open-thread-btn"
                        aria-haspopup="dialog"
                        aria-label={`Replies, ${post.replyCount}`}
                        onClick={() => setActiveThreadPostId(post._id)}
                        className={iconBtn}
                      >
                        <MessageCircle aria-hidden="true" className="h-5 w-5" />
                        <span aria-hidden="true">{post.replyCount}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Repost, ${post.repostCount}`}
                        onClick={() => runAction(() => createPost({ body: "", repostOfPostId: post._id }), "Reposted", "Couldn’t repost")}
                        className={iconBtn}
                      >
                        <Repeat2 aria-hidden="true" className="h-5 w-5" />
                        <span aria-hidden="true">{post.repostCount}</span>
                      </button>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => {
                          setQuotedPost(post);
                          setComposerOpen(true);
                        }}
                        className={iconBtn}
                      >
                        <Quote aria-hidden="true" className="h-5 w-5" />
                        Quote
                      </button>
                      <button
                        type="button"
                        aria-pressed={post.likedByViewer}
                        aria-label={`Like, ${post.likeCount}`}
                        onClick={() => void toggleInteraction({ postId: post._id, kind: "post_like" })}
                        className={`${iconBtn} ${post.likedByViewer ? "text-[var(--bad-fg)]" : ""}`}
                      >
                        <Heart aria-hidden="true" className="h-5 w-5" fill={post.likedByViewer ? "currentColor" : "none"} />
                        <span aria-hidden="true">{post.likeCount}</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={post.bookmarkedByViewer}
                        aria-label="Bookmark"
                        onClick={() => void toggleInteraction({ postId: post._id, kind: "post_bookmark" })}
                        className={`${iconBtn} ${post.bookmarkedByViewer ? "text-[var(--accent-ink)]" : ""}`}
                      >
                        <Bookmark aria-hidden="true" className="h-5 w-5" fill={post.bookmarkedByViewer ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        open={activeThreadPostId !== null}
        onClose={() => {
          setActiveThreadPostId(null);
          setReplyError(null);
        }}
        title="Post thread"
        variant="sheet"
        testId="post-thread-drawer"
        closeLabel="Close thread"
      >
        <div className="space-y-[var(--sp-3)]">
          {threadDetail === undefined ? (
            <p role="status" className={muted}>Loading thread…</p>
          ) : threadDetail === null ? (
            <p role="status" data-testid="thread-unavailable" className={muted}>This Post is no longer available.</p>
          ) : (
            <>
              <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-3)]">
                <div className="flex flex-wrap items-center gap-[var(--sp-1)] text-sm font-bold text-[var(--ink)]">
                  {threadDetail.rootPost.author.displayName}
                  <span className="font-normal text-[var(--muted)]">@{threadDetail.rootPost.author.handle}</span>
                  <CampusBadge campus={threadDetail.rootPost.campus} />
                </div>
                <p className="mt-[var(--sp-1)] whitespace-pre-wrap text-body text-[var(--ink)] [overflow-wrap:anywhere]">
                  {threadDetail.rootPost.body}
                </p>
              </div>

              <h3 className="text-sm font-bold text-[var(--muted)]">
                {threadDetail.replies.length} {threadDetail.replies.length === 1 ? "reply" : "replies"}
              </h3>
              <ul className="space-y-[var(--sp-2)]">
                {threadDetail.replies.map((rep) => (
                  <li
                    key={String(rep._id)}
                    data-testid={rep.authorIsScrappy ? "scrappy-thread-reply" : "thread-reply-card"}
                    className={`rounded-[var(--r-md)] border p-[var(--sp-3)] text-sm ${
                      rep.authorIsScrappy ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-[var(--sp-1)]">
                      <span className="min-w-0 font-bold text-[var(--ink)] [overflow-wrap:anywhere]">
                        {rep.authorIsScrappy ? (
                          <>
                            <span aria-hidden="true">🦉 </span>Scrappy · Campus Owl
                          </>
                        ) : (
                          rep.author.displayName
                        )}{" "}
                        <span className="font-normal text-[var(--muted)]">@{rep.author.handle}</span>
                      </span>
                      <CampusBadge campus={rep.campus} />
                    </div>
                    {rep.scrappyStatus === "thinking" && (
                      <p role="status" className="mt-[var(--sp-1)] text-sm font-bold text-[var(--accent-ink)]">
                        Scrappy is thinking…
                      </p>
                    )}
                    <p className="mt-[var(--sp-1)] whitespace-pre-wrap text-body leading-relaxed text-[var(--ink)] [overflow-wrap:anywhere]">
                      {rep.body}
                    </p>
                    {rep.scrappyCitations.length > 0 && (
                      <div className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-1)]">
                        {rep.scrappyCitations.map((c, idx) => (
                          <CitationPill key={idx} label={c.label} href={c.href} campus={c.campus} />
                        ))}
                      </div>
                    )}
                    {rep.authorIsScrappy && rep.scrappyStatus === "error" && (
                      <button
                        type="button"
                        onClick={() => runAction(() => retryScrappyMention({ replyPostId: rep._id }), "Asked @scrappy again", "Couldn’t retry @scrappy")}
                        className={`${primaryBtn} mt-[var(--sp-2)]`}
                      >
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        Retry @scrappy (quota refunded)
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <form onSubmit={handleReplySubmit} className="space-y-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-3)]">
            <label htmlFor={`${composerId}-reply`} className="text-sm font-bold text-[var(--ink)]">
              Your reply
            </label>
            <div className="flex flex-wrap gap-[var(--sp-2)]">
              <input
                id={`${composerId}-reply`}
                data-testid="thread-reply-input"
                type="text"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                maxLength={500}
                placeholder="Write a reply, or tag @scrappy"
                className="min-h-[var(--target)] min-w-0 flex-1 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]"
              />
              <button type="submit" disabled={submitting || !replyBody.trim()} className={primaryBtn}>
                Reply
              </button>
            </div>
            {replyError && (
              <p role="alert" className="text-sm font-bold text-[var(--bad-fg)]">
                {replyError}
              </p>
            )}
          </form>
        </div>
      </Dialog>
    </div>
  );
}
