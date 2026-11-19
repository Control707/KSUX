"use client";

import React, { useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Ban,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Info,
  LogOut,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";
import { InstallHomeScreenCard } from "@/components/pwa/PwaSupport";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge } from "@/components/a11y/controls";
import { CloutCard } from "./CloutCard";

const card =
  "rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]";
const buttonBase =
  "inline-flex min-h-[var(--target)] items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-sm font-bold";
const secondaryButton = `${buttonBase} border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]`;
const primaryButton = `${buttonBase} bg-[var(--ink)] text-[var(--bg)] hover:opacity-90`;
const dangerButton = `${buttonBase} border border-[var(--bad-fg)] bg-[var(--surface)] text-[var(--bad-fg)] hover:bg-[var(--bad-bg)]`;
const fieldClass =
  "mt-[var(--sp-1)] min-h-[var(--target)] w-full rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]";
const rowLink =
  "flex min-h-[var(--target)] min-w-0 items-center justify-between gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--line)] px-[var(--sp-3)] py-[var(--sp-2)] hover:bg-[var(--surface-2)]";

function errorMessage(err: any, fallback: string) {
  return err?.data?.message || err?.message || fallback;
}

export function ProfileView() {
  const searchParams = useSearchParams();
  const requestedHandle = searchParams.get("handle") || undefined;

  const { auth, signOut, uploadImage } = useViewerClient();
  const { toast } = useAnnouncer();
  const profile = useViewerQuery(api.students.getProfile, {
    handle: requestedHandle,
  });
  const classmates = useViewerQuery(api.students.searchStudents, {});
  const toggleFollow = useViewerMutation(api.students.toggleFollow);
  const updateProfile = useViewerMutation(api.students.updateProfile);
  const deleteMyProfile = useViewerMutation(api.students.deleteMyProfile);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const formId = useId();
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [major, setMajor] = useState("");
  const [classYear, setClassYear] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (profile === undefined) {
    return (
      <p role="status" className="p-[var(--sp-4)] text-sm text-[var(--muted)]">
        Loading Student profile…
      </p>
    );
  }

  if (!profile) {
    return (
      <div className="p-[var(--sp-4)]">
        <div className={card}>
          <h1 className="font-display text-2xl font-bold">Profile not found</h1>
          <p className="mt-[var(--sp-1)]">This Student profile isn't in this workspace.</p>
        </div>
      </div>
    );
  }

  const { student } = profile;
  const initials = student.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const startEdit = () => {
    setDisplayName(student.displayName);
    setMajor(student.major ?? "");
    setClassYear(student.classYear ?? "");
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ displayName, major, classYear });
      setEditing(false);
      toast({ message: "Profile updated", tone: "success" });
    } catch (err: any) {
      setEditError(errorMessage(err, "Update failed."));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const uploaded = await uploadImage(file, "avatar");
      await updateProfile({ avatarAssetId: uploaded.mediaAssetId });
      toast({ message: "Avatar updated", tone: "success" });
    } catch (err: any) {
      toast({ message: errorMessage(err, "Avatar upload failed."), tone: "error" });
    }
  };

  const handleSelfDelete = async () => {
    try {
      await deleteMyProfile({});
      await signOut();
    } catch (err: any) {
      setConfirmDelete(false);
      toast({ message: errorMessage(err, "Could not delete your profile."), tone: "error" });
    }
  };

  return (
    <div data-testid="student-profile-view" className="space-y-[var(--sp-4)] p-[var(--sp-4)] [overflow-wrap:anywhere]">
      <InstallHomeScreenCard />

      {/* Primary profile card */}
      <section aria-labelledby="profile-heading" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-[var(--sp-4)]">
          <div className="flex min-w-0 flex-wrap items-center gap-[var(--sp-3)]">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-[var(--r-md)] object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-[var(--accent-soft)] font-display text-xl font-bold text-[var(--accent-ink)]"
              >
                {initials}
              </span>
            )}

            <div className="min-w-0">
              <h1 id="profile-heading" className="font-display text-2xl font-bold leading-tight">
                {student.displayName}
              </h1>
              <p className="text-sm text-[var(--muted)]">@{student.handle}</p>
              {!student.isRemoved && (
                <div className="mt-[var(--sp-1)] flex flex-wrap items-center gap-[var(--sp-2)] text-sm">
                  <span className="inline-flex items-center rounded-full bg-[var(--surface-2)] px-[var(--sp-2)] font-bold">
                    {student.emailDomainBadge === "faculty_staff" ? "KSU Faculty · Staff" : "KSU Student"}
                  </span>
                  <CampusBadge campus={student.homeCampus} />
                  {student.major && (
                    <span>
                      {student.major}
                      {student.classYear ? ` · '${student.classYear.slice(-2)}` : ""}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-[var(--sp-1)]">
                    <Award aria-hidden="true" className="h-4 w-4" />
                    {student.completedDealCount} Marketplace handoffs
                  </span>
                </div>
              )}
            </div>
          </div>

          {profile.isSelf ? (
            <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
              <input
                ref={avatarInput}
                id={`${formId}-avatar`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose an avatar photo"
                tabIndex={-1}
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button type="button" onClick={() => avatarInput.current?.click()} className={secondaryButton}>
                <Camera aria-hidden="true" className="h-4 w-4" />
                Change avatar
              </button>
              <button type="button" onClick={startEdit} className={secondaryButton}>
                Edit profile
              </button>
              <button
                type="button"
                onClick={() =>
                  void signOut().catch((error: Error) => toast({ message: error.message, tone: "error" }))
                }
                className={primaryButton}
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                {auth.status === "demo" ? "Exit Demo" : "Sign out"}
              </button>
            </div>
          ) : !student.isRemoved ? (
            <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
              <button
                type="button"
                data-testid="profile-follow-btn"
                aria-pressed={profile.isFollowedByViewer}
                onClick={() => void toggleFollow({ targetStudentId: student._id })}
                className={
                  profile.isFollowedByViewer
                    ? secondaryButton
                    : `${buttonBase} bg-[var(--accent)] text-[var(--on-accent)]`
                }
              >
                {profile.isFollowedByViewer ? (
                  <>
                    <Check aria-hidden="true" className="h-4 w-4" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus aria-hidden="true" className="h-4 w-4" />
                    Follow
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="profile-block-btn"
                onClick={async () => {
                  try {
                    await toggleBlock({ targetStudentId: student._id });
                    toast({ message: `Blocked @${student.handle}`, tone: "success" });
                  } catch (err: any) {
                    toast({ message: errorMessage(err, "Couldn't block."), tone: "error" });
                  }
                }}
                className={dangerButton}
              >
                <Ban aria-hidden="true" className="h-4 w-4" />
                Block
              </button>

              <ReportTrigger
                targetType="student"
                targetId={String(student._id)}
                targetLabel={`@${student.handle}`}
                onSubmitReport={async (p) => {
                  await submitReport(p);
                }}
              />
            </div>
          ) : null}
        </div>

        <dl className="mt-[var(--sp-4)] flex flex-wrap gap-x-[var(--sp-5)] gap-y-[var(--sp-1)] border-t border-[var(--line)] pt-[var(--sp-3)] text-sm">
          <div className="flex gap-[var(--sp-1)]">
            <dt className="text-[var(--muted)]">Followers</dt>
            <dd className="order-first font-bold">{profile.followerCount}</dd>
          </div>
          <div className="flex gap-[var(--sp-1)]">
            <dt className="text-[var(--muted)]">Following</dt>
            <dd className="order-first font-bold">{profile.followingCount}</dd>
          </div>
          {student.joinedAt > 0 && (
            <div className="flex gap-[var(--sp-1)]">
              <dt className="text-[var(--muted)]">Joined</dt>
              <dd>
                {new Date(student.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {profile.isSelf && <CloutCard />}

      {profile.isSelf && (
        <nav aria-label="Profile settings" className={card}>
          <h2 className="font-display text-xl font-bold">Settings and info</h2>
          <ul className="mt-[var(--sp-2)] space-y-[var(--sp-2)]">
            <li>
              <Link href="/profile/notifications" className={rowLink}>
                <span className="flex min-w-0 items-center gap-[var(--sp-2)]">
                  <Bell aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="font-bold">Notifications</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </li>
            <li>
              <Link href="/safety" className={rowLink}>
                <span className="flex min-w-0 items-center gap-[var(--sp-2)]">
                  <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="font-bold">Safety and the Emergency Panel</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </li>
            <li>
              <Link href="/profile/about" data-testid="profile-about-link" className={rowLink}>
                <span className="flex min-w-0 items-center gap-[var(--sp-2)]">
                  <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="font-bold">About KSUX and accessibility</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
              </Link>
            </li>
          </ul>
        </nav>
      )}

      {profile.joinedClubs.length > 0 && (
        <section aria-labelledby="profile-clubs-heading" className={card}>
          <h2 id="profile-clubs-heading" className="font-display text-xl font-bold">
            Joined KSU clubs
          </h2>
          <ul className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-2)]">
            {profile.joinedClubs.map((c: any) => (
              <li key={String(c._id)} className="min-w-0">
                <Link href={`/clubs/${c.slug}`} className={rowLink}>
                  <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="font-bold">{c.name}</span>
                  {c.campus && <CampusBadge campus={c.campus} />}
                  {c.role === "officer" && (
                    <span className="rounded-full bg-[var(--surface-2)] px-[var(--sp-2)] text-sm font-bold">Officer</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {classmates && classmates.length > 1 && (
        <section aria-labelledby="profile-classmates-heading" className={card}>
          <h2 id="profile-classmates-heading" className="font-display text-xl font-bold">
            KSU classmates
          </h2>
          <ul className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-1 gap-[var(--sp-2)] sm:grid-cols-2">
            {classmates
              .filter((c) => c._id !== student._id)
              .slice(0, 6)
              .map((peer) => (
                <li key={String(peer._id)} className="min-w-0">
                  <Link href={`/profile?handle=${peer.handle}`} className={rowLink}>
                    <span className="min-w-0">
                      <span className="block font-bold">{peer.displayName}</span>
                      <span className="flex flex-wrap items-center gap-[var(--sp-1)] text-sm text-[var(--muted)]">
                        @{peer.handle} <CampusBadge campus={peer.homeCampus} />
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}

      {profile.isSelf && auth.status === "student" && (
        <section aria-labelledby="profile-delete-heading" className={`${card} border-[var(--bad-fg)]`}>
          <h2 id="profile-delete-heading" className="font-display text-xl font-bold text-[var(--bad-fg)]">
            Delete my KSUX profile
          </h2>
          <p className="mt-[var(--sp-1)] text-sm">
            Revokes sessions and push, purges media, scrubs your .edu email, and reserves @{student.handle} for 30 days.
          </p>
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${dangerButton} mt-[var(--sp-3)]`}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete profile
          </button>
        </section>
      )}

      <Dialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit profile"
        testId="profile-edit-dialog"
      >
        <form onSubmit={handleSaveEdit} className="space-y-[var(--sp-3)]">
          <div>
            <label htmlFor={`${formId}-name`} className="block text-sm font-bold">
              Display name
            </label>
            <input
              id={`${formId}-name`}
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-major`} className="block text-sm font-bold">
              Major
            </label>
            <input
              id={`${formId}-major`}
              type="text"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${formId}-year`} className="block text-sm font-bold">
              Class year
            </label>
            <input
              id={`${formId}-year`}
              type="text"
              inputMode="numeric"
              value={classYear}
              onChange={(e) => setClassYear(e.target.value)}
              className={fieldClass}
            />
          </div>
          {editError && (
            <p role="alert" className="rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--bad-bg)] p-[var(--sp-2)] text-sm font-bold text-[var(--bad-fg)]">
              {editError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
            <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" className={primaryButton}>
              Save changes
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        role="alertdialog"
        title="Delete your KSUX profile?"
        description={`This can't be undone. @${student.handle} stays reserved for 30 days.`}
        testId="profile-delete-dialog"
      >
        <div className="flex flex-wrap justify-end gap-[var(--sp-2)]">
          <button type="button" onClick={() => setConfirmDelete(false)} className={secondaryButton}>
            Keep my profile
          </button>
          <button
            type="button"
            onClick={() => void handleSelfDelete()}
            className={`${buttonBase} bg-[var(--bad-fg)] text-[var(--bad-bg)]`}
          >
            Delete permanently
          </button>
        </div>
      </Dialog>
    </div>
  );
}
