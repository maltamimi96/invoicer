"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, Crown, ShieldCheck, Pencil, Eye, Link2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { addMember, updateMemberRole, removeMember } from "@/lib/actions/members";
import { isOwner, canManageTeam, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { BusinessMember, MemberRole } from "@/types/database";

const ROLE_ICONS: Record<Role, React.ElementType> = {
  owner:  Crown,
  admin:  ShieldCheck,
  editor: Pencil,
  viewer: Eye,
};

const ROLE_COLORS: Record<Role, string> = {
  owner:  "bg-amber-100 text-amber-800 border-amber-200",
  admin:  "bg-purple-100 text-purple-800 border-purple-200",
  editor: "bg-blue-100 text-blue-800 border-blue-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
};

interface TeamSettingsProps {
  members: BusinessMember[];
  ownerEmail: string;
  userRole: Role;
}

export function TeamSettings({ members: initialMembers, ownerEmail, userRole }: TeamSettingsProps) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [isPending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    startTransition(async () => {
      try {
        await addMember(email.trim(), role);
        toast.success(`${email} added — they'll get access when they log in`);
        setEmail("");
        // Optimistically add to list
        setMembers((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            business_id: "",
            user_id: null,
            email: email.trim().toLowerCase(),
            role,
            status: "pending",
            added_by: null,
            created_at: new Date().toISOString(),
          },
        ]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add member");
      }
    });
  };

  const handleRoleChange = (memberId: string, newRole: MemberRole) => {
    setUpdatingId(memberId);
    startTransition(async () => {
      try {
        await updateMemberRole(memberId, newRole);
        setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
        toast.success("Role updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update role");
      } finally {
        setUpdatingId(null);
      }
    });
  };

  const handleRemove = (memberId: string, memberEmail: string) => {
    setRemovingId(memberId);
    startTransition(async () => {
      try {
        await removeMember(memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
        toast.success(`${memberEmail} removed`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove member");
      } finally {
        setRemovingId(null);
      }
    });
  };

  // Selectable roles depend on caller's role
  const selectableRoles: MemberRole[] = isOwner(userRole)
    ? ["admin", "editor", "viewer"]
    : ["editor", "viewer"];

  return (
    <div className="space-y-6">
      {/* Add member */}
      {canManageTeam(userRole) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a team member</CardTitle>
            <CardDescription>
              Enter their email and assign a role. They&apos;ll get access the next time they log in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="member-email" className="sr-only">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="worker@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  disabled={isPending}
                />
              </div>
              <Select value={role} onValueChange={(v) => setRole(v as MemberRole)} disabled={isPending}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} disabled={isPending || !email.trim()} className="gap-2">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Owner row (always first, not in business_members table) */}
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{ownerEmail}</p>
              <p className="text-xs text-muted-foreground">Business owner</p>
            </div>
            <RoleBadge role="owner" />
          </div>

          {members.length > 0 && <Separator />}

          {members.map((member, idx) => {
            const RoleIcon = ROLE_ICONS[member.role as Role] ?? Eye;
            const isUpdating = updatingId === member.id;
            const isRemoving = removingId === member.id;

            return (
              <div key={member.id}>
                {idx > 0 && <Separator />}
                <div className="flex items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.email}</p>
                    {member.status === "pending" && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">Pending — not yet registered</p>
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                          onClick={() => {
                            const params = new URLSearchParams({ email: member.email });
                            if (member.business_id) params.set("biz", member.business_id);
                            const link = `${window.location.origin}/auth/register?${params.toString()}`;
                            navigator.clipboard.writeText(link);
                            toast.success("Invite link copied — share it with your worker");
                          }}
                        >
                          <Link2 className="w-3 h-3" />
                          Copy invite link
                        </button>
                      </div>
                    )}
                  </div>

                  {canManageTeam(userRole) && (isOwner(userRole) || member.role !== "admin") ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => handleRoleChange(member.id, v as MemberRole)}
                      disabled={isUpdating || isRemoving}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                          <div className="flex items-center gap-1.5">
                            <RoleIcon className="w-3 h-3" />
                            <SelectValue />
                          </div>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {selectableRoles.map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <RoleBadge role={member.role as Role} />
                  )}

                  {canManageTeam(userRole) && (isOwner(userRole) || member.role !== "admin") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={isRemoving || isPending}
                      onClick={() => handleRemove(member.id, member.email)}
                    >
                      {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              No team members yet. Add someone above to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm">
            {(["owner", "admin", "editor", "viewer"] as Role[]).map((r) => (
              <div key={r} className="flex items-start gap-3">
                <RoleBadge role={r} />
                <p className="text-muted-foreground text-xs mt-0.5">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const Icon = ROLE_ICONS[role];
  return (
    <Badge variant="outline" className={`gap-1 text-xs font-medium ${ROLE_COLORS[role]}`}>
      <Icon className="w-3 h-3" />
      {ROLE_LABELS[role]}
    </Badge>
  );
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner:  "Full control — manage settings, team, billing, and all data.",
  admin:  "Full data access (invoices, quotes, customers, products, reports) and can manage the team. Cannot delete the business.",
  editor: "Can create, edit, and delete invoices, quotes, customers, products, and reports. Cannot access settings.",
  viewer: "Read-only. Can view everything but cannot create or change anything.",
};
