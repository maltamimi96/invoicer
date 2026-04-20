"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users2, Plus, Pencil, Trash2, Loader2, X, Check, Phone, Mail, Briefcase, ChevronDown, ChevronUp } from "@/components/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { createMemberProfile, updateMemberProfile, deleteMemberProfile } from "@/lib/actions/member-profiles";
import { canManageTeam, isOwner, type Role } from "@/lib/permissions";
import type { MemberProfile, BusinessMember } from "@/types/database";

interface TeamPageClientProps {
  profiles: MemberProfile[];
  members: BusinessMember[];
  userRole: Role;
  currentUserId: string;
  currentUserEmail: string;
}

// ── Avatar initials ───────────────────────────────────────────────────────────

function Avatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-xs", md: "w-12 h-12 text-sm", lg: "w-16 h-16 text-xl" };
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  if (avatarUrl) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt={name} className={`${sizes[size]} rounded-full object-cover flex-shrink-0`} />
  );
  return (
    <div className={`${sizes[size]} rounded-full bg-gradient-to-br from-purple-500 to-violet-600 text-white flex items-center justify-center font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

// ── Profile form ──────────────────────────────────────────────────────────────

interface ProfileFormValues {
  email: string;
  name: string;
  phone: string;
  role_title: string;
  skills: string;
  bio: string;
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  initial: ProfileFormValues;
  onSave: (values: ProfileFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  isNew: boolean;
}) {
  const [values, setValues] = useState(initial);
  const set = (k: keyof ProfileFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <div className="space-y-4 p-4 rounded-xl border bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Full name *</Label>
          <Input value={values.name} onChange={set("name")} placeholder="Jane Smith" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Email *</Label>
          <Input type="email" value={values.email} onChange={set("email")} placeholder="jane@company.com" disabled={!isNew} />
          {!isNew && <p className="text-xs text-muted-foreground">Email cannot be changed</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={values.phone} onChange={set("phone")} placeholder="+61 400 000 000" />
        </div>
        <div className="space-y-1.5">
          <Label>Job title</Label>
          <Input value={values.role_title} onChange={set("role_title")} placeholder="Senior Roofer" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Skills <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
          <Input value={values.skills} onChange={set("skills")} placeholder="Colorbond, Tiling, Gutters, Flashings" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Bio / Notes</Label>
          <Textarea value={values.bio} onChange={set("bio")} rows={2} placeholder="Any useful notes about this team member..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="w-3.5 h-3.5 mr-1.5" />Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(values)}
          disabled={saving || !values.name.trim() || !values.email.trim()}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
          {isNew ? "Create profile" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Profile card ──────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  canManage,
  canDelete,
  onDeleted,
}: {
  profile: MemberProfile;
  canManage: boolean;
  canDelete: boolean;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(profile);
  const [isPending, startTransition] = useTransition();

  const handleSave = (values: ProfileFormValues) => {
    startTransition(async () => {
      try {
        await updateMemberProfile(current.id, {
          name: values.name,
          phone: values.phone || null,
          role_title: values.role_title || null,
          skills: values.skills ? values.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
          bio: values.bio || null,
        });
        setCurrent((prev) => ({
          ...prev,
          name: values.name,
          phone: values.phone || null,
          role_title: values.role_title || null,
          skills: values.skills ? values.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
          bio: values.bio || null,
        }));
        setEditing(false);
        toast.success("Profile updated");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  return (
    <Card className={!current.is_active ? "opacity-60" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={current.name} avatarUrl={current.avatar_url} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{current.name}</p>
              {!current.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
            </div>
            {current.role_title && <p className="text-xs text-muted-foreground mt-0.5">{current.role_title}</p>}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {current.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />{current.email}
                </span>
              )}
              {current.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />{current.phone}
                </span>
              )}
            </div>
            {current.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {current.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs px-1.5 py-0">{s}</Badge>
                ))}
              </div>
            )}
            {current.bio && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{current.bio}</p>}
          </div>
          {canManage && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing((v) => !v)}>
                {editing ? <ChevronUp className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              </Button>
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {current.name}&apos;s profile?</AlertDialogTitle>
                      <AlertDialogDescription>This is permanent and cannot be undone. Their work order history will be preserved.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={async () => {
                          try {
                            await deleteMemberProfile(current.id);
                            onDeleted(current.id);
                            toast.success("Profile deleted");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to delete");
                          }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </div>

        <AnimatePresence>
          {editing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <ProfileForm
                  initial={{
                    email: current.email,
                    name: current.name,
                    phone: current.phone ?? "",
                    role_title: current.role_title ?? "",
                    skills: current.skills.join(", "),
                    bio: current.bio ?? "",
                  }}
                  onSave={handleSave}
                  onCancel={() => setEditing(false)}
                  saving={isPending}
                  isNew={false}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeamPageClient({ profiles: initialProfiles, members, userRole, currentUserEmail }: TeamPageClientProps) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const canManage = canManageTeam(userRole);
  const canDelete = isOwner(userRole);

  // Members without profiles (pending invite or no profile set up yet)
  const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
  const unprofiled = members.filter((m) => !profileEmails.has(m.email.toLowerCase()) && m.status === "active");

  const handleCreate = async (values: ProfileFormValues) => {
    setAddSaving(true);
    try {
      const profile = await createMemberProfile({
        email: values.email,
        name: values.name,
        phone: values.phone || undefined,
        role_title: values.role_title || undefined,
        skills: values.skills ? values.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        bio: values.bio || undefined,
      });
      setProfiles((prev) => [...prev, profile]);
      setShowAddForm(false);
      toast.success("Profile created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users2 className="w-6 h-6" /> Team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage team member profiles and skills</p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? "Cancel" : "Add member"}
          </Button>
        )}
      </motion.div>

      {/* Add form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ProfileForm
              initial={{ email: "", name: "", phone: "", role_title: "", skills: "", bio: "" }}
              onSave={handleCreate}
              onCancel={() => setShowAddForm(false)}
              saving={addSaving}
              isNew
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unprofiled members callout */}
      {unprofiled.length > 0 && canManage && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-600" />
              {unprofiled.length} active member{unprofiled.length > 1 ? "s" : ""} without a profile
            </p>
            <div className="flex flex-wrap gap-2">
              {unprofiled.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setShowAddForm(true);
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 transition-colors"
                >
                  {m.email}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Click &quot;Add member&quot; to create their profile and enter their name, phone, and skills.</p>
          </CardContent>
        </Card>
      )}

      {/* Profile grid */}
      {profiles.length === 0 && !showAddForm ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No team profiles yet</p>
          {canManage && <p className="text-sm mt-1">Add a member to get started</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              canManage={canManage || profile.email === currentUserEmail}
              canDelete={canDelete}
              onDeleted={(id) => setProfiles((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
