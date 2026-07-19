import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  AdminHeader,
  AdminPanel,
  AdminTable,
  EmptyAdminState,
  PrivacyNotice,
  StatusBadge,
  formatDate,
  formatNumber,
} from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminUsers } from "@/lib/admin/data";
import { recordAdminAudit } from "@/lib/telemetry/server";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; role?: string }>;
}) {
  const admin = await requireAdmin();
  const filters = await searchParams;
  const users = await getAdminUsers({
    query: filters.q,
    plan: filters.plan,
    role: filters.role,
  });
  await recordAdminAudit({
    adminUserId: admin.id,
    action: "admin_page_viewed",
    targetType: "page",
    targetId: "users",
    metadata: { filtered: Boolean(filters.q || filters.plan || filters.role) },
  });
  return (
    <>
      <AdminHeader
        eyebrow="Customer operations"
        title="Users"
        description="Account state, plan, role, activity, usage, reliability, and subscription metadata."
      />
      <PrivacyNotice />
      <form className={styles.filters}>
        <input
          className="input"
          name="q"
          defaultValue={filters.q}
          placeholder="Search email or name"
          aria-label="Search users"
        />
        <select
          className="select"
          name="plan"
          defaultValue={filters.plan || ""}
        >
          <option value="">All plans</option>
          <option>free</option>
          <option>starter</option>
          <option>pro</option>
          <option>max</option>
        </select>
        <select
          className="select"
          name="role"
          defaultValue={filters.role || ""}
        >
          <option value="">All roles</option>
          <option>user</option>
          <option>admin</option>
        </select>
        <button className="button">
          <Search size={16} /> Filter
        </button>
      </form>
      <AdminPanel
        title={`${users.length} users`}
        description="Up to 200 matching accounts"
      >
        {users.length ? (
          <AdminTable>
            <thead>
              <tr>
                <th>User</th>
                <th>Plan</th>
                <th>Role</th>
                <th>Last active</th>
                <th>Usage</th>
                <th>Checks</th>
                <th>Errors</th>
                <th>Subscription</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/admin/users/${user.id}`}>
                      {user.email || user.phone || "Verified user"}
                    </Link>
                    <br />
                    <small>
                      {user.full_name || user.auth_provider || "No display name"}
                    </small>
                  </td>
                  <td>
                    <StatusBadge value={user.plan} />
                  </td>
                  <td>
                    <StatusBadge value={user.role} />
                  </td>
                  <td>{formatDate(user.last_active_at)}</td>
                  <td>{formatNumber(user.usage_count)}</td>
                  <td>{formatNumber(user.fact_check_count)}</td>
                  <td>{formatNumber(user.error_count)}</td>
                  <td>
                    <StatusBadge value={user.subscription_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        ) : (
          <EmptyAdminState
            title="No users match these filters"
            description="Clear one or more filters and try again."
          />
        )}
      </AdminPanel>
    </>
  );
}
