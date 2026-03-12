// frontend/src/components/admin/ForceChangePasswordModal.jsx
import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';

/**
 * Mandatory first-login password reset modal.
 * Renders as a full-screen overlay — cannot be dismissed.
 * On success it refreshes the auth context user so needs_password_reset becomes false
 * and the dashboard renders normally.
 */
export default function ForceChangePasswordModal() {
  const { refreshUser } = useAuth(); // you must expose this from AuthContext (see notes below)

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [fieldErrors, setFieldErrors]         = useState({});

  const validate = () => {
    const errs = {};
    if (!currentPassword) errs.currentPassword = 'Current (temporary) password is required.';
    if (!newPassword)     errs.newPassword      = 'New password is required.';
    else if (newPassword.length < 8) errs.newPassword = 'Must be at least 8 characters.';
    if (!confirmPassword) errs.confirmPassword  = 'Please confirm your new password.';
    else if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      // Refresh auth context so needs_password_reset becomes false
      await refreshUser();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        'Failed to update password. Please check your current password and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Full-screen, non-dismissable overlay */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      aria-modal="true"
      role="dialog"
      aria-labelledby="fcp-title"
    >
      <div className="neu-card w-full max-w-md mx-4 p-8 space-y-6">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="neu-card-sm w-14 h-14 flex items-center justify-center bg-amber-50 text-amber-600">
            <KeyRound size={26} />
          </div>
          <h2
            id="fcp-title"
            className="font-display text-2xl font-bold text-primary dark:text-darkText"
          >
            Change Your Password
          </h2>
          <p className="text-sm text-muted dark:text-darkMuted leading-relaxed max-w-sm">
            Your account was provisioned with a temporary password.{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              You must set a new password before continuing.
            </span>
          </p>
        </div>

        {/* Global error */}
        {error && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Current (temp) password */}
          <PasswordField
            id="current"
            label="Temporary Password"
            value={currentPassword}
            onChange={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
            error={fieldErrors.currentPassword}
            autoComplete="current-password"
          />

          {/* New password */}
          <PasswordField
            id="new"
            label="New Password"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
            error={fieldErrors.newPassword}
            autoComplete="new-password"
            hint="Minimum 8 characters."
          />

          {/* Confirm new password */}
          <PasswordField
            id="confirm"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
            error={fieldErrors.confirmPassword}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="neu-btn w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 mt-2 hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ShieldCheck size={18} />
            )}
            {loading ? 'Updating…' : 'Set New Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Reusable password field sub-component ───────────────────────────── */
function PasswordField({ id, label, value, onChange, show, onToggleShow, error, autoComplete, hint }) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={`fcp-${id}`}
        className="block text-xs font-semibold text-muted dark:text-darkMuted uppercase tracking-wide"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={`fcp-${id}`}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`
            neu-input w-full pr-10 py-2.5 text-sm
            ${error ? 'border-red-400 dark:border-red-600' : ''}
          `}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted dark:text-darkMuted hover:text-primary transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && !error && (
        <p className="text-[10px] text-muted dark:text-darkMuted">{hint}</p>
      )}
      {error && (
        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">{error}</p>
      )}
    </div>
  );
}
