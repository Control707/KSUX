"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Bookmark,
  Edit3,
  Hash,
  Heart,
  ImagePlus,
  MessageCircle,
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

export function FeedView() {
  const searchParams = useSearchParams();
  const {
    uploadImage,
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();

  const [stream, setStream] = useState<"campus" | "following" | "trending">(
    "campus"
  );
  const [selectedHubId, setSelectedHubId] = useState<Id<"courseHubs"> | null>(
    null
  );
  const [selectedClubId, setSelectedClubId] = useState<Id<"clubs"> | null>(
    null
  );
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeThreadPostId, setActiveThreadPostId] =
    useState<Id<"posts"> | null>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(
    searchParams.get("compose") === "1"
  );
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
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as {
          body?: string;
        };
        if (parsed.body) setBody(parsed.body);
      } catch {
        setBody(pendingDraftCard.summary);
      }
      setComposerOpen(true);
      setPendingDraftCard(null);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  // Adjust default cross-post toggle when Course Hub vs Club ring changes
  useEffect(() => {
    if (selectedHubId) {
      setCrossPostToCampus(false);
    } else {
      setCrossPostToCampus(true);
    }
  }, [selectedHubId, selectedClubId]);

  const ringsAndTrends = useViewerQuery(api.feed.listFeedRingsAndTrends, {});
  const embedOptions = useViewerQuery(api.feed.listEmbeddableEntities, {});

  const campusOrTrendingResult = useViewerQuery(
    api.feed.listCampusOrTrendingFeed,
    stream === "following" && !selectedHubId && !selectedClubId
      ? "skip"
      : {
          stream: stream === "trending" ? "trending" : "campus",
          courseHubId: selectedHubId ?? undefined,
          clubId: selectedClubId ?? undefined,
          tagFilter: tagFilter ?? undefined,
          paginationOpts: { numItems: 25, cursor: null },
        }
  );

  const followingResult = useViewerQuery(
    api.feed.listFollowingFeed,
    stream === "following" && !selectedHubId && !selectedClubId ? {} : "skip"
  );

  const threadDetail = useViewerQuery(
    api.feed.getPostThread,
    activeThreadPostId ? { postId: activeThreadPostId } : "skip"
  );

  const createPost = useViewerMutation(api.feed.createPost);
  const editPost = useViewerMutation(api.feed.editPost);
  const deletePost = useViewerMutation(api.feed.deletePost);
  const toggleInteraction = useViewerMutation(api.feed.togglePostInteraction);
  const submitReport = useViewerMutation(api.moderation.submitReport);
  const retryScrappyMention = useViewerMutation(
    api.scrappy.mentions.retryFailedMention
  );

  const posts =
    stream === "following" && !selectedHubId && !selectedClubId
      ? (followingResult ?? [])
      : (campusOrTrendingResult?.page ?? []);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || mediaItems.length >= 4) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "post");
      setMediaItems((prev) => [
        ...prev,
        { mediaAssetId: uploaded.mediaAssetId, url: uploaded.url },
      ]);
    } catch (err: any) {
      setError(err?.message || "Image upload failed.");
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
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not publish Post.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThreadPostId || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await createPost({
        body: replyBody,
        replyToPostId: activeThreadPostId,
      });
      setReplyBody("");
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Reply failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div data-testid="campus-feed-view" className="flex flex-col">
      {/* Enrolled Course Hubs & Joined Clubs Quick-Filter Rings */}
      <div
        data-testid="feed-rings-strip"
        className="no-scrollbar flex items-center gap-2.5 overflow-x-auto border-b border-[#E4E7EE] bg-white px-3.5 py-2.5"
      >
        <button
          type="button"
          onClick={() => {
            setSelectedHubId(null);
            setSelectedClubId(null);
          }}
          className="flex shrink-0 flex-col items-center gap-1"
        >
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs font-black ${
              !selectedHubId && !selectedClubId
                ? "border-[#FDBB30] bg-[#111317] text-[#FDBB30]"
                : "border-[#E4E7EE] bg-[#F4F6FA] text-[#111317]"
            }`}
          >
            ALL
          </span>
          <span className="text-[10px] font-bold text-[#111317]">All Feed</span>
        </button>

        {(ringsAndTrends?.courseRings ?? []).map((hub) => {
          const active = selectedHubId === hub._id;
          return (
            <button
              key={String(hub._id)}
              type="button"
              onClick={() => {
                setSelectedClubId(null);
                setSelectedHubId(active ? null : hub._id);
              }}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[10.5px] font-black ${
                  active
                    ? "border-[#2563EB] bg-[#111317] text-[#FDBB30]"
                    : "border-[#FDBB30] bg-white text-[#111317]"
                }`}
              >
                {hub.subjectCourse.replace(/\s+/g, "")}
              </span>
              <span className="max-w-16 truncate text-[10px] font-bold text-[#111317]">
                {hub.subjectCourse}
              </span>
            </button>
          );
        })}

        {(ringsAndTrends?.clubRings ?? []).map((club) => {
          const active = selectedClubId === club._id;
          return (
            <button
              key={String(club._id)}
              type="button"
              onClick={() => {
                setSelectedHubId(null);
                setSelectedClubId(active ? null : club._id);
              }}
              className="flex shrink-0 flex-col items-center gap-1"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-[10.5px] font-black ${
                  active
                    ? "border-[#2563EB] bg-[#111317] text-[#FDBB30]"
                    : "border-[#111317] bg-[#FFF6DC] text-[#111317]"
                }`}
              >
                {club.shortName}
              </span>
              <span className="max-w-16 truncate text-[10px] font-bold text-[#111317]">
                {club.shortName}
              </span>
            </button>
          );
        })}

        <Link
          href="/clubs"
          className="ml-1 shrink-0 rounded-full border border-[#E4E7EE] bg-[#F4F6FA] px-3 py-2 text-[11px] font-bold text-[#111317] hover:border-[#D99B00]"
        >
          Browse All Hubs &amp; Clubs →
        </Link>
      </div>

      {/* Stream Switcher + New Post Button */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E7EE] bg-white px-3.5 py-2">
        <div className="flex items-center gap-1.5">
          {(
            [
              ["campus", "All KSU"],
              ["following", "Following"],
              ["trending", "Trending (24h)"],
            ] as const
          ).map(([val, label]) => {
            const active =
              !selectedHubId && !selectedClubId && stream === val;
            return (
              <button
                key={val}
                type="button"
                data-testid={`feed-stream-${val}`}
                onClick={() => {
                  setSelectedHubId(null);
                  setSelectedClubId(null);
                  setStream(val);
                }}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${
                  active
                    ? "bg-[#111317] text-[#FDBB30]"
                    : "border border-[#E4E7EE] bg-[#F4F6FA] text-[#5E6675]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          data-testid="open-post-composer-btn"
          onClick={() => setComposerOpen((v) => !v)}
          className="rounded-xl bg-[#FDBB30] px-3 py-1.5 text-xs font-extrabold text-[#111317]"
        >
          {composerOpen ? "Close" : "+ New Post"}
        </button>
      </div>

      {/* Top 8 24h Trending #topic Filter Chips */}
      {(ringsAndTrends?.topTrendingTags.length ?? 0) > 0 && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-[#E4E7EE] bg-[#F9FAFC] px-3.5 py-2">
          <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-[#5E6675]">
            <Hash className="h-3 w-3" />
            24h:
          </span>
          {ringsAndTrends!.topTrendingTags.map((t) => {
            const active = tagFilter === t.tag;
            return (
              <button
                key={t.tag}
                type="button"
                onClick={() => setTagFilter(active ? null : t.tag)}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                  active
                    ? "bg-[#111317] text-[#FDBB30]"
                    : "border border-[#E4E7EE] bg-white text-[#111317]"
                }`}
              >
                #{t.tag} ({t.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Post Composer */}
      {composerOpen && (
        <form
          data-testid="post-composer-form"
          onSubmit={handlePublishPost}
          className="m-3.5 space-y-3 rounded-2xl border border-[#D99B00] bg-white p-4 shadow-sm"
        >
          {quotedPost && (
            <div className="flex items-center justify-between rounded-xl bg-[#F4F6FA] px-3 py-2 text-xs">
              <span className="truncate font-semibold text-[#111317]">
                Quoting @{quotedPost.author.handle}: {quotedPost.body}
              </span>
              <button type="button" onClick={() => setQuotedPost(null)}>
                <X className="h-3.5 w-3.5 text-[#5E6675]" />
              </button>
            </div>
          )}

          <textarea
            data-testid="post-composer-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Share a campus update, #topic, or mention @scrappy for Owl answers..."
            className="w-full rounded-xl border border-[#E4E7EE] p-3 text-sm text-[#111317] focus:border-[#111317] focus:outline-none"
          />

          {mediaItems.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {mediaItems.map((m, idx) => (
                <div key={String(m.mediaAssetId)} className="relative">
                  <img
                    src={m.url}
                    alt="Upload preview"
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setMediaItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="absolute -right-1 -top-1 rounded-full bg-[#111317] p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {(selectedHubId || selectedClubId) && (
            <label className="flex items-center gap-2 text-xs font-semibold text-[#111317]">
              <input
                type="checkbox"
                checked={crossPostToCampus}
                onChange={(e) => setCrossPostToCampus(e.target.checked)}
              />
              <span>
                Also cross-post to main Campus Feed{" "}
                {selectedHubId ? "(off by default for Course Hubs)" : ""}
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-2.5 py-1.5 text-xs font-bold text-[#111317]">
                <ImagePlus className="h-3.5 w-3.5" />
                <span>WebP ({mediaItems.length}/4)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImagePick}
                  className="hidden"
                />
              </label>

              <select
                value={selectedEmbedIdx}
                onChange={(e) => setSelectedEmbedIdx(e.target.value)}
                className="max-w-52 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-2.5 py-1.5 text-xs font-semibold text-[#111317]"
              >
                <option value="">+ Embed Campus Card (Optional)</option>
                {(embedOptions ?? []).map((opt, idx) => (
                  <option key={`${opt.entityType}-${opt.entityId}`} value={idx}>
                    [{opt.entityType}] {opt.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#5E6675]">
                {body.length}/500
              </span>
              <button
                type="submit"
                data-testid="publish-post-btn"
                disabled={submitting || !body.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{submitting ? "Posting..." : "Publish"}</span>
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-[#B91C1C]">{error}</p>
          )}
        </form>
      )}

      {/* Feed Stream Cards */}
      <div className="space-y-3 p-3.5">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-center text-xs font-semibold text-[#5E6675]">
            No Posts in this stream yet. Tap <strong>+ New Post</strong> to
            start the conversation!
          </div>
        ) : (
          posts.map((post) => (
            <article
              key={String(post._id)}
              data-testid="feed-post-card"
              className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Link
                    href={`/profile?handle=${post.author.handle}`}
                    className="font-extrabold text-[#111317] hover:underline"
                  >
                    {post.authorIsScrappy ? "🦉 " : ""}
                    {post.author.displayName}
                  </Link>
                  <span className="text-[#5E6675]">@{post.author.handle}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      post.campus === "Marietta"
                        ? "bg-[#DBEAFE] text-[#1E3A8A]"
                        : "bg-[#FFF6DC] text-[#855A00]"
                    }`}
                  >
                    {post.campus}
                  </span>
                  {post.courseHub && (
                    <Link
                      href={`/courses/${encodeURIComponent(post.courseHub.subjectCourse)}`}
                      className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-extrabold text-[#3730A3]"
                    >
                      {post.courseHub.subjectCourse}
                    </Link>
                  )}
                  {post.club && (
                    <Link
                      href={`/clubs/${post.club.slug}`}
                      className="rounded-full bg-[#F3E8FF] px-2 py-0.5 text-[10px] font-extrabold text-[#6B21A8]"
                    >
                      {post.club.name}
                    </Link>
                  )}
                  {post.editedAt && (
                    <span className="text-[10.5px] italic text-[#5E6675]">
                      · Edited
                    </span>
                  )}
                </div>

                {post.isOwnPost ? (
                  <div className="flex items-center gap-1">
                    {Date.now() - post.publishedAt <= 5 * 60_000 && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostId(post._id);
                          setEditingBody(post.body);
                        }}
                        className="rounded-lg p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
                        title="Edit typo (5m window)"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deletePost({ postId: post._id })}
                      className="rounded-lg p-1 text-[#5E6675] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                      title="Delete Post"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <ReportTrigger
                    targetType="post"
                    targetId={String(post._id)}
                    onSubmitReport={async (p) => {
                      await submitReport(p);
                    }}
                  />
                )}
              </div>

              {editingPostId === post._id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full rounded-xl border border-[#111317] p-2.5 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingPostId(null)}
                      className="rounded-lg border border-[#E4E7EE] px-2.5 py-1 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await editPost({
                          postId: post._id,
                          body: editingBody,
                        });
                        setEditingPostId(null);
                      }}
                      className="rounded-lg bg-[#111317] px-3 py-1 text-xs font-extrabold text-[#FDBB30]"
                    >
                      Save Edit
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#1B1F27]">
                  {post.body}
                </p>
              )}

              {post.mediaUrls.length > 0 && (
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {post.mediaUrls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt="Post attachment"
                      className="max-h-56 w-full rounded-xl object-cover"
                    />
                  ))}
                </div>
              )}

              {post.embed && <CampusEntityCard {...post.embed} />}

              {post.referencedPost && (
                <div className="mt-2 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] p-3 text-xs">
                  <div className="font-bold text-[#111317]">
                    @{post.referencedPost.authorHandle} ·{" "}
                    {post.referencedPost.campus}
                  </div>
                  <p className="mt-0.5 text-[#374151]">
                    {post.referencedPost.body}
                  </p>
                </div>
              )}

              {post.scrappyCitations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {post.scrappyCitations.map((c, idx) => (
                    <CitationPill
                      key={idx}
                      label={c.label}
                      href={c.href}
                      campus={c.campus}
                    />
                  ))}
                </div>
              )}

              {/* Engagement Bar */}
              <div className="mt-3 flex items-center justify-between border-t border-[#E4E7EE] pt-2.5 text-xs font-bold text-[#5E6675]">
                <button
                  type="button"
                  data-testid="open-thread-btn"
                  onClick={() => setActiveThreadPostId(post._id)}
                  className="inline-flex items-center gap-1 hover:text-[#111317]"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{post.replyCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void createPost({
                      body: "",
                      repostOfPostId: post._id,
                    })
                  }
                  className="inline-flex items-center gap-1 hover:text-[#15803D]"
                  title="1-tap Repost"
                >
                  <Repeat2 className="h-4 w-4" />
                  <span>{post.repostCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setQuotedPost(post);
                    setComposerOpen(true);
                  }}
                  className="inline-flex items-center gap-1 hover:text-[#1E3A8A]"
                  title="Quote Post"
                >
                  <Quote className="h-3.5 w-3.5" />
                  <span>Quote</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void toggleInteraction({
                      postId: post._id,
                      kind: "post_like",
                    })
                  }
                  className={`inline-flex items-center gap-1 ${
                    post.likedByViewer
                      ? "text-[#DC2626]"
                      : "hover:text-[#DC2626]"
                  }`}
                >
                  <Heart className="h-4 w-4" />
                  <span>{post.likeCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void toggleInteraction({
                      postId: post._id,
                      kind: "post_bookmark",
                    })
                  }
                  className={
                    post.bookmarkedByViewer
                      ? "text-[#D99B00]"
                      : "hover:text-[#111317]"
                  }
                >
                  <Bookmark className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Flat Single-Root Thread Drawer */}
      {activeThreadPostId && (
        <div
          data-testid="post-thread-drawer"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/55 sm:items-center sm:p-4"
          onClick={() => setActiveThreadPostId(null)}
        >
          <div
            className="flex max-h-[86vh] w-full max-w-xl flex-col rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E4E7EE] pb-2.5">
              <h3 className="text-sm font-black text-[#111317]">
                Post Thread
              </h3>
              <button
                type="button"
                onClick={() => setActiveThreadPostId(null)}
                className="rounded-lg p-1 text-[#5E6675] hover:bg-[#F4F6FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto py-3">
              {!threadDetail ? (
                <p className="text-xs text-[#5E6675]">Loading thread...</p>
              ) : (
                <>
                  <div className="rounded-2xl border border-[#E4E7EE] bg-[#F9FAFC] p-3.5">
                    <div className="text-xs font-extrabold text-[#111317]">
                      {threadDetail.rootPost.author.displayName}{" "}
                      <span className="font-normal text-[#5E6675]">
                        @{threadDetail.rootPost.author.handle}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[#111317]">
                      {threadDetail.rootPost.body}
                    </p>
                  </div>

                  {threadDetail.replies.map((rep) => (
                    <div
                      key={String(rep._id)}
                      data-testid={
                        rep.authorIsScrappy
                          ? "scrappy-thread-reply"
                          : "thread-reply-card"
                      }
                      className={`rounded-2xl border p-3 text-xs ${
                        rep.authorIsScrappy
                          ? "border-[#FDBB30] bg-[#FFFDF7]"
                          : "border-[#E4E7EE] bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[#111317]">
                          {rep.authorIsScrappy ? "🦉 Scrappy · Campus Owl" : rep.author.displayName}{" "}
                          <span className="font-normal text-[#5E6675]">
                            @{rep.author.handle}
                          </span>
                        </span>
                        {rep.scrappyStatus === "thinking" && (
                          <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10px] font-bold text-[#855A00]">
                            🦉 Thinking...
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-[#1B1F27]">
                        {rep.body}
                      </p>
                      {rep.scrappyCitations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {rep.scrappyCitations.map((c, idx) => (
                            <CitationPill
                              key={idx}
                              label={c.label}
                              href={c.href}
                              campus={c.campus}
                            />
                          ))}
                        </div>
                      )}
                      {rep.authorIsScrappy && rep.scrappyStatus === "error" && (
                        <button
                          type="button"
                          onClick={() =>
                            void retryScrappyMention({
                              replyPostId: rep._id,
                            })
                          }
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#111317] px-2.5 py-1 text-[11px] font-bold text-[#FDBB30]"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Retry @scrappy (Quota Refunded)</span>
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            <form
              onSubmit={handleReplySubmit}
              className="flex gap-2 border-t border-[#E4E7EE] pt-2.5"
            >
              <input
                type="text"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                maxLength={500}
                placeholder="Write a reply (or tag @scrappy)..."
                className="flex-1 rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs focus:border-[#111317] focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting || !replyBody.trim()}
                className="rounded-xl bg-[#111317] px-3.5 py-2 text-xs font-extrabold text-[#FDBB30] disabled:opacity-50"
              >
                Reply
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
