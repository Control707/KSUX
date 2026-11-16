"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Award,
  Ban,
  Camera,
  Check,
  LogOut,
  MapPin,
  ShieldCheck,
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

export function ProfileView() {
  const searchParams = useSearchParams();
  const requestedHandle = searchParams.get("handle") || undefined;

  const { auth, signOut, uploadImage } = useViewerClient();
  const profile = useViewerQuery(api.students.getProfile, {
    handle: requestedHandle,
  });
  const classmates = useViewerQuery(api.students.searchStudents, {});
  const toggleFollow = useViewerMutation(api.students.toggleFollow);
  const updateProfile = useViewerMutation(api.students.updateProfile);
  const deleteMyProfile = useViewerMutation(api.students.deleteMyProfile);
  const toggleBlock = useViewerMutation(api.moderation.toggleBlockStudent);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [major, setMajor] = useState("");
  const [classYear, setClassYear] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (profile === undefined) {
    return (
      <div className="p-4 text-xs font-semibold text-[#5E6675]">
        Loading Student profile...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-4">
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-6 text-sm font-bold text-[#111317]">
          Student profile not found in this workspace.
        </div>
      </div>
    );
  }

  const { student } = profile;

  const startEdit = () => {
    setDisplayName(student.displayName);
    setMajor(student.major ?? "");
    setClassYear(student.classYear ?? "");
    setEditing(true);
    setStatusMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        displayName,
        major: major || undefined,
        classYear: classYear || undefined,
      });
      setEditing(false);
      setStatusMsg("Profile updated.");
    } catch (err: any) {
      setStatusMsg(err?.data?.message || err?.message || "Update failed.");
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadImage(file, "avatar");
      await updateProfile({ avatarAssetId: uploaded.mediaAssetId });
      setStatusMsg("WebP avatar updated.");
    } catch (err: any) {
      setStatusMsg(err?.message || "Avatar upload failed.");
    }
  };

  const handleSelfDelete = async () => {
    try {
      await deleteMyProfile({});
      await signOut();
    } catch (err: any) {
      setStatusMsg(err?.data?.message || err?.message || "Could not delete.");
    }
  };

  return (
    <div data-testid="student-profile-view" className="space-y-4 p-4">
      {/* Primary Profile Card */}
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.displayName}
                className="h-16 w-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#111317] text-xl font-black text-[#FDBB30]">
                {student.displayName
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-[#111317]">
                  {student.displayName}
                </h1>
                {!student.isRemoved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-extrabold text-[#15803D]">
                    <ShieldCheck className="h-3 w-3" />
                    {student.emailDomainBadge === "faculty_staff"
                      ? "KSU Faculty · Staff"
                      : "Verified Student"}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-[#5E6675]">
                @{student.handle}
              </p>
              {!student.isRemoved && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#5E6675]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[11px] font-bold text-[#855A00]">
                    <MapPin className="h-3 w-3" />
                    {student.homeCampus} Campus
                  </span>
                  {student.major && (
                    <span>
                      {student.major}
                      {student.classYear ? ` · '${student.classYear.slice(-2)}` : ""}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-bold text-[#111317]">
                    <Award className="h-3.5 w-3.5 text-[#D99B00]" />
                    {student.completedDealCount} Marketplace Handoffs
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {profile.isSelf ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#E4E7EE] bg-[#F4F6FA] px-3 py-2 text-xs font-bold text-[#111317]">
                <Camera className="h-3.5 w-3.5" />
                <span>Avatar</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-bold text-[#111317] hover:bg-[#F4F6FA]"
              >
                Edit Profile
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-2 text-xs font-extrabold text-[#FDBB30]"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{auth.status === "demo" ? "Exit Demo" : "Sign Out"}</span>
              </button>
            </div>
          ) : !student.isRemoved ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="profile-follow-btn"
                onClick={() =>
                  void toggleFollow({ targetStudentId: student._id })
                }
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold ${
                  profile.isFollowedByViewer
                    ? "border border-[#111317] bg-white text-[#111317]"
                    : "bg-[#FDBB30] text-[#111317]"
                }`}
              >
                {profile.isFollowedByViewer ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Following</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Follow</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="profile-block-btn"
                onClick={() =>
                  void toggleBlock({ targetStudentId: student._id })
                }
                className="inline-flex items-center gap-1 rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-bold text-[#B91C1C] hover:bg-[#FEE2E2]"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Block</span>
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

        {/* Follower / Following / Joined Stats */}
        <div className="mt-4 flex flex-wrap gap-5 border-t border-[#E4E7EE] pt-3 text-xs">
          <span>
            <strong className="font-black text-[#111317]">
              {profile.followerCount}
            </strong>{" "}
            <span className="text-[#5E6675]">Followers</span>
          </span>
          <span>
            <strong className="font-black text-[#111317]">
              {profile.followingCount}
            </strong>{" "}
            <span className="text-[#5E6675]">Following</span>
          </span>
          {student.joinedAt > 0 && (
            <span className="text-[#5E6675]">
              Joined{" "}
              {new Date(student.joinedAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>

        {statusMsg && (
          <p className="mt-3 rounded-xl bg-[#FFF6DC] px-3 py-2 text-xs font-bold text-[#855A00]">
            {statusMsg}
          </p>
        )}

        {editing && (
          <form
            onSubmit={handleSaveEdit}
            className="mt-4 space-y-3 rounded-2xl border border-[#E4E7EE] bg-[#F9FAFC] p-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display Name"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                placeholder="Major"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <input
                type="text"
                value={classYear}
                onChange={(e) => setClassYear(e.target.value)}
                placeholder="Class Year"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-[#E4E7EE] px-3 py-1.5 text-xs font-bold text-[#5E6675]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-3.5 py-1.5 text-xs font-extrabold text-[#FDBB30]"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Joined Clubs */}
      {profile.joinedClubs.length > 0 && (
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Joined KSU Clubs
          </h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {profile.joinedClubs.map((c: any) => (
              <Link
                key={String(c._id)}
                href={`/clubs/${c.slug}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2 text-xs font-bold text-[#111317] hover:border-[#D99B00]"
              >
                <Users className="h-3.5 w-3.5 text-[#D99B00]" />
                <span>{c.name}</span>
                {c.role === "officer" && (
                  <span className="rounded-full bg-[#111317] px-2 py-0.5 text-[10px] text-[#FDBB30]">
                    Officer
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Discover & Follow Classmates */}
      {classmates && classmates.length > 1 && (
        <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#5E6675]">
            Campus Classmates
          </h2>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {classmates
              .filter((c) => c._id !== student._id)
              .slice(0, 6)
              .map((peer) => (
                <Link
                  key={String(peer._id)}
                  href={`/profile?handle=${peer.handle}`}
                  className="flex items-center justify-between rounded-xl border border-[#E4E7EE] p-2.5 text-xs hover:border-[#D99B00]"
                >
                  <div>
                    <div className="font-extrabold text-[#111317]">
                      {peer.displayName}
                    </div>
                    <div className="text-[11px] text-[#5E6675]">
                      @{peer.handle} · {peer.homeCampus}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-[#1E3A8A]">
                    View →
                  </span>
                </Link>
              ))}
          </div>
        </div>
      )}

      {/* Self-Delete Profile Controls (Verified .edu Students) */}
      {profile.isSelf && auth.status === "student" && (
        <div className="rounded-2xl border border-[#FEE2E2] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold text-[#B91C1C]">
                Delete My KSUX Profile
              </h3>
              <p className="text-[11px] text-[#5E6675]">
                Revokes sessions &amp; push, purges media, scrubs your .edu
                email, and reserves @{student.handle} for 30 days.
              </p>
            </div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-xl border border-[#B91C1C] px-3 py-2 text-xs font-bold text-[#B91C1C]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Profile</span>
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-[#E4E7EE] px-3 py-2 text-xs font-bold text-[#5E6675]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSelfDelete()}
                  className="rounded-xl bg-[#B91C1C] px-3 py-2 text-xs font-extrabold text-white"
                >
                  Confirm Permanent Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
