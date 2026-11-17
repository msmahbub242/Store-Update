import React, { useState } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Save,
  Sliders,
  X,
  Check,
  Lock,
} from 'lucide-react';
import {
  FabricRole,
  FabricUser,
  FabricPermissionKey,
  FabricPermissionMap,
  FabricRolePermissionConfig,
  DEFAULT_ROLE_PERMISSIONS,
} from '../../firebase';

export const PERMISSION_DEFINITIONS: Array<{
  key: FabricPermissionKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    key: 'viewRacks',
    label: 'View Rack Stock & Ledgers',
    shortLabel: 'View Stock',
    description: 'Browse rack stock cards, PO balance ledger & registers',
  },
  {
    key: 'bookFabric',
    label: 'Fabric Booking (Required Qty)',
    shortLabel: 'Book Qty',
    description: 'Enter & edit pre-receiving PO fabric requirements',
  },
  {
    key: 'receiveFabric',
    label: 'Challan Receiving',
    shortLabel: 'Receive',
    description: 'Record challan-wise multi-PO fabric receiving entries',
  },
  {
    key: 'deliverFabric',
    label: 'Multi-PO Fabric Delivery',
    shortLabel: 'Deliver',
    description: 'Issue partial or full fabric supplies across POs & racks',
  },
  {
    key: 'manageRacks',
    label: 'Manage & Share Racks',
    shortLabel: 'Manage Racks',
    description: 'Create/edit racks and split or transfer fabric between racks',
  },
  {
    key: 'deleteRecords',
    label: 'Delete Entries',
    shortLabel: 'Delete',
    description: 'Remove bookings, receivings, or reverse delivery slips',
  },
  {
    key: 'exportData',
    label: 'Export CSV Reports',
    shortLabel: 'Export CSV',
    description: 'Download rack, booking, receiving, delivery & balance CSVs',
  },
  {
    key: 'viewAudit',
    label: 'View Audit Trail',
    shortLabel: 'Audit Log',
    description: 'Inspect user sign-ins and inventory action history',
  },
  {
    key: 'manageUsers',
    label: 'Admin: Users & Permissions',
    shortLabel: 'Admin Control',
    description: 'Create staff accounts, assign roles & edit permission matrix',
  },
];

export const ALL_FABRIC_ROLES: FabricRole[] = [
  'master_admin',
  'store_manager',
  'receiver',
  'issuer',
  'viewer',
];

export const ROLE_BADGE_CLASSES: Record<FabricRole, string> = {
  master_admin: 'bg-slate-900 text-white border-slate-900',
  store_manager: 'bg-indigo-100 text-indigo-900 border-indigo-400',
  receiver: 'bg-emerald-100 text-emerald-900 border-emerald-400',
  issuer: 'bg-amber-100 text-amber-900 border-amber-400',
  viewer: 'bg-slate-100 text-slate-800 border-slate-400',
};

export function resolveEffectivePermissions(
  user: FabricUser | null,
  roleConfigs: Record<FabricRole, FabricRolePermissionConfig>
): FabricPermissionMap {
  if (!user) {
    return { ...DEFAULT_ROLE_PERMISSIONS.viewer.permissions };
  }
  const baseRolePerms =
    roleConfigs[user.role]?.permissions ||
    DEFAULT_ROLE_PERMISSIONS[user.role]?.permissions ||
    DEFAULT_ROLE_PERMISSIONS.viewer.permissions;

  const merged: FabricPermissionMap = {
    ...baseRolePerms,
    ...(user.customPermissions || {}),
  };

  // Master Admin always retains user & permission management so the store cannot lock out
  if (user.role === 'master_admin') {
    merged.manageUsers = true;
    merged.viewRacks = true;
  }

  return merged;
}

interface RolePermissionsPanelProps {
  roleConfigs: Record<FabricRole, FabricRolePermissionConfig>;
  onSaveRolePermissions: (
    role: FabricRole,
    permissions: FabricPermissionMap
  ) => Promise<void>;
  onResetRoleDefaults: (role: FabricRole) => Promise<void>;
}

