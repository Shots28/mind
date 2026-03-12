import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useContexts } from '../../contexts/ContextContext';
import { useCategories } from '../../contexts/CategoryContext';
import { getUserTimezone, TIMEZONE_OPTIONS } from '../../lib/dates';
import Modal from '../Common/Modal';
import GoogleCalendarSettings from './GoogleCalendarSettings';
import { useToast } from '../Common/Toast';
import ConfirmDialog from '../Common/ConfirmDialog';
import { LogOut, Plus, Trash2, Edit3, Check, X, Globe, Lock } from 'lucide-react';
import './SettingsPanel.css';

function TimezoneSettings() {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [timezone, setTimezone] = useState(getUserTimezone());
    const isOverridden = localStorage.getItem('zenith_timezone_override') !== null;

    const handleChange = (value) => {
        if (value === detectedTz) {
            localStorage.removeItem('zenith_timezone_override');
        } else {
            localStorage.setItem('zenith_timezone_override', value);
        }
        setTimezone(value);
    };

    return (
        <div className="settings-section">
            <h3 className="settings-section-title">
                <Globe size={16} /> Timezone
            </h3>
            <p className="settings-hint">Detected: {detectedTz}</p>
            <select
                className="input-field"
                value={timezone}
                onChange={(e) => handleChange(e.target.value)}
            >
                {!TIMEZONE_OPTIONS.includes(detectedTz) && (
                    <option value={detectedTz}>{detectedTz} (detected)</option>
                )}
                {TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz} value={tz}>
                        {tz.replace(/_/g, ' ')}{tz === detectedTz ? ' (detected)' : ''}
                    </option>
                ))}
            </select>
            {isOverridden && timezone !== detectedTz && (
                <button
                    className="settings-reset-btn"
                    onClick={() => { localStorage.removeItem('zenith_timezone_override'); setTimezone(detectedTz); }}
                >
                    Reset to detected
                </button>
            )}
        </div>
    );
}

