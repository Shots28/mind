import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useContexts } from '../../contexts/ContextContext';
import Modal from '../Common/Modal';
import { LogOut, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import './SettingsPanel.css';

function ContextManager() {
    const { contexts, createContext, updateContext, deleteContext } = useContexts();
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#6366f1');
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [adding, setAdding] = useState(false);

    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setAdding(true);
        try {
            await createContext(newName.trim(), newColor);
            setNewName('');
        } catch (err) {
            console.error(err);
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
                                    <button className="btn-icon" onClick={() => deleteContext(ctx.id)}><Trash2 size={14} /></button>
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

                <ContextManager />

                <div className="settings-divider" />

                <button className="settings-signout" onClick={handleSignOut}>
                    <LogOut size={18} />
                    <span>Sign Out</span>
                </button>
            </div>
        </Modal>
    );
}