export const RolePermissionsMatrixCard: React.FC<RolePermissionsPanelProps> = ({
  roleConfigs,
  onSaveRolePermissions,
  onResetRoleDefaults,
}) => {
  const [drafts, setDrafts] = useState<Partial<Record<FabricRole, FabricPermissionMap>>>({});
  const [savingRole, setSavingRole] = useState<FabricRole | null>(null);

  const getPermsForRole = (role: FabricRole): FabricPermissionMap =>
    drafts[role] || roleConfigs[role]?.permissions || DEFAULT_ROLE_PERMISSIONS[role].permissions;

  const isRoleDirty = (role: FabricRole): boolean => {
    if (!drafts[role]) return false;
    const saved = roleConfigs[role]?.permissions || DEFAULT_ROLE_PERMISSIONS[role].permissions;
    return PERMISSION_DEFINITIONS.some((p) => Boolean(drafts[role]?.[p.key]) !== Boolean(saved[p.key]));
  };

  const togglePerm = (role: FabricRole, key: FabricPermissionKey) => {
    if (role === 'master_admin' && (key === 'manageUsers' || key === 'viewRacks')) {
      return;
    }
    const current = getPermsForRole(role);
    setDrafts((prev) => ({
      ...prev,
      [role]: {
        ...current,
        [key]: !current[key],
      },
    }));
  };

  const handleSave = async (role: FabricRole) => {
    const nextPerms = getPermsForRole(role);
    setSavingRole(role);
    try {
      await onSaveRolePermissions(role, nextPerms);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[role];
        return copy;
      });
    } finally {
      setSavingRole(null);
    }
  };

  const handleReset = async (role: FabricRole) => {
    setSavingRole(role);
    try {
      await onResetRoleDefaults(role);
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[role];
        return copy;
      });
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-300 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={19} className="text-blue-700" />
            <span>Admin Role Permission Matrix</span>
          </h3>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Grant or restrict module access per role in real time. Changes apply immediately to all signed-in users.
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-xl px-3.5 py-2">
          Click any permission cell, then click <strong className="text-slate-900">Save Role</strong>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[13px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 uppercase text-xs font-extrabold">
              <th className="p-3.5 border-b border-r border-slate-300 min-w-[230px]">
                Role & Description
              </th>
              {PERMISSION_DEFINITIONS.map((perm) => (
                <th
                  key={perm.key}
                  className="p-3 border-b border-r border-slate-300 text-center min-w-[104px]"
                  title={perm.description}
                >
                  <div className="leading-tight font-extrabold text-slate-800">{perm.shortLabel}</div>
                </th>
              ))}
              <th className="p-3.5 border-b border-slate-300 text-center min-w-[155px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {ALL_FABRIC_ROLES.map((role) => {
              const cfg = roleConfigs[role] || {
                id: role,
                role,
                ...DEFAULT_ROLE_PERMISSIONS[role],
                updatedAt: '',
                updatedBy: '',
              };
              const perms = getPermsForRole(role);
              const dirty = isRoleDirty(role);
              const isSaving = savingRole === role;

              return (
                <tr key={role} className={dirty ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                  <td className="p-3.5 border-r border-slate-200 align-top">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-extrabold px-2.5 py-0.5 rounded-md border ${ROLE_BADGE_CLASSES[role]}`}
                      >
                        {cfg.label}
                      </span>
                      {dirty && (
                        <span className="text-[11px] font-extrabold text-blue-700">Unsaved</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5 leading-snug">{cfg.description}</p>
                  </td>

                  {PERMISSION_DEFINITIONS.map((perm) => {
                    const checked = Boolean(perms[perm.key]);
                    const isLocked =
                      role === 'master_admin' &&
                      (perm.key === 'manageUsers' || perm.key === 'viewRacks');

                    return (
                      <td
                        key={perm.key}
                        className="p-2.5 border-r border-slate-200 text-center align-middle"
                      >
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => togglePerm(role, perm.key)}
                          title={`${cfg.label}: ${perm.label}`}
                          className={`mx-auto h-8 w-8 rounded-lg border flex items-center justify-center transition ${
                            isLocked
                              ? 'bg-slate-900 border-slate-900 text-white cursor-not-allowed opacity-85'
                              : checked
                              ? 'bg-emerald-600 hover:bg-emerald-700 border-emerald-700 text-white cursor-pointer shadow-2xs'
                              : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-300 cursor-pointer'
                          }`}
                        >
                          {isLocked ? (
                            <Lock size={14} />
                          ) : checked ? (
                            <Check size={16} strokeWidth={3} />
                          ) : (
                            <span className="h-2 w-2 rounded-xs bg-slate-200" />
                          )}
                        </button>
                      </td>
                    );
                  })}

                  <td className="p-3 text-center align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        disabled={!dirty || isSaving}
                        onClick={() => handleSave(role)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition ${
                          dirty
                            ? 'bg-blue-700 hover:bg-blue-800 border-blue-800 text-white cursor-pointer shadow-xs'
                            : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Save size={13} />
                        <span>{isSaving ? 'Saving...' : 'Save Role'}</span>
                      </button>

                      {role !== 'master_admin' && (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleReset(role)}
                          title="Reset role to default permissions"
                          className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface UserCustomPermModalProps {
  user: FabricUser;
  roleConfigs: Record<FabricRole, FabricRolePermissionConfig>;
  onClose: () => void;
  onSaveUserPermissions: (
    user: FabricUser,
    customPermissions: Partial<FabricPermissionMap>
  ) => Promise<void>;
}

export const UserCustomPermissionModal: React.FC<UserCustomPermModalProps> = ({
  user,
  roleConfigs,
  onClose,
  onSaveUserPermissions,
}) => {
  const roleDefaults =
    roleConfigs[user.role]?.permissions || DEFAULT_ROLE_PERMISSIONS[user.role].permissions;
  const [customDraft, setCustomDraft] = useState<Partial<FabricPermissionMap>>({
    ...(user.customPermissions || {}),
  });
  const [isSaving, setIsSaving] = useState(false);

  const effectiveForKey = (key: FabricPermissionKey): boolean => {
    if (customDraft[key] !== undefined) return Boolean(customDraft[key]);
    return Boolean(roleDefaults[key]);
  };

  const setKeyMode = (key: FabricPermissionKey, mode: 'inherit' | 'allow' | 'deny') => {
    if (user.role === 'master_admin' && (key === 'manageUsers' || key === 'viewRacks')) return;
    setCustomDraft((prev) => {
      const next = { ...prev };
      if (mode === 'inherit') {
        delete next[key];
      } else {
        next[key] = mode === 'allow';
      }
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveUserPermissions(user, customDraft);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const overrideCount = Object.keys(customDraft).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSave}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-300 shadow-2xl overflow-hidden"
      >
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              <Sliders size={17} />
              <span>User Permission Overrides — @{user.username}</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Base Role: <strong className="text-white">{roleConfigs[user.role]?.label || user.role}</strong> ·{' '}
              {overrideCount} custom override(s) active
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-slate-200">
          {PERMISSION_DEFINITIONS.map((perm) => {
            const inherited = Boolean(roleDefaults[perm.key]);
            const hasOverride = customDraft[perm.key] !== undefined;
            const currentMode: 'inherit' | 'allow' | 'deny' = !hasOverride
              ? 'inherit'
              : customDraft[perm.key]
              ? 'allow'
              : 'deny';
            const finalAllow = effectiveForKey(perm.key);
            const isLocked =
              user.role === 'master_admin' &&
              (perm.key === 'manageUsers' || perm.key === 'viewRacks');

            return (
              <div
                key={perm.key}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-slate-900">{perm.label}</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                        finalAllow
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {finalAllow ? 'Allowed' : 'Restricted'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {perm.description} · Role default:{' '}
                    <strong className={inherited ? 'text-emerald-700' : 'text-slate-600'}>
                      {inherited ? 'Allow' : 'Deny'}
                    </strong>
                  </p>
                </div>

                {isLocked ? (
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1 shrink-0">
                    <Lock size={12} /> Locked
                  </span>
                ) : (
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300 shrink-0 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setKeyMode(perm.key, 'inherit')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                        currentMode === 'inherit'
                          ? 'bg-white text-slate-900 shadow-2xs border border-slate-300'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Role Default
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeyMode(perm.key, 'allow')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                        currentMode === 'allow'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-emerald-700'
                      }`}
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      onClick={() => setKeyMode(perm.key, 'deny')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer transition ${
                        currentMode === 'deny'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-rose-700'
                      }`}
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-300 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setCustomDraft({})}
            className="text-xs font-bold text-slate-700 hover:underline cursor-pointer"
          >
            Clear All Custom Overrides
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save User Permissions'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