function ContextManager() {
    const { contexts, createContext, updateContext, deleteContext } = useContexts();
    const { showToast } = useToast();
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#3b82f6');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [adding, setAdding] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setAdding(true);
        try {
            await createContext(newName.trim(), newColor);
            setNewName('');
            showToast('Context created');
        } catch (err) {
            console.error(err);
            showToast('Failed to create context', { type: 'error' });
        } finally {
            setAdding(false);
        }
    };

    const handleSaveEdit = async (id) => {
        if (!editName.trim()) return;
        await updateContext(id, { name: editName.trim() });
        setEditingId(null);
    };

    return (
        <div className="context-manager">
            <h3 className="settings-section-title">Contexts</h3>
            <p className="settings-hint">Separate areas of your life (e.g., Work, Personal). Filter by context to focus on what matters now.</p>
            <div className="context-list">
                {contexts.map(ctx => (
                    <div key={ctx.id} className="context-item">
                        <div className="context-color-dot" style={{ background: ctx.color }} />
                        {editingId === ctx.id ? (
                            <div className="context-edit-row">
                                <input
                                    type="text"
                                    className="input-field"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(ctx.id)}
                                    autoFocus
                                />
                                <button className="btn-icon" onClick={() => handleSaveEdit(ctx.id)}><Check size={14} /></button>
                                <button className="btn-icon" onClick={() => setEditingId(null)}><X size={14} /></button>
                            </div>
                        ) : (
                            <>
                                <span className="context-item-name">{ctx.name}</span>
                                <div className="context-item-actions">
                                    <button className="btn-icon" onClick={() => { setEditingId(ctx.id); setEditName(ctx.name); }}><Edit3 size={14} /></button>
                                    <button className="btn-icon" onClick={() => setDeleteTarget(ctx)}><Trash2 size={14} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <form className="context-add-form" onSubmit={handleCreate}>
                <div className="context-color-picker">
                    {colors.map(c => (
                        <button key={c} type="button" onClick={() => setNewColor(c)}
                            className={`color-option ${newColor === c ? 'selected' : ''}`}
                            style={{ background: c }} />
                    ))}
                </div>
                <div className="context-add-row">
                    <input
                        type="text"
                        className="input-field"
                        placeholder="New context name..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        disabled={adding}
                    />
                    <button type="submit" className="btn-primary" disabled={!newName.trim() || adding}>
                        <Plus size={16} />
                    </button>
                </div>
            </form>
            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => deleteContext(deleteTarget.id)}
                title="Delete Context"
                message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? Tasks and events using this context will become unassigned.` : ''}
            />
        </div>
    );
}

function CategoryManager() {
    const { categories, addCategory, updateCategory, removeCategory } = useCategories();
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);

    const handleAdd = (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        addCategory(newName.trim());
        setNewName('');
    };

    const handleSaveEdit = (id) => {
        if (!editName.trim()) return;
        updateCategory(id, editName.trim());
        setEditingId(null);
    };

    return (
        <div className="context-manager">
            <h3 className="settings-section-title">Task Categories</h3>
            <p className="settings-hint">Categories determine how tasks are grouped on the Today view.</p>
            <div className="context-list">
                {categories.map(cat => (
                    <div key={cat.id} className="context-item">
                        {editingId === cat.id ? (
                            <div className="context-edit-row">
                                <input
                                    type="text"
                                    className="input-field"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(cat.id)}
                                    autoFocus
                                />
                                <button className="btn-icon" onClick={() => handleSaveEdit(cat.id)}><Check size={14} /></button>
                                <button className="btn-icon" onClick={() => setEditingId(null)}><X size={14} /></button>
                            </div>
                        ) : (
                            <>
                                <span className="context-item-name">{cat.name}</span>
                                <div className="context-item-actions">
                                    <button className="btn-icon" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}><Edit3 size={14} /></button>
                                    {!cat.is_default && (
                                        <button className="btn-icon" onClick={() => setDeleteTarget(cat)}><Trash2 size={14} /></button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <form className="context-add-form" onSubmit={handleAdd}>
                <div className="context-add-row">
                    <input
                        type="text"
                        className="input-field"
                        placeholder="New category name..."
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                        <Plus size={16} />
                    </button>
                </div>
            </form>
            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => removeCategory(deleteTarget.id)}
                title="Delete Category"
                message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"? Tasks in this category will need to be reassigned.` : ''}
            />
        </div>
    );
}

function ChangePasswordSection() {
    const { updatePassword } = useAuth();
    const { showToast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await updatePassword(newPassword);
            setNewPassword('');
            setConfirmPassword('');
            setIsOpen(false);
            showToast('Password updated successfully');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div className="settings-section">
                <h3 className="settings-section-title"><Lock size={16} /> Account</h3>
                <button className="settings-change-password-btn" onClick={() => setIsOpen(true)}>
                    Change Password
                </button>
            </div>
        );
    }

    return (
        <div className="settings-section">
            <h3 className="settings-section-title"><Lock size={16} /> Change Password</h3>
            {error && <p className="settings-error">{error}</p>}
            <form onSubmit={handleSubmit} className="settings-password-form">
                <input
                    type="password"
                    className="input-field"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                />
                <input
                    type="password"
                    className="input-field"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                />
                <div className="settings-password-actions">
                    <button type="button" className="btn-icon" onClick={() => { setIsOpen(false); setError(''); }} style={{ padding: '8px 16px' }}>
                        Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Updating...' : 'Update'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function SettingsPanel({ isOpen, onClose }) {
    const { user, signOut } = useAuth();
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

    const handleSignOut = async () => {
        await signOut();
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="medium">
            <div className="settings-content">
                <div className="settings-section">
                    <h3 className="settings-section-title">Profile</h3>
                    <div className="settings-profile">
                        <img
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=6366f1&color=fff&size=64`}
                            alt={userName}
                            className="settings-avatar"
                        />
                        <div>
                            <p className="settings-name">{userName}</p>
                            <p className="settings-email">{user?.email}</p>
                        </div>
                    </div>
                </div>

                <div className="settings-divider" />

                <TimezoneSettings />

                <div className="settings-divider" />

                <GoogleCalendarSettings />

                <div className="settings-divider" />

                <ContextManager />

                <div className="settings-divider" />

                <CategoryManager />

                <div className="settings-divider" />

                <ChangePasswordSection />

                <div className="settings-divider" />

                <button className="settings-signout" onClick={handleSignOut}>
                    <LogOut size={18} />
                    <span>Sign Out</span>
                </button>
            </div>
        </Modal>
    );
}
